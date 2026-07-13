use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

const DEFAULT_COLUMNS: u16 = 120;
const DEFAULT_ROWS: u16 = 32;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionSnapshot {
    pub id: String,
    pub workdir: String,
    pub shell: String,
    pub columns: u16,
    pub rows: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputEvent {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputChunk {
    pub cursor: usize,
    pub data: String,
}

pub struct TerminalSession {
    id: String,
    workdir: PathBuf,
    shell: String,
    columns: Arc<Mutex<u16>>,
    rows: Arc<Mutex<u16>>,
    output: Arc<Mutex<String>>,
    chunks: Arc<Mutex<Vec<TerminalOutputChunk>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    child: Arc<Mutex<Box<dyn Child + Send>>>,
}

impl TerminalSession {
    pub fn spawn(workdir: PathBuf, app: Option<AppHandle>) -> std::io::Result<Self> {
        let tmux_session = tmux_session_name(&workdir);
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: DEFAULT_ROWS,
                cols: DEFAULT_COLUMNS,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(to_io_error)?;

        // tmux owns the durable shell process. The app only owns this client
        // attachment, so an app update or panel remount can reconnect to the
        // same workspace state instead of starting an unrelated shell.
        let mut command = CommandBuilder::new("tmux");
        command.cwd(&workdir);
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        command.env("LANG", "en_US.UTF-8");
        command.args(["new-session", "-A", "-s", tmux_session.as_str(), "-c"]);
        command.arg(workdir.as_os_str());

        let child = pair.slave.spawn_command(command).map_err(|error| {
            std::io::Error::other(format!(
                "unable to attach terminal to tmux session `{tmux_session}`: {error}. Install tmux to use the persistent terminal"
            ))
        })?;
        let master = pair.master;
        let mut reader = master.try_clone_reader().map_err(to_io_error)?;
        let writer = master.take_writer().map_err(to_io_error)?;

        let session = Self {
            id: Uuid::new_v4().to_string(),
            workdir,
            shell: format!("tmux:{tmux_session}"),
            columns: Arc::new(Mutex::new(DEFAULT_COLUMNS)),
            rows: Arc::new(Mutex::new(DEFAULT_ROWS)),
            output: Arc::new(Mutex::new(String::new())),
            chunks: Arc::new(Mutex::new(Vec::new())),
            writer: Arc::new(Mutex::new(writer)),
            master: Arc::new(Mutex::new(master)),
            child: Arc::new(Mutex::new(child)),
        };

        let output_buffer = Arc::clone(&session.output);
        let chunks = Arc::clone(&session.chunks);
        let session_id = session.id.clone();
        let app_handle = app.clone();
        thread::spawn(move || {
            let mut chunk = [0_u8; 8192];
            loop {
                match reader.read(&mut chunk) {
                    Ok(0) => break,
                    Ok(bytes_read) => {
                        let data = String::from_utf8_lossy(&chunk[..bytes_read]).to_string();
                        if data.is_empty() {
                            continue;
                        }

                        output_buffer
                            .lock()
                            .expect("terminal output lock")
                            .push_str(&data);
                        let mut chunks_guard = chunks.lock().expect("terminal chunks lock");
                        let cursor = chunks_guard.len() + 1;
                        chunks_guard.push(TerminalOutputChunk {
                            cursor,
                            data: data.clone(),
                        });

                        if let Some(app_handle) = &app_handle {
                            let _ = app_handle.emit(
                                "terminal-output",
                                TerminalOutputEvent {
                                    session_id: session_id.clone(),
                                    data,
                                },
                            );
                        }
                    }
                    Err(_) => break,
                }
            }

            if let Some(app_handle) = &app_handle {
                let _ = app_handle.emit(
                    "terminal-exit",
                    TerminalOutputEvent {
                        session_id,
                        data: String::new(),
                    },
                );
            }
        });

        Ok(session)
    }

    pub fn snapshot(&self) -> TerminalSessionSnapshot {
        TerminalSessionSnapshot {
            id: self.id.clone(),
            workdir: self.workdir.display().to_string(),
            shell: self.shell.clone(),
            columns: *self.columns.lock().expect("terminal columns lock"),
            rows: *self.rows.lock().expect("terminal rows lock"),
        }
    }

    pub fn send_input(&self, input: &str) -> std::io::Result<()> {
        let mut writer = self.writer.lock().expect("terminal writer lock");
        writer.write_all(input.as_bytes())?;
        writer.flush()
    }

    pub fn resize(&self, columns: u16, rows: u16) -> std::io::Result<()> {
        {
            let mut current_columns = self.columns.lock().expect("terminal columns lock");
            *current_columns = columns;
        }
        {
            let mut current_rows = self.rows.lock().expect("terminal rows lock");
            *current_rows = rows;
        }

        self.master
            .lock()
            .expect("terminal master lock")
            .resize(PtySize {
                rows,
                cols: columns,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(to_io_error)
    }

    pub fn close(&self) -> std::io::Result<()> {
        let mut child = self.child.lock().expect("terminal child lock");
        child.kill()?;
        let _ = child.wait();
        Ok(())
    }

    pub fn output(&self) -> String {
        self.output.lock().expect("terminal output lock").clone()
    }

    pub fn output_since(&self, cursor: usize) -> (Vec<TerminalOutputChunk>, usize) {
        let chunks = self.chunks.lock().expect("terminal chunks lock");
        let filtered = chunks
            .iter()
            .filter(|chunk| chunk.cursor > cursor)
            .cloned()
            .collect::<Vec<_>>();
        (filtered, chunks.len())
    }

    pub fn wait_for_output(&self, needle: &str, timeout: Duration) -> Option<String> {
        let start = Instant::now();
        while start.elapsed() < timeout {
            let output = self.output();
            if output.contains(needle) {
                return Some(output);
            }

            thread::sleep(Duration::from_millis(50));
        }

        None
    }
}

fn tmux_session_name(workdir: &Path) -> String {
    let canonical_workdir = std::fs::canonicalize(workdir).unwrap_or_else(|_| workdir.into());
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for byte in canonical_workdir.to_string_lossy().as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("research-canvas-{hash:016x}")
}

fn to_io_error(error: impl std::fmt::Display) -> std::io::Error {
    std::io::Error::other(error.to_string())
}

#[cfg(test)]
mod tests {
    use std::{path::Path, process::Command, thread, time::Duration};

    use tempfile::tempdir;
    use uuid::Uuid;

    use super::tmux_session_name;
    use crate::pty::TerminalManager;

    struct TmuxSessionGuard(String);

    impl Drop for TmuxSessionGuard {
        fn drop(&mut self) {
            let _ = Command::new("tmux")
                .args(["kill-session", "-t", &self.0])
                .status();
        }
    }

    fn wait_for_file(path: &Path) -> Option<String> {
        for _ in 0..200 {
            if let Ok(contents) = std::fs::read_to_string(path) {
                return Some(contents);
            }
            thread::sleep(Duration::from_millis(25));
        }
        None
    }

    #[test]
    fn reopening_a_workspace_terminal_rejoins_its_existing_tmux_session() {
        let workdir = tempdir().expect("workspace directory");
        let tmux_session = tmux_session_name(workdir.path());
        let _cleanup = TmuxSessionGuard(tmux_session);
        let marker = format!("research-canvas-{}", Uuid::new_v4());
        let first_signal = workdir.path().join("first-client-ready");
        let second_signal = workdir.path().join("reopened-client-marker");
        let first_manager = TerminalManager::new();

        let first = first_manager
            .create_session(workdir.path())
            .expect("create first terminal client");
        assert!(
            first_manager
                .wait_for_output(&first.id, "\u{1b}", Duration::from_secs(5))
                .is_some(),
            "tmux rendered its first terminal frame",
        );
        first_manager
            .send_input(
                &first.id,
                &format!(
                    "export RESEARCH_CANVAS_TMUX_MARKER={marker}; printf ready > {}\n",
                    first_signal.display(),
                ),
            )
            .expect("set process state in tmux");
        assert_eq!(
            wait_for_file(&first_signal).as_deref(),
            Some("ready"),
            "the first client did not reach its tmux pane: {:?}",
            first_manager
                .session(&first.id)
                .expect("first session remains available")
                .output(),
        );
        first_manager
            .close_session(&first.id)
            .expect("close only the first terminal client");
        drop(first_manager);

        let reopened_manager = TerminalManager::new();
        let reopened = reopened_manager
            .create_session(workdir.path())
            .expect("reopen the workspace terminal");
        assert!(
            reopened_manager
                .wait_for_output(&reopened.id, "\u{1b}", Duration::from_secs(5))
                .is_some(),
            "reopened client rendered its tmux terminal frame",
        );
        reopened_manager
            .send_input(
                &reopened.id,
                &format!(
                    "printf '%s' \"$RESEARCH_CANVAS_TMUX_MARKER\" > {}\n",
                    second_signal.display(),
                ),
            )
            .expect("query process state after reattachment");

        assert_eq!(
            wait_for_file(&second_signal).as_deref(),
            Some(marker.as_str())
        );
        reopened_manager
            .close_session(&reopened.id)
            .expect("close reopened terminal client");
    }
}

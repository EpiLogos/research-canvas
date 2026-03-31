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
        let shell = resolve_shell();
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: DEFAULT_ROWS,
                cols: DEFAULT_COLUMNS,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(to_io_error)?;

        let mut command = CommandBuilder::new(shell.clone());
        command.cwd(&workdir);
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        command.env("LANG", "en_US.UTF-8");
        for argument in shell_arguments(&shell) {
            command.arg(argument);
        }

        let child = pair.slave.spawn_command(command).map_err(to_io_error)?;
        let master = pair.master;
        let mut reader = master.try_clone_reader().map_err(to_io_error)?;
        let writer = master.take_writer().map_err(to_io_error)?;

        let session = Self {
            id: Uuid::new_v4().to_string(),
            workdir,
            shell,
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

fn resolve_shell() -> String {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    if Path::new(&shell).exists() {
        shell
    } else if Path::new("/bin/zsh").exists() {
        "/bin/zsh".to_string()
    } else {
        "/bin/sh".to_string()
    }
}

fn shell_arguments(shell: &str) -> Vec<&'static str> {
    let executable = Path::new(shell)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();

    match executable {
        "bash" => vec!["--noprofile", "--norc", "-i"],
        "zsh" => vec!["-i"],
        _ => vec!["-i"],
    }
}

fn to_io_error(error: impl std::fmt::Display) -> std::io::Error {
    std::io::Error::other(error.to_string())
}

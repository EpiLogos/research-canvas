mod session;

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

use tauri::AppHandle;

pub use session::{
    TerminalOutputChunk, TerminalOutputEvent, TerminalSession, TerminalSessionSnapshot,
};

#[derive(Default)]
pub struct TerminalManager {
    sessions: Mutex<HashMap<String, Arc<TerminalSession>>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn create_session(
        &self,
        workdir: impl AsRef<Path>,
    ) -> std::io::Result<TerminalSessionSnapshot> {
        self.create_session_with_app(workdir, None)
    }

    pub fn create_session_with_app(
        &self,
        workdir: impl AsRef<Path>,
        app: Option<AppHandle>,
    ) -> std::io::Result<TerminalSessionSnapshot> {
        let session = Arc::new(TerminalSession::spawn(workdir.as_ref().to_path_buf(), app)?);
        let snapshot = session.snapshot();
        self.sessions
            .lock()
            .expect("terminal manager lock")
            .insert(snapshot.id.clone(), session);
        Ok(snapshot)
    }

    pub fn send_input(&self, session_id: &str, input: &str) -> std::io::Result<()> {
        let session = self.session(session_id)?;
        session.send_input(input)
    }

    pub fn resize_session(&self, session_id: &str, columns: u16, rows: u16) -> std::io::Result<()> {
        let session = self.session(session_id)?;
        session.resize(columns, rows)
    }

    pub fn close_session(&self, session_id: &str) -> std::io::Result<()> {
        let session = self.remove_session(session_id)?;
        session.close()
    }

    pub fn wait_for_output(
        &self,
        session_id: &str,
        needle: &str,
        timeout: Duration,
    ) -> Option<String> {
        let session = self.session(session_id).ok()?;
        session.wait_for_output(needle, timeout)
    }

    pub fn output_since(
        &self,
        session_id: &str,
        cursor: usize,
    ) -> std::io::Result<(Vec<TerminalOutputChunk>, usize)> {
        let session = self.session(session_id)?;
        Ok(session.output_since(cursor))
    }

    fn session(&self, session_id: &str) -> std::io::Result<Arc<TerminalSession>> {
        self.sessions
            .lock()
            .expect("terminal manager lock")
            .get(session_id)
            .cloned()
            .ok_or_else(|| {
                std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    format!("terminal session {session_id} not found"),
                )
            })
    }

    fn remove_session(&self, session_id: &str) -> std::io::Result<Arc<TerminalSession>> {
        self.sessions
            .lock()
            .expect("terminal manager lock")
            .remove(session_id)
            .ok_or_else(|| {
                std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    format!("terminal session {session_id} not found"),
                )
            })
    }
}

impl TerminalManager {
    pub fn current_workdir() -> PathBuf {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    }
}

use serde::Deserialize;
use tauri::{AppHandle, State};

use crate::pty::{TerminalManager, TerminalSessionSnapshot};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionRequest {
    pub workdir: Option<String>,
}

#[tauri::command]
pub fn create_terminal_session(
    app: AppHandle,
    manager: State<'_, TerminalManager>,
    request: Option<TerminalSessionRequest>,
) -> Result<TerminalSessionSnapshot, String> {
    let workdir = request
        .and_then(|payload| payload.workdir)
        .map(std::path::PathBuf::from)
        .unwrap_or_else(TerminalManager::current_workdir);

    manager
        .create_session_with_app(workdir, Some(app))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn send_terminal_input(
    manager: State<'_, TerminalManager>,
    session_id: String,
    input: String,
) -> Result<(), String> {
    manager
        .send_input(&session_id, &input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn resize_terminal_session(
    manager: State<'_, TerminalManager>,
    session_id: String,
    columns: u16,
    rows: u16,
) -> Result<(), String> {
    manager
        .resize_session(&session_id, columns, rows)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn close_terminal_session(
    manager: State<'_, TerminalManager>,
    session_id: String,
) -> Result<(), String> {
    manager
        .close_session(&session_id)
        .map_err(|error| error.to_string())
}

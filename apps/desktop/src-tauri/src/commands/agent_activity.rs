use crate::{
    db::{
        connection::Database,
        repositories::{AgentActivityRecord, AgentActivityRepository},
    },
    SharedApiState,
};
use tauri::State;

#[tauri::command]
pub fn list_agent_activity_command(
    limit: Option<i64>,
    state: State<'_, SharedApiState>,
) -> Result<Vec<AgentActivityRecord>, String> {
    let db_path = state
        .lock()
        .unwrap()
        .db_path
        .clone()
        .ok_or_else(|| "App not bootstrapped yet".to_string())?;
    let db = Database::open(&db_path).map_err(|e| e.to_string())?;
    let conn = db.connection();
    AgentActivityRepository::new(conn)
        .list_recent(limit.unwrap_or(50))
        .map_err(|e| e.to_string())
}

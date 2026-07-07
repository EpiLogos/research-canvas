// apps/desktop/src-tauri/src/commands/node_document.rs
use serde::Deserialize;

use crate::commands::graph::resolve_db_path;
use crate::db::{
    connection::Database,
    repositories::{LocalNodeDocument, NodeDocumentRepository},
};
use crate::SharedApiState;

// ---- Request payloads (camelCase to match the TS transport) ----

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadLocalNodeDocumentRequest {
    #[serde(default)]
    pub database_path: Option<String>,
    pub graph_node_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertLocalNodeDocumentRequest {
    #[serde(default)]
    pub database_path: Option<String>,
    pub graph_node_id: String,
    pub body: String,
    pub summary: String,
    #[serde(default)]
    pub neo4j_synced: bool,
}

#[tauri::command]
pub async fn read_local_node_document_command(
    request: ReadLocalNodeDocumentRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<Option<LocalNodeDocument>, String> {
    let path = resolve_db_path(&request.database_path, &api_state)?;
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    NodeDocumentRepository::new(db.connection())
        .get_node_document(&request.graph_node_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_local_node_document_command(
    request: UpsertLocalNodeDocumentRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<(), String> {
    let path = resolve_db_path(&request.database_path, &api_state)?;
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    NodeDocumentRepository::new(db.connection())
        .upsert_node_document(
            &request.graph_node_id,
            &request.body,
            &request.summary,
            request.neo4j_synced,
        )
        .map_err(|e| e.to_string())
}

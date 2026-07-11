// apps/desktop/src-tauri/src/commands/node_document.rs
use serde::{Deserialize, Serialize};

use crate::commands::graph::resolve_db_path;
use crate::db::repositories::graph::ContentOrigin;
use crate::db::{
    connection::Database,
    repositories::{
        DocumentContentInput, DocumentMetadataProjection, DocumentReconciliationItem,
        LocalNodeDocument, NodeDocumentMutation, NodeDocumentRepository, PendingNodeDocumentSync,
        ReconciliationDecision, SyncAcknowledgementMutation,
    },
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
    #[serde(default)]
    pub content_origin: Option<ContentOrigin>,
    #[serde(default)]
    pub content_revision: Option<i64>,
    #[serde(default)]
    pub expected_revision: Option<i64>,
    #[serde(default)]
    pub body_source_coordinates: Vec<String>,
    #[serde(default)]
    pub dry_run: bool,
    #[serde(default)]
    pub metadata_projection: Option<DocumentMetadataProjection>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileLocalNodeDocumentsRequest {
    #[serde(default)]
    pub database_path: Option<String>,
    pub items: Vec<DocumentReconciliationItem>,
    #[serde(default)]
    pub dry_run: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcknowledgeLocalNodeDocumentSyncRequest {
    #[serde(default)]
    pub database_path: Option<String>,
    pub graph_node_id: String,
    pub expected_revision: i64,
    pub expected_origin: ContentOrigin,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListPendingNodeDocumentSyncsRequest {
    #[serde(default)]
    pub database_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalNodeDocumentWriteResult {
    pub mutation: NodeDocumentMutation,
    pub document: Option<LocalNodeDocument>,
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

pub fn list_pending_node_document_syncs_at_path(
    path: &str,
) -> Result<Vec<PendingNodeDocumentSync>, String> {
    let db = Database::open(path).map_err(|e| e.to_string())?;
    NodeDocumentRepository::new(db.connection())
        .list_pending_syncs()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_pending_node_document_syncs_command(
    request: ListPendingNodeDocumentSyncsRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<Vec<PendingNodeDocumentSync>, String> {
    let path = resolve_db_path(&request.database_path, &api_state)?;
    list_pending_node_document_syncs_at_path(&path)
}

#[tauri::command]
pub async fn upsert_local_node_document_command(
    request: UpsertLocalNodeDocumentRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<LocalNodeDocumentWriteResult, String> {
    let path = resolve_db_path(&request.database_path, &api_state)?;
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    let repo = NodeDocumentRepository::new(db.connection());
    let mutation = if let Some(origin) = request.content_origin {
        let revision = request.content_revision.ok_or_else(|| {
            "contentRevision is required when contentOrigin is supplied".to_string()
        })?;
        let input = DocumentContentInput {
            graph_node_id: request.graph_node_id.clone(),
            body: request.body,
            summary: request.summary,
            content_origin: origin,
            content_revision: revision,
            body_source_coordinates: request.body_source_coordinates,
            neo4j_synced: request.neo4j_synced,
        };
        if request.dry_run {
            repo.plan_reconciliation(&input, request.expected_revision)
        } else {
            repo.apply_reconciliation_with_projection(
                &input,
                request.expected_revision,
                request.metadata_projection.as_ref(),
            )
        }
    } else if request.dry_run {
        Err(crate::db::repositories::RepositoryError::Validation(
            "legacy document writes cannot be dry-run; supply ownership and revision".into(),
        ))
    } else {
        let existed = repo
            .get_node_document(&request.graph_node_id)
            .map_err(|error| error.to_string())?
            .is_some();
        repo.upsert_node_document(
            &request.graph_node_id,
            &request.body,
            &request.summary,
            request.neo4j_synced,
        )
        .map(|_| {
            if existed {
                NodeDocumentMutation::Updated
            } else {
                NodeDocumentMutation::Created
            }
        })
    }
    .map_err(|e| e.to_string())?;
    let document = repo
        .get_node_document(&request.graph_node_id)
        .map_err(|e| e.to_string())?;
    Ok(LocalNodeDocumentWriteResult { mutation, document })
}

#[tauri::command]
pub async fn reconcile_local_node_documents_command(
    request: ReconcileLocalNodeDocumentsRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<Vec<ReconciliationDecision>, String> {
    let path = resolve_db_path(&request.database_path, &api_state)?;
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    let repo = NodeDocumentRepository::new(db.connection());
    if request.dry_run {
        return repo.plan_bulk(&request.items).map_err(|e| e.to_string());
    }
    repo.apply_bulk(&request.items).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn acknowledge_local_node_document_sync_command(
    request: AcknowledgeLocalNodeDocumentSyncRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<SyncAcknowledgementMutation, String> {
    let path = resolve_db_path(&request.database_path, &api_state)?;
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    NodeDocumentRepository::new(db.connection())
        .acknowledge_sync(
            &request.graph_node_id,
            request.expected_revision,
            request.expected_origin,
        )
        .map_err(|e| e.to_string())
}

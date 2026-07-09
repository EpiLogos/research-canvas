use std::path::PathBuf;

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};

use crate::db::{
    connection::Database,
    repositories::{CanvasAppStateRecord, EdgeLayoutRecord, LayoutRepository, NodeLayoutRecord},
};
use crate::SharedApiState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeLayoutPayload {
    pub graph_node_id: String,
    pub canvas_id: String,
    pub position_x: f64,
    pub position_y: f64,
    pub width: f64,
    pub height: f64,
    pub style_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeLayoutPayload {
    pub id: String,
    pub canvas_id: String,
    pub source_graph_node_id: String,
    pub target_graph_node_id: String,
    pub relation_kind: String,
    pub source_handle_id: Option<String>,
    pub target_handle_id: Option<String>,
    pub style_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlushCanvasLayoutRequest {
    pub database_path: String,
    pub canvas_id: String,
    pub layouts: Vec<NodeLayoutPayload>,
    pub edges: Vec<EdgeLayoutPayload>,
    pub viewport_json: String,
    pub app_state_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlushCanvasLayoutResponse {
    pub written_nodes: usize,
    pub written_edges: usize,
}

pub fn flush_canvas_layout_at(
    request: FlushCanvasLayoutRequest,
) -> Result<FlushCanvasLayoutResponse, String> {
    let mut database =
        Database::open(PathBuf::from(&request.database_path)).map_err(|error| error.to_string())?;

    let now = current_timestamp();

    let node_records: Vec<NodeLayoutRecord> = request
        .layouts
        .iter()
        .map(|payload| NodeLayoutRecord {
            graph_node_id: payload.graph_node_id.clone(),
            canvas_id: payload.canvas_id.clone(),
            position_x: payload.position_x,
            position_y: payload.position_y,
            width: payload.width,
            height: payload.height,
            style_json: payload.style_json.clone(),
            created_at: now.clone(),
            updated_at: now.clone(),
        })
        .collect();

    let edge_records: Vec<EdgeLayoutRecord> = request
        .edges
        .iter()
        .map(|payload| EdgeLayoutRecord {
            id: payload.id.clone(),
            canvas_id: payload.canvas_id.clone(),
            source_graph_node_id: payload.source_graph_node_id.clone(),
            target_graph_node_id: payload.target_graph_node_id.clone(),
            relation_kind: payload.relation_kind.clone(),
            source_handle_id: payload.source_handle_id.clone(),
            target_handle_id: payload.target_handle_id.clone(),
            style_json: payload.style_json.clone(),
            created_at: now.clone(),
            updated_at: now.clone(),
        })
        .collect();

    let app_state = CanvasAppStateRecord {
        canvas_id: request.canvas_id.clone(),
        viewport_json: request.viewport_json.clone(),
        app_state_json: request.app_state_json.clone(),
        updated_at: now.clone(),
    };

    let written_nodes = node_records.len();
    let written_edges = edge_records.len();

    {
        let transaction = database
            .connection_mut()
            .transaction()
            .map_err(|error| error.to_string())?;
        {
            let repo = LayoutRepository::new(&transaction);
            repo.upsert_node_layouts(&node_records)
                .map_err(|error| error.to_string())?;
            for edge in &edge_records {
                repo.upsert_edge_layout(edge)
                    .map_err(|error| error.to_string())?;
            }
            repo.upsert_app_state(&app_state)
                .map_err(|error| error.to_string())?;
        }
        transaction.commit().map_err(|error| error.to_string())?;
    }

    Ok(FlushCanvasLayoutResponse {
        written_nodes,
        written_edges,
    })
}

#[tauri::command]
pub fn flush_canvas_layout_command(
    request: FlushCanvasLayoutRequest,
    _api_state: tauri::State<SharedApiState>,
) -> Result<FlushCanvasLayoutResponse, String> {
    flush_canvas_layout_at(request)
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

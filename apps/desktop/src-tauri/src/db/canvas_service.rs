// apps/desktop/src-tauri/src/db/canvas_service.rs
use serde::{Deserialize, Serialize};

use crate::db::{
    connection::Database,
    repositories::{
        graph::{GraphNode, GraphRelationship, GraphRepository},
        layout::{EdgeLayoutRecord, LayoutRepository, NodeLayoutRecord},
    },
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeLayoutDto {
    pub graph_node_id: String,
    pub canvas_id: String,
    pub position_x: f64,
    pub position_y: f64,
    pub width: f64,
    pub height: f64,
    pub style: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeLayoutDto {
    pub id: String,
    pub canvas_id: String,
    pub source_graph_node_id: String,
    pub target_graph_node_id: String,
    pub relation_kind: String,
    pub source_handle_id: Option<String>,
    pub target_handle_id: Option<String>,
    pub style: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinedCanvasNode {
    pub node: GraphNode,
    pub layout: NodeLayoutDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasView {
    pub canvas_id: String,
    pub nodes: Vec<JoinedCanvasNode>,
    pub edges: Vec<EdgeLayoutDto>,
    pub relationships: Vec<GraphRelationship>,
    pub viewport: serde_json::Value,
    pub app_state: serde_json::Value,
}

pub struct CanvasService {
    graph: GraphRepository,
    db_path: String,
}

const DEFAULT_NODE_WIDTH: f64 = 240.0;
const DEFAULT_NODE_HEIGHT: f64 = 160.0;
const AUTO_PLACE_STEP: f64 = 64.0;
const AUTO_PLACE_PER_ROW: usize = 8;

impl CanvasService {
    pub fn new(graph: GraphRepository, db_path: String) -> Self {
        Self { graph, db_path }
    }

    pub async fn load_canvas_view(
        &self,
        canvas_id: &str,
        lens: &str,
    ) -> Result<CanvasView, String> {
        // 1. Substance from Neo4j (lens-filtered).
        let nodes = self.graph.list_nodes_for_lens(lens).await?;
        let relationships = self.graph.list_relationships().await?;

        // 2. Layout from SQLite.
        let db = Database::open(&self.db_path).map_err(|e| e.to_string())?;
        let conn = db.connection();
        let layout_repo = LayoutRepository::new(conn);
        let layout_rows = layout_repo
            .list_node_layout(canvas_id)
            .map_err(|e| e.to_string())?;
        let edge_rows = layout_repo
            .list_edge_layout(canvas_id)
            .map_err(|e| e.to_string())?;
        let app_state = layout_repo
            .get_app_state(canvas_id)
            .map_err(|e| e.to_string())?;

        // 3. Zip on graph_node_id; auto-place nodes without a layout row.
        let mut layout_by_id: std::collections::HashMap<String, NodeLayoutRecord> =
            std::collections::HashMap::new();
        for row in layout_rows {
            layout_by_id.insert(row.graph_node_id.clone(), row);
        }

        let mut joined = Vec::with_capacity(nodes.len());
        let mut auto_index = 0usize;
        for node in nodes {
            let layout = match layout_by_id.get(&node.graph_node_id) {
                Some(row) => NodeLayoutDto {
                    graph_node_id: row.graph_node_id.clone(),
                    canvas_id: row.canvas_id.clone(),
                    position_x: row.position_x,
                    position_y: row.position_y,
                    width: row.width,
                    height: row.height,
                    style: serde_json::from_str(&row.style_json)
                        .unwrap_or_else(|_| serde_json::json!({})),
                },
                None => {
                    let col = (auto_index % AUTO_PLACE_PER_ROW) as f64;
                    let row_idx = (auto_index / AUTO_PLACE_PER_ROW) as f64;
                    auto_index += 1;
                    NodeLayoutDto {
                        graph_node_id: node.graph_node_id.clone(),
                        canvas_id: canvas_id.to_string(),
                        position_x: col * (DEFAULT_NODE_WIDTH + AUTO_PLACE_STEP),
                        position_y: row_idx * (DEFAULT_NODE_HEIGHT + AUTO_PLACE_STEP),
                        width: DEFAULT_NODE_WIDTH,
                        height: DEFAULT_NODE_HEIGHT,
                        style: serde_json::json!({}),
                    }
                }
            };
            joined.push(JoinedCanvasNode { node, layout });
        }
        // Orphan layout rows (no substance) are simply not emitted.

        let edges = edge_rows
            .into_iter()
            .map(edge_dto_from_record)
            .collect::<Vec<_>>();

        let (viewport, app_state_json) = match app_state {
            Some(state) => (
                serde_json::from_str(&state.viewport_json)
                    .unwrap_or_else(|_| serde_json::json!({ "x": 0, "y": 0, "zoom": 1 })),
                serde_json::from_str(&state.app_state_json)
                    .unwrap_or_else(|_| serde_json::json!({})),
            ),
            None => (serde_json::json!({ "x": 0, "y": 0, "zoom": 1 }), serde_json::json!({})),
        };

        Ok(CanvasView {
            canvas_id: canvas_id.to_string(),
            nodes: joined,
            edges,
            relationships,
            viewport,
            app_state: app_state_json,
        })
    }
}

fn edge_dto_from_record(r: EdgeLayoutRecord) -> EdgeLayoutDto {
    EdgeLayoutDto {
        id: r.id,
        canvas_id: r.canvas_id,
        source_graph_node_id: r.source_graph_node_id,
        target_graph_node_id: r.target_graph_node_id,
        relation_kind: r.relation_kind,
        source_handle_id: r.source_handle_id,
        target_handle_id: r.target_handle_id,
        style: serde_json::from_str(&r.style_json).unwrap_or_else(|_| serde_json::json!({})),
    }
}

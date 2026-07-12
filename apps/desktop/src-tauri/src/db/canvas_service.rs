// apps/desktop/src-tauri/src/db/canvas_service.rs
use serde::{Deserialize, Serialize};

use crate::db::{
    connection::Database,
    repositories::{
        graph::{EntityType, GraphNode, GraphRelationship, GraphRepository},
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

/// Default title used when a layout row has no `__canvasNode` sidecar (or the
/// sidecar has no usable title) and no matching Neo4j node — should only
/// happen for layout rows written before the sidecar carried a title.
const SYNTHESIZED_DEFAULT_TITLE: &str = "Untitled";

impl CanvasService {
    pub fn new(graph: GraphRepository, db_path: String) -> Self {
        Self { graph, db_path }
    }

    pub async fn load_canvas_view(
        &self,
        canvas_id: &str,
        lens: &str,
    ) -> Result<CanvasView, String> {
        if lens != "canvas" && lens != "timeline" {
            return Err(format!("unknown lens: {lens}"));
        }

        // 1. Layout from SQLite — the LOCAL, LAYOUT-AUTHORITATIVE source of
        // truth for "what nodes are on this canvas". A node that only exists
        // locally (best-effort Neo4j sync hasn't landed, or Neo4j is
        // unreachable) must still render. Scoped in a block so the
        // non-`Send` `Connection`/`LayoutRepository` are dropped before the
        // Neo4j `.await`s below (required for this future to be `Send`,
        // which `#[tauri::command]` needs).
        let (layout_rows, edge_rows, app_state) = {
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
            (layout_rows, edge_rows, app_state)
        };

        let relationships = self.graph.list_relationships().await?;

        // 2. Substance from Neo4j, batch-fetched for exactly the layout rows'
        // ids. Contract/decoding failures are fatal: synthesizing on a batch
        // error would silently turn temporal nodes into non-temporal fallbacks.
        let ids: Vec<String> = layout_rows
            .iter()
            .map(|r| r.graph_node_id.clone())
            .collect();
        let mut nodes_by_id: std::collections::HashMap<String, GraphNode> =
            std::collections::HashMap::new();
        let found = self
            .graph
            .get_nodes(&ids)
            .await
            .map_err(|error| format!("load_canvas_view graph contract failed: {error}"))?;
        for node in found {
            nodes_by_id.insert(node.graph_node_id.clone(), node);
        }

        // 3. For each layout row: use the real Neo4j node if present, else
        // synthesize a GraphNode from the __canvasNode sidecar so the row is
        // never dropped.
        let mut joined = Vec::with_capacity(layout_rows.len());
        for row in layout_rows {
            let node = match nodes_by_id.remove(&row.graph_node_id) {
                Some(node) => node,
                None => synthesize_node_from_layout(&row),
            };
            let layout = NodeLayoutDto {
                graph_node_id: row.graph_node_id.clone(),
                canvas_id: row.canvas_id.clone(),
                position_x: row.position_x,
                position_y: row.position_y,
                width: row.width,
                height: row.height,
                style: serde_json::from_str(&row.style_json)
                    .unwrap_or_else(|_| serde_json::json!({})),
            };
            joined.push(JoinedCanvasNode { node, layout });
        }

        // 4. Lens filter (mirrors list_nodes_for_lens: timeline shows only
        // is_temporal nodes). A synthesized node is always is_temporal =
        // false, so it is naturally excluded from the timeline lens.
        if lens == "timeline" {
            joined.retain(|j| j.node.is_temporal);
        }

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
            None => (
                serde_json::json!({ "x": 0, "y": 0, "zoom": 1 }),
                serde_json::json!({}),
            ),
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

/// Minimal shape of the `__canvasNode` sidecar stored in `style_json`
/// (see `CanvasNodeSidecar` in packages/desktop-api/src/graph.ts). Only the
/// fields needed to synthesize substance (`type`, `title`) are extracted;
/// unknown/extra fields are ignored.
#[derive(Debug, Deserialize)]
struct CanvasNodeSidecar {
    #[serde(rename = "type")]
    node_type: Option<String>,
    title: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StyleWithSidecar {
    #[serde(rename = "__canvasNode")]
    canvas_node: Option<CanvasNodeSidecar>,
}

/// Maps a `__canvasNode.type` to the Neo4j entity label a synced version of
/// that node would carry, mirroring the frontend's `entityTypeForNodeType`
/// (packages/canvas/src/state/canvasStore.ts): "resource" -> Source,
/// "portal" -> Constellation, everything else (note/group) -> Work.
fn entity_type_for_sidecar_type(node_type: &str) -> EntityType {
    match node_type {
        "resource" => EntityType::Source,
        "portal" => EntityType::Constellation,
        _ => EntityType::Work,
    }
}

/// Builds a GraphNode's substance from a layout row's `__canvasNode` sidecar
/// when no Neo4j node exists for its `graph_node_id` — e.g. a node created
/// locally whose best-effort Neo4j sync hasn't landed (or Neo4j was
/// unreachable at creation time). Always `is_temporal: false` so a
/// synthesized node is naturally excluded from the timeline lens.
fn synthesize_node_from_layout(row: &NodeLayoutRecord) -> GraphNode {
    let sidecar: Option<CanvasNodeSidecar> =
        serde_json::from_str::<StyleWithSidecar>(&row.style_json)
            .ok()
            .and_then(|s| s.canvas_node);

    let title = sidecar
        .as_ref()
        .and_then(|s| s.title.clone())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| SYNTHESIZED_DEFAULT_TITLE.to_string());
    let entity_type = sidecar
        .as_ref()
        .and_then(|s| s.node_type.as_deref())
        .map(entity_type_for_sidecar_type)
        .unwrap_or(EntityType::Work);

    GraphNode {
        graph_node_id: row.graph_node_id.clone(),
        entity_type,
        title,
        body: "[]".to_string(),
        summary: String::new(),
        archetypal_resonance: None,
        coordinate: None,
        source_coordinates: Vec::new(),
        evidence_tags: Vec::new(),
        source_kind: None,
        content_origin: None,
        content_revision: None,
        seed_schema_version: None,
        body_source_coordinates: Vec::new(),
        historicity: None,
        claim_kind: None,
        evidence_status: None,
        temporal_role: None,
        place_coverage: None,
        ql_form: None,
        ql_unit_id: None,
        ql_arc: None,
        ql_topology: None,
        ql_schema_version: None,
        ql_source_coordinates: Vec::new(),
        ql_completeness_status: None,
        is_temporal: false,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
        created_at: row.created_at.clone(),
        updated_at: row.updated_at.clone(),
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

// apps/desktop/src-tauri/src/export/graph_bundle.rs
//
// Joins Neo4j substance (GraphRepository) with SQLite layout (LayoutRepository)
// into the backend-less GraphExportBundle JSON the static web viewer reads.
// Populates lightingIndex by enumerating trans-temporal operator nodes
// (Archetype | Dynamic | PsychoidOperator, contracts §2.1 / §8.2) and calling
// GraphRepository::archetypal_lighting once per operator — this is the
// load-bearing step that makes the web timeline's archetypal lighting work
// without a query engine (createStaticBundleTransport.archetypalLighting
// reads straight from this precomputed index).
//
// Deliberately excludes agent_activity (WS6 app-authoring log) — it is not
// part of this bundle's shape and is never read here.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::db::repositories::graph::{GraphNode, GraphRelationship, GraphRepository};
use crate::db::repositories::layout::{
    CanvasAppStateRecord, EdgeLayoutRecord, LayoutRepository, NodeLayoutRecord,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleNodeLayout {
    pub graph_node_id: String,
    pub canvas_id: String,
    pub position_x: f64,
    pub position_y: f64,
    pub width: f64,
    pub height: f64,
    pub style: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleEdgeLayout {
    pub id: String,
    pub canvas_id: String,
    pub source_graph_node_id: String,
    pub target_graph_node_id: String,
    pub relation_kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_handle_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_handle_id: Option<String>,
    pub style: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleLitInstance {
    pub node: GraphNode,
    pub rel_type: String,
    pub dominance: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleViewport {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphExportBundle {
    pub generated_at: String,
    pub project: Value,
    pub canvas_id: String,
    pub nodes: Vec<GraphNode>,
    pub relationships: Vec<GraphRelationship>,
    pub node_layout: Vec<BundleNodeLayout>,
    pub edge_layout: Vec<BundleEdgeLayout>,
    pub viewport: BundleViewport,
    pub app_state: Value,
    pub lighting_index: std::collections::BTreeMap<String, Vec<BundleLitInstance>>,
    pub assets: Vec<Value>,
}

fn parse_style(style_json: &str) -> Value {
    serde_json::from_str(style_json).unwrap_or_else(|_| serde_json::json!({}))
}

fn node_layout_from_record(record: NodeLayoutRecord) -> BundleNodeLayout {
    BundleNodeLayout {
        style: parse_style(&record.style_json),
        graph_node_id: record.graph_node_id,
        canvas_id: record.canvas_id,
        position_x: record.position_x,
        position_y: record.position_y,
        width: record.width,
        height: record.height,
    }
}

fn edge_layout_from_record(record: EdgeLayoutRecord) -> BundleEdgeLayout {
    BundleEdgeLayout {
        style: parse_style(&record.style_json),
        id: record.id,
        canvas_id: record.canvas_id,
        source_graph_node_id: record.source_graph_node_id,
        target_graph_node_id: record.target_graph_node_id,
        relation_kind: record.relation_kind,
        source_handle_id: record.source_handle_id,
        target_handle_id: record.target_handle_id,
    }
}

fn viewport_from_app_state(state: &Option<CanvasAppStateRecord>) -> (BundleViewport, Value) {
    let default_viewport = BundleViewport {
        x: 0.0,
        y: 0.0,
        zoom: 1.0,
    };
    let default_app_state = serde_json::json!({});
    let Some(record) = state else {
        return (default_viewport, default_app_state);
    };
    let viewport =
        serde_json::from_str::<BundleViewport>(&record.viewport_json).unwrap_or(default_viewport);
    let app_state =
        serde_json::from_str::<Value>(&record.app_state_json).unwrap_or(default_app_state);
    (viewport, app_state)
}

/// Join Neo4j substance with SQLite layout into the backend-less bundle.
pub async fn build_graph_bundle(
    graph_repo: &GraphRepository,
    conn: &rusqlite::Connection,
    canvas_id: &str,
    project_json: Value,
) -> Result<GraphExportBundle, String> {
    let nodes = graph_repo.list_nodes_for_lens("canvas").await?;
    let relationships = graph_repo.list_relationships().await?;

    let layout_repo = LayoutRepository::new(conn);
    let node_layout = layout_repo
        .list_node_layout(canvas_id)
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(node_layout_from_record)
        .collect::<Vec<_>>();
    let edge_layout = layout_repo
        .list_edge_layout(canvas_id)
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(edge_layout_from_record)
        .collect::<Vec<_>>();
    let app_state_record = layout_repo
        .get_app_state(canvas_id)
        .map_err(|error| error.to_string())?;
    let (viewport, app_state) = viewport_from_app_state(&app_state_record);

    // Precompute lighting per lighting-source operator so the read-only viewer
    // can light the timeline without a query engine. Lighting sources are the
    // trans-temporal operator entity types (contracts §2.1 / §8.2):
    // Archetype, Dynamic, PsychoidOperator. We enumerate by entity_type (NOT by
    // !is_temporal) and call archetypal_lighting once per operator, keying the
    // index by operatorGraphNodeId. NOTE: list_nodes_for_lens("canvas") returns
    // only :TheoryNode nodes, so Archetype/Dynamic are covered here; seeded
    // :Operator PsychoidOperator nodes require the WS2 bulk method noted in the
    // Task 8 brief to be lit (tracked as a WS2 follow-up, not duplicated here).
    const LIGHTING_SOURCE_TYPES: [&str; 3] = ["Archetype", "Dynamic", "PsychoidOperator"];
    let mut lighting_index: std::collections::BTreeMap<String, Vec<BundleLitInstance>> =
        std::collections::BTreeMap::new();
    for node in nodes
        .iter()
        .filter(|node| LIGHTING_SOURCE_TYPES.contains(&node.entity_type.as_str()))
    {
        let lighting = graph_repo.archetypal_lighting(&node.graph_node_id).await?;
        if lighting.instances.is_empty() {
            continue;
        }
        let instances = lighting
            .instances
            .into_iter()
            .map(|instance| BundleLitInstance {
                node: instance.node,
                rel_type: instance.rel_type,
                dominance: instance.dominance,
            })
            .collect::<Vec<_>>();
        lighting_index.insert(node.graph_node_id.clone(), instances);
    }

    Ok(GraphExportBundle {
        generated_at: chrono::Utc::now().to_rfc3339(),
        project: project_json,
        canvas_id: canvas_id.to_string(),
        nodes,
        relationships,
        node_layout,
        edge_layout,
        viewport,
        app_state,
        lighting_index,
        assets: Vec::new(),
    })
}

pub fn serialize_graph_bundle(bundle: &GraphExportBundle) -> Result<String, String> {
    serde_json::to_string_pretty(bundle).map_err(|error| error.to_string())
}

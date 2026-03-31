use serde::{Deserialize, Serialize};

// ─── Request types ────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateNodeRequest {
    pub node_type: String, // "note" | "group" | "resource"
    pub title: String,
    pub content: Option<String>,
    pub x: f64,
    pub y: f64,
    pub dot_colour: Option<String>,
    pub bg_colour: Option<String>,
    pub text_colour: Option<String>,
    // resource-specific (optional for note/group)
    pub absolute_path: Option<String>,
    pub relative_path: Option<String>,
    pub resource_kind: Option<String>,
    // group-specific
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateNodeRequest {
    pub title: Option<String>,
    pub content: Option<String>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub dot_colour: Option<String>,
    pub bg_colour: Option<String>,
    pub text_colour: Option<String>,
    pub thumbnail: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateEdgeRequest {
    pub source_id: String,
    pub target_id: String,
    pub label: Option<String>,
    pub directed: Option<bool>,
    pub style: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BatchNodeItem {
    pub node_type: String,
    pub title: String,
    pub content: Option<String>,
    pub x: f64,
    pub y: f64,
    pub dot_colour: Option<String>,
    pub bg_colour: Option<String>,
    pub text_colour: Option<String>,
    pub color: Option<String>,
    // resource-specific
    pub absolute_path: Option<String>,
    pub relative_path: Option<String>,
    pub resource_kind: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BatchEdgeItem {
    pub source_index: usize,
    pub target_index: usize,
    pub label: Option<String>,
    pub directed: Option<bool>,
    pub style: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BatchCreateRequest {
    pub nodes: Vec<BatchNodeItem>,
    pub edges: Vec<BatchEdgeItem>,
}

// ─── Response types ───────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct NodeResponse {
    pub id: String,
    pub canvas_id: String,
    pub node_type: String,
    pub title: String,
    pub content: Option<String>,
    pub x: f64,
    pub y: f64,
    pub dot_colour: Option<String>,
    pub bg_colour: Option<String>,
    pub text_colour: Option<String>,
    pub thumbnail: Option<String>,
    pub summary: String,
    pub resource_kind: Option<String>,
    pub absolute_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct EdgeResponse {
    pub id: String,
    pub canvas_id: String,
    pub source_id: String,
    pub target_id: String,
    pub label: String,
    pub relation_kind: String,
    pub directionality: String,
}

#[derive(Debug, Serialize)]
pub struct CanvasStateResponse {
    pub canvas_id: String,
    pub nodes: Vec<NodeResponse>,
    pub edges: Vec<EdgeResponse>,
}

#[derive(Debug, Serialize)]
pub struct BatchCreatedItem {
    pub index: usize,
    pub id: String,
}

#[derive(Debug, Serialize)]
pub struct BatchCreateResponse {
    pub nodes: Vec<BatchCreatedItem>,
    pub edges: Vec<BatchCreatedItem>,
}

#[derive(Debug, Serialize)]
pub struct OkResponse {
    pub ok: bool,
}

// ─── Conversion helpers ───────────────────────────────────

use crate::db::repositories::{CanvasEdgeRecord, CanvasNodeRecord};

impl From<CanvasNodeRecord> for NodeResponse {
    fn from(r: CanvasNodeRecord) -> Self {
        NodeResponse {
            id: r.id,
            canvas_id: r.canvas_id,
            node_type: r.node_type,
            title: r.title,
            content: r.content,
            x: r.position_x,
            y: r.position_y,
            dot_colour: r.dot_colour,
            bg_colour: r.bg_colour,
            text_colour: r.text_colour,
            thumbnail: r.thumbnail,
            summary: r.summary,
            resource_kind: r.resource_kind,
            absolute_path: r.absolute_path,
        }
    }
}

impl From<CanvasEdgeRecord> for EdgeResponse {
    fn from(r: CanvasEdgeRecord) -> Self {
        EdgeResponse {
            id: r.id,
            canvas_id: r.canvas_id,
            source_id: r.source_node_id,
            target_id: r.target_node_id,
            label: r.label,
            relation_kind: r.relation_kind,
            directionality: r.directionality,
        }
    }
}

// apps/desktop/src-tauri/src/api/types.rs
use serde::{Deserialize, Serialize};

// ─── Request types ────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaceNodeRequest {
    pub graph_node_id: String,
    pub x: f64,
    pub y: f64,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub dot_colour: Option<String>,
    pub bg_colour: Option<String>,
    pub text_colour: Option<String>,
    pub thumbnail: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchPlaceItem {
    pub graph_node_id: String,
    pub x: f64,
    pub y: f64,
    pub width: Option<f64>,
    pub height: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchPlaceRequest {
    pub placements: Vec<BatchPlaceItem>,
}

// ─── Response types ───────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlacedNodeResponse {
    pub ok: bool,
    pub graph_node_id: String,
}

#[derive(Debug, Serialize)]
pub struct RemoveNodeResponse {
    pub ok: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchPlaceResponse {
    pub ok: bool,
    pub placed: usize,
}

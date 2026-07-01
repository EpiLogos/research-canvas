// apps/desktop/src-tauri/src/api/handlers.rs
use crate::{
    api::types::*,
    db::{
        connection::Database,
        repositories::layout::{LayoutRepository, NodeLayoutRecord},
    },
    SharedApiState,
};

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

fn db_path(state: &SharedApiState) -> Result<String, String> {
    state
        .lock()
        .unwrap()
        .db_path
        .clone()
        .ok_or_else(|| "App not bootstrapped yet".to_string())
}

fn active_canvas_id(state: &SharedApiState) -> Result<String, String> {
    state
        .lock()
        .unwrap()
        .active_canvas_id
        .clone()
        .ok_or_else(|| "No active canvas — open a canvas in the app first".to_string())
}

fn style_json(
    dot: &Option<String>,
    bg: &Option<String>,
    text: &Option<String>,
    thumb: &Option<String>,
) -> String {
    let mut map = serde_json::Map::new();
    if let Some(v) = dot { map.insert("dotColour".into(), serde_json::Value::String(v.clone())); }
    if let Some(v) = bg { map.insert("bgColour".into(), serde_json::Value::String(v.clone())); }
    if let Some(v) = text { map.insert("textColour".into(), serde_json::Value::String(v.clone())); }
    if let Some(v) = thumb { map.insert("thumbnail".into(), serde_json::Value::String(v.clone())); }
    serde_json::Value::Object(map).to_string()
}

/// GET /api/canvas — layout-only view.
/// Returns the raw layout rows + canvas id; the agent uses this to know what
/// exists and where it sits. (Substance fields come from Neo4j through the app's
/// own load_canvas_view command; the :9876 read returns layout placement only,
/// which is all the place-on-canvas agent needs.)
pub fn get_canvas(state: &SharedApiState) -> Result<serde_json::Value, String> {
    let canvas_id = active_canvas_id(state)?;
    let path = db_path(state)?;
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    let repo = LayoutRepository::new(db.connection());
    let nodes = repo.list_node_layout(&canvas_id).map_err(|e| e.to_string())?;
    let edges = repo.list_edge_layout(&canvas_id).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "canvasId": canvas_id,
        "nodes": nodes,
        "edges": edges,
    }))
}

/// PUT /api/layout/node — place/move/restyle one node (upsert layout only).
pub fn upsert_node_layout(
    req: PlaceNodeRequest,
    state: &SharedApiState,
) -> Result<PlacedNodeResponse, String> {
    let canvas_id = active_canvas_id(state)?;
    let path = db_path(state)?;
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    let repo = LayoutRepository::new(db.connection());
    // Preserve existing position/size when only restyling: read, then merge.
    let existing = repo
        .list_node_layout(&canvas_id)
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|r| r.graph_node_id == req.graph_node_id);
    let (created_at, base_w, base_h) = match &existing {
        Some(r) => (r.created_at.clone(), r.width, r.height),
        None => (now(), 240.0, 160.0),
    };
    repo.upsert_node_layout(&NodeLayoutRecord {
        graph_node_id: req.graph_node_id.clone(),
        canvas_id,
        position_x: req.x,
        position_y: req.y,
        width: req.width.unwrap_or(base_w),
        height: req.height.unwrap_or(base_h),
        style_json: style_json(&req.dot_colour, &req.bg_colour, &req.text_colour, &req.thumbnail),
        created_at,
        updated_at: now(),
    })
    .map_err(|e| e.to_string())?;
    Ok(PlacedNodeResponse { ok: true, graph_node_id: req.graph_node_id })
}

/// DELETE /api/layout/node/:graphNodeId — remove placement (theory NOT deleted).
pub fn remove_node_layout(
    graph_node_id: String,
    state: &SharedApiState,
) -> Result<RemoveNodeResponse, String> {
    let canvas_id = active_canvas_id(state)?;
    let path = db_path(state)?;
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    LayoutRepository::new(db.connection())
        .delete_node_layout(&canvas_id, &graph_node_id)
        .map_err(|e| e.to_string())?;
    Ok(RemoveNodeResponse { ok: true })
}

/// POST /api/layout/batch — place many existing graph nodes at once.
pub fn batch_place(
    req: BatchPlaceRequest,
    state: &SharedApiState,
) -> Result<BatchPlaceResponse, String> {
    let canvas_id = active_canvas_id(state)?;
    let path = db_path(state)?;
    let mut db = Database::open(&path).map_err(|e| e.to_string())?;
    let tx = db.connection_mut().transaction().map_err(|e| e.to_string())?;
    {
        let repo = LayoutRepository::new(&tx);
        for item in &req.placements {
            repo.upsert_node_layout(&NodeLayoutRecord {
                graph_node_id: item.graph_node_id.clone(),
                canvas_id: canvas_id.clone(),
                position_x: item.x,
                position_y: item.y,
                width: item.width.unwrap_or(240.0),
                height: item.height.unwrap_or(160.0),
                style_json: "{}".into(),
                created_at: now(),
                updated_at: now(),
            })
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(BatchPlaceResponse { ok: true, placed: req.placements.len() })
}

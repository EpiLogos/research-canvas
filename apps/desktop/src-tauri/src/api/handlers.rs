use crate::{
    api::types::*,
    db::{connection::Database, repositories::CanvasGraphRepository},
    SharedApiState,
};

fn open_db(state: &SharedApiState) -> Result<Database, String> {
    let db_path = state
        .lock()
        .unwrap()
        .db_path
        .clone()
        .ok_or_else(|| "App not bootstrapped yet".to_string())?;
    Database::open(&db_path).map_err(|e| e.to_string())
}

fn active_canvas_id(state: &SharedApiState) -> Result<String, String> {
    state
        .lock()
        .unwrap()
        .active_canvas_id
        .clone()
        .ok_or_else(|| "No active canvas — open a canvas in the app first".to_string())
}

/// GET /api/canvas
pub fn get_canvas(state: &SharedApiState) -> Result<CanvasStateResponse, String> {
    let canvas_id = active_canvas_id(state)?;
    let db = open_db(state)?;
    let conn = db.connection();
    let graph = CanvasGraphRepository::new(conn);
    let snapshot = graph.load_canvas_snapshot(&canvas_id).map_err(|e| e.to_string())?;
    Ok(CanvasStateResponse {
        canvas_id: canvas_id.clone(),
        nodes: snapshot.nodes.into_iter().map(NodeResponse::from).collect(),
        edges: snapshot.edges.into_iter().map(EdgeResponse::from).collect(),
    })
}

/// POST /api/nodes
pub fn create_node(req: CreateNodeRequest, state: &SharedApiState) -> Result<NodeResponse, String> {
    let canvas_id = active_canvas_id(state)?;
    let db = open_db(state)?;
    let conn = db.connection();
    let graph = CanvasGraphRepository::new(conn);

    let node = match req.node_type.as_str() {
        "note" => graph.create_note_node(
            &canvas_id,
            &req.title,
            req.content.as_deref().unwrap_or(""),
            req.x,
            req.y,
        ),
        "group" => graph.create_group_node(
            &canvas_id,
            &req.title,
            req.color.as_deref().unwrap_or("#e67e22"),
            req.x,
            req.y,
        ),
        "resource" => graph.create_resource_node(
            &canvas_id,
            &req.title,
            req.absolute_path.as_deref().unwrap_or(""),
            req.relative_path.as_deref().unwrap_or(""),
            req.resource_kind.as_deref().unwrap_or("binary"),
            "application/octet-stream",
            "",
            req.x,
            req.y,
        ),
        other => return Err(format!("Unknown node_type: {}", other)),
    }
    .map_err(|e| e.to_string())?;

    // Apply style fields if provided
    if req.dot_colour.is_some() || req.bg_colour.is_some() || req.text_colour.is_some() {
        graph
            .update_node_style(
                &node.id,
                req.dot_colour.as_deref(),
                req.bg_colour.as_deref(),
                req.text_colour.as_deref(),
                None,
            )
            .map_err(|e| e.to_string())?;
    }

    let final_node = graph
        .get_node_by_id(&node.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Node disappeared after create".to_string())?;

    Ok(NodeResponse::from(final_node))
}

/// PATCH /api/nodes/:id
pub fn update_node(
    node_id: String,
    req: UpdateNodeRequest,
    state: &SharedApiState,
) -> Result<OkResponse, String> {
    let db = open_db(state)?;
    let conn = db.connection();
    let graph = CanvasGraphRepository::new(conn);

    if req.title.is_some() || req.content.is_some() || req.x.is_some() || req.y.is_some() {
        graph
            .update_node(&node_id, req.title.as_deref(), req.content.as_deref(), req.x, req.y)
            .map_err(|e| e.to_string())?;
    }

    if req.dot_colour.is_some() || req.bg_colour.is_some() || req.text_colour.is_some() || req.thumbnail.is_some() {
        graph
            .update_node_style(
                &node_id,
                req.dot_colour.as_deref(),
                req.bg_colour.as_deref(),
                req.text_colour.as_deref(),
                req.thumbnail.as_deref(),
            )
            .map_err(|e| e.to_string())?;
    }

    Ok(OkResponse { ok: true })
}

/// DELETE /api/nodes/:id
pub fn delete_node(node_id: String, state: &SharedApiState) -> Result<OkResponse, String> {
    let db = open_db(state)?;
    let conn = db.connection();
    CanvasGraphRepository::new(conn)
        .delete_node(&node_id)
        .map_err(|e| e.to_string())?;
    Ok(OkResponse { ok: true })
}

/// POST /api/edges
pub fn create_edge(req: CreateEdgeRequest, state: &SharedApiState) -> Result<EdgeResponse, String> {
    let canvas_id = active_canvas_id(state)?;
    let db = open_db(state)?;
    let conn = db.connection();
    let label = req.label.as_deref().unwrap_or("reference");
    let edge = CanvasGraphRepository::new(conn)
        .connect_nodes(&canvas_id, &req.source_id, &req.target_id, label)
        .map_err(|e| e.to_string())?;
    Ok(EdgeResponse::from(edge))
}

/// DELETE /api/edges/:id
pub fn delete_edge(edge_id: String, state: &SharedApiState) -> Result<OkResponse, String> {
    let db = open_db(state)?;
    let conn = db.connection();
    CanvasGraphRepository::new(conn)
        .delete_edge(&edge_id)
        .map_err(|e| e.to_string())?;
    Ok(OkResponse { ok: true })
}

/// POST /api/batch
pub fn batch_create(
    req: BatchCreateRequest,
    state: &SharedApiState,
) -> Result<BatchCreateResponse, String> {
    let canvas_id = active_canvas_id(state)?;
    let db = open_db(state)?;
    let conn = db.connection();
    let graph = CanvasGraphRepository::new(conn);

    let mut created_node_ids: Vec<String> = Vec::new();
    let mut node_results: Vec<BatchCreatedItem> = Vec::new();

    for (i, node_req) in req.nodes.iter().enumerate() {
        let node = match node_req.node_type.as_str() {
            "note" => graph.create_note_node(
                &canvas_id,
                &node_req.title,
                node_req.content.as_deref().unwrap_or(""),
                node_req.x,
                node_req.y,
            ),
            "group" => graph.create_group_node(
                &canvas_id,
                &node_req.title,
                node_req.color.as_deref().unwrap_or("#e67e22"),
                node_req.x,
                node_req.y,
            ),
            "resource" => graph.create_resource_node(
                &canvas_id,
                &node_req.title,
                node_req.absolute_path.as_deref().unwrap_or(""),
                node_req.relative_path.as_deref().unwrap_or(""),
                node_req.resource_kind.as_deref().unwrap_or("binary"),
                "application/octet-stream",
                "",
                node_req.x,
                node_req.y,
            ),
            other => return Err(format!("node[{}]: unknown node_type '{}'", i, other)),
        }
        .map_err(|e| format!("node[{}]: {}", i, e))?;

        if node_req.dot_colour.is_some() || node_req.bg_colour.is_some() || node_req.text_colour.is_some() {
            graph
                .update_node_style(
                    &node.id,
                    node_req.dot_colour.as_deref(),
                    node_req.bg_colour.as_deref(),
                    node_req.text_colour.as_deref(),
                    None,
                )
                .map_err(|e| format!("node[{}] style: {}", i, e))?;
        }

        created_node_ids.push(node.id.clone());
        node_results.push(BatchCreatedItem { index: i, id: node.id });
    }

    let mut edge_results: Vec<BatchCreatedItem> = Vec::new();
    for (i, edge_req) in req.edges.iter().enumerate() {
        let src = created_node_ids
            .get(edge_req.source_index)
            .ok_or_else(|| format!("edge[{}]: source_index {} out of range", i, edge_req.source_index))?;
        let tgt = created_node_ids
            .get(edge_req.target_index)
            .ok_or_else(|| format!("edge[{}]: target_index {} out of range", i, edge_req.target_index))?;
        let label = edge_req.label.as_deref().unwrap_or("reference");
        let edge = graph
            .connect_nodes(&canvas_id, src, tgt, label)
            .map_err(|e| format!("edge[{}]: {}", i, e))?;
        edge_results.push(BatchCreatedItem { index: i, id: edge.id });
    }

    Ok(BatchCreateResponse {
        nodes: node_results,
        edges: edge_results,
    })
}

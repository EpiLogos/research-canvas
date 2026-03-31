pub mod handlers;
pub mod types;

use crate::SharedApiState;
use tauri::Emitter;
use tiny_http::{Method, Response, Server};

pub fn start_server(state: SharedApiState, app_handle: tauri::AppHandle) {
    let server = Server::http("127.0.0.1:9876")
        .expect("Failed to bind HTTP server on port 9876");

    for mut request in server.incoming_requests() {
        let method = request.method().clone();
        let url = request.url().to_string();

        // Read body for POST/PATCH
        let body: Option<String> = match method {
            Method::Post | Method::Patch => {
                let mut body = String::new();
                request.as_reader().read_to_string(&mut body).ok();
                Some(body)
            }
            _ => None,
        };

        let (status, json_body, mutates) = dispatch(&method, &url, body, &state);

        // Emit canvas:updated after mutations so the frontend re-fetches
        if mutates {
            let _ = app_handle.emit("canvas:updated", ());
        }

        let response = Response::from_string(json_body)
            .with_status_code(status)
            .with_header(
                tiny_http::Header::from_bytes(
                    &b"Content-Type"[..],
                    &b"application/json"[..],
                )
                .unwrap(),
            )
            .with_header(
                tiny_http::Header::from_bytes(
                    &b"Access-Control-Allow-Origin"[..],
                    &b"*"[..],
                )
                .unwrap(),
            );

        let _ = request.respond(response);
    }
}

fn dispatch(
    method: &Method,
    url: &str,
    body: Option<String>,
    state: &SharedApiState,
) -> (u32, String, bool) {
    // Strip query string
    let path = url.split('?').next().unwrap_or(url);

    // OPTIONS preflight
    if *method == Method::Options {
        return (200, "{}".into(), false);
    }

    match (method, path) {
        // GET /api/canvas
        (Method::Get, "/api/canvas") => match handlers::get_canvas(state) {
            Ok(data) => (200, serde_json::to_string(&data).unwrap(), false),
            Err(e) => err(500, &e),
        },

        // POST /api/nodes
        (Method::Post, "/api/nodes") => {
            let Some(raw) = body else { return err(400, "missing body") };
            match serde_json::from_str(&raw) {
                Ok(req) => match handlers::create_node(req, state) {
                    Ok(data) => (201, serde_json::to_string(&data).unwrap(), true),
                    Err(e) => err(500, &e),
                },
                Err(e) => err(400, &e.to_string()),
            }
        }

        // PATCH /api/nodes/:id
        (Method::Patch, node_patch_path) if node_patch_path.starts_with("/api/nodes/") => {
            let node_id = node_patch_path.trim_start_matches("/api/nodes/").to_string();
            if node_id.is_empty() { return err(400, "missing node id") }
            let Some(raw) = body else { return err(400, "missing body") };
            match serde_json::from_str(&raw) {
                Ok(req) => match handlers::update_node(node_id, req, state) {
                    Ok(data) => (200, serde_json::to_string(&data).unwrap(), true),
                    Err(e) => err(500, &e),
                },
                Err(e) => err(400, &e.to_string()),
            }
        }

        // DELETE /api/nodes/:id
        (Method::Delete, node_delete_path) if node_delete_path.starts_with("/api/nodes/") => {
            let node_id = node_delete_path.trim_start_matches("/api/nodes/").to_string();
            if node_id.is_empty() { return err(400, "missing node id") }
            match handlers::delete_node(node_id, state) {
                Ok(data) => (200, serde_json::to_string(&data).unwrap(), true),
                Err(e) => err(500, &e),
            }
        }

        // POST /api/edges
        (Method::Post, "/api/edges") => {
            let Some(raw) = body else { return err(400, "missing body") };
            match serde_json::from_str(&raw) {
                Ok(req) => match handlers::create_edge(req, state) {
                    Ok(data) => (201, serde_json::to_string(&data).unwrap(), true),
                    Err(e) => err(500, &e),
                },
                Err(e) => err(400, &e.to_string()),
            }
        }

        // DELETE /api/edges/:id
        (Method::Delete, edge_delete_path) if edge_delete_path.starts_with("/api/edges/") => {
            let edge_id = edge_delete_path.trim_start_matches("/api/edges/").to_string();
            if edge_id.is_empty() { return err(400, "missing edge id") }
            match handlers::delete_edge(edge_id, state) {
                Ok(data) => (200, serde_json::to_string(&data).unwrap(), true),
                Err(e) => err(500, &e),
            }
        }

        // POST /api/batch
        (Method::Post, "/api/batch") => {
            let Some(raw) = body else { return err(400, "missing body") };
            match serde_json::from_str(&raw) {
                Ok(req) => match handlers::batch_create(req, state) {
                    Ok(data) => (201, serde_json::to_string(&data).unwrap(), true),
                    Err(e) => err(500, &e),
                },
                Err(e) => err(400, &e.to_string()),
            }
        }

        _ => err(404, "not found"),
    }
}

fn err(status: u32, msg: &str) -> (u32, String, bool) {
    (
        status,
        serde_json::json!({ "ok": false, "error": msg }).to_string(),
        false,
    )
}

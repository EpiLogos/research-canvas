use std::sync::Arc;

use research_canvas_desktop_lib::{
    commands::{
        projects::{
            attach_project_resource_root_at, bootstrap_workspace_at, default_database_path,
            detach_project_resource_root_at, list_directories_at, list_project_resource_roots_at,
            load_project_document_at, persist_project_document_at,
            create_saved_sequence_command, delete_saved_sequence_command,
            list_saved_sequences_command, update_saved_sequence_command,
            CreateSavedSequenceRequest, DeleteSavedSequenceRequest, ListSavedSequencesRequest,
            PersistProjectDocumentRequest, ResourceRootLookupRequest, ResourceRootMutationRequest,
            UpdateSavedSequenceRequest,
        },
        search::{
            rebuild_project_search_index_command, search_project_command,
            RebuildProjectSearchIndexRequest, SearchProjectRequest,
        },
    },
    pty::TerminalManager,
};
use serde::Deserialize;
use serde_json::json;
use tiny_http::{Header, Method, Response, Server, StatusCode};

const HOST: &str = "127.0.0.1";
const DEFAULT_PORT: u16 = 4789;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserTerminalRequest {
    workdir: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserTerminalInput {
    input: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserTerminalResize {
    columns: Option<u16>,
    rows: Option<u16>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserResourceRootMutation {
    display_name: Option<String>,
    root_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserResourceRootDelete {
    root_path: String,
}

fn main() {
    let port = terminal_bridge_port().expect("terminal bridge port");
    let server = Server::http((HOST, port)).expect("terminal bridge server");
    let manager = Arc::new(TerminalManager::new());
    eprintln!("[terminal-bridge] listening on http://{HOST}:{port}");

    for request in server.incoming_requests() {
        let manager = Arc::clone(&manager);
        if let Err(error) = handle_request(request, manager) {
            eprintln!("[terminal-bridge] request failed: {error}");
        }
    }
}

fn terminal_bridge_port() -> Result<u16, String> {
    match std::env::var("RESEARCH_CANVAS_TERMINAL_BRIDGE_PORT") {
        Ok(value) => value.parse::<u16>().map_err(|error| {
            format!("invalid RESEARCH_CANVAS_TERMINAL_BRIDGE_PORT `{value}`: {error}")
        }),
        Err(std::env::VarError::NotPresent) => Ok(DEFAULT_PORT),
        Err(error) => Err(format!(
            "invalid RESEARCH_CANVAS_TERMINAL_BRIDGE_PORT: {error}"
        )),
    }
}

fn handle_request(
    mut request: tiny_http::Request,
    manager: Arc<TerminalManager>,
) -> Result<(), String> {
    let url = request.url().to_string();
    let path = url.split('?').next().unwrap_or(&url).to_string();
    let method = request.method().clone();

    if method == Method::Options {
        return respond_json(request, StatusCode(204), json!({}));
    }

    if method == Method::Get && path == "/workspace/bootstrap" {
        let database_path = session_database_path(&request);
        let payload = bootstrap_workspace_at(&database_path)?;
        return respond_json(request, StatusCode(200), payload);
    }

    if method == Method::Get && path == "/workspace/file-content" {
        let requested_path = query_param(&url, "path")
            .ok_or_else(|| "missing path query parameter".to_string())?;
        let content = std::fs::read_to_string(&requested_path).map_err(|error| error.to_string())?;
        return respond_json(request, StatusCode(200), json!({ "content": content }));
    }

    // Non-project-scoped routes
    if method == Method::Get && path == "/workspace/directories" {
        let dirs = list_directories_at()?;
        return respond_json(request, StatusCode(200), dirs);
    }

    if method == Method::Get && path == "/workspace/search" {
        let database_path = session_database_path(&request);
        let database_path = database_path.to_string_lossy().to_string();
        let project_id = query_param(&url, "projectId")
            .ok_or_else(|| "missing projectId query parameter".to_string())?;
        let query = query_param(&url, "q").unwrap_or_default();
        let limit = query_param(&url, "limit").and_then(|value| value.parse::<u32>().ok());

        rebuild_project_search_index_command(RebuildProjectSearchIndexRequest {
            database_path: database_path.clone(),
            project_id: project_id.clone(),
        })?;

        let hits = search_project_command(SearchProjectRequest {
            database_path,
            project_id,
            query,
            limit,
        })?;
        return respond_json(request, StatusCode(200), hits);
    }

    if let Some(project_id) = path.strip_prefix("/workspace/project/") {
        let (project_id, action) = match project_id.split_once('/') {
            Some((id, action)) => (id.to_string(), action.to_string()),
            None => (project_id.to_string(), String::new()),
        };

        if method == Method::Get && action.is_empty() {
            let database_path = session_database_path(&request);
            let payload = load_project_document_at(&database_path, &project_id)?;
            return respond_json(request, StatusCode(200), payload);
        }

        if method == Method::Get && action == "resource-roots" {
            let database_path = session_database_path(&request)
                .to_string_lossy()
                .to_string();
            let payload = list_project_resource_roots_at(ResourceRootLookupRequest {
                database_path,
                project_id,
            })?;
            return respond_json(request, StatusCode(200), payload);
        }

        if method == Method::Post && action == "persist" {
            let database_path = session_database_path(&request)
                .to_string_lossy()
                .to_string();
            let body = match read_body(&mut request) {
                Ok(body) => body,
                Err(error) => return respond_error(request, StatusCode(400), &error),
            };
            let mut payload: PersistProjectDocumentRequest = match serde_json::from_str(&body) {
                Ok(payload) => payload,
                Err(error) => {
                    return respond_error(request, StatusCode(400), &error.to_string())
                }
            };
            payload.database_path = database_path;
            payload.project_id = project_id;

            return match persist_project_document_at(payload) {
                Ok(persisted) => respond_json(request, StatusCode(200), persisted),
                Err(error) => respond_error(request, StatusCode(500), &error),
            };
        }

        if method == Method::Post && action == "resource-roots" {
            let database_path = session_database_path(&request)
                .to_string_lossy()
                .to_string();
            let body = read_body(&mut request)?;
            let payload: BrowserResourceRootMutation =
                serde_json::from_str(&body).map_err(|error| error.to_string())?;
            let attached = attach_project_resource_root_at(ResourceRootMutationRequest {
                database_path,
                project_id,
                root_path: payload.root_path,
                display_name: payload.display_name,
            })?;
            return respond_json(request, StatusCode(200), attached);
        }

        if method == Method::Delete && action == "resource-roots" {
            let database_path = session_database_path(&request)
                .to_string_lossy()
                .to_string();
            let body = read_body(&mut request)?;
            let payload: BrowserResourceRootDelete =
                serde_json::from_str(&body).map_err(|error| error.to_string())?;
            detach_project_resource_root_at(ResourceRootMutationRequest {
                database_path,
                project_id,
                root_path: payload.root_path,
                display_name: None,
            })?;
            return respond_json(request, StatusCode(200), json!({ "ok": true }));
        }

        if method == Method::Get && action == "sequences" {
            let database_path = session_database_path(&request).to_string_lossy().to_string();
            let payload = list_saved_sequences_command(ListSavedSequencesRequest {
                database_path,
                canvas_id: query_param(&url, "canvasId").unwrap_or_default(),
            }).map_err(|e| e.to_string())?;
            return respond_json(request, StatusCode(200), payload);
        }

        if method == Method::Post && action == "sequences" {
            let database_path = session_database_path(&request).to_string_lossy().to_string();
            let body = read_body(&mut request)?;
            let input: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
            let payload = create_saved_sequence_command(CreateSavedSequenceRequest {
                database_path,
                project_id: project_id.clone(),
                canvas_id: input["canvasId"].as_str().unwrap_or_default().to_string(),
                name: input["name"].as_str().unwrap_or("Untitled").to_string(),
            }).map_err(|e| e.to_string())?;
            return respond_json(request, StatusCode(201), payload);
        }
    }

    if let Some(sequence_id) = path.strip_prefix("/workspace/project/sequences/") {
        let sequence_id = sequence_id.to_string();

        if method == Method::Put {
            let database_path = session_database_path(&request).to_string_lossy().to_string();
            let body = read_body(&mut request)?;
            let input: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
            let edge_ids: Vec<String> = input["edgeIds"]
                .as_array()
                .unwrap_or(&vec![])
                .iter()
                .filter_map(|v| v.as_str().map(ToOwned::to_owned))
                .collect();
            let payload = update_saved_sequence_command(UpdateSavedSequenceRequest {
                database_path,
                id: sequence_id,
                name: input["name"].as_str().unwrap_or("Untitled").to_string(),
                root_node_id: input["rootNodeId"].as_str().map(ToOwned::to_owned),
                edge_ids,
            }).map_err(|e| e.to_string())?;
            return respond_json(request, StatusCode(200), payload);
        }

        if method == Method::Delete {
            let database_path = session_database_path(&request).to_string_lossy().to_string();
            delete_saved_sequence_command(DeleteSavedSequenceRequest {
                database_path,
                id: sequence_id,
            }).map_err(|e| e.to_string())?;
            return respond_json(request, StatusCode(200), json!({ "ok": true }));
        }
    }

    if method == Method::Post && path == "/terminal/session" {
        let body = read_body(&mut request)?;
        let payload: BrowserTerminalRequest = if body.is_empty() {
            BrowserTerminalRequest { workdir: None }
        } else {
            serde_json::from_str(&body).map_err(|error| error.to_string())?
        };

        let workdir = payload
            .workdir
            .map(std::path::PathBuf::from)
            .unwrap_or_else(TerminalManager::current_workdir);
        let session = manager
            .create_session(workdir)
            .map_err(|error| error.to_string())?;
        return respond_json(request, StatusCode(200), session);
    }

    if let Some(session_id) = path.strip_prefix("/terminal/session/") {
        let (session_id, action) = match session_id.split_once('/') {
            Some((id, action)) => (id.to_string(), action.to_string()),
            None => (session_id.to_string(), String::new()),
        };

        if method == Method::Get && action == "output" {
            let cursor = url
                .split('?')
                .nth(1)
                .and_then(|query| {
                    query.split('&').find_map(|pair| {
                        let (key, value) = pair.split_once('=')?;
                        if key == "cursor" {
                            value.parse::<usize>().ok()
                        } else {
                            None
                        }
                    })
                })
                .unwrap_or(0);
            let (chunks, next_cursor) = manager
                .output_since(&session_id, cursor)
                .map_err(|error| error.to_string())?;
            return respond_json(
                request,
                StatusCode(200),
                json!({ "chunks": chunks, "nextCursor": next_cursor }),
            );
        }

        let body = read_body(&mut request)?;

        if method == Method::Post && action == "input" {
            let payload: BrowserTerminalInput = if body.is_empty() {
                BrowserTerminalInput { input: None }
            } else {
                serde_json::from_str(&body).map_err(|error| error.to_string())?
            };
            manager
                .send_input(&session_id, payload.input.as_deref().unwrap_or(""))
                .map_err(|error| error.to_string())?;
            return respond_json(request, StatusCode(200), json!({ "ok": true }));
        }

        if method == Method::Post && action == "resize" {
            let payload: BrowserTerminalResize = if body.is_empty() {
                BrowserTerminalResize {
                    columns: None,
                    rows: None,
                }
            } else {
                serde_json::from_str(&body).map_err(|error| error.to_string())?
            };
            let columns = payload.columns.unwrap_or(120);
            let rows = payload.rows.unwrap_or(32);
            manager
                .resize_session(&session_id, columns, rows)
                .map_err(|error| error.to_string())?;
            return respond_json(request, StatusCode(200), json!({ "ok": true }));
        }

        if method == Method::Delete && action == "close" {
            manager
                .close_session(&session_id)
                .map_err(|error| error.to_string())?;
            return respond_json(request, StatusCode(200), json!({ "closed": true }));
        }
    }

    respond_json(request, StatusCode(404), json!({ "error": "Not found" }))
}

fn read_body(request: &mut tiny_http::Request) -> Result<String, String> {
    let mut body = String::new();
    request
        .as_reader()
        .read_to_string(&mut body)
        .map_err(|error| error.to_string())?;
    Ok(body)
}

fn respond_json<T: serde::Serialize>(
    request: tiny_http::Request,
    status: StatusCode,
    payload: T,
) -> Result<(), String> {
    let body = serde_json::to_string(&payload).map_err(|error| error.to_string())?;
    let response = Response::from_string(body)
        .with_status_code(status)
        .with_header(header("Content-Type", "application/json; charset=utf-8"))
        .with_header(header("Access-Control-Allow-Origin", "*"))
        .with_header(header(
            "Access-Control-Allow-Methods",
            "GET,POST,PUT,DELETE,OPTIONS",
        ))
        .with_header(header(
            "Access-Control-Allow-Headers",
            "Content-Type, X-Research-Canvas-Session",
        ));
    request.respond(response).map_err(|error| error.to_string())
}

fn respond_error(
    request: tiny_http::Request,
    status: StatusCode,
    error: &str,
) -> Result<(), String> {
    respond_json(request, status, json!({ "error": error }))
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("valid header")
}

fn session_database_path(request: &tiny_http::Request) -> std::path::PathBuf {
    let session_id = request
        .headers()
        .iter()
        .find_map(|header| {
            if header.field.equiv("X-Research-Canvas-Session") {
                Some(header.value.as_str().to_string())
            } else {
                None
            }
        })
        .or_else(|| query_param(request.url(), "sessionId"));

    default_database_path(session_id.as_deref())
}

fn query_param(url: &str, key: &str) -> Option<String> {
    url.split('?').nth(1).and_then(|query| {
        query.split('&').find_map(|pair| {
            let (candidate, value) = pair.split_once('=')?;
            if candidate == key {
                decode_query_component(value)
            } else {
                None
            }
        })
    })
}

fn decode_query_component(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        match bytes[index] {
            b'%' if index + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).ok()?;
                let byte = u8::from_str_radix(hex, 16).ok()?;
                decoded.push(byte);
                index += 3;
            }
            b'+' => {
                decoded.push(b' ');
                index += 1;
            }
            byte => {
                decoded.push(byte);
                index += 1;
            }
        }
    }

    String::from_utf8(decoded).ok()
}

#[cfg(test)]
mod tests {
    use super::query_param;

    #[test]
    fn query_param_decodes_percent_encoded_paths() {
        let value = query_param(
            "/workspace/file-content?path=%2Ftmp%2FMy%20Project%2FREADME.md",
            "path",
        );

        assert_eq!(value.as_deref(), Some("/tmp/My Project/README.md"));
    }
}

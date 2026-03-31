use std::sync::Arc;

use research_canvas_desktop_lib::{
    commands::{
        projects::{
            attach_project_resource_root_at, bootstrap_workspace_at, default_database_path,
            detach_project_resource_root_at, list_project_resource_roots_at,
            load_project_document_at, persist_project_document_at, PersistProjectDocumentRequest,
            ResourceRootLookupRequest, ResourceRootMutationRequest,
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
const PORT: u16 = 4789;

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
    let server = Server::http((HOST, PORT)).expect("terminal bridge server");
    let manager = Arc::new(TerminalManager::new());
    eprintln!("[terminal-bridge] listening on http://{HOST}:{PORT}");

    for request in server.incoming_requests() {
        let manager = Arc::clone(&manager);
        if let Err(error) = handle_request(request, manager) {
            eprintln!("[terminal-bridge] request failed: {error}");
        }
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
            let body = read_body(&mut request)?;
            let mut payload: PersistProjectDocumentRequest =
                serde_json::from_str(&body).map_err(|error| error.to_string())?;
            payload.database_path = database_path;
            payload.project_id = project_id;

            let persisted = persist_project_document_at(payload)?;
            return respond_json(request, StatusCode(200), persisted);
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
            "GET,POST,DELETE,OPTIONS",
        ))
        .with_header(header(
            "Access-Control-Allow-Headers",
            "Content-Type, X-Research-Canvas-Session",
        ));
    request.respond(response).map_err(|error| error.to_string())
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
                Some(value.replace("%20", " "))
            } else {
                None
            }
        })
    })
}

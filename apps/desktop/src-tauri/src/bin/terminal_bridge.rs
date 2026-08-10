use std::sync::Arc;

use research_canvas_desktop_lib::{
    commands::{
        constellations::{
            attach_constellation_resource_root_at, bootstrap_workspace_at,
            create_project_at, create_saved_sequence_command, default_database_path,
            delete_saved_sequence_command, detach_constellation_resource_root_at,
            list_constellation_resource_roots_at, list_directories_at, list_saved_sequences_command,
            load_constellation_document_at, persist_constellation_document_at,
            resolve_or_create_home_at, update_saved_sequence_command, ActiveProjectPayload,
            CreateProjectRequest, CreateSavedSequenceRequest, DeleteSavedSequenceRequest,
            ListSavedSequencesRequest, PersistConstellationDocumentRequest, ResourceRootLookupRequest,
            ResourceRootMutationRequest, SetActiveProjectRequest, UpdateSavedSequenceRequest,
        },
        scenes::{
            delete_scene_at, delete_scene_sequence_at, list_scene_sequences_at, list_scenes_at,
            upsert_scene_at, upsert_scene_sequence_at,
        },
        geography_edges::{
            delete_geography_edge_at, list_geography_edges_at, upsert_geography_edge_at,
        },
        street_view::{
            add_manual_street_view_region_at, apply_street_view_redaction_at,
            list_street_view_images_at, mark_street_view_redaction_none_needed_at,
            register_street_view_image_at, stage_street_view_image_at,
        },
        fetch_asset::{ingest_fetched_asset_at, list_fetch_records_at, IngestFetchedAssetRequest},
        keepsake::write_keepsake_bundle_at,
        palace::{load_palace_curation_at, save_palace_curation_at},
        palace_export::write_palace_bundle_at,
        palace_graph::{load_palace_graph_at, merge_encapsulation_edges, LoadPalaceGraphRequest},
        layout::{flush_canvas_layout_at, FlushCanvasLayoutRequest},
        search::{
            rebuild_constellation_search_index_command, search_constellation_command,
            RebuildConstellationSearchIndexRequest, SearchConstellationRequest,
        },
        timeline::{
            expand_timeline_node_at_path, load_timeline_view_at_path, merge_relationships_by_canonical_key,
            upsert_timeline_layout_at_path, ExpandTimelineNodeRequest, LoadTimelineViewRequest,
            UpsertTimelineLayoutRequest,
        },
        graph::{
            connect_graph_nodes_locally_at_path, update_node_metadata_at_path,
            ConnectGraphNodesRequest, UpdateGraphNodeRequest,
        },
    },
    db::{
        canvas_service::CanvasService,
        connection::Database,
        neo4j::{self, config::Neo4jConfig},
        repositories::{
            graph::GraphRepository, ConstellationRepository, SceneRecord, SceneSequenceRecord,
            StreetViewImageRecord, StreetViewRegion,
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

#[derive(Clone)]
struct BridgeGraphState {
    graph: neo4j::SharedGraph,
    database: String,
    runtime: Arc<tokio::runtime::Runtime>,
}

fn main() {
    let port = terminal_bridge_port().expect("terminal bridge port");
    let server = Server::http((HOST, port)).expect("terminal bridge server");
    let manager = Arc::new(TerminalManager::new());
    let graph_state = Arc::new(init_graph_state());
    eprintln!("[terminal-bridge] listening on http://{HOST}:{port}");

    for request in server.incoming_requests() {
        let manager = Arc::clone(&manager);
        let graph_state = Arc::clone(&graph_state);
        if let Err(error) = handle_request(request, manager, graph_state) {
            eprintln!("[terminal-bridge] request failed: {error}");
        }
    }
}

fn init_graph_state() -> Option<BridgeGraphState> {
    let runtime = Arc::new(
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .ok()?,
    );
    let config = Neo4jConfig::from_env().ok()?;
    let database = config.database.clone();
    let graph = runtime.block_on(neo4j::connect(&config)).ok()?;
    let repo = GraphRepository::new(graph.clone(), database.clone());
    let _ = runtime.block_on(repo.ensure_schema());
    Some(BridgeGraphState {
        graph,
        database,
        runtime,
    })
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
    graph_state: Arc<Option<BridgeGraphState>>,
) -> Result<(), String> {
    let url = request.url().to_string();
    let path = url.split('?').next().unwrap_or(&url).to_string();
    let method = request.method().clone();

    if method == Method::Options {
        return respond_json(request, StatusCode(204), json!({}));
    }

    if method == Method::Get && path == "/workspace/bootstrap" {
        let database_path = session_database_path(&request)?;
        let payload = bootstrap_workspace_at(&database_path)?;
        return respond_json(request, StatusCode(200), payload);
    }

    if method == Method::Get && path == "/workspace/home" {
        let database_path = match query_param(&url, "databasePath") {
            Some(path) if !path.trim().is_empty() => path,
            _ => session_database_path(&request)?.to_string_lossy().to_string(),
        };
        let home_path = query_param(&url, "homePath");
        let payload = resolve_or_create_home_at(&database_path, home_path.as_deref())?;
        return respond_json(request, StatusCode(200), payload);
    }

    if method == Method::Post && path == "/workspace/projects" {
        let body = read_body(&mut request)?;
        let project_request: CreateProjectRequest =
            serde_json::from_str(&body).map_err(|error| error.to_string())?;
        let payload = create_project_at(project_request)?;
        return respond_json(request, StatusCode(200), payload);
    }

    if method == Method::Post && path == "/workspace/project" {
        let body = read_body(&mut request)?;
        let project_request: SetActiveProjectRequest =
            serde_json::from_str(&body).map_err(|error| error.to_string())?;
        let database = Database::open(std::path::PathBuf::from(&project_request.database_path))
            .map_err(|error| error.to_string())?;
        let constellation = ConstellationRepository::new(database.connection())
            .get_by_id(&project_request.project_id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| format!("project {} not found", project_request.project_id))?;
        let payload = ActiveProjectPayload {
            project_id: constellation.id,
            profile_scope: constellation.profile_scope,
            root_type: constellation.root_type,
        };
        return respond_json(request, StatusCode(200), payload);
    }

    if method == Method::Get && path == "/workspace/file-content" {
        let requested_path =
            query_param(&url, "path").ok_or_else(|| "missing path query parameter".to_string())?;
        let content =
            std::fs::read_to_string(&requested_path).map_err(|error| error.to_string())?;
        return respond_json(request, StatusCode(200), json!({ "content": content }));
    }

    // Non-constellation-scoped routes
    if method == Method::Get && path == "/workspace/directories" {
        let dirs = list_directories_at()?;
        return respond_json(request, StatusCode(200), dirs);
    }

    if method == Method::Get && path == "/workspace/search" {
        let database_path = session_database_path(&request)?;
        let database_path = database_path.to_string_lossy().to_string();
        let constellation_id = query_param(&url, "constellationId")
            .ok_or_else(|| "missing constellationId query parameter".to_string())?;
        let query = query_param(&url, "q").unwrap_or_default();
        let limit = query_param(&url, "limit").and_then(|value| value.parse::<u32>().ok());

        rebuild_constellation_search_index_command(RebuildConstellationSearchIndexRequest {
            database_path: database_path.clone(),
            constellation_id: constellation_id.clone(),
        })?;

        let hits = search_constellation_command(SearchConstellationRequest {
            database_path,
            constellation_id,
            query,
            limit,
        })?;
        return respond_json(request, StatusCode(200), hits);
    }

    if method == Method::Post && path == "/workspace/canvas/layout" {
        let body = read_body(&mut request)?;
        let mut input: FlushCanvasLayoutRequest =
            serde_json::from_str(&body).map_err(|error| error.to_string())?;
        input.database_path = session_database_path(&request)?
            .to_string_lossy()
            .to_string();
        let payload = flush_canvas_layout_at(input)?;
        return respond_json(request, StatusCode(200), payload);
    }

    // Profile-level scene and scene-sequence routes (vision §3.7/§3.15):
    // the same wire records the Tauri commands use, served over the dev
    // bridge so the browser build can author and read scenes.
    if method == Method::Get && path == "/workspace/scenes" {
        let database_path = session_database_path(&request)?
            .to_string_lossy()
            .to_string();
        let profile_scope = query_param(&url, "profileScope")
            .ok_or_else(|| "missing profileScope query parameter".to_string())?;
        let payload = list_scenes_at(&database_path, &profile_scope)?;
        return respond_json(request, StatusCode(200), payload);
    }

    if method == Method::Post && path == "/workspace/scenes" {
        let database_path = session_database_path(&request)?
            .to_string_lossy()
            .to_string();
        let body = read_body(&mut request)?;
        let scene: SceneRecord =
            serde_json::from_str(&body).map_err(|error| error.to_string())?;
        let payload = upsert_scene_at(&database_path, scene)?;
        return respond_json(request, StatusCode(200), payload);
    }

    if let Some(scene_id) = path.strip_prefix("/workspace/scenes/") {
        if method == Method::Get {
            let database_path = session_database_path(&request)?
                .to_string_lossy()
                .to_string();
            let payload = research_canvas_desktop_lib::commands::scenes::get_scene_at(
                &database_path,
                scene_id,
            )?;
            return respond_json(request, StatusCode(200), payload);
        }
        if method == Method::Delete {
            let database_path = session_database_path(&request)?
                .to_string_lossy()
                .to_string();
            delete_scene_at(&database_path, scene_id)?;
            return respond_json(request, StatusCode(200), json!({ "ok": true }));
        }
    }

    if method == Method::Get && path == "/workspace/scene-sequences" {
        let database_path = session_database_path(&request)?
            .to_string_lossy()
            .to_string();
        let profile_scope = query_param(&url, "profileScope")
            .ok_or_else(|| "missing profileScope query parameter".to_string())?;
        let payload = list_scene_sequences_at(&database_path, &profile_scope)?;
        return respond_json(request, StatusCode(200), payload);
    }

    if method == Method::Post && path == "/workspace/scene-sequences" {
        let database_path = session_database_path(&request)?
            .to_string_lossy()
            .to_string();
        let body = read_body(&mut request)?;
        let sequence: SceneSequenceRecord =
            serde_json::from_str(&body).map_err(|error| error.to_string())?;
        let payload = upsert_scene_sequence_at(&database_path, sequence)?;
        return respond_json(request, StatusCode(200), payload);
    }

    if let Some(sequence_id) = path.strip_prefix("/workspace/scene-sequences/") {
        if method == Method::Delete {
            let database_path = session_database_path(&request)?
                .to_string_lossy()
                .to_string();
            delete_scene_sequence_at(&database_path, sequence_id)?;
            return respond_json(request, StatusCode(200), json!({ "ok": true }));
        }
    }

    // Geography-edge routes (refinement-2 D2, ticket #19): surface-layer
    // movement streams, the same wire records the Tauri commands use, served
    // over the dev bridge so the browser build can seed and read lanes.
    if method == Method::Get && path == "/workspace/geography-edges" {
        let database_path = session_database_path(&request)?
            .to_string_lossy()
            .to_string();
        let profile_scope = query_param(&url, "profileScope")
            .ok_or_else(|| "missing profileScope query parameter".to_string())?;
        let payload = list_geography_edges_at(&database_path, &profile_scope)?;
        return respond_json(request, StatusCode(200), payload);
    }

    if method == Method::Post && path == "/workspace/geography-edges" {
        let database_path = session_database_path(&request)?
            .to_string_lossy()
            .to_string();
        let body = read_body(&mut request)?;
        let edge: research_canvas_desktop_lib::db::repositories::GeographyEdgeRecord =
            serde_json::from_str(&body).map_err(|error| error.to_string())?;
        let payload = upsert_geography_edge_at(&database_path, edge)?;
        return respond_json(request, StatusCode(200), payload);
    }

    if let Some(edge_id) = path.strip_prefix("/workspace/geography-edges/") {
        if method == Method::Delete {
            let database_path = session_database_path(&request)?
                .to_string_lossy()
                .to_string();
            delete_geography_edge_at(&database_path, edge_id)?;
            return respond_json(request, StatusCode(200), json!({ "ok": true }));
        }
    }

    // Street-view imagery routes: own captured imagery (portable relative
    // paths inside the media root) plus the local redaction pipeline.
    if method == Method::Get && path == "/workspace/street-view" {
        let database_path = session_database_path(&request)?
            .to_string_lossy()
            .to_string();
        let profile_scope = query_param(&url, "profileScope")
            .ok_or_else(|| "missing profileScope query parameter".to_string())?;
        let payload = list_street_view_images_at(&database_path, &profile_scope)?;
        return respond_json(request, StatusCode(200), payload);
    }

    if method == Method::Post && path == "/workspace/street-view" {
        let database_path = session_database_path(&request)?
            .to_string_lossy()
            .to_string();
        let body = read_body(&mut request)?;
        let input: serde_json::Value =
            serde_json::from_str(&body).map_err(|error| error.to_string())?;
        let media_root = input["mediaRoot"]
            .as_str()
            .ok_or_else(|| "missing mediaRoot".to_string())?;
        let image: StreetViewImageRecord = serde_json::from_value(
            input["image"].clone(),
        )
        .map_err(|error| error.to_string())?;
        let payload = register_street_view_image_at(&database_path, media_root, image)?;
        return respond_json(request, StatusCode(201), payload);
    }

    if method == Method::Post && path == "/workspace/street-view/stage" {
        let file_name = query_param(&url, "fileName")
            .ok_or_else(|| "missing fileName query parameter".to_string())?;
        let profile_scope = query_param(&url, "profileScope")
            .ok_or_else(|| "missing profileScope query parameter".to_string())?;
        let media_root = query_param(&url, "mediaRoot")
            .ok_or_else(|| "missing mediaRoot query parameter".to_string())?;
        let bytes = read_body_bytes(&mut request)?;
        let payload = stage_street_view_image_at(&media_root, &profile_scope, &file_name, &bytes)?;
        return respond_json(request, StatusCode(201), payload);
    }

    if let Some(street_view_path) = path.strip_prefix("/workspace/street-view/") {
        let (id, action) = match street_view_path.split_once('/') {
            Some((id, action)) => (id.to_string(), action.to_string()),
            None => (street_view_path.to_string(), String::new()),
        };
        let database_path = session_database_path(&request)?
            .to_string_lossy()
            .to_string();

        if method == Method::Post && action == "regions" {
            let body = read_body(&mut request)?;
            let input: serde_json::Value =
                serde_json::from_str(&body).map_err(|error| error.to_string())?;
            let region: StreetViewRegion = serde_json::from_value(input["region"].clone())
                .map_err(|error| error.to_string())?;
            let payload = add_manual_street_view_region_at(&database_path, &id, region)?;
            return respond_json(request, StatusCode(200), payload);
        }

        if method == Method::Post && action == "redact" {
            let body = read_body(&mut request)?;
            let input: serde_json::Value =
                serde_json::from_str(&body).map_err(|error| error.to_string())?;
            let media_root = input["mediaRoot"]
                .as_str()
                .ok_or_else(|| "missing mediaRoot".to_string())?;
            let payload = apply_street_view_redaction_at(&database_path, media_root, &id)?;
            return respond_json(request, StatusCode(200), payload);
        }

        if method == Method::Post && action == "none-needed" {
            let payload = mark_street_view_redaction_none_needed_at(&database_path, &id)?;
            return respond_json(request, StatusCode(200), payload);
        }
    }

    if method == Method::Get && path == "/workspace/fetch-records" {
        let database_path = session_database_path(&request)?
            .to_string_lossy()
            .to_string();
        let profile_scope = query_param(&url, "profileScope")
            .ok_or_else(|| "missing profileScope query parameter".to_string())?;
        let payload = list_fetch_records_at(&database_path, &profile_scope)?;
        return respond_json(request, StatusCode(200), payload);
    }

    if method == Method::Post && path == "/workspace/fetch-records/ingest" {
        let session_database = session_database_path(&request)?;
        let body = read_body(&mut request)?;
        let mut input: IngestFetchedAssetRequest =
            serde_json::from_str(&body).map_err(|error| error.to_string())?;
        if input.database_path.trim().is_empty() {
            input.database_path = session_database.to_string_lossy().to_string();
        }
        let payload = ingest_fetched_asset_at(&input)?;
        let accepted = payload.validation.all_ok() && !payload.artifact_path.is_empty();
        let status = if accepted {
            StatusCode(201)
        } else {
            StatusCode(422)
        };
        return respond_json(request, status, payload);
    }

    if method == Method::Post && path == "/workspace/keepsake" {
        let body = read_body(&mut request)?;
        let input: serde_json::Value =
            serde_json::from_str(&body).map_err(|error| error.to_string())?;
        let output_dir = input["outputDir"]
            .as_str()
            .ok_or_else(|| "missing outputDir".to_string())?;
        let media_root = input["mediaRoot"]
            .as_str()
            .ok_or_else(|| "missing mediaRoot".to_string())?;
        let manifest_json = input["manifestJson"]
            .as_str()
            .ok_or_else(|| "missing manifestJson".to_string())?;
        let payload = write_keepsake_bundle_at(output_dir, media_root, manifest_json)?;
        return respond_json(request, StatusCode(200), payload);
    }

    if method == Method::Post && path == "/workspace/palace-bundle" {
        let body = read_body(&mut request)?;
        let input: serde_json::Value =
            serde_json::from_str(&body).map_err(|error| error.to_string())?;
        let output_dir = input["outputDir"]
            .as_str()
            .ok_or_else(|| "missing outputDir".to_string())?;
        let bundle_json = input["bundleJson"]
            .as_str()
            .ok_or_else(|| "missing bundleJson".to_string())?;
        let payload = write_palace_bundle_at(output_dir, bundle_json)?;
        return respond_json(request, StatusCode(200), payload);
    }

    if method == Method::Post && path == "/workspace/palace-graph" {
        let body = read_body(&mut request)?;
        let input: LoadPalaceGraphRequest =
            serde_json::from_str(&body).map_err(|error| error.to_string())?;
        let database_path = session_database_path(&request)?
            .to_string_lossy()
            .to_string();
        let mut view = load_palace_graph_at(&database_path, input)?;
        if let Some(graph_state) = graph_state.as_ref() {
            let repo =
                GraphRepository::new(graph_state.graph.clone(), graph_state.database.clone());
            let remote = graph_state.runtime.block_on(repo.list_encapsulation_edges())?;
            view.encapsulation_edges =
                merge_encapsulation_edges(view.encapsulation_edges, remote);
        }
        return respond_json(request, StatusCode(200), view);
    }

    if method == Method::Get && path == "/workspace/palace-curation" {
        let database_path = session_database_path(&request)?
            .to_string_lossy()
            .to_string();
        let profile_scope = query_param(&url, "profileScope")
            .ok_or_else(|| "missing profileScope query parameter".to_string())?;
        let payload = load_palace_curation_at(&database_path, &profile_scope)?;
        return respond_json(request, StatusCode(200), payload);
    }

    if method == Method::Post && path == "/workspace/palace-curation" {
        let database_path = session_database_path(&request)?
            .to_string_lossy()
            .to_string();
        let body = read_body(&mut request)?;
        let input: serde_json::Value =
            serde_json::from_str(&body).map_err(|error| error.to_string())?;
        let profile_scope = input["profileScope"]
            .as_str()
            .ok_or_else(|| "missing profileScope".to_string())?;
        let curation = input["curation"].clone();
        let payload = save_palace_curation_at(&database_path, profile_scope, curation)?;
        return respond_json(request, StatusCode(200), payload);
    }

    if method == Method::Get && path == "/graph/canvas-view" {
        let graph_state = match graph_state.as_ref() {
            Some(state) => state,
            None => return respond_error(request, StatusCode(503), "Neo4j is not configured"),
        };
        let canvas_id = query_param(&url, "canvasId")
            .ok_or_else(|| "missing canvasId query parameter".to_string())?;
        let lens = query_param(&url, "lens").unwrap_or_else(|| "canvas".to_string());
        let database_path = session_database_path(&request)?
            .to_string_lossy()
            .to_string();
        let repo = GraphRepository::new(graph_state.graph.clone(), graph_state.database.clone());
        let service = CanvasService::new(repo, database_path);
        let payload = graph_state
            .runtime
            .block_on(service.load_canvas_view(&canvas_id, &lens))?;
        return respond_json(request, StatusCode(200), payload);
    }

    if method == Method::Post && path == "/graph/timeline-view" {
        let body = read_body(&mut request)?;
        let input: LoadTimelineViewRequest =
            serde_json::from_str(&body).map_err(|error| error.to_string())?;
        let payload = load_timeline_view_at_path(session_database_path(&request)?, input)?;
        return respond_json(request, StatusCode(200), payload);
    }

    if method == Method::Post && path == "/graph/timeline-expand" {
        let body = read_body(&mut request)?;
        let input: ExpandTimelineNodeRequest =
            serde_json::from_str(&body).map_err(|error| error.to_string())?;
        let database_path = session_database_path(&request)?;
        let mut view =
            expand_timeline_node_at_path(&database_path, &input.workspace_id, &input.graph_node_id)?;
        // Opportunistic remote enrichment: a configured live graph merges its
        // authoritative edges over the offline projection (ticket #28 D13
        // §4.4). The local projection alone remains a complete offline answer.
        if let Some(graph_state) = graph_state.as_ref() {
            let repo =
                GraphRepository::new(graph_state.graph.clone(), graph_state.database.clone());
            if let Ok(remote) = graph_state
                .runtime
                .block_on(repo.relationships_for_node(&input.graph_node_id))
            {
                view.edges =
                    merge_relationships_by_canonical_key(std::mem::take(&mut view.edges), remote);
                let known_ids = view
                    .neighbours
                    .iter()
                    .map(|node| node.graph_node_id.clone())
                    .collect::<std::collections::BTreeSet<_>>();
                let missing_ids = view
                    .edges
                    .iter()
                    .flat_map(|relationship| {
                        [
                            relationship.source_graph_node_id.clone(),
                            relationship.target_graph_node_id.clone(),
                        ]
                    })
                    .filter(|node_id| *node_id != input.graph_node_id && !known_ids.contains(node_id))
                    .collect::<std::collections::BTreeSet<_>>();
                if !missing_ids.is_empty() {
                    if let Ok(nodes) = graph_state
                        .runtime
                        .block_on(repo.get_nodes(&missing_ids.into_iter().collect::<Vec<_>>()))
                    {
                        view.neighbours.extend(nodes);
                    }
                }
            }
        }
        return respond_json(request, StatusCode(200), view);
    }

    if method == Method::Post && path == "/graph/timeline-layout" {
        let body = read_body(&mut request)?;
        let input: UpsertTimelineLayoutRequest =
            serde_json::from_str(&body).map_err(|error| error.to_string())?;
        let payload = upsert_timeline_layout_at_path(session_database_path(&request)?, input)?;
        return respond_json(request, StatusCode(200), payload);
    }

    if method == Method::Post && path == "/graph/node/update" {
        let body = read_body(&mut request)?;
        let input: UpdateGraphNodeRequest =
            serde_json::from_str(&body).map_err(|error| error.to_string())?;
        let payload = update_node_metadata_at_path(session_database_path(&request)?, &input)?;
        return respond_json(request, StatusCode(200), payload);
    }

    if method == Method::Post && path == "/graph/connect" {
        let body = read_body(&mut request)?;
        let input: ConnectGraphNodesRequest =
            serde_json::from_str(&body).map_err(|error| error.to_string())?;
        let local = connect_graph_nodes_locally_at_path(session_database_path(&request)?, &input)?;
        return respond_json(request, StatusCode(200), local.relationship);
    }

    if method == Method::Get && path == "/graph/search" {
        let graph_state = match graph_state.as_ref() {
            Some(state) => state,
            None => return respond_error(request, StatusCode(503), "Neo4j is not configured"),
        };
        let query = query_param(&url, "query").unwrap_or_default();
        let limit = query_param(&url, "limit")
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap_or(25);
        let repo = GraphRepository::new(graph_state.graph.clone(), graph_state.database.clone());
        let payload = graph_state.runtime.block_on(repo.search(&query, limit))?;
        return respond_json(request, StatusCode(200), payload);
    }

    if let Some(graph_node_id) = path.strip_prefix("/graph/node/") {
        if method == Method::Get {
            let graph_state = match graph_state.as_ref() {
                Some(state) => state,
                None => return respond_error(request, StatusCode(503), "Neo4j is not configured"),
            };
            let decoded =
                decode_query_component(graph_node_id).unwrap_or_else(|| graph_node_id.to_string());
            let repo =
                GraphRepository::new(graph_state.graph.clone(), graph_state.database.clone());
            let payload = graph_state
                .runtime
                .block_on(repo.get_node(&decoded))?
                .ok_or_else(|| format!("graph node not found: {decoded}"))?;
            return respond_json(request, StatusCode(200), payload);
        }
    }

    if let Some(operator_graph_node_id) = path.strip_prefix("/graph/lighting/") {
        if method == Method::Get {
            let graph_state = match graph_state.as_ref() {
                Some(state) => state,
                None => return respond_error(request, StatusCode(503), "Neo4j is not configured"),
            };
            let decoded = decode_query_component(operator_graph_node_id)
                .unwrap_or_else(|| operator_graph_node_id.to_string());
            let repo =
                GraphRepository::new(graph_state.graph.clone(), graph_state.database.clone());
            let payload = graph_state
                .runtime
                .block_on(repo.archetypal_lighting(&decoded))?;
            return respond_json(request, StatusCode(200), payload);
        }
    }

    if let Some(graph_node_id) = path.strip_prefix("/graph/resonances/") {
        if method == Method::Get {
            let graph_state = match graph_state.as_ref() {
                Some(state) => state,
                None => return respond_error(request, StatusCode(503), "Neo4j is not configured"),
            };
            let decoded =
                decode_query_component(graph_node_id).unwrap_or_else(|| graph_node_id.to_string());
            let repo =
                GraphRepository::new(graph_state.graph.clone(), graph_state.database.clone());
            let payload = graph_state
                .runtime
                .block_on(repo.resonances_for_instance(&decoded))?;
            return respond_json(request, StatusCode(200), payload);
        }
    }

    if let Some(constellation_id) = path.strip_prefix("/workspace/constellation/") {
        let (constellation_id, action) = match constellation_id.split_once('/') {
            Some((id, action)) => (id.to_string(), action.to_string()),
            None => (constellation_id.to_string(), String::new()),
        };

        if method == Method::Get && action.is_empty() {
            let database_path = session_database_path(&request)?;
            let payload = load_constellation_document_at(&database_path, &constellation_id)?;
            return respond_json(request, StatusCode(200), payload);
        }

        if method == Method::Get && action == "resource-roots" {
            let database_path = session_database_path(&request)?
                .to_string_lossy()
                .to_string();
            let payload = list_constellation_resource_roots_at(ResourceRootLookupRequest {
                database_path,
                constellation_id,
            })?;
            return respond_json(request, StatusCode(200), payload);
        }

        if method == Method::Post && action == "persist" {
            let database_path = session_database_path(&request)?
                .to_string_lossy()
                .to_string();
            let body = match read_body(&mut request) {
                Ok(body) => body,
                Err(error) => return respond_error(request, StatusCode(400), &error),
            };
            let mut payload: PersistConstellationDocumentRequest = match serde_json::from_str(&body)
            {
                Ok(payload) => payload,
                Err(error) => return respond_error(request, StatusCode(400), &error.to_string()),
            };
            payload.database_path = database_path;
            payload.constellation_id = constellation_id;

            return match persist_constellation_document_at(payload) {
                Ok(persisted) => respond_json(request, StatusCode(200), persisted),
                Err(error) => respond_error(request, StatusCode(500), &error),
            };
        }

        if method == Method::Post && action == "resource-roots" {
            let database_path = session_database_path(&request)?
                .to_string_lossy()
                .to_string();
            let body = read_body(&mut request)?;
            let payload: BrowserResourceRootMutation =
                serde_json::from_str(&body).map_err(|error| error.to_string())?;
            let attached = attach_constellation_resource_root_at(ResourceRootMutationRequest {
                database_path,
                constellation_id,
                root_path: payload.root_path,
                display_name: payload.display_name,
            })?;
            return respond_json(request, StatusCode(200), attached);
        }

        if method == Method::Delete && action == "resource-roots" {
            let database_path = session_database_path(&request)?
                .to_string_lossy()
                .to_string();
            let body = read_body(&mut request)?;
            let payload: BrowserResourceRootDelete =
                serde_json::from_str(&body).map_err(|error| error.to_string())?;
            detach_constellation_resource_root_at(ResourceRootMutationRequest {
                database_path,
                constellation_id,
                root_path: payload.root_path,
                display_name: None,
            })?;
            return respond_json(request, StatusCode(200), json!({ "ok": true }));
        }

        if method == Method::Get && action == "sequences" {
            let database_path = session_database_path(&request)?
                .to_string_lossy()
                .to_string();
            let payload = list_saved_sequences_command(ListSavedSequencesRequest {
                database_path,
                canvas_id: query_param(&url, "canvasId").unwrap_or_default(),
            })
            .map_err(|e| e.to_string())?;
            return respond_json(request, StatusCode(200), payload);
        }

        if method == Method::Post && action == "sequences" {
            let database_path = session_database_path(&request)?
                .to_string_lossy()
                .to_string();
            let body = read_body(&mut request)?;
            let input: serde_json::Value =
                serde_json::from_str(&body).map_err(|e| e.to_string())?;
            let payload = create_saved_sequence_command(CreateSavedSequenceRequest {
                database_path,
                constellation_id: constellation_id.clone(),
                canvas_id: input["canvasId"].as_str().unwrap_or_default().to_string(),
                name: input["name"].as_str().unwrap_or("Untitled").to_string(),
            })
            .map_err(|e| e.to_string())?;
            return respond_json(request, StatusCode(201), payload);
        }
    }

    if let Some(sequence_id) = path.strip_prefix("/workspace/constellation/sequences/") {
        let sequence_id = sequence_id.to_string();

        if method == Method::Put {
            let database_path = session_database_path(&request)?
                .to_string_lossy()
                .to_string();
            let body = read_body(&mut request)?;
            let input: serde_json::Value =
                serde_json::from_str(&body).map_err(|e| e.to_string())?;
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
            })
            .map_err(|e| e.to_string())?;
            return respond_json(request, StatusCode(200), payload);
        }

        if method == Method::Delete {
            let database_path = session_database_path(&request)?
                .to_string_lossy()
                .to_string();
            delete_saved_sequence_command(DeleteSavedSequenceRequest {
                database_path,
                id: sequence_id,
            })
            .map_err(|e| e.to_string())?;
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

fn read_body_bytes(request: &mut tiny_http::Request) -> Result<Vec<u8>, String> {
    let mut body = Vec::new();
    request
        .as_reader()
        .read_to_end(&mut body)
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

fn session_database_path(request: &tiny_http::Request) -> Result<std::path::PathBuf, String> {
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

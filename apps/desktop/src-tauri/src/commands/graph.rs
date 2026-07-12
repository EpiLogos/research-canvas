// apps/desktop/src-tauri/src/commands/graph.rs
use serde::Deserialize;

use crate::db::{
    canvas_service::{CanvasService, CanvasView, NodeLayoutDto},
    connection::Database,
    neo4j::SharedGraph,
    repositories::{
        graph::{
            ArchetypalLightingResult, ClaimKind, ContentOrigin, EntityType, EvidenceStatus,
            GraphContentCasInput, GraphContentCasMutation, GraphNode, GraphNodePatch,
            GraphRelationship, GraphRepository, Historicity, LitInstance, NewGraphNode,
            NewGraphNodeMetadata, PlaceCoverage, QlArc, QlCompletenessStatus, QlForm, QlTopology,
            TemporalPrecision, TemporalRole,
        },
        layout::{CanvasAppStateRecord, EdgeLayoutRecord, LayoutRepository, NodeLayoutRecord},
    },
};
use crate::SharedApiState;

/// Tauri managed state: the shared bolt pool, active database name, and a
/// long-lived tokio runtime handle. The `Handle` is exposed so the `:9876`
/// server thread (Task 15 / WS6) can `block_on` async graph reads off the
/// shared pool without spinning up — and dropping — a throwaway runtime.
#[derive(Clone)]
pub struct SharedGraphState {
    pub graph: SharedGraph,
    pub database: String,
    pub runtime: tokio::runtime::Handle,
}

fn repo(state: &tauri::State<SharedGraphState>) -> GraphRepository {
    GraphRepository::new(state.graph.clone(), state.database.clone())
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

// ---- Request payloads (camelCase to match the TS transport) ----

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadGraphNodeRequest {
    pub graph_node_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGraphNodeRequest {
    /// Optional client-supplied graph_node_id (WS4a Task 1). When absent,
    /// the repository mints a fresh UUIDv4 (existing callers unaffected).
    #[serde(default)]
    pub graph_node_id: Option<String>,
    pub entity_type: EntityType,
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub coordinate: Option<String>,
    #[serde(default)]
    pub source_coordinates: Vec<String>,
    #[serde(default)]
    pub evidence_tags: Vec<String>,
    #[serde(default)]
    pub source_kind: Option<String>,
    #[serde(default)]
    pub content_origin: Option<ContentOrigin>,
    #[serde(default)]
    pub content_revision: Option<i64>,
    #[serde(default)]
    pub seed_schema_version: Option<i64>,
    #[serde(default)]
    pub body_source_coordinates: Vec<String>,
    #[serde(default)]
    pub historicity: Option<Historicity>,
    #[serde(default)]
    pub claim_kind: Option<ClaimKind>,
    #[serde(default)]
    pub evidence_status: Option<EvidenceStatus>,
    #[serde(default)]
    pub temporal_role: Option<TemporalRole>,
    #[serde(default)]
    pub place_coverage: Option<PlaceCoverage>,
    #[serde(default)]
    pub ql_form: Option<QlForm>,
    #[serde(default)]
    pub ql_unit_id: Option<String>,
    #[serde(default)]
    pub ql_arc: Option<QlArc>,
    #[serde(default)]
    pub ql_topology: Option<QlTopology>,
    #[serde(default)]
    pub ql_schema_version: Option<i64>,
    #[serde(default)]
    pub ql_source_coordinates: Vec<String>,
    #[serde(default)]
    pub ql_completeness_status: Option<QlCompletenessStatus>,
    pub is_temporal: bool,
    #[serde(default)]
    pub valid_from: Option<String>,
    #[serde(default)]
    pub valid_to: Option<String>,
    #[serde(default)]
    pub temporal_precision: Option<TemporalPrecision>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateGraphNodeRequest {
    pub graph_node_id: String,
    pub patch: GraphNodePatch,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectGraphNodesRequest {
    pub source_graph_node_id: String,
    pub target_graph_node_id: String,
    pub rel_type: String,
    #[serde(default)]
    pub properties: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisconnectGraphNodesRequest {
    pub relationship_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchGraphRequest {
    pub query: String,
    #[serde(default)]
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutPayload {
    pub graph_node_id: String,
    pub canvas_id: String,
    pub position_x: f64,
    pub position_y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub style: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertNodeLayoutRequest {
    /// Optional: WS3/WS4/WS5/WS6 callers may omit this; the command falls back to
    /// `SharedApiState.db_path`. `#[serde(default)]` keeps deserialize from failing
    /// when the key is absent.
    #[serde(default)]
    pub database_path: Option<String>,
    pub layout: LayoutPayload,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertNodeLayoutsRequest {
    #[serde(default)]
    pub database_path: Option<String>,
    pub canvas_id: String,
    pub layouts: Vec<LayoutPayload>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeLayoutPayload {
    pub id: String,
    pub canvas_id: String,
    pub source_graph_node_id: String,
    pub target_graph_node_id: String,
    pub relation_kind: String,
    #[serde(default)]
    pub source_handle_id: Option<String>,
    #[serde(default)]
    pub target_handle_id: Option<String>,
    #[serde(default)]
    pub style: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertEdgeLayoutRequest {
    #[serde(default)]
    pub database_path: Option<String>,
    pub layout: EdgeLayoutPayload,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertCanvasAppStateRequest {
    #[serde(default)]
    pub database_path: Option<String>,
    pub canvas_id: String,
    pub viewport: serde_json::Value,
    pub app_state: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadCanvasViewRequest {
    #[serde(default)]
    pub database_path: Option<String>,
    pub canvas_id: String,
    pub lens: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchetypalLightingRequest {
    pub operator_graph_node_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResonancesForInstanceRequest {
    pub graph_node_id: String,
}

fn style_to_string(value: &serde_json::Value) -> String {
    if value.is_null() {
        "{}".to_string()
    } else {
        value.to_string()
    }
}

fn layout_record(payload: &LayoutPayload) -> NodeLayoutRecord {
    NodeLayoutRecord {
        graph_node_id: payload.graph_node_id.clone(),
        canvas_id: payload.canvas_id.clone(),
        position_x: payload.position_x,
        position_y: payload.position_y,
        width: payload.width,
        height: payload.height,
        style_json: style_to_string(&payload.style),
        created_at: now(),
        updated_at: now(),
    }
}

/// Resolve the SQLite database path: prefer an explicit `databasePath` from the
/// request, otherwise fall back to the bootstrapped `SharedApiState.db_path`.
/// This lets WS3/WS4/WS5/WS6 callers omit `databasePath` (the `#[serde(default)]`
/// Option keeps deserialize from failing) and still hit the active constellation DB.
pub(crate) fn resolve_db_path(
    explicit: &Option<String>,
    api_state: &tauri::State<SharedApiState>,
) -> Result<String, String> {
    if let Some(path) = explicit {
        return Ok(path.clone());
    }
    api_state
        .lock()
        .unwrap()
        .db_path
        .clone()
        .ok_or_else(|| "no databasePath provided and app not bootstrapped yet".to_string())
}

// ---- Substance commands (Neo4j) ----

#[tauri::command]
pub async fn read_graph_node_command(
    request: ReadGraphNodeRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<GraphNode, String> {
    repo(&graph_state)
        .get_node(&request.graph_node_id)
        .await?
        .ok_or_else(|| format!("node not found: {}", request.graph_node_id))
}

#[tauri::command]
pub async fn find_graph_node_command(
    request: ReadGraphNodeRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<Option<GraphNode>, String> {
    repo(&graph_state).get_node(&request.graph_node_id).await
}

#[tauri::command]
pub async fn create_graph_node_command(
    request: CreateGraphNodeRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<GraphNode, String> {
    repo(&graph_state)
        .create_node_with_metadata(
            NewGraphNode {
                graph_node_id: request.graph_node_id,
                entity_type: request.entity_type.as_str().to_string(),
                title: request.title,
                body: request.body,
                coordinate: request.coordinate,
                source_coordinates: request.source_coordinates,
                is_temporal: request.is_temporal,
                valid_from: request.valid_from,
                valid_to: request.valid_to,
                temporal_precision: request
                    .temporal_precision
                    .map(|value| value.as_str().to_string()),
            },
            NewGraphNodeMetadata {
                summary: request.summary,
                evidence_tags: request.evidence_tags,
                source_kind: request.source_kind,
                content_origin: request.content_origin,
                content_revision: request.content_revision,
                seed_schema_version: request.seed_schema_version,
                body_source_coordinates: request.body_source_coordinates,
                historicity: request.historicity,
                claim_kind: request.claim_kind,
                evidence_status: request.evidence_status,
                temporal_role: request.temporal_role,
                place_coverage: request.place_coverage,
                ql_form: request.ql_form,
                ql_unit_id: request.ql_unit_id,
                ql_arc: request.ql_arc,
                ql_topology: request.ql_topology,
                ql_schema_version: request.ql_schema_version,
                ql_source_coordinates: request.ql_source_coordinates,
                ql_completeness_status: request.ql_completeness_status,
            },
        )
        .await
}

#[tauri::command]
pub async fn update_graph_node_command(
    request: UpdateGraphNodeRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<GraphNode, String> {
    repo(&graph_state)
        .update_node(&request.graph_node_id, request.patch)
        .await
}

#[tauri::command]
pub async fn compare_and_swap_graph_node_content_command(
    request: GraphContentCasInput,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<GraphContentCasMutation, String> {
    repo(&graph_state).compare_and_swap_content(&request).await
}

#[tauri::command]
pub async fn delete_graph_node_command(
    request: ReadGraphNodeRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<(), String> {
    repo(&graph_state).delete_node(&request.graph_node_id).await
}

#[tauri::command]
pub async fn connect_graph_nodes_command(
    request: ConnectGraphNodesRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<GraphRelationship, String> {
    let props = if request.properties.is_null() {
        serde_json::json!({})
    } else {
        request.properties
    };
    repo(&graph_state)
        .connect_nodes(
            &request.source_graph_node_id,
            &request.target_graph_node_id,
            &request.rel_type,
            props,
        )
        .await
}

#[tauri::command]
pub async fn disconnect_graph_nodes_command(
    request: DisconnectGraphNodesRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<(), String> {
    repo(&graph_state)
        .disconnect(&request.relationship_id)
        .await
}

#[tauri::command]
pub async fn search_graph_command(
    request: SearchGraphRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<Vec<GraphNode>, String> {
    repo(&graph_state)
        .search(&request.query, request.limit.unwrap_or(25))
        .await
}

#[tauri::command]
pub async fn archetypal_lighting_command(
    request: ArchetypalLightingRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<ArchetypalLightingResult, String> {
    repo(&graph_state)
        .archetypal_lighting(&request.operator_graph_node_id)
        .await
}

#[tauri::command]
pub async fn resonances_for_instance_command(
    request: ResonancesForInstanceRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<Vec<LitInstance>, String> {
    repo(&graph_state)
        .resonances_for_instance(&request.graph_node_id)
        .await
}

// ---- Joined read (both stores) ----

#[tauri::command]
pub async fn load_canvas_view_command(
    request: LoadCanvasViewRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<CanvasView, String> {
    let db_path = resolve_db_path(&request.database_path, &api_state)?;
    let service = CanvasService::new(repo(&graph_state), db_path);
    service
        .load_canvas_view(&request.canvas_id, &request.lens)
        .await
}

// ---- Layout commands (SQLite) ----

#[tauri::command]
pub async fn upsert_node_layout_command(
    request: UpsertNodeLayoutRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<(), String> {
    let path = resolve_db_path(&request.database_path, &api_state)?;
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    LayoutRepository::new(db.connection())
        .upsert_node_layout(&layout_record(&request.layout))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_node_layouts_command(
    request: UpsertNodeLayoutsRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<usize, String> {
    let path = resolve_db_path(&request.database_path, &api_state)?;
    let records: Vec<NodeLayoutRecord> = request.layouts.iter().map(layout_record).collect();
    let mut db = Database::open(&path).map_err(|e| e.to_string())?;
    let tx = db
        .connection_mut()
        .transaction()
        .map_err(|e| e.to_string())?;
    let written = LayoutRepository::new(&tx)
        .upsert_node_layouts(&records)
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(written)
}

#[tauri::command]
pub async fn upsert_edge_layout_command(
    request: UpsertEdgeLayoutRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<(), String> {
    let path = resolve_db_path(&request.database_path, &api_state)?;
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    let l = &request.layout;
    LayoutRepository::new(db.connection())
        .upsert_edge_layout(&EdgeLayoutRecord {
            id: l.id.clone(),
            canvas_id: l.canvas_id.clone(),
            source_graph_node_id: l.source_graph_node_id.clone(),
            target_graph_node_id: l.target_graph_node_id.clone(),
            relation_kind: l.relation_kind.clone(),
            source_handle_id: l.source_handle_id.clone(),
            target_handle_id: l.target_handle_id.clone(),
            style_json: style_to_string(&l.style),
            created_at: now(),
            updated_at: now(),
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_canvas_app_state_command(
    request: UpsertCanvasAppStateRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<(), String> {
    let path = resolve_db_path(&request.database_path, &api_state)?;
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    LayoutRepository::new(db.connection())
        .upsert_app_state(&CanvasAppStateRecord {
            canvas_id: request.canvas_id,
            viewport_json: style_to_string(&request.viewport),
            app_state_json: style_to_string(&request.app_state),
            updated_at: now(),
        })
        .map_err(|e| e.to_string())
}

// Re-export DTO so external callers can name the return type.
pub use crate::db::canvas_service::JoinedCanvasNode as _JoinedCanvasNode;
pub type LayoutDto = NodeLayoutDto;

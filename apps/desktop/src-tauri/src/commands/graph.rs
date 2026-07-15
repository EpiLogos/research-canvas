// apps/desktop/src-tauri/src/commands/graph.rs
use std::path::Path;

use serde::Deserialize;
use tauri::Manager;

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
        relationship_vocabulary::{
            canonical_relationship_key, canonicalize_relationship_properties,
            durable_relationship_id,
        },
        GraphNodeMetadataRepository, NodeRelationshipRecord, NodeRelationshipRepository,
        RelationshipMutation, SyncState,
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectGraphNodesRequest {
    #[serde(default)]
    pub database_path: Option<String>,
    pub source_graph_node_id: String,
    pub target_graph_node_id: String,
    pub rel_type: String,
    #[serde(default)]
    pub properties: serde_json::Value,
    /// Optional user-visible canonical identity. If omitted we derive one
    /// from endpoints and type, which makes ordinary retries idempotent.
    #[serde(default)]
    pub canonical_key: Option<String>,
    #[serde(default)]
    pub origin: Option<ContentOrigin>,
    #[serde(default)]
    pub revision: Option<i64>,
    #[serde(default)]
    pub expected_revision: Option<i64>,
    #[serde(default)]
    pub source_coordinates: Vec<String>,
    #[serde(default)]
    pub evidence_tags: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct LocalRelationshipWrite {
    pub relationship: GraphRelationship,
    pub mutation: RelationshipMutation,
    pub sync_state: SyncState,
}

#[derive(Debug, Clone)]
pub struct LocalRelationshipTombstone {
    pub relationship: GraphRelationship,
    pub newly_tombstoned: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisconnectGraphNodesRequest {
    #[serde(default)]
    pub database_path: Option<String>,
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

/// The durable local write boundary for user/source relationship creation.
///
/// This is intentionally synchronous and SQLite-first: the returned success
/// means a complete local graph contract exists. Remote Bolt projection is
/// separately attempted by the Tauri command and cannot undo, replace, or
/// falsely acknowledge this authoritative local result.
pub fn connect_graph_nodes_locally_at_path(
    path: impl AsRef<Path>,
    request: &ConnectGraphNodesRequest,
) -> Result<LocalRelationshipWrite, String> {
    let database = Database::open(path).map_err(|error| error.to_string())?;
    let metadata = GraphNodeMetadataRepository::new(database.connection());
    for graph_node_id in [&request.source_graph_node_id, &request.target_graph_node_id] {
        if metadata
            .get(graph_node_id)
            .map_err(|error| error.to_string())?
            .is_none()
        {
            return Err(format!(
                "cannot create local relationship: endpoint has no local graph metadata: {graph_node_id}"
            ));
        }
    }

    let properties = local_relationship_properties(request)?;
    let canonical_key = canonical_relationship_key(
        &request.source_graph_node_id,
        &request.target_graph_node_id,
        &request.rel_type,
        &properties,
    );
    let mut record = NodeRelationshipRecord {
        relationship_id: durable_relationship_id(&canonical_key),
        source_graph_node_id: request.source_graph_node_id.clone(),
        target_graph_node_id: request.target_graph_node_id.clone(),
        rel_type: request.rel_type.clone(),
        properties,
        source_coordinates: request.source_coordinates.clone(),
        evidence_tags: request.evidence_tags.clone(),
        origin: request.origin.unwrap_or(ContentOrigin::UserAuthored),
        // Pending is the durable retry state. Each normal connect retries
        // projection while it remains pending; a remote write has no
        // equivalent relationship CAS acknowledgement, so it must not mark
        // this user-owned local contract as synchronised.
        sync_state: SyncState::Pending,
        revision: request.revision.unwrap_or(1),
        remote_revision: None,
        is_tombstone: false,
        created_at: None,
        updated_at: None,
    };
    let repository = NodeRelationshipRepository::new(database.connection());
    // A later authored create with the same canonical key intentionally
    // revives a deletion tombstone. The transition uses the tombstone's
    // revision as its required CAS baseline; seed/corpus replays instead stay
    // preserved in the repository and can never undo a local delete.
    let mut expected_revision = request.expected_revision;
    if let Some(current) = repository
        .get(&record.relationship_id)
        .map_err(|error| error.to_string())?
    {
        if current.is_tombstone && record.origin == ContentOrigin::UserAuthored {
            if let Some(expected) = expected_revision {
                if expected != current.revision {
                    return Err(format!(
                        "local relationship compare-and-swap conflict: tombstone is at revision {}",
                        current.revision
                    ));
                }
            }
            record.revision = current.revision.checked_add(1).ok_or_else(|| {
                "local relationship revision cannot exceed the safe integer range".to_string()
            })?;
            expected_revision = Some(current.revision);
        }
    }
    let mutation = repository
        .merge(&record, expected_revision)
        .map_err(|error| error.to_string())?;
    if let RelationshipMutation::Conflict { reason, .. } = &mutation {
        return Err(format!(
            "local relationship compare-and-swap conflict: {reason}"
        ));
    }
    let relationship = repository
        .get(&record.relationship_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "local relationship disappeared after write".to_string())?
        .as_graph_relationship();
    Ok(LocalRelationshipWrite {
        relationship,
        mutation,
        sync_state: record.sync_state,
    })
}

/// The complete normal connect service used by the Tauri command. Passing no
/// remote repository models the standard offline startup: local persistence
/// succeeds and the relationship remains pending until a later normal connect
/// retries its canonical remote projection.
pub async fn connect_graph_nodes_local_first_at_path(
    path: impl AsRef<Path>,
    request: &ConnectGraphNodesRequest,
    remote: Option<GraphRepository>,
) -> Result<LocalRelationshipWrite, String> {
    let local = connect_graph_nodes_locally_at_path(path, request)?;
    if local.sync_state == SyncState::Pending {
        if let Some(remote) = remote {
            // Neo4j transport has no relationship-level CAS/ownership
            // acknowledgement. It is therefore explicitly best effort and
            // cannot change local sync_state or determine command success.
            let _ = remote
                .connect_nodes(
                    &local.relationship.source_graph_node_id,
                    &local.relationship.target_graph_node_id,
                    &local.relationship.rel_type,
                    local.relationship.properties.clone(),
                )
                .await;
        }
    }
    Ok(local)
}

/// Locally tombstones a relationship and returns the semantic contract
/// required to remove a remote projection. Existing remote-only ids are
/// intentionally left to the legacy compatibility fallback in the wrapper.
pub fn disconnect_graph_nodes_locally_at_path(
    path: impl AsRef<Path>,
    relationship_id: &str,
) -> Result<Option<LocalRelationshipTombstone>, String> {
    let mut database = Database::open(path).map_err(|error| error.to_string())?;
    let transaction = database
        .connection_mut()
        .transaction()
        .map_err(|error| error.to_string())?;
    let tombstone = NodeRelationshipRepository::new(&transaction)
        .tombstone(relationship_id)
        .map_err(|error| error.to_string())?
        .map(|(record, newly_tombstoned)| LocalRelationshipTombstone {
            relationship: record.as_graph_relationship(),
            newly_tombstoned,
        });

    // `graph:<relationship_id>` is the persisted presentation id emitted by
    // the canvas mapper for every semantic relationship. Delete it in the
    // same transaction as the durable tombstone so a restart in the narrow
    // window before the scheduled layout flush cannot redraw a removed link.
    // Non-semantic/manual layout edges intentionally have other ids and stay
    // untouched; a remote-only relationship follows the compatibility path
    // below and has no local tombstone to authoritatively remove it.
    if tombstone.is_some() {
        LayoutRepository::new(&transaction)
            .delete_edge_layouts_by_id(&format!("graph:{relationship_id}"))
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(tombstone)
}

/// The durable disconnect boundary mirrors local-first creation. The local
/// tombstone succeeds independently of Neo4j; every exact retry repeats the
/// best-effort canonical remote delete until it has been observed remotely.
pub async fn disconnect_graph_nodes_local_first_at_path(
    path: impl AsRef<Path>,
    relationship_id: &str,
    remote: Option<GraphRepository>,
) -> Result<bool, String> {
    let Some(tombstone) = disconnect_graph_nodes_locally_at_path(path, relationship_id)? else {
        return Ok(false);
    };
    if let Some(remote) = remote {
        let _ = remote
            .disconnect_by_canonical_relationship(&tombstone.relationship)
            .await;
    }
    Ok(tombstone.newly_tombstoned)
}

fn local_relationship_properties(
    request: &ConnectGraphNodesRequest,
) -> Result<serde_json::Value, String> {
    let mut properties = if request.properties.is_null() {
        serde_json::Map::new()
    } else {
        request
            .properties
            .as_object()
            .cloned()
            .ok_or_else(|| "relationship properties must be a JSON object".to_string())?
    };
    if let Some(canonical_key) = request.canonical_key.as_deref() {
        if canonical_key.trim().is_empty() {
            return Err("canonicalKey must not be blank when supplied".into());
        }
        for property_name in ["canonicalKey", "canonical_key", "seed_key"] {
            if let Some(existing) = properties
                .get(property_name)
                .and_then(serde_json::Value::as_str)
            {
                if existing != canonical_key {
                    return Err(format!(
                        "canonicalKey conflicts with relationship properties.{property_name}"
                    ));
                }
            }
        }
        properties.insert(
            "canonicalKey".into(),
            serde_json::Value::String(canonical_key.to_string()),
        );
    }
    canonicalize_relationship_properties(
        &request.source_graph_node_id,
        &request.target_graph_node_id,
        &request.rel_type,
        serde_json::Value::Object(properties),
    )
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
    api_state: tauri::State<'_, SharedApiState>,
    app_handle: tauri::AppHandle,
) -> Result<GraphRelationship, String> {
    let path = resolve_db_path(&request.database_path, &api_state)?;
    let remote = app_handle
        .try_state::<SharedGraphState>()
        .map(|graph_state| {
            GraphRepository::new(graph_state.graph.clone(), graph_state.database.clone())
        });
    let local = connect_graph_nodes_local_first_at_path(&path, &request, remote).await?;
    Ok(local.relationship)
}

#[tauri::command]
pub async fn disconnect_graph_nodes_command(
    request: DisconnectGraphNodesRequest,
    api_state: tauri::State<'_, SharedApiState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let path = resolve_db_path(&request.database_path, &api_state)?;
    let remote = app_handle
        .try_state::<SharedGraphState>()
        .map(|graph_state| {
            GraphRepository::new(graph_state.graph.clone(), graph_state.database.clone())
        });
    if disconnect_graph_nodes_local_first_at_path(&path, &request.relationship_id, remote.clone())
        .await?
    {
        return Ok(());
    }
    // Preserve the remote-only graph API for pre-projection canvas edges.
    // New links never reach this branch: their local relationship id is
    // authoritative and was removed above.
    if let Some(remote) = remote {
        remote.disconnect(&request.relationship_id).await
    } else {
        Err(format!(
            "cannot remove relationship {}: no local projection and no remote graph",
            request.relationship_id
        ))
    }
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

#[cfg(test)]
mod local_relationship_command_tests {
    use super::*;
    use crate::{
        commands::timeline::{
            load_timeline_view_at_path, timeline_workspace_identity, LoadTimelineViewRequest,
            TimelineFilters,
        },
        db::{
            connection::Database,
            repositories::{
                DocumentContentInput, DocumentMetadataProjection, NodeDocumentMutation,
                NodeDocumentRepository, NodeRelationshipRepository, RelationshipMutation,
                SyncState,
            },
            root_archetypal_seed::ensure_root_archetypal_local_projection,
        },
    };

    #[tokio::test]
    async fn normal_connect_service_keeps_a_user_link_locally_when_no_remote_graph_is_available() {
        let directory = tempfile::tempdir().expect("temporary local relationship workspace");
        let path = directory.path().join("local-first-connect.sqlite");
        let database = Database::open(&path).expect("migrated SQLite database");
        ensure_root_archetypal_local_projection(
            database.connection(),
            &directory.path().to_string_lossy(),
            "command-test",
        )
        .expect("normal root bootstrap creates relationship endpoints");

        let request = ConnectGraphNodesRequest {
            database_path: None,
            source_graph_node_id: "command-test:banda-genocide".into(),
            target_graph_node_id: "command-test:bull-ox".into(),
            rel_type: "INSTANTIATES".into(),
            properties: serde_json::json!({"reading": "user-curated comparison"}),
            canonical_key: None,
            origin: None,
            revision: None,
            expected_revision: None,
            source_coordinates: vec!["episodes/2/timeline.md#banda".into()],
            evidence_tags: vec!["user-curated".into()],
        };
        let created = connect_graph_nodes_local_first_at_path(&path, &request, None)
            .await
            .expect("normal command local-first write succeeds without Neo4j");
        assert_eq!(created.mutation, RelationshipMutation::Created);
        let replay = connect_graph_nodes_local_first_at_path(&path, &request, None)
            .await
            .expect("exact retry is locally idempotent");
        assert_eq!(replay.mutation, RelationshipMutation::Preserved);

        let stored = NodeRelationshipRepository::new(database.connection())
            .get(&created.relationship.id)
            .expect("read durable user relationship")
            .expect("normal command wrote a local relationship");
        assert_eq!(stored.origin, ContentOrigin::UserAuthored);
        assert_eq!(stored.sync_state, SyncState::Pending);
        assert_eq!(stored.revision, 1);
        assert!(stored.properties.get("canonicalKey").is_some());

        let timeline = load_timeline_view_at_path(
            &path,
            LoadTimelineViewRequest {
                workspace_id: timeline_workspace_identity(&path).expect("timeline workspace id"),
                filters: TimelineFilters::default(),
                range: None,
            },
        )
        .expect("offline timeline reads the normal local command relation");
        assert!(timeline.relationships.iter().any(|relationship| {
            relationship.id == created.relationship.id
                && relationship.source_graph_node_id == "command-test:banda-genocide"
                && relationship.target_graph_node_id == "command-test:bull-ox"
        }));
        assert!(timeline.nodes.iter().any(|node| {
            node.node.graph_node_id == "command-test:bull-ox" && node.relation_companion
        }));
    }

    #[tokio::test]
    async fn normal_disconnect_service_removes_the_local_link_for_an_offline_retype() {
        let directory = tempfile::tempdir().expect("temporary local relationship workspace");
        let path = directory.path().join("local-first-disconnect.sqlite");
        let database = Database::open(&path).expect("migrated SQLite database");
        ensure_root_archetypal_local_projection(
            database.connection(),
            &directory.path().to_string_lossy(),
            "disconnect-test",
        )
        .expect("normal root bootstrap creates relationship endpoints");

        let original_request = ConnectGraphNodesRequest {
            database_path: None,
            source_graph_node_id: "disconnect-test:banda-genocide".into(),
            target_graph_node_id: "disconnect-test:bull-ox".into(),
            rel_type: "INSTANTIATES".into(),
            properties: serde_json::json!({"reading": "initial relation"}),
            canonical_key: None,
            origin: None,
            revision: None,
            expected_revision: None,
            source_coordinates: vec!["episodes/2/timeline.md#banda".into()],
            evidence_tags: vec!["user-curated".into()],
        };
        let original = connect_graph_nodes_local_first_at_path(&path, &original_request, None)
            .await
            .expect("create original local relation");

        let replacement_request = ConnectGraphNodesRequest {
            rel_type: "ECHOES".into(),
            properties: serde_json::json!({"reading": "retyped relation"}),
            ..original_request
        };
        let replacement =
            connect_graph_nodes_local_first_at_path(&path, &replacement_request, None)
                .await
                .expect("create local retype replacement");
        assert!(
            disconnect_graph_nodes_local_first_at_path(&path, &original.relationship.id, None)
                .await
                .expect("remove original local relationship")
        );
        assert!(!disconnect_graph_nodes_local_first_at_path(
            &path,
            &original.relationship.id,
            None
        )
        .await
        .expect("an exact delete replay is idempotent"));
        let tombstone = NodeRelationshipRepository::new(database.connection())
            .get(&original.relationship.id)
            .expect("read original relationship")
            .expect("offline deletion keeps a durable relationship tombstone");
        assert!(tombstone.is_tombstone);
        assert_eq!(tombstone.origin, ContentOrigin::UserAuthored);
        assert_eq!(tombstone.sync_state, SyncState::Pending);
        assert_eq!(tombstone.revision, 2);

        let timeline = load_timeline_view_at_path(
            &path,
            LoadTimelineViewRequest {
                workspace_id: timeline_workspace_identity(&path).expect("timeline workspace id"),
                filters: TimelineFilters::default(),
                range: None,
            },
        )
        .expect("offline timeline reads only the retyped local relationship");
        assert!(!timeline
            .relationships
            .iter()
            .any(|relationship| relationship.id == original.relationship.id));
        assert!(timeline.relationships.iter().any(|relationship| {
            relationship.id == replacement.relationship.id && relationship.rel_type == "ECHOES"
        }));

        let revived = connect_graph_nodes_local_first_at_path(
            &path,
            &ConnectGraphNodesRequest {
                database_path: None,
                source_graph_node_id: "disconnect-test:banda-genocide".into(),
                target_graph_node_id: "disconnect-test:bull-ox".into(),
                rel_type: "INSTANTIATES".into(),
                properties: serde_json::json!({"reading": "revived relation"}),
                canonical_key: None,
                origin: None,
                revision: None,
                expected_revision: None,
                source_coordinates: vec!["episodes/2/timeline.md#banda".into()],
                evidence_tags: vec!["user-curated".into()],
            },
            None,
        )
        .await
        .expect("an authored create revives the canonical tombstone");
        assert_eq!(revived.mutation, RelationshipMutation::Updated);
        assert_eq!(revived.relationship.id, original.relationship.id);
        let revived_row = NodeRelationshipRepository::new(database.connection())
            .get(&original.relationship.id)
            .expect("read revived relationship")
            .expect("revived relationship remains durable");
        assert!(!revived_row.is_tombstone);
        assert_eq!(revived_row.revision, 3);
    }

    #[tokio::test]
    async fn local_source_projection_can_be_linked_offline_before_remote_source_creation() {
        let directory = tempfile::tempdir().expect("temporary local source workspace");
        let path = directory.path().join("local-source-link.sqlite");
        let database = Database::open(&path).expect("migrated SQLite database");
        ensure_root_archetypal_local_projection(
            database.connection(),
            &directory.path().to_string_lossy(),
            "source-link-test",
        )
        .expect("normal root bootstrap creates document target");

        let source_id = "source-link-test:attached-markdown-source";
        assert_eq!(
            NodeDocumentRepository::new(database.connection())
                .apply_reconciliation_with_projection(
                    &DocumentContentInput {
                        graph_node_id: source_id.into(),
                        body: "[{\"type\":\"paragraph\",\"content\":[]}]".into(),
                        summary: "attached source.md".into(),
                        content_origin: ContentOrigin::UserAuthored,
                        content_revision: 0,
                        body_source_coordinates: vec![],
                        neo4j_synced: false,
                    },
                    None,
                    Some(&DocumentMetadataProjection {
                        entity_type: "Source".into(),
                        title: "attached source.md".into(),
                        schema_version: 1,
                    }),
                )
                .expect("persist Source metadata alongside local source document"),
            NodeDocumentMutation::Created,
        );
        let request = ConnectGraphNodesRequest {
            database_path: None,
            source_graph_node_id: "source-link-test:banda-genocide".into(),
            target_graph_node_id: source_id.into(),
            rel_type: "SOURCED_FROM".into(),
            properties: serde_json::json!({"fileName": "attached source.md"}),
            canonical_key: None,
            origin: None,
            revision: None,
            expected_revision: None,
            source_coordinates: vec![],
            evidence_tags: vec!["user-curated".into()],
        };
        let relationship = connect_graph_nodes_local_first_at_path(&path, &request, None)
            .await
            .expect("normal source link command succeeds without a remote graph");
        let timeline = load_timeline_view_at_path(
            &path,
            LoadTimelineViewRequest {
                workspace_id: timeline_workspace_identity(&path).expect("timeline workspace id"),
                filters: TimelineFilters::default(),
                range: None,
            },
        )
        .expect("offline timeline finds normal source relationship");
        assert!(timeline
            .relationships
            .iter()
            .any(|candidate| candidate.id == relationship.relationship.id));
        assert!(timeline
            .nodes
            .iter()
            .any(|node| { node.node.graph_node_id == source_id && node.relation_companion }));
    }
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

use std::{
    collections::BTreeSet,
    env, fs,
    path::{Path, PathBuf},
};

use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{
    commands::timeline::timeline_workspace_identity,
    db::{
        connection::Database,
        repositories::{
            AnnotationRepository, CanvasGraphRepository, Constellation, ConstellationRepository,
            EdgeLayoutRecord, LayoutRepository, NodeLayoutRecord, NodeRelationshipRepository,
            ResourceRootRecord, ResourceRootRepository, SavedSequenceRecord,
            SavedSequenceRepository,
        },
        root_archetypal_seed::ensure_root_archetypal_local_projection,
    },
    fs::indexer::{index_directory, IndexedEntry, IndexedEntryKind},
    SharedApiState,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBootstrap {
    pub active_constellation_id: String,
    pub database_path: String,
    pub workspace_id: String,
    pub constellations: Vec<ConstellationTreeNodePayload>,
    /// The monorepo root (not a constellation's content root, which for the
    /// root-archetypal-field constellation is `antichrist-vault/`). Callers
    /// that need to run shell commands (e.g. the embedded terminal) should
    /// use this, not a constellation's `rootPath`.
    pub workspace_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstellationTreeNodePayload {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub root_path: String,
    pub summary: String,
    pub parent_id: Option<String>,
    pub children: Vec<ConstellationTreeNodePayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishSettingsPayload {
    pub include_resources: bool,
    pub mobile_sequence_first: bool,
    pub theme: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceConstellationPayload {
    pub id: String,
    pub display_name: String,
    pub slug: String,
    pub parent_constellation_id: Option<String>,
    pub root_path: String,
    pub primary_canvas_id: String,
    pub summary: String,
    pub cover_asset_path: Option<String>,
    pub publish_settings: PublishSettingsPayload,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceRootPayload {
    pub id: String,
    pub constellation_id: String,
    pub root_path: String,
    pub display_name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexedEntryPayload {
    pub id: String,
    pub name: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub kind: String,
    pub is_directory: bool,
    pub depth: usize,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionPayload {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SizePayload {
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasNodePayload {
    pub id: String,
    pub canvas_id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub title: String,
    pub position: PositionPayload,
    pub size: SizePayload,
    pub summary: String,
    pub content: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub resource_kind: Option<String>,
    pub absolute_path: Option<String>,
    pub relative_path: Option<String>,
    pub mime_type: Option<String>,
    pub file_fingerprint: Option<String>,
    pub url: Option<String>,
    pub color: Option<String>,
    #[serde(default)]
    pub child_node_ids: Vec<String>,
    pub target_canvas_id: Option<String>,
    pub dot_colour: Option<String>,
    pub bg_colour: Option<String>,
    pub text_colour: Option<String>,
    pub thumbnail: Option<String>,
    pub sequence_caption: Option<String>,
    pub sequence_viewport: Option<serde_json::Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeStylePayload {
    pub stroke: String,
    pub width: f64,
    pub dashed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasEdgePayload {
    pub id: String,
    pub canvas_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub source_handle_id: Option<String>,
    pub target_handle_id: Option<String>,
    pub relation_kind: String,
    pub directionality: String,
    pub label: String,
    pub note: String,
    pub style: EdgeStylePayload,
    #[serde(default)]
    pub sequencing: bool,
    #[serde(default)]
    pub sequence_priority: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationPointPayload {
    pub x: f64,
    pub y: f64,
    pub pressure: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationStylePayload {
    pub color: String,
    pub width: f64,
    pub opacity: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationBoundsPayload {
    pub position: PositionPayload,
    pub size: SizePayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationPayload {
    pub id: String,
    pub canvas_id: String,
    pub annotation_type: String,
    pub points: Vec<AnnotationPointPayload>,
    pub style: AnnotationStylePayload,
    pub text: Option<String>,
    pub bounds: AnnotationBoundsPayload,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstellationDocumentPayload {
    pub working_root: String,
    pub canvas_id: String,
    pub database_path: String,
    pub entries: Vec<IndexedEntryPayload>,
    pub resource_roots: Vec<ResourceRootPayload>,
    pub constellation: WorkspaceConstellationPayload,
    pub annotations: Vec<AnnotationPayload>,
    pub edges: Vec<CanvasEdgePayload>,
    pub nodes: Vec<CanvasNodePayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstellationDocumentRequest {
    pub database_path: String,
    pub constellation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistConstellationDocumentRequest {
    pub annotations: Vec<AnnotationPayload>,
    pub canvas_id: String,
    pub database_path: String,
    pub edges: Vec<CanvasEdgePayload>,
    pub nodes: Vec<CanvasNodePayload>,
    pub constellation_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceRootMutationRequest {
    pub database_path: String,
    pub constellation_id: String,
    pub root_path: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceRootLookupRequest {
    pub database_path: String,
    pub constellation_id: String,
}

pub fn index_constellation_root(root: impl AsRef<Path>) -> std::io::Result<Vec<IndexedEntry>> {
    index_directory(root)
}

#[tauri::command]
pub fn bootstrap_workspace_command(
    api_state: tauri::State<SharedApiState>,
) -> Result<WorkspaceBootstrap, String> {
    let database_path = default_database_path(None)?;
    let result = bootstrap_workspace_at(&database_path)?;
    {
        let mut api = api_state.lock().unwrap();
        api.db_path = Some(database_path.to_string_lossy().to_string());
        api.active_constellation_id = Some(result.active_constellation_id.clone());
    }
    Ok(result)
}

#[tauri::command]
pub fn load_constellation_document_command(
    request: ConstellationDocumentRequest,
) -> Result<ConstellationDocumentPayload, String> {
    load_constellation_document_at(&request.database_path, &request.constellation_id)
}

#[tauri::command]
pub fn persist_constellation_document_command(
    request: PersistConstellationDocumentRequest,
) -> Result<ConstellationDocumentPayload, String> {
    persist_constellation_document_at(request)
}

#[tauri::command]
pub fn attach_constellation_resource_root_command(
    request: ResourceRootMutationRequest,
) -> Result<ResourceRootPayload, String> {
    attach_constellation_resource_root_at(request)
}

#[tauri::command]
pub fn detach_constellation_resource_root_command(
    request: ResourceRootMutationRequest,
) -> Result<(), String> {
    detach_constellation_resource_root_at(request)
}

#[tauri::command]
pub fn list_constellation_resource_roots_command(
    request: ResourceRootLookupRequest,
) -> Result<Vec<ResourceRootPayload>, String> {
    list_constellation_resource_roots_at(request)
}

pub fn bootstrap_workspace_at(
    database_path: impl AsRef<Path>,
) -> Result<WorkspaceBootstrap, String> {
    let database_path = database_path.as_ref().to_path_buf();
    let database = Database::open(&database_path).map_err(|error| error.to_string())?;
    let root = workspace_root();
    ensure_workspace_constellations(database.connection(), &root)?;

    let constellations = list_constellations_flat(database.connection())?;
    let active_constellation_id = constellations
        .iter()
        .find(|constellation| constellation.slug == "root-archetypal-field")
        .or_else(|| {
            constellations
                .iter()
                .find(|constellation| constellation.parent_constellation_id.is_none())
        })
        .or_else(|| constellations.first())
        .map(|constellation| constellation.id.clone())
        .ok_or_else(|| "workspace bootstrap found no constellations".to_string())?;

    Ok(WorkspaceBootstrap {
        active_constellation_id,
        database_path: database_path.to_string_lossy().to_string(),
        workspace_id: timeline_workspace_identity(&database_path)?,
        constellations: constellations
            .into_iter()
            .map(constellation_tree_payload)
            .collect(),
        workspace_root: root.to_string_lossy().to_string(),
    })
}

pub fn load_constellation_document_at(
    database_path: impl AsRef<Path>,
    constellation_id: &str,
) -> Result<ConstellationDocumentPayload, String> {
    let database_path = database_path.as_ref().to_path_buf();
    let database = Database::open(&database_path).map_err(|error| error.to_string())?;
    ensure_workspace_constellations(database.connection(), &workspace_root())?;

    let constellation = load_constellation(database.connection(), constellation_id)?;
    let canvas_id = constellation.primary_canvas_id.clone().ok_or_else(|| {
        format!(
            "constellation {} is missing a primary canvas",
            constellation.id
        )
    })?;

    let resource_roots =
        list_constellation_resource_roots(database.connection(), &constellation.id)?;
    let entries = index_constellation_entries(&constellation.root_path, &resource_roots)
        .map_err(|error| error.to_string())?;
    let graph = CanvasGraphRepository::new(database.connection());
    let snapshot = graph
        .load_canvas_snapshot(&canvas_id)
        .map_err(|error| error.to_string())?;
    let tombstoned_semantic_edge_ids = tombstoned_semantic_edge_ids(database.connection())?;
    let layout_nodes = layout_node_payloads(database.connection(), &canvas_id)?;
    let layout_edges = layout_edge_payloads(
        database.connection(),
        &canvas_id,
        &tombstoned_semantic_edge_ids,
    )?;

    let annotations = AnnotationRepository::new(database.connection())
        .list_for_canvas(&canvas_id)
        .map_err(|error| error.to_string())?;
    let nodes = if snapshot.nodes.is_empty() {
        layout_nodes
    } else {
        snapshot
            .nodes
            .into_iter()
            .map(node_payload)
            .collect::<Result<Vec<_>, _>>()?
    };
    let snapshot_edges = snapshot
        .edges
        .into_iter()
        .filter(|edge| !tombstoned_semantic_edge_ids.contains(&edge.id))
        .map(edge_payload)
        .collect::<Result<Vec<_>, _>>()?;
    let edges = if snapshot_edges.is_empty() {
        layout_edges
    } else {
        snapshot_edges
    };

    Ok(ConstellationDocumentPayload {
        working_root: constellation.root_path.clone(),
        canvas_id,
        database_path: database_path.to_string_lossy().to_string(),
        entries: entries.into_iter().map(indexed_entry_payload).collect(),
        resource_roots: resource_roots
            .into_iter()
            .map(resource_root_payload)
            .collect(),
        constellation: constellation_payload(constellation)?,
        annotations: annotations
            .into_iter()
            .map(annotation_payload)
            .collect::<Result<Vec<_>, _>>()?,
        edges,
        nodes,
    })
}

pub fn persist_constellation_document_at(
    request: PersistConstellationDocumentRequest,
) -> Result<ConstellationDocumentPayload, String> {
    let database_path = PathBuf::from(&request.database_path);
    let mut database = Database::open(&database_path).map_err(|error| error.to_string())?;
    ensure_workspace_constellations(database.connection(), &workspace_root())?;

    {
        let transaction = database
            .connection_mut()
            .transaction()
            .map_err(|error| error.to_string())?;
        replace_constellation_document(&transaction, &request)?;
        transaction.commit().map_err(|error| error.to_string())?;
    }

    load_constellation_document_at(database_path, &request.constellation_id)
}

fn workspace_root() -> PathBuf {
    if let Ok(path) = env::var("RESEARCH_CANVAS_WORKSPACE_ROOT") {
        return PathBuf::from(path);
    }

    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .expect("workspace root")
}

pub fn default_database_path(session_id: Option<&str>) -> Result<PathBuf, String> {
    crate::workspace::prepare_database_path(session_id).map_err(|error| error.to_string())
}

fn ensure_workspace_constellations(connection: &Connection, root: &Path) -> Result<(), String> {
    let constellation_root = root_constellation_source_path(root);
    ensure_root_archetypal_local_projection(
        connection,
        &constellation_root.to_string_lossy(),
        "root-archetypal-field",
    )?;
    Ok(())
}

fn root_constellation_source_path(root: &Path) -> PathBuf {
    let vault = root.join("antichrist-vault");
    if vault.is_dir() {
        vault
    } else {
        root.to_path_buf()
    }
}

fn list_constellations_flat(connection: &Connection) -> Result<Vec<Constellation>, String> {
    let mut statement = connection
        .prepare(
            "SELECT
                id,
                display_name,
                slug,
                parent_project_id,
                root_path,
                primary_canvas_id,
                summary,
                cover_asset,
                publish_settings,
                created_at,
                updated_at
             FROM projects
             ORDER BY
                CASE WHEN parent_project_id IS NULL THEN 0 ELSE 1 END ASC,
                display_name COLLATE NOCASE ASC,
                created_at ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(Constellation {
                id: row.get(0)?,
                display_name: row.get(1)?,
                slug: row.get(2)?,
                parent_constellation_id: row.get(3)?,
                root_path: row.get(4)?,
                primary_canvas_id: row.get(5)?,
                summary: row.get(6)?,
                cover_asset: row.get(7)?,
                publish_settings: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn load_constellation(
    connection: &Connection,
    constellation_id: &str,
) -> Result<Constellation, String> {
    ConstellationRepository::new(connection)
        .get_by_id(constellation_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("constellation {constellation_id} was not found"))
}

fn replace_constellation_document(
    connection: &Connection,
    request: &PersistConstellationDocumentRequest,
) -> Result<(), String> {
    connection
        .execute(
            "DELETE FROM canvas_annotations WHERE canvas_id = ?1",
            [&request.canvas_id],
        )
        .map_err(|error| error.to_string())?;

    let replaces_canvas_substance = !request.nodes.is_empty() || !request.edges.is_empty();
    if replaces_canvas_substance {
        connection
            .execute(
                "DELETE FROM canvas_edges WHERE canvas_id = ?1",
                [&request.canvas_id],
            )
            .map_err(|error| error.to_string())?;
        connection
            .execute(
                "DELETE FROM canvas_nodes WHERE canvas_id = ?1",
                [&request.canvas_id],
            )
            .map_err(|error| error.to_string())?;

        for node in &request.nodes {
            let tags = serde_json::to_string(&node.tags).map_err(|error| error.to_string())?;
            let child_node_ids =
                serde_json::to_string(&node.child_node_ids).map_err(|error| error.to_string())?;
            connection
                .execute(
                    "INSERT INTO canvas_nodes (
                    id,
                    canvas_id,
                    type,
                    title,
                    summary,
                    position_x,
                    position_y,
                    width,
                    height,
                    content,
                    tags,
                    resource_kind,
                    absolute_path,
                    relative_path,
                    mime_type,
                    file_fingerprint,
                    url,
                    color,
                    child_node_ids,
                    target_canvas_id,
                    dot_colour,
                    bg_colour,
                    text_colour,
                    thumbnail,
                    sequence_caption,
                    sequence_viewport_json,
                    created_at,
                    updated_at
                ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
                    ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28
                )",
                    params![
                        node.id,
                        node.canvas_id,
                        node.node_type,
                        node.title,
                        node.summary,
                        node.position.x,
                        node.position.y,
                        node.size.width,
                        node.size.height,
                        node.content.as_deref(),
                        tags,
                        node.resource_kind.as_deref(),
                        node.absolute_path.as_deref(),
                        node.relative_path.as_deref(),
                        node.mime_type.as_deref(),
                        node.file_fingerprint.as_deref(),
                        node.url.as_deref(),
                        node.color.as_deref(),
                        child_node_ids,
                        node.target_canvas_id.as_deref(),
                        node.dot_colour.as_deref(),
                        node.bg_colour.as_deref(),
                        node.text_colour.as_deref(),
                        node.thumbnail.as_deref(),
                        node.sequence_caption.as_deref(),
                        node.sequence_viewport.as_ref().map(|v| v.to_string()),
                        node.created_at,
                        node.updated_at,
                    ],
                )
                .map_err(|error| error.to_string())?;
        }

        for edge in &request.edges {
            let style = serde_json::to_string(&edge.style).map_err(|error| error.to_string())?;
            connection
                .execute(
                    "INSERT INTO canvas_edges (
                    id,
                    canvas_id,
                    source_node_id,
                    target_node_id,
                    source_handle_id,
                    target_handle_id,
                    relation_kind,
                    directionality,
                    label,
                    note,
                    style_json,
                    sequencing,
                    sequence_priority,
                    created_at,
                    updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
                    params![
                        edge.id,
                        edge.canvas_id,
                        edge.source_node_id,
                        edge.target_node_id,
                        edge.source_handle_id.as_deref(),
                        edge.target_handle_id.as_deref(),
                        edge.relation_kind,
                        edge.directionality,
                        edge.label,
                        edge.note,
                        style,
                        edge.sequencing as i64,
                        edge.sequence_priority,
                        edge.created_at,
                        edge.updated_at,
                    ],
                )
                .map_err(|error| error.to_string())?;
        }
    }

    for annotation in &request.annotations {
        let points =
            serde_json::to_string(&annotation.points).map_err(|error| error.to_string())?;
        connection
            .execute(
                "INSERT INTO canvas_annotations (
                    id,
                    canvas_id,
                    annotation_type,
                    points_json,
                    style_color,
                    style_width,
                    style_opacity,
                    text,
                    bounds_x,
                    bounds_y,
                    bounds_width,
                    bounds_height,
                    created_at,
                    updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                params![
                    annotation.id,
                    annotation.canvas_id,
                    annotation.annotation_type,
                    points,
                    annotation.style.color,
                    annotation.style.width,
                    annotation.style.opacity,
                    annotation.text.as_deref(),
                    annotation.bounds.position.x,
                    annotation.bounds.position.y,
                    annotation.bounds.size.width,
                    annotation.bounds.size.height,
                    annotation.created_at,
                    annotation.updated_at,
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    connection
        .execute(
            "UPDATE canvases SET updated_at = ?1 WHERE id = ?2",
            params![current_timestamp(), request.canvas_id],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "UPDATE projects SET updated_at = ?1 WHERE id = ?2",
            params![current_timestamp(), request.constellation_id],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

pub fn attach_constellation_resource_root_at(
    request: ResourceRootMutationRequest,
) -> Result<ResourceRootPayload, String> {
    let database =
        Database::open(PathBuf::from(&request.database_path)).map_err(|error| error.to_string())?;
    ensure_workspace_constellations(database.connection(), &workspace_root())?;

    let constellation = load_constellation(database.connection(), &request.constellation_id)?;
    validate_resource_root_attachment(&constellation, &request.root_path)?;

    ResourceRootRepository::new(database.connection())
        .attach(
            &constellation.id,
            PathBuf::from(&request.root_path),
            request.display_name,
        )
        .map(resource_root_payload)
        .map_err(|error| error.to_string())
}

pub fn detach_constellation_resource_root_at(
    request: ResourceRootMutationRequest,
) -> Result<(), String> {
    let database =
        Database::open(PathBuf::from(&request.database_path)).map_err(|error| error.to_string())?;
    ensure_workspace_constellations(database.connection(), &workspace_root())?;

    let constellation = load_constellation(database.connection(), &request.constellation_id)?;
    ResourceRootRepository::new(database.connection())
        .detach(&constellation.id, PathBuf::from(&request.root_path))
        .map_err(|error| error.to_string())
}

pub fn list_constellation_resource_roots_at(
    request: ResourceRootLookupRequest,
) -> Result<Vec<ResourceRootPayload>, String> {
    let database =
        Database::open(PathBuf::from(&request.database_path)).map_err(|error| error.to_string())?;
    ensure_workspace_constellations(database.connection(), &workspace_root())?;

    list_constellation_resource_roots(database.connection(), &request.constellation_id)
        .map(|roots| roots.into_iter().map(resource_root_payload).collect())
}

fn constellation_tree_payload(constellation: Constellation) -> ConstellationTreeNodePayload {
    ConstellationTreeNodePayload {
        id: constellation.id,
        name: constellation.display_name,
        slug: constellation.slug,
        root_path: constellation.root_path,
        summary: constellation.summary.unwrap_or_default(),
        parent_id: constellation.parent_constellation_id,
        children: Vec::new(),
    }
}

fn constellation_payload(
    constellation: Constellation,
) -> Result<WorkspaceConstellationPayload, String> {
    Ok(WorkspaceConstellationPayload {
        id: constellation.id,
        display_name: constellation.display_name,
        slug: constellation.slug,
        parent_constellation_id: constellation.parent_constellation_id,
        root_path: constellation.root_path,
        primary_canvas_id: constellation
            .primary_canvas_id
            .ok_or_else(|| "constellation missing primary canvas".to_string())?,
        summary: constellation.summary.unwrap_or_default(),
        cover_asset_path: constellation.cover_asset,
        publish_settings: parse_publish_settings(&constellation.publish_settings),
        created_at: constellation.created_at,
        updated_at: constellation.updated_at,
    })
}

fn list_constellation_resource_roots(
    connection: &Connection,
    constellation_id: &str,
) -> Result<Vec<ResourceRootRecord>, String> {
    ResourceRootRepository::new(connection)
        .list_for_constellation(constellation_id)
        .map_err(|error| error.to_string())
}

fn index_constellation_entries(
    constellation_root: &str,
    resource_roots: &[ResourceRootRecord],
) -> std::io::Result<Vec<IndexedEntry>> {
    let mut entries = index_constellation_root(constellation_root)?;

    for root in resource_roots {
        let root_path = PathBuf::from(&root.root_path);
        let root_name = if root.display_name.trim().is_empty() {
            root_path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("resource-root")
                .to_string()
        } else {
            root.display_name.clone()
        };

        entries.push(IndexedEntry {
            name: root_name.clone(),
            relative_path: root_name.clone(),
            absolute_path: root_path.clone(),
            kind: IndexedEntryKind::Directory,
            is_directory: true,
            depth: 0,
            size_bytes: 0,
        });

        let mut nested = index_constellation_root(&root_path)?;
        for entry in &mut nested {
            entry.relative_path = format!("{root_name}/{}", entry.relative_path);
            entry.depth += 1;
        }
        entries.extend(nested);
    }

    entries.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(entries)
}

fn validate_resource_root_attachment(
    constellation: &Constellation,
    root_path: &str,
) -> Result<(), String> {
    let constellation_root = Path::new(&constellation.root_path);
    let attachment_root = Path::new(root_path);

    let constellation_root =
        fs::canonicalize(constellation_root).map_err(|error| error.to_string())?;
    let attachment_root = fs::canonicalize(attachment_root).map_err(|error| error.to_string())?;

    if constellation_root == attachment_root {
        return Err("resource root must differ from the constellation working root".to_string());
    }

    Ok(())
}

fn resource_root_payload(record: ResourceRootRecord) -> ResourceRootPayload {
    ResourceRootPayload {
        id: record.id,
        constellation_id: record.constellation_id,
        root_path: record.root_path,
        display_name: record.display_name,
        created_at: record.created_at,
        updated_at: record.updated_at,
    }
}

fn parse_publish_settings(raw: &str) -> PublishSettingsPayload {
    let value: Value = serde_json::from_str(raw).unwrap_or_else(|_| json!({}));
    PublishSettingsPayload {
        include_resources: value
            .get("includeResources")
            .and_then(Value::as_bool)
            .unwrap_or(true),
        mobile_sequence_first: value
            .get("mobileSequenceFirst")
            .and_then(Value::as_bool)
            .unwrap_or(true),
        theme: value
            .get("theme")
            .and_then(Value::as_str)
            .unwrap_or("paper")
            .to_string(),
    }
}

fn indexed_entry_payload(entry: IndexedEntry) -> IndexedEntryPayload {
    let kind = indexed_entry_kind(&entry);
    IndexedEntryPayload {
        id: entry.relative_path.clone(),
        name: entry.name,
        relative_path: entry.relative_path.clone(),
        absolute_path: entry.absolute_path.to_string_lossy().to_string(),
        kind,
        is_directory: entry.is_directory,
        depth: entry.depth,
        size_bytes: entry.size_bytes,
    }
}

fn indexed_entry_kind(entry: &IndexedEntry) -> String {
    match entry.kind {
        IndexedEntryKind::Directory => "directory".to_string(),
        IndexedEntryKind::Markdown => "markdown".to_string(),
        IndexedEntryKind::Image => "image".to_string(),
        IndexedEntryKind::OtherFile => match entry
            .absolute_path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase())
            .as_deref()
        {
            Some("pdf") => "pdf".to_string(),
            Some("txt") | Some("text") | Some("log") => "text".to_string(),
            _ => "binary".to_string(),
        },
    }
}

fn layout_node_payloads(
    connection: &Connection,
    canvas_id: &str,
) -> Result<Vec<CanvasNodePayload>, String> {
    LayoutRepository::new(connection)
        .list_node_layout(canvas_id)
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(layout_node_payload)
        .collect()
}

fn layout_edge_payloads(
    connection: &Connection,
    canvas_id: &str,
    tombstoned_layout_edge_ids: &BTreeSet<String>,
) -> Result<Vec<CanvasEdgePayload>, String> {
    let layout = LayoutRepository::new(connection);
    // A legacy canvas document has no semantic edge snapshot of its own and
    // falls back to edge_layout. Suppress only layout rows whose exact graph
    // relationship has a local tombstone; unrelated/manual rows retain their
    // historical presentation and remain available to the reader.
    layout
        .list_edge_layout(canvas_id)
        .map_err(|error| error.to_string())?
        .into_iter()
        .filter(|edge| !tombstoned_layout_edge_ids.contains(&edge.id))
        .map(layout_edge_payload)
        .collect()
}

/// `canvas_edges` (older substance snapshots) and `edge_layout` (the current
/// presentation store) encode semantic relation drawings as
/// `graph:<local-relationship-id>`. Keep their tombstone filter in one place
/// so either legacy load path cannot revive a deleted local assertion.
fn tombstoned_semantic_edge_ids(connection: &Connection) -> Result<BTreeSet<String>, String> {
    let relationships = NodeRelationshipRepository::new(connection)
        .list_tombstones()
        .map_err(|error| error.to_string())?;
    Ok(relationships
        .into_iter()
        .filter(|relationship| relationship.is_tombstone)
        .map(|relationship| format!("graph:{}", relationship.relationship_id))
        .collect())
}

fn layout_node_payload(record: NodeLayoutRecord) -> Result<CanvasNodePayload, String> {
    let style: Value = serde_json::from_str(&record.style_json).unwrap_or_else(|_| json!({}));
    let sidecar = style.get("__canvasNode").unwrap_or(&Value::Null);
    let node_type = sidecar_string(sidecar, "type").unwrap_or_else(|| "note".to_string());
    let title = sidecar_string(sidecar, "title").unwrap_or_else(|| "Untitled".to_string());
    let summary = sidecar_string(sidecar, "summary")
        .or_else(|| sidecar_string(sidecar, "content"))
        .unwrap_or_default();
    let content = if node_type == "note" {
        sidecar_string(sidecar, "content").or_else(|| Some(summary.clone()))
    } else {
        None
    };

    Ok(CanvasNodePayload {
        id: record.graph_node_id,
        canvas_id: record.canvas_id,
        node_type: node_type.clone(),
        title,
        position: PositionPayload {
            x: record.position_x,
            y: record.position_y,
        },
        size: SizePayload {
            width: record.width,
            height: record.height,
        },
        summary,
        content,
        tags: sidecar_string_array(sidecar, "tags"),
        resource_kind: sidecar_string(sidecar, "resourceKind"),
        absolute_path: sidecar_string(sidecar, "absolutePath"),
        relative_path: sidecar_string(sidecar, "relativePath"),
        mime_type: sidecar_string(sidecar, "mimeType"),
        file_fingerprint: sidecar_string(sidecar, "fileFingerprint"),
        url: sidecar_string(sidecar, "url"),
        color: sidecar_string(sidecar, "color"),
        child_node_ids: sidecar_string_array(sidecar, "childNodeIds"),
        target_canvas_id: sidecar_string(sidecar, "targetCanvasId"),
        dot_colour: sidecar_string(&style, "dotColour"),
        bg_colour: sidecar_string(&style, "bgColour"),
        text_colour: sidecar_string(&style, "textColour"),
        thumbnail: sidecar_string(&style, "thumbnail"),
        sequence_caption: None,
        sequence_viewport: None,
        created_at: record.created_at,
        updated_at: record.updated_at,
    })
}

fn layout_edge_payload(record: EdgeLayoutRecord) -> Result<CanvasEdgePayload, String> {
    let style: Value = serde_json::from_str(&record.style_json).unwrap_or_else(|_| json!({}));
    Ok(CanvasEdgePayload {
        id: record.id,
        canvas_id: record.canvas_id,
        source_node_id: record.source_graph_node_id,
        target_node_id: record.target_graph_node_id,
        source_handle_id: record.source_handle_id,
        target_handle_id: record.target_handle_id,
        relation_kind: record.relation_kind.clone(),
        directionality: "forward".to_string(),
        label: record.relation_kind,
        note: String::new(),
        style: EdgeStylePayload {
            stroke: sidecar_string(&style, "stroke").unwrap_or_else(|| "#888888".to_string()),
            width: style.get("width").and_then(Value::as_f64).unwrap_or(1.0),
            dashed: style
                .get("dashed")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        },
        sequencing: false,
        sequence_priority: 0,
        created_at: record.created_at,
        updated_at: record.updated_at,
    })
}

fn sidecar_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|text| !text.is_empty())
}

fn sidecar_string_array(value: &Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn node_payload(
    record: crate::db::repositories::CanvasNodeRecord,
) -> Result<CanvasNodePayload, String> {
    Ok(CanvasNodePayload {
        id: record.id,
        canvas_id: record.canvas_id,
        node_type: record.node_type,
        title: record.title,
        position: PositionPayload {
            x: record.position_x,
            y: record.position_y,
        },
        size: SizePayload {
            width: record.width,
            height: record.height,
        },
        summary: record.summary,
        content: record.content,
        tags: record.tags,
        resource_kind: record.resource_kind,
        absolute_path: record.absolute_path,
        relative_path: record.relative_path,
        mime_type: record.mime_type,
        file_fingerprint: record.file_fingerprint,
        url: record.url,
        color: record.color,
        child_node_ids: record.child_node_ids,
        target_canvas_id: record.target_canvas_id,
        dot_colour: record.dot_colour,
        bg_colour: record.bg_colour,
        text_colour: record.text_colour,
        thumbnail: record.thumbnail,
        sequence_caption: record.sequence_caption,
        sequence_viewport: record
            .sequence_viewport_json
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok()),
        created_at: record.created_at,
        updated_at: record.updated_at,
    })
}

fn edge_payload(
    record: crate::db::repositories::CanvasEdgeRecord,
) -> Result<CanvasEdgePayload, String> {
    let style: EdgeStylePayload =
        serde_json::from_str(&record.style_json).map_err(|error| error.to_string())?;
    Ok(CanvasEdgePayload {
        id: record.id,
        canvas_id: record.canvas_id,
        source_node_id: record.source_node_id,
        target_node_id: record.target_node_id,
        source_handle_id: record.source_handle_id,
        target_handle_id: record.target_handle_id,
        relation_kind: record.relation_kind,
        directionality: record.directionality,
        label: record.label,
        note: record.note,
        style,
        sequencing: record.sequencing,
        sequence_priority: record.sequence_priority,
        created_at: record.created_at,
        updated_at: record.updated_at,
    })
}

fn annotation_payload(
    record: crate::db::repositories::AnnotationRecord,
) -> Result<AnnotationPayload, String> {
    let points: Vec<AnnotationPointPayload> =
        serde_json::from_str(&record.points_json).map_err(|error| error.to_string())?;
    Ok(AnnotationPayload {
        id: record.id,
        canvas_id: record.canvas_id,
        annotation_type: record.annotation_type,
        points,
        style: AnnotationStylePayload {
            color: record.style_color,
            width: record.style_width,
            opacity: record.style_opacity,
        },
        text: record.text,
        bounds: AnnotationBoundsPayload {
            position: PositionPayload {
                x: record.bounds_x,
                y: record.bounds_y,
            },
            size: SizePayload {
                width: record.bounds_width,
                height: record.bounds_height,
            },
        },
        created_at: record.created_at,
        updated_at: record.updated_at,
    })
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryEntry {
    pub path: String,
    pub name: String,
    pub depth: u32,
}

#[tauri::command]
pub fn list_directories_command() -> Result<Vec<DirectoryEntry>, String> {
    list_directories_at()
}

pub fn list_directories_at() -> Result<Vec<DirectoryEntry>, String> {
    let home = dirs::home_dir().ok_or_else(|| "cannot resolve home directory".to_string())?;
    let mut entries = Vec::new();
    let skip_names: std::collections::HashSet<&str> = [
        "node_modules",
        ".git",
        "__pycache__",
        "target",
        ".Trash",
        ".cache",
        ".npm",
        ".cargo",
        "Library",
        ".local",
    ]
    .into_iter()
    .collect();

    walk_directories(&home, 0, 4, &skip_names, &mut entries);
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(entries)
}

fn walk_directories(
    dir: &std::path::Path,
    depth: u32,
    max_depth: u32,
    skip: &std::collections::HashSet<&str>,
    out: &mut Vec<DirectoryEntry>,
) {
    if depth > max_depth {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if !file_type.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || skip.contains(name.as_str()) {
            continue;
        }
        let path = entry.path();
        out.push(DirectoryEntry {
            path: path.to_string_lossy().to_string(),
            name,
            depth,
        });
        walk_directories(&path, depth + 1, max_depth, skip, out);
    }
}

#[tauri::command]
pub fn activate_canvas_command(canvas_id: String, api_state: tauri::State<SharedApiState>) {
    let mut state = api_state.lock().unwrap();
    state.active_canvas_id = Some(canvas_id);
}

#[tauri::command]
pub fn read_workspace_text_file_command(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSequencePayload {
    pub id: String,
    pub constellation_id: String,
    pub canvas_id: String,
    pub name: String,
    pub root_node_id: Option<String>,
    pub edge_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSavedSequenceRequest {
    pub database_path: String,
    pub constellation_id: String,
    pub canvas_id: String,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSavedSequenceRequest {
    pub database_path: String,
    pub id: String,
    pub name: String,
    pub root_node_id: Option<String>,
    pub edge_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSavedSequenceRequest {
    pub database_path: String,
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSavedSequencesRequest {
    pub database_path: String,
    pub canvas_id: String,
}

#[tauri::command]
pub fn list_saved_sequences_command(
    request: ListSavedSequencesRequest,
) -> Result<Vec<SavedSequencePayload>, String> {
    let db = Database::open(PathBuf::from(&request.database_path)).map_err(|e| e.to_string())?;
    let repo = SavedSequenceRepository::new(db.connection());
    repo.list_for_canvas(&request.canvas_id)
        .map(|recs| recs.into_iter().map(saved_sequence_payload).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_saved_sequence_command(
    request: CreateSavedSequenceRequest,
) -> Result<SavedSequencePayload, String> {
    let db = Database::open(PathBuf::from(&request.database_path)).map_err(|e| e.to_string())?;
    let repo = SavedSequenceRepository::new(db.connection());
    repo.create(&request.constellation_id, &request.canvas_id, &request.name)
        .map(saved_sequence_payload)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_saved_sequence_command(
    request: UpdateSavedSequenceRequest,
) -> Result<SavedSequencePayload, String> {
    let db = Database::open(PathBuf::from(&request.database_path)).map_err(|e| e.to_string())?;
    let repo = SavedSequenceRepository::new(db.connection());
    repo.update(
        &request.id,
        &request.name,
        request.root_node_id.as_deref(),
        &request.edge_ids,
    )
    .map(saved_sequence_payload)
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_saved_sequence_command(request: DeleteSavedSequenceRequest) -> Result<(), String> {
    let db = Database::open(PathBuf::from(&request.database_path)).map_err(|e| e.to_string())?;
    let repo = SavedSequenceRepository::new(db.connection());
    repo.delete(&request.id).map_err(|e| e.to_string())
}

fn saved_sequence_payload(record: SavedSequenceRecord) -> SavedSequencePayload {
    SavedSequencePayload {
        id: record.id,
        constellation_id: record.constellation_id,
        canvas_id: record.canvas_id,
        name: record.name,
        root_node_id: record.root_node_id,
        edge_ids: record.edge_ids,
        created_at: record.created_at,
        updated_at: record.updated_at,
    }
}

use std::{
    env, fs,
    path::{Path, PathBuf},
};

use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{
    db::{
        connection::Database,
        repositories::{
            AnnotationRepository, CanvasGraphRepository, Project, ProjectRepository,
            ResourceRootRecord, ResourceRootRepository, SequenceRepository,
        },
    },
    fs::indexer::{index_directory, IndexedEntry, IndexedEntryKind},
    SharedApiState,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBootstrap {
    pub active_project_id: String,
    pub database_path: String,
    pub projects: Vec<ProjectTreeNodePayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTreeNodePayload {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub root_path: String,
    pub summary: String,
    pub parent_id: Option<String>,
    pub children: Vec<ProjectTreeNodePayload>,
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
pub struct WorkspaceProjectPayload {
    pub id: String,
    pub display_name: String,
    pub slug: String,
    pub parent_project_id: Option<String>,
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
    pub project_id: String,
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
    pub relation_kind: String,
    pub directionality: String,
    pub label: String,
    pub note: String,
    pub style: EdgeStylePayload,
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
pub struct ViewportPayload {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SequencePayload {
    pub id: String,
    pub project_id: String,
    pub canvas_id: String,
    pub name: String,
    pub kind: String,
    pub description: String,
    pub published: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SequenceStepPayload {
    pub id: String,
    pub sequence_id: String,
    pub position: i64,
    pub target_type: String,
    pub target_id: String,
    pub caption: String,
    pub viewport: ViewportPayload,
    pub transition_hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDocumentPayload {
    pub working_root: String,
    pub canvas_id: String,
    pub database_path: String,
    pub entries: Vec<IndexedEntryPayload>,
    pub resource_roots: Vec<ResourceRootPayload>,
    pub project: WorkspaceProjectPayload,
    pub annotations: Vec<AnnotationPayload>,
    pub edges: Vec<CanvasEdgePayload>,
    pub nodes: Vec<CanvasNodePayload>,
    pub sequence_steps: Vec<SequenceStepPayload>,
    pub sequences: Vec<SequencePayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDocumentRequest {
    pub database_path: String,
    pub project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistProjectDocumentRequest {
    pub annotations: Vec<AnnotationPayload>,
    pub canvas_id: String,
    pub database_path: String,
    pub edges: Vec<CanvasEdgePayload>,
    pub nodes: Vec<CanvasNodePayload>,
    pub project_id: String,
    pub sequence_steps: Vec<SequenceStepPayload>,
    pub sequences: Vec<SequencePayload>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceRootMutationRequest {
    pub database_path: String,
    pub project_id: String,
    pub root_path: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceRootLookupRequest {
    pub database_path: String,
    pub project_id: String,
}

pub fn index_project_root(root: impl AsRef<Path>) -> std::io::Result<Vec<IndexedEntry>> {
    index_directory(root)
}

#[tauri::command]
pub fn bootstrap_workspace_command(
    api_state: tauri::State<SharedApiState>,
) -> Result<WorkspaceBootstrap, String> {
    let database_path = default_database_path(None);
    let result = bootstrap_workspace_at(&database_path)?;
    {
        let mut api = api_state.lock().unwrap();
        api.db_path = Some(database_path.to_string_lossy().to_string());
        api.active_project_id = Some(result.active_project_id.clone());
    }
    Ok(result)
}

#[tauri::command]
pub fn load_project_document_command(
    request: ProjectDocumentRequest,
) -> Result<ProjectDocumentPayload, String> {
    load_project_document_at(&request.database_path, &request.project_id)
}

#[tauri::command]
pub fn persist_project_document_command(
    request: PersistProjectDocumentRequest,
) -> Result<ProjectDocumentPayload, String> {
    persist_project_document_at(request)
}

#[tauri::command]
pub fn attach_project_resource_root_command(
    request: ResourceRootMutationRequest,
) -> Result<ResourceRootPayload, String> {
    attach_project_resource_root_at(request)
}

#[tauri::command]
pub fn detach_project_resource_root_command(
    request: ResourceRootMutationRequest,
) -> Result<(), String> {
    detach_project_resource_root_at(request)
}

#[tauri::command]
pub fn list_project_resource_roots_command(
    request: ResourceRootLookupRequest,
) -> Result<Vec<ResourceRootPayload>, String> {
    list_project_resource_roots_at(request)
}

pub fn bootstrap_workspace_at(
    database_path: impl AsRef<Path>,
) -> Result<WorkspaceBootstrap, String> {
    let database_path = database_path.as_ref().to_path_buf();
    let database = Database::open(&database_path).map_err(|error| error.to_string())?;
    ensure_seeded_workspace(database.connection(), &workspace_root())?;

    let projects = list_projects_flat(database.connection())?;
    let active_project_id = projects
        .iter()
        .find(|project| project.parent_project_id.is_none())
        .or_else(|| projects.first())
        .map(|project| project.id.clone())
        .ok_or_else(|| "workspace bootstrap found no projects".to_string())?;

    Ok(WorkspaceBootstrap {
        active_project_id,
        database_path: database_path.to_string_lossy().to_string(),
        projects: projects.into_iter().map(project_tree_payload).collect(),
    })
}

pub fn load_project_document_at(
    database_path: impl AsRef<Path>,
    project_id: &str,
) -> Result<ProjectDocumentPayload, String> {
    let database_path = database_path.as_ref().to_path_buf();
    let database = Database::open(&database_path).map_err(|error| error.to_string())?;
    ensure_seeded_workspace(database.connection(), &workspace_root())?;

    let project = load_project(database.connection(), project_id)?;
    let canvas_id = project
        .primary_canvas_id
        .clone()
        .ok_or_else(|| format!("project {} is missing a primary canvas", project.id))?;

    let resource_roots = list_project_resource_roots(database.connection(), &project.id)?;
    let entries = index_project_root(&project.root_path).map_err(|error| error.to_string())?;
    let graph = CanvasGraphRepository::new(database.connection());
    let snapshot = graph
        .load_canvas_snapshot(&canvas_id)
        .map_err(|error| error.to_string())?;

    let annotations = AnnotationRepository::new(database.connection())
        .list_for_canvas(&canvas_id)
        .map_err(|error| error.to_string())?;
    let sequences = SequenceRepository::new(database.connection())
        .list_for_canvas(&canvas_id)
        .map_err(|error| error.to_string())?;

    let mut sequence_steps = Vec::new();
    let repository = SequenceRepository::new(database.connection());
    for sequence in &sequences {
        let mut steps = repository
            .list_steps(&sequence.id)
            .map_err(|error| error.to_string())?;
        sequence_steps.append(&mut steps);
    }

    Ok(ProjectDocumentPayload {
        working_root: project.root_path.clone(),
        canvas_id,
        database_path: database_path.to_string_lossy().to_string(),
        entries: entries.into_iter().map(indexed_entry_payload).collect(),
        resource_roots: resource_roots
            .into_iter()
            .map(resource_root_payload)
            .collect(),
        project: project_payload(project)?,
        annotations: annotations
            .into_iter()
            .map(annotation_payload)
            .collect::<Result<Vec<_>, _>>()?,
        edges: snapshot
            .edges
            .into_iter()
            .map(edge_payload)
            .collect::<Result<Vec<_>, _>>()?,
        nodes: snapshot
            .nodes
            .into_iter()
            .map(node_payload)
            .collect::<Result<Vec<_>, _>>()?,
        sequence_steps: sequence_steps
            .into_iter()
            .map(sequence_step_payload)
            .collect::<Result<Vec<_>, _>>()?,
        sequences: sequences.into_iter().map(sequence_payload).collect(),
    })
}

pub fn persist_project_document_at(
    request: PersistProjectDocumentRequest,
) -> Result<ProjectDocumentPayload, String> {
    let database_path = PathBuf::from(&request.database_path);
    let mut database = Database::open(&database_path).map_err(|error| error.to_string())?;
    ensure_seeded_workspace(database.connection(), &workspace_root())?;

    {
        let transaction = database
            .connection_mut()
            .transaction()
            .map_err(|error| error.to_string())?;
        replace_project_document(&transaction, &request)?;
        transaction.commit().map_err(|error| error.to_string())?;
    }

    load_project_document_at(database_path, &request.project_id)
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

pub fn default_database_path(session_id: Option<&str>) -> PathBuf {
    match session_id {
        Some(session_id) if !session_id.trim().is_empty() => {
            env::temp_dir().join(format!("research-canvas-browser-{session_id}.sqlite"))
        }
        _ => env::temp_dir().join("research-canvas-authoring.sqlite"),
    }
}

fn ensure_seeded_workspace(connection: &Connection, root: &Path) -> Result<(), String> {
    let project_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if project_count > 0 {
        return Ok(());
    }

    let projects = ProjectRepository::new(connection);
    let sample_project = projects
        .create(
            "sample-project".to_string(),
            "sample-project".to_string(),
            None,
            root.join("tests/fixtures/sample-project")
                .to_string_lossy()
                .to_string(),
            Some("Seed workspace for explorer and export flows.".to_string()),
            None,
            json!({
                "includeResources": true,
                "mobileSequenceFirst": true,
                "theme": "paper"
            }),
        )
        .map_err(|error| error.to_string())?;

    projects
        .create(
            "ep-0.1".to_string(),
            "ep-0-1".to_string(),
            Some(sample_project.id.clone()),
            root.join("episodes/ep-0.1").to_string_lossy().to_string(),
            Some("Markdown-heavy nested project.".to_string()),
            None,
            json!({
                "includeResources": true,
                "mobileSequenceFirst": true,
                "theme": "paper"
            }),
        )
        .map_err(|error| error.to_string())?;

    projects
        .create(
            "ep-0.2".to_string(),
            "ep-0-2".to_string(),
            Some(sample_project.id),
            root.join("episodes/ep-0.2").to_string_lossy().to_string(),
            Some("Research reports and media assets.".to_string()),
            None,
            json!({
                "includeResources": true,
                "mobileSequenceFirst": true,
                "theme": "paper"
            }),
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn list_projects_flat(connection: &Connection) -> Result<Vec<Project>, String> {
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
            Ok(Project {
                id: row.get(0)?,
                display_name: row.get(1)?,
                slug: row.get(2)?,
                parent_project_id: row.get(3)?,
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

fn load_project(connection: &Connection, project_id: &str) -> Result<Project, String> {
    ProjectRepository::new(connection)
        .get_by_id(project_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("project {project_id} was not found"))
}

fn replace_project_document(
    connection: &Connection,
    request: &PersistProjectDocumentRequest,
) -> Result<(), String> {
    connection
        .execute(
            "DELETE FROM sequence_steps
             WHERE sequence_id IN (
                 SELECT id FROM sequences WHERE canvas_id = ?1
             )",
            [&request.canvas_id],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "DELETE FROM sequences WHERE canvas_id = ?1",
            [&request.canvas_id],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "DELETE FROM canvas_annotations WHERE canvas_id = ?1",
            [&request.canvas_id],
        )
        .map_err(|error| error.to_string())?;
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
                    created_at,
                    updated_at
                ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
                    ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26
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
                    relation_kind,
                    directionality,
                    label,
                    note,
                    style_json,
                    created_at,
                    updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    edge.id,
                    edge.canvas_id,
                    edge.source_node_id,
                    edge.target_node_id,
                    edge.relation_kind,
                    edge.directionality,
                    edge.label,
                    edge.note,
                    style,
                    edge.created_at,
                    edge.updated_at,
                ],
            )
            .map_err(|error| error.to_string())?;
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

    for sequence in &request.sequences {
        connection
            .execute(
                "INSERT INTO sequences (
                    id,
                    project_id,
                    canvas_id,
                    name,
                    kind,
                    description,
                    published,
                    created_at,
                    updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    sequence.id,
                    sequence.project_id,
                    sequence.canvas_id,
                    sequence.name,
                    sequence.kind,
                    sequence.description,
                    sequence.published as i64,
                    sequence.created_at,
                    sequence.updated_at,
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    for step in &request.sequence_steps {
        let viewport = serde_json::to_string(&step.viewport).map_err(|error| error.to_string())?;
        connection
            .execute(
                "INSERT INTO sequence_steps (
                    id,
                    sequence_id,
                    position,
                    target_type,
                    target_id,
                    caption,
                    viewport_json,
                    transition_hint,
                    created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    step.id,
                    step.sequence_id,
                    step.position,
                    step.target_type,
                    step.target_id,
                    step.caption,
                    viewport,
                    step.transition_hint,
                    current_timestamp(),
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
            params![current_timestamp(), request.project_id],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

pub fn attach_project_resource_root_at(
    request: ResourceRootMutationRequest,
) -> Result<ResourceRootPayload, String> {
    let database =
        Database::open(PathBuf::from(&request.database_path)).map_err(|error| error.to_string())?;
    ensure_seeded_workspace(database.connection(), &workspace_root())?;

    let project = load_project(database.connection(), &request.project_id)?;
    validate_resource_root_attachment(&project, &request.root_path)?;

    ResourceRootRepository::new(database.connection())
        .attach(
            &project.id,
            PathBuf::from(&request.root_path),
            request.display_name,
        )
        .map(resource_root_payload)
        .map_err(|error| error.to_string())
}

pub fn detach_project_resource_root_at(request: ResourceRootMutationRequest) -> Result<(), String> {
    let database =
        Database::open(PathBuf::from(&request.database_path)).map_err(|error| error.to_string())?;
    ensure_seeded_workspace(database.connection(), &workspace_root())?;

    let project = load_project(database.connection(), &request.project_id)?;
    ResourceRootRepository::new(database.connection())
        .detach(&project.id, PathBuf::from(&request.root_path))
        .map_err(|error| error.to_string())
}

pub fn list_project_resource_roots_at(
    request: ResourceRootLookupRequest,
) -> Result<Vec<ResourceRootPayload>, String> {
    let database =
        Database::open(PathBuf::from(&request.database_path)).map_err(|error| error.to_string())?;
    ensure_seeded_workspace(database.connection(), &workspace_root())?;

    list_project_resource_roots(database.connection(), &request.project_id)
        .map(|roots| roots.into_iter().map(resource_root_payload).collect())
}

fn project_tree_payload(project: Project) -> ProjectTreeNodePayload {
    ProjectTreeNodePayload {
        id: project.id,
        name: project.display_name,
        slug: project.slug,
        root_path: project.root_path,
        summary: project.summary.unwrap_or_default(),
        parent_id: project.parent_project_id,
        children: Vec::new(),
    }
}

fn project_payload(project: Project) -> Result<WorkspaceProjectPayload, String> {
    Ok(WorkspaceProjectPayload {
        id: project.id,
        display_name: project.display_name,
        slug: project.slug,
        parent_project_id: project.parent_project_id,
        root_path: project.root_path,
        primary_canvas_id: project
            .primary_canvas_id
            .ok_or_else(|| "project missing primary canvas".to_string())?,
        summary: project.summary.unwrap_or_default(),
        cover_asset_path: project.cover_asset,
        publish_settings: parse_publish_settings(&project.publish_settings),
        created_at: project.created_at,
        updated_at: project.updated_at,
    })
}

fn list_project_resource_roots(
    connection: &Connection,
    project_id: &str,
) -> Result<Vec<ResourceRootRecord>, String> {
    ResourceRootRepository::new(connection)
        .list_for_project(project_id)
        .map_err(|error| error.to_string())
}

fn validate_resource_root_attachment(project: &Project, root_path: &str) -> Result<(), String> {
    let project_root = Path::new(&project.root_path);
    let attachment_root = Path::new(root_path);

    let project_root = fs::canonicalize(project_root).map_err(|error| error.to_string())?;
    let attachment_root = fs::canonicalize(attachment_root).map_err(|error| error.to_string())?;

    if project_root == attachment_root {
        return Err("resource root must differ from the project working root".to_string());
    }

    Ok(())
}

fn resource_root_payload(record: ResourceRootRecord) -> ResourceRootPayload {
    ResourceRootPayload {
        id: record.id,
        project_id: record.project_id,
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
        relation_kind: record.relation_kind,
        directionality: record.directionality,
        label: record.label,
        note: record.note,
        style,
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

fn sequence_payload(record: crate::db::repositories::SequenceRecord) -> SequencePayload {
    SequencePayload {
        id: record.id,
        project_id: record.project_id,
        canvas_id: record.canvas_id,
        name: record.name,
        kind: record.kind,
        description: record.description,
        published: record.published,
        created_at: record.created_at,
        updated_at: record.updated_at,
    }
}

fn sequence_step_payload(
    record: crate::db::repositories::SequenceStepRecord,
) -> Result<SequenceStepPayload, String> {
    let viewport: ViewportPayload =
        serde_json::from_str(&record.viewport_json).map_err(|error| error.to_string())?;
    Ok(SequenceStepPayload {
        id: record.id,
        sequence_id: record.sequence_id,
        position: record.position,
        target_type: record.target_type,
        target_id: record.target_id,
        caption: record.caption,
        viewport,
        transition_hint: record.transition_hint,
    })
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

#[tauri::command]
pub fn activate_canvas_command(
    canvas_id: String,
    api_state: tauri::State<SharedApiState>,
) {
    let mut state = api_state.lock().unwrap();
    state.active_canvas_id = Some(canvas_id);
}

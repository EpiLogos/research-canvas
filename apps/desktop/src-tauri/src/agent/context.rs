use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::agent::{
    project::{
        load_project_roots_from_connection, search_project_files, AgentProjectSearchHit,
        AgentRootKind,
    },
    types::AgentWarning,
    vault::{backlinks, index_vault_roots, Backlink},
};
use crate::db::{
    canvas_service::CanvasService,
    connection::Database,
    neo4j::{self, config::Neo4jConfig},
    repositories::{
        graph::{GraphNode, GraphRelationship, GraphRepository},
        layout::{LayoutRepository, NodeLayoutRecord},
    },
};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextPack {
    pub query: String,
    pub project: ContextProject,
    #[serde(default)]
    pub files: Vec<ContextFile>,
    #[serde(default)]
    pub nodes: Vec<ContextNode>,
    pub timeline: ContextTimeline,
    pub constellation: ContextConstellation,
    #[serde(default)]
    pub warnings: Vec<AgentWarning>,
    #[serde(default)]
    pub suggested_next_actions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextProject {
    pub id: String,
    pub display_name: String,
    pub root_path: String,
    pub primary_canvas_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextFile {
    pub path: String,
    pub relative_path: String,
    pub title: String,
    pub score: f64,
    pub snippet: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub wikilinks: Vec<ContextWikiLink>,
    #[serde(default)]
    pub backlinks: Vec<Backlink>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextWikiLink {
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alias: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextNode {
    pub graph_node_id: String,
    pub entity_type: String,
    pub title: String,
    pub summary: String,
    pub temporal: ContextTemporal,
    #[serde(default)]
    pub evidence_tags: Vec<String>,
    pub source_kind: Option<String>,
    #[serde(default)]
    pub relationships: Vec<ContextRelationship>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextTemporal {
    pub is_temporal: bool,
    pub valid_from: Option<String>,
    pub valid_to: Option<String>,
    pub precision: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextRelationship {
    pub id: String,
    pub rel_type: String,
    pub source_graph_node_id: String,
    pub target_graph_node_id: String,
    pub properties: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextTimeline {
    pub canvas_id: Option<String>,
    #[serde(default)]
    pub neighbor_nodes: Vec<ContextTimelineNode>,
    pub visible_range: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextTimelineNode {
    pub graph_node_id: String,
    pub position_x: f64,
    pub position_y: f64,
    pub width: f64,
    pub height: f64,
    pub style: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextConstellation {
    #[serde(rename = "constellationId", alias = "projectId")]
    pub project_id: String,
    pub canvas_id: Option<String>,
    pub node_count: usize,
    pub relationship_count: usize,
    #[serde(default)]
    pub node_ids: Vec<String>,
    #[serde(default)]
    pub relationship_ids: Vec<String>,
}

pub fn build_context_pack(
    database_path: impl AsRef<Path>,
    project_id: &str,
    query: &str,
    limit: usize,
) -> Result<ContextPack, String> {
    let database_path = database_path.as_ref();
    let database = Database::open(database_path).map_err(|error| error.to_string())?;
    let roots = load_project_roots_from_connection(database.connection(), project_id)?;
    let project_root_path = roots
        .roots
        .iter()
        .find(|root| root.kind == AgentRootKind::Project)
        .map(|root| root.canonical_path.clone())
        .unwrap_or_else(|| roots.root_path.clone());
    let canvas_id = roots.primary_canvas_id.clone();
    let (timeline, constellation) =
        sqlite_canvas_context(database.connection(), project_id, &canvas_id)?;
    let mut warnings = roots.warnings.clone();

    let search = search_project_files(database_path, project_id, query, limit)?;
    warnings.extend(search.warnings.clone());
    let files = context_files_from_search_hits(&search.hits, &search.roots, &mut warnings)?;

    let mut nodes = Vec::new();
    match load_graph_context(
        database_path,
        canvas_id.as_deref(),
        &constellation.node_ids,
        query,
        limit,
    ) {
        Ok(graph_context) => {
            nodes = graph_context.nodes;
            warnings.extend(graph_context.warnings);
            if let Some(graph_timeline) = graph_context.timeline {
                return Ok(ContextPack {
                    query: query.to_string(),
                    project: ContextProject {
                        id: roots.project_id,
                        display_name: roots.display_name,
                        root_path: project_root_path,
                        primary_canvas_id: canvas_id,
                    },
                    files,
                    nodes,
                    timeline: graph_timeline,
                    constellation,
                    warnings,
                    suggested_next_actions: Vec::new(),
                });
            }
        }
        Err(warning) => warnings.push(warning),
    }

    Ok(ContextPack {
        query: query.to_string(),
        project: ContextProject {
            id: roots.project_id,
            display_name: roots.display_name,
            root_path: project_root_path,
            primary_canvas_id: canvas_id,
        },
        files,
        nodes,
        timeline,
        constellation,
        warnings,
        suggested_next_actions: Vec::new(),
    })
}

fn context_files_from_search_hits(
    hits: &[AgentProjectSearchHit],
    roots: &[crate::agent::project::AgentProjectRoot],
    warnings: &mut Vec<AgentWarning>,
) -> Result<Vec<ContextFile>, String> {
    let existing_roots = roots
        .iter()
        .filter(|root| root.exists)
        .map(|root| PathBuf::from(&root.canonical_path))
        .collect::<Vec<_>>();
    let documents = index_vault_roots(existing_roots.iter()).map_err(|error| error.to_string())?;
    let documents_by_path = documents
        .into_iter()
        .map(|document| (document.absolute_path.clone(), document))
        .collect::<HashMap<_, _>>();

    let mut files = Vec::new();
    let mut seen = BTreeSet::new();
    for hit in hits.iter().filter(|hit| hit.entity_type == "file") {
        let Some(source_path) = hit.source_path.as_deref() else {
            continue;
        };
        let canonical_path = canonical_path_string(source_path);
        if !seen.insert(canonical_path.clone()) {
            continue;
        }
        let Some(document) = documents_by_path.get(&canonical_path) else {
            warnings.push(AgentWarning {
                code: "context_file_missing".to_string(),
                message: format!(
                    "search hit source was not present in indexed vault documents: {source_path}"
                ),
                path: Some(source_path.to_string()),
            });
            continue;
        };
        let root_path =
            root_path_for_document(document, roots).unwrap_or_else(|| document.root_path.clone());
        let backlinks = backlinks_for_document(&root_path, &document.relative_path, warnings);
        files.push(ContextFile {
            path: document.absolute_path.clone(),
            relative_path: document.relative_path.clone(),
            title: document.title.clone(),
            score: context_score(hit.score),
            snippet: hit.snippet.clone(),
            tags: document.tags.clone(),
            wikilinks: document
                .wikilinks
                .iter()
                .map(|link| ContextWikiLink {
                    target: link.target.clone(),
                    alias: link.label.clone(),
                })
                .collect(),
            backlinks,
        });
    }
    Ok(files)
}

fn sqlite_canvas_context(
    connection: &rusqlite::Connection,
    project_id: &str,
    canvas_id: &Option<String>,
) -> Result<(ContextTimeline, ContextConstellation), String> {
    let Some(canvas_id) = canvas_id else {
        return Ok((
            ContextTimeline {
                canvas_id: None,
                neighbor_nodes: Vec::new(),
                visible_range: None,
            },
            ContextConstellation {
                project_id: project_id.to_string(),
                canvas_id: None,
                node_count: 0,
                relationship_count: 0,
                node_ids: Vec::new(),
                relationship_ids: Vec::new(),
            },
        ));
    };

    let layout = LayoutRepository::new(connection);
    let node_rows = layout
        .list_node_layout(canvas_id)
        .map_err(|error| error.to_string())?;
    let edge_rows = layout
        .list_edge_layout(canvas_id)
        .map_err(|error| error.to_string())?;
    let app_state = layout
        .get_app_state(canvas_id)
        .map_err(|error| error.to_string())?;
    let visible_range = app_state
        .and_then(|state| serde_json::from_str::<serde_json::Value>(&state.app_state_json).ok())
        .and_then(|state| state.get("visibleRange").cloned());
    let neighbor_nodes = node_rows.iter().map(timeline_node_from_layout).collect();

    Ok((
        ContextTimeline {
            canvas_id: Some(canvas_id.clone()),
            neighbor_nodes,
            visible_range,
        },
        ContextConstellation {
            project_id: project_id.to_string(),
            canvas_id: Some(canvas_id.clone()),
            node_count: node_rows.len(),
            relationship_count: edge_rows.len(),
            node_ids: node_rows
                .iter()
                .map(|row| row.graph_node_id.clone())
                .collect(),
            relationship_ids: edge_rows.into_iter().map(|row| row.id).collect(),
        },
    ))
}

struct GraphContext {
    nodes: Vec<ContextNode>,
    timeline: Option<ContextTimeline>,
    warnings: Vec<AgentWarning>,
}

fn load_graph_context(
    database_path: &Path,
    canvas_id: Option<&str>,
    allowed_node_ids: &[String],
    query: &str,
    limit: usize,
) -> Result<GraphContext, AgentWarning> {
    let config = Neo4jConfig::from_env().map_err(|error| AgentWarning {
        code: "neo4j_unconfigured".to_string(),
        message: error,
        path: None,
    })?;

    let database_path_string = database_path.to_string_lossy().to_string();
    let canvas_id = canvas_id.map(ToOwned::to_owned);
    let allowed_node_ids = allowed_node_ids
        .iter()
        .cloned()
        .collect::<std::collections::BTreeSet<_>>();
    let query = query.to_string();

    run_graph_blocking(async move {
        let graph = neo4j::connect(&config)
            .await
            .map_err(|error| AgentWarning {
                code: "neo4j_unavailable".to_string(),
                message: error,
                path: None,
            })?;
        let repo = GraphRepository::new(graph.clone(), config.database.clone());
        repo.ensure_schema().await.map_err(|error| AgentWarning {
            code: "neo4j_unavailable".to_string(),
            message: error,
            path: None,
        })?;
        let mut graph_nodes =
            repo.search_context(&query, 100)
                .await
                .map_err(|error| AgentWarning {
                    code: "neo4j_unavailable".to_string(),
                    message: error,
                    path: None,
                })?;
        graph_nodes.retain(|node| allowed_node_ids.contains(&node.graph_node_id));
        graph_nodes.truncate(limit);
        let mut relationships = Vec::new();
        for node in &graph_nodes {
            let node_relationships = repo
                .relationships_for_node(&node.graph_node_id)
                .await
                .map_err(|error| AgentWarning {
                    code: "neo4j_unavailable".to_string(),
                    message: error,
                    path: None,
                })?;
            relationships.extend(node_relationships);
        }
        relationships.sort_by(|left, right| {
            left.id
                .cmp(&right.id)
                .then_with(|| left.rel_type.cmp(&right.rel_type))
                .then_with(|| left.source_graph_node_id.cmp(&right.source_graph_node_id))
                .then_with(|| left.target_graph_node_id.cmp(&right.target_graph_node_id))
        });
        relationships.dedup_by(|left, right| left.id == right.id);
        let nodes = context_nodes_from_graph(graph_nodes, &relationships);
        let mut warnings = Vec::new();
        let timeline = if let Some(canvas_id) = canvas_id {
            let service = CanvasService::new(
                GraphRepository::new(graph, config.database.clone()),
                database_path_string,
            );
            match service.load_canvas_view(&canvas_id, "timeline").await {
                Ok(view) => Some(ContextTimeline {
                    canvas_id: Some(view.canvas_id),
                    neighbor_nodes: view
                        .nodes
                        .into_iter()
                        .map(|node| ContextTimelineNode {
                            graph_node_id: node.layout.graph_node_id,
                            position_x: node.layout.position_x,
                            position_y: node.layout.position_y,
                            width: node.layout.width,
                            height: node.layout.height,
                            style: node.layout.style,
                        })
                        .collect(),
                    visible_range: view.app_state.get("visibleRange").cloned(),
                }),
                Err(error) => {
                    warnings.push(AgentWarning {
                        code: "context_timeline_unavailable".to_string(),
                        message: error,
                        path: None,
                    });
                    None
                }
            }
        } else {
            None
        };
        Ok(GraphContext {
            nodes,
            timeline,
            warnings,
        })
    })
}

fn run_graph_blocking<F>(future: F) -> Result<GraphContext, AgentWarning>
where
    F: std::future::Future<Output = Result<GraphContext, AgentWarning>> + Send + 'static,
{
    if tokio::runtime::Handle::try_current().is_ok() {
        std::thread::spawn(move || run_graph_runtime(future))
            .join()
            .map_err(|_| AgentWarning {
                code: "neo4j_unavailable".to_string(),
                message: "Neo4j worker thread panicked".to_string(),
                path: None,
            })?
    } else {
        run_graph_runtime(future)
    }
}

fn run_graph_runtime<F>(future: F) -> Result<GraphContext, AgentWarning>
where
    F: std::future::Future<Output = Result<GraphContext, AgentWarning>>,
{
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| AgentWarning {
            code: "neo4j_unavailable".to_string(),
            message: format!("could not create Neo4j runtime: {error}"),
            path: None,
        })?;
    runtime.block_on(future)
}

fn context_nodes_from_graph(
    nodes: Vec<GraphNode>,
    relationships: &[GraphRelationship],
) -> Vec<ContextNode> {
    let mut context_nodes = nodes
        .into_iter()
        .map(|node| {
            let mut node_relationships = relationships
                .iter()
                .filter(|relationship| {
                    relationship.source_graph_node_id == node.graph_node_id
                        || relationship.target_graph_node_id == node.graph_node_id
                })
                .map(context_relationship_from_graph)
                .collect::<Vec<_>>();
            node_relationships.sort_by(|left, right| {
                left.id
                    .cmp(&right.id)
                    .then_with(|| left.rel_type.cmp(&right.rel_type))
                    .then_with(|| left.source_graph_node_id.cmp(&right.source_graph_node_id))
                    .then_with(|| left.target_graph_node_id.cmp(&right.target_graph_node_id))
            });
            ContextNode {
                graph_node_id: node.graph_node_id,
                entity_type: node.entity_type.as_str().to_string(),
                title: node.title,
                summary: node.summary,
                temporal: ContextTemporal {
                    is_temporal: node.is_temporal,
                    valid_from: node.valid_from,
                    valid_to: node.valid_to,
                    precision: node
                        .temporal_precision
                        .map(|value| value.as_str().to_string()),
                },
                evidence_tags: node.evidence_tags,
                source_kind: node.source_kind,
                relationships: node_relationships,
            }
        })
        .collect::<Vec<_>>();
    context_nodes.sort_by(|left, right| {
        left.title
            .cmp(&right.title)
            .then_with(|| left.graph_node_id.cmp(&right.graph_node_id))
    });
    context_nodes
}

fn context_relationship_from_graph(relationship: &GraphRelationship) -> ContextRelationship {
    ContextRelationship {
        id: relationship.id.clone(),
        rel_type: relationship.rel_type.clone(),
        source_graph_node_id: relationship.source_graph_node_id.clone(),
        target_graph_node_id: relationship.target_graph_node_id.clone(),
        properties: relationship.properties.clone(),
    }
}

fn timeline_node_from_layout(row: &NodeLayoutRecord) -> ContextTimelineNode {
    ContextTimelineNode {
        graph_node_id: row.graph_node_id.clone(),
        position_x: row.position_x,
        position_y: row.position_y,
        width: row.width,
        height: row.height,
        style: serde_json::from_str(&row.style_json).unwrap_or_else(|_| serde_json::json!({})),
    }
}

fn backlinks_for_document(
    root_path: &str,
    relative_path: &str,
    warnings: &mut Vec<AgentWarning>,
) -> Vec<Backlink> {
    let target = relative_path
        .strip_suffix(".md")
        .unwrap_or(relative_path)
        .to_string();
    match backlinks(root_path, &target) {
        Ok(backlinks) => backlinks,
        Err(error) => {
            warnings.push(AgentWarning {
                code: "backlinks_unavailable".to_string(),
                message: format!("could not collect backlinks for {relative_path}: {error}"),
                path: Some(relative_path.to_string()),
            });
            Vec::new()
        }
    }
}

fn root_path_for_document(
    document: &crate::agent::types::VaultDocument,
    roots: &[crate::agent::project::AgentProjectRoot],
) -> Option<String> {
    roots
        .iter()
        .filter(|root| {
            root.exists
                && Path::new(&document.absolute_path).starts_with(Path::new(&root.canonical_path))
        })
        .max_by_key(|root| root.canonical_path.len())
        .map(|root| root.canonical_path.clone())
}

fn canonical_path_string(path: &str) -> String {
    std::fs::canonicalize(path)
        .unwrap_or_else(|_| PathBuf::from(path))
        .to_string_lossy()
        .to_string()
}

fn context_score(search_rank: f64) -> f64 {
    let score = search_rank.abs();
    if score > 0.0 {
        score
    } else {
        1.0
    }
}

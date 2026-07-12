use std::collections::HashSet;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::agent::types::AgentWarning;
use crate::db::connection::Database;
use crate::db::repositories::{
    ProjectRepository, ResourceRootRecord, ResourceRootRepository, SearchHit, SearchIndexSummary,
    SearchRepository,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProjectRoots {
    pub project_id: String,
    pub display_name: String,
    pub root_path: String,
    pub primary_canvas_id: Option<String>,
    #[serde(default)]
    pub roots: Vec<AgentProjectRoot>,
    #[serde(default)]
    pub warnings: Vec<AgentWarning>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProjectRoot {
    pub id: String,
    pub project_id: String,
    pub display_name: String,
    pub path: String,
    pub canonical_path: String,
    pub kind: AgentRootKind,
    pub exists: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentRootKind {
    Project,
    Resource,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProjectSearchResults {
    pub project_id: String,
    pub query: String,
    pub index_summary: SearchIndexSummary,
    #[serde(default)]
    pub roots: Vec<AgentProjectRoot>,
    #[serde(default)]
    pub hits: Vec<AgentProjectSearchHit>,
    #[serde(default)]
    pub warnings: Vec<AgentWarning>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProjectSearchHit {
    pub document_key: String,
    pub project_id: String,
    pub project_display_name: String,
    pub canvas_id: Option<String>,
    pub entity_type: String,
    pub entity_id: String,
    pub title: String,
    pub summary: String,
    pub snippet: String,
    pub source_path: Option<String>,
    pub relative_path: Option<String>,
    pub content_kind: String,
    pub score: f64,
    pub root_path: Option<String>,
    pub root_display_name: Option<String>,
    pub root_kind: Option<AgentRootKind>,
}

pub fn load_project_roots(
    database_path: impl AsRef<Path>,
    project_id: &str,
) -> Result<AgentProjectRoots, String> {
    let database = Database::open(database_path.as_ref()).map_err(|error| error.to_string())?;
    load_project_roots_from_connection(database.connection(), project_id)
}

pub fn search_project_files(
    database_path: impl AsRef<Path>,
    project_id: &str,
    query: &str,
    limit: usize,
) -> Result<AgentProjectSearchResults, String> {
    let database = Database::open(database_path.as_ref()).map_err(|error| error.to_string())?;
    let root_set = load_project_roots_from_connection(database.connection(), project_id)?;
    let search = SearchRepository::new(database.connection());
    let index_summary = search
        .rebuild_project_index(project_id)
        .map_err(|error| error.to_string())?;
    let hits = search
        .search_project(project_id, query, limit)
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(|hit| enrich_search_hit(hit, &root_set.roots))
        .collect();

    Ok(AgentProjectSearchResults {
        project_id: project_id.to_string(),
        query: query.to_string(),
        index_summary,
        roots: root_set.roots,
        hits,
        warnings: root_set.warnings,
    })
}

pub(crate) fn load_project_roots_from_connection(
    connection: &Connection,
    project_id: &str,
) -> Result<AgentProjectRoots, String> {
    let projects = ProjectRepository::new(connection);
    let project = projects
        .get_by_id(project_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("project not found: {project_id}"))?;
    let resource_roots = ResourceRootRepository::new(connection)
        .list_for_project(project_id)
        .map_err(|error| error.to_string())?;

    let mut warnings = Vec::new();
    let mut seen = HashSet::new();
    let mut roots = Vec::new();

    push_root_if_new(
        &mut roots,
        &mut seen,
        &mut warnings,
        AgentProjectRootInput {
            id: project.id.clone(),
            project_id: project.id.clone(),
            display_name: project.display_name.clone(),
            path: project.root_path.clone(),
            kind: AgentRootKind::Project,
        },
    );

    for root in resource_roots {
        push_resource_root(&mut roots, &mut seen, &mut warnings, root);
    }

    Ok(AgentProjectRoots {
        project_id: project.id,
        display_name: project.display_name,
        root_path: project.root_path,
        primary_canvas_id: project.primary_canvas_id,
        roots,
        warnings,
    })
}

struct AgentProjectRootInput {
    id: String,
    project_id: String,
    display_name: String,
    path: String,
    kind: AgentRootKind,
}

fn push_resource_root(
    roots: &mut Vec<AgentProjectRoot>,
    seen: &mut HashSet<String>,
    warnings: &mut Vec<AgentWarning>,
    root: ResourceRootRecord,
) {
    push_root_if_new(
        roots,
        seen,
        warnings,
        AgentProjectRootInput {
            id: root.id,
            project_id: root.project_id,
            display_name: root.display_name,
            path: root.root_path,
            kind: AgentRootKind::Resource,
        },
    );
}

fn push_root_if_new(
    roots: &mut Vec<AgentProjectRoot>,
    seen: &mut HashSet<String>,
    warnings: &mut Vec<AgentWarning>,
    input: AgentProjectRootInput,
) {
    let resolved = resolve_root_path(&input.path);
    if !seen.insert(resolved.dedupe_key.clone()) {
        return;
    }

    if !resolved.exists {
        warnings.push(AgentWarning {
            code: "missing_root".to_string(),
            message: format!("root directory does not exist: {}", input.path),
            path: Some(input.path.clone()),
        });
    }

    roots.push(AgentProjectRoot {
        id: input.id,
        project_id: input.project_id,
        display_name: input.display_name,
        path: input.path,
        canonical_path: resolved.canonical_path,
        kind: input.kind,
        exists: resolved.exists,
    });
}

struct ResolvedRootPath {
    canonical_path: String,
    dedupe_key: String,
    exists: bool,
}

fn resolve_root_path(path: &str) -> ResolvedRootPath {
    match std::fs::canonicalize(path) {
        Ok(canonical) => {
            let canonical_path = path_to_string(&canonical);
            ResolvedRootPath {
                dedupe_key: canonical_path.clone(),
                canonical_path,
                exists: true,
            }
        }
        Err(_) => ResolvedRootPath {
            canonical_path: path.to_string(),
            dedupe_key: path.to_string(),
            exists: false,
        },
    }
}

fn enrich_search_hit(hit: SearchHit, roots: &[AgentProjectRoot]) -> AgentProjectSearchHit {
    let matched_root = hit
        .source_path
        .as_deref()
        .and_then(|source_path| root_for_path(source_path, roots));
    let relative_path = match (hit.source_path.as_deref(), matched_root) {
        (Some(source_path), Some(root)) if hit.entity_type == "file" => {
            relative_path_for_root(source_path, root)
        }
        _ => hit.relative_path,
    };

    AgentProjectSearchHit {
        document_key: hit.document_key,
        project_id: hit.project_id,
        project_display_name: hit.project_display_name,
        canvas_id: hit.canvas_id,
        entity_type: hit.entity_type,
        entity_id: hit.entity_id,
        title: hit.title,
        summary: hit.summary,
        snippet: hit.snippet,
        source_path: hit.source_path,
        relative_path,
        content_kind: hit.content_kind,
        score: hit.score,
        root_path: matched_root.map(|root| root.canonical_path.clone()),
        root_display_name: matched_root.map(|root| root.display_name.clone()),
        root_kind: matched_root.map(|root| root.kind),
    }
}

fn relative_path_for_root(source_path: &str, root: &AgentProjectRoot) -> Option<String> {
    let canonical_source = std::fs::canonicalize(source_path).ok()?;
    canonical_source
        .strip_prefix(Path::new(&root.canonical_path))
        .ok()
        .map(|path| path.to_string_lossy().replace('\\', "/"))
        .filter(|path| !path.is_empty())
}

fn root_for_path<'a>(
    source_path: &str,
    roots: &'a [AgentProjectRoot],
) -> Option<&'a AgentProjectRoot> {
    let canonical_source = std::fs::canonicalize(source_path).ok();
    let source = canonical_source
        .as_deref()
        .unwrap_or_else(|| Path::new(source_path));
    roots
        .iter()
        .filter(|root| root.exists && source.starts_with(Path::new(&root.canonical_path)))
        .max_by_key(|root| root.canonical_path.len())
}

fn path_to_string(path: &PathBuf) -> String {
    path.to_string_lossy().to_string()
}

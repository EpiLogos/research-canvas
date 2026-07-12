use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

use crate::{
    db::transaction::TransactionGuard,
    fs::indexer::{index_directory, IndexedEntry, IndexedEntryKind},
};

use super::{
    canvas::{Canvas, CanvasGraphRepository, CanvasNodeRecord, CanvasRepository},
    constellations::{Constellation, ConstellationRepository},
    resource_roots::ResourceRootRepository,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchIndexSummary {
    pub scope_constellation_id: String,
    pub indexed_at: String,
    pub constellations_indexed: u64,
    pub canvases_indexed: u64,
    pub nodes_indexed: u64,
    pub file_entries_indexed: u64,
    pub documents_indexed: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub document_key: String,
    pub scope_constellation_id: String,
    pub constellation_id: String,
    pub constellation_display_name: String,
    pub constellation_slug: String,
    pub canvas_id: Option<String>,
    pub entity_type: String,
    pub entity_id: String,
    pub title: String,
    pub summary: String,
    pub snippet: String,
    pub source_path: Option<String>,
    pub relative_path: Option<String>,
    pub content_kind: String,
    pub indexed_at: String,
    pub score: f64,
}

#[derive(Debug, Clone)]
struct SearchDocument {
    document_key: String,
    scope_constellation_id: String,
    constellation_id: String,
    constellation_display_name: String,
    constellation_slug: String,
    canvas_id: String,
    entity_type: String,
    entity_id: String,
    title: String,
    summary: String,
    body: String,
    source_path: String,
    relative_path: String,
    content_kind: String,
    indexed_at: String,
}

pub struct SearchRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> SearchRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn rebuild_constellation_index(
        &self,
        scope_constellation_id: &str,
    ) -> Result<SearchIndexSummary> {
        let constellations = self.scope_constellations(scope_constellation_id)?;
        let indexed_at = current_timestamp();
        let transaction = TransactionGuard::begin(self.connection)?;

        self.clear_scope(scope_constellation_id)?;

        let mut seen_file_paths = HashSet::new();
        let mut summary = SearchIndexSummary {
            scope_constellation_id: scope_constellation_id.to_string(),
            indexed_at: indexed_at.clone(),
            constellations_indexed: 0,
            canvases_indexed: 0,
            nodes_indexed: 0,
            file_entries_indexed: 0,
            documents_indexed: 0,
        };

        let canvases = CanvasRepository::new(self.connection);
        let graph = CanvasGraphRepository::new(self.connection);
        let resource_roots = ResourceRootRepository::new(self.connection);

        for constellation in constellations {
            self.insert_document(constellation_document(
                scope_constellation_id,
                &constellation,
                &indexed_at,
            ))?;
            summary.constellations_indexed += 1;
            summary.documents_indexed += 1;

            let constellation_resource_roots =
                resource_roots.list_for_constellation(&constellation.id)?;
            for document in self.file_documents_for_constellation(
                scope_constellation_id,
                &constellation,
                &indexed_at,
                &mut seen_file_paths,
                &constellation_resource_roots,
            ) {
                self.insert_document(document)?;
                summary.file_entries_indexed += 1;
                summary.documents_indexed += 1;
            }

            let constellation_canvases = canvases.list_for_constellation(&constellation.id)?;
            summary.canvases_indexed += constellation_canvases.len() as u64;
            for canvas in constellation_canvases {
                self.insert_document(canvas_document(
                    scope_constellation_id,
                    &constellation,
                    &canvas,
                    &indexed_at,
                ))?;
                summary.documents_indexed += 1;

                let snapshot = graph.load_canvas_snapshot(&canvas.id)?;
                summary.nodes_indexed += snapshot.nodes.len() as u64;
                for node in snapshot.nodes {
                    self.insert_document(node_document(
                        scope_constellation_id,
                        &constellation,
                        &canvas.id,
                        &node,
                        &indexed_at,
                    ))?;
                    summary.documents_indexed += 1;
                }
            }
        }

        transaction.commit()?;
        Ok(summary)
    }

    pub fn search_constellation(
        &self,
        scope_constellation_id: &str,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SearchHit>> {
        if query.trim().is_empty() || limit == 0 {
            return Ok(Vec::new());
        }

        let Some(match_query) = normalize_query(query) else {
            return Ok(Vec::new());
        };

        let mut statement = self.connection.prepare(
            "SELECT
                document_key,
                scope_project_id,
                project_id,
                project_display_name,
                project_slug,
                canvas_id,
                entity_type,
                entity_id,
                title,
                summary,
                snippet(search_documents, -1, '[', ']', '…', 12) AS snippet_text,
                source_path,
                relative_path,
                content_kind,
                indexed_at,
                bm25(search_documents) AS score
             FROM search_documents
             WHERE scope_project_id = ?1
               AND search_documents MATCH ?2
             ORDER BY score ASC, title COLLATE NOCASE ASC, entity_type COLLATE NOCASE ASC
             LIMIT ?3",
        )?;
        let rows = statement.query_map(
            params![scope_constellation_id, match_query, limit as i64],
            search_hit_from_row,
        )?;
        rows.collect()
    }

    fn scope_constellations(&self, scope_constellation_id: &str) -> Result<Vec<Constellation>> {
        let constellations = ConstellationRepository::new(self.connection);
        let root = constellations
            .get_by_id(scope_constellation_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;

        let mut scoped_constellations = vec![root];
        scoped_constellations.extend(constellations.list_descendants(scope_constellation_id)?);
        Ok(scoped_constellations)
    }

    fn clear_scope(&self, scope_constellation_id: &str) -> Result<()> {
        self.connection.execute(
            "DELETE FROM search_documents WHERE scope_project_id = ?1",
            [scope_constellation_id],
        )?;
        Ok(())
    }

    fn insert_document(&self, document: SearchDocument) -> Result<()> {
        self.connection.execute(
            "INSERT INTO search_documents (
                document_key,
                scope_project_id,
                project_id,
                project_display_name,
                project_slug,
                canvas_id,
                entity_type,
                entity_id,
                title,
                summary,
                body,
                source_path,
                relative_path,
                content_kind,
                indexed_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                document.document_key,
                document.scope_constellation_id,
                document.constellation_id,
                document.constellation_display_name,
                document.constellation_slug,
                document.canvas_id,
                document.entity_type,
                document.entity_id,
                document.title,
                document.summary,
                document.body,
                document.source_path,
                document.relative_path,
                document.content_kind,
                document.indexed_at,
            ],
        )?;
        Ok(())
    }

    fn file_documents_for_constellation(
        &self,
        scope_constellation_id: &str,
        constellation: &Constellation,
        indexed_at: &str,
        seen_file_paths: &mut HashSet<String>,
        resource_roots: &[super::resource_roots::ResourceRootRecord],
    ) -> Vec<SearchDocument> {
        let mut documents = Vec::new();

        let mut roots = Vec::with_capacity(resource_roots.len() + 1);
        roots.push(PathBuf::from(&constellation.root_path));
        roots.extend(
            resource_roots
                .iter()
                .map(|root| PathBuf::from(&root.root_path)),
        );

        for root in roots {
            let Ok(entries) = index_directory(&root) else {
                continue;
            };

            for entry in entries {
                let absolute_path = entry.absolute_path.to_string_lossy().to_string();
                let dedupe_path = fs::canonicalize(&entry.absolute_path)
                    .unwrap_or_else(|_| entry.absolute_path.clone())
                    .to_string_lossy()
                    .to_string();
                if !seen_file_paths.insert(dedupe_path) {
                    continue;
                }

                documents.push(file_document(
                    scope_constellation_id,
                    constellation,
                    &entry,
                    absolute_path,
                    indexed_at,
                ));
            }
        }

        documents
    }
}

fn constellation_document(
    scope_constellation_id: &str,
    constellation: &Constellation,
    indexed_at: &str,
) -> SearchDocument {
    let summary = constellation.summary.clone().unwrap_or_default();
    let body = format!(
        "{}\n{}\n{}",
        constellation.display_name, summary, constellation.root_path
    );

    SearchDocument {
        document_key: format!("constellation:{}", constellation.id),
        scope_constellation_id: scope_constellation_id.to_string(),
        constellation_id: constellation.id.clone(),
        constellation_display_name: constellation.display_name.clone(),
        constellation_slug: constellation.slug.clone(),
        canvas_id: String::new(),
        entity_type: "constellation".to_string(),
        entity_id: constellation.id.clone(),
        title: constellation.display_name.clone(),
        summary,
        body,
        source_path: constellation.root_path.clone(),
        relative_path: String::new(),
        content_kind: "constellation".to_string(),
        indexed_at: indexed_at.to_string(),
    }
}

fn canvas_document(
    scope_constellation_id: &str,
    constellation: &Constellation,
    canvas: &Canvas,
    indexed_at: &str,
) -> SearchDocument {
    let summary = canvas.summary.clone().unwrap_or_default();
    SearchDocument {
        document_key: format!("canvas:{}", canvas.id),
        scope_constellation_id: scope_constellation_id.to_string(),
        constellation_id: constellation.id.clone(),
        constellation_display_name: constellation.display_name.clone(),
        constellation_slug: constellation.slug.clone(),
        canvas_id: canvas.id.clone(),
        entity_type: "canvas".to_string(),
        entity_id: canvas.id.clone(),
        title: canvas.name.clone(),
        summary: summary.clone(),
        body: format!("{}\n{}", canvas.name, summary),
        source_path: String::new(),
        relative_path: String::new(),
        content_kind: canvas.kind.clone(),
        indexed_at: indexed_at.to_string(),
    }
}

fn node_document(
    scope_constellation_id: &str,
    constellation: &Constellation,
    canvas_id: &str,
    node: &CanvasNodeRecord,
    indexed_at: &str,
) -> SearchDocument {
    let (body, source_path, relative_path, content_kind) = match node.node_type.as_str() {
        "resource" => {
            let mut fragments = vec![node.title.clone(), node.summary.clone()];
            if let Some(relative_path) = node.relative_path.clone() {
                fragments.push(relative_path);
            }
            if let Some(absolute_path) = node.absolute_path.clone() {
                fragments.push(absolute_path.clone());
            }
            if let Some(content) = text_content_from_path(node.absolute_path.as_deref()) {
                fragments.push(content);
            }

            (
                fragments.join("\n"),
                node.absolute_path.clone().unwrap_or_default(),
                node.relative_path.clone().unwrap_or_default(),
                node.resource_kind
                    .clone()
                    .unwrap_or_else(|| "resource".to_string()),
            )
        }
        "note" => (
            node.content.clone().unwrap_or_default(),
            String::new(),
            String::new(),
            "note".to_string(),
        ),
        "group" => (
            node.child_node_ids.join("\n"),
            String::new(),
            String::new(),
            "group".to_string(),
        ),
        "portal" => (
            node.target_canvas_id.clone().unwrap_or_default(),
            String::new(),
            String::new(),
            "portal".to_string(),
        ),
        _ => (
            node.summary.clone(),
            String::new(),
            String::new(),
            "node".to_string(),
        ),
    };

    SearchDocument {
        document_key: format!("node:{}", node.id),
        scope_constellation_id: scope_constellation_id.to_string(),
        constellation_id: constellation.id.clone(),
        constellation_display_name: constellation.display_name.clone(),
        constellation_slug: constellation.slug.clone(),
        canvas_id: canvas_id.to_string(),
        entity_type: "node".to_string(),
        entity_id: node.id.clone(),
        title: node.title.clone(),
        summary: node.summary.clone(),
        body,
        source_path,
        relative_path,
        content_kind,
        indexed_at: indexed_at.to_string(),
    }
}

fn file_document(
    scope_constellation_id: &str,
    constellation: &Constellation,
    entry: &IndexedEntry,
    absolute_path: String,
    indexed_at: &str,
) -> SearchDocument {
    let body = file_body_for_entry(entry, Path::new(&absolute_path))
        .unwrap_or_else(|| entry.relative_path.clone());
    let summary = if entry.relative_path.is_empty() {
        entry.name.clone()
    } else {
        entry.relative_path.clone()
    };

    SearchDocument {
        document_key: format!("file:{}:{}", constellation.id, entry.relative_path),
        scope_constellation_id: scope_constellation_id.to_string(),
        constellation_id: constellation.id.clone(),
        constellation_display_name: constellation.display_name.clone(),
        constellation_slug: constellation.slug.clone(),
        canvas_id: String::new(),
        entity_type: "file".to_string(),
        entity_id: entry.relative_path.clone(),
        title: entry.name.clone(),
        summary,
        body,
        source_path: absolute_path,
        relative_path: entry.relative_path.clone(),
        content_kind: file_content_kind(entry),
        indexed_at: indexed_at.to_string(),
    }
}

fn file_body_for_entry(entry: &IndexedEntry, path: &Path) -> Option<String> {
    match &entry.kind {
        IndexedEntryKind::Directory => Some(entry.relative_path.clone()),
        IndexedEntryKind::Markdown => fs::read_to_string(path)
            .ok()
            .map(|content| truncate_content(&content)),
        IndexedEntryKind::Image => Some(entry.relative_path.clone()),
        IndexedEntryKind::OtherFile => {
            if !is_text_like_extension(
                path.extension()
                    .and_then(|extension| extension.to_str())
                    .unwrap_or_default(),
            ) {
                return Some(entry.relative_path.clone());
            }

            fs::read_to_string(path)
                .ok()
                .map(|content| truncate_content(&content))
        }
    }
}

fn file_content_kind(entry: &IndexedEntry) -> String {
    match &entry.kind {
        IndexedEntryKind::Directory => "directory".to_string(),
        IndexedEntryKind::Markdown => "markdown".to_string(),
        IndexedEntryKind::Image => "image".to_string(),
        IndexedEntryKind::OtherFile => "file".to_string(),
    }
}

fn search_hit_from_row(row: &rusqlite::Row<'_>) -> Result<SearchHit> {
    let snippet_text: String = row.get(10)?;
    let summary: String = row.get(9)?;
    let canvas_id: String = row.get(5)?;
    let source_path: String = row.get(11)?;
    let relative_path: String = row.get(12)?;

    Ok(SearchHit {
        document_key: row.get(0)?,
        scope_constellation_id: row.get(1)?,
        constellation_id: row.get(2)?,
        constellation_display_name: row.get(3)?,
        constellation_slug: row.get(4)?,
        canvas_id: optional_text(canvas_id),
        entity_type: row.get(6)?,
        entity_id: row.get(7)?,
        title: row.get(8)?,
        summary: summary.clone(),
        snippet: if snippet_text.trim().is_empty() {
            summary
        } else {
            snippet_text
        },
        source_path: optional_text(source_path),
        relative_path: optional_text(relative_path),
        content_kind: row.get(13)?,
        indexed_at: row.get(14)?,
        score: row.get(15)?,
    })
}

fn normalize_query(query: &str) -> Option<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();

    for character in query.chars() {
        if character.is_alphanumeric() {
            current.push(character.to_ascii_lowercase());
            continue;
        }

        if !current.is_empty() {
            tokens.push(current.clone());
            current.clear();
        }
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    if tokens.is_empty() {
        return None;
    }

    Some(tokens.join(" AND "))
}

fn optional_text(value: String) -> Option<String> {
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn text_content_from_path(path: Option<&str>) -> Option<String> {
    let path = Path::new(path?);
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default();
    if !is_text_like_extension(extension) {
        return None;
    }

    fs::read_to_string(path)
        .ok()
        .map(|content| truncate_content(&content))
}

fn is_text_like_extension(extension: &str) -> bool {
    matches!(
        extension,
        "md" | "markdown"
            | "mdown"
            | "mkd"
            | "txt"
            | "text"
            | "log"
            | "rst"
            | "org"
            | "csv"
            | "json"
            | "yaml"
            | "yml"
            | "toml"
            | "rs"
            | "ts"
            | "tsx"
            | "js"
            | "jsx"
            | "html"
            | "css"
            | "xml"
            | "sh"
            | "py"
    )
}

fn truncate_content(content: &str) -> String {
    const MAX_INDEXED_CHARS: usize = 100_000;
    content.chars().take(MAX_INDEXED_CHARS).collect()
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

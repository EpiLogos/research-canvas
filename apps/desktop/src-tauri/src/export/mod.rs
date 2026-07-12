pub mod graph_bundle;

use std::{
    fs,
    path::{Path, PathBuf},
};

use chrono::{SecondsFormat, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

use crate::{
    db::repositories::{
        AnnotationRecord, AnnotationRepository, CanvasGraphRepository, CanvasRepository,
        ProjectRepository,
    },
    fs::indexer::{index_directory, IndexedEntryKind},
};

#[derive(Debug, Error)]
pub enum ExportError {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Db(#[from] rusqlite::Error),
    #[error("{0}")]
    Serialization(#[from] serde_json::Error),
    #[error("project not found: {0}")]
    ProjectNotFound(String),
    #[error("{0}")]
    Profile(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishProfile {
    #[serde(default = "default_true")]
    pub include_resources: bool,
    #[serde(default = "default_true")]
    pub mobile_sequence_first: bool,
    #[serde(default = "default_theme")]
    pub theme: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub project_id: String,
    pub output_dir: String,
    pub node_page_count: usize,
    pub asset_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportBundle {
    generated_at: String,
    project: ProjectExport,
    canvases: Vec<CanvasExport>,
    nodes: Vec<NodeExport>,
    edges: Vec<EdgeExport>,
    annotations: Vec<AnnotationExport>,
    assets: Vec<ExportAsset>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectExport {
    id: String,
    display_name: String,
    slug: String,
    parent_project_id: Option<String>,
    root_path: String,
    primary_canvas_id: String,
    summary: String,
    cover_asset_path: Option<String>,
    publish_settings: PublishProfile,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CanvasExport {
    id: String,
    project_id: String,
    name: String,
    kind: String,
    created_at: String,
    updated_at: String,
    last_viewport: Option<Viewport>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Viewport {
    x: f64,
    y: f64,
    zoom: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum NodeExport {
    Resource {
        id: String,
        canvas_id: String,
        title: String,
        position: Position,
        size: Size,
        summary: String,
        created_at: String,
        updated_at: String,
        resource_kind: String,
        absolute_path: String,
        relative_path: String,
        mime_type: String,
        file_fingerprint: String,
        url: Option<String>,
    },
    Note {
        id: String,
        canvas_id: String,
        title: String,
        position: Position,
        size: Size,
        summary: String,
        created_at: String,
        updated_at: String,
        content: String,
        tags: Vec<String>,
    },
    Group {
        id: String,
        canvas_id: String,
        title: String,
        position: Position,
        size: Size,
        summary: String,
        created_at: String,
        updated_at: String,
        color: String,
        child_node_ids: Vec<String>,
    },
    Portal {
        id: String,
        canvas_id: String,
        title: String,
        position: Position,
        size: Size,
        summary: String,
        created_at: String,
        updated_at: String,
        target_canvas_id: String,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Position {
    x: f64,
    y: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Size {
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EdgeExport {
    id: String,
    canvas_id: String,
    source_node_id: String,
    target_node_id: String,
    relation_kind: String,
    directionality: String,
    label: String,
    note: String,
    style: Value,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AnnotationExport {
    id: String,
    canvas_id: String,
    annotation_type: String,
    points: Value,
    style: AnnotationStyle,
    text: Option<String>,
    bounds: Bounds,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AnnotationStyle {
    color: String,
    width: f64,
    opacity: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Bounds {
    position: Position,
    size: Size,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAsset {
    node_id: String,
    source_path: String,
    relative_path: String,
    download_name: String,
    mime_type: String,
}

pub fn resolve_publish_profile(value: Value) -> Result<PublishProfile, ExportError> {
    let profile = serde_json::from_value::<PublishProfile>(value)?;
    Ok(profile)
}

pub fn export_project_bundle(
    connection: &Connection,
    project_id: &str,
    output_dir: impl AsRef<Path>,
) -> Result<ExportResult, ExportError> {
    let project_repository = ProjectRepository::new(connection);
    let canvas_repository = CanvasRepository::new(connection);
    let graph_repository = CanvasGraphRepository::new(connection);
    let annotation_repository = AnnotationRepository::new(connection);

    let project = project_repository
        .get_by_id(project_id)?
        .ok_or_else(|| ExportError::ProjectNotFound(project_id.to_string()))?;
    let primary_canvas_id = project
        .primary_canvas_id
        .clone()
        .ok_or_else(|| ExportError::ProjectNotFound(project_id.to_string()))?;
    let canvas = canvas_repository
        .get_by_id(&primary_canvas_id)?
        .ok_or_else(|| ExportError::ProjectNotFound(primary_canvas_id.clone()))?;
    let snapshot = graph_repository.load_canvas_snapshot(&primary_canvas_id)?;
    let annotations = annotation_repository.list_for_canvas(&primary_canvas_id)?;
    let profile = resolve_publish_profile(parse_json_value(&project.publish_settings)?)?;

    let project_root = resolve_project_root(&project.root_path);
    let indexed_entries = if profile.include_resources {
        index_directory(&project_root)?
    } else {
        Vec::new()
    };
    let assets = build_assets(&indexed_entries, &snapshot.nodes, &project_root);
    let bundle = ExportBundle {
        annotations: annotations.into_iter().map(annotation_to_export).collect(),
        assets: assets.clone(),
        canvases: vec![canvas_to_export(canvas)],
        edges: snapshot.edges.iter().map(edge_to_export).collect(),
        generated_at: current_timestamp(),
        nodes: snapshot.nodes.iter().map(node_to_export).collect(),
        project: project_to_export(project, primary_canvas_id.clone(), profile.clone()),
    };

    let output_dir = output_dir.as_ref();
    fs::create_dir_all(output_dir)?;
    fs::create_dir_all(output_dir.join("nodes"))?;

    let bundle_json = serde_json::to_string_pretty(&bundle)?;
    fs::write(output_dir.join("bundle.json"), bundle_json)?;
    fs::write(
        output_dir.join("manifest.json"),
        serde_json::to_string_pretty(&bundle)?,
    )?;
    fs::write(
        output_dir.join("search-index.json"),
        serde_json::to_string_pretty(&build_search_index(&bundle))?,
    )?;

    for page in build_node_pages(&bundle.nodes) {
        if let Some(node) = bundle
            .nodes
            .iter()
            .find(|entry| node_id(entry) == page.node_id)
        {
            fs::write(
                output_dir.join("nodes").join(&page.file_name),
                render_node_page(&bundle, node, &page),
            )?;
        }
    }

    copy_assets(&bundle.assets, output_dir)?;
    fs::write(
        output_dir.join("index.html"),
        render_index_page(&bundle, &profile),
    )?;

    Ok(ExportResult {
        asset_count: bundle.assets.len(),
        node_page_count: build_node_pages(&bundle.nodes).len(),
        output_dir: output_dir.display().to_string(),
        project_id: bundle.project.id,
    })
}

fn parse_json_value(value: &str) -> Result<Value, ExportError> {
    Ok(serde_json::from_str(value)?)
}

fn project_to_export(
    project: crate::db::repositories::Project,
    primary_canvas_id: String,
    profile: PublishProfile,
) -> ProjectExport {
    ProjectExport {
        id: project.id,
        display_name: project.display_name,
        slug: project.slug,
        parent_project_id: project.parent_project_id,
        root_path: project.root_path,
        primary_canvas_id,
        summary: project.summary.unwrap_or_default(),
        cover_asset_path: project.cover_asset,
        publish_settings: profile,
        created_at: project.created_at,
        updated_at: project.updated_at,
    }
}

fn canvas_to_export(canvas: crate::db::repositories::Canvas) -> CanvasExport {
    CanvasExport {
        id: canvas.id,
        project_id: canvas.project_id,
        name: canvas.name,
        kind: canvas.kind,
        created_at: canvas.created_at,
        updated_at: canvas.updated_at,
        last_viewport: None,
    }
}

fn node_to_export(node: &crate::db::repositories::CanvasNodeRecord) -> NodeExport {
    let position = Position {
        x: node.position_x,
        y: node.position_y,
    };
    let size = Size {
        width: node.width,
        height: node.height,
    };

    match node.node_type.as_str() {
        "resource" => NodeExport::Resource {
            absolute_path: node.absolute_path.clone().unwrap_or_default(),
            canvas_id: node.canvas_id.clone(),
            created_at: node.created_at.clone(),
            file_fingerprint: node.file_fingerprint.clone().unwrap_or_default(),
            id: node.id.clone(),
            mime_type: node.mime_type.clone().unwrap_or_default(),
            position,
            relative_path: node.relative_path.clone().unwrap_or_default(),
            resource_kind: node.resource_kind.clone().unwrap_or_default(),
            size,
            summary: node.summary.clone(),
            title: node.title.clone(),
            updated_at: node.updated_at.clone(),
            url: node.url.clone(),
        },
        "group" => NodeExport::Group {
            canvas_id: node.canvas_id.clone(),
            child_node_ids: node.child_node_ids.clone(),
            color: node.color.clone().unwrap_or_else(|| "#f0b45a".to_string()),
            created_at: node.created_at.clone(),
            id: node.id.clone(),
            position,
            size,
            summary: node.summary.clone(),
            title: node.title.clone(),
            updated_at: node.updated_at.clone(),
        },
        "portal" => NodeExport::Portal {
            canvas_id: node.canvas_id.clone(),
            created_at: node.created_at.clone(),
            id: node.id.clone(),
            position,
            size,
            summary: node.summary.clone(),
            target_canvas_id: node.target_canvas_id.clone().unwrap_or_default(),
            title: node.title.clone(),
            updated_at: node.updated_at.clone(),
        },
        _ => NodeExport::Note {
            canvas_id: node.canvas_id.clone(),
            content: node.content.clone().unwrap_or_default(),
            created_at: node.created_at.clone(),
            id: node.id.clone(),
            position,
            size,
            summary: node.summary.clone(),
            tags: node.tags.clone(),
            title: node.title.clone(),
            updated_at: node.updated_at.clone(),
        },
    }
}

fn edge_to_export(edge: &crate::db::repositories::CanvasEdgeRecord) -> EdgeExport {
    EdgeExport {
        canvas_id: edge.canvas_id.clone(),
        created_at: edge.created_at.clone(),
        directionality: edge.directionality.clone(),
        id: edge.id.clone(),
        label: edge.label.clone(),
        note: edge.note.clone(),
        relation_kind: edge.relation_kind.clone(),
        source_node_id: edge.source_node_id.clone(),
        style: serde_json::from_str(&edge.style_json).unwrap_or(Value::Null),
        target_node_id: edge.target_node_id.clone(),
        updated_at: edge.updated_at.clone(),
    }
}

fn annotation_to_export(annotation: AnnotationRecord) -> AnnotationExport {
    AnnotationExport {
        annotation_type: annotation.annotation_type,
        bounds: Bounds {
            position: Position {
                x: annotation.bounds_x,
                y: annotation.bounds_y,
            },
            size: Size {
                width: annotation.bounds_width,
                height: annotation.bounds_height,
            },
        },
        canvas_id: annotation.canvas_id,
        created_at: annotation.created_at,
        id: annotation.id,
        points: serde_json::from_str(&annotation.points_json).unwrap_or(Value::Null),
        style: AnnotationStyle {
            color: annotation.style_color,
            opacity: annotation.style_opacity,
            width: annotation.style_width,
        },
        text: annotation.text,
        updated_at: annotation.updated_at,
    }
}

fn build_assets(
    entries: &[crate::fs::indexer::IndexedEntry],
    nodes: &[crate::db::repositories::CanvasNodeRecord],
    root_path: &Path,
) -> Vec<ExportAsset> {
    let fallback_node_id = nodes
        .iter()
        .find(|node| node.node_type == "resource")
        .or_else(|| nodes.first())
        .map(|node| node.id.clone());

    let Some(node_id) = fallback_node_id else {
        return Vec::new();
    };

    entries
        .iter()
        .filter(|entry| !entry.is_directory)
        .filter_map(|entry| {
            let relative_path = entry.relative_path.clone();
            let download_name = Path::new(&entry.name)
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_else(|| entry.name.clone());
            let source_path = entry.absolute_path.display().to_string();
            if !source_path.starts_with(root_path.display().to_string().as_str()) {
                return None;
            }

            Some(ExportAsset {
                download_name,
                mime_type: mime_type_for_entry(entry),
                node_id: node_id.clone(),
                relative_path,
                source_path,
            })
        })
        .collect()
}

fn mime_type_for_entry(entry: &crate::fs::indexer::IndexedEntry) -> String {
    match entry.kind {
        IndexedEntryKind::Markdown => "text/markdown",
        IndexedEntryKind::Image => "image/png",
        IndexedEntryKind::OtherFile => "application/octet-stream",
        IndexedEntryKind::Directory => "application/octet-stream",
    }
    .to_string()
}

fn copy_assets(assets: &[ExportAsset], output_dir: &Path) -> Result<(), ExportError> {
    let assets_dir = output_dir.join("assets");
    fs::create_dir_all(&assets_dir)?;
    for asset in assets {
        let source_path = PathBuf::from(&asset.source_path);
        let target_path = assets_dir.join(&asset.download_name);
        copy_path(&source_path, &target_path)?;
    }
    Ok(())
}

fn copy_path(source_path: &Path, target_path: &Path) -> Result<(), ExportError> {
    if source_path.is_dir() {
        fs::create_dir_all(target_path)?;
        for entry in fs::read_dir(source_path)? {
            let entry = entry?;
            copy_path(&entry.path(), &target_path.join(entry.file_name()))?;
        }
        return Ok(());
    }

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(source_path, target_path)?;
    Ok(())
}

fn render_index_page(bundle: &ExportBundle, profile: &PublishProfile) -> String {
    let node_cards = build_node_pages(&bundle.nodes)
        .into_iter()
        .filter_map(|page| {
            let node = bundle
                .nodes
                .iter()
                .find(|entry| node_id(entry) == page.node_id)?;
            Some(format!(
                "<article class=\"card\"><a href=\"{}\"><h3>{}</h3><p>{}</p></a></article>",
                page.href,
                escape_html(&node_title(node)),
                escape_html(&node_summary(node))
            ))
        })
        .collect::<Vec<_>>()
        .join("");

    let downloads = bundle
        .assets
        .iter()
        .map(|asset| {
            format!(
                "<li><a href=\"assets/{}\">Download {}</a></li>",
                escape_html(&asset.download_name),
                escape_html(&asset.download_name)
            )
        })
        .collect::<Vec<_>>()
        .join("");

    let featured_note = bundle
        .nodes
        .iter()
        .find(|node| matches!(node, NodeExport::Note { .. }))
        .map(|node| match node {
            NodeExport::Note { title, content, .. } => format!(
                "<section class=\"viewer-section\"><header><p class=\"eyebrow\">Note</p><h2>{}</h2></header><div class=\"markdown\">{}</div></section>",
                escape_html(title),
                render_markdown_to_html(content)
            ),
            _ => String::new(),
        })
        .unwrap_or_default();

    format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" /><title>{}</title><style>{}</style></head><body><main class=\"viewer\"><section class=\"viewer__hero\"><p class=\"eyebrow\">Static export</p><h1>{}</h1><p>{}</p></section><section class=\"viewer__desktop\"><section class=\"viewer-section\"><header><p class=\"eyebrow\">Map</p><h2>Canvas nodes</h2></header><div class=\"card-grid\">{}</div></section>{}<section class=\"viewer-section\"><header><p class=\"eyebrow\">Downloads</p><h2>Published resources</h2></header><ul class=\"download-list\">{}</ul></section></section></main></body></html>",
        escape_html(&bundle.project.display_name),
        viewer_styles(&profile.theme),
        escape_html(&bundle.project.display_name),
        escape_html(&bundle.project.summary),
        node_cards,
        featured_note,
        downloads,
    )
}

fn render_node_page(bundle: &ExportBundle, node: &NodeExport, page: &NodePage) -> String {
    let related_edges = bundle
        .edges
        .iter()
        .filter(|edge| edge.source_node_id == page.node_id || edge.target_node_id == page.node_id)
        .map(|edge| {
            let other = if edge.source_node_id == page.node_id {
                edge.target_node_id.clone()
            } else {
                edge.source_node_id.clone()
            };
            let title = bundle
                .nodes
                .iter()
                .find(|candidate| node_id(candidate) == other)
                .map(node_title)
                .unwrap_or_else(|| "Unknown".to_string());
            format!(
                "<li><strong>{}</strong> <span>{}</span></li>",
                escape_html(&title),
                escape_html(&edge.relation_kind)
            )
        })
        .collect::<Vec<_>>()
        .join("");

    let content = match node {
        NodeExport::Note { title, content, tags, .. } => format!(
            "<section class=\"viewer-section\"><header><p class=\"eyebrow\">Content</p><h2>{}</h2></header><div class=\"markdown\">{}</div><p>{}</p></section>",
            escape_html(title),
            render_markdown_to_html(content),
            escape_html(&tags.join(", "))
        ),
        NodeExport::Resource {
            title,
            resource_kind,
            relative_path,
            mime_type,
            absolute_path,
            file_fingerprint,
            url,
            ..
        } => format!(
            "<section class=\"viewer-section\"><header><p class=\"eyebrow\">Resource</p><h2>{}</h2></header><dl class=\"meta-list\"><div><dt>Kind</dt><dd>{}</dd></div><div><dt>Path</dt><dd>{}</dd></div><div><dt>Mime type</dt><dd>{}</dd></div><div><dt>Fingerprint</dt><dd>{}</dd></div><div><dt>Absolute path</dt><dd>{}</dd></div>{}</dl></section>",
            escape_html(title),
            escape_html(resource_kind),
            escape_html(relative_path),
            escape_html(mime_type),
            escape_html(file_fingerprint),
            escape_html(absolute_path),
            url.as_ref().map(|value| format!("<div><dt>URL</dt><dd><a href=\"{}\">{}</a></dd></div>", escape_html(value), escape_html(value))).unwrap_or_default()
        ),
        NodeExport::Group { title, summary, .. } | NodeExport::Portal { title, summary, .. } => format!(
            "<section class=\"viewer-section\"><header><p class=\"eyebrow\">Node</p><h2>{}</h2></header><p>{}</p></section>",
            escape_html(title),
            escape_html(summary)
        ),
    };

    let downloads = bundle
        .assets
        .iter()
        .filter(|asset| asset.node_id == page.node_id)
        .map(|asset| {
            format!(
                "<li><a href=\"../assets/{}\">Download {}</a></li>",
                escape_html(&asset.download_name),
                escape_html(&asset.download_name)
            )
        })
        .collect::<Vec<_>>()
        .join("");

    format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" /><title>{} - {}</title><style>{}</style></head><body><main class=\"viewer viewer--node\"><a class=\"back-link\" href=\"../index.html\">Back to project</a><section class=\"viewer__hero\"><p class=\"eyebrow\">Node page</p><h1>{}</h1><p>{}</p></section>{}<section class=\"viewer-section\"><header><p class=\"eyebrow\">Relations</p><h2>Related nodes</h2></header><ul class=\"relation-list\">{}</ul></section><section class=\"viewer-section\"><header><p class=\"eyebrow\">Downloads</p><h2>Source files</h2></header><ul class=\"download-list\">{}</ul></section></main></body></html>",
        escape_html(&node_title(node)),
        escape_html(&bundle.project.display_name),
        viewer_styles("paper"),
        escape_html(&node_title(node)),
        escape_html(&node_summary(node)),
        content,
        related_edges,
        downloads
    )
}

fn build_node_pages(nodes: &[NodeExport]) -> Vec<NodePage> {
    let mut counts = std::collections::BTreeMap::new();
    nodes
        .iter()
        .map(|node| {
            let base = slugify(&node_title(node));
            let count = counts.entry(base.clone()).or_insert(0);
            let slug = if *count == 0 {
                base.clone()
            } else {
                format!("{}-{}", base, *count + 1)
            };
            *count += 1;
            NodePage {
                file_name: format!("{}.html", slug),
                href: format!("nodes/{}.html", slug),
                node_id: node_id(node),
            }
        })
        .collect()
}

#[derive(Debug, Clone)]
struct NodePage {
    file_name: String,
    href: String,
    node_id: String,
}

fn node_id(node: &NodeExport) -> String {
    match node {
        NodeExport::Resource { id, .. }
        | NodeExport::Note { id, .. }
        | NodeExport::Group { id, .. }
        | NodeExport::Portal { id, .. } => id.clone(),
    }
}

fn node_title(node: &NodeExport) -> String {
    match node {
        NodeExport::Resource { title, .. }
        | NodeExport::Note { title, .. }
        | NodeExport::Group { title, .. }
        | NodeExport::Portal { title, .. } => title.clone(),
    }
}

fn node_summary(node: &NodeExport) -> String {
    match node {
        NodeExport::Resource { summary, .. }
        | NodeExport::Note { summary, .. }
        | NodeExport::Group { summary, .. }
        | NodeExport::Portal { summary, .. } => summary.clone(),
    }
}

fn slugify(value: &str) -> String {
    let slug = value
        .trim()
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let slug = slug.trim_matches('-').replace("--", "-");
    if slug.is_empty() {
        "item".to_string()
    } else {
        slug
    }
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn render_markdown_to_html(markdown: &str) -> String {
    let normalized = markdown.replace("\r\n", "\n");
    let mut html = String::new();
    let mut lines = normalized.lines().peekable();
    while let Some(line) = lines.next() {
        if line.trim().is_empty() {
            continue;
        }
        if let Some(heading) = line.strip_prefix("# ") {
            html.push_str(&format!("<h1>{}</h1>", render_inline(heading)));
            continue;
        }
        if let Some(text) = line.strip_prefix("- ") {
            html.push_str("<ul>");
            html.push_str(&format!("<li>{}</li>", render_inline(text)));
            while let Some(next) = lines.peek() {
                if let Some(item) = next.strip_prefix("- ") {
                    html.push_str(&format!("<li>{}</li>", render_inline(item)));
                    lines.next();
                } else {
                    break;
                }
            }
            html.push_str("</ul>");
            continue;
        }
        html.push_str(&format!("<p>{}</p>", render_inline(line)));
    }
    html
}

fn render_inline(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = rest.find('[') {
        out.push_str(&escape_html(&rest[..start]));
        if let Some(end_label) = rest[start + 1..].find(']') {
            let label = &rest[start + 1..start + 1 + end_label];
            let href_start = start + 1 + end_label + 1;
            if rest[href_start..].starts_with('(') {
                if let Some(end_href) = rest[href_start + 1..].find(')') {
                    let href = &rest[href_start + 1..href_start + 1 + end_href];
                    out.push_str(&format!(
                        "<a href=\"{}\">{}</a>",
                        escape_html(href),
                        escape_html(label)
                    ));
                    rest = &rest[href_start + 1 + end_href + 1..];
                    continue;
                }
            }
        }
        out.push('[');
        rest = &rest[start + 1..];
    }
    out.push_str(&escape_html(rest));
    out
}

fn viewer_styles(theme: &str) -> String {
    let (bg, panel, accent, muted) = match theme {
        "nocturne" => ("#111418", "#1a1f26", "#d19a66", "#abb2bf"),
        "ledger" => ("#f7f0e3", "#fffaf2", "#7c4f1f", "#705f4d"),
        _ => ("#f4efe5", "#fffaf2", "#a15d1e", "#6a6154"),
    };

    format!(
        ":root{{--bg:{};--panel:{};--ink:#1d1a17;--muted:{};--line:rgba(29,26,23,.12);--accent:{};--shadow:0 18px 42px rgba(29,22,14,.08);}}*{{box-sizing:border-box}}body{{margin:0;font-family:ui-serif,Georgia,serif;background:radial-gradient(circle at top,#fff8ea 0%,var(--bg) 45%,#e7dcc9 100%);color:var(--ink)}}a{{color:var(--accent)}}.viewer{{max-width:1180px;margin:0 auto;padding:32px;display:grid;gap:24px}}.viewer__hero,.viewer__section,.card{{background:var(--panel);border:1px solid var(--line);border-radius:22px;box-shadow:var(--shadow)}}.viewer__hero,.viewer__section{{padding:24px}}.viewer__section{{display:grid;gap:18px}}.card{{padding:20px}}.card a{{display:block;color:inherit;text-decoration:none}}.card-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}}.eyebrow{{margin:0 0 8px;text-transform:uppercase;letter-spacing:.16em;font-size:.72rem;color:var(--muted)}}.download-list,.relation-list,.step-list{{margin:0;padding-left:1.25rem;display:grid;gap:12px}}.meta-list{{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}}.meta-list dt{{font-size:.8rem;color:var(--muted)}}.meta-list dd{{margin:0;font-weight:600}}.viewer__mobile{{display:none}}@media(max-width:760px){{.viewer__desktop{{display:none}}.viewer__mobile{{display:grid}}}}",
        bg, panel, muted, accent
    )
}

fn default_true() -> bool {
    true
}

fn default_theme() -> String {
    "paper".to_string()
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn resolve_project_root(root_path: &str) -> PathBuf {
    let candidate = PathBuf::from(root_path);
    if candidate.is_absolute() && candidate.exists() {
        return candidate;
    }

    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let direct = cwd.join(&candidate);
    if direct.exists() {
        return direct;
    }

    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace_root = manifest.join("../../../");
    let workspace_candidate = workspace_root.join(&candidate);
    if workspace_candidate.exists() {
        return workspace_candidate;
    }

    direct
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchIndexEntry {
    id: String,
    title: String,
    kind: String,
    href: String,
    content: String,
}

fn build_search_index(bundle: &ExportBundle) -> Vec<SearchIndexEntry> {
    let node_pages = build_node_pages(&bundle.nodes);

    let mut entries = Vec::new();
    entries.push(SearchIndexEntry {
        id: bundle.project.id.clone(),
        title: bundle.project.display_name.clone(),
        kind: "project".to_string(),
        href: "index.html".to_string(),
        content: format!(
            "{}\n{}",
            bundle.project.display_name, bundle.project.summary
        ),
    });

    for node in &bundle.nodes {
        let href = node_pages
            .iter()
            .find(|page| page.node_id == node_id(node))
            .map(|page| page.href.clone())
            .unwrap_or_else(|| "index.html".to_string());
        entries.push(SearchIndexEntry {
            id: node_id(node),
            title: node_title(node),
            kind: match node {
                NodeExport::Resource { .. } => "resource".to_string(),
                NodeExport::Note { .. } => "note".to_string(),
                NodeExport::Group { .. } => "group".to_string(),
                NodeExport::Portal { .. } => "portal".to_string(),
            },
            href,
            content: format!("{}\n{}", node_title(node), node_summary(node)),
        });
    }

    entries
}

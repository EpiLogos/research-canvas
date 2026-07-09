use std::{
    fs,
    path::{Path, PathBuf},
};

use research_canvas_desktop_lib::commands::constellations::{
    bootstrap_workspace_at, load_constellation_document_at, persist_constellation_document_at,
    AnnotationBoundsPayload, AnnotationPayload, AnnotationPointPayload, AnnotationStylePayload,
    CanvasEdgePayload, CanvasNodePayload, ConstellationDocumentPayload, EdgeStylePayload,
    PersistConstellationDocumentRequest, PositionPayload, SizePayload,
};
use research_canvas_desktop_lib::commands::search::{
    rebuild_constellation_search_index_command, search_constellation_command,
    RebuildConstellationSearchIndexRequest, SearchConstellationRequest,
};
use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{layout::LayoutRepository, ConstellationRepository},
};
use serde_json::json;

fn workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .expect("workspace root")
}

fn fixture_path(relative_path: &str) -> String {
    workspace_root()
        .join(relative_path)
        .to_string_lossy()
        .to_string()
}

fn cleanup_database(path: &Path) {
    let _ = fs::remove_file(path);
}

fn session_database_path(session_name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "research-canvas-test-{session_name}-{}.sqlite",
        std::process::id()
    ))
}

fn session_timestamp() -> String {
    "2026-03-31T09:00:00Z".to_string()
}

fn node_with_note_text(canvas_id: &str, id: &str, title: &str, content: &str) -> CanvasNodePayload {
    CanvasNodePayload {
        id: id.to_string(),
        canvas_id: canvas_id.to_string(),
        node_type: "note".to_string(),
        title: title.to_string(),
        position: PositionPayload { x: 120.0, y: 160.0 },
        size: SizePayload {
            width: 280.0,
            height: 180.0,
        },
        summary: content.to_string(),
        content: Some(content.to_string()),
        tags: vec!["note".to_string(), "session".to_string()],
        resource_kind: None,
        absolute_path: None,
        relative_path: None,
        mime_type: None,
        file_fingerprint: None,
        url: None,
        color: Some("#224466".to_string()),
        child_node_ids: Vec::new(),
        target_canvas_id: None,
        dot_colour: None,
        bg_colour: None,
        text_colour: None,
        thumbnail: None,
        sequence_caption: None,
        sequence_viewport: None,
        created_at: session_timestamp(),
        updated_at: session_timestamp(),
    }
}

fn resource_node(canvas_id: &str, id: &str, title: &str) -> CanvasNodePayload {
    CanvasNodePayload {
        id: id.to_string(),
        canvas_id: canvas_id.to_string(),
        node_type: "resource".to_string(),
        title: title.to_string(),
        position: PositionPayload { x: 420.0, y: 180.0 },
        size: SizePayload {
            width: 300.0,
            height: 200.0,
        },
        summary: "Research report".to_string(),
        content: None,
        tags: vec!["resource".to_string()],
        resource_kind: Some("markdown".to_string()),
        absolute_path: Some(fixture_path("tests/fixtures/sample-project/README.md")),
        relative_path: Some("README.md".to_string()),
        mime_type: Some("text/markdown".to_string()),
        file_fingerprint: Some("fingerprint-readme".to_string()),
        url: None,
        color: None,
        child_node_ids: Vec::new(),
        target_canvas_id: None,
        dot_colour: None,
        bg_colour: None,
        text_colour: None,
        thumbnail: None,
        sequence_caption: None,
        sequence_viewport: None,
        created_at: session_timestamp(),
        updated_at: session_timestamp(),
    }
}

fn connecting_edge(
    canvas_id: &str,
    id: &str,
    source_node_id: &str,
    target_node_id: &str,
) -> CanvasEdgePayload {
    CanvasEdgePayload {
        id: id.to_string(),
        canvas_id: canvas_id.to_string(),
        source_node_id: source_node_id.to_string(),
        target_node_id: target_node_id.to_string(),
        relation_kind: "supports".to_string(),
        directionality: "forward".to_string(),
        source_handle_id: Some("source-bottom".to_string()),
        target_handle_id: Some("target-top".to_string()),
        label: "Supports".to_string(),
        note: "Primary evidence".to_string(),
        style: EdgeStylePayload {
            stroke: "#0F172A".to_string(),
            width: 2.0,
            dashed: false,
        },
        sequencing: false,
        sequence_priority: 0,
        created_at: session_timestamp(),
        updated_at: session_timestamp(),
    }
}

fn ink_annotation(canvas_id: &str, id: &str) -> AnnotationPayload {
    AnnotationPayload {
        id: id.to_string(),
        canvas_id: canvas_id.to_string(),
        annotation_type: "ink".to_string(),
        points: vec![
            AnnotationPointPayload {
                x: 32.0,
                y: 36.0,
                pressure: Some(0.4),
            },
            AnnotationPointPayload {
                x: 78.0,
                y: 72.0,
                pressure: Some(0.6),
            },
        ],
        style: AnnotationStylePayload {
            color: "#7C2D12".to_string(),
            width: 4.0,
            opacity: 0.9,
        },
        text: Some("review this route".to_string()),
        bounds: AnnotationBoundsPayload {
            position: PositionPayload { x: 28.0, y: 28.0 },
            size: SizePayload {
                width: 120.0,
                height: 80.0,
            },
        },
        created_at: session_timestamp(),
        updated_at: session_timestamp(),
    }
}

fn persist_document(
    database_path: &Path,
    document: &ConstellationDocumentPayload,
    nodes: Vec<CanvasNodePayload>,
    edges: Vec<CanvasEdgePayload>,
    annotations: Vec<AnnotationPayload>,
) -> ConstellationDocumentPayload {
    persist_constellation_document_at(PersistConstellationDocumentRequest {
        annotations,
        canvas_id: document.canvas_id.clone(),
        database_path: database_path.to_string_lossy().to_string(),
        edges,
        nodes,
        constellation_id: document.constellation.id.clone(),
    })
    .expect("persist project document")
}

#[test]
fn bootstrap_workspace_surfaces_root_constellation_portals_and_preserves_layout_positions() {
    let database_path = session_database_path(&format!(
        "workspace-root-constellations-{}",
        std::process::id()
    ));
    cleanup_database(&database_path);

    let bootstrap = bootstrap_workspace_at(&database_path).expect("bootstrap workspace");
    let root = bootstrap
        .constellations
        .iter()
        .find(|constellation| constellation.slug == "root-archetypal-field")
        .expect("root archetypal constellation in bootstrap");
    assert_eq!(bootstrap.active_constellation_id, root.id);
    assert_eq!(root.name, "Root Archetypal Field");
    assert!(
        bootstrap
            .constellations
            .iter()
            .all(|constellation| constellation.slug != "sample-project"),
        "bootstrap must not fall back to the old sample project scaffold"
    );

    let document =
        load_constellation_document_at(&database_path, &bootstrap.active_constellation_id)
            .expect("load root constellation document");
    assert!(
        document.nodes.iter().any(|node| node.node_type == "portal"
            && node.title == "Root Ecology"
            && node.target_canvas_id.is_some()),
        "document fallback exposes first-class constellation portal nodes"
    );
    assert!(
        document.nodes.iter().any(|node| node.node_type == "portal"
            && node.title == "Ontological Unit"
            && node.target_canvas_id.is_some()),
        "QL units appear as portal constellations, not as a monolithic timeline"
    );
    assert!(
        document
            .nodes
            .iter()
            .all(|node| node.title != "Single historical timeline"),
        "timeline remains a lens, not a synthetic root constellation"
    );

    let db = Database::open(&database_path).expect("sqlite");
    let constellation = ConstellationRepository::new(db.connection())
        .get_by_id(&bootstrap.active_constellation_id)
        .expect("constellation lookup")
        .expect("root constellation exists");
    let root_canvas_id = constellation
        .primary_canvas_id
        .expect("root primary canvas id");
    let portal = LayoutRepository::new(db.connection())
        .list_node_layout(&root_canvas_id)
        .expect("root layouts")
        .into_iter()
        .find(|layout| layout.graph_node_id.ends_with(":root-ecology"))
        .expect("root ecology portal layout");

    db.connection()
        .execute(
            "UPDATE node_layout SET position_x = ?1 WHERE canvas_id = ?2 AND graph_node_id = ?3",
            rusqlite::params![1234.0_f64, root_canvas_id, portal.graph_node_id],
        )
        .expect("move portal layout");

    let second_bootstrap = bootstrap_workspace_at(&database_path).expect("bootstrap again");
    assert_eq!(
        second_bootstrap.active_constellation_id,
        bootstrap.active_constellation_id
    );
    let preserved_x: f64 = db
        .connection()
        .query_row(
            "SELECT position_x FROM node_layout WHERE canvas_id = ?1 AND graph_node_id = ?2",
            rusqlite::params![root_canvas_id, portal.graph_node_id],
            |row| row.get(0),
        )
        .expect("read moved portal layout");
    assert_eq!(
        preserved_x, 1234.0,
        "workspace bootstrap inserts missing constellation portals without reseeding over user layout"
    );
}

#[test]
fn constellation_document_persistence_survives_reload_and_replaces_previous_canvas_state() {
    let database_path =
        session_database_path(&format!("workspace-persistence-{}", std::process::id()));
    cleanup_database(&database_path);

    let bootstrap = bootstrap_workspace_at(&database_path).expect("bootstrap workspace");
    let document =
        load_constellation_document_at(&database_path, &bootstrap.active_constellation_id)
            .expect("load project document");

    let note = node_with_note_text(
        &document.canvas_id,
        "session-note-1",
        "Session note",
        "This thesis survives a reopen.",
    );
    let resource = resource_node(&document.canvas_id, "session-resource-1", "Report");
    let edge = connecting_edge(
        &document.canvas_id,
        "session-edge-1",
        &note.id,
        &resource.id,
    );
    let annotation = ink_annotation(&document.canvas_id, "session-annotation-1");

    let persisted = persist_document(
        &database_path,
        &document,
        vec![note.clone(), resource.clone()],
        vec![edge.clone()],
        vec![annotation.clone()],
    );

    assert_eq!(persisted.constellation.id, document.constellation.id);
    assert_eq!(persisted.canvas_id, document.canvas_id);
    assert_eq!(persisted.nodes.len(), 2);
    assert_eq!(persisted.edges.len(), 1);
    assert_eq!(persisted.annotations.len(), 1);
    assert_eq!(
        persisted.edges[0].source_handle_id.as_deref(),
        Some("source-bottom")
    );
    assert_eq!(
        persisted.edges[0].target_handle_id.as_deref(),
        Some("target-top")
    );
    assert!(persisted
        .nodes
        .iter()
        .any(|node| node.title == "Session note"
            && node.content.as_deref() == Some("This thesis survives a reopen.")));

    let reopened =
        load_constellation_document_at(&database_path, &bootstrap.active_constellation_id)
            .expect("reload persisted project document");
    assert_eq!(reopened.nodes.len(), 2);
    assert_eq!(reopened.edges.len(), 1);
    assert_eq!(reopened.annotations.len(), 1);
    assert_eq!(
        reopened.edges[0].source_handle_id.as_deref(),
        Some("source-bottom")
    );
    assert_eq!(
        reopened.edges[0].target_handle_id.as_deref(),
        Some("target-top")
    );
    assert!(reopened
        .nodes
        .iter()
        .any(|node| node.title == "Session note"));

    let replacement_note = node_with_note_text(
        &reopened.canvas_id,
        "session-note-2",
        "Replacement note",
        "This canvas state was replaced, not appended.",
    );
    let replaced = persist_document(
        &database_path,
        &reopened,
        vec![replacement_note.clone()],
        Vec::new(),
        Vec::new(),
    );

    assert_eq!(replaced.nodes.len(), 1);
    assert!(replaced.edges.is_empty());
    assert!(replaced.annotations.is_empty());

    let reopened_after_replace =
        load_constellation_document_at(&database_path, &bootstrap.active_constellation_id)
            .expect("reload replaced project document");
    assert_eq!(reopened_after_replace.nodes.len(), 1);
    assert_eq!(reopened_after_replace.nodes[0].title, "Replacement note");
    assert!(reopened_after_replace.edges.is_empty());
    assert!(reopened_after_replace.annotations.is_empty());

    cleanup_database(&database_path);
}

#[test]
fn empty_persist_payload_preserves_non_empty_canvas_state() {
    let database_path =
        session_database_path(&format!("workspace-empty-wipe-{}", std::process::id()));
    cleanup_database(&database_path);

    let bootstrap = bootstrap_workspace_at(&database_path).expect("bootstrap workspace");
    let document =
        load_constellation_document_at(&database_path, &bootstrap.active_constellation_id)
            .expect("load project document");

    let note = node_with_note_text(
        &document.canvas_id,
        "session-note-guard",
        "Guarded note",
        "This note must survive an accidental empty flush.",
    );
    let persisted = persist_document(
        &database_path,
        &document,
        vec![note.clone()],
        Vec::new(),
        Vec::new(),
    );
    assert_eq!(persisted.nodes.len(), 1);

    let preserved = persist_constellation_document_at(PersistConstellationDocumentRequest {
        annotations: Vec::new(),
        canvas_id: persisted.canvas_id.clone(),
        database_path: database_path.to_string_lossy().to_string(),
        edges: Vec::new(),
        nodes: Vec::new(),
        constellation_id: persisted.constellation.id.clone(),
    })
    .expect("empty persist preserves existing canvas substance");
    assert_eq!(preserved.nodes.len(), 1);
    assert_eq!(preserved.nodes[0].title, "Guarded note");

    let reopened =
        load_constellation_document_at(&database_path, &bootstrap.active_constellation_id)
            .expect("reload guarded project document");
    assert_eq!(reopened.nodes.len(), 1);
    assert_eq!(reopened.nodes[0].title, "Guarded note");

    cleanup_database(&database_path);
}

#[test]
fn browser_persist_payload_allows_resource_nodes_without_tags() {
    let database_path =
        session_database_path(&format!("workspace-browser-persist-{}", std::process::id()));
    cleanup_database(&database_path);

    let bootstrap = bootstrap_workspace_at(&database_path).expect("bootstrap workspace");
    let document =
        load_constellation_document_at(&database_path, &bootstrap.active_constellation_id)
            .expect("load project document");

    let payload = json!({
        "annotations": [],
        "canvasId": document.canvas_id,
        "databasePath": database_path.to_string_lossy().to_string(),
        "edges": [],
        "nodes": [
            {
                "id": "browser-note-1",
                "canvasId": document.canvas_id,
                "type": "note",
                "title": "Browser note",
                "position": { "x": 80.0, "y": 80.0 },
                "size": { "width": 240.0, "height": 160.0 },
                "summary": "",
                "content": "",
                "tags": ["note"],
                "createdAt": session_timestamp(),
                "updatedAt": session_timestamp(),
            },
            {
                "id": "browser-resource-1",
                "canvasId": document.canvas_id,
                "type": "resource",
                "title": "README.md",
                "position": { "x": 200.0, "y": 200.0 },
                "size": { "width": 260.0, "height": 180.0 },
                "summary": "README.md",
                "resourceKind": "markdown",
                "absolutePath": fixture_path("tests/fixtures/sample-project/README.md"),
                "relativePath": "README.md",
                "mimeType": "text/markdown",
                "fileFingerprint": "markdown:README.md",
                "createdAt": session_timestamp(),
                "updatedAt": session_timestamp(),
            }
        ],
        "constellationId": document.constellation.id,
    });

    let request: PersistConstellationDocumentRequest =
        serde_json::from_value(payload).expect("deserialize browser persist payload");

    let persisted = persist_constellation_document_at(request).expect("persist browser payload");

    assert_eq!(persisted.nodes.len(), 2);
    assert!(persisted
        .nodes
        .iter()
        .any(|node| node.node_type == "resource" && node.title == "README.md"));
}

#[test]
fn search_index_stays_isolated_between_session_database_paths() {
    let session_a = session_database_path(&format!("workspace-session-a-{}", std::process::id()));
    let session_b = session_database_path(&format!("workspace-session-b-{}", std::process::id()));

    cleanup_database(&session_a);
    cleanup_database(&session_b);

    assert_ne!(session_a, session_b);

    let bootstrap_a = bootstrap_workspace_at(&session_a).expect("bootstrap session a");
    let bootstrap_b = bootstrap_workspace_at(&session_b).expect("bootstrap session b");

    let mut document_a =
        load_constellation_document_at(&session_a, &bootstrap_a.active_constellation_id)
            .expect("load session a document");
    document_a.nodes.push(node_with_note_text(
        &document_a.canvas_id,
        "session-a-search-anchor",
        "Session search anchor",
        "lattice ember 9182",
    ));

    let _persisted_a = persist_constellation_document_at(PersistConstellationDocumentRequest {
        annotations: document_a.annotations.clone(),
        canvas_id: document_a.canvas_id.clone(),
        database_path: session_a.to_string_lossy().to_string(),
        edges: document_a.edges.clone(),
        nodes: document_a.nodes.clone(),
        constellation_id: document_a.constellation.id.clone(),
    })
    .expect("persist session a document");

    rebuild_constellation_search_index_command(RebuildConstellationSearchIndexRequest {
        database_path: session_a.to_string_lossy().to_string(),
        constellation_id: bootstrap_a.active_constellation_id.clone(),
    })
    .expect("rebuild session a search index");

    let session_a_hits = search_constellation_command(SearchConstellationRequest {
        database_path: session_a.to_string_lossy().to_string(),
        constellation_id: bootstrap_a.active_constellation_id.clone(),
        query: "lattice ember 9182".to_string(),
        limit: Some(10),
    })
    .expect("search session a");
    assert!(session_a_hits
        .iter()
        .any(|hit| hit.entity_type == "node" && hit.title == "Session search anchor"));

    rebuild_constellation_search_index_command(RebuildConstellationSearchIndexRequest {
        database_path: session_b.to_string_lossy().to_string(),
        constellation_id: bootstrap_b.active_constellation_id.clone(),
    })
    .expect("rebuild session b search index");

    let session_b_hits = search_constellation_command(SearchConstellationRequest {
        database_path: session_b.to_string_lossy().to_string(),
        constellation_id: bootstrap_b.active_constellation_id.clone(),
        query: "lattice ember 9182".to_string(),
        limit: Some(10),
    })
    .expect("search session b");
    assert!(session_b_hits.is_empty());

    cleanup_database(&session_a);
    cleanup_database(&session_b);
}

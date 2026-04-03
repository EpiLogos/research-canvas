use std::{
    fs,
    path::{Path, PathBuf},
};

use research_canvas_desktop_lib::commands::projects::{
    bootstrap_workspace_at, default_database_path, load_project_document_at,
    persist_project_document_at, AnnotationBoundsPayload, AnnotationPayload,
    AnnotationPointPayload, AnnotationStylePayload, CanvasEdgePayload, CanvasNodePayload,
    EdgeStylePayload, PersistProjectDocumentRequest, PositionPayload, ProjectDocumentPayload,
    SizePayload,
};
use research_canvas_desktop_lib::commands::search::{
    rebuild_project_search_index_command, search_project_command, RebuildProjectSearchIndexRequest,
    SearchProjectRequest,
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
    default_database_path(Some(session_name))
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
    document: &ProjectDocumentPayload,
    nodes: Vec<CanvasNodePayload>,
    edges: Vec<CanvasEdgePayload>,
    annotations: Vec<AnnotationPayload>,
) -> ProjectDocumentPayload {
    persist_project_document_at(PersistProjectDocumentRequest {
        annotations,
        canvas_id: document.canvas_id.clone(),
        database_path: database_path.to_string_lossy().to_string(),
        edges,
        nodes,
        project_id: document.project.id.clone(),
    })
    .expect("persist project document")
}

#[test]
fn project_document_persistence_survives_reload_and_replaces_previous_canvas_state() {
    let database_path =
        session_database_path(&format!("workspace-persistence-{}", std::process::id()));
    cleanup_database(&database_path);

    let bootstrap = bootstrap_workspace_at(&database_path).expect("bootstrap workspace");
    let document = load_project_document_at(&database_path, &bootstrap.active_project_id)
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

    assert_eq!(persisted.project.id, document.project.id);
    assert_eq!(persisted.canvas_id, document.canvas_id);
    assert_eq!(persisted.nodes.len(), 2);
    assert_eq!(persisted.edges.len(), 1);
    assert_eq!(persisted.annotations.len(), 1);
    assert_eq!(persisted.edges[0].source_handle_id.as_deref(), Some("source-bottom"));
    assert_eq!(persisted.edges[0].target_handle_id.as_deref(), Some("target-top"));
    assert!(persisted
        .nodes
        .iter()
        .any(|node| node.title == "Session note"
            && node.content.as_deref() == Some("This thesis survives a reopen.")));

    let reopened = load_project_document_at(&database_path, &bootstrap.active_project_id)
        .expect("reload persisted project document");
    assert_eq!(reopened.nodes.len(), 2);
    assert_eq!(reopened.edges.len(), 1);
    assert_eq!(reopened.annotations.len(), 1);
    assert_eq!(reopened.edges[0].source_handle_id.as_deref(), Some("source-bottom"));
    assert_eq!(reopened.edges[0].target_handle_id.as_deref(), Some("target-top"));
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
        load_project_document_at(&database_path, &bootstrap.active_project_id)
            .expect("reload replaced project document");
    assert_eq!(reopened_after_replace.nodes.len(), 1);
    assert_eq!(reopened_after_replace.nodes[0].title, "Replacement note");
    assert!(reopened_after_replace.edges.is_empty());
    assert!(reopened_after_replace.annotations.is_empty());

    cleanup_database(&database_path);
}

#[test]
fn browser_persist_payload_allows_resource_nodes_without_tags() {
    let database_path =
        session_database_path(&format!("workspace-browser-persist-{}", std::process::id()));
    cleanup_database(&database_path);

    let bootstrap = bootstrap_workspace_at(&database_path).expect("bootstrap workspace");
    let document = load_project_document_at(&database_path, &bootstrap.active_project_id)
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
        "projectId": document.project.id,
    });

    let request: PersistProjectDocumentRequest =
        serde_json::from_value(payload).expect("deserialize browser persist payload");

    let persisted = persist_project_document_at(request).expect("persist browser payload");

    assert_eq!(persisted.nodes.len(), 2);
    assert!(
        persisted
            .nodes
            .iter()
            .any(|node| node.node_type == "resource" && node.title == "README.md")
    );
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

    let mut document_a = load_project_document_at(&session_a, &bootstrap_a.active_project_id)
        .expect("load session a document");
    document_a.nodes.push(node_with_note_text(
        &document_a.canvas_id,
        "session-a-search-anchor",
        "Session search anchor",
        "lattice ember 9182",
    ));

    let _persisted_a = persist_project_document_at(PersistProjectDocumentRequest {
        annotations: document_a.annotations.clone(),
        canvas_id: document_a.canvas_id.clone(),
        database_path: session_a.to_string_lossy().to_string(),
        edges: document_a.edges.clone(),
        nodes: document_a.nodes.clone(),
        project_id: document_a.project.id.clone(),
    })
    .expect("persist session a document");

    rebuild_project_search_index_command(RebuildProjectSearchIndexRequest {
        database_path: session_a.to_string_lossy().to_string(),
        project_id: bootstrap_a.active_project_id.clone(),
    })
    .expect("rebuild session a search index");

    let session_a_hits = search_project_command(SearchProjectRequest {
        database_path: session_a.to_string_lossy().to_string(),
        project_id: bootstrap_a.active_project_id.clone(),
        query: "lattice ember 9182".to_string(),
        limit: Some(10),
    })
    .expect("search session a");
    assert!(session_a_hits
        .iter()
        .any(|hit| hit.entity_type == "node" && hit.title == "Session search anchor"));

    rebuild_project_search_index_command(RebuildProjectSearchIndexRequest {
        database_path: session_b.to_string_lossy().to_string(),
        project_id: bootstrap_b.active_project_id.clone(),
    })
    .expect("rebuild session b search index");

    let session_b_hits = search_project_command(SearchProjectRequest {
        database_path: session_b.to_string_lossy().to_string(),
        project_id: bootstrap_b.active_project_id.clone(),
        query: "lattice ember 9182".to_string(),
        limit: Some(10),
    })
    .expect("search session b");
    assert!(session_b_hits.is_empty());

    cleanup_database(&session_a);
    cleanup_database(&session_b);
}

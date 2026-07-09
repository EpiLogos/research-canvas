// apps/desktop/src-tauri/tests/canvas_view_join.rs
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::{
    canvas_service::CanvasService,
    connection::Database,
    repositories::{
        graph::{GraphRepository, NewGraphNode},
        layout::{LayoutRepository, NodeLayoutRecord},
        ConstellationRepository,
    },
};
use tempfile::tempdir;

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

/// load_canvas_view is LAYOUT-AUTHORITATIVE: it iterates local layout rows (the
/// single source of truth for "what's on this canvas"), joining in Neo4j
/// substance where it has landed, and synthesizing substance from the
/// `__canvasNode` sidecar where it hasn't (best-effort sync still pending, or
/// Neo4j never reachable). A layout row must never be dropped for lack of a
/// matching Neo4j node.
#[test]
fn load_canvas_view_is_layout_authoritative() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    // SQLite layout in a temp dir + a real canvas row.
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("t.db");
    let db = Database::open(&db_path).unwrap();
    let project = ConstellationRepository::new(db.connection())
        .create(
            "P".into(),
            "p".into(),
            None,
            dir.path().to_str().unwrap().into(),
            None,
            None,
            serde_json::json!({}),
        )
        .unwrap();
    let canvas_id = project.primary_canvas_id.unwrap();

    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    // (a) A layout row WITH a matching Neo4j node -> real substance wins.
    let synced = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: None,
        entity_type: "Event".into(),
        title: format!("Synced {run_id}"),
        body: "[]".into(),
        coordinate: None,
        source_coordinates: vec![],
        is_temporal: true,
        valid_from: Some("1602".into()),
        valid_to: Some("1602".into()),
        temporal_precision: Some("year".into()),
    }))
    .expect("synced");
    LayoutRepository::new(db.connection())
        .upsert_node_layout(&NodeLayoutRecord {
            graph_node_id: synced.graph_node_id.clone(),
            canvas_id: canvas_id.clone(),
            position_x: 50.0,
            position_y: 60.0,
            width: 240.0,
            height: 160.0,
            style_json: "{}".into(),
            created_at: now(),
            updated_at: now(),
        })
        .unwrap();

    // (b) A layout row with NO Neo4j node (never synced) -> still returned,
    // with substance synthesized from the __canvasNode sidecar.
    let unsynced_id = format!("unsynced-{run_id}");
    let sidecar_json = serde_json::json!({
        "style": {},
        "__canvasNode": { "type": "note", "title": format!("Unsynced Note {run_id}"), "content": "hello", "tags": [] }
    });
    LayoutRepository::new(db.connection())
        .upsert_node_layout(&NodeLayoutRecord {
            graph_node_id: unsynced_id.clone(),
            canvas_id: canvas_id.clone(),
            position_x: 10.0,
            position_y: 20.0,
            width: 240.0,
            height: 160.0,
            style_json: sidecar_json.to_string(),
            created_at: now(),
            updated_at: now(),
        })
        .unwrap();

    // A resource-type sidecar should synthesize entity_type = Source.
    let unsynced_resource_id = format!("unsynced-resource-{run_id}");
    let resource_sidecar_json = serde_json::json!({
        "__canvasNode": {
            "type": "resource", "title": format!("Unsynced Resource {run_id}"),
            "resourceKind": "pdf", "absolutePath": "/x.pdf", "relativePath": "x.pdf",
            "mimeType": "application/pdf", "fileFingerprint": "abc"
        }
    });
    LayoutRepository::new(db.connection())
        .upsert_node_layout(&NodeLayoutRecord {
            graph_node_id: unsynced_resource_id.clone(),
            canvas_id: canvas_id.clone(),
            position_x: 30.0,
            position_y: 40.0,
            width: 240.0,
            height: 160.0,
            style_json: resource_sidecar_json.to_string(),
            created_at: now(),
            updated_at: now(),
        })
        .unwrap();

    let service = CanvasService::new(
        GraphRepository::new(graph.clone(), database.clone()),
        db_path.to_string_lossy().to_string(),
    );
    let view = support::block_on(service.load_canvas_view(&canvas_id, "canvas")).expect("view");
    assert_eq!(view.canvas_id, canvas_id);
    assert_eq!(
        view.nodes.len(),
        3,
        "all three layout rows are returned regardless of Neo4j sync state"
    );

    let synced_join = view
        .nodes
        .iter()
        .find(|j| j.node.graph_node_id == synced.graph_node_id)
        .unwrap();
    assert_eq!(synced_join.node.title, format!("Synced {run_id}"));
    assert_eq!(synced_join.node.entity_type, "Event");
    assert_eq!(synced_join.layout.position_x, 50.0);

    let unsynced_join = view
        .nodes
        .iter()
        .find(|j| j.node.graph_node_id == unsynced_id)
        .unwrap();
    assert_eq!(
        unsynced_join.node.title,
        format!("Unsynced Note {run_id}"),
        "title synthesized from sidecar"
    );
    assert_eq!(
        unsynced_join.node.entity_type, "Work",
        "note sidecar maps to Work, matching entityTypeForNodeType"
    );
    assert!(
        !unsynced_join.node.is_temporal,
        "synthesized nodes are not temporal"
    );
    assert_eq!(unsynced_join.layout.position_x, 10.0);

    let unsynced_resource_join = view
        .nodes
        .iter()
        .find(|j| j.node.graph_node_id == unsynced_resource_id)
        .unwrap();
    assert_eq!(
        unsynced_resource_join.node.title,
        format!("Unsynced Resource {run_id}")
    );
    assert_eq!(
        unsynced_resource_join.node.entity_type, "Source",
        "resource sidecar maps to Source, matching entityTypeForNodeType"
    );

    // (c) Timeline lens still excludes non-temporal nodes, including
    // synthesized ones (which are always is_temporal = false).
    let tl = support::block_on(service.load_canvas_view(&canvas_id, "timeline")).expect("tl");
    assert!(tl
        .nodes
        .iter()
        .any(|j| j.node.graph_node_id == synced.graph_node_id));
    assert!(!tl.nodes.iter().any(|j| j.node.graph_node_id == unsynced_id));
    assert!(!tl
        .nodes
        .iter()
        .any(|j| j.node.graph_node_id == unsynced_resource_id));

    support::block_on(async {
        graph
            .run_on(
                &database,
                query("MATCH (n {graph_node_id: $id}) DETACH DELETE n")
                    .param("id", synced.graph_node_id),
            )
            .await
            .expect("cleanup");
    });
}

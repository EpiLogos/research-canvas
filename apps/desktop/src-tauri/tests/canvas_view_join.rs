// apps/desktop/src-tauri/tests/canvas_view_join.rs
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::{
    canvas_service::CanvasService,
    connection::Database,
    repositories::{
        graph::{GraphRepository, NewGraphNode},
        layout::{LayoutRepository, NodeLayoutRecord},
        ProjectRepository,
    },
};
use tempfile::tempdir;

fn now() -> String { chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true) }

#[test]
fn load_canvas_view_joins_substance_with_layout_and_autoplaces_missing() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    // SQLite layout in a temp dir + a real canvas row.
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("t.db");
    let db = Database::open(&db_path).unwrap();
    let project = ProjectRepository::new(db.connection())
        .create("P".into(), "p".into(), None, dir.path().to_str().unwrap().into(),
                None, None, serde_json::json!({})).unwrap();
    let canvas_id = project.primary_canvas_id.unwrap();

    // Two graph nodes; only one has a layout row.
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");
    let placed = support::block_on(repo.create_node(NewGraphNode {
        entity_type: "Event".into(), title: format!("Placed {run_id}"), body: "[]".into(),
        coordinate: None, source_coordinates: vec![], is_temporal: true,
        valid_from: Some("1602".into()), valid_to: Some("1602".into()), temporal_precision: Some("year".into()),
    })).expect("placed");
    let floating = support::block_on(repo.create_node(NewGraphNode {
        entity_type: "Archetype".into(), title: format!("Floating {run_id}"), body: "[]".into(),
        coordinate: None, source_coordinates: vec![], is_temporal: false,
        valid_from: None, valid_to: None, temporal_precision: None,
    })).expect("floating");

    LayoutRepository::new(db.connection()).upsert_node_layout(&NodeLayoutRecord {
        graph_node_id: placed.graph_node_id.clone(), canvas_id: canvas_id.clone(),
        position_x: 50.0, position_y: 60.0, width: 240.0, height: 160.0,
        style_json: "{}".into(), created_at: now(), updated_at: now(),
    }).unwrap();

    let service = CanvasService::new(
        GraphRepository::new(graph.clone(), database.clone()),
        db_path.to_string_lossy().to_string(),
    );
    let view = support::block_on(service.load_canvas_view(&canvas_id, "canvas")).expect("view");
    assert_eq!(view.canvas_id, canvas_id);
    assert_eq!(view.nodes.len(), 2, "both nodes appear (one auto-placed)");

    let placed_join = view.nodes.iter().find(|j| j.node.graph_node_id == placed.graph_node_id).unwrap();
    assert_eq!(placed_join.layout.position_x, 50.0);
    let floating_join = view.nodes.iter().find(|j| j.node.graph_node_id == floating.graph_node_id).unwrap();
    // Auto-placed default has a finite position and non-zero default size.
    assert!(floating_join.layout.width > 0.0);

    // Timeline lens excludes the trans-temporal archetype.
    let tl = support::block_on(service.load_canvas_view(&canvas_id, "timeline")).expect("tl");
    assert!(tl.nodes.iter().any(|j| j.node.graph_node_id == placed.graph_node_id));
    assert!(!tl.nodes.iter().any(|j| j.node.graph_node_id == floating.graph_node_id));

    for id in [placed.graph_node_id, floating.graph_node_id] {
        support::block_on(async {
            graph.run_on(&database, query("MATCH (n {graph_node_id: $id}) DETACH DELETE n")
                .param("id", id)).await.expect("cleanup");
        });
    }
}

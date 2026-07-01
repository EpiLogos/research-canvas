// apps/desktop/src-tauri/tests/ws4a_cutover_roundtrip.rs
// WS4a Task 7: end-to-end proof that a created node round-trips its body through Neo4j.
// Creates a node with a client-supplied id, places a layout row with the same id,
// edits the body via update_node, and reads it back through load_canvas_view.
// Asserts the resulting JoinedCanvasNode has the expected id, body, and layout position.
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::{
    canvas_service::CanvasService,
    connection::Database,
    repositories::{
        graph::{GraphNodePatch, GraphRepository, NewGraphNode},
        layout::{LayoutRepository, NodeLayoutRecord},
        ProjectRepository,
    },
};
use tempfile::tempdir;

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

#[test]
fn created_node_roundtrips_body_through_neo4j() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };

    // --- SQLite: temp dir + real project + canvas_id ---
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("roundtrip.db");
    let db = Database::open(&db_path).unwrap();
    let project = ProjectRepository::new(db.connection())
        .create(
            "RoundtripProject".into(),
            "roundtrip-project".into(),
            None,
            dir.path().to_str().unwrap().into(),
            None,
            None,
            serde_json::json!({}),
        )
        .unwrap();
    let canvas_id = project.primary_canvas_id.unwrap();

    // --- Neo4j: mint id, ensure schema, create node ---
    let id = format!("ws4a-rt-{run_id}");
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("ensure_schema");

    support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: Some(id.clone()),
        entity_type: "Work".into(),
        title: format!("RT {run_id}"),
        body: "[]".into(),
        coordinate: None,
        source_coordinates: vec![],
        is_temporal: false,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
    }))
    .expect("create_node");

    // --- SQLite: upsert a layout row using the same id ---
    LayoutRepository::new(db.connection())
        .upsert_node_layout(&NodeLayoutRecord {
            graph_node_id: id.clone(),
            canvas_id: canvas_id.clone(),
            position_x: 10.0,
            position_y: 20.0,
            width: 240.0,
            height: 160.0,
            style_json: "{}".into(),
            created_at: now(),
            updated_at: now(),
        })
        .expect("upsert_node_layout");

    // --- Neo4j: edit the body via update_node ---
    support::block_on(repo.update_node(
        &id,
        GraphNodePatch {
            body: Some("[{\"type\":\"paragraph\"}]".into()),
            ..Default::default()
        },
    ))
    .expect("update_node");

    // --- Load via CanvasService::load_canvas_view ---
    let service = CanvasService::new(
        GraphRepository::new(graph.clone(), database.clone()),
        db_path.to_string_lossy().to_string(),
    );
    let view = support::block_on(service.load_canvas_view(&canvas_id, "canvas"))
        .expect("load_canvas_view");

    // --- Assert: exactly one joined node matches our id ---
    let joined = view
        .nodes
        .iter()
        .find(|j| j.node.graph_node_id == id)
        .unwrap_or_else(|| panic!("no JoinedCanvasNode with graph_node_id == {id}"));

    assert_eq!(
        joined.node.graph_node_id, id,
        "graph_node_id must equal the client-supplied id"
    );
    assert_eq!(
        joined.node.body,
        "[{\"type\":\"paragraph\"}]",
        "body must reflect the update_node edit"
    );
    assert_eq!(
        joined.layout.position_x, 10.0,
        "layout.position_x must match the upserted row"
    );

    // --- Teardown ---
    support::block_on(async {
        graph
            .run_on(
                &database,
                query("MATCH (n {graph_node_id: $id}) DETACH DELETE n").param("id", id.clone()),
            )
            .await
            .expect("cleanup");
    });
}

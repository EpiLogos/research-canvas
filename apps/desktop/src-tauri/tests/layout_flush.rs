use research_canvas_desktop_lib::commands::layout::{
    flush_canvas_layout_at, EdgeLayoutPayload, FlushCanvasLayoutRequest, NodeLayoutPayload,
};
use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{LayoutRepository, ProjectRepository},
};
use tempfile::tempdir;

fn node(graph_node_id: &str, canvas_id: &str, x: f64, y: f64) -> NodeLayoutPayload {
    NodeLayoutPayload {
        graph_node_id: graph_node_id.to_string(),
        canvas_id: canvas_id.to_string(),
        position_x: x,
        position_y: y,
        width: 240.0,
        height: 160.0,
        style_json: "{}".to_string(),
    }
}

#[test]
fn flush_canvas_layout_persists_nodes_edges_and_viewport_in_one_transaction() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("flush.sqlite");
    let canvas_id = {
        let database = Database::open(&db_path).expect("open");
        let projects = ProjectRepository::new(database.connection());
        let project = projects
            .create(
                "WS1".to_string(),
                "ws1".to_string(),
                None,
                "/tmp/ws1".to_string(),
                None,
                None,
                serde_json::json!({}),
            )
            .expect("create project");
        project.primary_canvas_id.expect("canvas")
    };

    let response = flush_canvas_layout_at(FlushCanvasLayoutRequest {
        database_path: db_path.to_string_lossy().to_string(),
        canvas_id: canvas_id.clone(),
        layouts: vec![node("n1", &canvas_id, 10.0, 20.0), node("n2", &canvas_id, 30.0, 40.0)],
        edges: vec![EdgeLayoutPayload {
            id: "e1".to_string(),
            canvas_id: canvas_id.clone(),
            source_graph_node_id: "n1".to_string(),
            target_graph_node_id: "n2".to_string(),
            relation_kind: "supports".to_string(),
            source_handle_id: None,
            target_handle_id: None,
            style_json: "{}".to_string(),
        }],
        viewport_json: r#"{"x":5,"y":6,"zoom":1.25}"#.to_string(),
        app_state_json: "{}".to_string(),
    })
    .expect("flush ok");

    assert_eq!(response.written_nodes, 2);
    assert_eq!(response.written_edges, 1);

    let database = Database::open(&db_path).expect("reopen");
    let repo = LayoutRepository::new(database.connection());
    assert_eq!(repo.list_node_layout(&canvas_id).expect("nodes").len(), 2);
    assert_eq!(repo.list_edge_layout(&canvas_id).expect("edges").len(), 1);
    let state = repo.get_app_state(&canvas_id).expect("state").expect("row");
    assert_eq!(state.viewport_json, r#"{"x":5,"y":6,"zoom":1.25}"#);
}

#[test]
fn flush_canvas_layout_rolls_back_when_a_node_violates_the_canvas_foreign_key() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("rollback.sqlite");
    let canvas_id = {
        let database = Database::open(&db_path).expect("open");
        let projects = ProjectRepository::new(database.connection());
        let project = projects
            .create(
                "WS1".to_string(),
                "ws1".to_string(),
                None,
                "/tmp/ws1".to_string(),
                None,
                None,
                serde_json::json!({}),
            )
            .expect("create project");
        project.primary_canvas_id.expect("canvas")
    };

    // First good node uses the real canvas_id; second node references a canvas
    // that does not exist, so its FK fails and the whole flush must roll back.
    let result = flush_canvas_layout_at(FlushCanvasLayoutRequest {
        database_path: db_path.to_string_lossy().to_string(),
        canvas_id: canvas_id.clone(),
        layouts: vec![
            node("good", &canvas_id, 1.0, 1.0),
            node("bad", "canvas-that-does-not-exist", 2.0, 2.0),
        ],
        edges: vec![],
        viewport_json: r#"{"x":0,"y":0,"zoom":1}"#.to_string(),
        app_state_json: "{}".to_string(),
    });

    assert!(result.is_err(), "flush must surface the error, not swallow it");

    // Nothing was committed: zero rows for this canvas.
    let database = Database::open(&db_path).expect("reopen");
    let repo = LayoutRepository::new(database.connection());
    assert!(
        repo.list_node_layout(&canvas_id).expect("nodes").is_empty(),
        "transaction must roll back the 'good' node too"
    );
    assert!(repo.get_app_state(&canvas_id).expect("state").is_none());
}

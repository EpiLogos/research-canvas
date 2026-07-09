use research_canvas_desktop_lib::commands::layout::{
    flush_canvas_layout_at, EdgeLayoutPayload, FlushCanvasLayoutRequest, NodeLayoutPayload,
};
use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{LayoutRepository, ProjectRepository},
};
use tempfile::tempdir;

fn node(id: &str, canvas_id: &str, x: f64, y: f64) -> NodeLayoutPayload {
    NodeLayoutPayload {
        graph_node_id: id.to_string(),
        canvas_id: canvas_id.to_string(),
        position_x: x,
        position_y: y,
        width: 240.0,
        height: 160.0,
        style_json: "{}".to_string(),
    }
}

#[test]
fn second_flush_updates_in_place_and_survives_reopen() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("roundtrip.sqlite");
    let canvas_id = {
        let database = Database::open(&db_path).expect("open");
        let projects = ProjectRepository::new(database.connection());
        projects
            .create(
                "WS1".to_string(),
                "ws1".to_string(),
                None,
                "/tmp/ws1".to_string(),
                None,
                None,
                serde_json::json!({}),
            )
            .expect("create project")
            .primary_canvas_id
            .expect("canvas")
    };

    // First flush: two nodes, one edge, viewport A.
    flush_canvas_layout_at(FlushCanvasLayoutRequest {
        database_path: db_path.to_string_lossy().to_string(),
        canvas_id: canvas_id.clone(),
        layouts: vec![
            node("n1", &canvas_id, 0.0, 0.0),
            node("n2", &canvas_id, 100.0, 0.0),
        ],
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
        viewport_json: r#"{"x":1,"y":1,"zoom":1}"#.to_string(),
        app_state_json: "{}".to_string(),
    })
    .expect("first flush");

    // Second flush: n1 dragged, viewport B, same edge (no duplication).
    flush_canvas_layout_at(FlushCanvasLayoutRequest {
        database_path: db_path.to_string_lossy().to_string(),
        canvas_id: canvas_id.clone(),
        layouts: vec![
            node("n1", &canvas_id, 500.0, 600.0),
            node("n2", &canvas_id, 100.0, 0.0),
        ],
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
        viewport_json: r#"{"x":9,"y":9,"zoom":2}"#.to_string(),
        app_state_json: "{}".to_string(),
    })
    .expect("second flush");

    // Reopen a fresh connection and verify durable state.
    let database = Database::open(&db_path).expect("reopen");
    let repo = LayoutRepository::new(database.connection());

    let nodes = repo.list_node_layout(&canvas_id).expect("nodes");
    assert_eq!(nodes.len(), 2, "no duplicate rows after second flush");
    let n1 = nodes.iter().find(|r| r.graph_node_id == "n1").expect("n1");
    assert_eq!(n1.position_x, 500.0);
    assert_eq!(n1.position_y, 600.0);

    let edges = repo.list_edge_layout(&canvas_id).expect("edges");
    assert_eq!(edges.len(), 1, "edge updated in place, not duplicated");

    let state = repo.get_app_state(&canvas_id).expect("state").expect("row");
    assert_eq!(state.viewport_json, r#"{"x":9,"y":9,"zoom":2}"#);
}

use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{EdgeLayoutRecord, LayoutRepository, NodeLayoutRecord, ProjectRepository},
};
use tempfile::{tempdir, TempDir};

fn open_temp_database() -> (TempDir, Database) {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("research-canvas.sqlite");
    let database = Database::open(&path).expect("database open");
    (dir, database)
}

fn make_canvas(database: &Database) -> String {
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
    project.primary_canvas_id.expect("primary canvas")
}

fn record(graph_node_id: &str, canvas_id: &str, x: f64, y: f64) -> NodeLayoutRecord {
    NodeLayoutRecord {
        graph_node_id: graph_node_id.to_string(),
        canvas_id: canvas_id.to_string(),
        position_x: x,
        position_y: y,
        width: 240.0,
        height: 160.0,
        style_json: "{}".to_string(),
        created_at: "2026-06-28T00:00:00Z".to_string(),
        updated_at: "2026-06-28T00:00:00Z".to_string(),
    }
}

#[test]
fn upsert_node_layout_inserts_then_updates_in_place() {
    let (_dir, database) = open_temp_database();
    let canvas_id = make_canvas(&database);
    let repo = LayoutRepository::new(database.connection());

    repo.upsert_node_layout(&record("n1", &canvas_id, 10.0, 20.0))
        .expect("first upsert");

    let after_insert = repo.list_node_layout(&canvas_id).expect("list");
    assert_eq!(after_insert.len(), 1);
    assert_eq!(after_insert[0].graph_node_id, "n1");
    assert_eq!(after_insert[0].position_x, 10.0);
    assert_eq!(after_insert[0].position_y, 20.0);

    // Same (canvas_id, graph_node_id) → update, not a second row.
    repo.upsert_node_layout(&record("n1", &canvas_id, 99.0, 88.0))
        .expect("second upsert");

    let after_update = repo.list_node_layout(&canvas_id).expect("list again");
    assert_eq!(after_update.len(), 1);
    assert_eq!(after_update[0].position_x, 99.0);
    assert_eq!(after_update[0].position_y, 88.0);
}

fn edge(id: &str, canvas_id: &str, relation: &str) -> EdgeLayoutRecord {
    EdgeLayoutRecord {
        id: id.to_string(),
        canvas_id: canvas_id.to_string(),
        source_graph_node_id: "a".to_string(),
        target_graph_node_id: "b".to_string(),
        relation_kind: relation.to_string(),
        source_handle_id: Some("a-right".to_string()),
        target_handle_id: Some("b-left".to_string()),
        style_json: "{}".to_string(),
        created_at: "2026-06-28T00:00:00Z".to_string(),
        updated_at: "2026-06-28T00:00:00Z".to_string(),
    }
}

#[test]
fn edge_layout_upserts_updates_in_place_and_deletes() {
    let (_dir, database) = open_temp_database();
    let canvas_id = make_canvas(&database);
    let repo = LayoutRepository::new(database.connection());

    repo.upsert_edge_layout(&edge("e1", &canvas_id, "supports"))
        .expect("insert edge");

    let after_insert = repo.list_edge_layout(&canvas_id).expect("list edges");
    assert_eq!(after_insert.len(), 1);
    assert_eq!(after_insert[0].relation_kind, "supports");
    assert_eq!(after_insert[0].source_handle_id.as_deref(), Some("a-right"));

    repo.upsert_edge_layout(&edge("e1", &canvas_id, "opposes"))
        .expect("update edge");
    let after_update = repo.list_edge_layout(&canvas_id).expect("list edges again");
    assert_eq!(after_update.len(), 1);
    assert_eq!(after_update[0].relation_kind, "opposes");

    repo.delete_edge_layout("e1").expect("delete edge");
    assert!(repo.list_edge_layout(&canvas_id).expect("list empty").is_empty());
}

#[test]
fn delete_node_layout_removes_only_the_targeted_row() {
    let (_dir, database) = open_temp_database();
    let canvas_id = make_canvas(&database);
    let repo = LayoutRepository::new(database.connection());

    repo.upsert_node_layout(&record("keep", &canvas_id, 1.0, 1.0))
        .expect("upsert keep");
    repo.upsert_node_layout(&record("drop", &canvas_id, 2.0, 2.0))
        .expect("upsert drop");

    repo.delete_node_layout(&canvas_id, "drop")
        .expect("delete drop");

    let remaining = repo.list_node_layout(&canvas_id).expect("list");
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].graph_node_id, "keep");
}

#[test]
fn app_state_upsert_persists_viewport_and_is_readable() {
    let (_dir, database) = open_temp_database();
    let canvas_id = make_canvas(&database);
    let repo = LayoutRepository::new(database.connection());

    assert!(repo.get_app_state(&canvas_id).expect("get none").is_none());

    repo.upsert_app_state(&research_canvas_desktop_lib::db::repositories::CanvasAppStateRecord {
        canvas_id: canvas_id.clone(),
        viewport_json: r#"{"x":12,"y":34,"zoom":1.5}"#.to_string(),
        app_state_json: r#"{"panel":"open"}"#.to_string(),
        updated_at: "2026-06-28T00:00:00Z".to_string(),
    })
    .expect("first upsert");

    let loaded = repo.get_app_state(&canvas_id).expect("get some").expect("row");
    assert_eq!(loaded.viewport_json, r#"{"x":12,"y":34,"zoom":1.5}"#);
    assert_eq!(loaded.app_state_json, r#"{"panel":"open"}"#);

    repo.upsert_app_state(&research_canvas_desktop_lib::db::repositories::CanvasAppStateRecord {
        canvas_id: canvas_id.clone(),
        viewport_json: r#"{"x":0,"y":0,"zoom":2}"#.to_string(),
        app_state_json: "{}".to_string(),
        updated_at: "2026-06-28T01:00:00Z".to_string(),
    })
    .expect("second upsert");

    let updated = repo.get_app_state(&canvas_id).expect("get some 2").expect("row 2");
    assert_eq!(updated.viewport_json, r#"{"x":0,"y":0,"zoom":2}"#);

    // Still exactly one row per canvas.
    let count: i64 = database
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM canvas_app_state WHERE canvas_id = ?1",
            [&canvas_id],
            |row| row.get(0),
        )
        .expect("count");
    assert_eq!(count, 1);
}

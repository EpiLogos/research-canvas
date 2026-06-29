use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{LayoutRepository, NodeLayoutRecord, ProjectRepository},
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

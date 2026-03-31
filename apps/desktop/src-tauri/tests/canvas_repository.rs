use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{CanvasGraphRepository, ProjectRepository},
};
use tempfile::{tempdir, TempDir};

fn open_temp_database() -> (TempDir, Database) {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("research-canvas.sqlite");
    let database = Database::open(&path).expect("database open");
    (dir, database)
}

#[test]
fn persists_nodes_edges_and_edge_notes_for_a_canvas_snapshot() {
    let (_dir, database) = open_temp_database();
    let projects = ProjectRepository::new(database.connection());
    let project = projects
        .create(
            "Episode 0.2".to_string(),
            "episode-0-2".to_string(),
            None,
            "/tmp/episode-0-2".to_string(),
            Some("A research-heavy episode".to_string()),
            None,
            serde_json::json!({"published": false}),
        )
        .expect("create project");
    let canvas_id = project.primary_canvas_id.expect("primary canvas");

    let repository = CanvasGraphRepository::new(database.connection());
    let note_node = repository
        .create_note_node(
            &canvas_id,
            "Opening note",
            "The thesis starts here.",
            120.0,
            180.0,
        )
        .expect("create note node");
    let resource_node = repository
        .create_resource_node(
            &canvas_id,
            "Report",
            "/tmp/report.md",
            "report.md",
            "markdown",
            "text/markdown",
            "fingerprint-1",
            480.0,
            220.0,
        )
        .expect("create resource node");

    let edge = repository
        .connect_nodes(&canvas_id, &note_node.id, &resource_node.id, "supports")
        .expect("connect nodes");
    repository
        .update_edge_note(&edge.id, "Primary supporting source")
        .expect("update edge note");

    let snapshot = repository
        .load_canvas_snapshot(&canvas_id)
        .expect("load snapshot");
    assert_eq!(snapshot.nodes.len(), 2);
    assert_eq!(snapshot.edges.len(), 1);
    assert_eq!(snapshot.edges[0].note, "Primary supporting source");
}

#[test]
fn style_fields_round_trip() {
    let dir = tempfile::tempdir().unwrap();
    let db = Database::open(dir.path().join("test.db")).unwrap();
    let conn = db.connection();

    let project_repo = ProjectRepository::new(conn);
    let project = project_repo
        .create(
            "Test".to_string(),
            "test".to_string(),
            None,
            dir.path().to_str().unwrap().to_string(),
            None,
            None,
            serde_json::json!({}),
        )
        .unwrap();
    let canvas_id = project.primary_canvas_id.unwrap();

    let graph = CanvasGraphRepository::new(conn);
    let node = graph
        .create_note_node(&canvas_id, "Title", "Content", 0.0, 0.0)
        .unwrap();

    // Initially style fields are None
    assert_eq!(node.dot_colour, None);
    assert_eq!(node.bg_colour, None);

    // Update style
    graph
        .update_node_style(&node.id, Some("#4a4aff"), Some("#0e0e22"), None, None)
        .unwrap();

    let updated = graph.get_node_by_id(&node.id).unwrap().unwrap();
    assert_eq!(updated.dot_colour.as_deref(), Some("#4a4aff"));
    assert_eq!(updated.bg_colour.as_deref(), Some("#0e0e22"));
    assert_eq!(updated.text_colour, None);
    assert_eq!(updated.thumbnail, None);
}

fn make_test_canvas(dir: &tempfile::TempDir) -> (Database, String, String) {
    let db = Database::open(dir.path().join("test.db")).unwrap();
    let conn = db.connection();
    let project_repo = ProjectRepository::new(conn);
    let project = project_repo
        .create(
            "Test".to_string(),
            "test".to_string(),
            None,
            dir.path().to_str().unwrap().to_string(),
            None,
            None,
            serde_json::json!({}),
        )
        .unwrap();
    let canvas_id = project.primary_canvas_id.unwrap();
    (db, project.id, canvas_id)
}

#[test]
fn update_node_title_and_position() {
    let dir = tempfile::tempdir().unwrap();
    let (db, _pid, canvas_id) = make_test_canvas(&dir);
    let conn = db.connection();
    let graph = CanvasGraphRepository::new(conn);

    let node = graph.create_note_node(&canvas_id, "Old", "body", 0.0, 0.0).unwrap();
    graph.update_node(&node.id, Some("New Title"), None, Some(100.0), Some(200.0)).unwrap();

    let updated = graph.get_node_by_id(&node.id).unwrap().unwrap();
    assert_eq!(updated.title, "New Title");
    assert_eq!(updated.position_x, 100.0);
    assert_eq!(updated.position_y, 200.0);
}

#[test]
fn delete_node_removes_edges() {
    let dir = tempfile::tempdir().unwrap();
    let (db, _pid, canvas_id) = make_test_canvas(&dir);
    let conn = db.connection();
    let graph = CanvasGraphRepository::new(conn);

    let a = graph.create_note_node(&canvas_id, "A", "", 0.0, 0.0).unwrap();
    let b = graph.create_note_node(&canvas_id, "B", "", 100.0, 0.0).unwrap();
    let edge = graph.connect_nodes(&canvas_id, &a.id, &b.id, "reference").unwrap();

    graph.delete_node(&a.id).unwrap();

    let snap = graph.load_canvas_snapshot(&canvas_id).unwrap();
    assert!(!snap.nodes.iter().any(|n| n.id == a.id));
    assert!(!snap.edges.iter().any(|e| e.id == edge.id));
}

#[test]
fn delete_edge_by_id() {
    let dir = tempfile::tempdir().unwrap();
    let (db, _pid, canvas_id) = make_test_canvas(&dir);
    let conn = db.connection();
    let graph = CanvasGraphRepository::new(conn);

    let a = graph.create_note_node(&canvas_id, "A", "", 0.0, 0.0).unwrap();
    let b = graph.create_note_node(&canvas_id, "B", "", 100.0, 0.0).unwrap();
    let edge = graph.connect_nodes(&canvas_id, &a.id, &b.id, "reference").unwrap();

    graph.delete_edge(&edge.id).unwrap();

    let snap = graph.load_canvas_snapshot(&canvas_id).unwrap();
    assert!(snap.edges.is_empty());
}

#[test]
fn create_group_node_test() {
    let dir = tempfile::tempdir().unwrap();
    let (db, _pid, canvas_id) = make_test_canvas(&dir);
    let conn = db.connection();
    let graph = CanvasGraphRepository::new(conn);

    let node = graph.create_group_node(&canvas_id, "Movement 2", "#e67e22", 0.0, 0.0).unwrap();
    assert_eq!(node.node_type, "group");
    assert_eq!(node.color.as_deref(), Some("#e67e22"));
}

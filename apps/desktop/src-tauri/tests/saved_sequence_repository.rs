use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{ProjectRepository, SavedSequenceRepository},
};
use tempfile::{tempdir, TempDir};

fn open_temp_database() -> (TempDir, Database) {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("research-canvas.sqlite");
    let database = Database::open(&path).expect("database open");
    (dir, database)
}

fn make_test_canvas(dir: &TempDir) -> (Database, String, String) {
    let path = dir.path().join("research-canvas.sqlite");
    let database = Database::open(&path).expect("database open");
    let projects = ProjectRepository::new(database.connection());
    let project = projects
        .create(
            "Test Project".to_string(),
            "test-project".to_string(),
            None,
            dir.path().to_str().unwrap().to_string(),
            None,
            None,
            serde_json::json!({}),
        )
        .expect("create project");
    let canvas_id = project.primary_canvas_id.expect("primary canvas");
    (database, project.id, canvas_id)
}

#[test]
fn create_returns_record_matching_inputs() {
    let dir = tempdir().expect("temp dir");
    let (database, project_id, canvas_id) = make_test_canvas(&dir);
    let repo = SavedSequenceRepository::new(database.connection());

    let record = repo
        .create(&project_id, &canvas_id, "My Sequence")
        .expect("create sequence");

    assert!(!record.id.is_empty());
    assert_eq!(record.project_id, project_id);
    assert_eq!(record.canvas_id, canvas_id);
    assert_eq!(record.name, "My Sequence");
    assert_eq!(record.root_node_id, None);
    assert!(record.edge_ids.is_empty());
    assert!(!record.created_at.is_empty());
    assert!(!record.updated_at.is_empty());
}

#[test]
fn list_for_canvas_returns_sequences_in_created_at_order() {
    let dir = tempdir().expect("temp dir");
    let (database, project_id, canvas_id) = make_test_canvas(&dir);
    let repo = SavedSequenceRepository::new(database.connection());

    let first = repo
        .create(&project_id, &canvas_id, "Alpha")
        .expect("create first");
    let second = repo
        .create(&project_id, &canvas_id, "Beta")
        .expect("create second");
    let third = repo
        .create(&project_id, &canvas_id, "Gamma")
        .expect("create third");

    let list = repo
        .list_for_canvas(&canvas_id)
        .expect("list sequences");

    assert_eq!(list.len(), 3);
    assert_eq!(list[0].id, first.id);
    assert_eq!(list[1].id, second.id);
    assert_eq!(list[2].id, third.id);
    assert_eq!(list[0].name, "Alpha");
    assert_eq!(list[1].name, "Beta");
    assert_eq!(list[2].name, "Gamma");
}

#[test]
fn list_for_canvas_only_returns_sequences_for_that_canvas() {
    let dir = tempdir().expect("temp dir");
    let (database, project_id, canvas_id) = make_test_canvas(&dir);
    let repo = SavedSequenceRepository::new(database.connection());

    repo.create(&project_id, &canvas_id, "Belongs Here")
        .expect("create sequence");

    let other_canvas_id = "non-existent-canvas-id";
    let list = repo
        .list_for_canvas(other_canvas_id)
        .expect("list sequences for other canvas");

    assert!(list.is_empty());
}

#[test]
fn get_by_id_returns_some_for_existing_record() {
    let dir = tempdir().expect("temp dir");
    let (database, project_id, canvas_id) = make_test_canvas(&dir);
    let repo = SavedSequenceRepository::new(database.connection());

    let created = repo
        .create(&project_id, &canvas_id, "Lookup Me")
        .expect("create sequence");

    let found = repo
        .get_by_id(&created.id)
        .expect("get by id")
        .expect("should be Some");

    assert_eq!(found.id, created.id);
    assert_eq!(found.name, "Lookup Me");
    assert_eq!(found.canvas_id, canvas_id);
}

#[test]
fn get_by_id_returns_none_for_unknown_id() {
    let (_dir, database) = open_temp_database();
    let repo = SavedSequenceRepository::new(database.connection());

    let result = repo
        .get_by_id("00000000-0000-0000-0000-000000000000")
        .expect("get by id should not error");

    assert!(result.is_none());
}

#[test]
fn update_name_root_node_id_and_edge_ids_round_trip() {
    let dir = tempdir().expect("temp dir");
    let (database, project_id, canvas_id) = make_test_canvas(&dir);
    let repo = SavedSequenceRepository::new(database.connection());

    let created = repo
        .create(&project_id, &canvas_id, "Original Name")
        .expect("create sequence");

    let edge_ids = vec![
        "edge-aaa".to_string(),
        "edge-bbb".to_string(),
        "edge-ccc".to_string(),
    ];
    let updated = repo
        .update(
            &created.id,
            "Updated Name",
            Some("node-root-xyz"),
            &edge_ids,
        )
        .expect("update sequence");

    assert_eq!(updated.id, created.id);
    assert_eq!(updated.name, "Updated Name");
    assert_eq!(updated.root_node_id.as_deref(), Some("node-root-xyz"));
    assert_eq!(updated.edge_ids, edge_ids);

    // Verify round-trip via get_by_id
    let fetched = repo
        .get_by_id(&created.id)
        .expect("get by id")
        .expect("should be Some");
    assert_eq!(fetched.name, "Updated Name");
    assert_eq!(fetched.root_node_id.as_deref(), Some("node-root-xyz"));
    assert_eq!(fetched.edge_ids, edge_ids);
}

#[test]
fn update_can_clear_root_node_id_and_edge_ids() {
    let dir = tempdir().expect("temp dir");
    let (database, project_id, canvas_id) = make_test_canvas(&dir);
    let repo = SavedSequenceRepository::new(database.connection());

    let created = repo
        .create(&project_id, &canvas_id, "Sequence")
        .expect("create sequence");

    // First update with values
    repo.update(
        &created.id,
        "Sequence",
        Some("some-root"),
        &["edge-1".to_string()],
    )
    .expect("first update");

    // Then clear them
    let cleared = repo
        .update(&created.id, "Sequence", None, &[])
        .expect("clear update");

    assert_eq!(cleared.root_node_id, None);
    assert!(cleared.edge_ids.is_empty());
}

#[test]
fn delete_removes_record_so_get_by_id_returns_none() {
    let dir = tempdir().expect("temp dir");
    let (database, project_id, canvas_id) = make_test_canvas(&dir);
    let repo = SavedSequenceRepository::new(database.connection());

    let created = repo
        .create(&project_id, &canvas_id, "To Be Deleted")
        .expect("create sequence");

    // Confirm it exists before deletion
    assert!(repo
        .get_by_id(&created.id)
        .expect("pre-delete get")
        .is_some());

    repo.delete(&created.id).expect("delete sequence");

    let result = repo
        .get_by_id(&created.id)
        .expect("post-delete get");

    assert!(result.is_none());
}

#[test]
fn delete_does_not_affect_other_sequences() {
    let dir = tempdir().expect("temp dir");
    let (database, project_id, canvas_id) = make_test_canvas(&dir);
    let repo = SavedSequenceRepository::new(database.connection());

    let keep = repo
        .create(&project_id, &canvas_id, "Keep Me")
        .expect("create keep");
    let remove = repo
        .create(&project_id, &canvas_id, "Remove Me")
        .expect("create remove");

    repo.delete(&remove.id).expect("delete sequence");

    let list = repo.list_for_canvas(&canvas_id).expect("list after delete");
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, keep.id);
}

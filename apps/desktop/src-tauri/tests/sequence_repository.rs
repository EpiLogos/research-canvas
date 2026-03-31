use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{CanvasGraphRepository, ProjectRepository, SequenceRepository},
};
use tempfile::{tempdir, TempDir};

fn open_temp_database() -> (TempDir, Database) {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("research-canvas.sqlite");
    let database = Database::open(&path).expect("database open");
    (dir, database)
}

#[test]
fn persists_sequences_with_ordered_steps_for_a_canvas() {
    let (_dir, database) = open_temp_database();
    let projects = ProjectRepository::new(database.connection());
    let project = projects
        .create(
            "Episode 0.2".to_string(),
            "episode-0-2".to_string(),
            None,
            "/tmp/episode-0-2".to_string(),
            None,
            None,
            serde_json::json!({}),
        )
        .expect("create project");
    let canvas_id = project.primary_canvas_id.expect("primary canvas");

    let graph = CanvasGraphRepository::new(database.connection());
    let first_node = graph
        .create_note_node(
            &canvas_id,
            "Opening note",
            "The thesis starts here.",
            120.0,
            160.0,
        )
        .expect("create first node");
    let second_node = graph
        .create_resource_node(
            &canvas_id,
            "Source report",
            "/tmp/report.md",
            "report.md",
            "markdown",
            "text/markdown",
            "markdown:report.md",
            320.0,
            180.0,
        )
        .expect("create second node");

    let repository = SequenceRepository::new(database.connection());
    let sequence = repository
        .create_sequence(
            &project.id,
            &canvas_id,
            "Episode flow",
            "storyboard",
            Some("Primary narrative arc".to_string()),
            false,
        )
        .expect("create sequence");
    repository
        .add_step(
            &sequence.id,
            "node",
            &first_node.id,
            "Start with the thesis",
            serde_json::json!({ "x": 0.0, "y": 0.0, "zoom": 1.0 }),
            Some("ease".to_string()),
        )
        .expect("add first step");
    repository
        .add_step(
            &sequence.id,
            "node",
            &second_node.id,
            "Support it with the report",
            serde_json::json!({ "x": 120.0, "y": 40.0, "zoom": 1.2 }),
            Some("spotlight".to_string()),
        )
        .expect("add second step");

    let sequences = repository
        .list_for_canvas(&canvas_id)
        .expect("list sequences");
    let steps = repository.list_steps(&sequence.id).expect("list steps");

    assert_eq!(sequences.len(), 1);
    assert_eq!(steps.len(), 2);
    assert_eq!(steps[0].position, 0);
    assert_eq!(steps[1].position, 1);
    assert_eq!(steps[1].transition_hint, "spotlight");
}

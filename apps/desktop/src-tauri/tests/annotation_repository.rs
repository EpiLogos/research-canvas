use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{AnnotationRepository, ConstellationRepository},
};
use tempfile::{tempdir, TempDir};

fn open_temp_database() -> (TempDir, Database) {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("research-canvas.sqlite");
    let database = Database::open(&path).expect("database open");
    (dir, database)
}

#[test]
fn persists_freehand_annotations_for_a_canvas() {
    let (_dir, database) = open_temp_database();
    let projects = ConstellationRepository::new(database.connection());
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

    let repository = AnnotationRepository::new(database.connection());
    repository
        .create_freehand_annotation(
            &canvas_id,
            "stroke",
            serde_json::json!([
                { "x": 120.0, "y": 160.0, "pressure": 0.4 },
                { "x": 180.0, "y": 200.0, "pressure": 0.6 },
                { "x": 240.0, "y": 220.0, "pressure": 0.5 }
            ]),
            "#f0b45a",
            4.0,
            0.9,
            None,
        )
        .expect("create annotation");

    let annotations = repository
        .list_for_canvas(&canvas_id)
        .expect("list annotations");

    assert_eq!(annotations.len(), 1);
    assert_eq!(annotations[0].annotation_type, "stroke");
    assert!(annotations[0].points_json.contains("\"pressure\":0.4"));
}

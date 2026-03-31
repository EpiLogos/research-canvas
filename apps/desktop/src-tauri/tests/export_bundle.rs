use std::{fs, path::PathBuf};

use research_canvas_desktop_lib::{
    db::{
        connection::Database,
        repositories::{CanvasGraphRepository, ProjectRepository},
    },
    export::export_project_bundle,
};
use tempfile::{tempdir, TempDir};

fn open_temp_database() -> (TempDir, Database) {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("research-canvas.sqlite");
    let database = Database::open(&path).expect("database open");
    (dir, database)
}

#[test]
fn exports_a_static_bundle_with_pages_assets_and_bundle_json() {
    let (_dir, database) = open_temp_database();
    let projects = ProjectRepository::new(database.connection());
    let project = projects
        .create(
            "Sample Project".to_string(),
            "sample-project".to_string(),
            None,
            PathBuf::from("tests/fixtures/sample-project")
                .display()
                .to_string(),
            Some("Seed workspace for export".to_string()),
            None,
            serde_json::json!({
                "includeResources": true,
                "mobileSequenceFirst": true,
                "theme": "paper"
            }),
        )
        .expect("create project");
    let graph = CanvasGraphRepository::new(database.connection());
    let canvas_id = project.primary_canvas_id.clone().expect("primary canvas");
    let note = graph
        .create_note_node(
            &canvas_id,
            "Opening note",
            "The thesis starts here.",
            80.0,
            80.0,
        )
        .expect("create note");
    let resource = graph
        .create_resource_node(
            &canvas_id,
            "Project README",
            "tests/fixtures/sample-project/README.md",
            "README.md",
            "markdown",
            "text/markdown",
            "fingerprint-readme",
            360.0,
            80.0,
        )
        .expect("create resource");
    graph
        .connect_nodes(&canvas_id, &note.id, &resource.id, "supports")
        .expect("connect nodes");

    let output = tempdir().expect("export temp dir");
    let result = export_project_bundle(database.connection(), &project.id, output.path())
        .expect("export bundle");

    assert!(output.path().join("index.html").exists());
    assert!(output.path().join("bundle.json").exists());
    assert!(output
        .path()
        .join("nodes")
        .join("opening-note.html")
        .exists());
    assert!(output.path().join("assets").join("README.md").exists());
    assert!(output.path().join("assets").join("example.png").exists());
    assert_eq!(result.project_id, project.id);

    let bundle_json = fs::read_to_string(output.path().join("bundle.json")).expect("read bundle");
    assert!(bundle_json.contains("Sample Project"));
    assert!(bundle_json.contains("Opening note"));
}

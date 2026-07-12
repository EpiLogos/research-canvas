use std::{fs, path::PathBuf};

use research_canvas_desktop_lib::{
    commands::search::{
        rebuild_project_search_index_command, search_project_command,
        RebuildProjectSearchIndexRequest, SearchProjectRequest,
    },
    db::{
        connection::Database,
        repositories::{CanvasGraphRepository, ProjectRepository},
    },
};
use tempfile::{tempdir, TempDir};

fn open_temp_database() -> (TempDir, String) {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("research-canvas.sqlite");
    let _database = Database::open(&path).expect("database open");
    (dir, path.to_string_lossy().to_string())
}

#[test]
fn rebuilds_and_queries_a_real_search_index_from_files_notes_sequences_and_nested_projects() {
    let (temp_dir, database_path) = open_temp_database();
    let child_fixture = temp_dir.path().join("nested-project");
    let workspace_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("workspace root")
        .to_path_buf();
    let root_fixture = workspace_root.join("tests/fixtures/sample-project");

    fs::create_dir_all(&child_fixture).expect("create child fixture");
    fs::write(
        child_fixture.join("chapter.md"),
        "# Child Chapter\n\nThis nested project branch adds a follow-up angle.",
    )
    .expect("write child chapter");

    let root_project_id = {
        let database = Database::open(temp_dir.path().join("research-canvas.sqlite"))
            .expect("re-open database");
        let projects = ProjectRepository::new(database.connection());

        let root_project = projects
            .create(
                "Research Root".to_string(),
                "research-root".to_string(),
                None,
                root_fixture.to_string_lossy().to_string(),
                Some("Main research surface".to_string()),
                None,
                serde_json::json!({}),
            )
            .expect("create root project");

        let root_canvas_id = root_project
            .primary_canvas_id
            .clone()
            .expect("primary canvas");
        let graph = CanvasGraphRepository::new(database.connection());
        let _note_node = graph
            .create_note_node(
                &root_canvas_id,
                "Opening note",
                "The thesis starts here and expands into evidence.",
                120.0,
                160.0,
            )
            .expect("create note node");
        let _report_node = graph
            .create_resource_node(
                &root_canvas_id,
                "Source report",
                &root_fixture.join("README.md").to_string_lossy(),
                "README.md",
                "markdown",
                "text/markdown",
                "fingerprint-root",
                360.0,
                180.0,
            )
            .expect("create resource node");

        let child_project = projects
            .create(
                "Nested Project".to_string(),
                "nested-project".to_string(),
                Some(root_project.id.clone()),
                child_fixture.to_string_lossy().to_string(),
                Some("Child research branch".to_string()),
                None,
                serde_json::json!({}),
            )
            .expect("create child project");

        assert_ne!(child_project.id, root_project.id);
        root_project.id
    };

    let summary = rebuild_project_search_index_command(RebuildProjectSearchIndexRequest {
        database_path: database_path.clone(),
        project_id: root_project_id.clone(),
    })
    .expect("rebuild search index");

    assert_eq!(summary.scope_project_id, root_project_id);
    assert_eq!(summary.projects_indexed, 2);
    assert!(summary.file_entries_indexed >= 6);
    assert!(summary.documents_indexed > 0);

    let file_hits = search_project_command(SearchProjectRequest {
        database_path: database_path.clone(),
        project_id: root_project_id.clone(),
        query: "nested notes".to_string(),
        limit: Some(10),
    })
    .expect("search files");
    assert!(file_hits.iter().any(|hit| {
        hit.entity_type == "file"
            && hit.title == "README.md"
            && hit.snippet.contains("nested")
            && hit.snippet.contains("notes")
    }));

    let node_hits = search_project_command(SearchProjectRequest {
        database_path: database_path.clone(),
        project_id: root_project_id.clone(),
        query: "thesis starts here".to_string(),
        limit: Some(10),
    })
    .expect("search node");
    assert!(node_hits
        .iter()
        .any(|hit| hit.entity_type == "node" && hit.title == "Opening note"));

    let child_hits = search_project_command(SearchProjectRequest {
        database_path: database_path.clone(),
        project_id: root_project_id,
        query: "follow-up angle".to_string(),
        limit: Some(10),
    })
    .expect("search child project");
    assert!(child_hits.iter().any(|hit| {
        hit.entity_type == "file"
            && hit.project_display_name == "Nested Project"
            && hit.relative_path.as_deref() == Some("chapter.md")
    }));
}

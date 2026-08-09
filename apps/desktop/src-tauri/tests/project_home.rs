//! Task 1 remaining-work integration tests: first-run home setup, project
//! scaffolding per rootType, and profile-scoped project switching.
//!
//! All tests run against real temp filesystems and real SQLite databases —
//! no mocks.

use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use research_canvas_desktop_lib::{
    commands::constellations::{
        create_project_at, resolve_or_create_home_at, set_active_project_at,
        CreateProjectRequest,
    },
    commands::scenes::{list_scenes_at, upsert_scene_at},
    db::repositories::{
        SceneAssembler, ScenePlaceFrame, SceneRecord, SceneTimeWindow,
    },
    ApiState, SharedApiState,
};
use tempfile::tempdir;

fn test_state() -> SharedApiState {
    Arc::new(Mutex::new(ApiState::default()))
}

fn scene(id: &str, profile: &str) -> SceneRecord {
    SceneRecord {
        id: id.into(),
        profile_scope: profile.into(),
        place_frame: ScenePlaceFrame {
            place_id: "pleiades:520998".into(),
            valid_at: serde_json::json!({ "instant": "2021-07-14" }),
        },
        time_window: SceneTimeWindow {
            start: "2021-07-01".into(),
            end: "2021-08-01".into(),
        },
        people: vec![],
        passages: vec![serde_json::json!({
            "artifactId": "recording-001",
            "unit": { "kind": "timestamp_range", "startMs": 12000, "endMs": 45000 },
        })],
        consents: vec![],
        redactions: vec![],
        language_variants: vec![],
        title: Some("Arrival".into()),
        narration: None,
        assembled_by: SceneAssembler::Agent,
        curation_events: vec![],
        nested_sequence_ids: vec![],
        created_at: String::new(),
        updated_at: String::new(),
    }
}

fn create_directory_project_request(
    database_path: &str,
    home: &Path,
    name: &str,
) -> CreateProjectRequest {
    CreateProjectRequest {
        database_path: database_path.to_string(),
        home_path: home.to_string_lossy().to_string(),
        name: name.to_string(),
        root_type: "directory".to_string(),
        source_path: None,
        summary: Some("test directory project".to_string()),
    }
}

#[test]
fn resolve_home_creates_the_home_directory_and_lists_no_projects_first_run() {
    let dir = tempdir().unwrap();
    let database_path = dir.path().join("workspace.sqlite");
    let home = dir.path().join("home");

    let resolved = resolve_or_create_home_at(&database_path, Some(home.to_str().unwrap()))
        .expect("resolve or create home");
    assert_eq!(PathBuf::from(&resolved.home_path), home);
    assert!(home.is_dir(), "home directory is created on first run");
    assert!(
        resolved.projects.is_empty(),
        "a fresh home has no projects yet"
    );
    assert!(
        database_path.exists(),
        "bootstrap seeds the workspace database at the resolved database path"
    );
}

#[test]
fn directory_project_scaffolds_a_known_skeleton_and_is_idempotent() {
    let dir = tempdir().unwrap();
    let database_path = dir.path().join("workspace.sqlite");
    let database_path = database_path.to_string_lossy().to_string();
    let home = dir.path().join("home");
    fs::create_dir_all(&home).unwrap();

    let first = create_project_at(create_directory_project_request(
        &database_path,
        &home,
        "Field Notes",
    ))
    .expect("create directory project");

    assert_eq!(first.root_type, "directory");
    assert_eq!(first.display_name, "Field Notes");
    assert_eq!(first.profile_scope, "project:field-notes");
    assert_eq!(first.slug, "field-notes");

    let project_dir = PathBuf::from(&first.root_path);
    assert!(project_dir.is_dir());
    assert!(project_dir.join("raw").is_dir(), "immutable raw corpus is scaffolded");
    assert!(project_dir.join("workspace").is_dir(), "derived workspace is scaffolded");
    assert!(
        project_dir.join(".research-canvas.json").is_file(),
        "project manifest marks the skeleton"
    );

    // Idempotent: re-creating the same project returns the same row.
    let second = create_project_at(create_directory_project_request(
        &database_path,
        &home,
        "Field Notes",
    ))
    .expect("re-create directory project");
    assert_eq!(second.id, first.id, "same slug resolves to the same project");

    // The second call must not have created a duplicate row.
    let resolved = resolve_or_create_home_at(&database_path, Some(home.to_str().unwrap()))
        .expect("resolve home after creation");
    assert_eq!(resolved.projects.len(), 1, "no duplicate project rows");
}

#[test]
fn file_project_uses_the_raw_file_as_root_and_never_writes_it() {
    let dir = tempdir().unwrap();
    let database_path = dir.path().join("workspace.sqlite");
    let database_path = database_path.to_string_lossy().to_string();
    let home = dir.path().join("home");
    fs::create_dir_all(&home).unwrap();

    let source = dir.path().join("manifesto.md");
    let original_bytes = b"# The Image of the Antichrist\n\nRaw corpus is canonical.";
    fs::write(&source, original_bytes).unwrap();
    let original_after_creation = fs::read(&source).unwrap();

    let project = create_project_at(CreateProjectRequest {
        database_path: database_path.clone(),
        home_path: home.to_string_lossy().to_string(),
        name: "Manifesto".to_string(),
        root_type: "file".to_string(),
        source_path: Some(source.to_string_lossy().to_string()),
        summary: None,
    })
    .expect("create file project");

    assert_eq!(project.root_type, "file");
    assert_eq!(PathBuf::from(&project.root_path), source);
    assert!(project.profile_scope.starts_with("project:file-manifesto-"));
    assert_eq!(project.display_name, "Manifesto");

    // The raw file is NEVER written by project creation or by the workspace.
    assert_eq!(
        fs::read(&source).unwrap(),
        original_after_creation,
        "raw file bytes are byte-identical after project creation"
    );
    assert_eq!(
        fs::read(&source).unwrap(),
        original_bytes,
        "raw file matches the original corpus byte-for-byte"
    );

    // A file project does not scaffold a directory skeleton.
    assert!(
        !home.join("manifesto").exists(),
        "file projects do not scaffold a sibling directory"
    );

    // Idempotent: re-creating the same source file returns the same project.
    let again = create_project_at(CreateProjectRequest {
        database_path,
        home_path: home.to_string_lossy().to_string(),
        name: "Manifesto".to_string(),
        root_type: "file".to_string(),
        source_path: Some(source.to_string_lossy().to_string()),
        summary: None,
    })
    .expect("re-create file project");
    assert_eq!(again.id, project.id, "same source path resolves to the same project");
    assert_eq!(
        fs::read(&source).unwrap(),
        original_bytes,
        "raw file still byte-identical after idempotent re-create"
    );
}

#[test]
fn project_creation_rejects_unknown_root_types_and_missing_sources() {
    let dir = tempdir().unwrap();
    let database_path = dir.path().join("workspace.sqlite");
    let database_path = database_path.to_string_lossy().to_string();
    let home = dir.path().join("home");
    fs::create_dir_all(&home).unwrap();

    let bad_root_type = create_project_at(CreateProjectRequest {
        database_path: database_path.clone(),
        home_path: home.to_string_lossy().to_string(),
        name: "Bad".to_string(),
        root_type: "snippet".to_string(),
        source_path: None,
        summary: None,
    });
    assert!(bad_root_type.is_err(), "unknown rootType is rejected");

    let missing_source = create_project_at(CreateProjectRequest {
        database_path,
        home_path: home.to_string_lossy().to_string(),
        name: "Missing".to_string(),
        root_type: "file".to_string(),
        source_path: None,
        summary: None,
    });
    assert!(missing_source.is_err(), "file projects require a sourcePath");
}

#[test]
fn switching_active_projects_switches_profile_scopes_without_stale_rows() {
    let dir = tempdir().unwrap();
    let database_path = dir.path().join("workspace.sqlite");
    let database_path = database_path.to_string_lossy().to_string();
    let home = dir.path().join("home");
    fs::create_dir_all(&home).unwrap();

    let state = test_state();

    let alpha = create_project_at(create_directory_project_request(
        &database_path,
        &home,
        "Alpha Field",
    ))
    .expect("create project A");
    let beta = create_project_at(create_directory_project_request(
        &database_path,
        &home,
        "Beta Field",
    ))
    .expect("create project B");

    assert_ne!(alpha.profile_scope, beta.profile_scope);

    // Select project A and write a scene into its scope.
    let selected_a = set_active_project_at(&database_path, &alpha.id, &state)
        .expect("select project A");
    assert_eq!(selected_a.profile_scope, alpha.profile_scope);
    let scope_a = selected_a.profile_scope.clone();
    upsert_scene_at(&database_path, scene("scene-a-1", &scope_a)).expect("write A scene");

    // A's reads see only A's scope.
    let rows_a = list_scenes_at(&database_path, &scope_a).expect("list A scenes");
    assert_eq!(rows_a.len(), 1);
    assert_eq!(rows_a[0].id, "scene-a-1");

    // Select project B. B's reads must NOT mix in A's rows.
    let selected_b = set_active_project_at(&database_path, &beta.id, &state)
        .expect("select project B");
    assert_eq!(selected_b.profile_scope, beta.profile_scope);
    let scope_b = selected_b.profile_scope.clone();
    let rows_b = list_scenes_at(&database_path, &scope_b).expect("list B scenes");
    assert!(
        rows_b.is_empty(),
        "switching projects surfaces no stale rows from the previous scope"
    );

    // A's rows are still reachable under A's own scope after switching away.
    let rows_a_again = list_scenes_at(&database_path, &scope_a).expect("list A scenes again");
    assert_eq!(rows_a_again.len(), 1);
    assert_eq!(rows_a_again[0].id, "scene-a-1");
}

use std::fs;
use std::path::PathBuf;

use research_canvas_desktop_lib::agent::project::{
    load_project_roots, search_project_files, AgentRootKind,
};
use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{ConstellationRepository, ResourceRootRepository},
};
use tempfile::{tempdir, TempDir};

#[cfg(unix)]
fn symlink_dir(original: &std::path::Path, link: &std::path::Path) {
    std::os::unix::fs::symlink(original, link).expect("create directory symlink");
}

fn open_temp_database() -> (TempDir, String) {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("research-canvas.sqlite");
    let _database = Database::open(&path).expect("database open");
    (dir, path.to_string_lossy().to_string())
}

fn create_project(database_path: &str, display_name: &str, root_path: impl Into<String>) -> String {
    let database = Database::open(database_path).expect("database");
    let project = ConstellationRepository::new(database.connection())
        .create(
            display_name.to_string(),
            display_name.to_lowercase().replace(' ', "-"),
            None,
            root_path.into(),
            Some("Searchable project summary".to_string()),
            None,
            serde_json::json!({}),
        )
        .expect("create project");
    project.id
}

fn attach_resource(database_path: &str, project_id: &str, root: &PathBuf, name: &str) {
    let database = Database::open(database_path).expect("database");
    ResourceRootRepository::new(database.connection())
        .attach(project_id, root, Some(name.to_string()))
        .expect("attach resource root");
}

#[test]
fn loads_project_root_and_attached_resource_roots_from_real_sqlite() {
    let (temp_dir, database_path) = open_temp_database();
    let working_root = temp_dir.path().join("working");
    let resource_root = temp_dir.path().join("archive");
    fs::create_dir_all(&working_root).expect("working root");
    fs::create_dir_all(&resource_root).expect("resource root");

    let project_id = create_project(
        &database_path,
        "Agent Project",
        working_root.to_string_lossy().to_string(),
    );
    attach_resource(&database_path, &project_id, &resource_root, "Archive Pool");

    let roots = load_project_roots(&database_path, &project_id).expect("load roots");

    assert_eq!(roots.project_id, project_id);
    let serialized = serde_json::to_value(&roots).expect("serialize constellation roots");
    assert_eq!(serialized["constellationId"], project_id);
    assert!(serialized.get("projectId").is_none());
    assert_eq!(roots.display_name, "Agent Project");
    assert!(roots.primary_canvas_id.is_some());
    assert!(roots.warnings.is_empty());
    assert_eq!(roots.roots.len(), 2);

    let project_root = roots
        .roots
        .iter()
        .find(|root| root.kind == AgentRootKind::Project)
        .expect("project root");
    assert_eq!(project_root.display_name, "Agent Project");
    assert_eq!(
        project_root.canonical_path,
        fs::canonicalize(&working_root)
            .expect("canonical working root")
            .to_string_lossy()
    );
    assert!(project_root.exists);

    let attached_root = roots
        .roots
        .iter()
        .find(|root| root.kind == AgentRootKind::Resource)
        .expect("attached root");
    assert_eq!(attached_root.display_name, "Archive Pool");
    assert_eq!(
        attached_root.canonical_path,
        fs::canonicalize(&resource_root)
            .expect("canonical resource root")
            .to_string_lossy()
    );
    assert!(attached_root.exists);
}

#[test]
fn dedupes_attached_root_that_points_at_project_root() {
    let (temp_dir, database_path) = open_temp_database();
    let working_root = temp_dir.path().join("working");
    fs::create_dir_all(&working_root).expect("working root");
    let project_id = create_project(
        &database_path,
        "Deduped Roots",
        working_root.to_string_lossy().to_string(),
    );
    attach_resource(
        &database_path,
        &project_id,
        &working_root,
        "Duplicate Alias",
    );

    let roots = load_project_roots(&database_path, &project_id).expect("load roots");

    assert_eq!(roots.roots.len(), 1);
    assert_eq!(roots.roots[0].kind, AgentRootKind::Project);
    assert_eq!(roots.roots[0].display_name, "Deduped Roots");
}

#[test]
fn missing_root_directory_returns_warning_instead_of_panicking() {
    let (temp_dir, database_path) = open_temp_database();
    let missing_root = temp_dir.path().join("missing-root");
    let project_id = create_project(
        &database_path,
        "Missing Root Project",
        missing_root.to_string_lossy().to_string(),
    );

    let roots = load_project_roots(&database_path, &project_id).expect("load roots");

    assert_eq!(roots.roots.len(), 1);
    assert!(!roots.roots[0].exists);
    assert_eq!(
        roots.roots[0].canonical_path,
        missing_root.to_string_lossy()
    );
    assert_eq!(roots.warnings.len(), 1);
    assert_eq!(roots.warnings[0].code, "missing_root");
    assert_eq!(
        roots.warnings[0].path.as_deref(),
        Some(missing_root.to_string_lossy().as_ref())
    );
}

#[test]
fn search_rebuilds_real_fts_and_attaches_root_metadata_to_file_hits() {
    let (temp_dir, database_path) = open_temp_database();
    let working_root = temp_dir.path().join("working");
    let resource_root = temp_dir.path().join("archive");
    fs::create_dir_all(working_root.join("notes")).expect("working root");
    fs::create_dir_all(&resource_root).expect("resource root");
    fs::write(
        working_root.join("notes").join("outline.md"),
        "Working draft mentions alpha azimuth.",
    )
    .expect("write working note");
    fs::write(
        resource_root.join("evidence.md"),
        "Archive evidence carries the beta chromium keyword.",
    )
    .expect("write resource note");

    let project_id = create_project(
        &database_path,
        "Search Roots",
        working_root.to_string_lossy().to_string(),
    );
    attach_resource(&database_path, &project_id, &resource_root, "Archive Pool");

    let results = search_project_files(&database_path, &project_id, "beta chromium", 10)
        .expect("search project files");

    assert_eq!(results.project_id, project_id);
    assert_eq!(results.index_summary.file_entries_indexed, 3);
    let evidence_hit = results
        .hits
        .iter()
        .find(|hit| hit.title == "evidence.md")
        .expect("resource file hit");
    assert_eq!(evidence_hit.entity_type, "file");
    assert_eq!(evidence_hit.relative_path.as_deref(), Some("evidence.md"));
    assert_eq!(
        evidence_hit.root_display_name.as_deref(),
        Some("Archive Pool")
    );
    assert_eq!(evidence_hit.root_kind, Some(AgentRootKind::Resource));
    assert_eq!(
        evidence_hit.root_path.as_deref(),
        Some(
            fs::canonicalize(&resource_root)
                .expect("canonical resource root")
                .to_string_lossy()
                .as_ref()
        )
    );
    assert!(evidence_hit.snippet.contains("chromium"));
}

#[cfg(unix)]
#[test]
fn search_hit_root_metadata_survives_symlinked_project_roots() {
    let (temp_dir, database_path) = open_temp_database();
    let real_root = temp_dir.path().join("real-working");
    let symlink_root = temp_dir.path().join("linked-working");
    fs::create_dir_all(&real_root).expect("real root");
    fs::write(
        real_root.join("symlink-note.md"),
        "Symlinked root contains a garnet astrolabe keyword.",
    )
    .expect("write note");
    symlink_dir(&real_root, &symlink_root);

    let project_id = create_project(
        &database_path,
        "Symlink Root",
        symlink_root.to_string_lossy().to_string(),
    );

    let results = search_project_files(&database_path, &project_id, "garnet astrolabe", 10)
        .expect("search project files");

    let hit = results
        .hits
        .iter()
        .find(|hit| hit.title == "symlink-note.md")
        .expect("symlinked file hit");
    assert_eq!(hit.entity_type, "file");
    assert_eq!(
        hit.source_path.as_deref(),
        Some(
            symlink_root
                .join("symlink-note.md")
                .to_string_lossy()
                .as_ref()
        )
    );
    assert_eq!(hit.root_display_name.as_deref(), Some("Symlink Root"));
    assert_eq!(hit.root_kind, Some(AgentRootKind::Project));
    assert_eq!(
        hit.root_path.as_deref(),
        Some(
            fs::canonicalize(&real_root)
                .expect("canonical real root")
                .to_string_lossy()
                .as_ref()
        )
    );
}

#[test]
fn nested_resource_root_hits_use_resource_relative_paths() {
    let (temp_dir, database_path) = open_temp_database();
    let working_root = temp_dir.path().join("working");
    let resource_root = working_root.join("archive");
    fs::create_dir_all(&resource_root).expect("nested resource root");
    fs::write(
        working_root.join("outline.md"),
        "Working root contains an ordinary index note.",
    )
    .expect("write working note");
    fs::write(
        resource_root.join("evidence.md"),
        "Nested archive contains the cinnabar lodestone keyword.",
    )
    .expect("write nested resource note");

    let project_id = create_project(
        &database_path,
        "Nested Resource",
        working_root.to_string_lossy().to_string(),
    );
    attach_resource(&database_path, &project_id, &resource_root, "Archive Pool");

    let results = search_project_files(&database_path, &project_id, "cinnabar lodestone", 10)
        .expect("search nested resource");

    assert_eq!(results.index_summary.file_entries_indexed, 3);
    let hit = results
        .hits
        .iter()
        .find(|hit| hit.title == "evidence.md")
        .expect("nested resource hit");
    assert_eq!(hit.root_kind, Some(AgentRootKind::Resource));
    assert_eq!(hit.root_display_name.as_deref(), Some("Archive Pool"));
    assert_eq!(hit.relative_path.as_deref(), Some("evidence.md"));
    assert_eq!(
        hit.root_path.as_deref(),
        Some(
            fs::canonicalize(&resource_root)
                .expect("canonical resource root")
                .to_string_lossy()
                .as_ref()
        )
    );
    assert_eq!(
        results
            .hits
            .iter()
            .filter(|hit| hit.title == "evidence.md")
            .count(),
        1
    );
}

#[test]
fn search_limit_zero_returns_no_hits_without_error() {
    let (temp_dir, database_path) = open_temp_database();
    let working_root = temp_dir.path().join("working");
    fs::create_dir_all(&working_root).expect("working root");
    fs::write(working_root.join("outline.md"), "limit zero keyword").expect("write note");

    let project_id = create_project(
        &database_path,
        "Zero Limit",
        working_root.to_string_lossy().to_string(),
    );

    let results = search_project_files(&database_path, &project_id, "keyword", 0)
        .expect("search project files");

    assert!(results.hits.is_empty());
    assert_eq!(results.index_summary.file_entries_indexed, 1);
}

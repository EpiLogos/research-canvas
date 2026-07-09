use std::{fs, path::PathBuf};

use research_canvas_desktop_lib::{
    commands::{
        projects::{
            attach_project_resource_root_at, detach_project_resource_root_at,
            list_project_resource_roots_at, load_project_document_at, ResourceRootLookupRequest,
            ResourceRootMutationRequest,
        },
        search::{
            rebuild_project_search_index_command, search_project_command,
            RebuildProjectSearchIndexRequest, SearchProjectRequest,
        },
    },
    db::{
        connection::Database,
        repositories::{ProjectRepository, ResourceRootRepository},
    },
};
use tempfile::{tempdir, TempDir};

fn open_temp_database() -> (TempDir, String) {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("research-canvas.sqlite");
    let _database = Database::open(&path).expect("database open");
    (dir, path.to_string_lossy().to_string())
}

fn create_project_with_roots(
    database_path: &str,
    project_name: &str,
    working_root: &PathBuf,
    resource_root: &PathBuf,
) -> String {
    let database = Database::open(database_path).expect("re-open database");
    let projects = ProjectRepository::new(database.connection());
    let project = projects
        .create(
            project_name.to_string(),
            project_name.to_lowercase().replace(' ', "-"),
            None,
            working_root.to_string_lossy().to_string(),
            Some("Authoring root".to_string()),
            None,
            serde_json::json!({}),
        )
        .expect("create project");

    let attached = ResourceRootRepository::new(database.connection())
        .attach(&project.id, resource_root, None)
        .expect("attach resource root");
    assert_eq!(attached.project_id, project.id);

    project.id
}

#[test]
fn resource_root_repository_attaches_lists_and_detaches_real_folders() {
    let (temp_dir, database_path) = open_temp_database();
    let working_root = temp_dir.path().join("working-root");
    let resource_root = temp_dir.path().join("resource-pool");
    fs::create_dir_all(&working_root).expect("create working root");
    fs::create_dir_all(&resource_root).expect("create resource root");

    let database = Database::open(&database_path).expect("re-open database");
    let projects = ProjectRepository::new(database.connection());
    let project = projects
        .create(
            "Research Root".to_string(),
            "research-root".to_string(),
            None,
            working_root.to_string_lossy().to_string(),
            Some("Working root".to_string()),
            None,
            serde_json::json!({}),
        )
        .expect("create project");

    let attached = attach_project_resource_root_at(ResourceRootMutationRequest {
        database_path: database_path.clone(),
        project_id: project.id.clone(),
        root_path: resource_root.to_string_lossy().to_string(),
        display_name: None,
    })
    .expect("attach resource root");
    assert_eq!(attached.display_name, "resource-pool");
    assert_eq!(
        attached.root_path,
        fs::canonicalize(&resource_root)
            .expect("canonicalize resource root")
            .to_string_lossy()
    );

    let updated = attach_project_resource_root_at(ResourceRootMutationRequest {
        database_path: database_path.clone(),
        project_id: project.id.clone(),
        root_path: resource_root.to_string_lossy().to_string(),
        display_name: Some("Alias Pool".to_string()),
    })
    .expect("reattach resource root");
    assert_eq!(updated.display_name, "Alias Pool");

    let roots = list_project_resource_roots_at(ResourceRootLookupRequest {
        database_path: database_path.clone(),
        project_id: project.id.clone(),
    })
    .expect("list resource roots");
    assert_eq!(roots.len(), 1);
    assert_eq!(roots[0].display_name, "Alias Pool");

    let database_path_for_assert = database_path.clone();
    detach_project_resource_root_at(ResourceRootMutationRequest {
        database_path,
        project_id: project.id,
        root_path: resource_root.to_string_lossy().to_string(),
        display_name: None,
    })
    .expect("detach resource root");
    assert!(list_project_resource_roots_at(ResourceRootLookupRequest {
        database_path: database_path_for_assert,
        project_id: attached.project_id.clone(),
    })
    .expect("list after detach")
    .is_empty());
}

#[test]
fn project_document_reports_working_root_and_attached_resource_roots() {
    let (temp_dir, database_path) = open_temp_database();
    let working_root = temp_dir.path().join("working-root");
    let resource_root = temp_dir.path().join("resource-pool");
    fs::create_dir_all(working_root.join("notes")).expect("create working tree");
    fs::create_dir_all(&resource_root).expect("create resource root");
    fs::write(
        working_root.join("notes").join("outline.md"),
        "Working root outline",
    )
    .expect("write working note");
    fs::write(resource_root.join("pool.md"), "Attached pool evidence").expect("write pool file");

    let project_id = create_project_with_roots(
        &database_path,
        "Resource Pool Project",
        &working_root,
        &resource_root,
    );

    let roots = list_project_resource_roots_at(ResourceRootLookupRequest {
        database_path: database_path.clone(),
        project_id: project_id.clone(),
    })
    .expect("list attached roots");
    assert_eq!(roots.len(), 1);
    assert_eq!(roots[0].display_name, "resource-pool");

    let document =
        load_project_document_at(&database_path, &project_id).expect("load project document");
    assert_eq!(document.working_root, working_root.to_string_lossy());
    assert_eq!(document.project.root_path, working_root.to_string_lossy());
    assert_eq!(document.resource_roots.len(), 1);
    assert_eq!(document.resource_roots[0].display_name, "resource-pool");
    assert!(document
        .entries
        .iter()
        .any(|entry| entry.relative_path == "notes/outline.md"));
    let pool_entry = document
        .entries
        .iter()
        .find(|entry| entry.relative_path == "resource-pool/pool.md")
        .expect("attached resource-root file is included in project entries");
    assert!(pool_entry.absolute_path.ends_with("pool.md"));
    assert_eq!(pool_entry.kind, "markdown");
}

#[test]
fn search_index_includes_attached_resource_roots() {
    let (temp_dir, database_path) = open_temp_database();
    let working_root = temp_dir.path().join("working-root");
    let resource_root = temp_dir.path().join("resource-pool");
    fs::create_dir_all(&working_root).expect("create working root");
    fs::create_dir_all(&resource_root).expect("create resource root");
    fs::write(
        working_root.join("outline.md"),
        "Working root contains the opening thesis.",
    )
    .expect("write working root file");
    fs::write(
        resource_root.join("evidence.md"),
        "This attached pool contains a unique chromium keyword.",
    )
    .expect("write resource pool file");

    let project_id = create_project_with_roots(
        &database_path,
        "Search Pool Project",
        &working_root,
        &resource_root,
    );

    let summary = rebuild_project_search_index_command(RebuildProjectSearchIndexRequest {
        database_path: database_path.clone(),
        project_id: project_id.clone(),
    })
    .expect("rebuild search index");

    assert!(summary.file_entries_indexed >= 2);
    assert!(summary.documents_indexed > 0);

    let hits = search_project_command(SearchProjectRequest {
        database_path,
        project_id,
        query: "chromium keyword".to_string(),
        limit: Some(10),
    })
    .expect("search resource pool");

    assert!(hits.iter().any(|hit| {
        hit.entity_type == "file"
            && hit.title == "evidence.md"
            && hit.relative_path.as_deref() == Some("evidence.md")
            && hit.snippet.contains("chromium")
    }));
}

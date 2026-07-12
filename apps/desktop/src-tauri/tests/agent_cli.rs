use std::{fs, process::Command};

use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{ProjectRepository, ResourceRootRepository},
};
use serde_json::Value;
use tempfile::{tempdir, TempDir};

fn open_temp_database() -> (TempDir, String) {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("research-canvas.sqlite");
    let _database = Database::open(&path).expect("database open");
    (dir, path.to_string_lossy().to_string())
}

fn create_project(database_path: &str, root_path: &std::path::Path) -> String {
    let database = Database::open(database_path).expect("database");
    ProjectRepository::new(database.connection())
        .create(
            "CLI Study".to_string(),
            "cli-study".to_string(),
            None,
            root_path.to_string_lossy().to_string(),
            Some("CLI project summary".to_string()),
            None,
            serde_json::json!({}),
        )
        .expect("create project")
        .id
}

fn run_agent(args: &[&str]) -> std::process::Output {
    Command::new(agent_binary_path())
        .args(args)
        .output()
        .expect("run agent_research")
}

fn agent_binary_path() -> std::path::PathBuf {
    if let Ok(path) = std::env::var("CARGO_BIN_EXE_agent_research") {
        return path.into();
    }
    let mut path = std::env::current_exe().expect("current test exe");
    path.pop();
    if path.ends_with("deps") {
        path.pop();
    }
    path.push(format!("agent_research{}", std::env::consts::EXE_SUFFIX));
    path
}

fn stdout_json(output: &std::process::Output) -> Value {
    serde_json::from_slice(&output.stdout).expect("stdout json")
}

struct EnvGuard {
    neo4j_uri: Option<String>,
    neo4j_password: Option<String>,
}

impl EnvGuard {
    fn without_neo4j() -> Self {
        let guard = Self {
            neo4j_uri: std::env::var("NEO4J_URI").ok(),
            neo4j_password: std::env::var("NEO4J_PASSWORD").ok(),
        };
        std::env::remove_var("NEO4J_URI");
        std::env::remove_var("NEO4J_PASSWORD");
        guard
    }
}

impl Drop for EnvGuard {
    fn drop(&mut self) {
        if let Some(value) = &self.neo4j_uri {
            std::env::set_var("NEO4J_URI", value);
        } else {
            std::env::remove_var("NEO4J_URI");
        }
        if let Some(value) = &self.neo4j_password {
            std::env::set_var("NEO4J_PASSWORD", value);
        } else {
            std::env::remove_var("NEO4J_PASSWORD");
        }
    }
}

#[test]
fn search_context_and_note_skeleton_work_against_real_sqlite_project() {
    let (temp_dir, database_path) = open_temp_database();
    let root = temp_dir.path().join("vault");
    fs::create_dir_all(&root).expect("create vault");
    fs::write(
        root.join("mithras.md"),
        "---\ntags: [ritual]\n---\n# Mithras\nThe mithraic bull sacrifice keyword appears here.",
    )
    .expect("write note");
    let project_id = create_project(&database_path, &root);

    let search = run_agent(&[
        "search",
        "--database",
        &database_path,
        "--project",
        &project_id,
        "--query",
        "bull sacrifice",
        "--limit",
        "5",
        "--json",
    ]);
    assert!(
        search.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&search.stderr)
    );
    let search_json = stdout_json(&search);
    assert_eq!(search_json["ok"], true);
    assert_eq!(search_json["command"], "search");
    assert_eq!(search_json["data"]["hits"][0]["title"], "mithras.md");

    let context = run_agent(&[
        "context",
        "--database",
        &database_path,
        "--project",
        &project_id,
        "--query",
        "bull sacrifice",
        "--limit",
        "5",
        "--json",
    ]);
    assert!(
        context.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&context.stderr)
    );
    let context_json = stdout_json(&context);
    assert_eq!(context_json["ok"], true);
    assert_eq!(context_json["data"]["project"]["id"], project_id);
    assert_eq!(context_json["data"]["files"][0]["title"], "Mithras");

    let skeleton = run_agent(&[
        "note-skeleton",
        "--database",
        &database_path,
        "--project",
        &project_id,
        "--query",
        "bull sacrifice",
        "--limit",
        "5",
        "--json",
    ]);
    assert!(
        skeleton.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&skeleton.stderr)
    );
    let skeleton_json = stdout_json(&skeleton);
    assert_eq!(skeleton_json["ok"], true);
    assert!(skeleton_json["data"]["markdown"]
        .as_str()
        .expect("markdown")
        .contains("# Research Note: bull sacrifice"));
}

#[test]
fn search_without_json_prints_human_readable_output() {
    let (temp_dir, database_path) = open_temp_database();
    let root = temp_dir.path().join("vault");
    fs::create_dir_all(&root).expect("create vault");
    fs::write(
        root.join("mithras.md"),
        "# Mithras\nThe mithraic bull sacrifice keyword appears here.",
    )
    .expect("write note");
    let project_id = create_project(&database_path, &root);

    let output = run_agent(&[
        "search",
        "--database",
        &database_path,
        "--project",
        &project_id,
        "--query",
        "bull sacrifice",
        "--limit",
        "5",
    ]);

    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8(output.stdout).expect("utf8 stdout");
    assert!(stdout.contains("# Search Results"));
    assert!(stdout.contains("mithras.md"));
    assert!(
        !stdout.trim_start().starts_with('{'),
        "human output must not be raw JSON"
    );
}

#[test]
fn wikilinks_backlinks_and_tag_file_use_real_markdown_files() {
    let dir = tempdir().expect("temp dir");
    let root = dir.path();
    let source = root.join("source.md");
    let target = root.join("target.md");
    fs::write(&source, "A note links to [[target|Target Note]].\n").expect("write source");
    fs::write(&target, "Target body.\n").expect("write target");

    let wikilinks = run_agent(&[
        "wikilinks",
        "--root",
        root.to_str().expect("root str"),
        "--file",
        source.to_str().expect("source str"),
        "--json",
    ]);
    assert!(wikilinks.status.success());
    let wikilinks_json = stdout_json(&wikilinks);
    assert_eq!(wikilinks_json["data"][0]["target"], "target");
    assert_eq!(wikilinks_json["data"][0]["label"], "Target Note");

    let backlinks = run_agent(&[
        "backlinks",
        "--root",
        root.to_str().expect("root str"),
        "--target",
        "target",
        "--json",
    ]);
    assert!(backlinks.status.success());
    let backlinks_json = stdout_json(&backlinks);
    assert_eq!(backlinks_json["data"][0]["sourceRelativePath"], "source.md");

    let tag = run_agent(&[
        "tag-file",
        "--file",
        target.to_str().expect("target str"),
        "--tag",
        "reviewed",
        "--json",
    ]);
    assert!(tag.status.success());
    let tag_json = stdout_json(&tag);
    assert_eq!(tag_json["data"]["changed"], true);
    assert!(fs::read_to_string(&target)
        .expect("read tagged")
        .starts_with("---\ntags: [reviewed]\n---\n"));
}

#[test]
fn graph_mutation_commands_fail_clearly_without_neo4j_config() {
    let _env = EnvGuard::without_neo4j();

    let tag_node = run_agent(&[
        "tag-node",
        "--graph-node",
        "missing-node",
        "--tag",
        "contested",
        "--json",
    ]);

    assert!(!tag_node.status.success());
    let json = stdout_json(&tag_node);
    assert_eq!(json["ok"], false);
    assert_eq!(json["command"], "tag-node");
    assert!(json["error"]
        .as_str()
        .expect("error")
        .contains("NEO4J_PASSWORD"));

    let dir = tempdir().expect("temp dir");
    let source_path = dir.path().join("source.md");
    fs::write(&source_path, "source evidence").expect("write source");
    let attach = run_agent(&[
        "attach-evidence",
        "--database",
        dir.path().join("research.sqlite").to_str().expect("db str"),
        "--graph-node",
        "missing-node",
        "--source-path",
        source_path.to_str().expect("source str"),
        "--quote",
        "source evidence",
        "--json",
    ]);

    assert!(!attach.status.success());
    let json = stdout_json(&attach);
    assert_eq!(json["ok"], false);
    assert_eq!(json["command"], "attach-evidence");
    assert!(json["error"]
        .as_str()
        .expect("error")
        .contains("NEO4J_PASSWORD"));
}

#[test]
fn node_context_is_graph_backed_and_fails_clearly_without_neo4j_config() {
    let _env = EnvGuard::without_neo4j();
    let (temp_dir, database_path) = open_temp_database();
    let root = temp_dir.path().join("vault");
    fs::create_dir_all(&root).expect("create vault");
    let project_id = create_project(&database_path, &root);
    let database = Database::open(&database_path).expect("database");
    let canvas_id = ProjectRepository::new(database.connection())
        .get_by_id(&project_id)
        .expect("project lookup")
        .expect("project exists")
        .primary_canvas_id
        .expect("canvas id");

    let output = run_agent(&[
        "node-context",
        "--database",
        &database_path,
        "--canvas",
        &canvas_id,
        "--node",
        "missing-node",
        "--json",
    ]);

    assert!(!output.status.success());
    let json = stdout_json(&output);
    assert_eq!(json["ok"], false);
    assert_eq!(json["command"], "node-context");
    let error = json["error"].as_str().expect("error");
    assert!(error.contains("NEO4J_PASSWORD"));
    assert!(!error.contains("not implemented"));
}

#[test]
fn missing_option_value_does_not_consume_the_next_flag() {
    let (temp_dir, database_path) = open_temp_database();
    let root = temp_dir.path().join("vault");
    fs::create_dir_all(&root).expect("create vault");
    let project_id = create_project(&database_path, &root);

    let output = run_agent(&[
        "search",
        "--database",
        &database_path,
        "--project",
        &project_id,
        "--query",
        "--json",
    ]);

    assert!(!output.status.success());
    let json = stdout_json(&output);
    assert_eq!(json["ok"], false);
    assert_eq!(json["command"], "search");
    assert!(json["error"]
        .as_str()
        .expect("error")
        .contains("missing value for --query"));
}

#[test]
fn context_json_envelope_promotes_context_warnings_to_top_level() {
    let _env = EnvGuard::without_neo4j();
    let (temp_dir, database_path) = open_temp_database();
    let root = temp_dir.path().join("vault");
    fs::create_dir_all(&root).expect("create vault");
    fs::write(root.join("mithras.md"), "# Mithras\nbull sacrifice\n").expect("write note");
    let project_id = create_project(&database_path, &root);
    let missing_root = temp_dir.path().join("missing-resources");
    fs::create_dir_all(&missing_root).expect("create temporary resource root");
    let database = Database::open(&database_path).expect("database");
    ResourceRootRepository::new(database.connection())
        .attach(
            &project_id,
            &missing_root,
            Some("missing resources".to_string()),
        )
        .expect("attach resource root");
    fs::remove_dir_all(&missing_root).expect("remove resource root after attach");

    let output = run_agent(&[
        "context",
        "--database",
        &database_path,
        "--project",
        &project_id,
        "--query",
        "bull",
        "--json",
    ]);

    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let json = stdout_json(&output);
    assert_eq!(json["ok"], true);
    assert_eq!(json["warnings"][0]["code"], "missing_root");
    assert_eq!(json["data"]["warnings"][0]["code"], "missing_root");
}

use std::fs;
use std::path::Path;
use std::process::Command;

use rusqlite::Connection;
use serde_json::Value;
use tempfile::TempDir;

fn binary() -> Command {
    Command::new(env!("CARGO_BIN_EXE_workspace_sqlite"))
}

fn seed_database(path: &Path, project_name: &str) {
    let connection = Connection::open(path).expect("open database");
    connection
        .execute_batch(
            "CREATE TABLE projects (
                 id TEXT PRIMARY KEY,
                 display_name TEXT NOT NULL,
                 root_path TEXT NOT NULL
             );
             CREATE TABLE canvases (
                 id TEXT PRIMARY KEY,
                 project_id TEXT NOT NULL
             );
             CREATE TABLE node_document (
                 graph_node_id TEXT PRIMARY KEY,
                 body TEXT NOT NULL
             );
             CREATE TABLE node_layout (
                 canvas_id TEXT NOT NULL,
                 graph_node_id TEXT NOT NULL
             );
             CREATE TABLE timeline_layout (
                 canvas_id TEXT NOT NULL,
                 graph_node_id TEXT NOT NULL
             );",
        )
        .expect("create application tables");
    connection
        .execute(
            "INSERT INTO projects (id, display_name, root_path)
             VALUES ('project-1', ?1, '/author/repository/antichrist-vault')",
            [project_name],
        )
        .expect("insert project");
    connection
        .execute(
            "INSERT INTO canvases (id, project_id) VALUES ('canvas-1', 'project-1')",
            [],
        )
        .expect("insert canvas");
    connection
        .execute(
            "INSERT INTO node_document (graph_node_id, body)
             VALUES ('node-1', 'Real document body')",
            [],
        )
        .expect("insert document");
    connection
        .execute(
            "INSERT INTO node_layout (canvas_id, graph_node_id)
             VALUES ('canvas-1', 'node-1')",
            [],
        )
        .expect("insert canvas layout");
    connection
        .execute(
            "INSERT INTO timeline_layout (canvas_id, graph_node_id)
             VALUES ('canvas-1', 'node-1')",
            [],
        )
        .expect("insert timeline layout");
}

#[test]
fn path_command_honours_explicit_database_override() {
    let directory = TempDir::new().expect("temp directory");
    let expected = directory.path().join("partner.sqlite");

    let output = binary()
        .arg("path")
        .env("RESEARCH_CANVAS_DATABASE_PATH", &expected)
        .output()
        .expect("run path command");

    assert!(output.status.success());
    assert_eq!(
        String::from_utf8(output.stdout)
            .expect("utf8 stdout")
            .trim(),
        expected.to_string_lossy()
    );
}

#[test]
fn initialize_command_creates_the_current_application_schema() {
    let directory = TempDir::new().expect("temp directory");
    let database = directory.path().join("initialized.sqlite");

    let output = binary()
        .args(["initialize", database.to_str().unwrap()])
        .output()
        .expect("run initialize");

    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let connection = Connection::open(database).expect("open initialized database");
    for table in [
        "projects",
        "canvases",
        "graph_node_metadata",
        "graph_relationship",
        "node_layout",
        "timeline_layout",
        "node_document",
    ] {
        let present: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [table],
                |row| row.get(0),
            )
            .expect("inspect initialized schema");
        assert_eq!(present, 1, "missing table {table}");
    }
}

#[test]
fn backup_and_counts_commands_copy_real_sqlite_records() {
    let directory = TempDir::new().expect("temp directory");
    let source = directory.path().join("source.sqlite");
    let destination = directory.path().join("snapshot.sqlite");
    seed_database(&source, "Author starter");

    let backup = binary()
        .args([
            "backup",
            source.to_str().unwrap(),
            destination.to_str().unwrap(),
        ])
        .output()
        .expect("run backup");
    assert!(
        backup.status.success(),
        "{}",
        String::from_utf8_lossy(&backup.stderr)
    );

    let counts = binary()
        .args(["counts", destination.to_str().unwrap()])
        .output()
        .expect("run counts");
    assert!(counts.status.success());
    let payload: Value = serde_json::from_slice(&counts.stdout).expect("counts JSON");
    assert_eq!(payload["integrity"], "ok");
    assert_eq!(payload["counts"]["projects"], 1);
    assert_eq!(payload["counts"]["canvases"], 1);
    assert_eq!(payload["counts"]["node_document"], 1);
    assert_eq!(payload["counts"]["node_layout"], 1);
    assert_eq!(payload["counts"]["timeline_layout"], 1);

    let restored = Connection::open(destination).expect("open snapshot");
    let body: String = restored
        .query_row(
            "SELECT body FROM node_document WHERE graph_node_id = 'node-1'",
            [],
            |row| row.get(0),
        )
        .expect("read backed-up record");
    assert_eq!(body, "Real document body");
}

#[test]
fn roots_command_reports_real_vault_roots_for_snapshot_validation() {
    let directory = TempDir::new().expect("temp directory");
    let source = directory.path().join("source.sqlite");
    seed_database(&source, "Author starter");

    let output = binary()
        .args(["roots", source.to_str().unwrap()])
        .output()
        .expect("run roots");

    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let roots: Value = serde_json::from_slice(&output.stdout).expect("roots JSON");
    assert_eq!(
        roots,
        serde_json::json!(["/author/repository/antichrist-vault"])
    );
}

#[test]
fn backup_refuses_existing_destination_without_replacement() {
    let directory = TempDir::new().expect("temp directory");
    let source = directory.path().join("source.sqlite");
    let destination = directory.path().join("snapshot.sqlite");
    seed_database(&source, "Author starter");
    fs::write(&destination, b"existing workspace").expect("write sentinel");

    let output = binary()
        .args([
            "backup",
            source.to_str().unwrap(),
            destination.to_str().unwrap(),
        ])
        .output()
        .expect("run backup");

    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("already exists"));
    assert_eq!(
        fs::read(destination).expect("read sentinel"),
        b"existing workspace"
    );
}

#[test]
fn restore_requires_explicit_replace_and_rebases_repository_paths() {
    let directory = TempDir::new().expect("temp directory");
    let snapshot = directory.path().join("snapshot.sqlite");
    let destination = directory.path().join("workspace.sqlite");
    seed_database(&snapshot, "Starter workspace");
    seed_database(&destination, "Existing workspace");

    let refused = binary()
        .args([
            "restore",
            snapshot.to_str().unwrap(),
            destination.to_str().unwrap(),
        ])
        .output()
        .expect("run refused restore");
    assert!(!refused.status.success());
    assert!(String::from_utf8_lossy(&refused.stderr).contains("--replace"));

    let replaced = binary()
        .args([
            "restore",
            snapshot.to_str().unwrap(),
            destination.to_str().unwrap(),
            "--replace",
            "--old-repository-root",
            "/author/repository",
            "--new-repository-root",
            "/partner/repository",
        ])
        .output()
        .expect("run replacement restore");
    assert!(
        replaced.status.success(),
        "{}",
        String::from_utf8_lossy(&replaced.stderr)
    );

    let connection = Connection::open(destination).expect("open restored database");
    let (name, root_path): (String, String) = connection
        .query_row(
            "SELECT display_name, root_path FROM projects WHERE id = 'project-1'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("read restored project");
    assert_eq!(name, "Starter workspace");
    assert_eq!(root_path, "/partner/repository/antichrist-vault");
}

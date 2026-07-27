use std::fs;
use std::path::{Path, PathBuf};

use research_canvas_desktop_lib::workspace::{
    ensure_database_parent, migrate_legacy_database, resolve_database_path, MigrationOutcome,
    AUTHORING_DATABASE_FILENAME,
};
use rusqlite::Connection;
use tempfile::TempDir;

fn create_source_database(path: &Path) {
    let connection = Connection::open(path).expect("open source database");
    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE documents (id TEXT PRIMARY KEY, title TEXT NOT NULL);
             INSERT INTO documents (id, title) VALUES ('doc-1', 'Author reference');",
        )
        .expect("seed source database");
}

#[test]
fn resolves_normal_workspace_into_persistent_data_directory() {
    let root = PathBuf::from("/example/local-data/research-canvas/workspace");
    let temp = PathBuf::from("/example/temp");

    let path =
        resolve_database_path(None, Some(&root), &temp, None).expect("resolve persistent path");

    assert_eq!(path, root.join(AUTHORING_DATABASE_FILENAME));
    assert!(!path.starts_with(temp));
}

#[test]
fn explicit_database_override_wins_over_persistent_and_test_paths() {
    let override_path = PathBuf::from("/explicit/partner.sqlite");

    let path = resolve_database_path(
        Some(&override_path),
        Some(Path::new("/unused/data")),
        Path::new("/unused/temp"),
        Some("test-session"),
    )
    .expect("resolve explicit path");

    assert_eq!(path, override_path);
}

#[test]
fn named_test_session_is_isolated_under_the_supplied_temporary_directory() {
    let temp = PathBuf::from("/isolated/temp");

    let first = resolve_database_path(
        None,
        Some(Path::new("/unused/data")),
        &temp,
        Some("workspace test / one"),
    )
    .expect("resolve test path");
    let second = resolve_database_path(
        None,
        Some(Path::new("/unused/data")),
        &temp,
        Some("workspace test two"),
    )
    .expect("resolve second test path");

    assert!(first.starts_with(temp.join("research-canvas-tests")));
    assert!(second.starts_with(temp.join("research-canvas-tests")));
    assert_ne!(first, second);
    assert_eq!(
        first.file_name().and_then(|name| name.to_str()),
        Some("workspace-test-one.sqlite")
    );
}

#[test]
fn prepares_the_parent_directory_for_a_new_isolated_database() {
    let directory = TempDir::new().expect("temp directory");
    let database = directory
        .path()
        .join("research-canvas-tests")
        .join("browser-session.sqlite");

    ensure_database_parent(&database).expect("create database parent");

    assert!(database.parent().expect("database parent").is_dir());
    assert!(
        !database.exists(),
        "preparation must not create or replace the database"
    );
}

#[test]
fn migrates_legacy_sqlite_once_with_real_records_and_preserves_source() {
    let directory = TempDir::new().expect("temp directory");
    let legacy = directory.path().join("legacy.sqlite");
    let destination = directory.path().join("persistent").join("authoring.sqlite");
    create_source_database(&legacy);

    let outcome = migrate_legacy_database(&legacy, &destination).expect("migrate legacy database");

    assert_eq!(outcome, MigrationOutcome::Migrated);
    assert!(
        legacy.is_file(),
        "migration must preserve the legacy source"
    );
    let restored = Connection::open(&destination).expect("open migrated destination");
    let title: String = restored
        .query_row(
            "SELECT title FROM documents WHERE id = 'doc-1'",
            [],
            |row| row.get(0),
        )
        .expect("read migrated record");
    assert_eq!(title, "Author reference");
    let integrity: String = restored
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .expect("integrity check");
    assert_eq!(integrity, "ok");
}

#[test]
fn missing_legacy_database_is_a_noop() {
    let directory = TempDir::new().expect("temp directory");
    let legacy = directory.path().join("missing.sqlite");
    let destination = directory.path().join("persistent.sqlite");

    let outcome = migrate_legacy_database(&legacy, &destination).expect("no-op migration");

    assert_eq!(outcome, MigrationOutcome::LegacyMissing);
    assert!(!destination.exists());
}

#[test]
fn migration_refuses_to_overwrite_an_existing_destination() {
    let directory = TempDir::new().expect("temp directory");
    let legacy = directory.path().join("legacy.sqlite");
    let destination = directory.path().join("persistent.sqlite");
    create_source_database(&legacy);
    fs::write(&destination, b"do not overwrite").expect("write destination sentinel");

    let error = migrate_legacy_database(&legacy, &destination)
        .expect_err("existing destination must be rejected");

    assert!(
        error.to_string().contains("already exists"),
        "unexpected error: {error}"
    );
    assert_eq!(
        fs::read(&destination).expect("read destination sentinel"),
        b"do not overwrite"
    );
}

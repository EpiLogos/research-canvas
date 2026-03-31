use research_canvas_desktop_lib::db::{connection::Database, migrations::MigrationRunner};
use rusqlite::Connection;
use tempfile::{tempdir, TempDir};

fn open_temp_database() -> (TempDir, Database) {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("research-canvas.sqlite");
    let database = Database::open(&path).expect("database open");
    (dir, database)
}

fn table_exists(connection: &Connection, table_name: &str) -> bool {
    connection
        .query_row(
            "SELECT EXISTS(
                SELECT 1
                FROM sqlite_master
                WHERE type = 'table' AND name = ?1
            )",
            [table_name],
            |row| row.get::<_, i64>(0),
        )
        .expect("sqlite_master query")
        == 1
}

#[test]
fn db_migrations_applies_initial_migration_to_a_real_temp_database() {
    let (_dir, database) = open_temp_database();
    let connection = database.connection();

    assert!(table_exists(connection, "schema_migrations"));
    assert!(table_exists(connection, "projects"));
    assert!(table_exists(connection, "canvases"));
    assert!(table_exists(connection, "canvas_nodes"));
    assert!(table_exists(connection, "canvas_edges"));
    assert!(table_exists(connection, "canvas_annotations"));
    assert!(table_exists(connection, "sequences"));
    assert!(table_exists(connection, "sequence_steps"));
    assert!(table_exists(connection, "search_documents"));
    assert!(table_exists(connection, "project_resource_roots"));

    let applied_migrations: i64 = connection
        .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .expect("migration count");
    assert_eq!(applied_migrations, 3);
}

#[test]
fn db_migrations_migration_runner_is_idempotent_and_deterministic() {
    let (_dir, database) = open_temp_database();
    let connection = database.connection();

    MigrationRunner::migrate(connection).expect("second migration pass");

    let applied_migrations: i64 = connection
        .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .expect("migration count");
    assert_eq!(applied_migrations, 3);
}

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
    assert!(!table_exists(connection, "sequences"));
    assert!(!table_exists(connection, "sequence_steps"));
    assert!(table_exists(connection, "search_documents"));
    assert!(table_exists(connection, "project_resource_roots"));
    assert!(table_exists(connection, "saved_sequences"));
    assert!(table_exists(connection, "node_layout"));
    assert!(table_exists(connection, "edge_layout"));
    assert!(table_exists(connection, "canvas_app_state"));
    assert!(table_exists(connection, "agent_activity"));
    assert!(table_exists(connection, "node_document"));
    assert!(table_exists(connection, "graph_node_metadata"));
    assert!(table_exists(connection, "timeline_layout"));

    let applied_migrations: i64 = connection
        .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .expect("migration count");
    assert_eq!(applied_migrations, 12);
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
    assert_eq!(applied_migrations, 12);
}

#[test]
fn db_migrations_upgrade_0010_without_touching_documents_or_canvas_layouts() {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("upgrade.sqlite");
    let connection = Connection::open(&path).expect("fixture database");
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
         CREATE TABLE schema_migrations (version TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
         CREATE TABLE canvases (id TEXT PRIMARY KEY NOT NULL);
         CREATE TABLE node_document (
            graph_node_id TEXT PRIMARY KEY NOT NULL, body TEXT NOT NULL DEFAULT '',
            summary TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL, neo4j_synced INTEGER NOT NULL DEFAULT 0
         );
         CREATE TABLE node_layout (
            graph_node_id TEXT NOT NULL, canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
            position_x REAL NOT NULL, position_y REAL NOT NULL, width REAL NOT NULL, height REAL NOT NULL,
            style_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (canvas_id, graph_node_id)
         );
         INSERT INTO canvases(id) VALUES ('canvas-a');
         INSERT INTO node_document VALUES ('node-a', 'irreplaceable body', 'face copy', '2025-01-02T03:04:05Z', 0);
         INSERT INTO node_layout(graph_node_id, canvas_id, position_x, position_y, width, height, style_json)
            VALUES ('node-a', 'canvas-a', 11.25, 22.5, 333, 144, '{\"color\":\"ochre\"}');",
    ).expect("0010 schema fixture");
    for version in [
        "0001_initial",
        "0002_search_index",
        "0003_project_resource_roots",
        "0004_node_style_fields",
        "0005_edge_anchor_fields",
        "0006_sequence_redesign",
        "0007_saved_sequences",
        "0008_layout_store",
        "0009_agent_activity",
        "0010_node_document",
    ] {
        connection
            .execute(
                "INSERT INTO schema_migrations(version) VALUES (?1)",
                [version],
            )
            .unwrap();
    }

    let document_before = connection
        .query_row(
            "SELECT graph_node_id, body, summary, updated_at, neo4j_synced FROM node_document WHERE graph_node_id='node-a'",
            [],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, i64>(4)?)),
        )
        .unwrap();
    let layout_before = connection
        .query_row(
            "SELECT graph_node_id, canvas_id, position_x, position_y, width, height, style_json FROM node_layout WHERE graph_node_id='node-a'",
            [],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, f64>(2)?.to_bits(), row.get::<_, f64>(3)?.to_bits(), row.get::<_, f64>(4)?.to_bits(), row.get::<_, f64>(5)?.to_bits(), row.get::<_, String>(6)?)),
        )
        .unwrap();

    MigrationRunner::migrate(&connection).expect("upgrade from 0010");
    MigrationRunner::migrate(&connection).expect("idempotent in-process rerun");
    drop(connection);

    let reopened = Connection::open(&path).expect("reopen upgraded database");
    MigrationRunner::migrate(&reopened).expect("idempotent reopened rerun");
    let document_after = reopened
        .query_row(
            "SELECT graph_node_id, body, summary, updated_at, neo4j_synced FROM node_document WHERE graph_node_id='node-a'",
            [],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, i64>(4)?)),
        )
        .unwrap();
    let layout_after = reopened
        .query_row(
            "SELECT graph_node_id, canvas_id, position_x, position_y, width, height, style_json FROM node_layout WHERE graph_node_id='node-a'",
            [],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, f64>(2)?.to_bits(), row.get::<_, f64>(3)?.to_bits(), row.get::<_, f64>(4)?.to_bits(), row.get::<_, f64>(5)?.to_bits(), row.get::<_, String>(6)?)),
        )
        .unwrap();
    assert_eq!(
        document_after, document_before,
        "document bytes and values survive migration"
    );
    assert_eq!(
        layout_after, layout_before,
        "canvas layout float bits and values survive migration"
    );
    assert_eq!(
        reopened.query_row("SELECT body || '|' || summary || '|' || updated_at || '|' || neo4j_synced FROM node_document WHERE graph_node_id='node-a'", [], |row| row.get::<_, String>(0)).unwrap(),
        "irreplaceable body|face copy|2025-01-02T03:04:05Z|0"
    );
    assert_eq!(
        reopened.query_row("SELECT position_x || '|' || position_y || '|' || width || '|' || height || '|' || style_json FROM node_layout WHERE graph_node_id='node-a'", [], |row| row.get::<_, String>(0)).unwrap(),
        "11.25|22.5|333.0|144.0|{\"color\":\"ochre\"}"
    );
    assert_eq!(
        reopened
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| row
                .get::<_, i64>(0))
            .unwrap(),
        12
    );
    assert!(table_exists(&reopened, "graph_node_metadata"));
    assert!(table_exists(&reopened, "timeline_layout"));
}

#[test]
fn timeline_layout_foreign_key_is_enforced_and_cascades() {
    let (_dir, database) = open_temp_database();
    let connection = database.connection();
    let orphan = connection.execute(
        "INSERT INTO timeline_layout(graph_node_id, lane, offset_y, width, height) VALUES ('missing', 'events', 0, 300, 140)",
        [],
    );
    assert!(
        orphan.is_err(),
        "presentation cannot outlive its graph metadata"
    );
    connection.execute(
        "INSERT INTO graph_node_metadata(graph_node_id, entity_type, title, content_origin, content_revision, schema_version, sync_state, is_temporal)
         VALUES ('node-a', 'Event', 'A', 'corpus_compiled', 1, 1, 'pending', 1)", [],
    ).unwrap();
    connection.execute(
        "INSERT INTO timeline_layout(graph_node_id, lane, offset_y, width, height) VALUES ('node-a', 'events', 0, 300, 140)", [],
    ).unwrap();
    connection
        .execute(
            "DELETE FROM graph_node_metadata WHERE graph_node_id='node-a'",
            [],
        )
        .unwrap();
    assert_eq!(
        connection
            .query_row("SELECT COUNT(*) FROM timeline_layout", [], |row| row
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
}

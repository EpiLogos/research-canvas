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
    assert!(table_exists(connection, "graph_relationship"));

    let applied_migrations: i64 = connection
        .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .expect("migration count");
    assert_eq!(
        applied_migrations,
        MigrationRunner::migration_count() as i64
    );
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
    assert_eq!(
        applied_migrations,
        MigrationRunner::migration_count() as i64
    );
}

#[test]
fn db_migrations_upgrade_0010_without_touching_documents_or_canvas_layouts() {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("upgrade.sqlite");
    let connection = Connection::open(&path).expect("fixture database");
    MigrationRunner::migrate_through(&connection, "0010_node_document")
        .expect("apply the real migrations through 0010");
    connection.execute_batch(
        "INSERT INTO projects(id, display_name, slug, root_path) VALUES ('project-a', 'Project A', 'project-a', '/project-a');
         INSERT INTO canvases(id, project_id, name) VALUES ('canvas-a', 'project-a', 'Canvas A');
         INSERT INTO node_document VALUES ('node-a', 'irreplaceable body', 'face copy', '2025-01-02T03:04:05Z', 0);
         INSERT INTO node_layout(graph_node_id, canvas_id, position_x, position_y, width, height, style_json)
            VALUES ('node-a', 'canvas-a', 11.25, 22.5, 333, 144, '{\"color\":\"ochre\"}');",
    ).expect("0010 schema fixture");

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
        MigrationRunner::migration_count() as i64
    );
    assert!(table_exists(&reopened, "graph_node_metadata"));
    assert!(table_exists(&reopened, "timeline_layout"));
}

#[test]
fn db_migrations_0017_creates_the_exact_local_relationship_tombstone_inventory() {
    let (_dir, database) = open_temp_database();
    let connection = database.connection();

    let columns = connection
        .prepare("PRAGMA table_info(graph_relationship)")
        .expect("relationship table info")
        .query_map([], |row| row.get::<_, String>(1))
        .expect("relationship columns")
        .collect::<Result<Vec<_>, _>>()
        .expect("decode relationship columns");
    assert_eq!(
        columns,
        vec![
            "relationship_id",
            "source_graph_node_id",
            "target_graph_node_id",
            "rel_type",
            "properties_json",
            "source_coordinates_json",
            "evidence_tags_json",
            "origin",
            "sync_state",
            "relationship_revision",
            "remote_revision",
            "created_at",
            "updated_at",
            "is_tombstone",
        ],
    );

    let indexes = connection
        .prepare(
            "SELECT name FROM sqlite_master
             WHERE type='index' AND tbl_name='graph_relationship'
             ORDER BY name",
        )
        .expect("relationship index inventory")
        .query_map([], |row| row.get::<_, String>(0))
        .expect("relationship index rows")
        .collect::<Result<Vec<_>, _>>()
        .expect("decode relationship indexes");
    assert_eq!(
        indexes,
        vec![
            "idx_graph_relationship_source",
            "idx_graph_relationship_sync",
            "idx_graph_relationship_target",
            "idx_graph_relationship_tombstone",
            "idx_graph_relationship_type",
            "sqlite_autoindex_graph_relationship_1",
        ],
    );

    let triggers = connection
        .prepare(
            "SELECT name FROM sqlite_master
             WHERE type='trigger' AND tbl_name='graph_relationship'
             ORDER BY name",
        )
        .expect("relationship trigger inventory")
        .query_map([], |row| row.get::<_, String>(0))
        .expect("relationship trigger rows")
        .collect::<Result<Vec<_>, _>>()
        .expect("decode relationship triggers");
    assert_eq!(
        triggers,
        vec![
            "trg_graph_relationship_string_arrays_insert",
            "trg_graph_relationship_string_arrays_update",
        ],
    );

    let table_sql: String = connection
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='graph_relationship'",
            [],
            |row| row.get(0),
        )
        .expect("relationship table SQL");
    for rel_type in [
        "CONTAINS",
        "PART_OF",
        "NESTS",
        "INSTANTIATES",
        "ECHOES",
        "CAUSES",
        "INFLUENCES",
        "OPPOSES",
        "INHERITS",
        "TRANSFORMS_INTO",
        "LOCATED_AT",
        "SOURCED_FROM",
        "SUPPORTS",
        "QUALIFIES",
        "CONTESTS",
        "RESONATES_WITH",
        "UNCLASSIFIED_RESEARCH_CONNECTION",
    ] {
        assert!(
            table_sql.contains(rel_type),
            "missing relationship type {rel_type}"
        );
    }
}

#[test]
fn db_migrations_0016_upgrades_a_real_applied_0015_relationship_projection_without_losing_rows() {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("relationship-vocabulary-upgrade.sqlite");
    let connection = Connection::open(&path).expect("fixture database");
    MigrationRunner::migrate_through(&connection, "0015_graph_relationship_projection")
        .expect("apply the historical 0015 schema");
    let pre_upgrade_sql: String = connection
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='graph_relationship'",
            [],
            |row| row.get(0),
        )
        .expect("read historical relationship table");
    assert!(pre_upgrade_sql.contains("INSTANTIATES"));
    assert!(!pre_upgrade_sql.contains("NESTS"));

    connection
        .execute_batch(
            "INSERT INTO graph_node_metadata(
                graph_node_id, entity_type, title, content_origin, content_revision,
                schema_version, sync_state
             ) VALUES
                ('legacy-root', 'Constellation', 'Legacy root', 'seed', 4, 1, 'synced'),
                ('legacy-unit', 'Constellation', 'Legacy unit', 'corpus_compiled', 7, 1, 'pending');
             INSERT INTO graph_relationship(
                relationship_id, source_graph_node_id, target_graph_node_id, rel_type,
                properties_json, source_coordinates_json, evidence_tags_json, origin,
                sync_state, relationship_revision, remote_revision, created_at, updated_at
             ) VALUES (
                'legacy-instantiates', 'legacy-root', 'legacy-unit', 'INSTANTIATES',
                '{\"canonicalKey\":\"legacy-root:INSTANTIATES:legacy-unit\",\"reading\":\"preserve me\"}',
                '[\"episodes/2/timeline.md#1888\"]', '[\"documented\",\"timeline\"]',
                'corpus_compiled', 'conflict', 12, 34,
                '2024-01-02T03:04:05.000Z', '2025-06-07T08:09:10.000Z'
             );",
        )
        .expect("insert valid historical relationship row");

    MigrationRunner::migrate(&connection)
        .expect("upgrade applied relationship tombstone migration");
    let preserved = connection
        .query_row(
            "SELECT relationship_id, source_graph_node_id, target_graph_node_id, rel_type,
                    properties_json, source_coordinates_json, evidence_tags_json, origin,
                    sync_state, relationship_revision, remote_revision, is_tombstone, created_at, updated_at
             FROM graph_relationship WHERE relationship_id='legacy-instantiates'",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, i64>(9)?,
                    row.get::<_, Option<i64>>(10)?,
                    row.get::<_, i64>(11)?,
                    row.get::<_, String>(12)?,
                    row.get::<_, String>(13)?,
                ))
            },
        )
        .expect("relationship survives vocabulary upgrade");
    let (
        relationship_id,
        source_graph_node_id,
        target_graph_node_id,
        rel_type,
        properties_json,
        source_coordinates_json,
        evidence_tags_json,
        origin,
        sync_state,
        relationship_revision,
        remote_revision,
        is_tombstone,
        created_at,
        updated_at,
    ) = preserved;
    assert_eq!(relationship_id, "legacy-instantiates");
    assert_eq!(source_graph_node_id, "legacy-root");
    assert_eq!(target_graph_node_id, "legacy-unit");
    assert_eq!(rel_type, "INSTANTIATES");
    assert_eq!(
        properties_json,
        "{\"canonicalKey\":\"legacy-root:INSTANTIATES:legacy-unit\",\"reading\":\"preserve me\"}"
    );
    assert_eq!(source_coordinates_json, "[\"episodes/2/timeline.md#1888\"]");
    assert_eq!(evidence_tags_json, "[\"documented\",\"timeline\"]");
    assert_eq!(origin, "corpus_compiled");
    assert_eq!(sync_state, "conflict");
    assert_eq!(relationship_revision, 12);
    assert_eq!(remote_revision, Some(34));
    assert_eq!(is_tombstone, 0, "legacy active relationship stays active");
    assert_eq!(created_at, "2024-01-02T03:04:05.000Z");
    assert_eq!(updated_at, "2025-06-07T08:09:10.000Z");
    connection
        .execute(
            "INSERT INTO graph_relationship(
                relationship_id, source_graph_node_id, target_graph_node_id, rel_type,
                properties_json, source_coordinates_json, evidence_tags_json, origin,
                sync_state, relationship_revision
             ) VALUES (?1, ?2, ?3, 'NESTS', '{}', '[]', '[]', 'seed', 'pending', 1)",
            ["structural-after-upgrade", "legacy-root", "legacy-unit"],
        )
        .expect("upgraded local schema accepts structural NESTS relationship");
    let applied_migrations: i64 = connection
        .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .expect("migration count after upgrade");
    assert_eq!(
        applied_migrations,
        MigrationRunner::migration_count() as i64
    );
}

#[test]
fn db_migrations_0018_preserves_edge_layouts_and_scopes_ids_to_each_canvas() {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("canvas-scoped-edge-layout.sqlite");
    let connection = Connection::open(&path).expect("fixture database");
    MigrationRunner::migrate_through(&connection, "0017_graph_relationship_tombstones")
        .expect("apply authentic pre-0018 schema");
    connection
        .execute_batch(
            "INSERT INTO projects(id, display_name, slug, root_path)
                VALUES
                  ('project-a', 'Project A', 'project-a', '/project-a'),
                  ('project-b', 'Project B', 'project-b', '/project-b');
             INSERT INTO canvases(id, project_id, name)
                VALUES
                  ('canvas-a', 'project-a', 'Canvas A'),
                  ('canvas-b', 'project-b', 'Canvas B');
             INSERT INTO edge_layout(
                id, canvas_id, source_graph_node_id, target_graph_node_id,
                relation_kind, style_json, created_at, updated_at
             ) VALUES (
                'graph:relationship-existing', 'canvas-a', 'source-a', 'target-a',
                'INSTANTIATES', '{\"stroke\":\"#abc\"}',
                '2026-01-02T03:04:05Z', '2026-01-03T04:05:06Z'
             );",
        )
        .expect("insert authentic 0017 edge-layout row");

    MigrationRunner::migrate(&connection).expect("migrate edge layout identity");
    let preserved = connection
        .query_row(
            "SELECT canvas_id, id, source_graph_node_id, target_graph_node_id,
                    relation_kind, style_json, created_at, updated_at
             FROM edge_layout WHERE canvas_id='canvas-a' AND id='graph:relationship-existing'",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                ))
            },
        )
        .expect("pre-migration layout survives");
    assert_eq!(
        preserved,
        (
            "canvas-a".to_string(),
            "graph:relationship-existing".to_string(),
            "source-a".to_string(),
            "target-a".to_string(),
            "INSTANTIATES".to_string(),
            "{\"stroke\":\"#abc\"}".to_string(),
            "2026-01-02T03:04:05Z".to_string(),
            "2026-01-03T04:05:06Z".to_string(),
        )
    );
    connection
        .execute(
            "INSERT INTO edge_layout(
                id, canvas_id, source_graph_node_id, target_graph_node_id,
                relation_kind, style_json
             ) VALUES (?1, 'canvas-b', 'source-b', 'target-b', 'ECHOES', '{}')",
            ["graph:relationship-existing"],
        )
        .expect("same semantic layout id can coexist in a second canvas");
    let count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM edge_layout WHERE id='graph:relationship-existing'",
            [],
            |row| row.get(0),
        )
        .expect("count canvas-scoped rows");
    assert_eq!(count, 2);
}

#[test]
fn db_migrations_0017_upgrades_an_applied_0016_row_with_an_active_tombstone_default() {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("relationship-tombstone-upgrade.sqlite");
    let connection = Connection::open(&path).expect("fixture database");
    MigrationRunner::migrate_through(
        &connection,
        "0016_graph_relationship_structural_vocabulary_repair",
    )
    .expect("apply the real schema through 0016");
    connection
        .execute_batch(
            "INSERT INTO graph_node_metadata(
                graph_node_id, entity_type, title, content_origin, content_revision,
                schema_version, sync_state
             ) VALUES
                ('upgrade-source', 'Event', 'Upgrade source', 'corpus_compiled', 1, 1, 'pending'),
                ('upgrade-target', 'Archetype', 'Upgrade target', 'corpus_compiled', 1, 1, 'pending');
             INSERT INTO graph_relationship(
                relationship_id, source_graph_node_id, target_graph_node_id, rel_type,
                properties_json, source_coordinates_json, evidence_tags_json, origin,
                sync_state, relationship_revision, remote_revision, created_at, updated_at
             ) VALUES (
                'upgrade-active', 'upgrade-source', 'upgrade-target', 'INSTANTIATES',
                '{\"canonicalKey\":\"upgrade:active\",\"reading\":\"preserve me\"}',
                '[\"vault/upgrade.md\"]', '[\"documented\"]', 'user_authored',
                'pending', 9, NULL, '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'
             );",
        )
        .expect("insert real 0016 relationship fixture");

    MigrationRunner::migrate(&connection).expect("upgrade 0016 database to tombstone schema");
    let row = connection
        .query_row(
            "SELECT properties_json, origin, sync_state, relationship_revision, is_tombstone,
                    created_at, updated_at
             FROM graph_relationship WHERE relationship_id='upgrade-active'",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )
        .expect("legacy row survives tombstone migration");
    assert_eq!(
        row,
        (
            "{\"canonicalKey\":\"upgrade:active\",\"reading\":\"preserve me\"}".into(),
            "user_authored".into(),
            "pending".into(),
            9,
            0,
            "2026-01-01T00:00:00.000Z".into(),
            "2026-01-02T00:00:00.000Z".into(),
        ),
    );
}

#[test]
fn db_migrations_upgrade_actual_0012_documents_as_honest_imports_without_changing_content() {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("upgrade-0012.sqlite");
    let connection = Connection::open(&path).expect("fixture database");
    MigrationRunner::migrate_through(&connection, "0012_timeline_layout")
        .expect("apply real migrations through 0012");
    connection
        .execute(
            "INSERT INTO node_document(graph_node_id, body, summary, updated_at, neo4j_synced)
         VALUES ('legacy', ?1, ?2, '2024-04-05T06:07:08Z', 1)",
            ["unaltered body", "unaltered face"],
        )
        .unwrap();

    MigrationRunner::migrate(&connection).expect("upgrade through 0013");
    drop(connection);
    let reopened = Connection::open(&path).expect("reopen");
    MigrationRunner::migrate(&reopened).expect("rerun migrations");

    let row = reopened
        .query_row(
            "SELECT body, summary, updated_at, neo4j_synced, content_origin, content_revision,
                body_source_coordinates_json FROM node_document WHERE graph_node_id='legacy'",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )
        .unwrap();
    assert_eq!(
        row,
        (
            "unaltered body".into(),
            "unaltered face".into(),
            "2024-04-05T06:07:08Z".into(),
            1,
            "imported".into(),
            0,
            "[]".into()
        )
    );
}

#[test]
fn db_migrations_remove_only_the_default_timeline_rows_created_by_a_selection_click() {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("timeline-click-repair.sqlite");
    let connection = Connection::open(&path).expect("fixture database");
    MigrationRunner::migrate_through(&connection, "0013_node_document_reconciliation")
        .expect("apply pre-repair schema");
    connection.execute_batch(
        "INSERT INTO graph_node_metadata(graph_node_id, entity_type, title, content_origin, content_revision, schema_version, sync_state, is_temporal)
             VALUES ('selection-click', 'Event', 'Selection click', 'seed', 0, 1, 'pending', 1),
                    ('manual-layout', 'Event', 'Manual layout', 'seed', 0, 1, 'pending', 1);
         INSERT INTO timeline_layout(graph_node_id, lane, offset_y, width, height, style_json)
             VALUES ('selection-click', 'events', 0, 240, 72, '{}'),
                    ('manual-layout', 'events', 44, 240, 72, '{}');",
    ).expect("seed accidental and manual timeline rows");

    MigrationRunner::migrate(&connection).expect("apply the click-layout repair");

    assert_eq!(
        connection
            .query_row(
                "SELECT COUNT(*) FROM timeline_layout WHERE graph_node_id='selection-click'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap(),
        0,
        "a selection click must not acquire an explicit events lane",
    );
    assert_eq!(
        connection
            .query_row(
                "SELECT COUNT(*) FROM timeline_layout WHERE graph_node_id='manual-layout'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap(),
        1,
        "a genuinely moved card remains persisted",
    );
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

#[test]
fn graph_vector_json_and_timeline_style_shapes_are_enforced_by_sqlite() {
    let (_dir, database) = open_temp_database();
    let connection = database.connection();
    let columns = [
        "source_coordinates_json",
        "evidence_tags_json",
        "body_source_coordinates_json",
        "ql_source_coordinates_json",
    ];
    for (column_index, column) in columns.iter().enumerate() {
        for (value_index, invalid) in ["{}", "null", "42", "[\"valid\",7]"].iter().enumerate() {
            let sql = format!(
                "INSERT INTO graph_node_metadata(graph_node_id,entity_type,title,content_origin,content_revision,schema_version,sync_state,is_temporal,{column})
                 VALUES (?1,'Event','Bad','seed',0,1,'pending',0,?2)"
            );
            let id = format!("bad-{column_index}-{value_index}");
            assert!(
                connection
                    .execute(&sql, rusqlite::params![id, invalid])
                    .is_err(),
                "{column} rejected {invalid}"
            );
        }
    }
    connection.execute(
        "INSERT INTO graph_node_metadata(graph_node_id,entity_type,title,content_origin,content_revision,schema_version,sync_state,is_temporal,
         source_coordinates_json,evidence_tags_json,body_source_coordinates_json,ql_source_coordinates_json)
         VALUES ('valid-arrays','Event','Valid','seed',0,1,'pending',0,'[]','[\"tag\"]','[\"body\"]','[]')", [],
    ).unwrap();
    for column in columns {
        let sql = format!("UPDATE graph_node_metadata SET {column}='[\"valid\",false]' WHERE graph_node_id='valid-arrays'");
        assert!(
            connection.execute(&sql, []).is_err(),
            "update trigger protects {column}"
        );
    }

    connection.execute(
        "INSERT INTO graph_node_metadata(graph_node_id,entity_type,title,content_origin,content_revision,schema_version,sync_state,is_temporal)
         VALUES ('style-node','Event','Style','seed',0,1,'pending',0)", [],
    ).unwrap();
    for invalid in ["[]", "null", "\"red\"", "7"] {
        let result = connection.execute(
            "INSERT INTO timeline_layout(graph_node_id,lane,offset_y,width,height,style_json) VALUES ('style-node','events',0,300,140,?1)",
            [invalid],
        );
        assert!(result.is_err());
    }
    connection.execute(
        "INSERT INTO timeline_layout(graph_node_id,lane,offset_y,width,height,style_json) VALUES ('style-node','events',0,300,140,'{\"color\":\"red\"}')", [],
    ).unwrap();
}

#[test]
fn additive_migrations_expose_expected_schema_inventory() {
    let (_dir, database) = open_temp_database();
    let connection = database.connection();
    for legacy in [
        "projects",
        "canvases",
        "canvas_nodes",
        "node_layout",
        "node_document",
    ] {
        assert!(
            table_exists(connection, legacy),
            "legacy table {legacy} remains"
        );
    }
    for (kind, name) in [
        ("table", "graph_node_metadata"),
        ("table", "timeline_layout"),
        ("index", "idx_graph_node_metadata_temporal"),
        ("index", "idx_timeline_layout_lane"),
        ("trigger", "trg_graph_node_metadata_string_arrays_insert"),
        ("trigger", "trg_graph_node_metadata_string_arrays_update"),
    ] {
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_schema WHERE type=?1 AND name=?2",
                    [kind, name],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            1,
            "{kind} {name}"
        );
    }
    let timeline_sql: String = connection
        .query_row(
            "SELECT sql FROM sqlite_schema WHERE type='table' AND name='timeline_layout'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(timeline_sql.contains("layout_revision"));
    assert!(!timeline_sql.contains("position_x"));
}

#[test]
fn database_open_configures_file_wal_timeout_and_keeps_memory_databases_working() {
    let (_dir, database) = open_temp_database();
    assert_eq!(
        database
            .connection()
            .query_row("PRAGMA journal_mode", [], |row| row.get::<_, String>(0))
            .unwrap(),
        "wal"
    );
    assert_eq!(
        database
            .connection()
            .query_row("PRAGMA busy_timeout", [], |row| row.get::<_, i64>(0))
            .unwrap(),
        1000
    );
    let memory = Database::open(":memory:").unwrap();
    assert_eq!(
        memory
            .connection()
            .query_row("PRAGMA journal_mode", [], |row| row.get::<_, String>(0))
            .unwrap(),
        "memory"
    );
    assert!(table_exists(memory.connection(), "graph_node_metadata"));
}

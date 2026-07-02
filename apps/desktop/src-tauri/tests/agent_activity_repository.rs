use research_canvas_desktop_lib::db::connection::Database;

fn temp_db() -> (tempfile::TempDir, Database) {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("activity.db");
    let db = Database::open(path.to_str().unwrap()).expect("open db");
    (dir, db)
}

#[test]
fn agent_activity_table_exists_after_migration() {
    let (_dir, db) = temp_db();
    let conn = db.connection();
    let count: i64 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='agent_activity'",
            [],
            |row| row.get(0),
        )
        .expect("query sqlite_master");
    assert_eq!(count, 1, "agent_activity table should exist after migrations");
}

#[test]
fn agent_activity_accepts_a_node_created_row() {
    let (_dir, db) = temp_db();
    let conn = db.connection();
    conn.execute(
        "INSERT INTO agent_activity (id, kind, graph_node_id, title, entity_type) \
         VALUES ('a1', 'node_created', 'gn-1', 'Cosimo de Medici', 'Figure')",
        [],
    )
    .expect("insert activity row");
    let (reviewed, placed): (i64, i64) = conn
        .query_row(
            "SELECT reviewed, placed FROM agent_activity WHERE id='a1'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("read defaults");
    assert_eq!(reviewed, 0);
    assert_eq!(placed, 0);
}

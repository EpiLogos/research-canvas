use research_canvas_desktop_lib::db::connection::Database;
use research_canvas_desktop_lib::db::repositories::agent_activity::{
    AgentActivityRepository, NewAgentActivity,
};

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
    assert_eq!(
        count, 1,
        "agent_activity table should exist after migrations"
    );
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

fn sample(kind: &str, gid: &str, title: &str) -> NewAgentActivity {
    NewAgentActivity {
        kind: kind.to_string(),
        canvas_id: Some("canvas-1".to_string()),
        graph_node_id: Some(gid.to_string()),
        relationship_id: None,
        title: title.to_string(),
        entity_type: Some("Figure".to_string()),
        detail_json: "{}".to_string(),
    }
}

#[test]
fn records_and_lists_recent_newest_first() {
    let (_dir, db) = temp_db();
    let conn = db.connection();
    let repo = AgentActivityRepository::new(conn);
    let first = repo
        .record(&sample("node_created", "gn-1", "First"))
        .unwrap();
    let second = repo
        .record(&sample("node_created", "gn-2", "Second"))
        .unwrap();
    assert!(!first.id.is_empty());
    assert!(!first.reviewed);
    let recent = repo.list_recent(10).unwrap();
    assert_eq!(recent.len(), 2);
    // newest first
    assert_eq!(recent[0].id, second.id);
}

#[test]
fn marks_reviewed_and_placed() {
    let (_dir, db) = temp_db();
    let conn = db.connection();
    let repo = AgentActivityRepository::new(conn);
    let rec = repo
        .record(&sample("node_created", "gn-9", "Node"))
        .unwrap();
    repo.mark_reviewed(&rec.id).unwrap();
    repo.mark_placed("gn-9").unwrap();
    let recent = repo.list_recent(10).unwrap();
    let found = recent.iter().find(|r| r.id == rec.id).unwrap();
    assert!(found.reviewed);
    assert!(found.placed);
}

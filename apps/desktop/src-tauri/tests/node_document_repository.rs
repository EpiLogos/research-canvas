use research_canvas_desktop_lib::db::connection::Database;
use research_canvas_desktop_lib::db::repositories::node_document::NodeDocumentRepository;

fn temp_db() -> (tempfile::TempDir, Database) {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("node_document.db");
    let db = Database::open(path.to_str().unwrap()).expect("open db");
    (dir, db)
}

#[test]
fn node_document_table_exists_after_migration() {
    let (_dir, db) = temp_db();
    let conn = db.connection();
    let count: i64 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='node_document'",
            [],
            |row| row.get(0),
        )
        .expect("query sqlite_master");
    assert_eq!(
        count, 1,
        "node_document table should exist after migrations"
    );
}

#[test]
fn get_node_document_returns_none_when_absent() {
    let (_dir, db) = temp_db();
    let conn = db.connection();
    let repo = NodeDocumentRepository::new(conn);
    let result = repo.get_node_document("x").unwrap();
    assert!(result.is_none());
}

#[test]
fn upsert_then_get_returns_the_row() {
    let (_dir, db) = temp_db();
    let conn = db.connection();
    let repo = NodeDocumentRepository::new(conn);

    repo.upsert_node_document("x", "BODY", "sum", false)
        .unwrap();

    let result = repo
        .get_node_document("x")
        .unwrap()
        .expect("row should exist");
    assert_eq!(result.graph_node_id, "x");
    assert_eq!(result.body, "BODY");
    assert_eq!(result.summary, "sum");
    assert!(!result.neo4j_synced);
}

#[test]
fn second_upsert_updates_in_place_without_duplicate_rows() {
    let (_dir, db) = temp_db();
    let conn = db.connection();
    let repo = NodeDocumentRepository::new(conn);

    repo.upsert_node_document("x", "BODY", "sum", false)
        .unwrap();
    repo.upsert_node_document("x", "BODY2", "sum2", true)
        .unwrap();

    let count: i64 = conn
        .query_row(
            "SELECT count(*) FROM node_document WHERE graph_node_id = 'x'",
            [],
            |row| row.get(0),
        )
        .expect("count rows");
    assert_eq!(count, 1, "upsert should not create a duplicate row");

    let result = repo
        .get_node_document("x")
        .unwrap()
        .expect("row should exist");
    assert_eq!(result.body, "BODY2");
    assert_eq!(result.summary, "sum2");
    assert!(result.neo4j_synced);
}

use research_canvas_desktop_lib::db::connection::Database;
use research_canvas_desktop_lib::db::repositories::graph::ContentOrigin;
use research_canvas_desktop_lib::db::repositories::node_document::{
    DocumentContentInput, NodeDocumentMutation, NodeDocumentRepository,
};

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

fn input(id: &str, body: &str, origin: ContentOrigin, revision: i64) -> DocumentContentInput {
    DocumentContentInput {
        graph_node_id: id.into(),
        body: body.into(),
        summary: format!("{body} face"),
        content_origin: origin,
        content_revision: revision,
        body_source_coordinates: vec!["canonical.md#section".into()],
        neo4j_synced: false,
    }
}

#[test]
fn reconciliation_creates_then_exact_retry_is_a_noop() {
    let (_dir, db) = temp_db();
    let repo = NodeDocumentRepository::new(db.connection());
    let seed = input("seeded", "v1", ContentOrigin::Seed, 1);
    assert_eq!(
        repo.apply_reconciliation(&seed, None).unwrap(),
        NodeDocumentMutation::Created
    );
    assert_eq!(
        repo.apply_reconciliation(&seed, None).unwrap(),
        NodeDocumentMutation::Preserved
    );
    let stored = repo.get_node_document("seeded").unwrap().unwrap();
    assert_eq!(stored.content_origin, ContentOrigin::Seed);
    assert_eq!(stored.content_revision, 1);
}

#[test]
fn only_explicitly_newer_seed_revision_updates_seed_owned_content() {
    let (_dir, db) = temp_db();
    let repo = NodeDocumentRepository::new(db.connection());
    repo.apply_reconciliation(&input("n", "v1", ContentOrigin::Seed, 1), None)
        .unwrap();
    let newer = input("n", "v2", ContentOrigin::Seed, 2);
    assert_eq!(
        repo.apply_reconciliation(&newer, Some(1)).unwrap(),
        NodeDocumentMutation::Updated
    );
    assert_eq!(repo.get_node_document("n").unwrap().unwrap().body, "v2");
}

#[test]
fn seed_preserves_corpus_imported_and_user_authored_bodies() {
    for (index, origin) in [
        ContentOrigin::CorpusCompiled,
        ContentOrigin::Imported,
        ContentOrigin::UserAuthored,
    ]
    .into_iter()
    .enumerate()
    {
        let (_dir, db) = temp_db();
        let repo = NodeDocumentRepository::new(db.connection());
        let id = format!("n-{index}");
        repo.apply_reconciliation(&input(&id, "authored", origin, 4), None)
            .unwrap();
        let result = repo
            .apply_reconciliation(&input(&id, "generic seed", ContentOrigin::Seed, 5), Some(4))
            .unwrap();
        assert_eq!(result, NodeDocumentMutation::Preserved);
        assert_eq!(
            repo.get_node_document(&id).unwrap().unwrap().body,
            "authored"
        );
    }
}

#[test]
fn divergent_same_revision_and_stale_user_edit_surface_conflicts() {
    let (_dir, db) = temp_db();
    let repo = NodeDocumentRepository::new(db.connection());
    repo.apply_reconciliation(&input("n", "first", ContentOrigin::Seed, 3), None)
        .unwrap();
    assert!(
        matches!(repo.apply_reconciliation(&input("n", "different", ContentOrigin::Seed, 3), Some(3)).unwrap(),
        NodeDocumentMutation::Conflict { reason, .. } if reason.contains("same revision"))
    );
    assert!(
        matches!(repo.apply_user_edit("n", "edit", "face", 2).unwrap(),
        NodeDocumentMutation::Conflict { reason, .. } if reason.contains("expected revision"))
    );
}

#[test]
fn user_edit_promotes_ownership_advances_revision_and_survives_later_seed_run() {
    let (_dir, db) = temp_db();
    let repo = NodeDocumentRepository::new(db.connection());
    repo.apply_reconciliation(&input("n", "seed", ContentOrigin::Seed, 1), None)
        .unwrap();
    assert_eq!(
        repo.apply_user_edit("n", "real authored body", "face", 1)
            .unwrap(),
        NodeDocumentMutation::Updated
    );
    assert_eq!(
        repo.apply_reconciliation(
            &input("n", "replacement seed", ContentOrigin::Seed, 3),
            Some(2)
        )
        .unwrap(),
        NodeDocumentMutation::Preserved
    );
    let stored = repo.get_node_document("n").unwrap().unwrap();
    assert_eq!(stored.body, "real authored body");
    assert_eq!(stored.content_origin, ContentOrigin::UserAuthored);
    assert_eq!(stored.content_revision, 2);
}

#[test]
fn bulk_dry_run_is_stable_and_writes_nothing() {
    let (_dir, db) = temp_db();
    let repo = NodeDocumentRepository::new(db.connection());
    let inputs = vec![
        input("b", "B", ContentOrigin::Seed, 1),
        input("a", "A", ContentOrigin::Seed, 1),
    ];
    let decisions = repo.plan_bulk(&inputs).unwrap();
    assert_eq!(
        decisions
            .iter()
            .map(|d| d.graph_node_id.as_str())
            .collect::<Vec<_>>(),
        vec!["b", "a"]
    );
    assert!(decisions
        .iter()
        .all(|d| d.mutation == NodeDocumentMutation::Created));
    assert!(repo.get_node_document("a").unwrap().is_none());
    assert!(repo.get_node_document("b").unwrap().is_none());
}

fn insert_metadata(conn: &rusqlite::Connection, id: &str, revision: i64) {
    conn.execute(
        "INSERT INTO graph_node_metadata(
          graph_node_id, entity_type, title, content_origin, content_revision,
          is_temporal, schema_version, sync_state)
         VALUES (?1, 'Work', 'Node', 'seed', ?2, 0, 1, 'synced')",
        rusqlite::params![id, revision],
    )
    .unwrap();
}

#[test]
fn apply_aligns_existing_metadata_in_the_same_transaction() {
    let (_dir, db) = temp_db();
    let repo = NodeDocumentRepository::new(db.connection());
    repo.apply_reconciliation(&input("n", "seed", ContentOrigin::Seed, 1), None)
        .unwrap();
    insert_metadata(db.connection(), "n", 1);
    let mut corpus = input("n", "corpus body", ContentOrigin::CorpusCompiled, 2);
    corpus.neo4j_synced = false;
    assert_eq!(
        repo.apply_reconciliation(&corpus, Some(1)).unwrap(),
        NodeDocumentMutation::Updated
    );
    let metadata = db
        .connection()
        .query_row(
            "SELECT content_origin, content_revision, body_source_coordinates_json, sync_state
         FROM graph_node_metadata WHERE graph_node_id='n'",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .unwrap();
    assert_eq!(
        metadata,
        (
            "corpus_compiled".into(),
            2,
            "[\"canonical.md#section\"]".into(),
            "pending".into()
        )
    );
}

#[test]
fn metadata_revision_mismatch_rolls_back_document_and_dry_run_touches_neither_table() {
    let (_dir, db) = temp_db();
    let repo = NodeDocumentRepository::new(db.connection());
    repo.apply_reconciliation(&input("n", "seed", ContentOrigin::Seed, 1), None)
        .unwrap();
    insert_metadata(db.connection(), "n", 9);
    let newer = input("n", "must roll back", ContentOrigin::Seed, 2);

    assert_eq!(
        repo.plan_reconciliation(&newer, Some(1)).unwrap(),
        NodeDocumentMutation::Updated
    );
    assert_eq!(repo.get_node_document("n").unwrap().unwrap().body, "seed");
    assert_eq!(
        db.connection()
            .query_row(
                "SELECT content_revision FROM graph_node_metadata WHERE graph_node_id='n'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
        9
    );

    let error = repo
        .apply_reconciliation(&newer, Some(1))
        .unwrap_err()
        .to_string();
    assert!(error.contains("metadata revision 9"));
    assert_eq!(
        repo.get_node_document("n").unwrap().unwrap().body,
        "seed",
        "document update rolled back"
    );
    assert_eq!(
        db.connection()
            .query_row(
                "SELECT content_revision FROM graph_node_metadata WHERE graph_node_id='n'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
        9
    );
}

#[test]
fn metadata_ownership_drift_is_a_conflict_and_rolls_back() {
    let (_dir, db) = temp_db();
    let repo = NodeDocumentRepository::new(db.connection());
    repo.apply_reconciliation(&input("n", "seed", ContentOrigin::Seed, 1), None)
        .unwrap();
    insert_metadata(db.connection(), "n", 1);
    db.connection()
        .execute(
            "UPDATE graph_node_metadata SET content_origin='user_authored' WHERE graph_node_id='n'",
            [],
        )
        .unwrap();

    let error = repo
        .apply_reconciliation(&input("n", "new seed", ContentOrigin::Seed, 2), Some(1))
        .unwrap_err()
        .to_string();
    assert!(error.contains("ownership"));
    assert_eq!(repo.get_node_document("n").unwrap().unwrap().body, "seed");
    assert_eq!(
        db.connection()
            .query_row(
                "SELECT content_origin FROM graph_node_metadata WHERE graph_node_id='n'",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap(),
        "user_authored"
    );
}

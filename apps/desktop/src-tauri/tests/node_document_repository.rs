use research_canvas_desktop_lib::commands::node_document::list_pending_node_document_syncs_at_path;
use research_canvas_desktop_lib::db::connection::Database;
use research_canvas_desktop_lib::db::repositories::graph::ContentOrigin;
use research_canvas_desktop_lib::db::repositories::node_document::{
    DocumentContentInput, DocumentMetadataProjection, DocumentReconciliationItem,
    NodeDocumentMutation, NodeDocumentRepository, SyncAcknowledgementMutation,
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
fn production_document_creation_atomically_creates_matching_metadata_projection() {
    let (_dir, db) = temp_db();
    let repo = NodeDocumentRepository::new(db.connection());
    let document = input("created", "", ContentOrigin::UserAuthored, 0);
    assert_eq!(
        repo.apply_reconciliation_with_projection(
            &document,
            None,
            Some(&DocumentMetadataProjection {
                entity_type: "Work".into(),
                title: "Untitled note".into(),
                schema_version: 1,
            })
        )
        .unwrap(),
        NodeDocumentMutation::Created
    );
    let projection = db.connection().query_row(
        "SELECT entity_type,title,content_origin,content_revision,sync_state FROM graph_node_metadata WHERE graph_node_id='created'",
        [], |row| Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,String>(2)?,row.get::<_,i64>(3)?,row.get::<_,String>(4)?))
    ).unwrap();
    assert_eq!(
        projection,
        (
            "Work".into(),
            "Untitled note".into(),
            "user_authored".into(),
            0,
            "pending".into()
        )
    );
}

#[test]
fn remote_import_backfill_projects_structure_then_user_edit_and_ack_do_not_drift() {
    let (_dir, db) = temp_db();
    let repo = NodeDocumentRepository::new(db.connection());
    let mut imported = input("remote-import", "remote body", ContentOrigin::Imported, 3);
    imported.neo4j_synced = true;
    imported.body_source_coordinates = vec!["remote.md#body".into()];

    assert_eq!(
        repo.apply_reconciliation_with_projection(
            &imported,
            None,
            Some(&DocumentMetadataProjection {
                entity_type: "Figure".into(),
                title: "Imported figure".into(),
                schema_version: 1,
            }),
        )
        .unwrap(),
        NodeDocumentMutation::Created
    );
    let projected = db.connection().query_row(
        "SELECT entity_type,title,schema_version,content_origin,content_revision,sync_state,remote_revision
         FROM graph_node_metadata WHERE graph_node_id='remote-import'",
        [],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, Option<i64>>(6)?,
            ))
        },
    ).unwrap();
    assert_eq!(
        projected,
        (
            "Figure".into(),
            "Imported figure".into(),
            1,
            "imported".into(),
            3,
            "synced".into(),
            None,
        )
    );

    assert_eq!(
        repo.apply_user_edit("remote-import", "authored body", "authored face", 3)
            .unwrap(),
        NodeDocumentMutation::Updated
    );
    assert_eq!(
        repo.acknowledge_sync("remote-import", 4, ContentOrigin::UserAuthored)
            .unwrap(),
        SyncAcknowledgementMutation::Updated
    );

    let document = repo.get_node_document("remote-import").unwrap().unwrap();
    assert_eq!(document.content_origin, ContentOrigin::UserAuthored);
    assert_eq!(document.content_revision, 4);
    assert!(document.neo4j_synced);
    let final_projection = db.connection().query_row(
        "SELECT entity_type,title,schema_version,content_origin,content_revision,sync_state,remote_revision
         FROM graph_node_metadata WHERE graph_node_id='remote-import'",
        [],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, Option<i64>>(6)?,
            ))
        },
    ).unwrap();
    assert_eq!(
        final_projection,
        (
            "Figure".into(),
            "Imported figure".into(),
            1,
            "user_authored".into(),
            4,
            "synced".into(),
            Some(4),
        )
    );
}

#[test]
fn preserved_seed_projects_metadata_from_the_persisted_user_document() {
    let (_dir, db) = temp_db();
    let repo = NodeDocumentRepository::new(db.connection());
    let mut authored = input("preserved", "authored body", ContentOrigin::UserAuthored, 4);
    authored.body_source_coordinates = vec!["authored.md#source".into()];
    repo.apply_reconciliation(&authored, None).unwrap();

    let mut stale_seed = input("preserved", "generic seed", ContentOrigin::Seed, 3);
    stale_seed.body_source_coordinates = vec!["seed.md#source".into()];
    assert_eq!(
        repo.apply_reconciliation_with_projection(
            &stale_seed,
            Some(4),
            Some(&DocumentMetadataProjection {
                entity_type: "Work".into(),
                title: "Preserved note".into(),
                schema_version: 1,
            }),
        )
        .unwrap(),
        NodeDocumentMutation::Preserved
    );

    let projection = db
        .connection()
        .query_row(
            "SELECT content_origin,content_revision,body_source_coordinates_json,sync_state
             FROM graph_node_metadata WHERE graph_node_id='preserved'",
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
        projection,
        (
            "user_authored".into(),
            4,
            "[\"authored.md#source\"]".into(),
            "pending".into(),
        )
    );
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
        DocumentReconciliationItem {
            document: input("b", "B", ContentOrigin::Seed, 1),
            expected_revision: None,
        },
        DocumentReconciliationItem {
            document: input("a", "A", ContentOrigin::Seed, 1),
            expected_revision: None,
        },
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

#[test]
fn duplicate_create_ids_are_rejected_identically_by_plan_and_apply_without_writes() {
    let (_dir, db) = temp_db();
    let repo = NodeDocumentRepository::new(db.connection());
    let items = vec![
        DocumentReconciliationItem {
            document: input("duplicate", "first", ContentOrigin::Seed, 1),
            expected_revision: None,
        },
        DocumentReconciliationItem {
            document: input("duplicate", "second", ContentOrigin::Seed, 1),
            expected_revision: None,
        },
    ];

    let planned_error = repo.plan_bulk(&items).unwrap_err().to_string();
    let applied_error = repo.apply_bulk(&items).unwrap_err().to_string();
    assert_eq!(planned_error, applied_error);
    assert!(planned_error.contains("duplicate graph node id duplicate"));
    assert!(repo.get_node_document("duplicate").unwrap().is_none());
}

#[test]
fn duplicate_update_ids_are_rejected_identically_by_plan_and_apply_without_writes() {
    let (_dir, db) = temp_db();
    let repo = NodeDocumentRepository::new(db.connection());
    repo.apply_reconciliation(
        &input("duplicate", "original", ContentOrigin::Seed, 1),
        None,
    )
    .unwrap();
    let items = vec![
        DocumentReconciliationItem {
            document: input("duplicate", "second", ContentOrigin::Seed, 2),
            expected_revision: Some(1),
        },
        DocumentReconciliationItem {
            document: input("duplicate", "third", ContentOrigin::Seed, 3),
            expected_revision: Some(1),
        },
    ];

    let planned_error = repo.plan_bulk(&items).unwrap_err().to_string();
    let applied_error = repo.apply_bulk(&items).unwrap_err().to_string();
    assert_eq!(planned_error, applied_error);
    assert!(planned_error.contains("duplicate graph node id duplicate"));
    let stored = repo.get_node_document("duplicate").unwrap().unwrap();
    assert_eq!(stored.body, "original");
    assert_eq!(stored.content_revision, 1);
}

#[test]
fn bulk_dry_run_and_atomic_apply_use_per_item_expected_revisions_for_seed_and_corpus_updates() {
    let (_dir, db) = temp_db();
    let repo = NodeDocumentRepository::new(db.connection());
    repo.apply_reconciliation(&input("seed", "s1", ContentOrigin::Seed, 1), None)
        .unwrap();
    repo.apply_reconciliation(
        &input("corpus", "c1", ContentOrigin::CorpusCompiled, 3),
        None,
    )
    .unwrap();
    let items = vec![
        DocumentReconciliationItem {
            document: input("seed", "s2", ContentOrigin::Seed, 2),
            expected_revision: Some(1),
        },
        DocumentReconciliationItem {
            document: input("corpus", "c2", ContentOrigin::CorpusCompiled, 4),
            expected_revision: Some(3),
        },
    ];
    assert!(repo
        .plan_bulk(&items)
        .unwrap()
        .iter()
        .all(|decision| decision.mutation == NodeDocumentMutation::Updated));
    assert_eq!(repo.get_node_document("seed").unwrap().unwrap().body, "s1");
    let applied = repo.apply_bulk(&items).unwrap();
    assert!(applied
        .iter()
        .all(|decision| decision.mutation == NodeDocumentMutation::Updated));
    assert_eq!(repo.get_node_document("seed").unwrap().unwrap().body, "s2");
    assert_eq!(
        repo.get_node_document("corpus").unwrap().unwrap().body,
        "c2"
    );
}

#[test]
fn bulk_apply_is_all_or_nothing_when_any_item_conflicts() {
    let (_dir, db) = temp_db();
    let repo = NodeDocumentRepository::new(db.connection());
    repo.apply_reconciliation(&input("a", "a1", ContentOrigin::Seed, 1), None)
        .unwrap();
    repo.apply_reconciliation(&input("b", "b1", ContentOrigin::Seed, 1), None)
        .unwrap();
    let items = vec![
        DocumentReconciliationItem {
            document: input("a", "a2", ContentOrigin::Seed, 2),
            expected_revision: Some(1),
        },
        DocumentReconciliationItem {
            document: input("b", "b2", ContentOrigin::Seed, 2),
            expected_revision: Some(0),
        },
    ];
    let decisions = repo.apply_bulk(&items).unwrap();
    assert!(matches!(
        decisions[1].mutation,
        NodeDocumentMutation::Conflict { .. }
    ));
    assert_eq!(repo.get_node_document("a").unwrap().unwrap().body, "a1");
    assert_eq!(repo.get_node_document("b").unwrap().unwrap().body, "b1");
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

#[test]
fn sync_acknowledgement_is_a_revision_and_origin_cas_without_revision_drift() {
    let (_dir, db) = temp_db();
    let repo = NodeDocumentRepository::new(db.connection());
    let mut document = input("n", "pending", ContentOrigin::UserAuthored, 8);
    document.neo4j_synced = false;
    repo.apply_reconciliation(&document, None).unwrap();
    insert_metadata(db.connection(), "n", 8);
    db.connection().execute("UPDATE graph_node_metadata SET content_origin='user_authored', sync_state='pending' WHERE graph_node_id='n'", []).unwrap();

    assert_eq!(
        repo.acknowledge_sync("n", 8, ContentOrigin::UserAuthored)
            .unwrap(),
        SyncAcknowledgementMutation::Updated
    );
    let stored = repo.get_node_document("n").unwrap().unwrap();
    assert!(stored.neo4j_synced);
    assert_eq!(stored.content_revision, 8);
    assert_eq!(
        repo.acknowledge_sync("n", 8, ContentOrigin::UserAuthored)
            .unwrap(),
        SyncAcknowledgementMutation::Preserved
    );
}

#[test]
fn stale_sync_acknowledgement_conflicts_and_leaves_newer_edit_pending() {
    let (_dir, db) = temp_db();
    let repo = NodeDocumentRepository::new(db.connection());
    let document = input("n", "rev8", ContentOrigin::UserAuthored, 8);
    repo.apply_reconciliation(&document, None).unwrap();
    insert_metadata(db.connection(), "n", 8);
    db.connection().execute("UPDATE graph_node_metadata SET content_origin='user_authored', sync_state='pending' WHERE graph_node_id='n'", []).unwrap();
    repo.apply_user_edit("n", "rev9", "face", 8).unwrap();

    assert!(matches!(
        repo.acknowledge_sync("n", 8, ContentOrigin::UserAuthored)
            .unwrap(),
        SyncAcknowledgementMutation::Conflict { .. }
    ));
    let stored = repo.get_node_document("n").unwrap().unwrap();
    assert_eq!(stored.content_revision, 9);
    assert!(!stored.neo4j_synced);
}

#[test]
fn durable_pending_sync_rows_preserve_authoritative_document_and_full_structure() {
    let (dir, db) = temp_db();
    let repo = NodeDocumentRepository::new(db.connection());
    let mut document = input("durable", "deep body", ContentOrigin::UserAuthored, 4);
    document.summary = "pithy face".into();
    document.body_source_coordinates = vec!["episode-2.md#body".into()];
    repo.apply_reconciliation_with_projection(
        &document,
        None,
        Some(&DocumentMetadataProjection {
            entity_type: "Event".into(),
            title: "Council of Nicaea".into(),
            schema_version: 3,
        }),
    )
    .unwrap();
    db.connection()
        .execute(
            "UPDATE graph_node_metadata SET
          coordinate='P4', source_coordinates_json='[\"canon.md#nicaea\"]',
          evidence_tags_json='[\"primary-source\"]', source_kind='historical_record',
          seed_schema_version=8, historicity='historical', claim_kind='fact',
          evidence_status='documented', temporal_role='occurred_at', place_coverage='resolved',
          ql_form='partial_positional_map', ql_unit_id='ql-nicaea', ql_arc='braided',
          ql_topology='klein', ql_schema_version=2,
          ql_source_coordinates_json='[\"ql.md#p4\"]', ql_completeness_status='partial',
          is_temporal=1, valid_from='0325-05-20', valid_to='0325-08-25', temporal_precision='day'
         WHERE graph_node_id='durable'",
            [],
        )
        .unwrap();

    let rows = repo.list_pending_syncs().unwrap();
    assert_eq!(rows.len(), 1);
    let row = &rows[0];
    assert_eq!(row.document.graph_node_id, document.graph_node_id);
    assert_eq!(row.document.body, document.body);
    assert_eq!(row.document.summary, document.summary);
    assert_eq!(row.document.content_origin, document.content_origin);
    assert_eq!(row.document.content_revision, document.content_revision);
    assert_eq!(
        row.document.body_source_coordinates,
        document.body_source_coordinates
    );
    assert!(!row.document.neo4j_synced);
    assert_eq!(row.structure.graph_node_id, "durable");
    assert_eq!(row.structure.entity_type.as_str(), "Event");
    assert_eq!(row.structure.title, "Council of Nicaea");
    assert_eq!(row.structure.coordinate.as_deref(), Some("P4"));
    assert_eq!(row.structure.source_coordinates, vec!["canon.md#nicaea"]);
    assert_eq!(row.structure.evidence_tags, vec!["primary-source"]);
    assert_eq!(
        row.structure.source_kind.as_deref(),
        Some("historical_record")
    );
    assert_eq!(row.structure.seed_schema_version, Some(8));
    assert_eq!(row.structure.historicity.unwrap().as_str(), "historical");
    assert_eq!(row.structure.claim_kind.unwrap().as_str(), "fact");
    assert_eq!(
        row.structure.evidence_status.unwrap().as_str(),
        "documented"
    );
    assert_eq!(row.structure.temporal_role.unwrap().as_str(), "occurred_at");
    assert_eq!(row.structure.place_coverage.unwrap().as_str(), "resolved");
    assert_eq!(
        row.structure.ql_form.unwrap().as_str(),
        "partial_positional_map"
    );
    assert_eq!(row.structure.ql_unit_id.as_deref(), Some("ql-nicaea"));
    assert_eq!(row.structure.ql_arc.unwrap().as_str(), "braided");
    assert_eq!(row.structure.ql_topology.unwrap().as_str(), "klein");
    assert_eq!(row.structure.ql_schema_version, Some(2));
    assert_eq!(row.structure.ql_source_coordinates, vec!["ql.md#p4"]);
    assert_eq!(
        row.structure.ql_completeness_status.unwrap().as_str(),
        "partial"
    );
    assert!(row.structure.is_temporal);
    assert_eq!(row.structure.valid_from.as_deref(), Some("0325-05-20"));
    assert_eq!(row.structure.valid_to.as_deref(), Some("0325-08-25"));
    assert_eq!(row.structure.temporal_precision.unwrap().as_str(), "day");

    drop(rows);
    drop(repo);
    drop(db);
    let command_rows = list_pending_node_document_syncs_at_path(
        dir.path().join("node_document.db").to_str().unwrap(),
    )
    .unwrap();
    assert_eq!(command_rows.len(), 1);
    assert_eq!(command_rows[0].document.body, "deep body");
    assert_eq!(command_rows[0].structure.entity_type.as_str(), "Event");
}

#[test]
fn durable_pending_sync_listing_heals_split_sync_flags_without_synthesizing_structure() {
    let (_dir, db) = temp_db();
    let repo = NodeDocumentRepository::new(db.connection());
    let mut document = input("split", "body", ContentOrigin::UserAuthored, 2);
    document.neo4j_synced = true;
    repo.apply_reconciliation_with_projection(
        &document,
        None,
        Some(&DocumentMetadataProjection {
            entity_type: "Work".into(),
            title: "Split".into(),
            schema_version: 1,
        }),
    )
    .unwrap();
    db.connection()
        .execute(
            "UPDATE graph_node_metadata SET sync_state='pending' WHERE graph_node_id='split'",
            [],
        )
        .unwrap();

    let rows = repo.list_pending_syncs().unwrap();
    assert_eq!(rows.len(), 1);
    assert!(rows[0].document.neo4j_synced);
    assert_eq!(rows[0].structure.title, "Split");
}

use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::graph::{
        ClaimKind, ContentOrigin, EntityType, EvidenceStatus, Historicity, PlaceCoverage, QlArc,
        QlCompletenessStatus, QlForm, QlTopology, TemporalPrecision, TemporalRole,
    },
    repositories::{
        GraphMetadataMutation, GraphNodeMetadataRecord, GraphNodeMetadataRepository,
        RepositoryError, SyncState,
    },
};
use std::sync::{Arc, Barrier};
use tempfile::tempdir;

fn record(revision: i64, origin: ContentOrigin) -> GraphNodeMetadataRecord {
    GraphNodeMetadataRecord {
        graph_node_id: "event-1".into(),
        entity_type: EntityType::Event,
        title: "Council convenes".into(),
        archetypal_resonance: None,
        coordinate: Some("#3".into()),
        source_coordinates: vec!["Episode 2/research.md#council".into()],
        evidence_tags: vec!["primary-source".into()],
        source_kind: Some("chronicle".into()),
        content_origin: origin,
        content_revision: revision,
        seed_schema_version: Some(2),
        body_source_coordinates: vec!["Episode 2/research.md#council".into()],
        historicity: Some(Historicity::Historical),
        claim_kind: Some(ClaimKind::Fact),
        evidence_status: Some(EvidenceStatus::Documented),
        temporal_role: Some(TemporalRole::OccurredAt),
        place_coverage: Some(PlaceCoverage::Resolved),
        ql_form: Some(QlForm::PartialPositionalMap),
        ql_unit_id: Some("ql-council".into()),
        ql_arc: Some(QlArc::Day),
        ql_topology: Some(QlTopology::Composite),
        ql_schema_version: Some(1),
        ql_source_coordinates: vec!["Canon/ql.md#3".into()],
        ql_completeness_status: Some(QlCompletenessStatus::Partial),
        is_temporal: true,
        valid_from: Some("1439".into()),
        valid_to: None,
        temporal_precision: Some(TemporalPrecision::Year),
        schema_version: 1,
        sync_state: SyncState::Pending,
        remote_revision: None,
    }
}

#[test]
fn metadata_round_trips_after_reopen_and_uses_explicit_revision_results() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("metadata.sqlite");
    {
        let db = Database::open(&path).unwrap();
        let repo = GraphNodeMetadataRepository::new(db.connection());
        assert_eq!(
            repo.save(&record(1, ContentOrigin::CorpusCompiled), None)
                .unwrap(),
            GraphMetadataMutation::Created
        );
        assert_eq!(
            repo.save(&record(1, ContentOrigin::CorpusCompiled), None)
                .unwrap(),
            GraphMetadataMutation::Preserved
        );
        let mut changed_same_revision = record(1, ContentOrigin::CorpusCompiled);
        changed_same_revision.title = "Unreviewed rewrite".into();
        assert!(matches!(
            repo.save(&changed_same_revision, None).unwrap(),
            GraphMetadataMutation::Conflict {
                current_revision: 1,
                ..
            }
        ));
        assert!(matches!(
            repo.save(&record(2, ContentOrigin::CorpusCompiled), Some(0))
                .unwrap(),
            GraphMetadataMutation::Conflict {
                current_revision: 1,
                ..
            }
        ));
        assert_eq!(
            repo.save(&record(2, ContentOrigin::CorpusCompiled), Some(1))
                .unwrap(),
            GraphMetadataMutation::Updated
        );
    }
    {
        let db = Database::open(&path).unwrap();
        let fetched = GraphNodeMetadataRepository::new(db.connection())
            .get("event-1")
            .unwrap()
            .unwrap();
        assert_eq!(fetched, record(2, ContentOrigin::CorpusCompiled));
    }
}

#[test]
fn metadata_preserves_user_authored_content_from_automated_origins() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("ownership.sqlite")).unwrap();
    let repo = GraphNodeMetadataRepository::new(db.connection());
    assert_eq!(
        repo.save(&record(7, ContentOrigin::UserAuthored), None)
            .unwrap(),
        GraphMetadataMutation::Created
    );
    assert_eq!(
        repo.save(&record(8, ContentOrigin::Seed), Some(7)).unwrap(),
        GraphMetadataMutation::Preserved
    );
    assert_eq!(
        repo.get("event-1").unwrap().unwrap().content_origin,
        ContentOrigin::UserAuthored
    );
}

#[test]
fn metadata_rejects_versions_outside_the_javascript_safe_integer_range() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("versions.sqlite")).unwrap();
    let repo = GraphNodeMetadataRepository::new(db.connection());
    assert!(matches!(
        repo.save(&record(-1, ContentOrigin::Seed), None),
        Err(RepositoryError::Validation(_))
    ));
    assert!(matches!(
        repo.save(&record(9_007_199_254_740_992, ContentOrigin::Seed), None),
        Err(RepositoryError::Validation(_))
    ));
    assert!(matches!(
        repo.save(&record(1, ContentOrigin::Seed), Some(-1)),
        Err(RepositoryError::Validation(_))
    ));
}

#[test]
fn concurrent_metadata_creates_and_updates_return_domain_conflicts_without_overwriting() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("metadata-race.sqlite");
    {
        let db = Database::open(&path).unwrap();
        db.connection()
            .execute_batch("PRAGMA journal_mode=WAL;")
            .unwrap();
    }
    let barrier = Arc::new(Barrier::new(2));
    let handles = ["First", "Second"].map(|title| {
        let path = path.clone();
        let barrier = barrier.clone();
        std::thread::spawn(move || {
            let db = Database::open(path).unwrap();
            let mut candidate = record(1, ContentOrigin::CorpusCompiled);
            candidate.title = title.into();
            barrier.wait();
            GraphNodeMetadataRepository::new(db.connection()).save(&candidate, None)
        })
    });
    let results = handles.map(|handle| {
        handle
            .join()
            .unwrap()
            .expect("domain result, never SQLite race error")
    });
    assert_eq!(
        results
            .iter()
            .filter(|r| matches!(r, GraphMetadataMutation::Created))
            .count(),
        1
    );
    assert_eq!(
        results
            .iter()
            .filter(|r| matches!(r, GraphMetadataMutation::Conflict { .. }))
            .count(),
        1
    );

    let barrier = Arc::new(Barrier::new(2));
    let handles = ["Update A", "Update B"].map(|title| {
        let path = path.clone();
        let barrier = barrier.clone();
        std::thread::spawn(move || {
            let db = Database::open(path).unwrap();
            let mut candidate = record(2, ContentOrigin::CorpusCompiled);
            candidate.title = title.into();
            barrier.wait();
            GraphNodeMetadataRepository::new(db.connection()).save(&candidate, Some(1))
        })
    });
    let results =
        handles.map(|handle| handle.join().unwrap().expect("CAS loss is a domain result"));
    assert_eq!(
        results
            .iter()
            .filter(|r| matches!(r, GraphMetadataMutation::Updated))
            .count(),
        1
    );
    assert_eq!(
        results
            .iter()
            .filter(|r| matches!(r, GraphMetadataMutation::Conflict { .. }))
            .count(),
        1
    );
    let db = Database::open(&path).unwrap();
    let stored = GraphNodeMetadataRepository::new(db.connection())
        .get("event-1")
        .unwrap()
        .unwrap();
    assert_eq!(stored.content_revision, 2);
    assert!(stored.title == "Update A" || stored.title == "Update B");
}

#[test]
fn held_write_lock_returns_typed_busy_not_semantic_conflict() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("busy.sqlite");
    let writer = Database::open(&path).unwrap();
    let contender = Database::open(&path).unwrap();
    writer
        .connection()
        .execute_batch("BEGIN IMMEDIATE;")
        .unwrap();
    let result = GraphNodeMetadataRepository::new(contender.connection())
        .save(&record(1, ContentOrigin::CorpusCompiled), None);
    writer.connection().execute_batch("ROLLBACK;").unwrap();
    assert!(matches!(result, Err(RepositoryError::Busy)));
}

#[test]
fn malformed_persisted_json_returns_typed_corrupt_data() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("corrupt.sqlite")).unwrap();
    let repo = GraphNodeMetadataRepository::new(db.connection());
    repo.save(&record(1, ContentOrigin::CorpusCompiled), None)
        .unwrap();
    db.connection()
        .execute_batch("PRAGMA ignore_check_constraints=ON;")
        .unwrap();
    db.connection()
        .execute(
            "UPDATE graph_node_metadata SET source_coordinates_json='{}' WHERE graph_node_id='event-1'",
            [],
        )
        .unwrap();
    assert!(matches!(
        repo.get("event-1"),
        Err(RepositoryError::CorruptData(_))
    ));
}

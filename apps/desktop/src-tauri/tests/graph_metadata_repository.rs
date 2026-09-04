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
        place: None,
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
        is_archetype: false,
    }
}

#[test]
fn place_projection_round_trips_through_the_local_metadata_store() {
    let dir = tempdir().unwrap();
    let database = Database::open(dir.path().join("place.sqlite")).unwrap();
    let mut incoming = record(7, ContentOrigin::CorpusCompiled);
    incoming.place = Some(
        serde_json::json!({
            "graphNodeId": "place-constantinople",
            "names": [
                { "language": "el", "name": "Κωνσταντινούπολις", "validFrom": "0330-05-11", "validTo": "1453-05-29" },
                { "language": "tr", "name": "İstanbul", "validFrom": "1453", "validTo": null }
            ],
            "coordinate": { "precision": "exact", "latitude": 41.0082, "longitude": 28.9784 },
            "hierarchy": [{ "parentPlaceId": "place-region", "relationValidFrom": "0330", "relationValidTo": null }],
            "identityValidFrom": "0330",
            "identityValidTo": null,
            "externalRefs": [{ "gazetteer": "pleiades", "id": "520998" }],
            "provenance": {
                "sourceRefs": [
                    { "artifactId": "transcript-001", "unit": { "kind": "text_span", "startOffset": 12, "endOffset": 34 } }
                ]
            }
        })
        .to_string(),
    );

    let repository = GraphNodeMetadataRepository::new(database.connection());
    assert_eq!(
        repository.save(&incoming, None).expect("save"),
        GraphMetadataMutation::Created
    );
    let persisted = repository
        .get("event-1")
        .expect("get")
        .expect("record exists");
    assert_eq!(persisted, incoming);

    // The column carries a json_valid CHECK, so corrupt projections cannot be
    // persisted even through raw SQL — the store fails closed by constraint.
    let invalid_write = database.connection().execute(
        "UPDATE graph_node_metadata SET place_json = 'not json' WHERE graph_node_id = 'event-1'",
        [],
    );
    assert!(invalid_write.is_err(), "json_valid CHECK must reject the write");
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

#[test]
fn seed_projection_uses_versioned_structure_and_atomic_ql_precedence() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("seed-precedence.sqlite")).unwrap();
    let repo = GraphNodeMetadataRepository::new(db.connection());

    let mut persisted = record(9, ContentOrigin::UserAuthored);
    persisted.seed_schema_version = Some(5);
    persisted.title = "persisted seed five".into();
    persisted.ql_schema_version = Some(7);
    persisted.ql_form = Some(QlForm::CompleteSixfold);
    persisted.ql_unit_id = Some("persisted-ql-seven".into());
    persisted.ql_arc = Some(QlArc::Night);
    persisted.ql_topology = Some(QlTopology::Klein);
    persisted.ql_source_coordinates = vec!["ql-seven.md".into()];
    persisted.ql_completeness_status = Some(QlCompletenessStatus::Complete);
    assert_eq!(
        repo.save(&persisted, None).unwrap(),
        GraphMetadataMutation::Created
    );

    let mut older = record(1, ContentOrigin::Seed);
    older.seed_schema_version = Some(4);
    older.title = "older bootstrap".into();
    older.ql_schema_version = Some(6);
    older.ql_unit_id = Some("older-ql-six".into());
    assert_eq!(
        repo.ensure_seed_projection(&older).unwrap(),
        GraphMetadataMutation::Preserved
    );
    assert_eq!(repo.get("event-1").unwrap().unwrap(), persisted);

    let mut newer_seed_older_ql = record(1, ContentOrigin::Seed);
    newer_seed_older_ql.seed_schema_version = Some(6);
    newer_seed_older_ql.title = "canonical seed six".into();
    newer_seed_older_ql.source_coordinates = vec!["seed-six.md".into()];
    newer_seed_older_ql.ql_schema_version = Some(6);
    newer_seed_older_ql.ql_form = Some(QlForm::Quaternity);
    newer_seed_older_ql.ql_unit_id = Some("incoming-ql-six".into());
    newer_seed_older_ql.ql_arc = Some(QlArc::Day);
    newer_seed_older_ql.ql_topology = Some(QlTopology::Torus);
    newer_seed_older_ql.ql_source_coordinates = vec!["ql-six.md".into()];
    newer_seed_older_ql.ql_completeness_status = Some(QlCompletenessStatus::Partial);
    assert_eq!(
        repo.ensure_seed_projection(&newer_seed_older_ql).unwrap(),
        GraphMetadataMutation::Updated
    );
    let upgraded = repo.get("event-1").unwrap().unwrap();
    assert_eq!(upgraded.title, "canonical seed six");
    assert_eq!(upgraded.seed_schema_version, Some(6));
    assert_eq!(upgraded.source_coordinates, vec!["seed-six.md"]);
    assert_eq!(upgraded.content_origin, ContentOrigin::UserAuthored);
    assert_eq!(upgraded.content_revision, 9);
    assert_eq!(upgraded.ql_schema_version, Some(7));
    assert_eq!(upgraded.ql_form, Some(QlForm::CompleteSixfold));
    assert_eq!(upgraded.ql_unit_id.as_deref(), Some("persisted-ql-seven"));
    assert_eq!(upgraded.ql_arc, Some(QlArc::Night));
    assert_eq!(upgraded.ql_topology, Some(QlTopology::Klein));
    assert_eq!(upgraded.ql_source_coordinates, vec!["ql-seven.md"]);
    assert_eq!(
        upgraded.ql_completeness_status,
        Some(QlCompletenessStatus::Complete)
    );

    let mut newer_ql = newer_seed_older_ql.clone();
    newer_ql.seed_schema_version = Some(6);
    newer_ql.ql_schema_version = Some(8);
    newer_ql.ql_form = Some(QlForm::DoubleHelix);
    newer_ql.ql_unit_id = None;
    newer_ql.ql_arc = Some(QlArc::Braided);
    newer_ql.ql_topology = Some(QlTopology::Composite);
    newer_ql.ql_source_coordinates = vec!["ql-eight.md".into()];
    newer_ql.ql_completeness_status = Some(QlCompletenessStatus::Incomplete);
    repo.ensure_seed_projection(&newer_ql).unwrap();
    let replaced = repo.get("event-1").unwrap().unwrap();
    assert_eq!(replaced.ql_schema_version, Some(8));
    assert_eq!(replaced.ql_form, Some(QlForm::DoubleHelix));
    assert_eq!(replaced.ql_unit_id, None);
    assert_eq!(replaced.ql_arc, Some(QlArc::Braided));
    assert_eq!(replaced.ql_topology, Some(QlTopology::Composite));
    assert_eq!(replaced.ql_source_coordinates, vec!["ql-eight.md"]);
    assert_eq!(
        replaced.ql_completeness_status,
        Some(QlCompletenessStatus::Incomplete)
    );

    let mut equal_ql = newer_ql.clone();
    equal_ql.ql_form = Some(QlForm::OtherExplicit);
    equal_ql.ql_unit_id = Some("equal-version-incoming".into());
    equal_ql.ql_arc = Some(QlArc::NotApplicable);
    equal_ql.ql_topology = Some(QlTopology::Unspecified);
    equal_ql.ql_source_coordinates = vec!["equal-eight.md".into()];
    equal_ql.ql_completeness_status = Some(QlCompletenessStatus::NotApplicable);
    repo.ensure_seed_projection(&equal_ql).unwrap();
    let equal_ql_stored = repo.get("event-1").unwrap().unwrap();
    assert_eq!(equal_ql_stored.ql_schema_version, Some(8));
    assert_eq!(equal_ql_stored.ql_form, Some(QlForm::OtherExplicit));
    assert_eq!(
        equal_ql_stored.ql_unit_id.as_deref(),
        Some("equal-version-incoming")
    );
    assert_eq!(equal_ql_stored.ql_arc, Some(QlArc::NotApplicable));
    assert_eq!(equal_ql_stored.ql_topology, Some(QlTopology::Unspecified));
    assert_eq!(
        equal_ql_stored.ql_source_coordinates,
        vec!["equal-eight.md"]
    );
    assert_eq!(
        equal_ql_stored.ql_completeness_status,
        Some(QlCompletenessStatus::NotApplicable)
    );

    let mut absent_ql_equal_seed = equal_ql.clone();
    absent_ql_equal_seed.title = "equal seed deterministically incoming".into();
    absent_ql_equal_seed.ql_schema_version = None;
    absent_ql_equal_seed.ql_form = None;
    absent_ql_equal_seed.ql_unit_id = None;
    absent_ql_equal_seed.ql_arc = None;
    absent_ql_equal_seed.ql_topology = None;
    absent_ql_equal_seed.ql_source_coordinates.clear();
    absent_ql_equal_seed.ql_completeness_status = None;
    repo.ensure_seed_projection(&absent_ql_equal_seed).unwrap();
    let equal = repo.get("event-1").unwrap().unwrap();
    assert_eq!(equal.title, "equal seed deterministically incoming");
    assert_eq!(equal.ql_schema_version, Some(8));
    assert_eq!(equal.ql_form, Some(QlForm::OtherExplicit));
    assert_eq!(equal.ql_unit_id.as_deref(), Some("equal-version-incoming"));
    assert_eq!(equal.ql_source_coordinates, vec!["equal-eight.md"]);
}

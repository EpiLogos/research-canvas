use research_canvas_desktop_lib::db::repositories::graph::{ContentOrigin, EntityType};
use research_canvas_desktop_lib::db::repositories::{GraphNodeMetadataRecord, SyncState};
use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{
        GraphNodeMetadataRepository, RepositoryError, TimelineLayoutMutation, TimelineLayoutRecord,
        TimelineLayoutRepository,
    },
};
use std::sync::{Arc, Barrier};
use tempfile::tempdir;

fn metadata() -> GraphNodeMetadataRecord {
    GraphNodeMetadataRecord {
        graph_node_id: "event-1".into(),
        entity_type: EntityType::Event,
        title: "Event".into(),
        archetypal_resonance: None,
        coordinate: None,
        source_coordinates: vec![],
        evidence_tags: vec![],
        source_kind: None,
        content_origin: ContentOrigin::CorpusCompiled,
        content_revision: 1,
        seed_schema_version: None,
        body_source_coordinates: vec![],
        historicity: None,
        claim_kind: None,
        evidence_status: None,
        temporal_role: None,
        place_coverage: None,
        ql_form: None,
        ql_unit_id: None,
        ql_arc: None,
        ql_topology: None,
        ql_schema_version: None,
        ql_source_coordinates: vec![],
        ql_completeness_status: None,
        is_temporal: true,
        valid_from: Some("1439".into()),
        valid_to: None,
        temporal_precision: None,
        schema_version: 1,
        sync_state: SyncState::Pending,
        remote_revision: None,
    }
}

fn layout(lane: &str) -> TimelineLayoutRecord {
    TimelineLayoutRecord {
        graph_node_id: "event-1".into(),
        lane: lane.into(),
        offset_y: 18.0,
        width: 320.0,
        height: 144.0,
        style_json: serde_json::json!({"color":"ochre"}),
        layout_revision: 0,
        created_at: None,
        updated_at: None,
    }
}

#[test]
fn timeline_layout_round_trips_and_requires_monotonic_expected_revision() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("timeline.sqlite");
    let revision;
    {
        let db = Database::open(&path).unwrap();
        GraphNodeMetadataRepository::new(db.connection())
            .save(&metadata(), None)
            .unwrap();
        let repo = TimelineLayoutRepository::new(db.connection());
        assert_eq!(
            repo.save(&layout("events"), None).unwrap(),
            TimelineLayoutMutation::Created
        );
        assert_eq!(
            repo.save(&layout("events"), None).unwrap(),
            TimelineLayoutMutation::Preserved
        );
        let mut changed = layout("politics");
        assert!(matches!(
            repo.save(&changed, None).unwrap(),
            TimelineLayoutMutation::Conflict { .. }
        ));
        revision = repo.get("event-1").unwrap().unwrap().layout_revision;
        assert_eq!(
            repo.save(&changed, Some(revision)).unwrap(),
            TimelineLayoutMutation::Updated
        );
        assert_eq!(repo.get("event-1").unwrap().unwrap().layout_revision, 1);
        changed.lane = "religion".into();
        assert!(matches!(
            repo.save(&changed, Some(0)).unwrap(),
            TimelineLayoutMutation::Conflict { .. }
        ));
        assert_eq!(
            repo.save(&changed, Some(1)).unwrap(),
            TimelineLayoutMutation::Updated
        );
        assert_eq!(repo.get("event-1").unwrap().unwrap().layout_revision, 2);
        changed.lane = "culture".into();
        assert!(matches!(
            repo.save(&changed, Some(1)).unwrap(),
            TimelineLayoutMutation::Conflict {
                current_revision: 2,
                ..
            }
        ));
    }
    let db = Database::open(&path).unwrap();
    let stored = TimelineLayoutRepository::new(db.connection())
        .get("event-1")
        .unwrap()
        .unwrap();
    assert_eq!(stored.lane, "religion");
    assert_eq!(stored.layout_revision, 2);
    assert_eq!(stored.offset_y, 18.0);
    assert_eq!(stored.width, 320.0);
    assert_eq!(stored.style_json, serde_json::json!({"color":"ochre"}));
}

#[test]
fn timeline_layout_rejects_non_finite_or_non_positive_geometry() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("invalid-layout.sqlite")).unwrap();
    GraphNodeMetadataRepository::new(db.connection())
        .save(&metadata(), None)
        .unwrap();
    let repo = TimelineLayoutRepository::new(db.connection());
    let mut invalid = layout("events");
    invalid.offset_y = f64::INFINITY;
    assert!(matches!(
        repo.save(&invalid, None),
        Err(RepositoryError::Validation(_))
    ));
    invalid.offset_y = 0.0;
    invalid.width = 0.0;
    assert!(matches!(
        repo.save(&invalid, None),
        Err(RepositoryError::Validation(_))
    ));
}

#[test]
fn timeline_repository_distinguishes_storage_and_corrupt_data_errors() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("timeline-errors.sqlite")).unwrap();
    let repo = TimelineLayoutRepository::new(db.connection());
    assert!(matches!(
        repo.save(&layout("events"), None),
        Err(RepositoryError::Storage(_))
    ));

    GraphNodeMetadataRepository::new(db.connection())
        .save(&metadata(), None)
        .unwrap();
    repo.save(&layout("events"), None).unwrap();
    db.connection()
        .execute_batch("PRAGMA ignore_check_constraints=ON;")
        .unwrap();
    db.connection()
        .execute(
            "UPDATE timeline_layout SET style_json='[]' WHERE graph_node_id='event-1'",
            [],
        )
        .unwrap();
    assert!(matches!(
        repo.get("event-1"),
        Err(RepositoryError::CorruptData(_))
    ));
}

#[test]
fn concurrent_timeline_creates_return_domain_results_without_overwriting() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("timeline-race.sqlite");
    {
        let db = Database::open(&path).unwrap();
        db.connection()
            .execute_batch("PRAGMA journal_mode=WAL;")
            .unwrap();
        GraphNodeMetadataRepository::new(db.connection())
            .save(&metadata(), None)
            .unwrap();
    }
    let barrier = Arc::new(Barrier::new(2));
    let handles = ["events", "politics"].map(|lane| {
        let path = path.clone();
        let barrier = barrier.clone();
        std::thread::spawn(move || {
            let db = Database::open(path).unwrap();
            let candidate = layout(lane);
            barrier.wait();
            TimelineLayoutRepository::new(db.connection()).save(&candidate, None)
        })
    });
    let results = handles.map(|h| {
        h.join()
            .unwrap()
            .expect("domain result, never SQLite uniqueness error")
    });
    assert_eq!(
        results
            .iter()
            .filter(|r| matches!(r, TimelineLayoutMutation::Created))
            .count(),
        1
    );
    assert_eq!(
        results
            .iter()
            .filter(|r| matches!(r, TimelineLayoutMutation::Conflict { .. }))
            .count(),
        1
    );
    let db = Database::open(&path).unwrap();
    let stored = TimelineLayoutRepository::new(db.connection())
        .get("event-1")
        .unwrap()
        .unwrap();
    assert!(stored.lane == "events" || stored.lane == "politics");
}

#[test]
fn concurrent_timeline_updates_return_one_update_and_one_conflict() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("timeline-update-race.sqlite");
    let revision = {
        let db = Database::open(&path).unwrap();
        db.connection()
            .execute_batch("PRAGMA journal_mode=WAL;")
            .unwrap();
        GraphNodeMetadataRepository::new(db.connection())
            .save(&metadata(), None)
            .unwrap();
        let repo = TimelineLayoutRepository::new(db.connection());
        repo.save(&layout("events"), None).unwrap();
        repo.get("event-1").unwrap().unwrap().layout_revision
    };
    let barrier = Arc::new(Barrier::new(2));
    let handles = ["politics", "religion"].map(|lane| {
        let path = path.clone();
        let revision = revision;
        let barrier = barrier.clone();
        std::thread::spawn(move || {
            let db = Database::open(path).unwrap();
            let candidate = layout(lane);
            barrier.wait();
            TimelineLayoutRepository::new(db.connection()).save(&candidate, Some(revision))
        })
    });
    let results =
        handles.map(|handle| handle.join().unwrap().expect("CAS loss is a domain result"));
    assert_eq!(
        results
            .iter()
            .filter(|result| matches!(result, TimelineLayoutMutation::Updated))
            .count(),
        1
    );
    assert_eq!(
        results
            .iter()
            .filter(|result| matches!(result, TimelineLayoutMutation::Conflict { .. }))
            .count(),
        1
    );
    let db = Database::open(&path).unwrap();
    let stored = TimelineLayoutRepository::new(db.connection())
        .get("event-1")
        .unwrap()
        .unwrap();
    assert!(stored.lane == "politics" || stored.lane == "religion");
}

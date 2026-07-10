use research_canvas_desktop_lib::db::repositories::graph::{ContentOrigin, EntityType};
use research_canvas_desktop_lib::db::repositories::{GraphNodeMetadataRecord, SyncState};
use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{
        GraphNodeMetadataRepository, TimelineLayoutMutation, TimelineLayoutRecord,
        TimelineLayoutRepository,
    },
};
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
        created_at: None,
        updated_at: None,
    }
}

#[test]
fn timeline_layout_round_trips_and_requires_explicit_conflict_token() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("timeline.sqlite");
    let token;
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
        token = repo.get("event-1").unwrap().unwrap().updated_at.unwrap();
        assert_eq!(
            repo.save(&changed, Some(&token)).unwrap(),
            TimelineLayoutMutation::Updated
        );
        assert_ne!(
            repo.get("event-1").unwrap().unwrap().updated_at.as_deref(),
            Some(token.as_str()),
            "every accepted mutation advances the concurrency token"
        );
        changed.lane = "religion".into();
        assert!(matches!(
            repo.save(&changed, Some("stale-token")).unwrap(),
            TimelineLayoutMutation::Conflict { .. }
        ));
    }
    let db = Database::open(&path).unwrap();
    let stored = TimelineLayoutRepository::new(db.connection())
        .get("event-1")
        .unwrap()
        .unwrap();
    assert_eq!(stored.lane, "politics");
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
    assert!(repo.save(&invalid, None).is_err());
    invalid.offset_y = 0.0;
    invalid.width = 0.0;
    assert!(repo.save(&invalid, None).is_err());
}

use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{
        RepositoryError, SceneAssembler, ScenePlaceFrame, SceneRecord, SceneRepository,
        SceneSequenceRecord, SceneTimeWindow,
    },
};
use tempfile::tempdir;

fn scene(id: &str, profile: &str) -> SceneRecord {
    SceneRecord {
        id: id.into(),
        profile_scope: profile.into(),
        place_frame: ScenePlaceFrame {
            place_id: "place-istanbul".into(),
            valid_at: serde_json::json!({ "instant": "2021-07-14" }),
        },
        time_window: SceneTimeWindow {
            start: "2021-07-01".into(),
            end: "2021-08-01".into(),
        },
        people: vec![serde_json::json!({
            "graphNodeId": "figure-aya",
            "role": "storyteller",
        })],
        passages: vec![serde_json::json!({
            "artifactId": "recording-001",
            "unit": { "kind": "timestamp_range", "startMs": 12000, "endMs": 45000 },
        })],
        consents: vec![serde_json::json!({
            "passageRef": {
                "artifactId": "recording-001",
                "unit": { "kind": "timestamp_range", "startMs": 12000, "endMs": 45000 }
            },
            "state": "captured",
            "scope": "publication",
            "capturedAt": "2026-08-08T10:00:00.000Z"
        })],
        redactions: vec![],
        language_variants: vec![serde_json::json!({
            "id": "variant-ar-1",
            "language": "ar",
            "kind": "voice_passage_translation",
        })],
        title: Some("Arrival".into()),
        narration: None,
        assembled_by: SceneAssembler::Agent,
        curation_events: vec![serde_json::json!({ "type": "pin" })],
        nested_sequence_ids: vec![],
        created_at: String::new(),
        updated_at: String::new(),
    }
}

#[test]
fn scene_round_trips_through_the_profile_store() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("scenes.sqlite")).unwrap();
    let repository = SceneRepository::new(db.connection());

    let created = repository
        .create(scene("scene-arrival", "migration"))
        .expect("create scene");
    assert_eq!(created.created_at, created.updated_at);

    let fetched = repository
        .get_by_id("scene-arrival")
        .expect("get")
        .expect("scene exists");
    assert_eq!(fetched, created);
    assert_eq!(
        fetched.passages[0]["unit"]["kind"],
        "timestamp_range"
    );

    let list = repository
        .list_for_profile("migration")
        .expect("list migration");
    assert_eq!(list.len(), 1);
    assert!(repository.list_for_profile("bootstrapping").unwrap().is_empty());
}

#[test]
fn scene_rejects_malformed_place_frames_and_assemblers() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("scenes-invalid.sqlite")).unwrap();
    let repository = SceneRepository::new(db.connection());

    let mut bad_frame = scene("scene-bad-frame", "migration");
    bad_frame.place_frame.valid_at = serde_json::json!({ "start": "2021-07-01" });
    let error = repository
        .create(bad_frame)
        .expect_err("validAt without instant or end must be rejected");
    assert!(matches!(error, RepositoryError::Validation(_)));

    let mut bad_assembler = scene("scene-bad-assembler", "migration");
    bad_assembler.assembled_by = SceneAssembler::Human;
    bad_assembler.people = vec![serde_json::json!("not-an-object")];
    let error = repository
        .create(bad_assembler)
        .expect_err("non-object people entries must be rejected");
    assert!(matches!(error, RepositoryError::Validation(_)));
}

#[test]
fn sequence_round_trips_and_rejects_duplicates() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("sequences.sqlite")).unwrap();
    let repository = SceneRepository::new(db.connection());

    let created = repository
        .create_sequence(SceneSequenceRecord {
            id: "sequence-journey".into(),
            profile_scope: "migration".into(),
            name: Some("The journey".into()),
            scene_ids: vec![
                "scene-origin".into(),
                "scene-transit".into(),
                "scene-destination".into(),
            ],
            sub_timeline_id: Some("timeline-route".into()),
            created_at: String::new(),
            updated_at: String::new(),
        })
        .expect("create sequence");

    let fetched = repository
        .get_sequence_by_id("sequence-journey")
        .expect("get")
        .expect("sequence exists");
    assert_eq!(fetched, created);
    assert_eq!(
        repository.list_sequences_for_profile("migration").unwrap().len(),
        1
    );

    let mut duplicated = created.clone();
    duplicated.scene_ids.push("scene-origin".into());
    let error = repository
        .update_sequence(&duplicated)
        .expect_err("duplicate scenes must be rejected");
    assert!(matches!(error, RepositoryError::Validation(_)));
}

#[test]
fn sqlite_guards_reject_non_string_sequence_id_arrays() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("scene-guards.sqlite")).unwrap();

    let raw_insert = db.connection().execute(
        "INSERT INTO scenes (id, profile_scope, place_frame_json, time_window_json, people_json,
         passages_json, language_variants_json, assembled_by, curation_events_json,
         nested_sequence_ids_json)
         VALUES ('guard-scene', 'migration', '{\"placeId\":\"p\",\"validAt\":{\"instant\":\"2021-07-14\"}}',
         '{\"start\":\"2021-07-01\",\"end\":\"2021-08-01\"}', '[]', '[]', '[]', 'agent', '[]',
         '[42]')",
        [],
    );
    assert!(raw_insert.is_err(), "trigger must reject non-string sequence ids");
}

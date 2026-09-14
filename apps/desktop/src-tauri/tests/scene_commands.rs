use research_canvas_desktop_lib::{
    commands::scenes::{
        delete_scene_at, delete_scene_sequence_at, list_scene_sequences_at, list_scenes_at,
        upsert_scene_at, upsert_scene_sequence_at,
    },
    db::repositories::{
        SceneAssembler, ScenePlaceFrame, SceneRecord, SceneSequenceRecord, SceneTimeWindow,
    },
};
use tempfile::tempdir;

fn scene(id: &str, profile: &str) -> SceneRecord {
    SceneRecord {
        id: id.into(),
        profile_scope: profile.into(),
        place_frame: ScenePlaceFrame {
            place_id: "pleiades:520998".into(),
            valid_at: serde_json::json!({ "instant": "2021-07-14" }),
        },
        time_window: SceneTimeWindow {
            start: "2021-07-01".into(),
            end: "2021-08-01".into(),
        },
        people: vec![],
        passages: vec![serde_json::json!({
            "artifactId": "recording-001",
            "unit": { "kind": "timestamp_range", "startMs": 12000, "endMs": 45000 },
        })],
        consents: vec![],
        redactions: vec![],
        language_variants: vec![],
        title: Some("Arrival".into()),
        narration: None,
        assembled_by: SceneAssembler::Agent,
        curation_events: vec![],
        nested_sequence_ids: vec![],
        created_at: String::new(),
        updated_at: String::new(),
    }
}

fn sequence(id: &str, profile: &str, scene_ids: Vec<&str>) -> SceneSequenceRecord {
    SceneSequenceRecord {
        id: id.into(),
        profile_scope: profile.into(),
        name: Some("Journey".into()),
        scene_ids: scene_ids.into_iter().map(ToOwned::to_owned).collect(),
        sub_timeline_id: None,
        created_at: String::new(),
        updated_at: String::new(),
    }
}

#[test]
fn scene_commands_round_trip_through_a_real_profile_store() {
    let dir = tempdir().unwrap();
    let database_path = dir.path().join("scenes.sqlite");
    let database_path = database_path.to_string_lossy().to_string();

    let created = upsert_scene_at(&database_path, scene("scene-arrival", "migration"))
        .expect("create scene through command");
    assert!(!created.created_at.is_empty());

    let updated = upsert_scene_at(
        &database_path,
        SceneRecord {
            narration: Some("I crossed in July.".into()),
            ..created.clone()
        },
    )
    .expect("update scene through command");
    assert_eq!(updated.narration.as_deref(), Some("I crossed in July."));
    assert!(updated.updated_at >= created.updated_at);

    let listed = list_scenes_at(&database_path, "migration").expect("list scenes");
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, "scene-arrival");
    assert!(
        list_scenes_at(&database_path, "bootstrapping")
            .expect("list other profile")
            .is_empty()
    );

    let sequence = upsert_scene_sequence_at(
        &database_path,
        sequence("journey-1", "migration", vec!["scene-arrival"]),
    )
    .expect("create sequence through command");
    assert_eq!(sequence.scene_ids, vec!["scene-arrival"]);

    let sequences = list_scene_sequences_at(&database_path, "migration").expect("list sequences");
    assert_eq!(sequences.len(), 1);

    delete_scene_sequence_at(&database_path, "journey-1").expect("delete sequence");
    assert!(
        list_scene_sequences_at(&database_path, "migration")
            .expect("list after delete")
            .is_empty()
    );

    delete_scene_at(&database_path, "scene-arrival").expect("delete scene");
    assert!(
        list_scenes_at(&database_path, "migration")
            .expect("list after delete")
            .is_empty()
    );
}

#[test]
fn scene_commands_reject_blank_database_paths() {
    let error = upsert_scene_at("", scene("scene-x", "migration")).expect_err("must reject");
    assert!(error.contains("databasePath"));
}

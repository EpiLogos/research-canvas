use research_canvas_desktop_lib::{
    commands::palace::{load_palace_curation_at, save_palace_curation_at},
    db::{
        connection::Database,
        repositories::PalaceRepository,
    },
};
use tempfile::tempdir;

#[test]
fn palace_curation_round_trips_through_the_profile_store() {
    let dir = tempdir().unwrap();
    let database_path = dir.path().join("palace.sqlite");
    let database_path = database_path.to_string_lossy().to_string();

    let curation = serde_json::json!({
        "chambers": [
            {
                "candidateId": "chamber:n1",
                "anchorGraphNodeId": "n1",
                "title": "Monopoly mechanism (archetype)",
                "pinned": true,
                "excluded": false,
                "position": 0
            }
        ]
    });

    let saved = save_palace_curation_at(&database_path, "bootstrapping", curation.clone())
        .expect("save curation");
    assert_eq!(saved.curation.as_ref().unwrap()["chambers"][0]["pinned"], true);

    let loaded = load_palace_curation_at(&database_path, "bootstrapping")
        .expect("load curation");
    assert_eq!(loaded.curation, Some(curation));

    // A second profile stays independent.
    assert!(
        load_palace_curation_at(&database_path, "migration")
            .expect("load other profile")
            .curation
            .is_none()
    );
}

#[test]
fn palace_repository_rejects_non_object_curation() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("palace.sqlite")).unwrap();
    let repo = PalaceRepository::new(db.connection());

    let error = repo
        .save("bootstrapping", &serde_json::json!(["not", "an", "object"]))
        .expect_err("array curation rejected");
    assert!(error.to_string().contains("JSON object"));

    let error = repo
        .save("", &serde_json::json!({}))
        .expect_err("blank profile rejected");
    assert!(error.to_string().contains("profileScope"));
}

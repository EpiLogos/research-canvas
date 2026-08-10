use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{
        GeographyEdgeMode, GeographyEdgeRecord, GeographyEdgeRepository, RepositoryError,
    },
};
use tempfile::tempdir;

fn voc_lane(id: &str, profile: &str) -> GeographyEdgeRecord {
    GeographyEdgeRecord {
        id: id.into(),
        profile_scope: profile.into(),
        mode: GeographyEdgeMode::Shipping,
        source_place_id: "root-archetypal-field:place-amsterdam".into(),
        target_place_id: "root-archetypal-field:place-banda-islands".into(),
        label: "VOC shipping lane Amsterdam → Banda".into(),
        time_window: serde_json::json!({
            "start": "1602-03-20",
            "end": "1621-05-08",
        }),
        geometry: serde_json::json!({
            "type": "LineString",
            "coordinates": [
                [4.8936, 52.3728],
                [129.9, -4.55],
            ],
        }),
        provenance: serde_json::json!({
            "sourceRefs": [{
                "artifactId": "antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/Research/Report8.md",
                "unit": { "kind": "text_span", "startOffset": 2098, "endOffset": 2450 }
            }]
        }),
        seed_key: "voc:amsterdam-to-banda".into(),
        created_at: String::new(),
        updated_at: String::new(),
    }
}

#[test]
fn geography_edge_round_trips_through_the_profile_store() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("geography-edges.sqlite")).unwrap();
    let repository = GeographyEdgeRepository::new(db.connection());

    let created = repository
        .create(voc_lane("geo-voc", "bootstrapping"))
        .expect("create geography edge");
    assert_eq!(created.created_at, created.updated_at);

    let fetched = repository
        .get_by_id("geo-voc")
        .expect("get")
        .expect("edge exists");
    assert_eq!(fetched, created);
    assert_eq!(fetched.mode.as_str(), "shipping");
    assert_eq!(
        fetched.geometry["coordinates"][1],
        serde_json::json!([129.9, -4.55])
    );

    let list = repository
        .list_for_profile("bootstrapping")
        .expect("list bootstrapping");
    assert_eq!(list.len(), 1);
    assert!(repository
        .list_for_profile("migration")
        .unwrap()
        .is_empty());

    // find_by_seed_key supports idempotent corpus seeding.
    let by_seed = repository
        .find_by_seed_key("bootstrapping", "voc:amsterdam-to-banda")
        .expect("find by seed key")
        .expect("lane exists by seed key");
    assert_eq!(by_seed.id, "geo-voc");

    // update round-trips; sleep so the updated_at stamp advances past created_at.
    std::thread::sleep(std::time::Duration::from_millis(5));
    let mut updated = created.clone();
    updated.label = "VOC nutmeg route Amsterdam → Banda".into();
    let saved = repository.update(&updated).expect("update");
    assert_eq!(saved.label, "VOC nutmeg route Amsterdam → Banda");
    assert_ne!(saved.updated_at, saved.created_at);

    assert!(repository.delete("geo-voc").expect("delete"));
    assert!(!repository.delete("geo-voc").expect("delete missing"));
    assert!(repository.get_by_id("geo-voc").unwrap().is_none());
}

#[test]
fn geography_edge_rejects_malformed_records() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("geography-edges-invalid.sqlite")).unwrap();
    let repository = GeographyEdgeRepository::new(db.connection());

    let mut blank_place = voc_lane("geo-blank", "bootstrapping");
    blank_place.target_place_id = "   ".into();
    let error = repository
        .create(blank_place)
        .expect_err("blank target place must be rejected");
    assert!(matches!(error, RepositoryError::Validation(_)));

    let mut empty_provenance = voc_lane("geo-no-provenance", "bootstrapping");
    empty_provenance.provenance = serde_json::json!({ "sourceRefs": [] });
    let error = repository
        .create(empty_provenance)
        .expect_err("empty provenance must be rejected");
    assert!(matches!(error, RepositoryError::Validation(_)));

    let mut not_line = voc_lane("geo-not-line", "bootstrapping");
    not_line.geometry = serde_json::json!({ "type": "Point", "coordinates": [4.8936, 52.3728] });
    let error = repository
        .create(not_line)
        .expect_err("non-LineString geometry must be rejected");
    assert!(matches!(error, RepositoryError::Validation(_)));

    let mut out_of_range = voc_lane("geo-out-of-range", "bootstrapping");
    out_of_range.geometry = serde_json::json!({
        "type": "LineString",
        "coordinates": [[4.8936, 52.3728], [190.0, 0.0]],
    });
    let error = repository
        .create(out_of_range)
        .expect_err("out-of-range longitude must be rejected");
    assert!(matches!(error, RepositoryError::Validation(_)));

    let mut inverted = voc_lane("geo-inverted-window", "bootstrapping");
    inverted.time_window = serde_json::json!({ "start": "1621-05-08", "end": "1602-03-20" });
    let error = repository
        .create(inverted)
        .expect_err("inverted time window must be rejected");
    assert!(matches!(error, RepositoryError::Validation(_)));
}

#[test]
fn sqlite_guards_enforce_mode_and_seed_key_uniqueness() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("geography-edge-guards.sqlite")).unwrap();
    let repository = GeographyEdgeRepository::new(db.connection());

    repository
        .create(voc_lane("geo-guard-1", "bootstrapping"))
        .expect("first lane");

    // The mode CHECK constraint rejects an invalid mode at the SQL boundary.
    let bad_mode = db.connection().execute(
        "INSERT INTO geography_edges (
         id, profile_scope, mode, source_place_id, target_place_id, label,
         time_window_json, geometry_json, provenance_json, seed_key)
         VALUES ('geo-guard-bad-mode', 'bootstrapping', 'balloon', 'a', 'b', 'label',
         '{\"start\":\"1602\",\"end\":\"1621\"}',
         '{\"type\":\"LineString\",\"coordinates\":[[0,0],[1,1]]}',
         '{\"sourceRefs\":[{\"artifactId\":\"x\",\"unit\":{\"kind\":\"text_span\",\"startOffset\":0,\"endOffset\":1}}]}',
         'bad-mode')",
        [],
    );
    assert!(bad_mode.is_err(), "mode CHECK must reject unknown modes");

    // The (profile_scope, seed_key) unique index makes corpus seeding idempotent.
    let duplicate = db.connection().execute(
        "INSERT INTO geography_edges (
         id, profile_scope, mode, source_place_id, target_place_id, label,
         time_window_json, geometry_json, provenance_json, seed_key)
         VALUES ('geo-guard-dup', 'bootstrapping', 'shipping', 'a', 'b', 'label',
         '{\"start\":\"1602\",\"end\":\"1621\"}',
         '{\"type\":\"LineString\",\"coordinates\":[[0,0],[1,1]]}',
         '{\"sourceRefs\":[{\"artifactId\":\"x\",\"unit\":{\"kind\":\"text_span\",\"startOffset\":0,\"endOffset\":1}}]}',
         'voc:amsterdam-to-banda')",
        [],
    );
    assert!(duplicate.is_err(), "seed key uniqueness must reject a second copy");
}

use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{CanvasRepository, ConstellationRepository},
};
use tempfile::{tempdir, TempDir};

fn open_temp_database() -> (TempDir, Database) {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("research-canvas.sqlite");
    let database = Database::open(&path).expect("database open");
    (dir, database)
}

#[test]
fn constellation_repository_creates_constellations_with_primary_canvases_and_reloads_them() {
    let (_dir, database) = open_temp_database();
    let constellations = ConstellationRepository::new(database.connection());
    let canvases = CanvasRepository::new(database.connection());

    let constellation = constellations
        .create(
            "Episode 0.2".to_string(),
            "episode-0-2".to_string(),
            None,
            "/tmp/episode-0.2".to_string(),
            Some("A research-heavy episode".to_string()),
            None,
            serde_json::json!({"published": false}),
        )
        .expect("create constellation");

    assert!(!constellation.id.is_empty());
    assert_eq!(constellation.display_name, "Episode 0.2");
    assert_eq!(constellation.slug, "episode-0-2");
    assert!(constellation.primary_canvas_id.is_some());

    let reloaded = constellations
        .get_by_id(&constellation.id)
        .expect("constellation reload")
        .expect("reloaded constellation");
    assert_eq!(reloaded.id, constellation.id);
    assert_eq!(reloaded.parent_constellation_id, None);
    assert_eq!(
        reloaded.summary.as_deref(),
        Some("A research-heavy episode")
    );

    let primary_canvas_id = constellation
        .primary_canvas_id
        .as_ref()
        .expect("primary canvas");
    let canvas = canvases
        .get_by_id(primary_canvas_id)
        .expect("canvas reload")
        .expect("reloaded canvas");
    assert_eq!(canvas.constellation_id, constellation.id);
    assert!(canvas.is_primary);
    assert_eq!(canvas.name, "Primary canvas");

    let canvases_for_constellation = canvases
        .list_for_constellation(&constellation.id)
        .expect("list canvases");
    assert_eq!(canvases_for_constellation.len(), 1);
    assert_eq!(canvases_for_constellation[0].id, *primary_canvas_id);
}

#[test]
fn constellation_repository_supports_nested_constellations_with_recursive_lookup() {
    let (_dir, database) = open_temp_database();
    let constellations = ConstellationRepository::new(database.connection());

    let parent = constellations
        .create(
            "Series".to_string(),
            "series".to_string(),
            None,
            "/tmp/series".to_string(),
            None,
            None,
            serde_json::json!({}),
        )
        .expect("create parent");
    let child = constellations
        .create(
            "Episode".to_string(),
            "episode".to_string(),
            Some(parent.id.clone()),
            "/tmp/series/episode".to_string(),
            None,
            None,
            serde_json::json!({}),
        )
        .expect("create child");

    let children = constellations
        .list_children(&parent.id)
        .expect("list children");
    assert_eq!(children.len(), 1);
    assert_eq!(children[0].id, child.id);

    let descendants = constellations
        .list_descendants(&parent.id)
        .expect("list descendants");
    assert_eq!(descendants.len(), 1);
    assert_eq!(descendants[0].id, child.id);
}

#[test]
fn constellation_repository_updates_and_deletes_constellations_and_canvases() {
    let (_dir, database) = open_temp_database();
    let constellations = ConstellationRepository::new(database.connection());
    let canvases = CanvasRepository::new(database.connection());

    let constellation = constellations
        .create(
            "Field Notes".to_string(),
            "field-notes".to_string(),
            None,
            "/tmp/field-notes".to_string(),
            Some("Initial summary".to_string()),
            None,
            serde_json::json!({}),
        )
        .expect("create constellation");

    let updated_constellation = constellations
        .update_summary(&constellation.id, Some("Updated summary".to_string()))
        .expect("update constellation summary");
    assert_eq!(
        updated_constellation.summary.as_deref(),
        Some("Updated summary")
    );

    let extra_canvas = canvases
        .create_for_constellation(
            &constellation.id,
            "Appendix canvas",
            "focus",
            Some("Side research".to_string()),
            false,
        )
        .expect("create extra canvas");

    let canvases_for_constellation = canvases
        .list_for_constellation(&constellation.id)
        .expect("list canvases");
    assert_eq!(canvases_for_constellation.len(), 2);

    let updated_canvas = canvases
        .update_summary(&extra_canvas.id, Some("Updated canvas summary".to_string()))
        .expect("update canvas");
    assert_eq!(
        updated_canvas.summary.as_deref(),
        Some("Updated canvas summary")
    );

    canvases
        .delete_by_id(&extra_canvas.id)
        .expect("delete canvas");
    assert!(canvases
        .get_by_id(&extra_canvas.id)
        .expect("reload canvas")
        .is_none());

    constellations
        .delete_by_id(&constellation.id)
        .expect("delete constellation");
    assert!(constellations
        .get_by_id(&constellation.id)
        .expect("reload constellation")
        .is_none());
    assert!(canvases
        .list_for_constellation(&constellation.id)
        .expect("list canvases after constellation delete")
        .is_empty());
}

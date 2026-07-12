// apps/desktop/src-tauri/tests/api_layout_dispatch.rs
use research_canvas_desktop_lib::api::handlers::{remove_node_layout, upsert_node_layout};
use research_canvas_desktop_lib::api::types::{PlaceNodeRequest, RemoveNodeResponse};
use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{layout::LayoutRepository, ProjectRepository},
};
use research_canvas_desktop_lib::{ApiState, SharedApiState};
use std::sync::{Arc, Mutex};
use tempfile::tempdir;

fn state_with_canvas() -> (tempfile::TempDir, SharedApiState, String) {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("t.db");
    let db = Database::open(&db_path).unwrap();
    let project = ProjectRepository::new(db.connection())
        .create(
            "P".into(),
            "p".into(),
            None,
            dir.path().to_str().unwrap().into(),
            None,
            None,
            serde_json::json!({}),
        )
        .unwrap();
    let canvas_id = project.primary_canvas_id.unwrap();
    let state: SharedApiState = Arc::new(Mutex::new(ApiState {
        db_path: Some(db_path.to_string_lossy().to_string()),
        active_project_id: Some(project.id),
        active_canvas_id: Some(canvas_id.clone()),
    }));
    (dir, state, canvas_id)
}

#[test]
fn place_then_remove_node_layout_via_handlers() {
    let (_dir, state, canvas_id) = state_with_canvas();
    upsert_node_layout(
        PlaceNodeRequest {
            graph_node_id: "g1".into(),
            x: 12.0,
            y: 34.0,
            width: Some(240.0),
            height: Some(160.0),
            dot_colour: None,
            bg_colour: None,
            text_colour: None,
            thumbnail: None,
        },
        &state,
    )
    .expect("place");

    let db_path = state.lock().unwrap().db_path.clone().unwrap();
    let db = Database::open(&db_path).unwrap();
    let rows = LayoutRepository::new(db.connection())
        .list_node_layout(&canvas_id)
        .unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].position_x, 12.0);

    let resp: RemoveNodeResponse = remove_node_layout("g1".into(), &state).expect("remove");
    assert!(resp.ok);
    let rows2 = LayoutRepository::new(Database::open(&db_path).unwrap().connection())
        .list_node_layout(&canvas_id)
        .unwrap();
    assert_eq!(rows2.len(), 0);
}

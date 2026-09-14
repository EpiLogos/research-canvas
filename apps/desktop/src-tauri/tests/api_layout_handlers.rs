// apps/desktop/src-tauri/tests/api_layout_handlers.rs
use research_canvas_desktop_lib::api::handlers::{batch_place, upsert_node_layout};
use research_canvas_desktop_lib::api::types::{
    BatchPlaceItem, BatchPlaceRequest, PlaceNodeRequest,
};
use research_canvas_desktop_lib::db::connection::Database;
use research_canvas_desktop_lib::db::repositories::{
    agent_activity::AgentActivityRepository, layout::LayoutRepository, ConstellationRepository,
};
use research_canvas_desktop_lib::{ApiState, SharedApiState};
use std::sync::{Arc, Mutex};

// Build a SharedApiState backed by a real temp SQLite DB with an active canvas,
// mirroring WS2 Task 15's `state_with_canvas` helper.
fn state_with_canvas() -> (tempfile::TempDir, SharedApiState, String) {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("t.db");
    let db = Database::open(&db_path).unwrap();
    let project = ConstellationRepository::new(db.connection())
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
        active_constellation_id: Some(project.id.clone()),
        active_canvas_id: Some(canvas_id.clone()),
        active_project_id: Some(project.id),
        active_profile_scope: Some(project.profile_scope.clone()),
    }));
    (dir, state, canvas_id)
}

#[test]
fn placing_via_handler_persists_layout_and_records_activity() {
    let (_dir, state, canvas_id) = state_with_canvas();

    upsert_node_layout(
        PlaceNodeRequest {
            graph_node_id: "gn-1".into(),
            x: 42.0,
            y: 7.0,
            width: Some(200.0),
            height: Some(120.0),
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
    let conn = db.connection();

    // Layout row written (WS2's behaviour, re-asserted here as a guard).
    let rows = LayoutRepository::new(conn)
        .list_node_layout(&canvas_id)
        .unwrap();
    let found = rows.iter().find(|r| r.graph_node_id == "gn-1").unwrap();
    assert_eq!(found.position_x, 42.0);
    assert_eq!(found.position_y, 7.0);

    // WS6's addition: a node_created activity row was recorded.
    let activity = AgentActivityRepository::new(conn).list_recent(10).unwrap();
    let logged = activity
        .iter()
        .find(|a| a.graph_node_id.as_deref() == Some("gn-1"))
        .expect("activity recorded for placement");
    assert_eq!(logged.kind, "node_created");
}

#[test]
fn replacing_via_handler_records_node_updated_activity() {
    let (_dir, state, _canvas_id) = state_with_canvas();

    let place = |x: f64| {
        upsert_node_layout(
            PlaceNodeRequest {
                graph_node_id: "gn-2".into(),
                x,
                y: 0.0,
                width: None,
                height: None,
                dot_colour: None,
                bg_colour: None,
                text_colour: None,
                thumbnail: None,
            },
            &state,
        )
        .expect("place")
    };

    place(1.0);
    place(2.0);

    let db_path = state.lock().unwrap().db_path.clone().unwrap();
    let db = Database::open(&db_path).unwrap();
    let conn = db.connection();

    let activity = AgentActivityRepository::new(conn).list_recent(10).unwrap();
    let logged: Vec<_> = activity
        .iter()
        .filter(|a| a.graph_node_id.as_deref() == Some("gn-2"))
        .collect();
    assert_eq!(logged.len(), 2, "one activity row per placement call");
    assert!(logged.iter().any(|a| a.kind == "node_created"));
    assert!(logged.iter().any(|a| a.kind == "node_updated"));
}

#[test]
fn batch_place_via_handler_records_activity_per_placement() {
    let (_dir, state, canvas_id) = state_with_canvas();

    let resp = batch_place(
        BatchPlaceRequest {
            placements: vec![
                BatchPlaceItem {
                    graph_node_id: "gn-b1".into(),
                    x: 1.0,
                    y: 1.0,
                    width: None,
                    height: None,
                },
                BatchPlaceItem {
                    graph_node_id: "gn-b2".into(),
                    x: 2.0,
                    y: 2.0,
                    width: None,
                    height: None,
                },
            ],
        },
        &state,
    )
    .expect("batch place");
    assert!(resp.ok);
    assert_eq!(resp.placed, 2);

    let db_path = state.lock().unwrap().db_path.clone().unwrap();
    let db = Database::open(&db_path).unwrap();
    let conn = db.connection();

    let rows = LayoutRepository::new(conn)
        .list_node_layout(&canvas_id)
        .unwrap();
    assert_eq!(rows.len(), 2);

    let activity = AgentActivityRepository::new(conn).list_recent(10).unwrap();
    for id in ["gn-b1", "gn-b2"] {
        let logged = activity
            .iter()
            .find(|a| a.graph_node_id.as_deref() == Some(id))
            .unwrap_or_else(|| panic!("activity recorded for {id}"));
        assert_eq!(logged.kind, "node_created");
    }
}

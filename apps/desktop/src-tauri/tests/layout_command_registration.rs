use research_canvas_desktop_lib::commands::layout::{
    flush_canvas_layout_at, FlushCanvasLayoutRequest, FlushCanvasLayoutResponse,
};
use research_canvas_desktop_lib::db::{connection::Database, repositories::ProjectRepository};
use tempfile::tempdir;

#[test]
fn flush_canvas_layout_at_is_callable_and_returns_a_typed_response() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("reg.sqlite");
    let canvas_id = {
        let database = Database::open(&db_path).expect("open");
        let projects = ProjectRepository::new(database.connection());
        let project = projects
            .create(
                "WS1".to_string(),
                "ws1".to_string(),
                None,
                "/tmp/ws1".to_string(),
                None,
                None,
                serde_json::json!({}),
            )
            .expect("create project");
        project.primary_canvas_id.expect("canvas")
    };

    let response: FlushCanvasLayoutResponse = flush_canvas_layout_at(FlushCanvasLayoutRequest {
        database_path: db_path.to_string_lossy().to_string(),
        canvas_id,
        layouts: vec![],
        edges: vec![],
        viewport_json: r#"{"x":0,"y":0,"zoom":1}"#.to_string(),
        app_state_json: "{}".to_string(),
    })
    .expect("flush empty ok");

    assert_eq!(response.written_nodes, 0);
    assert_eq!(response.written_edges, 0);
}

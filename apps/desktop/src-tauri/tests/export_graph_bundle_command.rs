// Integration test: the pure writer `write_graph_bundle` serializes a
// GraphExportBundle and writes it to `<output_dir>/graph-bundle.json`. This
// is the disk-write half of Task 9 (export_graph_bundle_command); the
// Tauri-command half (live Neo4j + SQLite join via build_graph_bundle) is
// exercised manually / by the desktop app, since Tauri commands require a
// running app context to invoke directly in a unit test.

use std::fs;

use research_canvas_desktop_lib::commands::export_graph_bundle::write_graph_bundle;
use research_canvas_desktop_lib::export::graph_bundle::GraphExportBundle;

#[test]
fn writes_graph_bundle_json_to_output_dir() {
    let json_value = serde_json::json!({
        "generatedAt": "2026-06-28T12:00:00Z",
        "project": { "id": "p1", "displayName": "Antichrist" },
        "canvasId": "c1",
        "nodes": [],
        "relationships": [],
        "nodeLayout": [],
        "edgeLayout": [],
        "viewport": { "x": 0.0, "y": 0.0, "zoom": 1.0 },
        "appState": {},
        "lightingIndex": {},
        "assets": []
    });
    let bundle: GraphExportBundle =
        serde_json::from_value(json_value).expect("deserialize bundle");

    let temp_dir = std::env::temp_dir().join(format!(
        "antichrist-bundle-{}",
        std::process::id()
    ));
    fs::create_dir_all(&temp_dir).expect("create temp dir");

    let written = write_graph_bundle(&bundle, &temp_dir).expect("write bundle");
    assert!(written.ends_with("graph-bundle.json"));
    assert!(written.exists());

    let contents = fs::read_to_string(&written).expect("read written file");
    assert!(contents.contains("\"canvasId\""));
    assert!(contents.contains("\"lightingIndex\""));

    fs::remove_dir_all(&temp_dir).ok();
}

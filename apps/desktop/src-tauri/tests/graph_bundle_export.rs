// Integration test: build_graph_bundle joins layout + a fixed substance set
// into the camelCase JSON the TS GraphExportBundle parser accepts.
// Substance is exercised via a serde round-trip of the Rust GraphExportBundle,
// so this test runs without a live Neo4j (the live join is covered by WS2's repo tests).

use research_canvas_desktop_lib::export::graph_bundle::{
    serialize_graph_bundle, GraphExportBundle,
};

#[test]
fn serialized_bundle_uses_camel_case_keys() {
    let json_value = serde_json::json!({
        "generatedAt": "2026-06-28T12:00:00Z",
        "project": {
            "id": "11111111-1111-4111-8111-111111111111",
            "displayName": "Antichrist"
        },
        "canvasId": "c1",
        "nodes": [{
            "graphNodeId": "node-banda",
            "entityType": "Event",
            "title": "Banda genocide",
            "body": "[]",
            "summary": "1621",
            "archetypalResonance": null,
            "coordinate": null,
            "sourceCoordinates": [],
            "evidenceTags": [],
            "sourceKind": null,
            "isTemporal": true,
            "validFrom": "1621-01-01",
            "validTo": "1621-12-31",
            "temporalPrecision": "year",
            "createdAt": "t",
            "updatedAt": "t"
        }],
        "relationships": [],
        "nodeLayout": [{
            "graphNodeId": "node-banda",
            "canvasId": "c1",
            "positionX": 1.0,
            "positionY": 2.0,
            "width": 3.0,
            "height": 4.0,
            "style": {}
        }],
        "edgeLayout": [],
        "viewport": { "x": 0.0, "y": 0.0, "zoom": 1.0 },
        "appState": {},
        "lightingIndex": {},
        "assets": []
    });

    let bundle: GraphExportBundle =
        serde_json::from_value(json_value).expect("bundle should deserialize");
    let serialized = serialize_graph_bundle(&bundle).expect("serialize");

    assert!(serialized.contains("\"graphNodeId\""));
    assert!(serialized.contains("\"isTemporal\""));
    assert!(serialized.contains("\"nodeLayout\""));
    assert!(serialized.contains("\"lightingIndex\""));
    // snake_case must NOT appear
    assert!(!serialized.contains("graph_node_id"));
    assert!(!serialized.contains("is_temporal"));
}

// apps/desktop/src-tauri/tests/graph_types.rs
use research_canvas_desktop_lib::db::repositories::graph::{
    GraphNode, GraphNodePatch, NewGraphNode,
};

#[test]
fn graph_node_serializes_camel_case() {
    let node = GraphNode {
        graph_node_id: "id-1".into(),
        entity_type: "Figure".into(),
        title: "Cosimo".into(),
        body: "[]".into(),
        summary: "".into(),
        archetypal_resonance: None,
        coordinate: Some("#2".into()),
        source_coordinates: vec!["#2".into(), "L2".into()],
        evidence_tags: vec!["archive".into(), "contested".into()],
        source_kind: Some("archive".into()),
        is_temporal: true,
        valid_from: Some("1389".into()),
        valid_to: Some("1464".into()),
        temporal_precision: Some("year".into()),
        created_at: "2026-06-28T00:00:00Z".into(),
        updated_at: "2026-06-28T00:00:00Z".into(),
    };
    let json = serde_json::to_value(&node).expect("serialize");
    assert_eq!(json["graphNodeId"], "id-1");
    assert_eq!(json["entityType"], "Figure");
    assert_eq!(json["sourceCoordinates"][1], "L2");
    assert_eq!(json["evidenceTags"][0], "archive");
    assert_eq!(json["sourceKind"], "archive");
    assert_eq!(json["isTemporal"], true);
    let back: GraphNode = serde_json::from_value(json).expect("deserialize");
    assert_eq!(back.graph_node_id, "id-1");
    assert_eq!(back.evidence_tags, vec!["archive", "contested"]);
    assert_eq!(back.source_kind.as_deref(), Some("archive"));
}

#[test]
fn graph_node_deserializes_legacy_json_without_evidence_fields() {
    let node: GraphNode = serde_json::from_value(serde_json::json!({
        "graphNodeId": "legacy-1",
        "entityType": "Source",
        "title": "Legacy source",
        "body": "[]",
        "summary": "",
        "archetypalResonance": null,
        "coordinate": null,
        "sourceCoordinates": [],
        "isTemporal": false,
        "validFrom": null,
        "validTo": null,
        "temporalPrecision": null,
        "createdAt": "2026-06-28T00:00:00Z",
        "updatedAt": "2026-06-28T00:00:00Z"
    }))
    .expect("deserialize legacy graph node");

    assert_eq!(node.graph_node_id, "legacy-1");
    assert!(node.evidence_tags.is_empty());
    assert_eq!(node.source_kind, None);
}

#[test]
fn new_graph_node_and_patch_defaults() {
    let new = NewGraphNode {
        graph_node_id: None,
        entity_type: "Event".into(),
        title: "Banda genocide".into(),
        body: "[]".into(),
        coordinate: None,
        source_coordinates: vec![],
        is_temporal: true,
        valid_from: Some("1621".into()),
        valid_to: Some("1621".into()),
        temporal_precision: Some("year".into()),
    };
    assert_eq!(new.entity_type, "Event");
    let patch = GraphNodePatch::default();
    assert!(patch.title.is_none());
    // Some(None) clears coordinate; None leaves it unchanged.
    let clearing = GraphNodePatch {
        coordinate: Some(None),
        archetypal_resonance: Some(None),
        source_kind: Some(None),
        evidence_tags: Some(vec![]),
        ..Default::default()
    };
    assert_eq!(clearing.coordinate, Some(None));
    assert_eq!(clearing.archetypal_resonance, Some(None));
    assert_eq!(clearing.source_kind, Some(None));
    assert_eq!(clearing.evidence_tags, Some(vec![]));
}

#[test]
fn graph_node_patch_preserves_explicit_source_kind_null_from_json() {
    let omitted: GraphNodePatch =
        serde_json::from_value(serde_json::json!({})).expect("deserialize omitted patch");
    assert_eq!(omitted.source_kind, None);

    let clearing: GraphNodePatch = serde_json::from_value(serde_json::json!({
        "archetypalResonance": null,
        "coordinate": null,
        "sourceKind": null,
        "validFrom": null,
        "validTo": null,
        "temporalPrecision": null
    }))
    .expect("deserialize clearing patch");
    assert_eq!(clearing.archetypal_resonance, Some(None));
    assert_eq!(clearing.coordinate, Some(None));
    assert_eq!(clearing.source_kind, Some(None));
    assert_eq!(clearing.valid_from, Some(None));
    assert_eq!(clearing.valid_to, Some(None));
    assert_eq!(clearing.temporal_precision, Some(None));

    let setting: GraphNodePatch = serde_json::from_value(serde_json::json!({
        "archetypalResonance": "echo",
        "coordinate": "#4",
        "sourceKind": "archive"
    }))
    .expect("deserialize setting patch");
    assert_eq!(setting.archetypal_resonance, Some(Some("echo".into())));
    assert_eq!(setting.coordinate, Some(Some("#4".into())));
    assert_eq!(setting.source_kind, Some(Some("archive".into())));
}

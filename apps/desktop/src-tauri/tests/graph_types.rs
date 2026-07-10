// apps/desktop/src-tauri/tests/graph_types.rs
use research_canvas_desktop_lib::db::repositories::graph::{
    resolve_entity_type_from_labels, ClaimKind, ContentOrigin, EntityType, EvidenceStatus,
    GraphNode, GraphNodePatch, Historicity, NewGraphNode, PlaceCoverage, QlArc,
    QlCompletenessStatus, QlForm, QlTopology, TemporalPrecision, TemporalRole,
};

#[test]
fn graph_node_matches_the_canonical_contract_fixture() {
    let fixture = include_str!("../../../../tests/fixtures/contracts/graph-node.json");
    let expected: serde_json::Value = serde_json::from_str(fixture).expect("valid fixture json");
    let node: GraphNode = serde_json::from_value(expected.clone()).expect("deserialize fixture");

    assert_eq!(
        serde_json::to_value(node).expect("serialize fixture"),
        expected
    );
}

#[test]
fn graph_node_serializes_camel_case() {
    let node = GraphNode {
        graph_node_id: "id-1".into(),
        entity_type: EntityType::Figure,
        title: "Cosimo".into(),
        body: "[]".into(),
        summary: "".into(),
        archetypal_resonance: None,
        coordinate: Some("#2".into()),
        source_coordinates: vec!["#2".into(), "L2".into()],
        evidence_tags: vec![],
        source_kind: None,
        content_origin: Some(ContentOrigin::Seed),
        content_revision: Some(1),
        seed_schema_version: Some(1),
        body_source_coordinates: vec!["Canon/cosimo.md#body".into()],
        historicity: Some(Historicity::Historical),
        claim_kind: Some(ClaimKind::Fact),
        evidence_status: Some(EvidenceStatus::Documented),
        temporal_role: Some(TemporalRole::ActiveDuring),
        place_coverage: Some(PlaceCoverage::Resolved),
        ql_form: Some(QlForm::PartialPositionalMap),
        ql_unit_id: Some("ql-cosimo".into()),
        ql_arc: Some(QlArc::Braided),
        ql_topology: Some(QlTopology::Composite),
        ql_schema_version: Some(1),
        ql_source_coordinates: vec!["Canon/ql/cosimo.md#unit".into()],
        ql_completeness_status: Some(QlCompletenessStatus::Partial),
        is_temporal: true,
        valid_from: Some("1389".into()),
        valid_to: Some("1464".into()),
        temporal_precision: Some(TemporalPrecision::Year),
        created_at: "2026-06-28T00:00:00Z".into(),
        updated_at: "2026-06-28T00:00:00Z".into(),
    };
    let json = serde_json::to_value(&node).expect("serialize");
    assert_eq!(json["graphNodeId"], "id-1");
    assert_eq!(json["entityType"], "Figure");
    assert_eq!(json["sourceCoordinates"][1], "L2");
    assert_eq!(json["isTemporal"], true);
    let back: GraphNode = serde_json::from_value(json).expect("deserialize");
    assert_eq!(back.graph_node_id, "id-1");
}

#[test]
fn semantic_label_resolution_is_deterministic_and_rejects_legacy_conflicts() {
    assert_eq!(
        resolve_entity_type_from_labels(&["Operator".into(), "PsychoidOperator".into()]),
        Ok(EntityType::PsychoidOperator)
    );
    let conflict =
        resolve_entity_type_from_labels(&["TheoryNode".into(), "Source".into(), "Claim".into()])
            .expect_err("multiple semantic labels rejected");
    assert_eq!(
        conflict.recognized,
        vec![EntityType::Claim, EntityType::Source]
    );

    let unknown = resolve_entity_type_from_labels(&["TheoryNode".into(), "LegacyThing".into()])
        .expect_err("unknown-only label rejected");
    assert_eq!(unknown.unknown, vec!["LegacyThing"]);
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
        source_kind: Some(None),
        ql_form: Some(None),
        ..Default::default()
    };
    assert_eq!(clearing.coordinate, Some(None));
    assert_eq!(clearing.source_kind, Some(None));
    assert_eq!(clearing.ql_form, Some(None));
}

#[test]
fn controlled_values_reject_unknown_tokens() {
    let mut fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../tests/fixtures/contracts/graph-node.json"
    ))
    .expect("valid fixture json");
    fixture["historicity"] = serde_json::json!("legendary-ish");

    let error = serde_json::from_value::<GraphNode>(fixture).expect_err("unknown value rejected");
    assert!(error.to_string().contains("unknown variant"));
}

#[test]
fn patch_json_distinguishes_omitted_fields_from_explicit_null() {
    let patch: GraphNodePatch = serde_json::from_str(
        r#"{"coordinate":null,"sourceKind":null,"qlForm":null,"contentRevision":null}"#,
    )
    .expect("deserialize patch");

    assert_eq!(patch.coordinate, Some(None));
    assert_eq!(patch.source_kind, Some(None));
    assert_eq!(patch.ql_form, Some(None));
    assert_eq!(patch.content_revision, Some(None));
    assert_eq!(patch.valid_from, None, "omitted fields remain unchanged");
}

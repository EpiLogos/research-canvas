// apps/desktop/src-tauri/tests/graph_types.rs
use research_canvas_desktop_lib::db::repositories::graph::{
    resolve_entity_type_from_labels, semantic_relabel_entity_types, validate_contract_revision,
    ClaimKind, ContentOrigin, EntityType, EvidenceStatus, GraphContentCasMutation, GraphNode,
    GraphNodePatch, Historicity, NewGraphNode, PlaceCoverage, QlArc, QlCompletenessStatus, QlForm,
    QlTopology, TemporalPrecision, TemporalRole,
};
use research_canvas_desktop_lib::db::repositories::SyncAcknowledgementMutation;

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
        evidence_tags: vec!["archive".into(), "contested".into()],
        source_kind: Some("archive".into()),
        content_origin: Some(ContentOrigin::Seed),
        content_revision: Some(1),
        seed_schema_version: Some(1),
        body_source_coordinates: vec!["Canon/cosimo.md#body".into()],
        historicity: Some(Historicity::Historical),
        claim_kind: Some(ClaimKind::Fact),
        evidence_status: Some(EvidenceStatus::Documented),
        temporal_role: Some(TemporalRole::ActiveDuring),
        place_coverage: Some(PlaceCoverage::Resolved),
        place: None,
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
fn revision_range_matches_javascript_safe_integers() {
    assert!(validate_contract_revision("contentRevision", 0).is_ok());
    assert!(validate_contract_revision("contentRevision", 9_007_199_254_740_991).is_ok());
    assert!(validate_contract_revision("contentRevision", -1).is_err());
    assert!(validate_contract_revision("contentRevision", 9_007_199_254_740_992).is_err());
}

#[test]
fn rust_vocabularies_and_relabel_set_match_the_shared_manifest() {
    let manifest: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../tests/fixtures/contracts/graph-vocabularies.json"
    ))
    .expect("vocabulary manifest");
    macro_rules! assert_vocab {
        ($key:literal, $enum:ty) => {{
            let actual = <$enum>::ALL
                .iter()
                .map(|value| value.as_str())
                .collect::<Vec<_>>();
            let expected = manifest[$key]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v.as_str().unwrap())
                .collect::<Vec<_>>();
            assert_eq!(actual, expected, "{} vocabulary", $key);
        }};
    }
    assert_vocab!("entityType", EntityType);
    assert_vocab!("temporalPrecision", TemporalPrecision);
    assert_vocab!("contentOrigin", ContentOrigin);
    assert_vocab!("historicity", Historicity);
    assert_vocab!("claimKind", ClaimKind);
    assert_vocab!("evidenceStatus", EvidenceStatus);
    assert_vocab!("temporalRole", TemporalRole);
    assert_vocab!("placeCoverage", PlaceCoverage);
    assert_vocab!("qlForm", QlForm);
    assert_vocab!("qlArc", QlArc);
    assert_vocab!("qlTopology", QlTopology);
    assert_vocab!("qlCompletenessStatus", QlCompletenessStatus);
    assert_eq!(semantic_relabel_entity_types(), EntityType::ALL);
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
    let patch: GraphNodePatch =
        serde_json::from_str(r#"{"coordinate":null,"sourceKind":null,"qlForm":null}"#)
            .expect("deserialize patch");

    assert_eq!(patch.coordinate, Some(None));
    assert_eq!(patch.source_kind, Some(None));
    assert_eq!(patch.ql_form, Some(None));
    assert_eq!(patch.valid_from, None, "omitted fields remain unchanged");
}

#[test]
fn generic_metadata_patch_rejects_all_content_owned_fields() {
    for field in [
        "body",
        "summary",
        "contentOrigin",
        "contentRevision",
        "bodySourceCoordinates",
    ] {
        let json = format!(r#"{{"{field}":null}}"#);
        assert!(
            serde_json::from_str::<GraphNodePatch>(&json).is_err(),
            "{field} must use content CAS"
        );
    }
}

#[test]
fn content_cas_conflict_wire_payload_keeps_explicit_snake_case_fields() {
    let value = serde_json::to_value(GraphContentCasMutation::Conflict {
        current_remote_revision: Some(9),
        current_remote_origin: Some(ContentOrigin::CorpusCompiled),
        reason: "remote changed".into(),
    })
    .unwrap();
    assert_eq!(
        value,
        serde_json::json!({
            "kind": "conflict",
            "current_remote_revision": 9,
            "current_remote_origin": "corpus_compiled",
            "reason": "remote changed"
        })
    );
    let acknowledgement = serde_json::to_value(SyncAcknowledgementMutation::Conflict {
        current_revision: 10,
        current_origin: ContentOrigin::UserAuthored,
        reason: "local changed".into(),
    })
    .unwrap();
    assert_eq!(
        acknowledgement,
        serde_json::json!({
            "kind": "conflict",
            "current_revision": 10,
            "current_origin": "user_authored",
            "reason": "local changed"
        })
    );
}

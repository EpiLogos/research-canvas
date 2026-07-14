// apps/desktop/src-tauri/tests/graph_commands.rs
use research_canvas_desktop_lib::commands::graph::{
    ConnectGraphNodesRequest, CreateGraphNodeRequest, DisconnectGraphNodesRequest,
    LoadCanvasViewRequest, UpsertNodeLayoutRequest,
};

#[test]
fn create_graph_node_request_deserializes_camel_case() {
    let raw = r##"{
        "entityType": "Event",
        "title": "Banda genocide",
        "body": "[]",
        "isTemporal": true,
        "validFrom": "1621",
        "validTo": "1621",
        "temporalPrecision": "year",
        "sourceCoordinates": ["#2"],
        "evidenceTags": ["documented"],
        "sourceKind": "historical-event",
        "contentOrigin": "corpus_compiled",
        "contentRevision": 4,
        "seedSchemaVersion": 2,
        "bodySourceCoordinates": ["Canon/banda.md#reading"],
        "historicity": "historical",
        "claimKind": "fact",
        "evidenceStatus": "documented",
        "temporalRole": "occurred_at",
        "placeCoverage": "resolved",
        "qlForm": "partial_positional_map",
        "qlUnitId": "ql-banda",
        "qlArc": "braided",
        "qlTopology": "composite",
        "qlSchemaVersion": 2,
        "qlSourceCoordinates": ["Canon/ql/banda.md#unit"],
        "qlCompletenessStatus": "partial"
    }"##;
    let req: CreateGraphNodeRequest = serde_json::from_str(raw).expect("deserialize");
    assert_eq!(req.entity_type.as_str(), "Event");
    assert_eq!(req.is_temporal, true);
    assert_eq!(req.source_coordinates, vec!["#2".to_string()]);
    assert_eq!(
        req.content_origin.expect("content origin").as_str(),
        "corpus_compiled"
    );
    assert_eq!(req.historicity.expect("historicity").as_str(), "historical");
    assert_eq!(
        req.ql_form.expect("QL form").as_str(),
        "partial_positional_map"
    );
}

#[test]
fn create_graph_node_request_rejects_unknown_controlled_values() {
    let raw = r#"{
        "entityType":"Event",
        "title":"Invalid",
        "body":"[]",
        "isTemporal":false,
        "historicity":"legendary-ish"
    }"#;

    assert!(serde_json::from_str::<CreateGraphNodeRequest>(raw).is_err());
}

#[test]
fn load_canvas_view_request_and_layout_request_deserialize() {
    // databasePath is OPTIONAL: WS3/WS4/WS5/WS6 callers omit it and the command
    // falls back to SharedApiState.db_path. Deserialize must not fail when absent.
    let lcv: LoadCanvasViewRequest =
        serde_json::from_str(r#"{"canvasId":"c1","lens":"timeline"}"#).expect("lcv");
    assert_eq!(lcv.lens, "timeline");
    assert_eq!(lcv.database_path, None);

    let layout: UpsertNodeLayoutRequest = serde_json::from_str(
        r#"{"layout":{"graphNodeId":"g1","canvasId":"c1","positionX":1.0,"positionY":2.0,"width":240.0,"height":160.0,"style":{}}}"#,
    ).expect("layout");
    assert_eq!(layout.layout.graph_node_id, "g1");
    assert_eq!(layout.database_path, None);

    // …and an explicit databasePath is still honoured when present.
    let layout_with_path: UpsertNodeLayoutRequest = serde_json::from_str(
        r#"{"databasePath":"/tmp/x.db","layout":{"graphNodeId":"g1","canvasId":"c1","positionX":1.0,"positionY":2.0,"width":240.0,"height":160.0,"style":{}}}"#,
    ).expect("layout with path");
    assert_eq!(layout_with_path.database_path.as_deref(), Some("/tmp/x.db"));

    let conn: ConnectGraphNodesRequest = serde_json::from_str(
        r#"{"databasePath":"/tmp/relationship.sqlite","sourceGraphNodeId":"a","targetGraphNodeId":"b","relType":"INSTANTIATES","properties":{"dominance":"dominant"},"canonicalKey":"user:a:INSTANTIATES:b","origin":"user_authored","revision":4,"expectedRevision":3,"sourceCoordinates":["vault/a.md#link"],"evidenceTags":["user-curated"]}"#,
    ).expect("conn");
    assert_eq!(conn.rel_type, "INSTANTIATES");
    assert_eq!(
        conn.database_path.as_deref(),
        Some("/tmp/relationship.sqlite")
    );
    assert_eq!(conn.canonical_key.as_deref(), Some("user:a:INSTANTIATES:b"));
    assert_eq!(
        conn.origin.expect("explicit user owner").as_str(),
        "user_authored"
    );
    assert_eq!(conn.revision, Some(4));
    assert_eq!(conn.expected_revision, Some(3));
    assert_eq!(conn.source_coordinates, vec!["vault/a.md#link"]);
    assert_eq!(conn.evidence_tags, vec!["user-curated"]);

    let disconnect: DisconnectGraphNodesRequest = serde_json::from_str(
        r#"{"databasePath":"/tmp/relationship.sqlite","relationshipId":"relationship:local"}"#,
    )
    .expect("disconnect");
    assert_eq!(
        disconnect.database_path.as_deref(),
        Some("/tmp/relationship.sqlite")
    );
    assert_eq!(disconnect.relationship_id, "relationship:local");
}

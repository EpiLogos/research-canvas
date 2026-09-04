use research_canvas_desktop_lib::{
    commands::{
        palace_graph::{load_palace_graph_at, LoadPalaceGraphRequest},
        timeline::timeline_workspace_identity,
    },
    db::{
        connection::Database,
        repositories::graph::{
            ClaimKind, ContentOrigin, EntityType, EvidenceStatus, Historicity, PlaceCoverage,
            QlArc, QlCompletenessStatus, QlForm, QlTopology, TemporalPrecision, TemporalRole,
        },
        repositories::{
            GraphNodeMetadataRecord, GraphNodeMetadataRepository, NodeRelationshipRecord,
            NodeRelationshipRepository, SyncState,
        },
    },
};
use serde_json::json;
use tempfile::tempdir;

fn metadata_record(
    id: &str,
    title: &str,
    entity_type: EntityType,
    ql_unit_id: Option<&str>,
) -> GraphNodeMetadataRecord {
    GraphNodeMetadataRecord {
        graph_node_id: id.into(),
        entity_type,
        title: title.into(),
        archetypal_resonance: None,
        coordinate: Some(format!("#{id}")),
        source_coordinates: vec![format!("Canon/{id}.md")],
        evidence_tags: vec!["primary-source".into()],
        source_kind: Some("chronicle".into()),
        content_origin: ContentOrigin::CorpusCompiled,
        content_revision: 1,
        seed_schema_version: Some(2),
        body_source_coordinates: vec![format!("Canon/{id}.md")],
        historicity: Some(Historicity::Historical),
        claim_kind: Some(ClaimKind::Fact),
        evidence_status: Some(EvidenceStatus::Documented),
        temporal_role: Some(TemporalRole::OccurredAt),
        place_coverage: Some(PlaceCoverage::Resolved),
        place: None,
        ql_form: Some(QlForm::PartialPositionalMap),
        ql_unit_id: ql_unit_id.map(str::to_string),
        ql_arc: Some(QlArc::Day),
        ql_topology: Some(QlTopology::Composite),
        ql_schema_version: Some(1),
        ql_source_coordinates: vec!["Canon/ql.md#3".into()],
        ql_completeness_status: Some(QlCompletenessStatus::Partial),
        is_temporal: true,
        valid_from: Some("1400".into()),
        valid_to: None,
        temporal_precision: Some(TemporalPrecision::Year),
        schema_version: 1,
        sync_state: SyncState::Pending,
        remote_revision: None,
        is_archetype: false,
    }
}

fn encapsulates(
    id: &str,
    source: &str,
    target: &str,
    mode: &str,
) -> NodeRelationshipRecord {
    NodeRelationshipRecord {
        relationship_id: id.into(),
        source_graph_node_id: source.into(),
        target_graph_node_id: target.into(),
        rel_type: "ENCAPSULATES".into(),
        properties: json!({ "mode": mode }),
        source_coordinates: vec![],
        evidence_tags: vec![],
        origin: ContentOrigin::CorpusCompiled,
        sync_state: SyncState::Pending,
        revision: 1,
        remote_revision: None,
        is_tombstone: false,
        created_at: None,
        updated_at: None,
    }
}

/// Real-store integration (B1 + F2): seed SQLite-persisted ENCAPSULATES edges
/// and QL-resonant nodes, then assert the palace subgraph surface returns the
/// real edges (the form-shaping data precondition) and the QL nodes the
/// bootstrapping profile shapes. This exercises the actual store the transport
/// reads, not hand-built fixtures.
#[test]
fn palace_graph_loads_real_encapsulation_edges_and_ql_nodes_from_sqlite() {
    let dir = tempdir().unwrap();
    let database_path = dir.path().join("palace-graph.sqlite");
    let database = Database::open(&database_path).unwrap();

    let metadata = GraphNodeMetadataRepository::new(database.connection());
    let container = "constellation-council";
    let member_ids: Vec<String> = (1..=6).map(|i| format!("member-{i}")).collect();
    let ql_ids = ["ql-member-a", "ql-member-b", "ql-member-c"];

    for member in &member_ids {
        metadata
            .save(
                &metadata_record(member, member, EntityType::Event, None),
                None,
            )
            .expect("seed member");
    }
    metadata
        .save(
            &metadata_record(
                container,
                "Council constellation",
                EntityType::Constellation,
                None,
            ),
            None,
        )
        .expect("seed container");
    for ql_id in &ql_ids {
        metadata
            .save(
                &metadata_record(ql_id, ql_id, EntityType::Event, Some("ql-council")),
                None,
            )
            .expect("seed QL node");
    }

    let relationships = NodeRelationshipRepository::new(database.connection());
    for (index, member) in member_ids.iter().enumerate() {
        relationships
            .merge(
                &encapsulates(
                    &format!("enc-{index}"),
                    container,
                    member,
                    "outgoing",
                ),
                None,
            )
            .expect("seed ENCAPSULATES edge");
    }

    let path = database_path.to_string_lossy().to_string();
    let workspace_id = timeline_workspace_identity(&path).expect("workspace identity");
    let view = load_palace_graph_at(
        &path,
        LoadPalaceGraphRequest { workspace_id },
    )
    .expect("load palace graph");

    // The real ENCAPSULATES edges come back through the repository surface.
    assert_eq!(view.encapsulation_edges.len(), 6);
    for edge in &view.encapsulation_edges {
        assert_eq!(edge.rel_type, "ENCAPSULATES");
        assert_eq!(edge.source_graph_node_id, container);
        assert_eq!(edge.properties["mode"], "outgoing");
    }

    // The container has six outgoing members — the "room" form precondition
    // (`encapsulationInfo` memberCount >= 6 → full 4+2 constellation → room).
    let container_edges = view
        .encapsulation_edges
        .iter()
        .filter(|edge| edge.source_graph_node_id == container)
        .count();
    assert_eq!(container_edges, 6);

    // The QL-resonant nodes survive the local projection with their QL unit
    // intact, so the bootstrapping profile can shape them onto P0–P5 faces.
    let ql_in_view = view
        .nodes
        .iter()
        .filter(|record| ql_ids.contains(&record.node.graph_node_id.as_str()))
        .collect::<Vec<_>>();
    assert_eq!(ql_in_view.len(), 3);
    for record in ql_in_view {
        assert_eq!(record.node.ql_unit_id.as_deref(), Some("ql-council"));
        assert_eq!(record.node.ql_form, Some(QlForm::PartialPositionalMap));
    }
}

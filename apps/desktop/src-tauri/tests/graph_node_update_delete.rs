// apps/desktop/src-tauri/tests/graph_node_update_delete.rs
mod support;
use research_canvas_desktop_lib::db::repositories::graph::{
    ClaimKind, EvidenceStatus, GraphNodePatch, GraphRepository, Historicity, NewGraphNode,
    PlaceCoverage, QlArc, QlCompletenessStatus, QlForm, QlTopology, TemporalRole,
};

#[test]
fn update_node_applies_patch_and_clears_with_some_none() {
    let (graph, run_id, database) = support::neo4j_test_graph();
    let repo = GraphRepository::new(graph, database);
    support::block_on(repo.ensure_schema()).expect("schema");

    let created = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: Some(format!("{run_id}:dynamic")),
        entity_type: "Dynamic".into(),
        title: format!("Monopoly {run_id}"),
        body: "[]".into(),
        coordinate: Some("#3".into()),
        source_coordinates: vec!["#3".into()],
        is_temporal: false,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
    }))
    .expect("create");

    let patched = support::block_on(repo.update_node(
        &created.graph_node_id,
        GraphNodePatch {
            title: Some(format!("Mono-poly {run_id}")),
            coordinate: Some(None), // clear
            evidence_tags: Some(vec!["interpretive".into()]),
            source_kind: Some(Some("theoretical-dynamic".into())),
            seed_schema_version: Some(None),
            historicity: Some(Some(Historicity::Theoretical)),
            claim_kind: Some(Some(ClaimKind::Interpretation)),
            evidence_status: Some(Some(EvidenceStatus::Interpretive)),
            temporal_role: Some(Some(TemporalRole::ClaimAboutTime)),
            place_coverage: Some(Some(PlaceCoverage::NotApplicable)),
            ql_form: Some(Some(QlForm::CompleteSixfold)),
            ql_unit_id: Some(Some("ql-monopoly".into())),
            ql_arc: Some(Some(QlArc::Day)),
            ql_topology: Some(Some(QlTopology::Torus)),
            ql_schema_version: Some(Some(3)),
            ql_source_coordinates: Some(vec!["Canon/ql/monopoly.md#unit".into()]),
            ql_completeness_status: Some(Some(QlCompletenessStatus::Complete)),
            ..Default::default()
        },
    ))
    .expect("update");
    assert_eq!(patched.title, format!("Mono-poly {run_id}"));
    assert_eq!(patched.coordinate, None);
    assert_eq!(patched.historicity, Some(Historicity::Theoretical));
    assert_eq!(patched.ql_form, Some(QlForm::CompleteSixfold));

    let cleared = support::block_on(repo.update_node(
        &created.graph_node_id,
        GraphNodePatch {
            source_kind: Some(None),
            ql_form: Some(None),
            ql_unit_id: Some(None),
            ..Default::default()
        },
    ))
    .expect("clear nullable metadata");
    assert_eq!(cleared.source_kind, None);
    assert_eq!(cleared.ql_form, None);
    assert_eq!(cleared.ql_unit_id, None);

    support::block_on(repo.delete_node(&created.graph_node_id)).expect("delete");
    let after = support::block_on(repo.get_node(&created.graph_node_id)).expect("get");
    assert!(after.is_none(), "node deleted");
}

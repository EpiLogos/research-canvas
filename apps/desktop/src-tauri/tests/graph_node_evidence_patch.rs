// apps/desktop/src-tauri/tests/graph_node_evidence_patch.rs
mod support;

use research_canvas_desktop_lib::db::repositories::graph::{
    GraphNodePatch, GraphRepository, NewGraphNode,
};

#[test]
fn update_node_patches_evidence_tags_and_clears_source_kind() {
    let (graph, run_id, database) = support::neo4j_test_graph();
    let repo = GraphRepository::new(graph, database);
    support::block_on(repo.ensure_schema()).expect("schema");

    let created = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: None,
        entity_type: "Source".into(),
        title: format!("Archive fragment {run_id}"),
        body: "[]".into(),
        coordinate: None,
        source_coordinates: vec![],
        is_temporal: false,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
    }))
    .expect("create");

    let tagged = support::block_on(repo.update_node(
        &created.graph_node_id,
        GraphNodePatch {
            evidence_tags: Some(vec!["archive".into(), "contested".into()]),
            source_kind: Some(Some("archive".into())),
            ..Default::default()
        },
    ))
    .expect("tag evidence");
    assert_eq!(tagged.evidence_tags, vec!["archive", "contested"]);
    assert_eq!(tagged.source_kind.as_deref(), Some("archive"));

    let cleared = support::block_on(repo.update_node(
        &created.graph_node_id,
        GraphNodePatch {
            evidence_tags: Some(vec![]),
            source_kind: Some(None),
            ..Default::default()
        },
    ))
    .expect("clear evidence");
    assert_eq!(cleared.evidence_tags, Vec::<String>::new());
    assert_eq!(cleared.source_kind, None);

    let read_back = support::block_on(repo.get_node(&created.graph_node_id))
        .expect("read back")
        .expect("node exists");
    assert_eq!(read_back.evidence_tags, Vec::<String>::new());
    assert_eq!(read_back.source_kind, None);

    support::block_on(repo.delete_node(&created.graph_node_id)).expect("delete");
}

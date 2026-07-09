// apps/desktop/src-tauri/tests/graph_list_nodes.rs
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::repositories::graph::{GraphRepository, NewGraphNode};

#[test]
fn timeline_lens_returns_only_temporal_nodes() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    let event = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: None,
        entity_type: "Event".into(),
        title: format!("Banda {run_id}"),
        body: "[]".into(),
        coordinate: None,
        source_coordinates: vec![],
        is_temporal: true,
        valid_from: Some("1621".into()),
        valid_to: Some("1621".into()),
        temporal_precision: Some("year".into()),
    }))
    .expect("event");
    let archetype = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: None,
        entity_type: "Archetype".into(),
        title: format!("Antichrist {run_id}"),
        body: "[]".into(),
        coordinate: None,
        source_coordinates: vec![],
        is_temporal: false,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
    }))
    .expect("archetype");

    let timeline = support::block_on(repo.list_nodes_for_lens("timeline")).expect("timeline");
    assert!(timeline
        .iter()
        .any(|n| n.graph_node_id == event.graph_node_id));
    assert!(
        !timeline
            .iter()
            .any(|n| n.graph_node_id == archetype.graph_node_id),
        "trans-temporal archetype excluded from timeline lens"
    );

    let canvas = support::block_on(repo.list_nodes_for_lens("canvas")).expect("canvas");
    assert!(canvas
        .iter()
        .any(|n| n.graph_node_id == event.graph_node_id));
    assert!(
        canvas
            .iter()
            .any(|n| n.graph_node_id == archetype.graph_node_id),
        "canvas lens includes all nodes"
    );

    let batch = support::block_on(
        repo.get_nodes(&[event.graph_node_id.clone(), archetype.graph_node_id.clone()]),
    )
    .expect("get_nodes");
    assert_eq!(batch.len(), 2);

    // Teardown
    for id in [event.graph_node_id, archetype.graph_node_id] {
        support::block_on(async {
            graph
                .run_on(
                    &database,
                    query("MATCH (n {graph_node_id: $id}) DETACH DELETE n").param("id", id),
                )
                .await
                .expect("cleanup");
        });
    }
}

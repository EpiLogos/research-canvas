// apps/desktop/src-tauri/tests/graph_lighting.rs
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::repositories::graph::{GraphRepository, NewGraphNode};

#[test]
fn archetypal_lighting_returns_datable_instances() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    let operator = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: None,
        entity_type: "Dynamic".into(),
        title: format!("Monopoly mechanism {run_id}"),
        body: "[]".into(), coordinate: None, source_coordinates: vec![],
        is_temporal: false, valid_from: None, valid_to: None, temporal_precision: None,
    })).expect("operator");
    let event = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: None,
        entity_type: "Event".into(),
        title: format!("VOC charter {run_id}"),
        body: "[]".into(), coordinate: None, source_coordinates: vec![],
        is_temporal: true, valid_from: Some("1602".into()), valid_to: Some("1602".into()),
        temporal_precision: Some("year".into()),
    })).expect("event");

    support::block_on(repo.connect_nodes(
        &event.graph_node_id, &operator.graph_node_id, "INSTANTIATES",
        serde_json::json!({ "dominance": "dominant" }),
    )).expect("connect");

    let lit = support::block_on(repo.archetypal_lighting(&operator.graph_node_id)).expect("lighting");
    assert_eq!(lit.operator.graph_node_id, operator.graph_node_id);
    assert_eq!(lit.instances.len(), 1);
    assert_eq!(lit.instances[0].node.graph_node_id, event.graph_node_id);
    assert_eq!(lit.instances[0].rel_type, "INSTANTIATES");
    assert_eq!(lit.instances[0].dominance.as_deref(), Some("dominant"));

    let inverse = support::block_on(repo.resonances_for_instance(&event.graph_node_id)).expect("inverse");
    assert!(inverse.iter().any(|li| li.node.graph_node_id == operator.graph_node_id));

    let hits = support::block_on(repo.search(&format!("VOC {run_id}"), 10)).expect("search");
    assert!(hits.iter().any(|n| n.graph_node_id == event.graph_node_id));

    for id in [operator.graph_node_id, event.graph_node_id] {
        support::block_on(async {
            graph.run_on(&database, query("MATCH (n {graph_node_id: $id}) DETACH DELETE n")
                .param("id", id)).await.expect("cleanup");
        });
    }
}

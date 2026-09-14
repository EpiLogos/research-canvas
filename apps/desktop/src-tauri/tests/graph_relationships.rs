// apps/desktop/src-tauri/tests/graph_relationships.rs
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::repositories::graph::{GraphRepository, NewGraphNode};

fn mk(repo: &GraphRepository, run_id: &str, title: &str, et: &str, temporal: bool) -> String {
    support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: Some(format!("{run_id}:{}", title.to_ascii_lowercase())),
        entity_type: et.into(),
        title: format!("{title} {run_id}"),
        body: "[]".into(),
        coordinate: None,
        source_coordinates: vec![],
        is_temporal: temporal,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
    }))
    .expect("create")
    .graph_node_id
}

#[test]
fn connect_list_and_disconnect_relationship() {
    let (graph, run_id, database) = support::neo4j_test_graph();
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    let event = mk(&repo, &run_id, "MK-ULTRA", "Event", true);
    let dynamic = mk(&repo, &run_id, "Monopoly", "Dynamic", false);

    let rel = support::block_on(repo.connect_nodes(
        &event,
        &dynamic,
        "INSTANTIATES",
        serde_json::json!({ "dominance": "dominant" }),
    ))
    .expect("connect");
    assert_eq!(rel.rel_type, "INSTANTIATES");
    assert_eq!(rel.source_graph_node_id, event);
    assert_eq!(rel.target_graph_node_id, dynamic);
    assert_eq!(rel.properties["dominance"], "dominant");

    let for_node = support::block_on(repo.relationships_for_node(&event)).expect("for_node");
    assert!(for_node.iter().any(|r| r.id == rel.id));

    support::block_on(repo.disconnect(&rel.id)).expect("disconnect");
    let after = support::block_on(repo.relationships_for_node(&event)).expect("after");
    assert!(
        !after.iter().any(|r| r.id == rel.id),
        "relationship removed"
    );

    for id in [event, dynamic] {
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

#[test]
fn located_at_relationship_carries_time_bounded_validity_properties() {
    let (graph, run_id, database) = support::neo4j_test_graph();
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    let event = mk(&repo, &run_id, "Council", "Event", true);
    let place = mk(&repo, &run_id, "Florence", "Place", true);

    // A LOCATED_AT edge with time-bounded validity: the council sat in
    // Florence only while it was in session (vision §3.4, ticket #9).
    let rel = support::block_on(repo.connect_nodes(
        &event,
        &place,
        "LOCATED_AT",
        serde_json::json!({
            "validFrom": "1438-04-09",
            "validTo": "1445-08-07",
        }),
    ))
    .expect("connect located_at");

    assert_eq!(rel.properties["validFrom"], "1438-04-09");
    assert_eq!(rel.properties["validTo"], "1445-08-07");

    let for_node = support::block_on(repo.relationships_for_node(&event)).expect("for_node");
    let persisted = for_node
        .iter()
        .find(|r| r.id == rel.id)
        .expect("relationship persisted");
    assert_eq!(persisted.properties["validFrom"], "1438-04-09");
    assert_eq!(persisted.properties["validTo"], "1445-08-07");

    support::block_on(repo.disconnect(&rel.id)).expect("disconnect");
    for id in [event, place] {
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

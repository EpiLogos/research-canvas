// apps/desktop/src-tauri/tests/graph_node_client_id.rs
// WS4a Task 1: create_node honours a client-supplied graph_node_id.
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::repositories::graph::{GraphRepository, NewGraphNode};

#[test]
fn create_node_honours_client_supplied_id() {
    let (graph, run_id, database) = support::neo4j_test_graph();
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    // --- Test 1: client-supplied id is used verbatim ---
    let wanted = format!("{run_id}:wanted");
    let created = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: Some(wanted.clone()),
        entity_type: "Work".into(),
        title: format!("Client-id {run_id}"),
        body: "[]".into(),
        coordinate: None,
        source_coordinates: vec![],
        is_temporal: false,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
    }))
    .expect("create_node with client id");

    assert_eq!(
        created.graph_node_id, wanted,
        "create_node must use the supplied graph_node_id verbatim"
    );

    // Round-trip: get_node returns the same id and title.
    let fetched = support::block_on(repo.get_node(&wanted))
        .expect("get_node")
        .expect("present");
    assert_eq!(fetched.title, format!("Client-id {run_id}"));
    assert_eq!(fetched.graph_node_id, wanted);

    // --- Test 2: None still mints a fresh non-empty id ---
    let minted = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: None,
        entity_type: "Work".into(),
        title: format!("Minted {run_id}"),
        body: "[]".into(),
        coordinate: None,
        source_coordinates: vec![],
        is_temporal: false,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
    }))
    .expect("create_node with None id");

    assert!(
        !minted.graph_node_id.is_empty(),
        "create_node with None must mint a non-empty id"
    );
    // The minted id must NOT equal our wanted id (it's random).
    assert_ne!(minted.graph_node_id, wanted);

    // Teardown: delete both nodes.
    support::block_on(async {
        graph
            .run_on(
                &database,
                query("MATCH (n {graph_node_id: $id}) DETACH DELETE n").param("id", wanted.clone()),
            )
            .await
            .expect("cleanup wanted");
        graph
            .run_on(
                &database,
                query("MATCH (n {graph_node_id: $id}) DETACH DELETE n")
                    .param("id", minted.graph_node_id.clone()),
            )
            .await
            .expect("cleanup minted");
    });
}

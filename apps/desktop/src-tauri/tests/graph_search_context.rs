mod support;

use research_canvas_desktop_lib::db::repositories::graph::{GraphRepository, NewGraphNode};

#[test]
fn context_search_finds_terms_inside_blocknote_body_without_widening_ui_search() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph, database);
    support::block_on(repo.ensure_schema()).expect("schema");

    let body_term = format!("bodyonly{}", run_id.replace('-', ""));
    let body_node = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: None,
        entity_type: "Source".into(),
        title: format!("Context body fixture {run_id}"),
        body: format!(
            r#"[{{"type":"paragraph","content":[{{"type":"text","text":"The hidden retrieval phrase is {body_term}."}}]}}]"#
        ),
        coordinate: None,
        source_coordinates: vec![],
        is_temporal: false,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
    }))
    .expect("create body node");

    let title_node = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: None,
        entity_type: "Source".into(),
        title: format!("{body_term} visible title fixture"),
        body: "[]".into(),
        coordinate: None,
        source_coordinates: vec![],
        is_temporal: false,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
    }))
    .expect("create title node");

    let ui_results = support::block_on(repo.search(&body_term, 10)).expect("ui search");
    assert!(
        !ui_results
            .iter()
            .any(|node| node.graph_node_id == body_node.graph_node_id),
        "existing UI search should not match body-only text"
    );

    let context_results =
        support::block_on(repo.search_context(&body_term, 10)).expect("context search");
    assert!(
        context_results
            .iter()
            .any(|node| node.graph_node_id == body_node.graph_node_id),
        "context search should match BlockNote JSON body text"
    );
    assert!(
        context_results
            .iter()
            .any(|node| node.graph_node_id == title_node.graph_node_id),
        "context search should retain title matches"
    );

    let malformed_query = format!("\"{body_term}");
    let malformed_results = support::block_on(repo.search_context(&malformed_query, 10))
        .expect("malformed context search should degrade");
    assert!(
        malformed_results
            .iter()
            .any(|node| node.graph_node_id == body_node.graph_node_id),
        "context search should sanitize malformed Lucene syntax"
    );

    let negative_limit_results =
        support::block_on(repo.search_context(&body_term, -1)).expect("negative limit search");
    assert!(
        negative_limit_results.is_empty(),
        "negative limits should not be passed through to Neo4j"
    );

    support::block_on(repo.delete_node(&body_node.graph_node_id)).expect("delete body node");
    support::block_on(repo.delete_node(&title_node.graph_node_id)).expect("delete title node");
}

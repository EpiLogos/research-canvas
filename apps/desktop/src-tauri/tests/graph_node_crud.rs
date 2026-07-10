// apps/desktop/src-tauri/tests/graph_node_crud.rs
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::repositories::graph::{GraphRepository, NewGraphNode};

#[test]
fn create_then_get_node_round_trips_substance_and_labels() {
    let (graph, run_id, database) = support::neo4j_test_graph();
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    let created = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: Some(format!("{run_id}:figure")),
        entity_type: "Figure".into(),
        title: format!("Cosimo {run_id}"),
        body: "[]".into(),
        coordinate: Some("#2".into()),
        source_coordinates: vec!["#2".into(), "L2".into()],
        is_temporal: true,
        valid_from: Some("1389".into()),
        valid_to: Some("1464".into()),
        temporal_precision: Some("year".into()),
    }))
    .expect("create_node");

    assert!(!created.graph_node_id.is_empty());
    assert_eq!(created.entity_type, "Figure");
    assert_eq!(
        created.source_coordinates,
        vec!["#2".to_string(), "L2".to_string()]
    );
    assert_eq!(created.body, "[]");

    let fetched = support::block_on(repo.get_node(&created.graph_node_id))
        .expect("get_node")
        .expect("present");
    assert_eq!(fetched.title, format!("Cosimo {run_id}"));
    assert_eq!(fetched.is_temporal, true);

    // The node must carry BOTH :TheoryNode and the entity-type label.
    let label_count: i64 = support::block_on(async {
        let mut rows = graph
            .execute_on(
                &database,
                query("MATCH (n:TheoryNode:Figure {graph_node_id: $id}) RETURN count(n) AS c")
                    .param("id", created.graph_node_id.clone()),
            )
            .await
            .expect("labels query");
        rows.next()
            .await
            .expect("row")
            .expect("some")
            .get::<i64>("c")
            .expect("c")
    });
    assert_eq!(label_count, 1, "node carries :TheoryNode and :Figure");

    let missing = support::block_on(repo.get_node("does-not-exist")).expect("get missing");
    assert!(missing.is_none());

    // Teardown
    support::block_on(async {
        graph
            .run_on(
                &database,
                query("MATCH (n {graph_node_id: $id}) DETACH DELETE n")
                    .param("id", created.graph_node_id.clone()),
            )
            .await
            .expect("cleanup");
    });
}

#[test]
fn create_constellation_node_carries_constellation_label() {
    let (graph, run_id, database) = support::neo4j_test_graph();
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    let created = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: Some(format!("{run_id}:constellation")),
        entity_type: "Constellation".into(),
        title: format!("QL Unit {run_id}"),
        body: "Nested interpretive grouping".into(),
        coordinate: Some("#2:L3/P4".into()),
        source_coordinates: vec!["#2".into(), "L3".into(), "P4".into()],
        is_temporal: true,
        valid_from: Some("1621-01-01".into()),
        valid_to: None,
        temporal_precision: Some("year".into()),
    }))
    .expect("create constellation node");

    assert_eq!(created.entity_type, "Constellation");
    assert_eq!(created.coordinate, Some("#2:L3/P4".to_string()));

    let label_count: i64 = support::block_on(async {
        let mut rows = graph
            .execute_on(
                &database,
                query(
                    "MATCH (n:TheoryNode:Constellation {graph_node_id: $id}) RETURN count(n) AS c",
                )
                .param("id", created.graph_node_id.clone()),
            )
            .await
            .expect("labels query");
        rows.next()
            .await
            .expect("row")
            .expect("some")
            .get::<i64>("c")
            .expect("c")
    });
    assert_eq!(
        label_count, 1,
        "node carries :TheoryNode and :Constellation"
    );

    support::block_on(async {
        graph
            .run_on(
                &database,
                query("MATCH (n {graph_node_id: $id}) DETACH DELETE n")
                    .param("id", created.graph_node_id.clone()),
            )
            .await
            .expect("cleanup");
    });
}

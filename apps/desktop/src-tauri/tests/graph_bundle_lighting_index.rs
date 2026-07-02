// Integration test (env-gated on Neo4j): build_graph_bundle POPULATES
// lightingIndex by enumerating Archetype/Dynamic operators and calling
// archetypal_lighting once per operator (the load-bearing population step the
// backend-less web timeline reads). Without it, lightingIndex ships empty.
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{
        graph::{GraphRepository, NewGraphNode},
        ProjectRepository,
    },
};
use research_canvas_desktop_lib::export::graph_bundle::build_graph_bundle;
use tempfile::tempdir;

#[test]
fn build_graph_bundle_populates_lighting_index_for_seeded_operator() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };

    // SQLite layout in a temp dir + a real canvas row (WS2 Task 13 pattern).
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("t.db");
    let db = Database::open(&db_path).unwrap();
    let project = ProjectRepository::new(db.connection())
        .create(
            "P".into(),
            "p".into(),
            None,
            dir.path().to_str().unwrap().into(),
            None,
            None,
            serde_json::json!({}),
        )
        .unwrap();
    let canvas_id = project.primary_canvas_id.unwrap();

    // One trans-temporal operator (Dynamic) + N datable instances INSTANTIATES it.
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");
    let operator = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: None,
        entity_type: "Dynamic".into(),
        title: format!("Monopoly mechanism {run_id}"),
        body: "[]".into(),
        coordinate: None,
        source_coordinates: vec![],
        is_temporal: false,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
    }))
    .expect("operator");

    let mut instance_ids = Vec::new();
    for (i, year) in ["1602", "1621", "1799"].iter().enumerate() {
        let event = support::block_on(repo.create_node(NewGraphNode {
            graph_node_id: None,
            entity_type: "Event".into(),
            title: format!("Instance {i} {run_id}"),
            body: "[]".into(),
            coordinate: None,
            source_coordinates: vec![],
            is_temporal: true,
            valid_from: Some((*year).into()),
            valid_to: Some((*year).into()),
            temporal_precision: Some("year".into()),
        }))
        .expect("event");
        support::block_on(repo.connect_nodes(
            &event.graph_node_id,
            &operator.graph_node_id,
            "INSTANTIATES",
            serde_json::json!({ "dominance": "dominant" }),
        ))
        .expect("connect");
        instance_ids.push(event.graph_node_id);
    }
    let expected_n = instance_ids.len();

    // Build the bundle against the live graph + the temp SQLite connection.
    let bundle = support::block_on(build_graph_bundle(
        &repo,
        db.connection(),
        &canvas_id,
        serde_json::json!({ "id": project.id, "displayName": "Antichrist" }),
    ))
    .expect("build bundle");

    // The load-bearing assertion: lighting_index is keyed by the operator's
    // graph_node_id and carries exactly the N seeded instances.
    let lit = bundle
        .lighting_index
        .get(&operator.graph_node_id)
        .expect("operator must appear in lighting_index");
    assert_eq!(lit.len(), expected_n, "all seeded instances are lit");
    for id in &instance_ids {
        assert!(
            lit.iter().any(|inst| &inst.node.graph_node_id == id),
            "instance {id} present in lighting_index"
        );
    }
    assert!(
        lit.iter().all(|inst| inst.rel_type == "INSTANTIATES"),
        "rel_type carried through"
    );
    assert!(
        lit.iter()
            .all(|inst| inst.dominance.as_deref() == Some("dominant")),
        "dominance carried through"
    );

    // Cleanup.
    let mut all_ids = instance_ids;
    all_ids.push(operator.graph_node_id);
    for id in all_ids {
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

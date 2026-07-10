mod support;
use neo4rs::query;

#[test]
fn required_config_rejects_missing_test_uri() {
    let error = support::Neo4jTestConfig::from_values(
        None,
        Some("antichrist-neo4j-integration"),
        Some("neo4j"),
        Some("integration-password"),
        Some("neo4j"),
        Some("run-123"),
    )
    .expect_err("a required graph test may not silently skip without a test URI");

    assert!(
        error.contains("NEO4J_TEST_URI"),
        "unexpected error: {error}"
    );
}

#[test]
fn required_config_rejects_the_development_endpoint_and_database_identity() {
    let dev_uri_error = support::Neo4jTestConfig::from_values(
        Some("bolt://127.0.0.1:17687"),
        Some("antichrist-neo4j-integration"),
        Some("neo4j"),
        Some("integration-password"),
        Some("neo4j"),
        Some("run-123"),
    )
    .expect_err("the persistent development endpoint must be refused");
    assert!(
        dev_uri_error.contains("development Neo4j"),
        "unexpected error: {dev_uri_error}"
    );

    let dev_database_error = support::Neo4jTestConfig::from_values(
        Some("bolt://127.0.0.1:27687"),
        Some("antichrist-neo4j-integration"),
        Some("neo4j"),
        Some("integration-password"),
        Some("development"),
        Some("run-123"),
    )
    .expect_err("a development database identity must be refused");
    assert!(
        dev_database_error.contains("development database"),
        "unexpected error: {dev_database_error}"
    );
}

#[test]
fn dedicated_test_configuration_is_accepted() {
    let config = support::Neo4jTestConfig::from_values(
        Some("bolt://127.0.0.1:27687"),
        Some("antichrist-neo4j-integration"),
        Some("neo4j"),
        Some("integration-password"),
        Some("neo4j"),
        Some("run-123"),
    )
    .expect("dedicated integration configuration");

    assert_eq!(config.uri, "bolt://127.0.0.1:27687");
    assert_eq!(config.run_namespace, "run-123");
}

#[test]
fn cleanup_deletes_only_the_current_run_namespace() {
    let (graph, run_id, database) = support::neo4j_test_graph();
    let survivor_id = format!("survivor:{}", uuid::Uuid::new_v4());

    support::block_on(async {
        for id in [
            format!("{run_id}:first"),
            format!("{run_id}:second"),
            survivor_id.clone(),
        ] {
            graph
                .run_on(
                    &database,
                    query("CREATE (:HarnessProbe {graph_node_id: $id})").param("id", id),
                )
                .await
                .expect("create harness probe");
        }
    });

    assert_eq!(
        support::cleanup_run_namespace(&graph, &database, &run_id),
        2
    );

    let (doomed_count, survivor_count): (i64, i64) = support::block_on(async {
        let mut rows = graph
            .execute_on(
                &database,
                query(
                    "MATCH (n) \
                     RETURN count(CASE WHEN n.graph_node_id STARTS WITH $prefix THEN 1 END) AS doomed, \
                            count(CASE WHEN n.graph_node_id = $survivor THEN 1 END) AS survivor",
                )
                .param("prefix", format!("{run_id}:"))
                .param("survivor", survivor_id.clone()),
            )
            .await
            .expect("count harness probes");
        let row = rows.next().await.expect("probe row").expect("probe result");
        (
            row.get::<i64>("doomed").expect("doomed count"),
            row.get::<i64>("survivor").expect("survivor count"),
        )
    });
    assert_eq!(doomed_count, 0, "current namespace is gone");
    assert_eq!(survivor_count, 1, "unrelated namespace survives");

    support::block_on(async {
        graph
            .run_on(
                &database,
                query("MATCH (n {graph_node_id: $id}) DETACH DELETE n").param("id", survivor_id),
            )
            .await
            .expect("cleanup survivor probe");
    });
}

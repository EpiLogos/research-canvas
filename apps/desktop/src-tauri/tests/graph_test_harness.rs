mod support;
use neo4rs::query;

const VALID_SENTINEL: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

fn config(
    uri: Option<&str>,
    database: Option<&str>,
    sentinel_token: Option<&str>,
) -> Result<support::Neo4jTestConfig, String> {
    support::Neo4jTestConfig::from_values(
        uri,
        Some("antichrist-neo4j-integration"),
        Some("neo4j"),
        Some("integration-password"),
        database,
        Some("run-123"),
        sentinel_token,
    )
}

#[test]
fn required_config_rejects_missing_test_uri_and_sentinel() {
    let missing_uri = config(None, Some("neo4j"), Some(VALID_SENTINEL))
        .expect_err("a required graph test may not silently skip without a test URI");
    assert!(
        missing_uri.contains("NEO4J_TEST_URI"),
        "unexpected error: {missing_uri}"
    );

    let missing_sentinel = config(Some("bolt://127.0.0.1:49152"), Some("neo4j"), None)
        .expect_err("a self-asserted instance label is not server identity proof");
    assert!(
        missing_sentinel.contains("NEO4J_TEST_SENTINEL_TOKEN"),
        "unexpected error: {missing_sentinel}"
    );
}

#[test]
fn required_config_rejects_the_development_endpoint_and_database_identity() {
    let dev_uri_error = config(
        Some("bolt://127.0.0.1:17687"),
        Some("neo4j"),
        Some(VALID_SENTINEL),
    )
    .expect_err("the persistent development endpoint must be refused");
    assert!(
        dev_uri_error.contains("development Neo4j"),
        "unexpected error: {dev_uri_error}"
    );

    let dev_database_error = config(
        Some("bolt://127.0.0.1:49152"),
        Some("development"),
        Some(VALID_SENTINEL),
    )
    .expect_err("a development database identity must be refused");
    assert!(
        dev_database_error.contains("development database"),
        "unexpected error: {dev_database_error}"
    );
}

#[test]
fn required_config_accepts_only_plain_loopback_bolt_uris_with_explicit_ports() {
    for uri in [
        "neo4j://127.0.0.1:49152",
        "http://127.0.0.1:49152",
        "bolt://10.0.0.8:49152",
        "bolt://example.com:49152",
        "bolt://neo4j:password@127.0.0.1:49152",
        "bolt://127.0.0.1",
        "bolt://127.0.0.1:49152/neo4j",
        "bolt://127.0.0.1:49152?database=neo4j",
        "bolt://127.0.0.1:49152#fragment",
        "bolt://127.0.0.1:not-a-port",
        "bolt://127.0.0.1:0",
    ] {
        assert!(
            config(Some(uri), Some("neo4j"), Some(VALID_SENTINEL)).is_err(),
            "unsafe or malformed URI must be rejected: {uri}"
        );
    }

    let accepted = config(
        Some("bolt://127.0.0.1:49152"),
        Some("neo4j"),
        Some(VALID_SENTINEL),
    )
    .expect("dedicated loopback Bolt configuration");
    assert_eq!(accepted.uri, "bolt://127.0.0.1:49152");
    assert_eq!(accepted.run_namespace, "run-123");
}

#[test]
fn server_identity_rejects_a_mismatched_sentinel() {
    let (graph, _run_id, database) = support::neo4j_test_graph();
    let error = support::verify_server_identity(&graph, &database, "deliberately-wrong-token")
        .expect_err("the server must prove the wrapper-generated token");
    assert!(error.contains("sentinel"), "unexpected error: {error}");
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

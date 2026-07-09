// apps/desktop/src-tauri/tests/graph_seed_operators.rs
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::repositories::graph::{GraphRepository, OperatorSeed};

#[test]
fn seed_operators_is_idempotent_and_writes_operator_label() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    let coord = format!("#0-{run_id}");
    let seeds = vec![OperatorSeed {
        coordinate: coord.clone(),
        title: "Psychoid #0".into(),
        operator_kind: "psychoid".into(),
        position: Some("#0".into()),
        source_coordinates: vec![coord.clone()],
    }];

    let n1 = support::block_on(repo.seed_operators(&seeds)).expect("seed once");
    assert_eq!(n1, 1);
    // Idempotent: re-seeding the same coordinate does not duplicate.
    let n2 = support::block_on(repo.seed_operators(&seeds)).expect("seed twice");
    assert_eq!(n2, 1);

    let (count, is_operator, not_theory): (i64, bool, bool) = support::block_on(async {
        let mut rows = graph
            .execute_on(
                &database,
                query(
                    "MATCH (n {coordinate: $c}) \
             RETURN count(n) AS c, any(l IN labels(n) WHERE l = 'Operator') AS isOp, \
                    none(l IN labels(n) WHERE l = 'TheoryNode') AS notTheory",
                )
                .param("c", coord.clone()),
            )
            .await
            .expect("q");
        let row = rows.next().await.expect("row").expect("some");
        (
            row.get("c").unwrap(),
            row.get("isOp").unwrap(),
            row.get("notTheory").unwrap(),
        )
    });
    assert_eq!(count, 1, "exactly one operator node for the coordinate");
    assert!(is_operator, "carries :Operator");
    assert!(not_theory, "operators are NOT :TheoryNode");

    support::block_on(async {
        graph
            .run_on(
                &database,
                query("MATCH (n {coordinate: $c}) DETACH DELETE n").param("c", coord),
            )
            .await
            .expect("cleanup");
    });
}

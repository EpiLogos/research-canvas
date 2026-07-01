// apps/desktop/src-tauri/tests/neo4j_connect.rs
mod support;
use neo4rs::query;

#[test]
fn connect_runs_a_trivial_query() {
    let Some((graph, _run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let value: i64 = support::block_on(async {
        let mut rows = graph
            .execute_on(&database, query("RETURN 7 AS v"))
            .await
            .expect("execute");
        let row = rows.next().await.expect("row").expect("some row");
        row.get::<i64>("v").expect("v")
    });
    assert_eq!(value, 7);
}

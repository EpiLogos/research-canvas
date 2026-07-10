// apps/desktop/src-tauri/tests/graph_schema.rs
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::repositories::graph::GraphRepository;

#[test]
fn ensure_schema_creates_unique_constraint_on_graph_node_id() {
    let (graph, _run_id, database) = support::neo4j_test_graph();
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("ensure_schema");
    // ensure_schema is idempotent: a second pass must also succeed.
    support::block_on(repo.ensure_schema()).expect("ensure_schema twice");

    let has_constraint: bool = support::block_on(async {
        let mut rows = graph
            .execute_on(&database, query(
                "SHOW CONSTRAINTS YIELD name WHERE name = 'theory_node_id' RETURN count(*) AS c",
            ))
            .await
            .expect("show constraints");
        let row = rows.next().await.expect("row").expect("some");
        row.get::<i64>("c").expect("c") == 1
    });
    assert!(has_constraint, "theory_node_id constraint should exist");
}

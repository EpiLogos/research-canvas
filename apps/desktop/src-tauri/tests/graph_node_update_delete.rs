// apps/desktop/src-tauri/tests/graph_node_update_delete.rs
mod support;
use research_canvas_desktop_lib::db::repositories::graph::{
    GraphNodePatch, GraphRepository, NewGraphNode,
};

#[test]
fn update_node_applies_patch_and_clears_with_some_none() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph, database);
    support::block_on(repo.ensure_schema()).expect("schema");

    let created = support::block_on(repo.create_node(NewGraphNode {
        entity_type: "Dynamic".into(),
        title: format!("Monopoly {run_id}"),
        body: "[]".into(),
        coordinate: Some("#3".into()),
        source_coordinates: vec!["#3".into()],
        is_temporal: false,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
    }))
    .expect("create");

    let patched = support::block_on(repo.update_node(
        &created.graph_node_id,
        GraphNodePatch {
            title: Some(format!("Mono-poly {run_id}")),
            summary: Some("the spread of the one over the many".into()),
            coordinate: Some(None), // clear
            ..Default::default()
        },
    ))
    .expect("update");
    assert_eq!(patched.title, format!("Mono-poly {run_id}"));
    assert_eq!(patched.summary, "the spread of the one over the many");
    assert_eq!(patched.coordinate, None);

    support::block_on(repo.delete_node(&created.graph_node_id)).expect("delete");
    let after = support::block_on(repo.get_node(&created.graph_node_id)).expect("get");
    assert!(after.is_none(), "node deleted");
}

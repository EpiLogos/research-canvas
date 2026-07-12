mod support;

use neo4rs::query;
use research_canvas_desktop_lib::{
    agent::curation::{add_node_tag, attach_evidence},
    db::repositories::graph::{GraphNodePatch, GraphRepository, NewGraphNode},
};
use std::fs;
use tempfile::TempDir;

#[cfg(unix)]
fn symlink_file(original: &std::path::Path, link: &std::path::Path) {
    std::os::unix::fs::symlink(original, link).expect("create file symlink");
}

fn create_event(repo: &GraphRepository, run_id: &str, title: &str) -> String {
    support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: None,
        entity_type: "Event".into(),
        title: format!("{title} {run_id}"),
        body: "[]".into(),
        coordinate: None,
        source_coordinates: vec![],
        is_temporal: true,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
    }))
    .expect("create event")
    .graph_node_id
}

fn cleanup_ids(
    graph: research_canvas_desktop_lib::db::neo4j::SharedGraph,
    database: String,
    ids: Vec<String>,
) {
    if ids.is_empty() {
        return;
    }
    support::block_on(async {
        graph
            .run_on(
                &database,
                query("MATCH (n) WHERE n.graph_node_id IN $ids DETACH DELETE n").param("ids", ids),
            )
            .await
            .expect("cleanup exact ids");
    });
}

fn source_id_for_coordinate(
    graph: research_canvas_desktop_lib::db::neo4j::SharedGraph,
    database: String,
    coordinate: String,
) -> Option<String> {
    support::block_on(async {
        let mut rows = graph
            .execute_on(
                &database,
                query("MATCH (s:Source {coordinate: $coordinate}) RETURN s.graph_node_id AS id")
                    .param("coordinate", coordinate),
            )
            .await
            .expect("source lookup");
        rows.next()
            .await
            .expect("source lookup row")
            .and_then(|row| row.get("id").ok())
    })
}

#[test]
fn add_node_tag_appends_validated_tag_and_is_idempotent() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph, database);
    support::block_on(repo.ensure_schema()).expect("schema");

    let node_id = create_event(&repo, &run_id, "Tagged event");
    support::block_on(repo.update_node(
        &node_id,
        GraphNodePatch {
            evidence_tags: Some(vec!["archive".into()]),
            ..Default::default()
        },
    ))
    .expect("seed evidence tag");

    let added =
        support::block_on(add_node_tag(&repo, &node_id, "  contested  ")).expect("add node tag");
    assert!(added.changed);
    assert_eq!(added.path, node_id);
    assert_eq!(added.detail, "added tag 'contested'");

    let read_back = support::block_on(repo.get_node(&node_id))
        .expect("read tagged node")
        .expect("tagged node exists");
    assert_eq!(read_back.evidence_tags, vec!["archive", "contested"]);

    let duplicate = support::block_on(add_node_tag(&repo, &node_id, "contested"))
        .expect("add duplicate node tag");
    assert!(!duplicate.changed);
    assert_eq!(duplicate.detail, "tag 'contested' already present");

    let after_duplicate = support::block_on(repo.get_node(&node_id))
        .expect("read tagged node")
        .expect("tagged node exists");
    assert_eq!(after_duplicate.evidence_tags, vec!["archive", "contested"]);

    support::block_on(repo.delete_node(&node_id)).expect("delete event");
}

#[test]
fn concurrent_node_tag_additions_do_not_overwrite_each_other() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    let node_id = create_event(&repo, &run_id, "Concurrent tag event");
    support::block_on(async {
        let repo_a = GraphRepository::new(graph.clone(), database.clone());
        let repo_b = GraphRepository::new(graph.clone(), database.clone());
        let first = add_node_tag(&repo_a, &node_id, "archive");
        let second = add_node_tag(&repo_b, &node_id, "contested");
        let (first, second) = tokio::join!(first, second);
        first.expect("first tag");
        second.expect("second tag");
    });

    let read_back = support::block_on(repo.get_node(&node_id))
        .expect("read tagged node")
        .expect("tagged node exists");
    assert!(read_back.evidence_tags.contains(&"archive".to_string()));
    assert!(read_back.evidence_tags.contains(&"contested".to_string()));
    assert_eq!(read_back.evidence_tags.len(), 2);

    cleanup_ids(graph, database, vec![node_id]);
}

#[test]
fn add_node_tag_rejects_invalid_tags_without_mutating_node() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph, database);
    support::block_on(repo.ensure_schema()).expect("schema");

    let node_id = create_event(&repo, &run_id, "Invalid tag event");

    let error = support::block_on(add_node_tag(&repo, &node_id, "#unsafe"))
        .expect_err("invalid graph tag should error");
    assert!(
        error
            .to_string()
            .contains("unsupported frontmatter characters"),
        "unexpected error: {error}"
    );

    let read_back = support::block_on(repo.get_node(&node_id))
        .expect("read node after invalid tag")
        .expect("node exists");
    assert_eq!(read_back.evidence_tags, Vec::<String>::new());

    support::block_on(repo.delete_node(&node_id)).expect("delete event");
}

#[test]
fn attach_evidence_creates_source_and_sourced_from_once_for_canonical_file_path() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    let temp_dir = TempDir::new().expect("create temp dir");
    let source_path = temp_dir.path().join("archive").join("fragment.md");
    fs::create_dir_all(source_path.parent().expect("source parent")).expect("create source parent");
    fs::write(&source_path, "quote-bearing source").expect("write source fixture");
    let canonical_source = fs::canonicalize(&source_path)
        .expect("canonical source path")
        .to_string_lossy()
        .into_owned();

    let node_id = create_event(&repo, &run_id, "Sourced event");
    let first = support::block_on(attach_evidence(
        &repo,
        &node_id,
        &source_path,
        "the quoted fragment",
        "p. 12",
    ))
    .expect("attach evidence");

    assert!(first.changed);
    assert_eq!(first.path, canonical_source);
    assert_eq!(first.created_source, Some(true));
    assert_eq!(first.created_relationship, Some(true));
    let source_node_id = first
        .source_node_id
        .clone()
        .expect("report includes source node id");
    let relationship_id = first
        .relationship_id
        .clone()
        .expect("report includes relationship id");

    let source_node = support::block_on(repo.get_node(&source_node_id))
        .expect("read source node")
        .expect("source node exists");
    assert_eq!(source_node.entity_type, "Source");
    assert_eq!(source_node.title, "fragment.md");
    assert_eq!(source_node.source_kind.as_deref(), Some("vault-file"));

    let second = support::block_on(attach_evidence(
        &repo,
        &node_id,
        &source_path,
        "the quoted fragment",
        "p. 12",
    ))
    .expect("reattach same evidence");

    assert!(!second.changed);
    assert_eq!(
        second.source_node_id.as_deref(),
        Some(source_node_id.as_str())
    );
    assert_eq!(
        second.relationship_id.as_deref(),
        Some(relationship_id.as_str())
    );
    assert_eq!(second.created_source, Some(false));
    assert_eq!(second.created_relationship, Some(false));

    let third = support::block_on(attach_evidence(
        &repo,
        &node_id,
        &source_path,
        "the quoted fragment",
        "p. 13",
    ))
    .expect("reattach same evidence with different note");
    assert!(!third.changed);
    assert_eq!(
        third.relationship_id.as_deref(),
        Some(relationship_id.as_str())
    );

    let count: i64 = support::block_on(async {
        let mut rows = graph
            .execute_on(
                &database,
                query(
                    "MATCH (n {graph_node_id: $node_id})-[r:SOURCED_FROM]->(s {graph_node_id: $source_node_id})
                     WHERE r.sourcePath = $source_path AND r.quote = $quote AND r.note = $note
                     RETURN count(r) AS count",
                )
                .param("node_id", node_id.clone())
                .param("source_node_id", source_node_id.clone())
                .param("source_path", canonical_source.clone())
                .param("quote", "the quoted fragment")
                .param("note", "p. 12"),
            )
            .await
            .expect("count sourced_from relationships");
        rows.next()
            .await
            .expect("relationship count row")
            .expect("relationship count exists")
            .get("count")
            .expect("count value")
    });
    assert_eq!(
        count, 1,
        "reattaching evidence must not duplicate relationships"
    );
    let stored_note: String = support::block_on(async {
        let mut rows = graph
            .execute_on(
                &database,
                query(
                    "MATCH ()-[r:SOURCED_FROM]->()
                     WHERE elementId(r) = $relationship_id
                     RETURN r.note AS note",
                )
                .param("relationship_id", relationship_id.clone()),
            )
            .await
            .expect("read relationship note");
        rows.next()
            .await
            .expect("relationship note row")
            .expect("relationship note exists")
            .get("note")
            .expect("note value")
    });
    assert_eq!(stored_note, "p. 12");

    support::block_on(repo.delete_node(&node_id)).expect("delete event");
    support::block_on(repo.delete_node(&source_node_id)).expect("delete source");
}

#[test]
fn concurrent_evidence_attachments_reuse_one_source_node_for_canonical_path() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    let temp_dir = TempDir::new().expect("create temp dir");
    let source_path = temp_dir
        .path()
        .join(format!("concurrent-source-{run_id}.md"));
    fs::write(&source_path, "shared source").expect("write source fixture");
    let canonical_source = fs::canonicalize(&source_path)
        .expect("canonical source path")
        .to_string_lossy()
        .into_owned();
    let first_node = create_event(&repo, &run_id, "Concurrent sourced event A");
    let second_node = create_event(&repo, &run_id, "Concurrent sourced event B");

    support::block_on(async {
        let repo_a = GraphRepository::new(graph.clone(), database.clone());
        let repo_b = GraphRepository::new(graph.clone(), database.clone());
        let first = attach_evidence(&repo_a, &first_node, &source_path, "shared quote", "first");
        let second = attach_evidence(
            &repo_b,
            &second_node,
            &source_path,
            "shared quote",
            "second",
        );
        let (first, second) = tokio::join!(first, second);
        first.expect("first attach");
        second.expect("second attach");
    });

    let source_count: i64 = support::block_on(async {
        let mut rows = graph
            .execute_on(
                &database,
                query(
                    "MATCH (s:Source {coordinate: $coordinate})
                     RETURN count(s) AS count",
                )
                .param("coordinate", format!("vault-file:{canonical_source}")),
            )
            .await
            .expect("count source nodes");
        rows.next()
            .await
            .expect("source count row")
            .expect("source count exists")
            .get("count")
            .expect("count value")
    });
    assert_eq!(source_count, 1);

    let source_id = source_id_for_coordinate(
        graph.clone(),
        database.clone(),
        format!("vault-file:{canonical_source}"),
    );
    let mut ids = vec![first_node, second_node];
    if let Some(source_id) = source_id {
        ids.push(source_id);
    }
    cleanup_ids(graph, database, ids);
}

#[test]
fn concurrent_duplicate_evidence_attachment_creates_one_relationship() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    let temp_dir = TempDir::new().expect("create temp dir");
    let source_path = temp_dir
        .path()
        .join(format!("same-edge-source-{run_id}.md"));
    fs::write(&source_path, "same edge source").expect("write source fixture");
    let canonical_source = fs::canonicalize(&source_path)
        .expect("canonical source path")
        .to_string_lossy()
        .into_owned();
    let node_id = create_event(&repo, &run_id, "Same relationship event");

    let source_ids = support::block_on(async {
        let repo_a = GraphRepository::new(graph.clone(), database.clone());
        let repo_b = GraphRepository::new(graph.clone(), database.clone());
        let first = attach_evidence(&repo_a, &node_id, &source_path, "same quote", "same note");
        let second = attach_evidence(&repo_b, &node_id, &source_path, "same quote", "same note");
        let (first, second) = tokio::join!(first, second);
        vec![
            first
                .expect("first attach")
                .source_node_id
                .expect("first source id"),
            second
                .expect("second attach")
                .source_node_id
                .expect("second source id"),
        ]
    });

    let relationship_count: i64 = support::block_on(async {
        let mut rows = graph
            .execute_on(
                &database,
                query(
                    "MATCH (n {graph_node_id: $node_id})-[r:SOURCED_FROM]->(s {graph_node_id: $source_node_id})
                     WHERE r.sourcePath = $source_path AND r.quote = $quote
                     RETURN count(r) AS count",
                )
                .param("node_id", node_id.clone())
                .param("source_node_id", source_ids[0].clone())
                .param("source_path", canonical_source)
                .param("quote", "same quote"),
            )
            .await
            .expect("count sourced relationships");
        rows.next()
            .await
            .expect("relationship count row")
            .expect("relationship count exists")
            .get("count")
            .expect("count value")
    });
    assert_eq!(relationship_count, 1);

    let mut ids = vec![node_id];
    ids.extend(source_ids);
    ids.sort();
    ids.dedup();
    cleanup_ids(graph, database, ids);
}

#[cfg(unix)]
#[test]
fn attach_evidence_uses_canonical_file_basename_for_source_title() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph, database);
    support::block_on(repo.ensure_schema()).expect("schema");

    let temp_dir = TempDir::new().expect("create temp dir");
    let real_source = temp_dir.path().join("real-fragment.md");
    let alias_source = temp_dir.path().join("alias-name.md");
    fs::write(&real_source, "canonical title source").expect("write source fixture");
    symlink_file(&real_source, &alias_source);

    let node_id = create_event(&repo, &run_id, "Canonical title event");
    let report = support::block_on(attach_evidence(
        &repo,
        &node_id,
        &alias_source,
        "canonical quote",
        "canonical note",
    ))
    .expect("attach evidence through symlink");

    let source_node_id = report.source_node_id.expect("source node id");
    let source_node = support::block_on(repo.get_node(&source_node_id))
        .expect("read source node")
        .expect("source node exists");
    assert_eq!(source_node.title, "real-fragment.md");

    support::block_on(repo.delete_node(&node_id)).expect("delete event");
    support::block_on(repo.delete_node(&source_node_id)).expect("delete source");
}

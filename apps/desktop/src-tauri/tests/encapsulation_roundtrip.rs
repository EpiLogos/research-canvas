// apps/desktop/src-tauri/tests/encapsulation_roundtrip.rs
// Ticket #27 (refinement-2 D12): ENCAPSULATES round-trip against the real graph
// store — a constellation encapsulates as a single node into a parent and
// unfolds back with data intact. Recursion allowed; cycles prohibited.
//
// Gated on NEO4J_TEST_URI (dedicated test container). Run via
// `pnpm test:graph:integration`.

mod support;

use research_canvas_desktop_lib::db::{
    connection::Database,
    constellation_ingestion::{
        ingest_constellation, ConstellationIngestionInput, SourceKind,
    },
    repositories::{
        graph::{
            ContentOrigin, GraphRepository, NewGraphNode, NewGraphNodeMetadata,
            ENCAPSULATES_MODE_INGOING, ENCAPSULATES_MODE_OUTGOING,
        },
        ConstellationKind, ConstellationRepository,
    },
};
use std::fs;
use tempfile::tempdir;

fn make_node(
    repo: &GraphRepository,
    run_id: &str,
    suffix: &str,
    entity_type: &str,
    title: &str,
    body: &str,
) -> String {
    let id = format!("{run_id}:{suffix}");
    support::block_on(repo.create_node_with_metadata(
        NewGraphNode {
            graph_node_id: Some(id.clone()),
            entity_type: entity_type.into(),
            title: title.into(),
            body: body.into(),
            coordinate: None,
            source_coordinates: vec![],
            is_temporal: false,
            valid_from: None,
            valid_to: None,
            temporal_precision: None,
        },
        NewGraphNodeMetadata {
            content_origin: Some(ContentOrigin::UserAuthored),
            content_revision: Some(1),
            ..Default::default()
        },
    ))
    .expect("create node");
    id
}

#[test]
fn encapsulation_round_trips_with_data_intact() {
    let (graph, run_id, database) = support::neo4j_test_graph();
    let repo = GraphRepository::new(graph.clone(), database);
    support::block_on(repo.ensure_schema()).expect("ensure_schema");

    let member1 = make_node(&repo, &run_id, "m1", "Archetype", "Shadow", r#"[{"type":"paragraph","content":[{"type":"text","text":"shadow body"}]}]"#);
    let member2 = make_node(&repo, &run_id, "m2", "Work", "The Image", r#"[{"type":"paragraph","content":[{"type":"text","text":"work body"}]}]"#);
    let member3 = make_node(&repo, &run_id, "m3", "Place", "Banda", r#"[{"type":"paragraph","content":[{"type":"text","text":"place body"}]}]"#);
    let container = make_node(&repo, &run_id, "c1", "Constellation", "Triad field", "[]");

    for member in [&member1, &member2, &member3] {
        support::block_on(repo.encapsulate(
            &container,
            member,
            ENCAPSULATES_MODE_OUTGOING,
            serde_json::json!({ "evidence_tags": ["constellation"] }),
        ))
        .expect("encapsulate member");
    }

    // Unfold back: all three members return with data intact.
    let unfolded = support::block_on(repo.unfold_constellation(&container)).expect("unfold");
    let mut titles: Vec<String> = unfolded.iter().map(|node| node.title.clone()).collect();
    titles.sort_unstable();
    assert_eq!(titles, ["Banda", "Shadow", "The Image"]);

    let member2_after = support::block_on(repo.get_node(&member2))
        .expect("get member")
        .expect("member exists");
    assert_eq!(member2_after.body, r#"[{"type":"paragraph","content":[{"type":"text","text":"work body"}]}]"#);

    // list_encapsulation_edges carries the processual mode on each edge.
    let edges = support::block_on(repo.list_encapsulation_edges()).expect("list edges");
    let container_edges: Vec<_> = edges
        .iter()
        .filter(|edge| edge.source_graph_node_id == container)
        .collect();
    assert_eq!(container_edges.len(), 3);
    for edge in container_edges {
        assert_eq!(edge.rel_type, "ENCAPSULATES");
        assert_eq!(edge.properties["mode"], serde_json::json!("outgoing"));
    }
}

#[test]
fn self_encapsulation_is_prohibited() {
    let (graph, run_id, database) = support::neo4j_test_graph();
    let repo = GraphRepository::new(graph.clone(), database);
    support::block_on(repo.ensure_schema()).expect("ensure_schema");

    let node = make_node(&repo, &run_id, "self", "Constellation", "Self", "[]");
    let err = support::block_on(repo.encapsulate(
        &node,
        &node,
        ENCAPSULATES_MODE_OUTGOING,
        serde_json::json!({}),
    ))
    .expect_err("self-cycle must be rejected");
    assert!(err.contains("self-cycle prohibited"));
}

#[test]
fn recursion_allowed_but_transitive_cycles_prohibited() {
    let (graph, run_id, database) = support::neo4j_test_graph();
    let repo = GraphRepository::new(graph.clone(), database);
    support::block_on(repo.ensure_schema()).expect("ensure_schema");

    // Nested constellations: recursion is allowed.
    let a = make_node(&repo, &run_id, "a", "Constellation", "Outer", "[]");
    let b = make_node(&repo, &run_id, "b", "Constellation", "Inner", "[]");
    let c = make_node(&repo, &run_id, "c", "Constellation", "Innermost", "[]");

    support::block_on(repo.encapsulate(&a, &b, ENCAPSULATES_MODE_OUTGOING, serde_json::json!({})))
        .expect("a -> b");
    support::block_on(repo.encapsulate(&b, &c, ENCAPSULATES_MODE_OUTGOING, serde_json::json!({})))
        .expect("b -> c");

    let a_members = support::block_on(repo.unfold_constellation(&a)).expect("unfold a");
    assert_eq!(a_members.len(), 1);
    assert_eq!(a_members[0].graph_node_id, b);

    // Closing the cycle c -> a must be rejected: a already reaches c.
    let err = support::block_on(repo.encapsulate(&c, &a, ENCAPSULATES_MODE_OUTGOING, serde_json::json!({})))
        .expect_err("transitive cycle must be rejected");
    assert!(err.contains("cycle prohibited"));

    // The cycle prohibition is independent of insertion order.
    let x = make_node(&repo, &run_id, "x", "Constellation", "X", "[]");
    let y = make_node(&repo, &run_id, "y", "Constellation", "Y", "[]");
    support::block_on(repo.encapsulate(&x, &y, ENCAPSULATES_MODE_OUTGOING, serde_json::json!({})))
        .expect("x -> y");
    let err = support::block_on(repo.encapsulate(&y, &x, ENCAPSULATES_MODE_OUTGOING, serde_json::json!({})))
        .expect_err("back-edge must be rejected");
    assert!(err.contains("cycle prohibited"));

    // Ingoing reading (compression, articulation → ground) is accepted on a
    // fresh pair and records the processual mode on the edge.
    let p = make_node(&repo, &run_id, "p", "Constellation", "P", "[]");
    let q = make_node(&repo, &run_id, "q", "Constellation", "Q", "[]");
    support::block_on(repo.encapsulate(&p, &q, ENCAPSULATES_MODE_INGOING, serde_json::json!({})))
        .expect("p -> q ingoing is accepted");
    let edges = support::block_on(repo.list_encapsulation_edges()).expect("list edges");
    let pq: Vec<_> = edges
        .iter()
        .filter(|edge| edge.source_graph_node_id == p && edge.target_graph_node_id == q)
        .collect();
    assert_eq!(pq.len(), 1);
    assert_eq!(pq[0].properties["mode"], serde_json::json!("ingoing"));

    // An ingoing edge that would close a cycle is still prohibited.
    let err = support::block_on(repo.encapsulate(
        &q,
        &p,
        ENCAPSULATES_MODE_INGOING,
        serde_json::json!({}),
    ))
    .expect_err("q -> p ingoing closes a cycle and must be rejected");
    assert!(err.contains("cycle prohibited"));
}

#[test]
fn full_ingestion_round_trips_constellation_into_the_graph() {
    let (graph, run_id, database) = support::neo4j_test_graph();
    let repo = GraphRepository::new(graph.clone(), database);
    support::block_on(repo.ensure_schema()).expect("ensure_schema");

    let dir = tempdir().unwrap();
    let source_path = dir.path().join("raw-document.md");
    fs::write(
        &source_path,
        "The Image of the Antichrist\n==========================\n\nFirst passage.\nSecond passage.\n",
    )
    .unwrap();
    let db = Database::open(dir.path().join("ingestion.sqlite")).unwrap();

    let active = ConstellationRepository::new(db.connection())
        .create(
            "Active project".into(),
            "active-project".into(),
            None,
            dir.path().to_str().unwrap().into(),
            None,
            None,
            serde_json::json!({}),
        )
        .unwrap();

    // Members that will be encapsulated under the ingested constellation.
    let member1 = make_node(&repo, &run_id, "ing-member-1", "Archetype", "Shadow", "[]");
    let member2 = make_node(&repo, &run_id, "ing-member-2", "Place", "Banda", "[]");

    let input = ConstellationIngestionInput {
        profile_scope: "bootstrapping".into(),
        kind: ConstellationKind::Episode,
        title: "Ingested episode".into(),
        slug: "ingested-episode".into(),
        parent_constellation_id: Some(active.id.clone()),
        source_path: source_path.to_str().unwrap().into(),
        source_kind: SourceKind::Transcript,
        member_graph_node_ids: vec![member1.clone(), member2.clone()],
        agent_session_id: Some("wayfinder:test-session".into()),
        parse_kind: Some("mef".into()),
    };

    let report = support::block_on(ingest_constellation(db.connection(), &repo, &input))
        .expect("ingest constellation");
    assert_eq!(report.member_edges_written, 2);
    assert!(!report.constellation_id.is_empty());

    // The constellation node exists in the graph with provenance, and unfolds
    // back to its members with data intact.
    let constellation_node = support::block_on(repo.get_node(&report.constellation_id))
        .expect("get constellation node")
        .expect("constellation node exists");
    assert_eq!(constellation_node.entity_type.as_str(), "Constellation");
    assert_eq!(constellation_node.title, "Ingested episode");
    assert!(constellation_node
        .source_coordinates
        .contains(&source_path.to_str().unwrap().to_string()));

    let unfolded = support::block_on(repo.unfold_constellation(&report.constellation_id))
        .expect("unfold ingested constellation");
    let mut ids: Vec<String> = unfolded.iter().map(|node| node.graph_node_id.clone()).collect();
    ids.sort_unstable();
    let mut expected = vec![member1.clone(), member2.clone()];
    expected.sort_unstable();
    assert_eq!(ids, expected);
}

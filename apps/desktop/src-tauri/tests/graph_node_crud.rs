// apps/desktop/src-tauri/tests/graph_node_crud.rs
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::repositories::graph::{
    ClaimKind, ContentOrigin, EvidenceStatus, GraphRepository, Historicity, NewGraphNode,
    NewGraphNodeMetadata, PlaceCoverage, QlArc, QlCompletenessStatus, QlForm, QlTopology,
    TemporalRole,
};

#[test]
fn create_then_get_node_round_trips_substance_and_labels() {
    let (graph, run_id, database) = support::neo4j_test_graph();
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    let created = support::block_on(repo.create_node_with_metadata(
        NewGraphNode {
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
        },
        NewGraphNodeMetadata {
            evidence_tags: vec!["archival".into()],
            source_kind: Some("historical-figure".into()),
            content_origin: Some(ContentOrigin::CorpusCompiled),
            content_revision: Some(4),
            seed_schema_version: Some(2),
            body_source_coordinates: vec!["Canon/cosimo.md#reading".into()],
            historicity: Some(Historicity::Historical),
            claim_kind: Some(ClaimKind::Fact),
            evidence_status: Some(EvidenceStatus::Documented),
            temporal_role: Some(TemporalRole::ActiveDuring),
            place_coverage: Some(PlaceCoverage::Resolved),
            ql_form: Some(QlForm::PartialPositionalMap),
            ql_unit_id: Some("ql-cosimo".into()),
            ql_arc: Some(QlArc::Braided),
            ql_topology: Some(QlTopology::Composite),
            ql_schema_version: Some(2),
            ql_source_coordinates: vec!["Canon/ql/cosimo.md#unit".into()],
            ql_completeness_status: Some(QlCompletenessStatus::Partial),
        },
    ))
    .expect("create_node");

    assert!(!created.graph_node_id.is_empty());
    assert_eq!(created.entity_type, "Figure");
    assert_eq!(
        created.source_coordinates,
        vec!["#2".to_string(), "L2".to_string()]
    );
    assert_eq!(created.body, "[]");
    assert_eq!(created.content_origin, Some(ContentOrigin::CorpusCompiled));
    assert_eq!(created.content_revision, Some(4));
    assert_eq!(created.historicity, Some(Historicity::Historical));
    assert_eq!(created.ql_form, Some(QlForm::PartialPositionalMap));
    assert_eq!(created.ql_unit_id.as_deref(), Some("ql-cosimo"));

    let fetched = support::block_on(repo.get_node(&created.graph_node_id))
        .expect("get_node")
        .expect("present");
    assert_eq!(fetched.title, format!("Cosimo {run_id}"));
    assert_eq!(fetched.is_temporal, true);
    assert_eq!(fetched.evidence_tags, vec!["archival"]);
    assert_eq!(
        fetched.body_source_coordinates,
        vec!["Canon/cosimo.md#reading"]
    );
    assert_eq!(
        fetched.ql_source_coordinates,
        vec!["Canon/ql/cosimo.md#unit"]
    );

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

#[test]
fn create_claim_myth_and_interpretation_nodes_preserves_distinct_labels() {
    let (graph, run_id, database) = support::neo4j_test_graph();
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    for (entity_type, historicity, claim_kind) in [
        ("Claim", Historicity::Historical, ClaimKind::Allegation),
        ("Myth", Historicity::Mythic, ClaimKind::SymbolicParallel),
        (
            "Interpretation",
            Historicity::Theoretical,
            ClaimKind::Interpretation,
        ),
    ] {
        let created = support::block_on(repo.create_node_with_metadata(
            NewGraphNode {
                graph_node_id: Some(format!("{run_id}:{}", entity_type.to_ascii_lowercase())),
                entity_type: entity_type.into(),
                title: format!("{entity_type} {run_id}"),
                body: "[]".into(),
                coordinate: None,
                source_coordinates: vec![],
                is_temporal: false,
                valid_from: None,
                valid_to: None,
                temporal_precision: None,
            },
            NewGraphNodeMetadata {
                historicity: Some(historicity),
                claim_kind: Some(claim_kind),
                ..Default::default()
            },
        ))
        .expect("create distinct semantic entity");

        assert_eq!(created.entity_type, entity_type);
        let label_count: i64 = support::block_on(async {
            let cypher = format!(
                "MATCH (n:TheoryNode:{entity_type} {{graph_node_id: $id}}) RETURN count(n) AS c"
            );
            let mut rows = graph
                .execute_on(
                    &database,
                    query(&cypher).param("id", created.graph_node_id.clone()),
                )
                .await
                .expect("semantic label query");
            rows.next()
                .await
                .expect("row")
                .expect("some")
                .get::<i64>("c")
                .expect("c")
        });
        assert_eq!(label_count, 1, "node carries :{entity_type}");
    }

    assert_eq!(
        support::cleanup_run_namespace(&graph, &database, &run_id),
        3
    );
}

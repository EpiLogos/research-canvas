// apps/desktop/src-tauri/tests/graph_node_crud.rs
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::repositories::graph::{
    ClaimKind, ContentOrigin, EntityType, EvidenceStatus, GraphRepository, Historicity,
    NewGraphNode, NewGraphNodeMetadata, PlaceCoverage, QlArc, QlCompletenessStatus, QlForm,
    QlTopology, SeedGraphNode, TemporalRole,
};

fn seed_input(id: &str, revision: i64, body: &str) -> SeedGraphNode {
    SeedGraphNode {
        graph_node_id: id.into(),
        entity_type: "Claim".into(),
        title: "Seed title".into(),
        body: body.into(),
        summary: format!("summary-{revision}"),
        archetypal_resonance: None,
        coordinate: None,
        source_coordinates: vec!["Canon/seed.md".into()],
        evidence_tags: vec!["contested".into()],
        source_kind: Some("claim".into()),
        content_origin: ContentOrigin::Seed,
        content_revision: revision,
        seed_schema_version: 1,
        body_source_coordinates: vec!["Canon/seed.md#body".into()],
        historicity: Some(Historicity::Mixed),
        claim_kind: Some(ClaimKind::Allegation),
        evidence_status: Some(EvidenceStatus::Contested),
        temporal_role: Some(TemporalRole::ClaimAboutTime),
        place_coverage: Some(PlaceCoverage::Unknown),
        ql_form: None,
        ql_unit_id: None,
        ql_arc: None,
        ql_topology: None,
        ql_schema_version: None,
        ql_source_coordinates: vec![],
        ql_completeness_status: None,
        is_temporal: true,
        valid_from: Some("2000".into()),
        valid_to: None,
        temporal_precision: Some("year".into()),
    }
}

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
    assert_eq!(created.entity_type, EntityType::Figure);
    assert_eq!(
        created.source_coordinates,
        vec!["#2".to_string(), "L2".to_string()]
    );
    assert_eq!(created.body, "[]");
    assert_eq!(created.content_origin, Some(ContentOrigin::CorpusCompiled));
    assert_eq!(created.content_revision, Some(4));
    assert_eq!(created.seed_schema_version, Some(2));
    assert_eq!(
        created.body_source_coordinates,
        vec!["Canon/cosimo.md#reading"]
    );
    assert_eq!(created.historicity, Some(Historicity::Historical));
    assert_eq!(created.claim_kind, Some(ClaimKind::Fact));
    assert_eq!(created.evidence_status, Some(EvidenceStatus::Documented));
    assert_eq!(created.temporal_role, Some(TemporalRole::ActiveDuring));
    assert_eq!(created.place_coverage, Some(PlaceCoverage::Resolved));
    assert_eq!(created.ql_form, Some(QlForm::PartialPositionalMap));
    assert_eq!(created.ql_unit_id.as_deref(), Some("ql-cosimo"));
    assert_eq!(created.ql_arc, Some(QlArc::Braided));
    assert_eq!(created.ql_topology, Some(QlTopology::Composite));
    assert_eq!(created.ql_schema_version, Some(2));
    assert_eq!(
        created.ql_source_coordinates,
        vec!["Canon/ql/cosimo.md#unit"]
    );
    assert_eq!(
        created.ql_completeness_status,
        Some(QlCompletenessStatus::Partial)
    );
    assert_eq!(created.source_kind.as_deref(), Some("historical-figure"));
    assert_eq!(created.evidence_tags, vec!["archival"]);
    assert_eq!(created.valid_from.as_deref(), Some("1389"));
    assert_eq!(created.valid_to.as_deref(), Some("1464"));
    assert_eq!(
        created.temporal_precision.map(|value| value.as_str()),
        Some("year")
    );

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
    assert_eq!(
        serde_json::to_value(&fetched).unwrap(),
        serde_json::to_value(&created).unwrap()
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

    assert_eq!(created.entity_type, EntityType::Constellation);
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

        assert_eq!(created.entity_type.as_str(), entity_type);
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

#[test]
fn malformed_present_metadata_and_revision_ranges_fail_reads() {
    let (graph, run_id, database) = support::neo4j_test_graph();
    let repo = GraphRepository::new(graph.clone(), database.clone());
    for (suffix, property) in [
        ("controlled", "historicity: 42"),
        ("list", "ql_source_coordinates: 'not-a-list'"),
        ("negative", "content_revision: -1"),
        ("unsafe", "ql_schema_version: 9007199254740992"),
        ("core-string", "title: 42"),
        ("temporal-bool", "is_temporal: 'yes'"),
        ("coordinate", "coordinate: 42"),
        ("valid-from", "valid_from: true"),
    ] {
        let id = format!("{run_id}:malformed-{suffix}");
        let cypher = format!("CREATE (:TheoryNode:Event {{graph_node_id: $id, body: '[]', summary: '', source_coordinates: [], evidence_tags: [], {property}}})");
        support::block_on(graph.run_on(&database, query(&cypher).param("id", id.clone())))
            .expect("malformed fixture");
        let result = support::block_on(repo.get_node(&id));
        assert!(result.is_err(), "{suffix} rejected, got {result:?}");
    }
    assert_eq!(
        support::cleanup_run_namespace(&graph, &database, &run_id),
        8
    );
}

#[test]
fn reseed_preserves_authored_content_and_requires_a_newer_seed_revision() {
    let (graph, run_id, database) = support::neo4j_test_graph();
    let repo = GraphRepository::new(graph.clone(), database.clone());
    let seed_id = format!("{run_id}:seed-owned");
    let mut initial = seed_input(&seed_id, 2, "seed-v2");
    initial.ql_form = Some(QlForm::CompleteSixfold);
    initial.ql_unit_id = Some("seed-ql".into());
    initial.ql_arc = Some(QlArc::Day);
    initial.ql_topology = Some(QlTopology::Torus);
    initial.ql_schema_version = Some(2);
    initial.ql_source_coordinates = vec!["Canon/seed-ql.md".into()];
    initial.ql_completeness_status = Some(QlCompletenessStatus::Complete);
    let first = support::block_on(repo.upsert_seed_node(&initial)).expect("seed create");
    assert_eq!(first.body, "seed-v2");
    let frozen_updated_at = "2000-01-01T00:00:00Z";
    support::block_on(
        graph.run_on(
            &database,
            query("MATCH (n {graph_node_id: $id}) SET n.updated_at = $updated_at")
                .param("id", seed_id.clone())
                .param("updated_at", frozen_updated_at),
        ),
    )
    .expect("freeze timestamp before no-op reseeds");
    let same =
        support::block_on(repo.upsert_seed_node(&seed_input(&seed_id, 2, "same-revision-change")))
            .expect("same revision");
    assert_eq!(same.body, "seed-v2");
    assert_eq!(same.updated_at, frozen_updated_at);
    assert_eq!(same.ql_form, Some(QlForm::CompleteSixfold));
    let older = support::block_on(repo.upsert_seed_node(&seed_input(&seed_id, 1, "older")))
        .expect("older revision");
    assert_eq!(older.body, "seed-v2");
    assert_eq!(older.updated_at, frozen_updated_at);
    let mut clearing = seed_input(&seed_id, 3, "seed-v3");
    clearing.source_coordinates.clear();
    clearing.evidence_tags.clear();
    clearing.source_kind = None;
    clearing.body_source_coordinates.clear();
    clearing.historicity = None;
    clearing.claim_kind = None;
    clearing.evidence_status = None;
    clearing.temporal_role = None;
    clearing.place_coverage = None;
    clearing.is_temporal = false;
    clearing.valid_from = None;
    clearing.valid_to = None;
    clearing.temporal_precision = None;
    let newer = support::block_on(repo.upsert_seed_node(&clearing)).expect("newer revision");
    assert_eq!(newer.body, "seed-v3");
    assert_eq!(newer.summary, "summary-3");
    assert!(newer.source_coordinates.is_empty());
    assert!(newer.evidence_tags.is_empty());
    assert_eq!(newer.historicity, None);
    assert_eq!(newer.ql_form, None);
    assert!(newer.ql_source_coordinates.is_empty());
    assert!(!newer.is_temporal);
    assert_eq!(newer.valid_from, None);
    assert_eq!(newer.temporal_precision, None);

    let authored_id = format!("{run_id}:authored");
    support::block_on(graph.run_on(
        &database,
        query("CREATE (:TheoryNode:Source {graph_node_id: $id, title: 'Editorial', body: 'user body', summary: 'user summary', content_origin: 'user_authored', content_revision: '9', ql_form: 'complete_sixfold', ql_unit_id: 'editorial-ql', ql_source_coordinates: ['Editorial/ql.md'], source_coordinates: [], evidence_tags: [], is_temporal: true})")
            .param("id", authored_id.clone()),
    ))
    .expect("authored fixture");
    let authored =
        support::block_on(repo.upsert_seed_node(&seed_input(&authored_id, 99, "seed overwrite")))
            .expect("reseed authored node");
    assert_eq!(authored.entity_type, EntityType::Claim, "label corrected");
    assert_eq!(authored.body, "user body");
    assert_eq!(authored.summary, "user summary");
    assert_eq!(authored.content_origin, Some(ContentOrigin::UserAuthored));
    assert_eq!(authored.ql_form, Some(QlForm::CompleteSixfold));
    assert_eq!(authored.ql_unit_id.as_deref(), Some("editorial-ql"));
    assert_eq!(authored.ql_source_coordinates, vec!["Editorial/ql.md"]);
    assert_eq!(
        support::cleanup_run_namespace(&graph, &database, &run_id),
        2
    );
}

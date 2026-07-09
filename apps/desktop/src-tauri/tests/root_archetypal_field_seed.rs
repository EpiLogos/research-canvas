mod support;

use neo4rs::query;
use research_canvas_desktop_lib::db::{
    canvas_service::CanvasService,
    connection::Database,
    repositories::{
        canvas::CanvasRepository, graph::GraphRepository, layout::LayoutRepository,
        ProjectRepository,
    },
    root_archetypal_seed::seed_root_archetypal_field,
};
use serde_json::Value;
use std::collections::HashMap;
use tempfile::tempdir;

#[test]
fn root_archetypal_field_seed_writes_real_graph_project_layout_and_timeline() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    let dir = tempdir().expect("tempdir");
    let db_path = dir.path().join("root-field.sqlite");
    let db = Database::open(&db_path).expect("sqlite");
    let namespace = format!("test-root-field-{run_id}");

    let first = support::block_on(seed_root_archetypal_field(
        &repo,
        db.connection(),
        dir.path().to_str().unwrap(),
        &namespace,
    ))
    .expect("seed first");
    let second = support::block_on(seed_root_archetypal_field(
        &repo,
        db.connection(),
        dir.path().to_str().unwrap(),
        &namespace,
    ))
    .expect("seed second");

    assert_eq!(first.project_slug, "root-archetypal-field");
    assert_eq!(
        first.project_id, second.project_id,
        "project seeding is idempotent"
    );
    assert_eq!(
        first.canvas_id, second.canvas_id,
        "canvas seeding is idempotent"
    );
    assert!(
        second.nodes_written >= 30,
        "seed writes the ontology, not a demo slice"
    );
    assert!(
        second.relationships_written >= 20,
        "seed writes semantic relationships"
    );
    assert!(
        second.layouts_written >= 50,
        "root portals plus child constellation layouts are persisted"
    );

    let project = ProjectRepository::new(db.connection())
        .get_by_id(&first.project_id)
        .expect("project query")
        .expect("root project exists");
    assert_eq!(project.display_name, "Root Archetypal Field");
    assert_eq!(project.slug, "root-archetypal-field");

    let layouts = LayoutRepository::new(db.connection())
        .list_node_layout(&first.canvas_id)
        .expect("layouts");
    let portal = layouts
        .iter()
        .find(|l| l.graph_node_id == format!("{namespace}:devil-sixfold-lineage"))
        .expect("devil lineage root portal");
    assert_eq!(portal.position_y, -220.0);
    let portal_sidecar = canvas_sidecar(portal);
    assert_eq!(portal_sidecar["type"], "portal");
    assert_eq!(portal_sidecar["title"], "Devil Sixfold Spectral Lineage");
    assert_eq!(portal_sidecar["constellationKind"], "ql-unit");
    let devil_canvas_id = portal_sidecar["targetCanvasId"]
        .as_str()
        .expect("portal target canvas id")
        .to_string();

    let child_canvases = CanvasRepository::new(db.connection())
        .list_for_project(&first.project_id)
        .expect("child canvases");
    assert!(
        child_canvases
            .iter()
            .any(|c| c.id == devil_canvas_id && c.name == "Devil Sixfold Spectral Lineage"),
        "portal targets a real child canvas"
    );

    let root_ecology_canvas_id = layouts
        .iter()
        .find_map(|layout| {
            let sidecar = canvas_sidecar(layout);
            (sidecar["title"] == "Root Ecology").then(|| {
                sidecar["targetCanvasId"]
                    .as_str()
                    .expect("root ecology target canvas id")
                    .to_string()
            })
        })
        .expect("root ecology portal");
    let root_ecology_layouts = LayoutRepository::new(db.connection())
        .list_node_layout(&root_ecology_canvas_id)
        .expect("root ecology child layouts");
    let nested_devil = root_ecology_layouts
        .iter()
        .find(|layout| layout.graph_node_id == format!("{namespace}:devil-sixfold-lineage"))
        .expect("devil lineage nested as completed constellation");
    let nested_devil_sidecar = canvas_sidecar(nested_devil);
    assert_eq!(nested_devil_sidecar["type"], "portal");
    assert_eq!(nested_devil_sidecar["targetCanvasId"], devil_canvas_id);
    assert_eq!(nested_devil_sidecar["constellationKind"], "ql-unit");

    let child_layouts = LayoutRepository::new(db.connection())
        .list_node_layout(&devil_canvas_id)
        .expect("devil child layouts");
    let child_by_id = child_layouts
        .iter()
        .map(|layout| (layout.graph_node_id.as_str(), layout))
        .collect::<HashMap<_, _>>();
    for (index, slug) in [
        "devil",
        "mithra",
        "prometheus",
        "lucifer-venus",
        "satan-chronos",
        "pan-hen",
    ]
    .iter()
    .enumerate()
    {
        let layout = child_by_id
            .get(format!("{namespace}:{slug}").as_str())
            .copied()
            .unwrap_or_else(|| panic!("child layout for {slug}"));
        assert_eq!(layout.position_y, 0.0, "{slug} remains in the QL row");
        assert_eq!(layout.position_x, (index as f64) * 300.0);
    }

    let claim =
        support::block_on(repo.get_node(&format!("{namespace}:claim-epstein-intelligence-role")))
            .expect("claim query")
            .expect("claim node");
    assert_eq!(claim.entity_type, "Source");
    assert_eq!(claim.source_kind.as_deref(), Some("claim"));
    assert!(claim.evidence_tags.contains(&"contested".to_string()));

    let temporal =
        support::block_on(repo.get_node(&format!("{namespace}:mk-ultra-midnight-climax")))
            .expect("temporal query")
            .expect("temporal node");
    assert!(temporal.is_temporal);
    assert_eq!(temporal.valid_from.as_deref(), Some("1953-01-01"));
    assert_eq!(temporal.temporal_precision.as_deref(), Some("year"));
    assert!(temporal.evidence_tags.contains(&"documented".to_string()));
    assert!(temporal
        .source_coordinates
        .iter()
        .any(|c| c.contains("episode-2-research-timeline.md")));

    let constellation =
        support::block_on(repo.get_node(&format!("{namespace}:devil-sixfold-lineage")))
            .expect("constellation query")
            .expect("constellation node");
    assert_eq!(constellation.entity_type, "Constellation");
    assert_eq!(constellation.source_kind.as_deref(), Some("ql-unit"));
    assert!(constellation.evidence_tags.contains(&"ql_unit".to_string()));
    assert!(constellation
        .source_coordinates
        .iter()
        .any(|coord| coord == "#0"));

    let constellation_members: (i64, i64) = support::block_on(async {
        let mut rows = graph
            .execute_on(
                &database,
                query(
                    "MATCH (m)-[r:RESONATES_WITH]->(c:Constellation {graph_node_id: $id}) \
                     RETURN count(r) AS rels, count(DISTINCT m) AS members",
                )
                .param("id", format!("{namespace}:devil-sixfold-lineage")),
            )
            .await
            .expect("constellation relationship query");
        let row = rows.next().await.expect("row").expect("some");
        (row.get("rels").unwrap(), row.get("members").unwrap())
    });
    assert_eq!(
        constellation_members,
        (6, 6),
        "repeat seeding preserves one relationship per contained QL image"
    );

    let rel_props: (i64, Vec<String>, String) = support::block_on(async {
        let mut rows = graph
            .execute_on(
                &database,
                query(
                    "MATCH (a {graph_node_id: $src})-[r:INSTANTIATES]->(b {graph_node_id: $tgt}) \
                     RETURN count(r) AS c, r.evidence_tags AS evidenceTags, r.dominance AS dominance",
                )
                .param("src", format!("{namespace}:mk-ultra-midnight-climax"))
                .param("tgt", format!("{namespace}:mind-control-hypnosis")),
            )
            .await
            .expect("relationship query");
        let row = rows.next().await.expect("row").expect("some");
        (
            row.get("c").unwrap(),
            row.get("evidenceTags").unwrap(),
            row.get("dominance").unwrap(),
        )
    });
    assert_eq!(rel_props.0, 1, "relationship merge is idempotent");
    assert_eq!(rel_props.2, "dominant");
    assert!(rel_props.1.contains(&"documented".to_string()));

    let service = CanvasService::new(
        GraphRepository::new(graph.clone(), database.clone()),
        db_path.to_string_lossy().to_string(),
    );
    let canvas = support::block_on(service.load_canvas_view(&first.canvas_id, "canvas"))
        .expect("canvas view");
    assert!(canvas
        .nodes
        .iter()
        .any(|j| j.node.title == "Devil Sixfold Spectral Lineage"
            && j.node.entity_type == "Constellation"
            && j.layout.style["__canvasNode"]["type"] == "portal"));
    let historical_canvas_id = layouts
        .iter()
        .find_map(|layout| {
            let sidecar = canvas_sidecar(layout);
            (sidecar["title"] == "Historical Forms").then(|| {
                sidecar["targetCanvasId"]
                    .as_str()
                    .expect("historical target canvas id")
                    .to_string()
            })
        })
        .expect("historical portal");
    let timeline = support::block_on(service.load_canvas_view(&historical_canvas_id, "timeline"))
        .expect("timeline view");
    assert!(timeline
        .nodes
        .iter()
        .any(|j| j.node.title == "MK-ULTRA / Midnight Climax"));
    assert!(!timeline
        .nodes
        .iter()
        .any(|j| j.node.title == "Archetype-as-such"));

    support::block_on(async {
        graph
            .run_on(
                &database,
                query("MATCH (n) WHERE n.graph_node_id STARTS WITH $prefix DETACH DELETE n")
                    .param("prefix", format!("{namespace}:")),
            )
            .await
            .expect("cleanup");
    });
}

fn canvas_sidecar(
    layout: &research_canvas_desktop_lib::db::repositories::layout::NodeLayoutRecord,
) -> Value {
    serde_json::from_str::<Value>(&layout.style_json).expect("style json")["__canvasNode"].clone()
}

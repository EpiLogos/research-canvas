use research_canvas_desktop_lib::{
    commands::{
        constellations::{
            bootstrap_workspace_at, load_constellation_document_at,
            persist_constellation_document_at, PersistConstellationDocumentRequest,
        },
        graph::{
            connect_graph_nodes_local_first_at_path, disconnect_graph_nodes_local_first_at_path,
            ConnectGraphNodesRequest,
        },
        layout::{
            flush_canvas_layout_at, EdgeLayoutPayload, FlushCanvasLayoutRequest, NodeLayoutPayload,
        },
    },
    db::{
        connection::Database,
        repositories::{ConstellationRepository, EdgeLayoutRecord, LayoutRepository},
    },
};
use rusqlite::params;

fn edge(
    id: impl Into<String>,
    canvas_id: &str,
    source_graph_node_id: &str,
    target_graph_node_id: &str,
    relation_kind: &str,
) -> EdgeLayoutPayload {
    EdgeLayoutPayload {
        id: id.into(),
        canvas_id: canvas_id.to_string(),
        source_graph_node_id: source_graph_node_id.to_string(),
        target_graph_node_id: target_graph_node_id.to_string(),
        relation_kind: relation_kind.to_string(),
        source_handle_id: None,
        target_handle_id: None,
        style_json: "{}".to_string(),
    }
}

fn node_layout(graph_node_id: &str, canvas_id: &str, x: f64) -> NodeLayoutPayload {
    NodeLayoutPayload {
        graph_node_id: graph_node_id.to_string(),
        canvas_id: canvas_id.to_string(),
        position_x: x,
        position_y: 0.0,
        width: 240.0,
        height: 120.0,
        style_json: "{}".to_string(),
    }
}

fn semantic_layout_style<'a>(
    document: &'a research_canvas_desktop_lib::commands::constellations::ConstellationDocumentPayload,
    id: &str,
) -> Option<&'a str> {
    document
        .edges
        .iter()
        .find(|edge| edge.id == id)
        .map(|edge| edge.style.stroke.as_str())
}

#[tokio::test]
async fn normal_relationship_delete_removes_its_canvas_edge_through_flush_and_legacy_reload() {
    let directory = tempfile::tempdir().expect("temporary workspace");
    let database_path = directory.path().join("relationship-delete.sqlite");
    let bootstrap = bootstrap_workspace_at(&database_path).expect("bootstrap real root workspace");
    let historical_forms = {
        let database = Database::open(&database_path).expect("open workspace database");
        ConstellationRepository::new(database.connection())
            .list_descendants(&bootstrap.active_constellation_id)
            .expect("list root descendants")
            .into_iter()
            .find(|constellation| constellation.slug == "historical-forms")
            .expect("historical forms constellation")
    };
    let document = load_constellation_document_at(&database_path, &historical_forms.id)
        .expect("load historical forms canvas");
    let source_graph_node_id = "root-archetypal-field:banda-genocide";
    let target_graph_node_id = "root-archetypal-field:medici-template";
    assert!(document
        .nodes
        .iter()
        .any(|node| node.id == source_graph_node_id));
    assert!(document
        .nodes
        .iter()
        .any(|node| node.id == target_graph_node_id));

    let relationship = connect_graph_nodes_local_first_at_path(
        &database_path,
        &ConnectGraphNodesRequest {
            database_path: None,
            source_graph_node_id: source_graph_node_id.to_string(),
            target_graph_node_id: target_graph_node_id.to_string(),
            rel_type: "CONTESTS".to_string(),
            properties: serde_json::json!({ "reading": "test lifecycle" }),
            canonical_key: Some("test:historical-forms:delete-lifecycle".to_string()),
            origin: None,
            revision: None,
            expected_revision: None,
            source_coordinates: vec!["antichrist-vault/episodes/2/timeline.md".to_string()],
            evidence_tags: vec!["test".to_string()],
        },
        None,
    )
    .await
    .expect("normal local-first semantic creation");
    let semantic_layout_id = format!("graph:{}", relationship.relationship.id);
    let manual_layout_id = "manual:historical-forms:research-note";

    // The normal canvas snapshot includes both a semantic relationship
    // presentation and an unrelated manual line. The latter must survive the
    // semantic deletion and subsequent full-snapshot reconciliation.
    flush_canvas_layout_at(FlushCanvasLayoutRequest {
        database_path: database_path.to_string_lossy().to_string(),
        canvas_id: document.canvas_id.clone(),
        layouts: vec![],
        edges: vec![
            edge(
                &semantic_layout_id,
                &document.canvas_id,
                source_graph_node_id,
                target_graph_node_id,
                "CONTESTS",
            ),
            edge(
                manual_layout_id,
                &document.canvas_id,
                source_graph_node_id,
                target_graph_node_id,
                "reference",
            ),
        ],
        viewport_json: r#"{"x":0,"y":0,"zoom":1}"#.to_string(),
        app_state_json: "{}".to_string(),
    })
    .expect("persist initial edge presentation snapshot");

    assert!(
        disconnect_graph_nodes_local_first_at_path(
            &database_path,
            &relationship.relationship.id,
            None,
        )
        .await
        .expect("normal local-first semantic deletion"),
        "the initial delete writes a tombstone"
    );
    {
        let database = Database::open(&database_path).expect("reopen after tombstone");
        let layouts = LayoutRepository::new(database.connection())
            .list_edge_layout(&document.canvas_id)
            .expect("inspect transactional layout deletion");
        assert!(
            layouts.iter().all(|layout| layout.id != semantic_layout_id),
            "the same local transaction must remove graph:<relationship-id>"
        );
        assert!(layouts.iter().any(|layout| layout.id == manual_layout_id));
    }

    // Simulate a legacy/pre-fix row that somehow remained after the tombstone.
    // The document loader is a legacy fallback path and must filter it rather
    // than rendering a deleted semantic relation merely because it has layout.
    {
        let database = Database::open(&database_path).expect("reopen to simulate stale layout");
        LayoutRepository::new(database.connection())
            .upsert_edge_layout(&EdgeLayoutRecord {
                id: semantic_layout_id.clone(),
                canvas_id: document.canvas_id.clone(),
                source_graph_node_id: source_graph_node_id.to_string(),
                target_graph_node_id: target_graph_node_id.to_string(),
                relation_kind: "CONTESTS".to_string(),
                source_handle_id: None,
                target_handle_id: None,
                style_json: "{}".to_string(),
                created_at: "2026-07-14T00:00:00Z".to_string(),
                updated_at: "2026-07-14T00:00:00Z".to_string(),
            })
            .expect("seed stale legacy layout");
    }
    let filtered_layout_document =
        load_constellation_document_at(&database_path, &historical_forms.id)
            .expect("layout fallback filters tombstoned edge");
    assert!(filtered_layout_document
        .edges
        .iter()
        .all(|edge| edge.id != semantic_layout_id));
    assert!(filtered_layout_document
        .edges
        .iter()
        .any(|edge| edge.id == manual_layout_id));

    // Older sessions could additionally hold the relation in `canvas_edges`.
    // Inject a real legacy substance snapshot (including its required legacy
    // node rows) to prove this path and edge_layout fallback both reject the
    // tombstoned semantic id while retaining the unrelated manual edge.
    {
        let database = Database::open(&database_path).expect("reopen for legacy fixture");
        for node_id in ["legacy-layout-source", "legacy-layout-target"] {
            database
                .connection()
                .execute(
                    "INSERT INTO canvas_nodes(
                        id, canvas_id, type, title, position_x, position_y, width, height
                     ) VALUES (?1, ?2, 'note', ?1, 0, 0, 240, 120)",
                    params![node_id, &document.canvas_id],
                )
                .expect("insert legacy edge endpoint");
        }
        for edge_id in [&semantic_layout_id, manual_layout_id] {
            database
                .connection()
                .execute(
                    "INSERT INTO canvas_edges(
                        id, canvas_id, source_node_id, target_node_id,
                        relation_kind, directionality, label, note, style_json
                     ) VALUES (?1, ?2, 'legacy-layout-source', 'legacy-layout-target',
                        'CONTESTS', 'forward', 'CONTESTS', '',
                        '{\"stroke\":\"#888888\",\"width\":1,\"dashed\":false}')",
                    params![edge_id, &document.canvas_id],
                )
                .expect("insert legacy canvas edge");
        }
        database
            .connection()
            .execute(
                "DELETE FROM node_layout WHERE canvas_id = ?1",
                params![&document.canvas_id],
            )
            .expect("simulate a pre-layout-store legacy canvas");
    }
    let filtered_legacy_document =
        load_constellation_document_at(&database_path, &historical_forms.id)
            .expect("legacy document paths filter tombstoned edge");
    assert!(filtered_legacy_document
        .edges
        .iter()
        .all(|edge| edge.id != semantic_layout_id));
    assert!(filtered_legacy_document
        .edges
        .iter()
        .any(|edge| edge.id == manual_layout_id));

    // The normal post-delete canvas flush is a full snapshot containing only
    // the manual edge. It removes the stale row atomically, then the
    // annotations-only document persist and a fresh loader agree on the
    // durable absence of the semantic edge.
    flush_canvas_layout_at(FlushCanvasLayoutRequest {
        database_path: database_path.to_string_lossy().to_string(),
        canvas_id: document.canvas_id.clone(),
        layouts: vec![],
        edges: vec![edge(
            manual_layout_id,
            &document.canvas_id,
            source_graph_node_id,
            target_graph_node_id,
            "reference",
        )],
        viewport_json: r#"{"x":0,"y":0,"zoom":1}"#.to_string(),
        app_state_json: "{}".to_string(),
    })
    .expect("reconcile removed semantic layout row");
    persist_constellation_document_at(PersistConstellationDocumentRequest {
        annotations: vec![],
        canvas_id: document.canvas_id.clone(),
        database_path: database_path.to_string_lossy().to_string(),
        edges: vec![],
        nodes: vec![],
        constellation_id: historical_forms.id.clone(),
    })
    .expect("persist annotations-only constellation snapshot");

    let reloaded = load_constellation_document_at(&database_path, &historical_forms.id)
        .expect("fresh constellation document reload");
    assert!(reloaded
        .edges
        .iter()
        .all(|edge| edge.id != semantic_layout_id));
    assert!(reloaded
        .edges
        .iter()
        .any(|edge| edge.id == manual_layout_id));
    let database = Database::open(&database_path).expect("final database reopen");
    let layouts = LayoutRepository::new(database.connection())
        .list_edge_layout(&document.canvas_id)
        .expect("read final persisted layouts");
    assert_eq!(layouts.len(), 1);
    assert_eq!(layouts[0].id, manual_layout_id);
}

#[tokio::test]
async fn same_semantic_relationship_keeps_independent_presentations_in_two_canvases() {
    let directory = tempfile::tempdir().expect("temporary workspace");
    let database_path = directory.path().join("cross-canvas-layout.sqlite");
    let bootstrap = bootstrap_workspace_at(&database_path).expect("bootstrap root metadata");
    let (first, second) = {
        let database = Database::open(&database_path).expect("open workspace database");
        let constellations = ConstellationRepository::new(database.connection());
        let first = constellations
            .create(
                "First relation lens".to_string(),
                "first-relation-lens".to_string(),
                Some(bootstrap.active_constellation_id.clone()),
                directory.path().to_string_lossy().to_string(),
                None,
                None,
                serde_json::json!({}),
            )
            .expect("create first canvas constellation");
        let second = constellations
            .create(
                "Second relation lens".to_string(),
                "second-relation-lens".to_string(),
                Some(bootstrap.active_constellation_id.clone()),
                directory.path().to_string_lossy().to_string(),
                None,
                None,
                serde_json::json!({}),
            )
            .expect("create second canvas constellation");
        (first, second)
    };
    let first_canvas_id = first.primary_canvas_id.expect("first canvas");
    let second_canvas_id = second.primary_canvas_id.expect("second canvas");
    let source_graph_node_id = "root-archetypal-field:banda-genocide";
    let target_graph_node_id = "root-archetypal-field:medici-template";
    let relationship = connect_graph_nodes_local_first_at_path(
        &database_path,
        &ConnectGraphNodesRequest {
            database_path: None,
            source_graph_node_id: source_graph_node_id.to_string(),
            target_graph_node_id: target_graph_node_id.to_string(),
            rel_type: "CONTESTS".to_string(),
            properties: serde_json::json!({ "reading": "cross-canvas layout test" }),
            canonical_key: Some("test:cross-canvas-layout".to_string()),
            origin: None,
            revision: None,
            expected_revision: None,
            source_coordinates: vec!["antichrist-vault/episodes/2/timeline.md".to_string()],
            evidence_tags: vec!["test".to_string()],
        },
        None,
    )
    .await
    .expect("create normal semantic relationship");
    let semantic_layout_id = format!("graph:{}", relationship.relationship.id);

    for (canvas_id, stroke) in [(&first_canvas_id, "#a11"), (&second_canvas_id, "#1a1")] {
        flush_canvas_layout_at(FlushCanvasLayoutRequest {
            database_path: database_path.to_string_lossy().to_string(),
            canvas_id: canvas_id.clone(),
            layouts: vec![
                node_layout(source_graph_node_id, canvas_id, 0.0),
                node_layout(target_graph_node_id, canvas_id, 300.0),
            ],
            edges: vec![EdgeLayoutPayload {
                id: semantic_layout_id.clone(),
                canvas_id: canvas_id.clone(),
                source_graph_node_id: source_graph_node_id.to_string(),
                target_graph_node_id: target_graph_node_id.to_string(),
                relation_kind: "CONTESTS".to_string(),
                source_handle_id: None,
                target_handle_id: None,
                style_json: format!(r#"{{"stroke":"{stroke}","width":2}}"#),
            }],
            viewport_json: r#"{"x":0,"y":0,"zoom":1}"#.to_string(),
            app_state_json: "{}".to_string(),
        })
        .expect("persist independent canvas presentation");
    }

    let first_loaded =
        load_constellation_document_at(&database_path, &first.id).expect("reload first canvas");
    let second_loaded =
        load_constellation_document_at(&database_path, &second.id).expect("reload second canvas");
    assert_eq!(
        semantic_layout_style(&first_loaded, &semantic_layout_id),
        Some("#a11")
    );
    assert_eq!(
        semantic_layout_style(&second_loaded, &semantic_layout_id),
        Some("#1a1")
    );

    // Reconcile the first canvas after its local edge deletion. This is a
    // presentation change only; it must remove the first row without moving
    // or deleting the independent second-canvas presentation.
    flush_canvas_layout_at(FlushCanvasLayoutRequest {
        database_path: database_path.to_string_lossy().to_string(),
        canvas_id: first_canvas_id.clone(),
        layouts: vec![
            node_layout(source_graph_node_id, &first_canvas_id, 0.0),
            node_layout(target_graph_node_id, &first_canvas_id, 300.0),
        ],
        edges: vec![],
        viewport_json: r#"{"x":0,"y":0,"zoom":1}"#.to_string(),
        app_state_json: "{}".to_string(),
    })
    .expect("reconcile first canvas edge removal");

    let first_reloaded = load_constellation_document_at(&database_path, &first.id)
        .expect("reload first after reconciliation");
    let second_reloaded = load_constellation_document_at(&database_path, &second.id)
        .expect("reload second after first reconciliation");
    assert_eq!(
        semantic_layout_style(&first_reloaded, &semantic_layout_id),
        None
    );
    assert_eq!(
        semantic_layout_style(&second_reloaded, &semantic_layout_id),
        Some("#1a1")
    );

    // Removing a presentation from one canvas is deliberately local, but a
    // real relationship deletion is global. Its local tombstone must clear
    // the remaining `graph:<relationship-id>` presentation too, otherwise a
    // second constellation would revive a relation the user actually removed.
    assert!(disconnect_graph_nodes_local_first_at_path(
        &database_path,
        &relationship.relationship.id,
        None,
    )
    .await
    .expect("delete semantic relationship globally"));
    let second_after_semantic_delete = load_constellation_document_at(&database_path, &second.id)
        .expect("reload second after semantic deletion");
    assert_eq!(
        semantic_layout_style(&second_after_semantic_delete, &semantic_layout_id),
        None
    );
    let database = Database::open(&database_path).expect("inspect global presentation deletion");
    assert!(
        LayoutRepository::new(database.connection())
            .list_edge_layout(&second_canvas_id)
            .expect("load second canvas layout rows")
            .iter()
            .all(|layout| layout.id != semantic_layout_id),
        "the transactional semantic deletion clears every canvas presentation"
    );
}

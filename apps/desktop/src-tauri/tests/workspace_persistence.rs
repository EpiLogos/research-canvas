use std::{
    fs,
    path::{Path, PathBuf},
};

use research_canvas_desktop_lib::commands::constellations::{
    bootstrap_workspace_at, load_constellation_document_at, persist_constellation_document_at,
    AnnotationBoundsPayload, AnnotationPayload, AnnotationPointPayload, AnnotationStylePayload,
    CanvasEdgePayload, CanvasNodePayload, ConstellationDocumentPayload, EdgeStylePayload,
    PersistConstellationDocumentRequest, PositionPayload, SizePayload,
};
use research_canvas_desktop_lib::commands::search::{
    rebuild_constellation_search_index_command, search_constellation_command,
    RebuildConstellationSearchIndexRequest, SearchConstellationRequest,
};
use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{
        graph::ContentOrigin, layout::LayoutRepository, ConstellationRepository,
        NodeDocumentMutation, NodeDocumentRepository, SyncAcknowledgementMutation,
    },
    root_archetypal_seed::root_archetypal_document_inputs,
};
use serde_json::json;

fn workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .expect("workspace root")
}

fn fixture_path(relative_path: &str) -> String {
    workspace_root()
        .join(relative_path)
        .to_string_lossy()
        .to_string()
}

fn cleanup_database(path: &Path) {
    let _ = fs::remove_file(path);
}

fn session_database_path(session_name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "research-canvas-test-{session_name}-{}.sqlite",
        std::process::id()
    ))
}

fn session_timestamp() -> String {
    "2026-03-31T09:00:00Z".to_string()
}

fn string_set(db: &Database, sql: &str) -> std::collections::BTreeSet<String> {
    let mut statement = db.connection().prepare(sql).expect("prepare set query");
    statement
        .query_map([], |row| row.get::<_, String>(0))
        .expect("query set")
        .collect::<Result<_, _>>()
        .expect("collect set")
}

fn node_with_note_text(canvas_id: &str, id: &str, title: &str, content: &str) -> CanvasNodePayload {
    CanvasNodePayload {
        id: id.to_string(),
        canvas_id: canvas_id.to_string(),
        node_type: "note".to_string(),
        title: title.to_string(),
        position: PositionPayload { x: 120.0, y: 160.0 },
        size: SizePayload {
            width: 280.0,
            height: 180.0,
        },
        summary: content.to_string(),
        content: Some(content.to_string()),
        tags: vec!["note".to_string(), "session".to_string()],
        resource_kind: None,
        absolute_path: None,
        relative_path: None,
        mime_type: None,
        file_fingerprint: None,
        url: None,
        color: Some("#224466".to_string()),
        child_node_ids: Vec::new(),
        target_canvas_id: None,
        dot_colour: None,
        bg_colour: None,
        text_colour: None,
        thumbnail: None,
        sequence_caption: None,
        sequence_viewport: None,
        created_at: session_timestamp(),
        updated_at: session_timestamp(),
    }
}

fn resource_node(canvas_id: &str, id: &str, title: &str) -> CanvasNodePayload {
    CanvasNodePayload {
        id: id.to_string(),
        canvas_id: canvas_id.to_string(),
        node_type: "resource".to_string(),
        title: title.to_string(),
        position: PositionPayload { x: 420.0, y: 180.0 },
        size: SizePayload {
            width: 300.0,
            height: 200.0,
        },
        summary: "Research report".to_string(),
        content: None,
        tags: vec!["resource".to_string()],
        resource_kind: Some("markdown".to_string()),
        absolute_path: Some(fixture_path("tests/fixtures/sample-project/README.md")),
        relative_path: Some("README.md".to_string()),
        mime_type: Some("text/markdown".to_string()),
        file_fingerprint: Some("fingerprint-readme".to_string()),
        url: None,
        color: None,
        child_node_ids: Vec::new(),
        target_canvas_id: None,
        dot_colour: None,
        bg_colour: None,
        text_colour: None,
        thumbnail: None,
        sequence_caption: None,
        sequence_viewport: None,
        created_at: session_timestamp(),
        updated_at: session_timestamp(),
    }
}

fn connecting_edge(
    canvas_id: &str,
    id: &str,
    source_node_id: &str,
    target_node_id: &str,
) -> CanvasEdgePayload {
    CanvasEdgePayload {
        id: id.to_string(),
        canvas_id: canvas_id.to_string(),
        source_node_id: source_node_id.to_string(),
        target_node_id: target_node_id.to_string(),
        relation_kind: "supports".to_string(),
        directionality: "forward".to_string(),
        source_handle_id: Some("source-bottom".to_string()),
        target_handle_id: Some("target-top".to_string()),
        label: "Supports".to_string(),
        note: "Primary evidence".to_string(),
        style: EdgeStylePayload {
            stroke: "#0F172A".to_string(),
            width: 2.0,
            dashed: false,
        },
        sequencing: false,
        sequence_priority: 0,
        created_at: session_timestamp(),
        updated_at: session_timestamp(),
    }
}

fn ink_annotation(canvas_id: &str, id: &str) -> AnnotationPayload {
    AnnotationPayload {
        id: id.to_string(),
        canvas_id: canvas_id.to_string(),
        annotation_type: "ink".to_string(),
        points: vec![
            AnnotationPointPayload {
                x: 32.0,
                y: 36.0,
                pressure: Some(0.4),
            },
            AnnotationPointPayload {
                x: 78.0,
                y: 72.0,
                pressure: Some(0.6),
            },
        ],
        style: AnnotationStylePayload {
            color: "#7C2D12".to_string(),
            width: 4.0,
            opacity: 0.9,
        },
        text: Some("review this route".to_string()),
        bounds: AnnotationBoundsPayload {
            position: PositionPayload { x: 28.0, y: 28.0 },
            size: SizePayload {
                width: 120.0,
                height: 80.0,
            },
        },
        created_at: session_timestamp(),
        updated_at: session_timestamp(),
    }
}

fn persist_document(
    database_path: &Path,
    document: &ConstellationDocumentPayload,
    nodes: Vec<CanvasNodePayload>,
    edges: Vec<CanvasEdgePayload>,
    annotations: Vec<AnnotationPayload>,
) -> ConstellationDocumentPayload {
    persist_constellation_document_at(PersistConstellationDocumentRequest {
        annotations,
        canvas_id: document.canvas_id.clone(),
        database_path: database_path.to_string_lossy().to_string(),
        edges,
        nodes,
        constellation_id: document.constellation.id.clone(),
    })
    .expect("persist project document")
}

#[test]
fn bootstrap_workspace_surfaces_root_constellation_portals_and_preserves_layout_positions() {
    let database_path = session_database_path(&format!(
        "workspace-root-constellations-{}",
        std::process::id()
    ));
    cleanup_database(&database_path);

    let bootstrap = bootstrap_workspace_at(&database_path).expect("bootstrap workspace");
    assert_eq!(
        bootstrap.workspace_id,
        format!(
            "sqlite:{}",
            database_path
                .canonicalize()
                .expect("canonical database")
                .to_string_lossy()
        )
    );
    assert_eq!(
        PathBuf::from(&bootstrap.workspace_root),
        workspace_root(),
        "bootstrap exposes the monorepo root for workspace-wide commands"
    );
    let root = bootstrap
        .constellations
        .iter()
        .find(|constellation| constellation.slug == "root-archetypal-field")
        .expect("root archetypal constellation in bootstrap");
    assert_eq!(bootstrap.active_constellation_id, root.id);
    assert_eq!(root.name, "Root Archetypal Field");
    assert!(
        bootstrap
            .constellations
            .iter()
            .all(|constellation| constellation.slug != "sample-project"),
        "bootstrap must not fall back to the old sample project scaffold"
    );

    let document =
        load_constellation_document_at(&database_path, &bootstrap.active_constellation_id)
            .expect("load root constellation document");
    assert!(
        document.nodes.iter().any(|node| node.node_type == "portal"
            && node.title == "Root Ecology"
            && node.target_canvas_id.is_some()),
        "document fallback exposes first-class constellation portal nodes"
    );
    assert!(
        document.nodes.iter().any(|node| node.node_type == "portal"
            && node.title == "Ontological Unit"
            && node.target_canvas_id.is_some()),
        "QL units appear as portal constellations, not as a monolithic timeline"
    );
    assert!(
        document
            .nodes
            .iter()
            .all(|node| node.title != "Single historical timeline"),
        "timeline remains a lens, not a synthetic root constellation"
    );

    let db = Database::open(&database_path).expect("sqlite");
    let constellation = ConstellationRepository::new(db.connection())
        .get_by_id(&bootstrap.active_constellation_id)
        .expect("constellation lookup")
        .expect("root constellation exists");
    let root_canvas_id = constellation
        .primary_canvas_id
        .expect("root primary canvas id");
    let portal = LayoutRepository::new(db.connection())
        .list_node_layout(&root_canvas_id)
        .expect("root layouts")
        .into_iter()
        .find(|layout| layout.graph_node_id.ends_with(":root-ecology"))
        .expect("root ecology portal layout");

    db.connection()
        .execute(
            "UPDATE node_layout SET position_x = ?1 WHERE canvas_id = ?2 AND graph_node_id = ?3",
            rusqlite::params![1234.0_f64, root_canvas_id, portal.graph_node_id],
        )
        .expect("move portal layout");

    let second_bootstrap = bootstrap_workspace_at(&database_path).expect("bootstrap again");
    assert_eq!(
        second_bootstrap.active_constellation_id,
        bootstrap.active_constellation_id
    );
    let preserved_x: f64 = db
        .connection()
        .query_row(
            "SELECT position_x FROM node_layout WHERE canvas_id = ?1 AND graph_node_id = ?2",
            rusqlite::params![root_canvas_id, portal.graph_node_id],
            |row| row.get(0),
        )
        .expect("read moved portal layout");
    assert_eq!(
        preserved_x, 1234.0,
        "workspace bootstrap inserts missing constellation portals without reseeding over user layout"
    );
}

#[test]
fn production_bootstrap_materializes_the_complete_offline_graph_projection_idempotently() {
    let database_path = session_database_path(&format!(
        "workspace-local-projection-{}",
        std::process::id()
    ));
    cleanup_database(&database_path);

    let canonical = root_archetypal_document_inputs("root-archetypal-field");
    let first = bootstrap_workspace_at(&database_path).expect("first bootstrap");
    let db = Database::open(&database_path).expect("sqlite after first bootstrap");
    let metadata_count: i64 = db
        .connection()
        .query_row("SELECT count(*) FROM graph_node_metadata", [], |row| {
            row.get(0)
        })
        .expect("metadata count");
    let document_count: i64 = db
        .connection()
        .query_row("SELECT count(*) FROM node_document", [], |row| row.get(0))
        .expect("document count");
    assert_eq!(metadata_count as usize, canonical.len());
    assert_eq!(document_count as usize, canonical.len());

    let canonical_ids = canonical
        .iter()
        .map(|input| input.graph_node_id.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    let mut statement = db
        .connection()
        .prepare("SELECT graph_node_id FROM graph_node_metadata ORDER BY graph_node_id")
        .expect("prepare ids");
    let persisted_ids = statement
        .query_map([], |row| row.get::<_, String>(0))
        .expect("query ids")
        .collect::<Result<std::collections::BTreeSet<_>, _>>()
        .expect("collect ids");
    assert_eq!(
        persisted_ids,
        canonical_ids
            .into_iter()
            .map(str::to_string)
            .collect::<std::collections::BTreeSet<_>>()
    );

    let temporal: (String, String, String, String) = db
        .connection()
        .query_row(
            "SELECT historicity, temporal_role, valid_from, temporal_precision
             FROM graph_node_metadata
             WHERE graph_node_id='root-archetypal-field:balfour-declaration'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .expect("typed temporal metadata");
    assert_eq!(
        temporal,
        (
            "historical".into(),
            "occurred_at".into(),
            "1917-11-02".into(),
            "day".into()
        )
    );

    let pending = NodeDocumentRepository::new(db.connection())
        .list_pending_syncs()
        .expect("offline bootstrap has durable pending syncs");
    assert_eq!(pending.len(), canonical.len());
    assert!(pending.iter().all(|item| !item.document.neo4j_synced));

    let first_metadata_ids = string_set(
        &db,
        "SELECT graph_node_id FROM graph_node_metadata ORDER BY graph_node_id",
    );
    let first_document_ids = string_set(
        &db,
        "SELECT graph_node_id FROM node_document ORDER BY graph_node_id",
    );
    let first_canvas_ids = string_set(&db, "SELECT id FROM canvases ORDER BY id");
    let first_layout_refs = string_set(
        &db,
        "SELECT canvas_id || '|' || graph_node_id FROM node_layout
         ORDER BY canvas_id, graph_node_id",
    );

    let acknowledged_id = "root-archetypal-field:bank-of-england";
    assert_eq!(
        NodeDocumentRepository::new(db.connection())
            .acknowledge_sync(acknowledged_id, 1, ContentOrigin::Seed)
            .expect("acknowledge exact remote seed revision"),
        SyncAcknowledgementMutation::Updated
    );
    drop(statement);
    drop(db);

    let second = bootstrap_workspace_at(&database_path).expect("idempotent second bootstrap");
    assert_eq!(
        second.active_constellation_id,
        first.active_constellation_id
    );
    let db = Database::open(&database_path).expect("sqlite after second bootstrap");
    let second_metadata_ids = string_set(
        &db,
        "SELECT graph_node_id FROM graph_node_metadata ORDER BY graph_node_id",
    );
    let second_document_ids = string_set(
        &db,
        "SELECT graph_node_id FROM node_document ORDER BY graph_node_id",
    );
    let second_canvas_ids = string_set(&db, "SELECT id FROM canvases ORDER BY id");
    let second_layout_refs = string_set(
        &db,
        "SELECT canvas_id || '|' || graph_node_id FROM node_layout
         ORDER BY canvas_id, graph_node_id",
    );
    assert_eq!(second_metadata_ids, first_metadata_ids);
    assert_eq!(second_document_ids, first_document_ids);
    assert_eq!(second_canvas_ids, first_canvas_ids);
    assert_eq!(second_layout_refs, first_layout_refs);
    assert_eq!(second_metadata_ids.len(), metadata_count as usize);
    assert_eq!(second_document_ids.len(), document_count as usize);
    assert_eq!(second_canvas_ids.len(), 19);
    assert_eq!(second_layout_refs.len(), 159);
    let acknowledgement: (i64, String, i64) = db
        .connection()
        .query_row(
            "SELECT d.neo4j_synced, m.sync_state, m.remote_revision
             FROM node_document d JOIN graph_node_metadata m USING(graph_node_id)
             WHERE d.graph_node_id=?1",
            [acknowledged_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .expect("read preserved acknowledgement");
    assert_eq!(acknowledgement, (1, "synced".into(), 1));

    let edited_id = "root-archetypal-field:balfour-declaration";
    let edited = NodeDocumentRepository::new(db.connection())
        .apply_user_edit(edited_id, "user body", "user face", 1)
        .expect("edit canonical body");
    assert_eq!(edited, NodeDocumentMutation::Updated);
    db.connection()
        .execute(
            "UPDATE graph_node_metadata SET ql_form='partial_positional_map',
             ql_unit_id='reviewed-unit', ql_arc='braided', ql_topology='composite',
             ql_schema_version=23, ql_source_coordinates_json='[\"reviewed/source.md\"]',
             ql_completeness_status='partial'
             WHERE graph_node_id=?1",
            [edited_id],
        )
        .expect("simulate reviewed QL metadata");
    db.connection()
        .execute(
            "UPDATE node_layout SET position_x=4321, width=777,
             style_json='{\"preserve\":true}' WHERE graph_node_id=?1",
            [edited_id],
        )
        .expect("edit layout");
    drop(db);

    let third = bootstrap_workspace_at(&database_path).expect("preservation bootstrap");
    assert_eq!(third.active_constellation_id, first.active_constellation_id);
    let reopened = Database::open(&database_path).expect("reopen");
    let document = NodeDocumentRepository::new(reopened.connection())
        .get_node_document(edited_id)
        .expect("read edited document")
        .expect("edited document exists");
    assert_eq!(document.body, "user body");
    assert_eq!(document.summary, "user face");
    assert_eq!(document.content_origin, ContentOrigin::UserAuthored);
    assert_eq!(document.content_revision, 2);
    let retained: (
        String,
        String,
        String,
        String,
        i64,
        String,
        String,
        f64,
        f64,
        String,
    ) = reopened
        .connection()
        .query_row(
            "SELECT ql_form, ql_unit_id, ql_arc, ql_topology, ql_schema_version,
                    ql_source_coordinates_json, ql_completeness_status,
                    position_x, width, style_json
             FROM graph_node_metadata JOIN node_layout USING(graph_node_id)
             WHERE graph_node_id=?1 LIMIT 1",
            [edited_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                    row.get(9)?,
                ))
            },
        )
        .expect("preserved metadata and layout");
    assert_eq!(retained.0, "partial_positional_map");
    assert_eq!(retained.1, "reviewed-unit");
    assert_eq!(retained.2, "braided");
    assert_eq!(retained.3, "composite");
    assert_eq!(retained.4, 23);
    assert_eq!(retained.5, "[\"reviewed/source.md\"]");
    assert_eq!(retained.6, "partial");
    assert_eq!(retained.7, 4321.0);
    assert_eq!(retained.8, 777.0);
    assert_eq!(retained.9, "{\"preserve\":true}");
}

#[test]
fn production_bootstrap_rolls_back_full_projection_when_a_document_conflicts() {
    let database_path = session_database_path(&format!(
        "workspace-local-projection-conflict-{}",
        std::process::id()
    ));
    cleanup_database(&database_path);
    bootstrap_workspace_at(&database_path).expect("initial bootstrap");
    let db = Database::open(&database_path).expect("sqlite");
    let conflict_id = "root-archetypal-field:balfour-declaration";
    let missing_id = "root-archetypal-field:bank-of-england";
    let restored_title_id = "root-archetypal-field:opium-war";
    let historical_canvas_id: String = db
        .connection()
        .query_row(
            "SELECT c.id
             FROM canvases c
             JOIN projects p ON p.id=c.project_id
             WHERE p.slug='historical-forms' AND c.is_primary=1",
            [],
            |row| row.get(0),
        )
        .expect("historical forms canvas");
    db.connection()
        .execute(
            "UPDATE node_document SET body='same revision divergence' WHERE graph_node_id=?1",
            [conflict_id],
        )
        .expect("introduce explicit seed conflict");
    db.connection()
        .execute(
            "DELETE FROM node_document WHERE graph_node_id=?1",
            [missing_id],
        )
        .expect("delete document projection");
    db.connection()
        .execute(
            "DELETE FROM graph_node_metadata WHERE graph_node_id=?1",
            [missing_id],
        )
        .expect("delete metadata projection");
    db.connection()
        .execute(
            "UPDATE graph_node_metadata SET title='sentinel before rollback' WHERE graph_node_id=?1",
            [restored_title_id],
        )
        .expect("change structural projection");
    db.connection()
        .execute(
            "UPDATE canvases SET name='sentinel canvas name' WHERE id=?1",
            [&historical_canvas_id],
        )
        .expect("change bootstrap-managed canvas name");
    assert_eq!(
        db.connection()
            .execute(
                "DELETE FROM node_layout WHERE canvas_id=?1 AND graph_node_id=?2",
                rusqlite::params![historical_canvas_id, missing_id],
            )
            .expect("remove bootstrap-managed layout"),
        1
    );
    drop(db);

    let error = bootstrap_workspace_at(&database_path).expect_err("conflict aborts bootstrap");
    assert!(error.contains(conflict_id), "unexpected error: {error}");
    let reopened = Database::open(&database_path).expect("reopen after rollback");
    let missing_metadata: i64 = reopened
        .connection()
        .query_row(
            "SELECT count(*) FROM graph_node_metadata WHERE graph_node_id=?1",
            [missing_id],
            |row| row.get(0),
        )
        .expect("missing metadata count");
    let missing_document: i64 = reopened
        .connection()
        .query_row(
            "SELECT count(*) FROM node_document WHERE graph_node_id=?1",
            [missing_id],
            |row| row.get(0),
        )
        .expect("missing document count");
    assert_eq!((missing_metadata, missing_document), (0, 0));
    let retained_title: String = reopened
        .connection()
        .query_row(
            "SELECT title FROM graph_node_metadata WHERE graph_node_id=?1",
            [restored_title_id],
            |row| row.get(0),
        )
        .expect("title after rollback");
    assert_eq!(retained_title, "sentinel before rollback");
    let retained_canvas_name: String = reopened
        .connection()
        .query_row(
            "SELECT name FROM canvases WHERE id=?1",
            [&historical_canvas_id],
            |row| row.get(0),
        )
        .expect("canvas name after rollback");
    assert_eq!(retained_canvas_name, "sentinel canvas name");
    let missing_layout: i64 = reopened
        .connection()
        .query_row(
            "SELECT count(*) FROM node_layout WHERE canvas_id=?1 AND graph_node_id=?2",
            rusqlite::params![historical_canvas_id, missing_id],
            |row| row.get(0),
        )
        .expect("layout count after rollback");
    assert_eq!(missing_layout, 0);
}

#[test]
fn production_bootstrap_rejects_incompatible_metadata_only_rows_without_partial_writes() {
    let database_path = session_database_path(&format!(
        "workspace-metadata-only-conflict-{}",
        std::process::id()
    ));
    cleanup_database(&database_path);
    bootstrap_workspace_at(&database_path).expect("initial bootstrap");
    let db = Database::open(&database_path).expect("sqlite");
    let incompatible_id = "root-archetypal-field:bank-of-england";
    let canvas_id: String = db
        .connection()
        .query_row(
            "SELECT c.id
             FROM canvases c
             JOIN projects p ON p.id=c.project_id
             WHERE p.slug='historical-forms' AND c.is_primary=1",
            [],
            |row| row.get(0),
        )
        .expect("historical canvas");
    db.connection()
        .execute(
            "DELETE FROM node_document WHERE graph_node_id=?1",
            [incompatible_id],
        )
        .expect("remove document half");
    db.connection()
        .execute(
            "UPDATE graph_node_metadata SET content_origin='user_authored', content_revision=2
             WHERE graph_node_id=?1",
            [incompatible_id],
        )
        .expect("make metadata incompatible with seed body");
    db.connection()
        .execute(
            "UPDATE canvases SET name='metadata-only rollback sentinel' WHERE id=?1",
            [&canvas_id],
        )
        .expect("change bootstrap-managed canvas");
    assert_eq!(
        db.connection()
            .execute(
                "DELETE FROM node_layout WHERE canvas_id=?1 AND graph_node_id=?2",
                rusqlite::params![canvas_id, incompatible_id],
            )
            .expect("remove managed layout"),
        1
    );
    drop(db);

    let error = bootstrap_workspace_at(&database_path)
        .expect_err("incompatible metadata-only row aborts bootstrap");
    assert!(error.contains(incompatible_id), "unexpected error: {error}");
    let reopened = Database::open(&database_path).expect("reopen after abort");
    let state: (i64, String, i64, String, i64) = reopened
        .connection()
        .query_row(
            "SELECT
                (SELECT count(*) FROM node_document WHERE graph_node_id=?1),
                m.content_origin, m.content_revision,
                (SELECT name FROM canvases WHERE id=?2),
                (SELECT count(*) FROM node_layout WHERE canvas_id=?2 AND graph_node_id=?1)
             FROM graph_node_metadata m WHERE m.graph_node_id=?1",
            rusqlite::params![incompatible_id, canvas_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .expect("read unchanged incompatible state");
    assert_eq!(
        state,
        (
            0,
            "user_authored".into(),
            2,
            "metadata-only rollback sentinel".into(),
            0
        )
    );
}

#[test]
fn production_bootstrap_rejects_synced_metadata_without_exact_remote_revision() {
    for (label, remote_revision) in [("null", None), ("stale", Some(0_i64))] {
        let database_path = session_database_path(&format!(
            "workspace-synced-metadata-{label}-{}",
            std::process::id()
        ));
        cleanup_database(&database_path);
        bootstrap_workspace_at(&database_path).expect("initial bootstrap");
        let db = Database::open(&database_path).expect("sqlite");
        let graph_node_id = "root-archetypal-field:bank-of-england";
        let canvas_id: String = db
            .connection()
            .query_row(
                "SELECT c.id
                 FROM canvases c
                 JOIN projects p ON p.id=c.project_id
                 WHERE p.slug='historical-forms' AND c.is_primary=1",
                [],
                |row| row.get(0),
            )
            .expect("historical canvas");
        db.connection()
            .execute(
                "DELETE FROM node_document WHERE graph_node_id=?1",
                [graph_node_id],
            )
            .expect("remove document half");
        db.connection()
            .execute(
                "UPDATE graph_node_metadata SET sync_state='synced', remote_revision=?2
                 WHERE graph_node_id=?1",
                rusqlite::params![graph_node_id, remote_revision],
            )
            .expect("write invalid synced metadata");
        db.connection()
            .execute(
                "UPDATE canvases SET name=?2 WHERE id=?1",
                rusqlite::params![canvas_id, format!("{label} remote rollback sentinel")],
            )
            .expect("write canvas sentinel");
        assert_eq!(
            db.connection()
                .execute(
                    "DELETE FROM node_layout WHERE canvas_id=?1 AND graph_node_id=?2",
                    rusqlite::params![canvas_id, graph_node_id],
                )
                .expect("remove managed layout"),
            1
        );
        drop(db);

        let error = bootstrap_workspace_at(&database_path)
            .expect_err("invalid synced metadata-only row aborts bootstrap");
        assert!(error.contains(graph_node_id), "unexpected error: {error}");
        let reopened = Database::open(&database_path).expect("reopen after rollback");
        let unchanged: (i64, String, Option<i64>, String, i64) = reopened
            .connection()
            .query_row(
                "SELECT
                    (SELECT count(*) FROM node_document WHERE graph_node_id=?1),
                    m.sync_state, m.remote_revision,
                    (SELECT name FROM canvases WHERE id=?2),
                    (SELECT count(*) FROM node_layout WHERE canvas_id=?2 AND graph_node_id=?1)
                 FROM graph_node_metadata m WHERE m.graph_node_id=?1",
                rusqlite::params![graph_node_id, canvas_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .expect("read rolled back state");
        assert_eq!(unchanged.0, 0);
        assert_eq!(unchanged.1, "synced");
        assert_eq!(unchanged.2, remote_revision);
        assert_eq!(unchanged.3, format!("{label} remote rollback sentinel"));
        assert_eq!(unchanged.4, 0);
    }
}

#[test]
fn constellation_document_persistence_survives_reload_and_replaces_previous_canvas_state() {
    let database_path =
        session_database_path(&format!("workspace-persistence-{}", std::process::id()));
    cleanup_database(&database_path);

    let bootstrap = bootstrap_workspace_at(&database_path).expect("bootstrap workspace");
    let document =
        load_constellation_document_at(&database_path, &bootstrap.active_constellation_id)
            .expect("load project document");

    let note = node_with_note_text(
        &document.canvas_id,
        "session-note-1",
        "Session note",
        "This thesis survives a reopen.",
    );
    let resource = resource_node(&document.canvas_id, "session-resource-1", "Report");
    let edge = connecting_edge(
        &document.canvas_id,
        "session-edge-1",
        &note.id,
        &resource.id,
    );
    let annotation = ink_annotation(&document.canvas_id, "session-annotation-1");

    let persisted = persist_document(
        &database_path,
        &document,
        vec![note.clone(), resource.clone()],
        vec![edge.clone()],
        vec![annotation.clone()],
    );

    assert_eq!(persisted.constellation.id, document.constellation.id);
    assert_eq!(persisted.canvas_id, document.canvas_id);
    assert_eq!(persisted.nodes.len(), 2);
    assert_eq!(persisted.edges.len(), 1);
    assert_eq!(persisted.annotations.len(), 1);
    assert_eq!(
        persisted.edges[0].source_handle_id.as_deref(),
        Some("source-bottom")
    );
    assert_eq!(
        persisted.edges[0].target_handle_id.as_deref(),
        Some("target-top")
    );
    assert!(persisted
        .nodes
        .iter()
        .any(|node| node.title == "Session note"
            && node.content.as_deref() == Some("This thesis survives a reopen.")));

    let reopened =
        load_constellation_document_at(&database_path, &bootstrap.active_constellation_id)
            .expect("reload persisted project document");
    assert_eq!(reopened.nodes.len(), 2);
    assert_eq!(reopened.edges.len(), 1);
    assert_eq!(reopened.annotations.len(), 1);
    assert_eq!(
        reopened.edges[0].source_handle_id.as_deref(),
        Some("source-bottom")
    );
    assert_eq!(
        reopened.edges[0].target_handle_id.as_deref(),
        Some("target-top")
    );
    assert!(reopened
        .nodes
        .iter()
        .any(|node| node.title == "Session note"));

    let replacement_note = node_with_note_text(
        &reopened.canvas_id,
        "session-note-2",
        "Replacement note",
        "This canvas state was replaced, not appended.",
    );
    let replaced = persist_document(
        &database_path,
        &reopened,
        vec![replacement_note.clone()],
        Vec::new(),
        Vec::new(),
    );

    assert_eq!(replaced.nodes.len(), 1);
    assert!(replaced.edges.is_empty());
    assert!(replaced.annotations.is_empty());

    let reopened_after_replace =
        load_constellation_document_at(&database_path, &bootstrap.active_constellation_id)
            .expect("reload replaced project document");
    assert_eq!(reopened_after_replace.nodes.len(), 1);
    assert_eq!(reopened_after_replace.nodes[0].title, "Replacement note");
    assert!(reopened_after_replace.edges.is_empty());
    assert!(reopened_after_replace.annotations.is_empty());

    cleanup_database(&database_path);
}

#[test]
fn empty_persist_payload_preserves_non_empty_canvas_state() {
    let database_path =
        session_database_path(&format!("workspace-empty-wipe-{}", std::process::id()));
    cleanup_database(&database_path);

    let bootstrap = bootstrap_workspace_at(&database_path).expect("bootstrap workspace");
    let document =
        load_constellation_document_at(&database_path, &bootstrap.active_constellation_id)
            .expect("load project document");

    let note = node_with_note_text(
        &document.canvas_id,
        "session-note-guard",
        "Guarded note",
        "This note must survive an accidental empty flush.",
    );
    let persisted = persist_document(
        &database_path,
        &document,
        vec![note.clone()],
        Vec::new(),
        Vec::new(),
    );
    assert_eq!(persisted.nodes.len(), 1);

    let preserved = persist_constellation_document_at(PersistConstellationDocumentRequest {
        annotations: Vec::new(),
        canvas_id: persisted.canvas_id.clone(),
        database_path: database_path.to_string_lossy().to_string(),
        edges: Vec::new(),
        nodes: Vec::new(),
        constellation_id: persisted.constellation.id.clone(),
    })
    .expect("empty persist preserves existing canvas substance");
    assert_eq!(preserved.nodes.len(), 1);
    assert_eq!(preserved.nodes[0].title, "Guarded note");

    let reopened =
        load_constellation_document_at(&database_path, &bootstrap.active_constellation_id)
            .expect("reload guarded project document");
    assert_eq!(reopened.nodes.len(), 1);
    assert_eq!(reopened.nodes[0].title, "Guarded note");

    cleanup_database(&database_path);
}

#[test]
fn browser_persist_payload_allows_resource_nodes_without_tags() {
    let database_path =
        session_database_path(&format!("workspace-browser-persist-{}", std::process::id()));
    cleanup_database(&database_path);

    let bootstrap = bootstrap_workspace_at(&database_path).expect("bootstrap workspace");
    let document =
        load_constellation_document_at(&database_path, &bootstrap.active_constellation_id)
            .expect("load project document");

    let payload = json!({
        "annotations": [],
        "canvasId": document.canvas_id,
        "databasePath": database_path.to_string_lossy().to_string(),
        "edges": [],
        "nodes": [
            {
                "id": "browser-note-1",
                "canvasId": document.canvas_id,
                "type": "note",
                "title": "Browser note",
                "position": { "x": 80.0, "y": 80.0 },
                "size": { "width": 240.0, "height": 160.0 },
                "summary": "",
                "content": "",
                "tags": ["note"],
                "createdAt": session_timestamp(),
                "updatedAt": session_timestamp(),
            },
            {
                "id": "browser-resource-1",
                "canvasId": document.canvas_id,
                "type": "resource",
                "title": "README.md",
                "position": { "x": 200.0, "y": 200.0 },
                "size": { "width": 260.0, "height": 180.0 },
                "summary": "README.md",
                "resourceKind": "markdown",
                "absolutePath": fixture_path("tests/fixtures/sample-project/README.md"),
                "relativePath": "README.md",
                "mimeType": "text/markdown",
                "fileFingerprint": "markdown:README.md",
                "createdAt": session_timestamp(),
                "updatedAt": session_timestamp(),
            }
        ],
        "constellationId": document.constellation.id,
    });

    let request: PersistConstellationDocumentRequest =
        serde_json::from_value(payload).expect("deserialize browser persist payload");

    let persisted = persist_constellation_document_at(request).expect("persist browser payload");

    assert_eq!(persisted.nodes.len(), 2);
    assert!(persisted
        .nodes
        .iter()
        .any(|node| node.node_type == "resource" && node.title == "README.md"));
}

#[test]
fn search_index_stays_isolated_between_session_database_paths() {
    let session_a = session_database_path(&format!("workspace-session-a-{}", std::process::id()));
    let session_b = session_database_path(&format!("workspace-session-b-{}", std::process::id()));

    cleanup_database(&session_a);
    cleanup_database(&session_b);

    assert_ne!(session_a, session_b);

    let bootstrap_a = bootstrap_workspace_at(&session_a).expect("bootstrap session a");
    let bootstrap_b = bootstrap_workspace_at(&session_b).expect("bootstrap session b");

    let mut document_a =
        load_constellation_document_at(&session_a, &bootstrap_a.active_constellation_id)
            .expect("load session a document");
    document_a.nodes.push(node_with_note_text(
        &document_a.canvas_id,
        "session-a-search-anchor",
        "Session search anchor",
        "lattice ember 9182",
    ));

    let _persisted_a = persist_constellation_document_at(PersistConstellationDocumentRequest {
        annotations: document_a.annotations.clone(),
        canvas_id: document_a.canvas_id.clone(),
        database_path: session_a.to_string_lossy().to_string(),
        edges: document_a.edges.clone(),
        nodes: document_a.nodes.clone(),
        constellation_id: document_a.constellation.id.clone(),
    })
    .expect("persist session a document");

    rebuild_constellation_search_index_command(RebuildConstellationSearchIndexRequest {
        database_path: session_a.to_string_lossy().to_string(),
        constellation_id: bootstrap_a.active_constellation_id.clone(),
    })
    .expect("rebuild session a search index");

    let session_a_hits = search_constellation_command(SearchConstellationRequest {
        database_path: session_a.to_string_lossy().to_string(),
        constellation_id: bootstrap_a.active_constellation_id.clone(),
        query: "lattice ember 9182".to_string(),
        limit: Some(10),
    })
    .expect("search session a");
    assert!(session_a_hits
        .iter()
        .any(|hit| hit.entity_type == "node" && hit.title == "Session search anchor"));

    rebuild_constellation_search_index_command(RebuildConstellationSearchIndexRequest {
        database_path: session_b.to_string_lossy().to_string(),
        constellation_id: bootstrap_b.active_constellation_id.clone(),
    })
    .expect("rebuild session b search index");

    let session_b_hits = search_constellation_command(SearchConstellationRequest {
        database_path: session_b.to_string_lossy().to_string(),
        constellation_id: bootstrap_b.active_constellation_id.clone(),
        query: "lattice ember 9182".to_string(),
        limit: Some(10),
    })
    .expect("search session b");
    assert!(session_b_hits.is_empty());

    cleanup_database(&session_a);
    cleanup_database(&session_b);
}

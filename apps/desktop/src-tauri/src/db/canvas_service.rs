// apps/desktop/src-tauri/src/db/canvas_service.rs
use std::collections::{BTreeSet, HashMap};

use serde::{Deserialize, Serialize};

use crate::db::{
    connection::Database,
    repositories::{
        graph::{
            canonical_relationship_key, EntityType, GraphNode, GraphRelationship, GraphRepository,
        },
        layout::{CanvasAppStateRecord, EdgeLayoutRecord, LayoutRepository, NodeLayoutRecord},
        NodeAttachmentRepository, NodeRelationshipRepository,
    },
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeLayoutDto {
    pub graph_node_id: String,
    pub canvas_id: String,
    pub position_x: f64,
    pub position_y: f64,
    pub width: f64,
    pub height: f64,
    pub style: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeLayoutDto {
    pub id: String,
    pub canvas_id: String,
    pub source_graph_node_id: String,
    pub target_graph_node_id: String,
    pub relation_kind: String,
    pub source_handle_id: Option<String>,
    pub target_handle_id: Option<String>,
    pub style: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinedCanvasNode {
    pub node: GraphNode,
    pub layout: NodeLayoutDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasView {
    pub canvas_id: String,
    pub nodes: Vec<JoinedCanvasNode>,
    pub edges: Vec<EdgeLayoutDto>,
    pub relationships: Vec<GraphRelationship>,
    pub viewport: serde_json::Value,
    pub app_state: serde_json::Value,
}

pub struct CanvasService {
    graph: GraphRepository,
    db_path: String,
}

/// SQLite's part of a canvas hydration. Keeping this as a single operation is
/// important: a relationship tombstone is a global semantic assertion, while
/// a layout row is merely one canvas's presentation of it. In particular,
/// legacy canvases can contain `graph:<relationship-id>` rows without any
/// corresponding `node_layout` rows, so endpoint-scoped tombstone queries are
/// insufficient here.
struct LocalCanvasProjection {
    layout_rows: Vec<NodeLayoutRecord>,
    canonical_cover_paths: HashMap<String, String>,
    edge_rows: Vec<EdgeLayoutRecord>,
    app_state: Option<CanvasAppStateRecord>,
    tombstones: Vec<GraphRelationship>,
}

/// Default title used when a layout row has no `__canvasNode` sidecar (or the
/// sidecar has no usable title) and no matching Neo4j node — should only
/// happen for layout rows written before the sidecar carried a title.
const SYNTHESIZED_DEFAULT_TITLE: &str = "Untitled";

impl CanvasService {
    pub fn new(graph: GraphRepository, db_path: String) -> Self {
        Self { graph, db_path }
    }

    pub async fn load_canvas_view(
        &self,
        canvas_id: &str,
        lens: &str,
    ) -> Result<CanvasView, String> {
        if lens != "canvas" && lens != "timeline" {
            return Err(format!("unknown lens: {lens}"));
        }

        // 1. Layout from SQLite — the LOCAL, LAYOUT-AUTHORITATIVE source of
        // truth for "what nodes are on this canvas". A node that only exists
        // locally (best-effort Neo4j sync hasn't landed, or Neo4j is
        // unreachable) must still render. Scoped in a block so the
        // non-`Send` `Connection`/`LayoutRepository` are dropped before the
        // Neo4j `.await`s below (required for this future to be `Send`,
        // which `#[tauri::command]` needs).
        let LocalCanvasProjection {
            layout_rows,
            canonical_cover_paths,
            edge_rows,
            app_state,
            tombstones,
        } = load_local_canvas_projection_at_path(&self.db_path, canvas_id)?;

        let tombstoned_canonical_keys = tombstones
            .iter()
            .map(canonical_key_for_relationship)
            .collect::<BTreeSet<_>>();
        // Tombstones form the local delete outbox for canvas reads too. A
        // stale remote edge must neither reappear nor prevent layout loading;
        // every online canvas refresh retries its canonical deletion.
        for tombstone in &tombstones {
            let _ = self
                .graph
                .disconnect_by_canonical_relationship(tombstone)
                .await;
        }
        let relationships = filter_tombstoned_relationships(
            self.graph.list_relationships().await?,
            &tombstoned_canonical_keys,
        );

        // 2. Substance from Neo4j, batch-fetched for exactly the layout rows'
        // ids. Contract/decoding failures are fatal: synthesizing on a batch
        // error would silently turn temporal nodes into non-temporal fallbacks.
        let ids: Vec<String> = layout_rows
            .iter()
            .map(|r| r.graph_node_id.clone())
            .collect();
        let mut nodes_by_id: std::collections::HashMap<String, GraphNode> =
            std::collections::HashMap::new();
        let found = self
            .graph
            .get_nodes(&ids)
            .await
            .map_err(|error| format!("load_canvas_view graph contract failed: {error}"))?;
        for node in found {
            nodes_by_id.insert(node.graph_node_id.clone(), node);
        }

        // 3. For each layout row: use the real Neo4j node if present, else
        // synthesize a GraphNode from the __canvasNode sidecar so the row is
        // never dropped.
        let mut joined = Vec::with_capacity(layout_rows.len());
        for row in layout_rows {
            let node = match nodes_by_id.remove(&row.graph_node_id) {
                Some(node) => node,
                None => synthesize_node_from_layout(&row),
            };
            let style = project_canonical_cover(
                serde_json::from_str(&row.style_json).unwrap_or_else(|_| serde_json::json!({})),
                canonical_cover_paths.get(&row.graph_node_id),
            );
            let layout = NodeLayoutDto {
                graph_node_id: row.graph_node_id.clone(),
                canvas_id: row.canvas_id.clone(),
                position_x: row.position_x,
                position_y: row.position_y,
                width: row.width,
                height: row.height,
                style,
            };
            joined.push(JoinedCanvasNode { node, layout });
        }

        // 4. Lens filter (mirrors list_nodes_for_lens: timeline shows only
        // is_temporal nodes). A synthesized node is always is_temporal =
        // false, so it is naturally excluded from the timeline lens.
        if lens == "timeline" {
            joined.retain(|j| j.node.is_temporal);
        }

        let edges = edge_rows
            .into_iter()
            .map(edge_dto_from_record)
            .collect::<Vec<_>>();

        let (viewport, app_state_json) = match app_state {
            Some(state) => (
                serde_json::from_str(&state.viewport_json)
                    .unwrap_or_else(|_| serde_json::json!({ "x": 0, "y": 0, "zoom": 1 })),
                serde_json::from_str(&state.app_state_json)
                    .unwrap_or_else(|_| serde_json::json!({})),
            ),
            None => (
                serde_json::json!({ "x": 0, "y": 0, "zoom": 1 }),
                serde_json::json!({}),
            ),
        };

        Ok(CanvasView {
            canvas_id: canvas_id.to_string(),
            nodes: joined,
            edges,
            relationships,
            viewport,
            app_state: app_state_json,
        })
    }
}

fn project_canonical_cover(
    mut style: serde_json::Value,
    canonical_cover: Option<&String>,
) -> serde_json::Value {
    if let (Some(cover_path), Some(style_object)) = (canonical_cover, style.as_object_mut()) {
        // Canonical cover selection is application data, while the layout
        // thumbnail is only a per-canvas visual cache. Project it into this
        // read result without persisting or mutating the user's layout style.
        style_object.insert(
            "thumbnail".into(),
            serde_json::Value::String(cover_path.clone()),
        );
    }
    style
}

fn load_local_canvas_projection_at_path(
    database_path: impl AsRef<std::path::Path>,
    canvas_id: &str,
) -> Result<LocalCanvasProjection, String> {
    // This scope intentionally ends before callers make Neo4j requests: the
    // rusqlite connection is not Send, whereas Tauri command futures are.
    let database = Database::open(database_path).map_err(|error| error.to_string())?;
    let connection = database.connection();
    let layout = LayoutRepository::new(connection);
    let layout_rows = layout
        .list_node_layout(canvas_id)
        .map_err(|error| error.to_string())?;
    let canonical_cover_paths = NodeAttachmentRepository::new(connection)
        .selected_covers()
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(|attachment| (attachment.graph_node_id, attachment.managed_path))
        .collect::<HashMap<_, _>>();
    let edge_rows = layout
        .list_edge_layout(canvas_id)
        .map_err(|error| error.to_string())?;
    let app_state = layout
        .get_app_state(canvas_id)
        .map_err(|error| error.to_string())?;
    let tombstones = NodeRelationshipRepository::new(connection)
        .list_tombstones()
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(|relationship| relationship.as_graph_relationship())
        .collect::<Vec<_>>();
    let tombstoned_layout_edge_ids = tombstones
        .iter()
        .map(|relationship| graph_layout_edge_id(&relationship.id))
        .collect::<BTreeSet<_>>();

    Ok(LocalCanvasProjection {
        layout_rows,
        canonical_cover_paths,
        edge_rows: filter_tombstoned_layout_edges(edge_rows, &tombstoned_layout_edge_ids),
        app_state,
        tombstones,
    })
}

fn canonical_key_for_relationship(relationship: &GraphRelationship) -> String {
    canonical_relationship_key(
        &relationship.source_graph_node_id,
        &relationship.target_graph_node_id,
        &relationship.rel_type,
        &relationship.properties,
    )
}

fn graph_layout_edge_id(relationship_id: &str) -> String {
    format!("graph:{relationship_id}")
}

fn filter_tombstoned_layout_edges(
    edges: Vec<EdgeLayoutRecord>,
    tombstoned_layout_edge_ids: &BTreeSet<String>,
) -> Vec<EdgeLayoutRecord> {
    edges
        .into_iter()
        .filter(|edge| !tombstoned_layout_edge_ids.contains(&edge.id))
        .collect()
}

fn filter_tombstoned_relationships(
    relationships: Vec<GraphRelationship>,
    tombstoned_canonical_keys: &BTreeSet<String>,
) -> Vec<GraphRelationship> {
    relationships
        .into_iter()
        .filter(|relationship| {
            !tombstoned_canonical_keys.contains(&canonical_key_for_relationship(relationship))
        })
        .collect()
}

/// Minimal shape of the `__canvasNode` sidecar stored in `style_json`
/// (see `CanvasNodeSidecar` in packages/desktop-api/src/graph.ts). Only the
/// fields needed to synthesize substance (`type`, `title`) are extracted;
/// unknown/extra fields are ignored.
#[derive(Debug, Deserialize)]
struct CanvasNodeSidecar {
    #[serde(rename = "type")]
    node_type: Option<String>,
    title: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StyleWithSidecar {
    #[serde(rename = "__canvasNode")]
    canvas_node: Option<CanvasNodeSidecar>,
}

/// Maps a `__canvasNode.type` to the Neo4j entity label a synced version of
/// that node would carry, mirroring the frontend's `entityTypeForNodeType`
/// (packages/canvas/src/state/canvasStore.ts): "resource" -> Source,
/// "portal" -> Constellation, everything else (note/group) -> Work.
fn entity_type_for_sidecar_type(node_type: &str) -> EntityType {
    match node_type {
        "resource" => EntityType::Source,
        "portal" => EntityType::Constellation,
        _ => EntityType::Work,
    }
}

/// Builds a GraphNode's substance from a layout row's `__canvasNode` sidecar
/// when no Neo4j node exists for its `graph_node_id` — e.g. a node created
/// locally whose best-effort Neo4j sync hasn't landed (or Neo4j was
/// unreachable at creation time). Always `is_temporal: false` so a
/// synthesized node is naturally excluded from the timeline lens.
fn synthesize_node_from_layout(row: &NodeLayoutRecord) -> GraphNode {
    let sidecar: Option<CanvasNodeSidecar> =
        serde_json::from_str::<StyleWithSidecar>(&row.style_json)
            .ok()
            .and_then(|s| s.canvas_node);

    let title = sidecar
        .as_ref()
        .and_then(|s| s.title.clone())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| SYNTHESIZED_DEFAULT_TITLE.to_string());
    let entity_type = sidecar
        .as_ref()
        .and_then(|s| s.node_type.as_deref())
        .map(entity_type_for_sidecar_type)
        .unwrap_or(EntityType::Work);

    GraphNode {
        graph_node_id: row.graph_node_id.clone(),
        entity_type,
        title,
        body: "[]".to_string(),
        summary: String::new(),
        archetypal_resonance: None,
        coordinate: None,
        source_coordinates: Vec::new(),
        evidence_tags: Vec::new(),
        source_kind: None,
        content_origin: None,
        content_revision: None,
        seed_schema_version: None,
        body_source_coordinates: Vec::new(),
        historicity: None,
        claim_kind: None,
        evidence_status: None,
        temporal_role: None,
        place_coverage: None,
        ql_form: None,
        ql_unit_id: None,
        ql_arc: None,
        ql_topology: None,
        ql_schema_version: None,
        ql_source_coordinates: Vec::new(),
        ql_completeness_status: None,
        is_temporal: false,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
        created_at: row.created_at.clone(),
        updated_at: row.updated_at.clone(),
    }
}

fn edge_dto_from_record(r: EdgeLayoutRecord) -> EdgeLayoutDto {
    EdgeLayoutDto {
        id: r.id,
        canvas_id: r.canvas_id,
        source_graph_node_id: r.source_graph_node_id,
        target_graph_node_id: r.target_graph_node_id,
        relation_kind: r.relation_kind,
        source_handle_id: r.source_handle_id,
        target_handle_id: r.target_handle_id,
        style: serde_json::from_str(&r.style_json).unwrap_or_else(|_| serde_json::json!({})),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{
        connection::Database,
        repositories::{
            graph::ContentOrigin, ConstellationRepository, NodeRelationshipRecord,
            RelationshipMutation, SyncState,
        },
        root_archetypal_seed::ensure_root_archetypal_local_projection,
    };

    fn relationship(id: &str, canonical_key: &str) -> GraphRelationship {
        GraphRelationship {
            id: id.into(),
            rel_type: "INSTANTIATES".into(),
            source_graph_node_id: "event".into(),
            target_graph_node_id: "archetype".into(),
            properties: serde_json::json!({"canonicalKey": canonical_key}),
        }
    }

    #[test]
    fn canvas_relationship_projection_suppresses_remote_edges_with_local_tombstones() {
        let tombstones = BTreeSet::from(["user:event:INSTANTIATES:archetype".to_string()]);
        let visible = filter_tombstoned_relationships(
            vec![
                relationship("neo4j-stale", "user:event:INSTANTIATES:archetype"),
                relationship("neo4j-live", "user:event:INSTANTIATES:other"),
            ],
            &tombstones,
        );

        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].id, "neo4j-live");
    }

    #[test]
    fn canvas_layout_projection_suppresses_a_stale_graph_edge_for_a_tombstone() {
        let tombstoned_layout_edge_ids = BTreeSet::from([graph_layout_edge_id("relationship-1")]);
        let visible = filter_tombstoned_layout_edges(
            vec![
                EdgeLayoutRecord {
                    id: "graph:relationship-1".into(),
                    canvas_id: "canvas".into(),
                    source_graph_node_id: "event".into(),
                    target_graph_node_id: "archetype".into(),
                    relation_kind: "INSTANTIATES".into(),
                    source_handle_id: None,
                    target_handle_id: None,
                    style_json: "{}".into(),
                    created_at: "2026-01-01T00:00:00Z".into(),
                    updated_at: "2026-01-01T00:00:00Z".into(),
                },
                EdgeLayoutRecord {
                    id: "manual-research-connection".into(),
                    canvas_id: "canvas".into(),
                    source_graph_node_id: "event".into(),
                    target_graph_node_id: "note".into(),
                    relation_kind: "reference".into(),
                    source_handle_id: None,
                    target_handle_id: None,
                    style_json: "{}".into(),
                    created_at: "2026-01-01T00:00:00Z".into(),
                    updated_at: "2026-01-01T00:00:00Z".into(),
                },
            ],
            &tombstoned_layout_edge_ids,
        );

        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].id, "manual-research-connection");
    }

    #[test]
    fn canonical_cover_projection_overrides_a_stale_layout_thumbnail() {
        let canonical = "assets/attachments/cover-hash/canonical.png".to_string();
        let projected = project_canonical_cover(
            serde_json::json!({
                "thumbnail": "assets/legacy-layout-thumbnail.png",
                "dotColour": "#c0ffee",
            }),
            Some(&canonical),
        );

        assert_eq!(projected["thumbnail"].as_str(), Some(canonical.as_str()));
        assert_eq!(projected["dotColour"].as_str(), Some("#c0ffee"));
    }

    #[test]
    fn sqlite_canvas_projection_filters_tombstones_without_node_layout_rows() {
        let directory = tempfile::tempdir().expect("temporary database directory");
        let database_path = directory.path().join("canvas-projection.sqlite");
        let (canvas_id, relationship_id) = {
            let database = Database::open(&database_path).expect("open migrated database");
            ensure_root_archetypal_local_projection(
                database.connection(),
                &directory.path().to_string_lossy(),
                "canvas-projection-test",
            )
            .expect("project real relationship endpoints into SQLite");
            let constellation = ConstellationRepository::new(database.connection())
                .create(
                    "Legacy presentation".to_string(),
                    "legacy-presentation".to_string(),
                    None,
                    directory.path().to_string_lossy().to_string(),
                    None,
                    None,
                    serde_json::json!({}),
                )
                .expect("create constellation with a real canvas");
            let canvas_id = constellation
                .primary_canvas_id
                .expect("constellation primary canvas");
            let relationship_id = "test:legacy-no-layout-tombstone".to_string();
            let relationships = NodeRelationshipRepository::new(database.connection());
            assert_eq!(
                relationships
                    .merge(
                        &NodeRelationshipRecord {
                            relationship_id: relationship_id.clone(),
                            source_graph_node_id: "canvas-projection-test:banda-genocide"
                                .to_string(),
                            target_graph_node_id: "canvas-projection-test:medici-template"
                                .to_string(),
                            rel_type: "INSTANTIATES".to_string(),
                            properties: serde_json::json!({
                                "canonicalKey": "test:legacy-no-layout-tombstone"
                            }),
                            source_coordinates: vec![],
                            evidence_tags: vec![],
                            origin: ContentOrigin::UserAuthored,
                            sync_state: SyncState::Pending,
                            revision: 1,
                            remote_revision: None,
                            is_tombstone: false,
                            created_at: None,
                            updated_at: None,
                        },
                        None,
                    )
                    .expect("create local semantic relationship"),
                RelationshipMutation::Created
            );
            assert!(relationships
                .tombstone(&relationship_id)
                .expect("write relationship tombstone")
                .is_some());
            LayoutRepository::new(database.connection())
                .upsert_edge_layout(&EdgeLayoutRecord {
                    id: graph_layout_edge_id(&relationship_id),
                    canvas_id: canvas_id.clone(),
                    source_graph_node_id: "canvas-projection-test:banda-genocide".to_string(),
                    target_graph_node_id: "canvas-projection-test:medici-template".to_string(),
                    relation_kind: "INSTANTIATES".to_string(),
                    source_handle_id: None,
                    target_handle_id: None,
                    style_json: "{}".to_string(),
                    created_at: "2026-07-14T00:00:00Z".to_string(),
                    updated_at: "2026-07-14T00:00:00Z".to_string(),
                })
                .expect("seed stale legacy semantic presentation");
            (canvas_id, relationship_id)
        };

        let projection = load_local_canvas_projection_at_path(&database_path, &canvas_id)
            .expect("hydrate local canvas boundary");
        assert!(
            projection.layout_rows.is_empty(),
            "the fixture deliberately models a legacy canvas without node layouts"
        );
        assert_eq!(projection.tombstones.len(), 1);
        assert_eq!(projection.tombstones[0].id, relationship_id);
        assert!(
            projection.edge_rows.is_empty(),
            "a global semantic tombstone suppresses graph:<relationship-id> even without endpoints"
        );
    }
}

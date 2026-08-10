use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::{
    commands::graph::SharedGraphState,
    db::{
        connection::Database,
        repositories::{
            graph::{
                canonical_relationship_key, EntityType, GraphNode, GraphRelationship, Historicity,
                TemporalPrecision, TemporalRole,
            },
            GraphNodeMetadataRepository, LocalNodeDocument, NodeDocumentRepository,
            NodeRelationshipRepository, TemporalGraphNodeMetadataRecord, TimelineLayoutMutation,
            TimelineLayoutRecord, TimelineLayoutRepository,
        },
    },
    SharedApiState,
};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(
    rename_all = "camelCase",
    deny_unknown_fields,
    bound(deserialize = "T: Deserialize<'de>", serialize = "T: Serialize")
)]
pub struct TimelineValueFilter<T> {
    #[serde(default)]
    pub include: Vec<T>,
    #[serde(default)]
    pub exclude: Vec<T>,
}
impl<T> Default for TimelineValueFilter<T> {
    fn default() -> Self {
        Self {
            include: Vec::new(),
            exclude: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimelineFilters {
    #[serde(default)]
    pub entity_types: TimelineValueFilter<EntityType>,
    #[serde(default)]
    pub historicities: TimelineValueFilter<Historicity>,
    #[serde(default)]
    pub temporal_roles: TimelineValueFilter<TemporalRole>,
    #[serde(default)]
    pub tags: TimelineValueFilter<String>,
    #[serde(default)]
    pub relation_types: TimelineValueFilter<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoadTimelineViewRequest {
    pub workspace_id: String,
    #[serde(default)]
    pub filters: TimelineFilters,
    #[serde(default)]
    pub range: Option<TimelineYearRange>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimelineYearRange {
    pub start_year: i32,
    pub end_year: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineAnchor {
    pub valid_from: String,
    pub valid_to: Option<String>,
    pub precision: TemporalPrecision,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineLayoutOverride {
    pub lane: String,
    pub offset_y: f64,
    pub width: f64,
    pub height: f64,
    pub style: serde_json::Value,
    pub layout_revision: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpsertTimelineLayoutRequest {
    pub workspace_id: String,
    pub graph_node_id: String,
    pub lane: String,
    pub offset_y: f64,
    pub width: f64,
    pub height: f64,
    pub style: serde_json::Value,
    pub expected_revision: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum TimelineLayoutMutationResult {
    Created {
        layout: TimelineLayoutOverride,
    },
    Updated {
        layout: TimelineLayoutOverride,
    },
    Preserved {
        layout: TimelineLayoutOverride,
    },
    Conflict {
        layout: Option<TimelineLayoutOverride>,
        reason: String,
    },
}

fn layout_override(record: TimelineLayoutRecord) -> TimelineLayoutOverride {
    TimelineLayoutOverride {
        lane: record.lane,
        offset_y: record.offset_y,
        width: record.width,
        height: record.height,
        style: record.style_json,
        layout_revision: record.layout_revision,
    }
}

pub fn upsert_timeline_layout_at_path(
    path: impl AsRef<std::path::Path>,
    request: UpsertTimelineLayoutRequest,
) -> Result<TimelineLayoutMutationResult, String> {
    let expected_workspace = timeline_workspace_identity(&path)?;
    if request.workspace_id != expected_workspace {
        return Err(format!(
            "workspaceId does not match active SQLite workspace: expected {expected_workspace}"
        ));
    }
    let database = Database::open(path).map_err(|error| error.to_string())?;
    let transaction = database
        .connection()
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    let metadata = GraphNodeMetadataRepository::new(&transaction)
        .get(&request.graph_node_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "timeline layout target graph node does not exist".to_string())?;
    if !metadata.is_temporal {
        return Err("timeline layout target must be temporal".into());
    }
    let repository = TimelineLayoutRepository::new(&transaction);
    let incoming = TimelineLayoutRecord {
        graph_node_id: request.graph_node_id.clone(),
        lane: request.lane,
        offset_y: request.offset_y,
        width: request.width,
        height: request.height,
        style_json: request.style,
        layout_revision: request.expected_revision.unwrap_or(0),
        created_at: None,
        updated_at: None,
    };
    let mutation = repository
        .save(&incoming, request.expected_revision)
        .map_err(|error| error.to_string())?;
    let result = match mutation {
        TimelineLayoutMutation::Created => TimelineLayoutMutationResult::Created {
            layout: layout_override(
                repository
                    .get(&request.graph_node_id)
                    .map_err(|error| error.to_string())?
                    .ok_or_else(|| "timeline layout disappeared after create".to_string())?,
            ),
        },
        TimelineLayoutMutation::Updated => TimelineLayoutMutationResult::Updated {
            layout: layout_override(
                repository
                    .get(&request.graph_node_id)
                    .map_err(|error| error.to_string())?
                    .ok_or_else(|| "timeline layout disappeared after update".to_string())?,
            ),
        },
        TimelineLayoutMutation::Preserved => TimelineLayoutMutationResult::Preserved {
            layout: layout_override(
                repository
                    .get(&request.graph_node_id)
                    .map_err(|error| error.to_string())?
                    .ok_or_else(|| "timeline layout disappeared after preserve".to_string())?,
            ),
        },
        TimelineLayoutMutation::Conflict { reason, .. } => TimelineLayoutMutationResult::Conflict {
            layout: repository
                .get(&request.graph_node_id)
                .map_err(|error| error.to_string())?
                .map(layout_override),
            reason,
        },
    };
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(result)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineNode {
    pub node: GraphNode,
    pub anchor: TimelineAnchor,
    pub layout_override: Option<TimelineLayoutOverride>,
    /// A non-temporal or filtered endpoint attached to a displayed temporal
    /// node for relationship presentation. It is context, never an assertion
    /// that the companion itself occurred at this anchor.
    #[serde(default)]
    pub relation_companion: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineLane {
    pub id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineDiagnostic {
    pub graph_node_id: String,
    pub code: TimelineDiagnosticCode,
    pub message: String,
    pub valid_from: Option<String>,
    pub valid_to: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TimelineDiagnosticCode {
    InvalidTemporalAnchor,
    MissingAuthoritativeDocument,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineView {
    pub workspace_id: String,
    pub nodes: Vec<TimelineNode>,
    pub relationships: Vec<GraphRelationship>,
    pub lanes: Vec<TimelineLane>,
    pub diagnostics: Vec<TimelineDiagnostic>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineRelationField {
    pub subject_graph_node_id: String,
    pub relationships: Vec<GraphRelationship>,
    pub contextual_nodes: Vec<GraphNode>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimelineRelationFieldRequest {
    pub workspace_id: String,
    pub graph_node_id: String,
}

/// Timeline lazy relational expansion (ticket #28, D13 §4.4): one node's
/// edges and neighbour nodes loaded on demand through the repository layer.
/// The timeline base view stays dated-events-only; relational depth is one
/// click away and never materialises the full graph.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExpandTimelineNodeRequest {
    pub workspace_id: String,
    pub graph_node_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpandTimelineNodeView {
    pub subject_graph_node_id: String,
    pub subject: GraphNode,
    pub edges: Vec<GraphRelationship>,
    pub neighbours: Vec<GraphNode>,
}

fn graph_node_from_local_projection(
    record: &TemporalGraphNodeMetadataRecord,
    document: Option<LocalNodeDocument>,
) -> GraphNode {
    let metadata = &record.metadata;
    let (body, summary, content_origin, content_revision, body_source_coordinates) = match document
    {
        Some(document) => (
            document.body,
            document.summary,
            Some(document.content_origin),
            Some(document.content_revision),
            document.body_source_coordinates,
        ),
        None => (
            "[]".into(),
            record.summary.clone(),
            Some(metadata.content_origin),
            Some(metadata.content_revision),
            metadata.body_source_coordinates.clone(),
        ),
    };
    GraphNode {
        graph_node_id: metadata.graph_node_id.clone(),
        entity_type: metadata.entity_type,
        title: metadata.title.clone(),
        body,
        summary,
        archetypal_resonance: metadata.archetypal_resonance.clone(),
        coordinate: metadata.coordinate.clone(),
        source_coordinates: metadata.source_coordinates.clone(),
        evidence_tags: metadata.evidence_tags.clone(),
        source_kind: metadata.source_kind.clone(),
        content_origin,
        content_revision,
        seed_schema_version: metadata.seed_schema_version,
        body_source_coordinates,
        historicity: metadata.historicity,
        claim_kind: metadata.claim_kind,
        evidence_status: metadata.evidence_status,
        temporal_role: metadata.temporal_role,
        place_coverage: metadata.place_coverage,
        // The `place_json` column carries a json_valid CHECK, so this parse
        // can only fail on storage corruption; a corrupt projection is
        // surfaced as absent rather than silently fabricating place data.
        place: metadata
            .place
            .as_deref()
            .and_then(|raw| serde_json::from_str(raw).ok()),
        ql_form: metadata.ql_form,
        ql_unit_id: metadata.ql_unit_id.clone(),
        ql_arc: metadata.ql_arc,
        ql_topology: metadata.ql_topology,
        ql_schema_version: metadata.ql_schema_version,
        ql_source_coordinates: metadata.ql_source_coordinates.clone(),
        ql_completeness_status: metadata.ql_completeness_status,
        is_temporal: metadata.is_temporal,
        valid_from: metadata.valid_from.clone(),
        valid_to: metadata.valid_to.clone(),
        temporal_precision: metadata.temporal_precision,
        created_at: record.created_at.clone(),
        updated_at: record.updated_at.clone(),
    }
}

fn timeline_relation_companions(
    displayed_nodes: &[TimelineNode],
    relationships: &[GraphRelationship],
    nodes_by_id: &BTreeMap<String, GraphNode>,
) -> Vec<TimelineNode> {
    let displayed = displayed_nodes
        .iter()
        .filter(|node| !node.relation_companion)
        .map(|node| (node.node.graph_node_id.as_str(), &node.anchor))
        .collect::<BTreeMap<_, _>>();
    let mut companion_anchors = BTreeMap::<String, TimelineAnchor>::new();
    let mut register = |companion_id: &str, anchor: &TimelineAnchor| {
        if displayed.contains_key(companion_id) || !nodes_by_id.contains_key(companion_id) {
            return;
        }
        companion_anchors
            .entry(companion_id.to_string())
            .and_modify(|current| {
                if anchor.valid_from < current.valid_from {
                    *current = anchor.clone();
                }
            })
            .or_insert_with(|| anchor.clone());
    };
    for relationship in relationships {
        let source_anchor = displayed.get(relationship.source_graph_node_id.as_str());
        let target_anchor = displayed.get(relationship.target_graph_node_id.as_str());
        if let Some(anchor) = source_anchor {
            register(&relationship.target_graph_node_id, anchor);
        }
        if let Some(anchor) = target_anchor {
            register(&relationship.source_graph_node_id, anchor);
        }
    }
    companion_anchors
        .into_iter()
        .filter_map(|(graph_node_id, anchor)| {
            nodes_by_id
                .get(&graph_node_id)
                .cloned()
                .map(|node| TimelineNode {
                    node,
                    anchor,
                    layout_override: None,
                    relation_companion: true,
                })
        })
        .collect()
}

pub fn merge_relationships_by_canonical_key(
    local: impl IntoIterator<Item = GraphRelationship>,
    remote: impl IntoIterator<Item = GraphRelationship>,
) -> Vec<GraphRelationship> {
    let mut merged = BTreeMap::new();
    // Remote records are opportunistic enrichment. Insert them first so the
    // locally persisted contract wins on a canonical-key collision: local
    // ownership/CAS rules are the authority even when a stale Neo4j edge is
    // still present.
    for relationship in remote.into_iter().chain(local) {
        let key = canonical_relationship_key(
            &relationship.source_graph_node_id,
            &relationship.target_graph_node_id,
            &relationship.rel_type,
            &relationship.properties,
        );
        merged.insert(key, relationship);
    }
    merged.into_values().collect()
}

fn rebuild_timeline_relation_companions(
    view: &mut TimelineView,
    supplemental_nodes: impl IntoIterator<Item = GraphNode>,
) {
    let displayed = view
        .nodes
        .iter()
        .filter(|node| !node.relation_companion)
        .cloned()
        .collect::<Vec<_>>();
    let mut nodes_by_id = view
        .nodes
        .iter()
        .map(|node| (node.node.graph_node_id.clone(), node.node.clone()))
        .collect::<BTreeMap<_, _>>();
    nodes_by_id.extend(
        supplemental_nodes
            .into_iter()
            .map(|node| (node.graph_node_id.clone(), node)),
    );
    // A relationship layer can only draw a link when it can locate *both*
    // endpoint placements. Keep the relation eligibility broad (one displayed
    // temporal endpoint is enough) but do not return an unrenderable edge if
    // a remote endpoint has vanished between the relationship and node reads.
    let displayed_ids = displayed
        .iter()
        .map(|node| node.node.graph_node_id.as_str())
        .collect::<BTreeSet<_>>();
    view.relationships.retain(|relationship| {
        (displayed_ids.contains(relationship.source_graph_node_id.as_str())
            || displayed_ids.contains(relationship.target_graph_node_id.as_str()))
            && nodes_by_id.contains_key(&relationship.source_graph_node_id)
            && nodes_by_id.contains_key(&relationship.target_graph_node_id)
    });
    let companions = timeline_relation_companions(&displayed, &view.relationships, &nodes_by_id);
    view.nodes = displayed;
    view.nodes.extend(companions);
}

/// Remote graph enrichment is strictly opportunistic. A local timeline is a
/// complete offline projection and must remain readable if Bolt is unavailable
/// or the companion lookup fails.
fn apply_remote_timeline_enrichment(
    view: &mut TimelineView,
    remote: Result<(Vec<GraphRelationship>, Vec<GraphNode>), String>,
    tombstoned_canonical_keys: &BTreeSet<String>,
) {
    let Ok((remote_relationships, remote_nodes)) = remote else {
        return;
    };
    let remote_relationships = remote_relationships
        .into_iter()
        .filter(|relationship| {
            !tombstoned_canonical_keys.contains(&canonical_relationship_key(
                &relationship.source_graph_node_id,
                &relationship.target_graph_node_id,
                &relationship.rel_type,
                &relationship.properties,
            ))
        })
        .collect::<Vec<_>>();
    view.relationships = merge_relationships_by_canonical_key(
        std::mem::take(&mut view.relationships),
        remote_relationships,
    );
    rebuild_timeline_relation_companions(view, remote_nodes);
}

pub fn timeline_workspace_identity(path: impl AsRef<std::path::Path>) -> Result<String, String> {
    let canonical = std::fs::canonicalize(path).map_err(|error| error.to_string())?;
    Ok(format!("sqlite:{}", canonical.to_string_lossy()))
}

pub fn load_timeline_view_at_path(
    path: impl AsRef<std::path::Path>,
    request: LoadTimelineViewRequest,
) -> Result<TimelineView, String> {
    let workspace_id = timeline_workspace_identity(&path)?;
    if request.workspace_id.trim().is_empty() {
        return Err("workspaceId must not be empty".into());
    }
    if request.workspace_id != workspace_id {
        return Err(format!(
            "workspaceId does not match active SQLite workspace: expected {workspace_id}"
        ));
    }
    let database = Database::open(path.as_ref()).map_err(|error| error.to_string())?;
    let metadata_repository = GraphNodeMetadataRepository::new(database.connection());
    let metadata = match request.range.as_ref() {
        Some(range) => {
            if range.start_year > range.end_year {
                return Err("timeline range startYear must not exceed endYear".into());
            }
            metadata_repository.list_temporal_in_year_range(range.start_year, range.end_year)
        }
        None => metadata_repository.list_temporal(),
    }
    .map_err(|error| error.to_string())?;
    let layouts = TimelineLayoutRepository::new(database.connection())
        .list()
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(|layout| (layout.graph_node_id.clone(), layout))
        .collect::<BTreeMap<_, _>>();

    let mut nodes = Vec::new();
    let mut diagnostics = Vec::new();
    let mut lane_ids = BTreeSet::new();
    for row in metadata {
        let metadata = &row.metadata;
        if !matches_filters(&metadata, &request.filters) {
            continue;
        }
        let anchor = match temporal_anchor(
            &metadata.valid_from,
            &metadata.valid_to,
            metadata.temporal_precision,
        ) {
            Ok(anchor) => anchor,
            Err(message) => {
                diagnostics.push(TimelineDiagnostic {
                    graph_node_id: metadata.graph_node_id.clone(),
                    code: TimelineDiagnosticCode::InvalidTemporalAnchor,
                    message,
                    valid_from: metadata.valid_from.clone(),
                    valid_to: metadata.valid_to.clone(),
                });
                continue;
            }
        };
        let layout_override = layouts.get(&metadata.graph_node_id).map(|layout| {
            lane_ids.insert(layout.lane.clone());
            TimelineLayoutOverride {
                lane: layout.lane.clone(),
                offset_y: layout.offset_y,
                width: layout.width,
                height: layout.height,
                style: layout.style_json.clone(),
                layout_revision: layout.layout_revision,
            }
        });
        nodes.push(TimelineNode {
            anchor,
            layout_override,
            // The timeline card needs metadata only. Full document bodies are
            // fetched by the existing node reader after an explicit open.
            node: graph_node_from_local_projection(&row, None),
            relation_companion: false,
        });
    }
    let temporal_ids = nodes
        .iter()
        .map(|node| node.node.graph_node_id.clone())
        .collect::<BTreeSet<_>>();
    // The snapshot carries only the bounded relationship neighbourhood of the
    // temporal rows just read. It never scans the global graph, and it keeps
    // atemporal endpoints as relation data rather than assigning them dates.
    let relationship_repository = NodeRelationshipRepository::new(database.connection());
    let candidate_relationships = relationship_repository
        .list_involving(&temporal_ids)
        .map_err(|error| error.to_string())?
        .into_iter()
        .filter(|relationship| !relationship.is_tombstone)
        .filter(|relationship| {
            matches_string_value(&relationship.rel_type, &request.filters.relation_types)
        })
        .collect::<Vec<_>>();
    // LOCATED_AT links a temporal event to an atemporal gazetted place. The
    // place is included as relation data (invalid anchor, companion flag) so
    // consumers such as the psychogeographic assembler can resolve the walk
    // without fabricating a temporal anchor for the place itself.
    let located_place_ids = candidate_relationships
        .iter()
        .filter(|relationship| relationship.rel_type == "LOCATED_AT")
        .flat_map(|relationship| {
            [
                relationship.source_graph_node_id.as_str(),
                relationship.target_graph_node_id.as_str(),
            ]
        })
        .filter(|endpoint_id| !temporal_ids.contains(*endpoint_id))
        .map(str::to_string)
        .collect::<BTreeSet<_>>();
    for endpoint_id in &located_place_ids {
        let Some(row) = metadata_repository
            .get_with_timestamps(endpoint_id)
            .map_err(|error| error.to_string())?
        else {
            continue;
        };
        nodes.push(TimelineNode {
            node: graph_node_from_local_projection(&row, None),
            anchor: TimelineAnchor {
                valid_from: "invalid".into(),
                valid_to: None,
                precision: TemporalPrecision::Year,
            },
            layout_override: None,
            relation_companion: true,
        });
    }
    let view_endpoint_ids = temporal_ids
        .iter()
        .chain(located_place_ids.iter())
        .cloned()
        .collect::<BTreeSet<_>>();
    let relationships = candidate_relationships
        .into_iter()
        .filter(|relationship| {
            view_endpoint_ids.contains(&relationship.source_graph_node_id)
                && view_endpoint_ids.contains(&relationship.target_graph_node_id)
        })
        .map(|relationship| relationship.as_graph_relationship())
        .collect();
    Ok(TimelineView {
        workspace_id,
        nodes,
        relationships,
        lanes: lane_ids.into_iter().map(|id| TimelineLane { id }).collect(),
        diagnostics,
    })
}

pub fn load_timeline_relation_field_at_path(
    path: impl AsRef<std::path::Path>,
    workspace_id: &str,
    graph_node_id: &str,
) -> Result<TimelineRelationField, String> {
    let expected_workspace = timeline_workspace_identity(&path)?;
    if workspace_id != expected_workspace {
        return Err(format!(
            "workspaceId does not match active SQLite workspace: expected {expected_workspace}"
        ));
    }
    let database = Database::open(path).map_err(|error| error.to_string())?;
    let metadata_repository = GraphNodeMetadataRepository::new(database.connection());
    let Some(subject) = metadata_repository
        .get_with_timestamps(graph_node_id)
        .map_err(|error| error.to_string())?
    else {
        return Err("timeline relation field subject graph node does not exist".into());
    };
    if !subject.metadata.is_temporal {
        return Err("timeline relation field subject must be temporal".into());
    }

    let relationships = NodeRelationshipRepository::new(database.connection())
        .list_involving(&BTreeSet::from([graph_node_id.to_string()]))
        .map_err(|error| error.to_string())?
        .into_iter()
        .filter(|relationship| !relationship.is_tombstone)
        .map(|relationship| relationship.as_graph_relationship())
        .collect::<Vec<_>>();
    let endpoint_ids = relationships
        .iter()
        .flat_map(|relationship| {
            [
                relationship.source_graph_node_id.as_str(),
                relationship.target_graph_node_id.as_str(),
            ]
        })
        .filter(|endpoint_id| *endpoint_id != graph_node_id)
        .collect::<BTreeSet<_>>();
    let documents = NodeDocumentRepository::new(database.connection());
    let mut contextual_nodes = Vec::with_capacity(endpoint_ids.len());
    for endpoint_id in endpoint_ids {
        let Some(metadata) = metadata_repository
            .get_with_timestamps(endpoint_id)
            .map_err(|error| error.to_string())?
        else {
            continue;
        };
        let document = documents
            .get_node_document(endpoint_id)
            .map_err(|error| error.to_string())?;
        contextual_nodes.push(graph_node_from_local_projection(&metadata, document));
    }
    Ok(TimelineRelationField {
        subject_graph_node_id: graph_node_id.to_string(),
        relationships,
        contextual_nodes,
    })
}

/// Lazy relational expansion (ticket #28): the subject node, its edges, and
/// its neighbour nodes, property-complete, through the local projection first
/// (offline-first) so the timeline stays light. Any node may be expanded —
/// temporal or not — because the working-set stack is the user's own
/// exploration of relational depth, not a filtered timeline read.
pub fn expand_timeline_node_at_path(
    path: impl AsRef<std::path::Path>,
    workspace_id: &str,
    graph_node_id: &str,
) -> Result<ExpandTimelineNodeView, String> {
    let expected_workspace = timeline_workspace_identity(&path)?;
    if workspace_id != expected_workspace {
        return Err(format!(
            "workspaceId does not match active SQLite workspace: expected {expected_workspace}"
        ));
    }
    if graph_node_id.trim().is_empty() {
        return Err("graphNodeId must not be empty".into());
    }
    let database = Database::open(path).map_err(|error| error.to_string())?;
    let metadata_repository = GraphNodeMetadataRepository::new(database.connection());
    let documents = NodeDocumentRepository::new(database.connection());
    let Some(subject_metadata) = metadata_repository
        .get_with_timestamps(graph_node_id)
        .map_err(|error| error.to_string())?
    else {
        return Err("expand subject graph node does not exist".into());
    };
    let subject_document = documents
        .get_node_document(graph_node_id)
        .map_err(|error| error.to_string())?;
    let subject = graph_node_from_local_projection(&subject_metadata, subject_document);

    let relationships = NodeRelationshipRepository::new(database.connection())
        .list_involving(&BTreeSet::from([graph_node_id.to_string()]))
        .map_err(|error| error.to_string())?
        .into_iter()
        .filter(|relationship| !relationship.is_tombstone)
        .map(|relationship| relationship.as_graph_relationship())
        .collect::<Vec<_>>();
    let neighbour_ids = relationships
        .iter()
        .flat_map(|relationship| {
            [
                relationship.source_graph_node_id.as_str(),
                relationship.target_graph_node_id.as_str(),
            ]
        })
        .filter(|endpoint_id| *endpoint_id != graph_node_id)
        .collect::<BTreeSet<_>>();
    let mut neighbours = Vec::with_capacity(neighbour_ids.len());
    for endpoint_id in neighbour_ids {
        let Some(metadata) = metadata_repository
            .get_with_timestamps(endpoint_id)
            .map_err(|error| error.to_string())?
        else {
            continue;
        };
        let document = documents
            .get_node_document(endpoint_id)
            .map_err(|error| error.to_string())?;
        neighbours.push(graph_node_from_local_projection(&metadata, document));
    }
    Ok(ExpandTimelineNodeView {
        subject_graph_node_id: graph_node_id.to_string(),
        subject,
        edges: relationships,
        neighbours,
    })
}

fn local_relationship_tombstones_at_path(
    path: impl AsRef<std::path::Path>,
    temporal_ids: &BTreeSet<String>,
) -> Result<Vec<GraphRelationship>, String> {
    let database = Database::open(path).map_err(|error| error.to_string())?;
    NodeRelationshipRepository::new(database.connection())
        .list_involving(temporal_ids)
        .map_err(|error| error.to_string())
        .map(|relationships| {
            relationships
                .into_iter()
                .filter(|relationship| relationship.is_tombstone)
                .map(|relationship| relationship.as_graph_relationship())
                .collect()
        })
}

fn matches_filters(
    metadata: &crate::db::repositories::GraphNodeMetadataRecord,
    filters: &TimelineFilters,
) -> bool {
    matches_value(Some(metadata.entity_type), &filters.entity_types)
        && matches_value(metadata.historicity, &filters.historicities)
        && matches_value(metadata.temporal_role, &filters.temporal_roles)
        && matches_tags(&metadata.evidence_tags, &filters.tags)
}

fn matches_tags(tags: &[String], filter: &TimelineValueFilter<String>) -> bool {
    let included = filter.include.is_empty()
        || tags
            .iter()
            .any(|tag| filter.include.iter().any(|candidate| candidate == tag));
    let excluded = tags
        .iter()
        .any(|tag| filter.exclude.iter().any(|candidate| candidate == tag));
    included && !excluded
}

fn matches_string_value(value: &str, filter: &TimelineValueFilter<String>) -> bool {
    let included =
        filter.include.is_empty() || filter.include.iter().any(|candidate| candidate == value);
    included && !filter.exclude.iter().any(|candidate| candidate == value)
}

fn matches_value<T: PartialEq + Copy>(value: Option<T>, filter: &TimelineValueFilter<T>) -> bool {
    let included =
        filter.include.is_empty() || value.is_some_and(|value| filter.include.contains(&value));
    included && !value.is_some_and(|value| filter.exclude.contains(&value))
}

fn temporal_anchor(
    valid_from: &Option<String>,
    valid_to: &Option<String>,
    precision: Option<TemporalPrecision>,
) -> Result<TimelineAnchor, String> {
    let start = valid_from
        .as_deref()
        .ok_or_else(|| "temporal node is missing validFrom".to_string())?;
    let precision =
        precision.ok_or_else(|| "temporal node is missing temporalPrecision".to_string())?;
    let start_key = parse_temporal_instant(start)
        .ok_or_else(|| format!("invalid validFrom temporal anchor: {start}"))?;
    if let Some(end) = valid_to.as_deref() {
        let end_key = parse_temporal_instant(end)
            .ok_or_else(|| format!("invalid validTo temporal anchor: {end}"))?;
        if end_key < start_key {
            return Err("validTo precedes validFrom".into());
        }
    }
    Ok(TimelineAnchor {
        valid_from: start.into(),
        valid_to: valid_to.clone(),
        precision,
    })
}

fn parse_temporal_instant(value: &str) -> Option<(i32, u32, u32, u32, u32, u32, u32)> {
    if value.trim() != value {
        return None;
    }
    if value.is_empty() || value.starts_with('+') {
        return None;
    }
    if is_year_token(value) {
        return Some((value.parse().ok()?, 1, 1, 0, 0, 0, 0));
    }
    if value.len() >= 20 && value.as_bytes().get(4) == Some(&b'-') {
        let parsed = chrono::DateTime::parse_from_rfc3339(value)
            .ok()?
            .with_timezone(&chrono::Utc);
        use chrono::{Datelike, Timelike};
        return Some((
            parsed.year(),
            parsed.month(),
            parsed.day(),
            parsed.hour(),
            parsed.minute(),
            parsed.second(),
            parsed.nanosecond() / 1_000_000,
        ));
    }
    let unsigned = value.strip_prefix('-').unwrap_or(value);
    let parts = unsigned.split('-').collect::<Vec<_>>();
    if !(parts.len() == 2 || parts.len() == 3) || !is_unsigned_year(parts[0]) {
        return None;
    }
    if parts[1].len() != 2 || !parts[1].bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let year: i32 = format!(
        "{}{}",
        if value.starts_with('-') { "-" } else { "" },
        parts[0]
    )
    .parse()
    .ok()?;
    let month: u32 = parts[1].parse().ok()?;
    if !(1..=12).contains(&month) {
        return None;
    }
    if parts.len() == 2 {
        return Some((year, month, 1, 0, 0, 0, 0));
    }
    if parts[2].len() != 2 || !parts[2].bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let day: u32 = parts[2].parse().ok()?;
    if day == 0 || day > days_in_month(year, month) {
        return None;
    }
    Some((year, month, day, 0, 0, 0, 0))
}

fn is_year_token(value: &str) -> bool {
    let unsigned = value.strip_prefix('-').unwrap_or(value);
    is_unsigned_year(unsigned)
}
fn is_unsigned_year(value: &str) -> bool {
    !value.is_empty() && value.len() <= 6 && value.bytes().all(|b| b.is_ascii_digit())
}
fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        4 | 6 | 9 | 11 => 30,
        2 if is_leap(year) => 29,
        2 => 28,
        _ => 31,
    }
}
fn is_leap(year: i32) -> bool {
    year.rem_euclid(4) == 0 && (year.rem_euclid(100) != 0 || year.rem_euclid(400) == 0)
}

#[tauri::command]
pub async fn load_timeline_view_command(
    request: LoadTimelineViewRequest,
    api_state: tauri::State<'_, SharedApiState>,
    app_handle: tauri::AppHandle,
) -> Result<TimelineView, String> {
    let path = api_state
        .lock()
        .map_err(|_| "API state lock poisoned".to_string())?
        .db_path
        .clone()
        .ok_or_else(|| "App not bootstrapped yet".to_string())?;
    let relation_types = request.filters.relation_types.clone();
    let mut view = load_timeline_view_at_path(&path, request)?;
    let Some(graph_state) = app_handle.try_state::<SharedGraphState>() else {
        return Ok(view);
    };
    let graph = crate::db::repositories::graph::GraphRepository::new(
        graph_state.graph.clone(),
        graph_state.database.clone(),
    );
    let temporal_ids = view
        .nodes
        .iter()
        .filter(|node| !node.relation_companion)
        .map(|node| node.node.graph_node_id.clone())
        .collect::<BTreeSet<_>>();
    let tombstones = local_relationship_tombstones_at_path(&path, &temporal_ids)?;
    let tombstoned_keys = tombstones
        .iter()
        .map(|relationship| {
            canonical_relationship_key(
                &relationship.source_graph_node_id,
                &relationship.target_graph_node_id,
                &relationship.rel_type,
                &relationship.properties,
            )
        })
        .collect::<BTreeSet<_>>();
    for tombstone in &tombstones {
        let _ = graph.disconnect_by_canonical_relationship(tombstone).await;
    }
    let Ok(remote_relationships) = graph
        .relationships_involving(&temporal_ids.iter().cloned().collect::<Vec<_>>())
        .await
    else {
        return Ok(view);
    };
    let remote_relationships = remote_relationships
        .into_iter()
        .filter(|relationship| {
            temporal_ids.contains(&relationship.source_graph_node_id)
                && temporal_ids.contains(&relationship.target_graph_node_id)
        })
        .filter(|relationship| matches_string_value(&relationship.rel_type, &relation_types))
        .collect::<Vec<_>>();
    let known_ids = view
        .nodes
        .iter()
        .map(|node| node.node.graph_node_id.as_str())
        .collect::<BTreeSet<_>>();
    let missing_endpoint_ids = remote_relationships
        .iter()
        .flat_map(|relationship| {
            [
                relationship.source_graph_node_id.as_str(),
                relationship.target_graph_node_id.as_str(),
            ]
        })
        .filter(|graph_node_id| !known_ids.contains(*graph_node_id))
        .map(str::to_string)
        .collect::<BTreeSet<_>>();
    let remote_nodes = if missing_endpoint_ids.is_empty() {
        Vec::new()
    } else {
        graph
            .get_nodes(&missing_endpoint_ids.into_iter().collect::<Vec<_>>())
            .await
            .unwrap_or_default()
    };
    apply_remote_timeline_enrichment(
        &mut view,
        Ok((remote_relationships, remote_nodes)),
        &tombstoned_keys,
    );
    Ok(view)
}

#[tauri::command]
pub async fn load_timeline_relation_field_command(
    request: TimelineRelationFieldRequest,
    api_state: tauri::State<'_, SharedApiState>,
    app_handle: tauri::AppHandle,
) -> Result<TimelineRelationField, String> {
    let path = api_state
        .lock()
        .map_err(|_| "API state lock poisoned".to_string())?
        .db_path
        .clone()
        .ok_or_else(|| "App not bootstrapped yet".to_string())?;
    let mut field =
        load_timeline_relation_field_at_path(&path, &request.workspace_id, &request.graph_node_id)?;
    let Some(graph_state) = app_handle.try_state::<SharedGraphState>() else {
        return Ok(field);
    };
    let graph = crate::db::repositories::graph::GraphRepository::new(
        graph_state.graph.clone(),
        graph_state.database.clone(),
    );
    let tombstones = local_relationship_tombstones_at_path(
        &path,
        &BTreeSet::from([request.graph_node_id.clone()]),
    )?;
    let tombstoned_keys = tombstones
        .iter()
        .map(|relationship| {
            canonical_relationship_key(
                &relationship.source_graph_node_id,
                &relationship.target_graph_node_id,
                &relationship.rel_type,
                &relationship.properties,
            )
        })
        .collect::<BTreeSet<_>>();
    for tombstone in &tombstones {
        let _ = graph.disconnect_by_canonical_relationship(tombstone).await;
    }
    let Ok(remote_relationships) = graph.relationships_for_node(&request.graph_node_id).await
    else {
        return Ok(field);
    };
    field.relationships = merge_relationships_by_canonical_key(
        std::mem::take(&mut field.relationships),
        remote_relationships.into_iter().filter(|relationship| {
            !tombstoned_keys.contains(&canonical_relationship_key(
                &relationship.source_graph_node_id,
                &relationship.target_graph_node_id,
                &relationship.rel_type,
                &relationship.properties,
            ))
        }),
    );
    let known_ids = field
        .contextual_nodes
        .iter()
        .map(|node| node.graph_node_id.clone())
        .collect::<BTreeSet<_>>();
    let missing_ids = field
        .relationships
        .iter()
        .flat_map(|relationship| {
            [
                relationship.source_graph_node_id.as_str(),
                relationship.target_graph_node_id.as_str(),
            ]
        })
        .filter(|node_id| *node_id != request.graph_node_id && !known_ids.contains(*node_id))
        .map(str::to_string)
        .collect::<BTreeSet<_>>();
    if !missing_ids.is_empty() {
        if let Ok(nodes) = graph
            .get_nodes(&missing_ids.into_iter().collect::<Vec<_>>())
            .await
        {
            field.contextual_nodes.extend(nodes);
        }
    }
    Ok(field)
}

#[tauri::command]
pub async fn expand_timeline_node_command(
    request: ExpandTimelineNodeRequest,
    api_state: tauri::State<'_, SharedApiState>,
    app_handle: tauri::AppHandle,
) -> Result<ExpandTimelineNodeView, String> {
    let path = api_state
        .lock()
        .map_err(|_| "API state lock poisoned".to_string())?
        .db_path
        .clone()
        .ok_or_else(|| "App not bootstrapped yet".to_string())?;
    let mut view =
        expand_timeline_node_at_path(&path, &request.workspace_id, &request.graph_node_id)?;
    let Some(graph_state) = app_handle.try_state::<SharedGraphState>() else {
        return Ok(view);
    };
    let graph = crate::db::repositories::graph::GraphRepository::new(
        graph_state.graph.clone(),
        graph_state.database.clone(),
    );
    let tombstones = local_relationship_tombstones_at_path(
        &path,
        &BTreeSet::from([request.graph_node_id.clone()]),
    )?;
    let tombstoned_keys = tombstones
        .iter()
        .map(|relationship| {
            canonical_relationship_key(
                &relationship.source_graph_node_id,
                &relationship.target_graph_node_id,
                &relationship.rel_type,
                &relationship.properties,
            )
        })
        .collect::<BTreeSet<_>>();
    for tombstone in &tombstones {
        let _ = graph.disconnect_by_canonical_relationship(tombstone).await;
    }
    let Ok(remote_relationships) = graph.relationships_for_node(&request.graph_node_id).await
    else {
        return Ok(view);
    };
    view.edges = merge_relationships_by_canonical_key(
        std::mem::take(&mut view.edges),
        remote_relationships.into_iter().filter(|relationship| {
            !tombstoned_keys.contains(&canonical_relationship_key(
                &relationship.source_graph_node_id,
                &relationship.target_graph_node_id,
                &relationship.rel_type,
                &relationship.properties,
            ))
        }),
    );
    let known_ids = view
        .neighbours
        .iter()
        .map(|node| node.graph_node_id.clone())
        .collect::<BTreeSet<_>>();
    let missing_ids = view
        .edges
        .iter()
        .flat_map(|relationship| {
            [
                relationship.source_graph_node_id.as_str(),
                relationship.target_graph_node_id.as_str(),
            ]
        })
        .filter(|node_id| *node_id != request.graph_node_id && !known_ids.contains(*node_id))
        .map(str::to_string)
        .collect::<BTreeSet<_>>();
    if !missing_ids.is_empty() {
        if let Ok(nodes) = graph
            .get_nodes(&missing_ids.into_iter().collect::<Vec<_>>())
            .await
        {
            view.neighbours.extend(nodes);
        }
    }
    Ok(view)
}

#[tauri::command]
pub async fn upsert_timeline_layout_command(
    request: UpsertTimelineLayoutRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<TimelineLayoutMutationResult, String> {
    let path = api_state
        .lock()
        .map_err(|_| "API state lock poisoned".to_string())?
        .db_path
        .clone()
        .ok_or_else(|| "App not bootstrapped yet".to_string())?;
    upsert_timeline_layout_at_path(path, request)
}

#[cfg(test)]
mod local_relationship_projection_tests {
    use std::collections::BTreeSet;

    use super::*;
    use crate::db::{
        connection::Database,
        repositories::{
            graph::{
                ClaimKind, ContentOrigin, EntityType, EvidenceStatus, Historicity, PlaceCoverage,
                TemporalPrecision, TemporalRole,
            },
            DocumentContentInput, GraphMetadataMutation, GraphNodeMetadataRecord,
            GraphNodeMetadataRepository, NodeDocumentRepository, NodeRelationshipRecord,
            NodeRelationshipRepository, RelationshipMutation, SyncState,
        },
    };

    fn metadata(
        graph_node_id: &str,
        entity_type: EntityType,
        is_temporal: bool,
    ) -> GraphNodeMetadataRecord {
        GraphNodeMetadataRecord {
            graph_node_id: graph_node_id.into(),
            entity_type,
            title: graph_node_id.into(),
            archetypal_resonance: None,
            coordinate: None,
            source_coordinates: vec![format!("vault/{graph_node_id}.md")],
            evidence_tags: vec!["documented".into()],
            source_kind: Some("vault-file".into()),
            content_origin: ContentOrigin::CorpusCompiled,
            content_revision: 1,
            seed_schema_version: Some(1),
            body_source_coordinates: vec![format!("vault/{graph_node_id}.md#body")],
            historicity: Some(if is_temporal {
                Historicity::Historical
            } else {
                Historicity::Theoretical
            }),
            claim_kind: Some(ClaimKind::Fact),
            evidence_status: Some(EvidenceStatus::Documented),
            temporal_role: is_temporal.then_some(TemporalRole::OccurredAt),
            place_coverage: Some(PlaceCoverage::Resolved),
            place: None,
            ql_form: None,
            ql_unit_id: None,
            ql_arc: None,
            ql_topology: None,
            ql_schema_version: None,
            ql_source_coordinates: vec![],
            ql_completeness_status: None,
            is_temporal,
            valid_from: is_temporal.then_some("1888".into()),
            valid_to: None,
            temporal_precision: is_temporal.then_some(TemporalPrecision::Year),
            schema_version: 1,
            sync_state: SyncState::Pending,
            remote_revision: None,
        }
    }

    fn relationship(
        relationship_id: &str,
        source_graph_node_id: &str,
        target_graph_node_id: &str,
        rel_type: &str,
    ) -> NodeRelationshipRecord {
        NodeRelationshipRecord {
            relationship_id: relationship_id.into(),
            source_graph_node_id: source_graph_node_id.into(),
            target_graph_node_id: target_graph_node_id.into(),
            rel_type: rel_type.into(),
            properties: serde_json::json!({"reading": "concrete historical expression"}),
            source_coordinates: vec!["episodes/2/timeline.md#1888".into()],
            evidence_tags: vec!["documented".into(), "timeline".into()],
            origin: ContentOrigin::CorpusCompiled,
            sync_state: SyncState::Pending,
            revision: 1,
            remote_revision: None,
            is_tombstone: false,
            created_at: None,
            updated_at: None,
        }
    }

    fn projected_node(
        graph_node_id: &str,
        entity_type: EntityType,
        is_temporal: bool,
    ) -> GraphNode {
        graph_node_from_local_projection(
            &TemporalGraphNodeMetadataRecord {
                metadata: metadata(graph_node_id, entity_type, is_temporal),
                summary: String::new(),
                created_at: "2026-07-14T00:00:00.000Z".into(),
                updated_at: "2026-07-14T00:00:00.000Z".into(),
            },
            None,
        )
    }

    fn timeline_relationship(
        id: &str,
        source_graph_node_id: &str,
        target_graph_node_id: &str,
        properties: serde_json::Value,
    ) -> GraphRelationship {
        GraphRelationship {
            id: id.into(),
            rel_type: "INSTANTIATES".into(),
            source_graph_node_id: source_graph_node_id.into(),
            target_graph_node_id: target_graph_node_id.into(),
            properties,
        }
    }

    fn temporal_timeline_node(node: GraphNode) -> TimelineNode {
        TimelineNode {
            node,
            anchor: TimelineAnchor {
                valid_from: "1888".into(),
                valid_to: None,
                precision: TemporalPrecision::Year,
            },
            layout_override: None,
            relation_companion: false,
        }
    }

    #[test]
    fn located_at_places_flow_through_the_snapshot_as_relation_companions() {
        let directory = tempfile::tempdir().expect("temporary SQLite directory");
        let path = directory.path().join("located-at.sqlite");

        {
            let database = Database::open(&path).expect("migrated SQLite database");
            let metadata_repository = GraphNodeMetadataRepository::new(database.connection());
            for (graph_node_id, entity_type, is_temporal) in [
                ("event-1888", EntityType::Event, true),
                ("place-gazette", EntityType::Place, false),
            ] {
                assert_eq!(
                    metadata_repository
                        .save(&metadata(graph_node_id, entity_type, is_temporal), None)
                        .expect("persist graph metadata"),
                    GraphMetadataMutation::Created
                );
            }
            assert_eq!(
                NodeRelationshipRepository::new(database.connection())
                    .merge(
                        &relationship(
                            "event-1888-located-at-place-gazette",
                            "event-1888",
                            "place-gazette",
                            "LOCATED_AT",
                        ),
                        None,
                    )
                    .expect("persist located-at relationship"),
                RelationshipMutation::Created
            );
        }

        let workspace_id = timeline_workspace_identity(&path).expect("workspace identity");
        let timeline = load_timeline_view_at_path(
            &path,
            LoadTimelineViewRequest {
                workspace_id,
                filters: TimelineFilters::default(),
                range: None,
            },
        )
        .expect("load offline timeline");

        assert_eq!(timeline.nodes.len(), 2, "temporal event plus place companion");
        assert_eq!(timeline.relationships.len(), 1);
        assert_eq!(timeline.relationships[0].rel_type, "LOCATED_AT");
        assert_eq!(
            timeline.relationships[0].source_graph_node_id,
            "event-1888"
        );
        assert_eq!(
            timeline.relationships[0].target_graph_node_id,
            "place-gazette"
        );

        let place_companion = timeline
            .nodes
            .iter()
            .find(|node| node.node.graph_node_id == "place-gazette")
            .expect("place endpoint present in snapshot");
        assert!(place_companion.relation_companion);
        assert_eq!(place_companion.node.entity_type, EntityType::Place);
        assert_eq!(place_companion.anchor.valid_from, "invalid");
        assert!(place_companion.layout_override.is_none());

        let temporal_event = timeline
            .nodes
            .iter()
            .find(|node| node.node.graph_node_id == "event-1888")
            .expect("temporal event still present");
        assert!(!temporal_event.relation_companion);
        assert_eq!(temporal_event.anchor.valid_from, "1888");
    }

    #[test]
    fn relation_type_filter_excludes_located_at_places() {
        let directory = tempfile::tempdir().expect("temporary SQLite directory");
        let path = directory.path().join("located-at-filtered.sqlite");

        {
            let database = Database::open(&path).expect("migrated SQLite database");
            let metadata_repository = GraphNodeMetadataRepository::new(database.connection());
            for (graph_node_id, entity_type, is_temporal) in [
                ("event-1888", EntityType::Event, true),
                ("place-gazette", EntityType::Place, false),
            ] {
                assert_eq!(
                    metadata_repository
                        .save(&metadata(graph_node_id, entity_type, is_temporal), None)
                        .expect("persist graph metadata"),
                    GraphMetadataMutation::Created
                );
            }
            assert_eq!(
                NodeRelationshipRepository::new(database.connection())
                    .merge(
                        &relationship(
                            "event-1888-located-at-place-gazette",
                            "event-1888",
                            "place-gazette",
                            "LOCATED_AT",
                        ),
                        None,
                    )
                    .expect("persist located-at relationship"),
                RelationshipMutation::Created
            );
        }

        let workspace_id = timeline_workspace_identity(&path).expect("workspace identity");
        let timeline = load_timeline_view_at_path(
            &path,
            LoadTimelineViewRequest {
                workspace_id,
                filters: TimelineFilters {
                    relation_types: TimelineValueFilter {
                        include: vec!["INSTANTIATES".into()],
                        exclude: vec![],
                    },
                    ..TimelineFilters::default()
                },
                range: None,
            },
        )
        .expect("load filtered timeline");

        assert_eq!(timeline.nodes.len(), 1, "place companion is gated by the relation filter");
        assert!(timeline.relationships.is_empty());
        assert_eq!(timeline.nodes[0].node.graph_node_id, "event-1888");
    }

    #[test]
    fn local_relationships_stay_out_of_the_snapshot_and_load_for_a_focused_event() {
        let directory = tempfile::tempdir().expect("temporary SQLite directory");
        let path = directory.path().join("timeline.sqlite");

        {
            let database = Database::open(&path).expect("migrated SQLite database");
            let metadata_repository = GraphNodeMetadataRepository::new(database.connection());
            for (graph_node_id, entity_type, is_temporal) in [
                ("event-1888", EntityType::Event, true),
                ("event-1917", EntityType::Event, true),
                ("archetype-antichrist", EntityType::Archetype, false),
                ("unrelated-source", EntityType::Source, false),
                ("unrelated-work", EntityType::Work, false),
            ] {
                assert_eq!(
                    metadata_repository
                        .save(&metadata(graph_node_id, entity_type, is_temporal), None)
                        .expect("persist graph metadata"),
                    GraphMetadataMutation::Created
                );
            }
            assert!(matches!(
                NodeDocumentRepository::new(database.connection())
                    .apply_reconciliation(
                        &DocumentContentInput {
                            graph_node_id: "event-1888".into(),
                            body: "Historical event detail".into(),
                            summary: "Historical event pith".into(),
                            content_origin: ContentOrigin::CorpusCompiled,
                            content_revision: 1,
                            body_source_coordinates: vec!["episodes/2/timeline.md#1888".into()],
                            neo4j_synced: false,
                        },
                        None,
                    )
                    .expect("persist timeline document"),
                crate::db::repositories::NodeDocumentMutation::Created
            ));

            let relationship_repository = NodeRelationshipRepository::new(database.connection());
            let temporal_link = relationship(
                "event-1888-instantiates-antichrist",
                "event-1888",
                "archetype-antichrist",
                "INSTANTIATES",
            );
            assert_eq!(
                relationship_repository
                    .merge(&temporal_link, None)
                    .expect("persist local relationship"),
                RelationshipMutation::Created
            );
            assert_eq!(
                relationship_repository
                    .merge(&temporal_link, None)
                    .expect("replay local relationship"),
                RelationshipMutation::Preserved
            );
            let reloaded = relationship_repository
                .get("event-1888-instantiates-antichrist")
                .expect("reload local relationship")
                .expect("persisted local relationship");
            assert_eq!(reloaded.relationship_id, temporal_link.relationship_id);
            assert_eq!(
                reloaded.source_graph_node_id,
                temporal_link.source_graph_node_id
            );
            assert_eq!(
                reloaded.target_graph_node_id,
                temporal_link.target_graph_node_id
            );
            assert_eq!(reloaded.rel_type, temporal_link.rel_type);
            assert_eq!(reloaded.properties, temporal_link.properties);
            assert_eq!(
                reloaded.source_coordinates,
                temporal_link.source_coordinates
            );
            assert_eq!(reloaded.evidence_tags, temporal_link.evidence_tags);
            assert_eq!(reloaded.origin, temporal_link.origin);
            assert_eq!(reloaded.sync_state, temporal_link.sync_state);
            assert_eq!(reloaded.revision, temporal_link.revision);
            assert!(reloaded.created_at.is_some());
            assert!(reloaded.updated_at.is_some());
            assert_eq!(
                relationship_repository
                    .list_involving(&BTreeSet::from(["event-1888".to_string()]))
                    .expect("list relationships for supplied node ids")
                    .len(),
                1
            );
            relationship_repository
                .merge(
                    &relationship(
                        "event-1888-causes-1917",
                        "event-1888",
                        "event-1917",
                        "CAUSES",
                    ),
                    None,
                )
                .expect("persist bounded historical relationship");
            relationship_repository
                .merge(
                    &relationship(
                        "unrelated-source-resonates-work",
                        "unrelated-source",
                        "unrelated-work",
                        "RESONATES_WITH",
                    ),
                    None,
                )
                .expect("persist unrelated relationship");
        }

        let workspace_id = timeline_workspace_identity(&path).expect("workspace identity");

        let timeline = load_timeline_view_at_path(
            &path,
            LoadTimelineViewRequest {
                workspace_id,
                filters: TimelineFilters::default(),
                range: Some(TimelineYearRange {
                    start_year: 1800,
                    end_year: 1900,
                }),
            },
        )
        .expect("load offline timeline");

        assert_eq!(timeline.nodes.len(), 2);
        assert_eq!(timeline.relationships.len(), 1);
        assert_eq!(timeline.relationships[0].rel_type, "CAUSES");

        let relation_filtered = load_timeline_view_at_path(
            &path,
            LoadTimelineViewRequest {
                workspace_id: timeline.workspace_id.clone(),
                filters: TimelineFilters {
                    relation_types: TimelineValueFilter {
                        include: vec!["INSTANTIATES".into()],
                        exclude: vec![],
                    },
                    ..TimelineFilters::default()
                },
                range: Some(TimelineYearRange {
                    start_year: 1800,
                    end_year: 1900,
                }),
            },
        )
        .expect("load relation-type filtered timeline");
        assert_eq!(relation_filtered.nodes.len(), 2);
        assert!(relation_filtered.relationships.is_empty());

        let tag_filtered = load_timeline_view_at_path(
            &path,
            LoadTimelineViewRequest {
                workspace_id: timeline.workspace_id.clone(),
                filters: TimelineFilters {
                    tags: TimelineValueFilter {
                        include: vec![],
                        exclude: vec!["documented".into()],
                    },
                    ..TimelineFilters::default()
                },
                range: Some(TimelineYearRange {
                    start_year: 1800,
                    end_year: 1900,
                }),
            },
        )
        .expect("load tag-filtered timeline");
        assert!(tag_filtered.nodes.is_empty());

        let field =
            load_timeline_relation_field_at_path(&path, &timeline.workspace_id, "event-1888")
                .expect("load focused event relation field");
        assert_eq!(field.subject_graph_node_id, "event-1888");
        assert_eq!(field.contextual_nodes.len(), 2);
        assert!(field
            .contextual_nodes
            .iter()
            .any(|node| node.graph_node_id == "archetype-antichrist"));
        assert_eq!(field.relationships.len(), 2);
        let relationship = field
            .relationships
            .iter()
            .find(|relationship| relationship.id == "event-1888-instantiates-antichrist")
            .expect("focused archetype relationship");
        assert_eq!(relationship.id, "event-1888-instantiates-antichrist");
        assert_eq!(relationship.source_graph_node_id, "event-1888");
        assert_eq!(relationship.target_graph_node_id, "archetype-antichrist");
        assert_eq!(relationship.rel_type, "INSTANTIATES");
        assert_eq!(
            relationship.properties,
            serde_json::json!({"reading": "concrete historical expression"})
        );

        let outside = load_timeline_view_at_path(
            &path,
            LoadTimelineViewRequest {
                workspace_id: timeline.workspace_id.clone(),
                filters: TimelineFilters::default(),
                range: Some(TimelineYearRange {
                    start_year: 1700,
                    end_year: 1800,
                }),
            },
        )
        .expect("load an adjacent offline timeline window");
        assert!(
            outside.nodes.is_empty(),
            "out-of-window events must not be read"
        );
    }

    #[test]
    fn local_relationship_repository_rejects_invalid_contract_values() {
        let directory = tempfile::tempdir().expect("temporary SQLite directory");
        let database = Database::open(directory.path().join("validation.sqlite"))
            .expect("migrated SQLite database");
        let repository = NodeRelationshipRepository::new(database.connection());

        let mut invalid =
            relationship("bad\u{0}relationship", "event", "archetype", "INSTANTIATES");
        let error = repository
            .merge(&invalid, None)
            .expect_err("invalid relationship id rejected");
        assert!(error.to_string().contains("relationship"));

        invalid.relationship_id = "valid-id".into();
        invalid.rel_type = "UNCONTROLLED".into();
        let error = repository
            .merge(&invalid, None)
            .expect_err("invalid relationship type rejected");
        assert!(error.to_string().contains("rel_type"));

        invalid.rel_type = "INSTANTIATES".into();
        invalid.properties = serde_json::json!(["not", "an", "object"]);
        let error = repository
            .merge(&invalid, None)
            .expect_err("non-object relationship properties rejected");
        assert!(error.to_string().contains("properties"));

        invalid.properties = serde_json::json!({});
        invalid.evidence_tags = vec!["ok".into(), "".into()];
        let error = repository
            .merge(&invalid, None)
            .expect_err("invalid tag rejected");
        assert!(error.to_string().contains("evidence"));
    }

    #[test]
    fn remote_timeline_enrichment_is_best_effort_and_deduplicates_by_canonical_key() {
        let event = projected_node("event-1888", EntityType::Event, true);
        let archetype = projected_node("archetype-antichrist", EntityType::Archetype, false);
        let local = timeline_relationship(
            "sqlite-relationship-17",
            "event-1888",
            "archetype-antichrist",
            serde_json::json!({
                "seed_key": "root:event-1888:INSTANTIATES:antichrist",
                "reading": "locally-authoritative user reading",
            }),
        );
        let mut local_view = TimelineView {
            workspace_id: "sqlite:/offline".into(),
            nodes: vec![temporal_timeline_node(event.clone())],
            relationships: vec![local.clone()],
            lanes: vec![],
            diagnostics: vec![],
        };
        rebuild_timeline_relation_companions(&mut local_view, vec![archetype.clone()]);
        assert_eq!(
            local_view.nodes.len(),
            2,
            "local timeline already contains a renderable companion"
        );

        let before_failure = (
            local_view
                .nodes
                .iter()
                .map(|node| node.node.graph_node_id.clone())
                .collect::<BTreeSet<_>>(),
            local_view
                .relationships
                .iter()
                .map(|relationship| relationship.id.clone())
                .collect::<BTreeSet<_>>(),
        );
        apply_remote_timeline_enrichment(
            &mut local_view,
            Err("Bolt unavailable".into()),
            &BTreeSet::new(),
        );
        assert_eq!(
            local_view
                .nodes
                .iter()
                .map(|node| node.node.graph_node_id.clone())
                .collect::<BTreeSet<_>>(),
            before_failure.0,
            "Neo4j failure must leave the valid local timeline intact",
        );
        assert_eq!(
            local_view
                .relationships
                .iter()
                .map(|relationship| relationship.id.clone())
                .collect::<BTreeSet<_>>(),
            before_failure.1,
        );

        let remote_copy = timeline_relationship(
            "neo4j-element-id-9:17",
            "event-1888",
            "archetype-antichrist",
            serde_json::json!({
                "seed_key": "root:event-1888:INSTANTIATES:antichrist",
                "reading": "stale remote reading",
            }),
        );
        apply_remote_timeline_enrichment(
            &mut local_view,
            Ok((vec![remote_copy], vec![archetype])),
            &BTreeSet::new(),
        );
        assert_eq!(
            local_view.relationships.len(),
            1,
            "local and remote copies are one semantic edge"
        );
        assert_eq!(local_view.relationships[0].id, "sqlite-relationship-17");
        assert_eq!(
            local_view.relationships[0].properties["reading"], "locally-authoritative user reading",
            "remote enrichment must not replace a local relationship contract",
        );
        assert!(local_view.nodes.iter().any(|node| {
            node.node.graph_node_id == "archetype-antichrist" && node.relation_companion
        }));
        let presentation_ids = local_view
            .nodes
            .iter()
            .map(|node| node.node.graph_node_id.as_str())
            .collect::<BTreeSet<_>>();
        assert!(local_view.relationships.iter().all(|relationship| {
            presentation_ids.contains(relationship.source_graph_node_id.as_str())
                && presentation_ids.contains(relationship.target_graph_node_id.as_str())
        }));
    }

    #[test]
    fn tombstoned_local_canonical_key_suppresses_a_stale_remote_relationship() {
        let event = projected_node("event-1888", EntityType::Event, true);
        let archetype = projected_node("archetype-antichrist", EntityType::Archetype, false);
        let stale_remote = timeline_relationship(
            "neo4j-stale-deleted-edge",
            "event-1888",
            "archetype-antichrist",
            serde_json::json!({"canonicalKey": "user:event-1888:INSTANTIATES:archetype-antichrist"}),
        );
        let tombstoned_canonical_keys =
            BTreeSet::from(["user:event-1888:INSTANTIATES:archetype-antichrist".to_string()]);
        let mut local_view = TimelineView {
            workspace_id: "sqlite:/offline-delete".into(),
            nodes: vec![temporal_timeline_node(event)],
            relationships: vec![],
            lanes: vec![],
            diagnostics: vec![],
        };

        apply_remote_timeline_enrichment(
            &mut local_view,
            Ok((vec![stale_remote], vec![archetype])),
            &tombstoned_canonical_keys,
        );

        assert!(local_view.relationships.is_empty());
        assert_eq!(local_view.nodes.len(), 1, "no stale companion is surfaced");
    }
}

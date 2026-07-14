use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::{
    commands::graph::SharedGraphState,
    db::{
        connection::Database,
        repositories::{
            graph::{
                EntityType, GraphNode, GraphRelationship, Historicity, TemporalPrecision,
                TemporalRole,
            },
            GraphNodeMetadataRepository, NodeDocumentRepository, NodeRelationshipRepository,
            TimelineLayoutMutation, TimelineLayoutRecord, TimelineLayoutRepository,
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
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoadTimelineViewRequest {
    pub workspace_id: String,
    #[serde(default)]
    pub filters: TimelineFilters,
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
    let metadata = GraphNodeMetadataRepository::new(database.connection())
        .list_temporal()
        .map_err(|error| error.to_string())?;
    let documents = NodeDocumentRepository::new(database.connection());
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
        let metadata = row.metadata;
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
                    graph_node_id: metadata.graph_node_id,
                    code: TimelineDiagnosticCode::InvalidTemporalAnchor,
                    message,
                    valid_from: metadata.valid_from,
                    valid_to: metadata.valid_to,
                });
                continue;
            }
        };
        let Some(document) = documents
            .get_node_document(&metadata.graph_node_id)
            .map_err(|error| error.to_string())?
        else {
            diagnostics.push(TimelineDiagnostic {
                graph_node_id: metadata.graph_node_id,
                code: TimelineDiagnosticCode::MissingAuthoritativeDocument,
                message: "temporal metadata has no authoritative node_document".into(),
                valid_from: metadata.valid_from,
                valid_to: metadata.valid_to,
            });
            continue;
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
            node: GraphNode {
                graph_node_id: metadata.graph_node_id,
                entity_type: metadata.entity_type,
                title: metadata.title,
                body: document.body,
                summary: document.summary,
                archetypal_resonance: metadata.archetypal_resonance,
                coordinate: metadata.coordinate,
                source_coordinates: metadata.source_coordinates,
                evidence_tags: metadata.evidence_tags,
                source_kind: metadata.source_kind,
                content_origin: Some(document.content_origin),
                content_revision: Some(document.content_revision),
                seed_schema_version: metadata.seed_schema_version,
                body_source_coordinates: document.body_source_coordinates,
                historicity: metadata.historicity,
                claim_kind: metadata.claim_kind,
                evidence_status: metadata.evidence_status,
                temporal_role: metadata.temporal_role,
                place_coverage: metadata.place_coverage,
                ql_form: metadata.ql_form,
                ql_unit_id: metadata.ql_unit_id,
                ql_arc: metadata.ql_arc,
                ql_topology: metadata.ql_topology,
                ql_schema_version: metadata.ql_schema_version,
                ql_source_coordinates: metadata.ql_source_coordinates,
                ql_completeness_status: metadata.ql_completeness_status,
                is_temporal: true,
                valid_from: metadata.valid_from,
                valid_to: metadata.valid_to,
                temporal_precision: metadata.temporal_precision,
                created_at: row.created_at,
                updated_at: row.updated_at,
            },
        });
    }
    let temporal_ids = nodes
        .iter()
        .map(|node| node.node.graph_node_id.clone())
        .collect::<BTreeSet<_>>();
    let relationships = NodeRelationshipRepository::new(database.connection())
        .list_involving(&temporal_ids)
        .map_err(|error| error.to_string())?
        .into_iter()
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

fn matches_filters(
    metadata: &crate::db::repositories::GraphNodeMetadataRecord,
    filters: &TimelineFilters,
) -> bool {
    matches_value(Some(metadata.entity_type), &filters.entity_types)
        && matches_value(metadata.historicity, &filters.historicities)
        && matches_value(metadata.temporal_role, &filters.temporal_roles)
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
    let mut view = load_timeline_view_at_path(path, request)?;
    // Keep the timeline usable in a local/offline bootstrap, but when the
    // canonical graph is available carry the real temporal links with the
    // temporal nodes. This keeps the timeline its own first-class lens rather
    // than treating it as a constellation canvas.
    if let Some(graph_state) = app_handle.try_state::<SharedGraphState>() {
        let graph = crate::db::repositories::graph::GraphRepository::new(
            graph_state.graph.clone(),
            graph_state.database.clone(),
        );
        let temporal_ids = view
            .nodes
            .iter()
            .map(|node| node.node.graph_node_id.as_str())
            .collect::<std::collections::BTreeSet<_>>();
        let mut relationships = view
            .relationships
            .into_iter()
            .map(|relationship| (relationship.id.clone(), relationship))
            .collect::<BTreeMap<_, _>>();
        for relationship in graph
            .list_relationships()
            .await?
            .into_iter()
            .filter(|relationship| {
                temporal_ids.contains(relationship.source_graph_node_id.as_str())
                    && temporal_ids.contains(relationship.target_graph_node_id.as_str())
            })
        {
            relationships.insert(relationship.id.clone(), relationship);
        }
        view.relationships = relationships.into_values().collect();
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
            created_at: None,
            updated_at: None,
        }
    }

    #[test]
    fn local_relationships_round_trip_and_offline_timeline_projects_temporal_endpoints() {
        let directory = tempfile::tempdir().expect("temporary SQLite directory");
        let path = directory.path().join("timeline.sqlite");

        {
            let database = Database::open(&path).expect("migrated SQLite database");
            let metadata_repository = GraphNodeMetadataRepository::new(database.connection());
            for (graph_node_id, entity_type, is_temporal) in [
                ("event-1888", EntityType::Event, true),
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
                    .merge(&temporal_link)
                    .expect("persist local relationship"),
                RelationshipMutation::Created
            );
            assert_eq!(
                relationship_repository
                    .merge(&temporal_link)
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
                .merge(&relationship(
                    "unrelated-source-resonates-work",
                    "unrelated-source",
                    "unrelated-work",
                    "RESONATES_WITH",
                ))
                .expect("persist unrelated relationship");
        }

        let workspace_id = timeline_workspace_identity(&path).expect("workspace identity");

        let timeline = load_timeline_view_at_path(
            &path,
            LoadTimelineViewRequest {
                workspace_id,
                filters: TimelineFilters::default(),
            },
        )
        .expect("load offline timeline");

        assert_eq!(timeline.nodes.len(), 1);
        assert_eq!(timeline.relationships.len(), 1);
        let relationship = &timeline.relationships[0];
        assert_eq!(relationship.id, "event-1888-instantiates-antichrist");
        assert_eq!(relationship.source_graph_node_id, "event-1888");
        assert_eq!(relationship.target_graph_node_id, "archetype-antichrist");
        assert_eq!(relationship.rel_type, "INSTANTIATES");
        assert_eq!(
            relationship.properties,
            serde_json::json!({"reading": "concrete historical expression"})
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
            .merge(&invalid)
            .expect_err("invalid relationship id rejected");
        assert!(error.to_string().contains("relationship"));

        invalid.relationship_id = "valid-id".into();
        invalid.rel_type = "UNCONTROLLED".into();
        let error = repository
            .merge(&invalid)
            .expect_err("invalid relationship type rejected");
        assert!(error.to_string().contains("rel_type"));

        invalid.rel_type = "INSTANTIATES".into();
        invalid.properties = serde_json::json!(["not", "an", "object"]);
        let error = repository
            .merge(&invalid)
            .expect_err("non-object relationship properties rejected");
        assert!(error.to_string().contains("properties"));

        invalid.properties = serde_json::json!({});
        invalid.evidence_tags = vec!["ok".into(), "".into()];
        let error = repository
            .merge(&invalid)
            .expect_err("invalid tag rejected");
        assert!(error.to_string().contains("evidence"));
    }
}

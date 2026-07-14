use rusqlite::{params, types::Type, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use super::{
    error::{RepositoryError, RepositoryResult},
    graph::{
        validate_contract_revision, ClaimKind, ContentOrigin, EntityType, EvidenceStatus,
        Historicity, PlaceCoverage, QlArc, QlCompletenessStatus, QlForm, QlTopology,
        TemporalPrecision, TemporalRole,
    },
};
use crate::db::transaction::TransactionGuard;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalNodeDocument {
    pub graph_node_id: String,
    pub body: String,
    pub summary: String,
    pub neo4j_synced: bool,
    pub content_origin: ContentOrigin,
    pub content_revision: i64,
    pub body_source_coordinates: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentContentInput {
    pub graph_node_id: String,
    pub body: String,
    pub summary: String,
    pub content_origin: ContentOrigin,
    pub content_revision: i64,
    #[serde(default)]
    pub body_source_coordinates: Vec<String>,
    #[serde(default)]
    pub neo4j_synced: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMetadataProjection {
    pub entity_type: String,
    pub title: String,
    pub schema_version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingNodeStructure {
    pub graph_node_id: String,
    pub entity_type: EntityType,
    pub title: String,
    pub coordinate: Option<String>,
    pub source_coordinates: Vec<String>,
    pub evidence_tags: Vec<String>,
    pub source_kind: Option<String>,
    pub seed_schema_version: Option<i64>,
    pub historicity: Option<Historicity>,
    pub claim_kind: Option<ClaimKind>,
    pub evidence_status: Option<EvidenceStatus>,
    pub temporal_role: Option<TemporalRole>,
    pub place_coverage: Option<PlaceCoverage>,
    pub ql_form: Option<QlForm>,
    pub ql_unit_id: Option<String>,
    pub ql_arc: Option<QlArc>,
    pub ql_topology: Option<QlTopology>,
    pub ql_schema_version: Option<i64>,
    pub ql_source_coordinates: Vec<String>,
    pub ql_completeness_status: Option<QlCompletenessStatus>,
    pub is_temporal: bool,
    pub valid_from: Option<String>,
    pub valid_to: Option<String>,
    pub temporal_precision: Option<TemporalPrecision>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingNodeDocumentSync {
    pub document: LocalNodeDocument,
    pub structure: PendingNodeStructure,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentReconciliationItem {
    pub document: DocumentContentInput,
    #[serde(default)]
    pub expected_revision: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum NodeDocumentMutation {
    Created,
    Updated,
    Preserved,
    Conflict {
        current_revision: i64,
        reason: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconciliationDecision {
    pub graph_node_id: String,
    pub mutation: NodeDocumentMutation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SyncAcknowledgementMutation {
    Updated,
    Preserved,
    Missing,
    Conflict {
        current_revision: i64,
        current_origin: ContentOrigin,
        reason: String,
    },
}

pub struct NodeDocumentRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> NodeDocumentRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn get_node_document(
        &self,
        graph_node_id: &str,
    ) -> RepositoryResult<Option<LocalNodeDocument>> {
        self.connection
            .query_row(
                "SELECT graph_node_id, body, summary, neo4j_synced, content_origin,
                    content_revision, body_source_coordinates_json
             FROM node_document WHERE graph_node_id = ?1",
                params![graph_node_id],
                node_document_from_row,
            )
            .optional()
            .map_err(Into::into)
    }

    /// Returns every durable local document still awaiting Neo4j sync. A
    /// pending document without an exact structural projection is corruption:
    /// callers must never recreate it from a downgraded guessed node shape.
    pub fn list_pending_syncs(&self) -> RepositoryResult<Vec<PendingNodeDocumentSync>> {
        let mut statement = self.connection.prepare(
            "SELECT d.graph_node_id,d.body,d.summary,d.neo4j_synced,d.content_origin,
                    d.content_revision,d.body_source_coordinates_json,
                    m.entity_type,m.title,m.coordinate,m.source_coordinates_json,
                    m.evidence_tags_json,m.source_kind,m.seed_schema_version,m.historicity,
                    m.claim_kind,m.evidence_status,m.temporal_role,m.place_coverage,m.ql_form,
                    m.ql_unit_id,m.ql_arc,m.ql_topology,m.ql_schema_version,
                    m.ql_source_coordinates_json,m.ql_completeness_status,m.is_temporal,
                    m.valid_from,m.valid_to,m.temporal_precision,m.sync_state,
                    m.content_origin,m.content_revision,m.body_source_coordinates_json
             FROM node_document d
             LEFT JOIN graph_node_metadata m ON m.graph_node_id=d.graph_node_id
             WHERE d.neo4j_synced=0 OR m.sync_state='pending'
             ORDER BY d.graph_node_id",
        )?;
        let rows = statement.query_map([], pending_sync_from_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    /// Compatibility boundary for old call sites. It is deliberately a user
    /// edit, never seed content. Existing callers should migrate to
    /// `apply_user_edit` so stale writes can be rejected explicitly.
    pub fn upsert_node_document(
        &self,
        graph_node_id: &str,
        body: &str,
        summary: &str,
        neo4j_synced: bool,
    ) -> RepositoryResult<()> {
        match self.get_node_document(graph_node_id)? {
            Some(current) => {
                let mutation = self.apply_user_edit_with_sync(
                    graph_node_id,
                    body,
                    summary,
                    current.content_revision,
                    neo4j_synced,
                )?;
                conflict_as_error(mutation)
            }
            None => {
                let input = DocumentContentInput {
                    graph_node_id: graph_node_id.into(),
                    body: body.into(),
                    summary: summary.into(),
                    content_origin: ContentOrigin::UserAuthored,
                    content_revision: 0,
                    body_source_coordinates: vec![],
                    neo4j_synced,
                };
                conflict_as_error(self.apply_reconciliation(&input, None)?)
            }
        }
    }

    pub fn plan_reconciliation(
        &self,
        incoming: &DocumentContentInput,
        expected_revision: Option<i64>,
    ) -> RepositoryResult<NodeDocumentMutation> {
        validate_input(incoming, expected_revision)?;
        let current = self.get_node_document(&incoming.graph_node_id)?;
        Ok(plan(current.as_ref(), incoming, expected_revision))
    }

    pub fn plan_bulk(
        &self,
        items: &[DocumentReconciliationItem],
    ) -> RepositoryResult<Vec<ReconciliationDecision>> {
        validate_unique_bulk_ids(items)?;
        items
            .iter()
            .map(|item| {
                Ok(ReconciliationDecision {
                    graph_node_id: item.document.graph_node_id.clone(),
                    mutation: self.plan_reconciliation(&item.document, item.expected_revision)?,
                })
            })
            .collect()
    }

    /// Applies a stable ordered batch atomically. If planning or the
    /// transaction-time recheck contains a conflict, every item receives an
    /// explicit decision and the batch performs zero writes.
    pub fn apply_bulk(
        &self,
        items: &[DocumentReconciliationItem],
    ) -> RepositoryResult<Vec<ReconciliationDecision>> {
        let planned = self.plan_bulk(items)?;
        if planned
            .iter()
            .any(|decision| matches!(decision.mutation, NodeDocumentMutation::Conflict { .. }))
        {
            return Ok(planned);
        }
        let transaction = TransactionGuard::begin(self.connection)?;
        let fresh = self.apply_bulk_in_existing_transaction(items)?;
        if fresh
            .iter()
            .any(|decision| matches!(decision.mutation, NodeDocumentMutation::Conflict { .. }))
        {
            return Ok(fresh);
        }
        transaction.commit()?;
        Ok(fresh)
    }

    /// Applies a pre-validated batch inside a transaction owned by a higher
    /// level projection boundary. This is crate-visible so bootstrap can make
    /// the authoritative document and full graph metadata projection one
    /// atomic SQLite operation rather than leaving entity/title shells behind.
    pub(crate) fn apply_bulk_in_existing_transaction(
        &self,
        items: &[DocumentReconciliationItem],
    ) -> RepositoryResult<Vec<ReconciliationDecision>> {
        let fresh = self.plan_bulk(items)?;
        if fresh
            .iter()
            .any(|decision| matches!(decision.mutation, NodeDocumentMutation::Conflict { .. }))
        {
            return Ok(fresh);
        }
        for (item, decision) in items.iter().zip(&fresh) {
            self.apply_planned_without_transaction(
                &item.document,
                item.expected_revision,
                &decision.mutation,
            )?;
        }
        Ok(fresh)
    }

    pub fn apply_reconciliation(
        &self,
        incoming: &DocumentContentInput,
        expected_revision: Option<i64>,
    ) -> RepositoryResult<NodeDocumentMutation> {
        self.apply_reconciliation_with_projection(incoming, expected_revision, None)
    }

    pub fn apply_reconciliation_with_projection(
        &self,
        incoming: &DocumentContentInput,
        expected_revision: Option<i64>,
        projection: Option<&DocumentMetadataProjection>,
    ) -> RepositoryResult<NodeDocumentMutation> {
        let decision = self.plan_reconciliation(incoming, expected_revision)?;
        if matches!(decision, NodeDocumentMutation::Conflict { .. }) {
            return Ok(decision);
        }
        if projection.is_none() && matches!(decision, NodeDocumentMutation::Preserved) {
            return Ok(decision);
        }
        self.apply_reconciliation_with_projection_after_plan(
            incoming,
            expected_revision,
            projection,
        )
    }

    fn apply_reconciliation_with_projection_after_plan(
        &self,
        incoming: &DocumentContentInput,
        expected_revision: Option<i64>,
        projection: Option<&DocumentMetadataProjection>,
    ) -> RepositoryResult<NodeDocumentMutation> {
        let transaction = TransactionGuard::begin(self.connection)?;
        let fresh = self.get_node_document(&incoming.graph_node_id)?;
        let fresh_decision = plan(fresh.as_ref(), incoming, expected_revision);
        if matches!(fresh_decision, NodeDocumentMutation::Conflict { .. }) {
            return Ok(fresh_decision);
        }
        self.apply_planned_without_transaction(incoming, expected_revision, &fresh_decision)?;
        if let Some(projection) = projection {
            let accepted_document = self
                .get_node_document(&incoming.graph_node_id)?
                .ok_or_else(|| {
                    RepositoryError::CorruptData(
                        "accepted reconciliation has no persisted document".into(),
                    )
                })?;
            self.ensure_metadata_projection(&accepted_document, projection)?;
        }
        transaction.commit()?;
        Ok(fresh_decision)
    }

    /// Applies a reconciliation while a higher-level local operation owns the
    /// transaction. Attachment insertion uses this to make the asset row,
    /// usage role, document append, and metadata revision one SQLite commit.
    /// Callers must have begun a transaction on this repository's connection.
    pub(crate) fn apply_reconciliation_with_projection_in_existing_transaction(
        &self,
        incoming: &DocumentContentInput,
        expected_revision: Option<i64>,
        projection: Option<&DocumentMetadataProjection>,
    ) -> RepositoryResult<NodeDocumentMutation> {
        let fresh = self.get_node_document(&incoming.graph_node_id)?;
        let decision = plan(fresh.as_ref(), incoming, expected_revision);
        if matches!(decision, NodeDocumentMutation::Conflict { .. }) {
            return Ok(decision);
        }
        if projection.is_none() && matches!(decision, NodeDocumentMutation::Preserved) {
            return Ok(decision);
        }
        self.apply_planned_without_transaction(incoming, expected_revision, &decision)?;
        if let Some(projection) = projection {
            let accepted_document = self
                .get_node_document(&incoming.graph_node_id)?
                .ok_or_else(|| {
                    RepositoryError::CorruptData(
                        "accepted reconciliation has no persisted document".into(),
                    )
                })?;
            self.ensure_metadata_projection(&accepted_document, projection)?;
        }
        Ok(decision)
    }

    fn ensure_metadata_projection(
        &self,
        document: &LocalNodeDocument,
        projection: &DocumentMetadataProjection,
    ) -> RepositoryResult<()> {
        super::graph::EntityType::try_from(projection.entity_type.clone())
            .map_err(RepositoryError::Validation)?;
        validate_contract_revision("schemaVersion", projection.schema_version)
            .map_err(RepositoryError::Validation)?;
        self.connection.execute(
            "INSERT INTO graph_node_metadata(
              graph_node_id,entity_type,title,content_origin,content_revision,
              body_source_coordinates_json,is_temporal,schema_version,sync_state)
             VALUES (?1,?2,?3,?4,?5,?6,0,?7,?8)
             ON CONFLICT(graph_node_id) DO NOTHING",
            params![
                document.graph_node_id,
                projection.entity_type,
                projection.title,
                document.content_origin.as_str(),
                document.content_revision,
                json(&document.body_source_coordinates)?,
                projection.schema_version,
                if document.neo4j_synced {
                    "synced"
                } else {
                    "pending"
                }
            ],
        )?;
        let stored: (String, String, String, i64) = self.connection.query_row(
            "SELECT entity_type,title,content_origin,content_revision FROM graph_node_metadata WHERE graph_node_id=?1",
            [&document.graph_node_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;
        if stored
            != (
                projection.entity_type.clone(),
                projection.title.clone(),
                document.content_origin.as_str().to_string(),
                document.content_revision,
            )
        {
            return Err(RepositoryError::Validation(
                "existing graph metadata projection conflicts with local document creation".into(),
            ));
        }
        Ok(())
    }

    fn apply_planned_without_transaction(
        &self,
        incoming: &DocumentContentInput,
        expected_revision: Option<i64>,
        decision: &NodeDocumentMutation,
    ) -> RepositoryResult<()> {
        let previous = self.get_node_document(&incoming.graph_node_id)?;
        match decision {
            NodeDocumentMutation::Created => self.insert(incoming)?,
            NodeDocumentMutation::Updated => self.update(
                incoming,
                expected_revision
                    .or_else(|| previous.as_ref().map(|row| row.content_revision))
                    .expect("updated document has a current revision"),
            )?,
            NodeDocumentMutation::Preserved => return Ok(()),
            NodeDocumentMutation::Conflict { .. } => return Ok(()),
        }
        self.align_existing_graph_metadata(incoming, previous.as_ref())
    }

    /// Acknowledges a successful remote CAS without rewriting content or
    /// advancing its revision. Both local projections must still match.
    pub fn acknowledge_sync(
        &self,
        graph_node_id: &str,
        expected_revision: i64,
        expected_origin: ContentOrigin,
    ) -> RepositoryResult<SyncAcknowledgementMutation> {
        validate_contract_revision("expectedRevision", expected_revision)
            .map_err(RepositoryError::Validation)?;
        let Some(document) = self.get_node_document(graph_node_id)? else {
            return Ok(SyncAcknowledgementMutation::Missing);
        };
        if document.content_revision != expected_revision
            || document.content_origin != expected_origin
        {
            return Ok(SyncAcknowledgementMutation::Conflict {
                current_revision: document.content_revision,
                current_origin: document.content_origin,
                reason: "local document changed before remote sync acknowledgement".into(),
            });
        }
        let metadata: Option<(String, i64, String)> = self
            .connection
            .query_row(
                "SELECT content_origin, content_revision, sync_state FROM graph_node_metadata WHERE graph_node_id=?1",
                [graph_node_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;
        let Some((metadata_origin, metadata_revision, sync_state)) = metadata else {
            return Ok(SyncAcknowledgementMutation::Missing);
        };
        if metadata_revision != expected_revision || metadata_origin != expected_origin.as_str() {
            return Ok(SyncAcknowledgementMutation::Conflict {
                current_revision: metadata_revision,
                current_origin: ContentOrigin::try_from(metadata_origin)
                    .map_err(RepositoryError::CorruptData)?,
                reason: "graph metadata changed before remote sync acknowledgement".into(),
            });
        }
        if document.neo4j_synced && sync_state == "synced" {
            return Ok(SyncAcknowledgementMutation::Preserved);
        }
        let transaction = TransactionGuard::begin(self.connection)?;
        let document_updated = self.connection.execute(
            "UPDATE node_document SET neo4j_synced=1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE graph_node_id=?1 AND content_revision=?2 AND content_origin=?3",
            params![graph_node_id, expected_revision, expected_origin.as_str()],
        )?;
        let metadata_updated = self.connection.execute(
            "UPDATE graph_node_metadata SET sync_state='synced', remote_revision=?2,
             updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE graph_node_id=?1 AND content_revision=?2 AND content_origin=?3",
            params![graph_node_id, expected_revision, expected_origin.as_str()],
        )?;
        if document_updated != 1 || metadata_updated != 1 {
            return Ok(SyncAcknowledgementMutation::Conflict {
                current_revision: expected_revision,
                current_origin: expected_origin,
                reason: "local projections changed during sync acknowledgement".into(),
            });
        }
        transaction.commit()?;
        Ok(SyncAcknowledgementMutation::Updated)
    }

    pub fn apply_user_edit(
        &self,
        graph_node_id: &str,
        body: &str,
        summary: &str,
        expected_revision: i64,
    ) -> RepositoryResult<NodeDocumentMutation> {
        self.apply_user_edit_with_sync(graph_node_id, body, summary, expected_revision, false)
    }

    pub fn apply_user_edit_with_sync(
        &self,
        graph_node_id: &str,
        body: &str,
        summary: &str,
        expected_revision: i64,
        neo4j_synced: bool,
    ) -> RepositoryResult<NodeDocumentMutation> {
        validate_contract_revision("expectedRevision", expected_revision)
            .map_err(RepositoryError::Validation)?;
        let Some(next_revision) = expected_revision.checked_add(1) else {
            return Err(RepositoryError::Validation(
                "content revision exceeds JavaScript safe integer".into(),
            ));
        };
        let sources = self
            .get_node_document(graph_node_id)?
            .map(|d| d.body_source_coordinates)
            .unwrap_or_default();
        self.apply_reconciliation(
            &DocumentContentInput {
                graph_node_id: graph_node_id.into(),
                body: body.into(),
                summary: summary.into(),
                content_origin: ContentOrigin::UserAuthored,
                content_revision: next_revision,
                body_source_coordinates: sources,
                neo4j_synced,
            },
            Some(expected_revision),
        )
    }

    fn insert(&self, incoming: &DocumentContentInput) -> RepositoryResult<()> {
        self.connection.execute(
            "INSERT INTO node_document(graph_node_id, body, summary, updated_at, neo4j_synced,
              content_origin, content_revision, body_source_coordinates_json)
             VALUES (?1,?2,?3,strftime('%Y-%m-%dT%H:%M:%fZ','now'),?4,?5,?6,?7)",
            params![
                incoming.graph_node_id,
                incoming.body,
                incoming.summary,
                incoming.neo4j_synced as i64,
                incoming.content_origin.as_str(),
                incoming.content_revision,
                json(&incoming.body_source_coordinates)?
            ],
        )?;
        Ok(())
    }

    fn update(
        &self,
        incoming: &DocumentContentInput,
        expected_revision: i64,
    ) -> RepositoryResult<()> {
        let affected = self.connection.execute(
            "UPDATE node_document SET body=?2, summary=?3, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
              neo4j_synced=?4, content_origin=?5, content_revision=?6, body_source_coordinates_json=?7
             WHERE graph_node_id=?1 AND content_revision=?8",
            params![incoming.graph_node_id, incoming.body, incoming.summary, incoming.neo4j_synced as i64,
                incoming.content_origin.as_str(), incoming.content_revision, json(&incoming.body_source_coordinates)?, expected_revision],
        )?;
        if affected != 1 {
            return Err(RepositoryError::Validation(
                "document changed during optimistic update".into(),
            ));
        }
        Ok(())
    }

    /// If a metadata projection exists, its ownership/revision moves in the
    /// same SQLite transaction as the authoritative body. Missing projections
    /// are valid for local-only notes and are not manufactured here.
    fn align_existing_graph_metadata(
        &self,
        incoming: &DocumentContentInput,
        previous_document: Option<&LocalNodeDocument>,
    ) -> RepositoryResult<()> {
        let current: Option<(String, i64)> = self.connection.query_row(
            "SELECT content_origin, content_revision FROM graph_node_metadata WHERE graph_node_id=?1",
            [&incoming.graph_node_id], |row| Ok((row.get(0)?, row.get(1)?)),
        ).optional()?;
        let Some((origin, revision)) = current else {
            return Ok(());
        };
        let expected_revision = previous_document
            .map(|document| document.content_revision)
            .unwrap_or(incoming.content_revision);
        let expected_origin = previous_document
            .map(|document| document.content_origin.as_str())
            .unwrap_or_else(|| incoming.content_origin.as_str());
        if revision != expected_revision {
            return Err(RepositoryError::Validation(format!(
                "graph metadata revision {revision} does not match document revision {expected_revision}"
            )));
        }
        if origin != expected_origin {
            return Err(RepositoryError::Validation(format!(
                "graph metadata ownership {origin:?} does not match document ownership {expected_origin:?}"
            )));
        }
        self.connection.execute(
            "UPDATE graph_node_metadata SET content_origin=?2, content_revision=?3,
             body_source_coordinates_json=?4, sync_state=?5,
             updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE graph_node_id=?1",
            params![
                incoming.graph_node_id,
                incoming.content_origin.as_str(),
                incoming.content_revision,
                json(&incoming.body_source_coordinates)?,
                if incoming.neo4j_synced {
                    "synced"
                } else {
                    "pending"
                }
            ],
        )?;
        Ok(())
    }
}

fn validate_unique_bulk_ids(items: &[DocumentReconciliationItem]) -> RepositoryResult<()> {
    let mut seen = HashSet::with_capacity(items.len());
    for item in items {
        if !seen.insert(item.document.graph_node_id.as_str()) {
            return Err(RepositoryError::Validation(format!(
                "duplicate graph node id {} in reconciliation batch",
                item.document.graph_node_id
            )));
        }
    }
    Ok(())
}

fn plan(
    current: Option<&LocalNodeDocument>,
    incoming: &DocumentContentInput,
    expected_revision: Option<i64>,
) -> NodeDocumentMutation {
    let Some(current) = current else {
        return NodeDocumentMutation::Created;
    };
    let same_substance = current.body == incoming.body
        && current.summary == incoming.summary
        && current.content_origin == incoming.content_origin
        && current.content_revision == incoming.content_revision
        && current.body_source_coordinates == incoming.body_source_coordinates;
    if same_substance {
        return if current.neo4j_synced == incoming.neo4j_synced {
            NodeDocumentMutation::Preserved
        } else {
            NodeDocumentMutation::Updated
        };
    }
    if incoming.content_origin == ContentOrigin::UserAuthored
        && expected_revision != Some(current.content_revision)
    {
        return NodeDocumentMutation::Conflict {
            current_revision: current.content_revision,
            reason: "expected revision does not match persisted revision".into(),
        };
    }
    if incoming.content_revision == current.content_revision {
        return NodeDocumentMutation::Conflict {
            current_revision: current.content_revision,
            reason: "different content at the same revision".into(),
        };
    }
    if incoming.content_revision < current.content_revision {
        return NodeDocumentMutation::Preserved;
    }
    match incoming.content_origin {
        ContentOrigin::Seed if current.content_origin != ContentOrigin::Seed => {
            return NodeDocumentMutation::Preserved
        }
        ContentOrigin::CorpusCompiled if current.content_origin == ContentOrigin::UserAuthored => {
            return NodeDocumentMutation::Preserved
        }
        ContentOrigin::Imported => {
            return NodeDocumentMutation::Conflict {
                current_revision: current.content_revision,
                reason: "imported content cannot take over an existing document".into(),
            }
        }
        _ => {}
    }
    if expected_revision != Some(current.content_revision) {
        return NodeDocumentMutation::Conflict {
            current_revision: current.content_revision,
            reason: "expected revision does not match persisted revision".into(),
        };
    }
    NodeDocumentMutation::Updated
}

fn validate_input(
    input: &DocumentContentInput,
    expected_revision: Option<i64>,
) -> RepositoryResult<()> {
    validate_contract_revision("contentRevision", input.content_revision)
        .map_err(RepositoryError::Validation)?;
    if let Some(value) = expected_revision {
        validate_contract_revision("expectedRevision", value)
            .map_err(RepositoryError::Validation)?;
    }
    serde_json::to_string(&input.body_source_coordinates)
        .map_err(|e| RepositoryError::Validation(e.to_string()))?;
    Ok(())
}

fn json(values: &[String]) -> RepositoryResult<String> {
    serde_json::to_string(values).map_err(|e| RepositoryError::Validation(e.to_string()))
}

fn conflict_as_error(mutation: NodeDocumentMutation) -> RepositoryResult<()> {
    match mutation {
        NodeDocumentMutation::Conflict { reason, .. } => Err(RepositoryError::Validation(reason)),
        _ => Ok(()),
    }
}

fn node_document_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LocalNodeDocument> {
    let raw_origin: String = row.get(4)?;
    let content_origin = ContentOrigin::try_from(raw_origin).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            4,
            Type::Text,
            Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, error)),
        )
    })?;
    let raw_sources: String = row.get(6)?;
    let body_source_coordinates = serde_json::from_str(&raw_sources).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(6, Type::Text, Box::new(error))
    })?;
    Ok(LocalNodeDocument {
        graph_node_id: row.get(0)?,
        body: row.get(1)?,
        summary: row.get(2)?,
        neo4j_synced: row.get::<_, i64>(3)? != 0,
        content_origin,
        content_revision: row.get(5)?,
        body_source_coordinates,
    })
}

fn pending_sync_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<PendingNodeDocumentSync> {
    let document = node_document_from_row(row)?;
    let metadata_origin: String = row.get(31)?;
    let metadata_revision: i64 = row.get(32)?;
    let metadata_body_sources: Vec<String> = string_vec(row, 33)?;
    let sync_state: String = row.get(30)?;
    if metadata_origin != document.content_origin.as_str()
        || metadata_revision != document.content_revision
        || metadata_body_sources != document.body_source_coordinates
        || !matches!(sync_state.as_str(), "pending" | "synced")
    {
        return Err(conversion_error(
            30,
            "pending node document and graph metadata projection are not coherent",
        ));
    }
    Ok(PendingNodeDocumentSync {
        structure: PendingNodeStructure {
            graph_node_id: document.graph_node_id.clone(),
            entity_type: enum_value(row, 7)?,
            title: row.get(8)?,
            coordinate: row.get(9)?,
            source_coordinates: string_vec(row, 10)?,
            evidence_tags: string_vec(row, 11)?,
            source_kind: row.get(12)?,
            seed_schema_version: row.get(13)?,
            historicity: optional_enum_value(row, 14)?,
            claim_kind: optional_enum_value(row, 15)?,
            evidence_status: optional_enum_value(row, 16)?,
            temporal_role: optional_enum_value(row, 17)?,
            place_coverage: optional_enum_value(row, 18)?,
            ql_form: optional_enum_value(row, 19)?,
            ql_unit_id: row.get(20)?,
            ql_arc: optional_enum_value(row, 21)?,
            ql_topology: optional_enum_value(row, 22)?,
            ql_schema_version: row.get(23)?,
            ql_source_coordinates: string_vec(row, 24)?,
            ql_completeness_status: optional_enum_value(row, 25)?,
            is_temporal: row.get::<_, i64>(26)? != 0,
            valid_from: row.get(27)?,
            valid_to: row.get(28)?,
            temporal_precision: optional_enum_value(row, 29)?,
        },
        document,
    })
}

fn string_vec(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<Vec<String>> {
    let raw: String = row.get(index)?;
    serde_json::from_str(&raw).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(index, Type::Text, Box::new(error))
    })
}

fn enum_value<T>(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<T>
where
    T: TryFrom<String, Error = String>,
{
    let raw: String = row.get(index)?;
    T::try_from(raw).map_err(|error| conversion_error(index, &error))
}

fn optional_enum_value<T>(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<Option<T>>
where
    T: TryFrom<String, Error = String>,
{
    row.get::<_, Option<String>>(index)?
        .map(|raw| T::try_from(raw).map_err(|error| conversion_error(index, &error)))
        .transpose()
}

fn conversion_error(index: usize, message: &str) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        index,
        Type::Text,
        Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            message.to_string(),
        )),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::Database;

    fn input(
        graph_node_id: &str,
        body: &str,
        content_origin: ContentOrigin,
        content_revision: i64,
    ) -> DocumentContentInput {
        DocumentContentInput {
            graph_node_id: graph_node_id.into(),
            body: body.into(),
            summary: format!("{body} face"),
            content_origin,
            content_revision,
            body_source_coordinates: vec![format!("{body}.md#source")],
            neo4j_synced: false,
        }
    }

    #[test]
    fn transaction_time_conflict_after_initial_plan_creates_no_stale_projection() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("fresh-conflict.db");
        let db = Database::open(path.to_str().unwrap()).expect("open db");
        let repo = NodeDocumentRepository::new(db.connection());
        repo.apply_reconciliation(&input("raced", "seed-v1", ContentOrigin::Seed, 1), None)
            .unwrap();
        let incoming = input("raced", "seed-v2", ContentOrigin::Seed, 2);
        assert_eq!(
            repo.plan_reconciliation(&incoming, Some(1)).unwrap(),
            NodeDocumentMutation::Updated
        );

        repo.apply_user_edit("raced", "authored", "authored face", 1)
            .unwrap();
        let mutation = repo
            .apply_reconciliation_with_projection_after_plan(
                &incoming,
                Some(1),
                Some(&DocumentMetadataProjection {
                    entity_type: "Work".into(),
                    title: "Raced note".into(),
                    schema_version: 1,
                }),
            )
            .unwrap();

        assert!(matches!(mutation, NodeDocumentMutation::Conflict { .. }));
        let stored = repo.get_node_document("raced").unwrap().unwrap();
        assert_eq!(stored.body, "authored");
        assert_eq!(stored.content_origin, ContentOrigin::UserAuthored);
        let projection_count: i64 = db
            .connection()
            .query_row(
                "SELECT count(*) FROM graph_node_metadata WHERE graph_node_id='raced'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(projection_count, 0);
    }
}

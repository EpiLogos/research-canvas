use rusqlite::{params, types::Type, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::{
    error::{RepositoryError, RepositoryResult},
    graph::{validate_contract_revision, ContentOrigin},
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
        transaction.commit()?;
        Ok(fresh)
    }

    pub fn apply_reconciliation(
        &self,
        incoming: &DocumentContentInput,
        expected_revision: Option<i64>,
    ) -> RepositoryResult<NodeDocumentMutation> {
        let decision = self.plan_reconciliation(incoming, expected_revision)?;
        if !matches!(
            decision,
            NodeDocumentMutation::Created | NodeDocumentMutation::Updated
        ) {
            return Ok(decision);
        }
        let transaction = TransactionGuard::begin(self.connection)?;
        let fresh = self.get_node_document(&incoming.graph_node_id)?;
        let fresh_decision = plan(fresh.as_ref(), incoming, expected_revision);
        self.apply_planned_without_transaction(incoming, expected_revision, &fresh_decision)?;
        transaction.commit()?;
        Ok(fresh_decision)
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

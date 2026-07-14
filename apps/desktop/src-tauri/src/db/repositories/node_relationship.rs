use std::{collections::BTreeSet, fmt::Display};

use rusqlite::{types::Type, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{
    error::{RepositoryError, RepositoryResult},
    graph::{validate_contract_revision, validate_rel_type, ContentOrigin, GraphRelationship},
    graph_metadata::SyncState,
};

const MAX_IDENTIFIER_LENGTH: usize = 512;

/// The local, synchronisable relationship projection. The adapter to
/// `GraphRelationship` intentionally discards persistence-only provenance so
/// existing graph consumers can remain unchanged.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeRelationshipRecord {
    pub relationship_id: String,
    pub source_graph_node_id: String,
    pub target_graph_node_id: String,
    pub rel_type: String,
    pub properties: Value,
    #[serde(default)]
    pub source_coordinates: Vec<String>,
    #[serde(default)]
    pub evidence_tags: Vec<String>,
    pub origin: ContentOrigin,
    pub sync_state: SyncState,
    pub revision: i64,
    pub remote_revision: Option<i64>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

impl NodeRelationshipRecord {
    pub fn as_graph_relationship(&self) -> GraphRelationship {
        GraphRelationship {
            id: self.relationship_id.clone(),
            rel_type: self.rel_type.clone(),
            source_graph_node_id: self.source_graph_node_id.clone(),
            target_graph_node_id: self.target_graph_node_id.clone(),
            properties: self.properties.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RelationshipMutation {
    Created,
    Updated,
    Preserved,
    Conflict {
        current_revision: i64,
        reason: String,
    },
}

pub struct NodeRelationshipRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> NodeRelationshipRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn get(&self, relationship_id: &str) -> RepositoryResult<Option<NodeRelationshipRecord>> {
        validate_identifier("relationship id", relationship_id)?;
        self.connection
            .query_row(
                "SELECT relationship_id, source_graph_node_id, target_graph_node_id, rel_type,
                        properties_json, source_coordinates_json, evidence_tags_json, origin,
                        sync_state, relationship_revision, remote_revision, created_at, updated_at
                 FROM graph_relationship WHERE relationship_id=?1",
                [relationship_id],
                relationship_from_row,
            )
            .optional()
            .map_err(Into::into)
    }

    /// Lists every relationship with an endpoint in `graph_node_ids`.
    /// This deliberately includes a temporal Event → atemporal Archetype or
    /// Constellation edge: only one endpoint needs to appear on the timeline.
    pub fn list_involving(
        &self,
        graph_node_ids: &BTreeSet<String>,
    ) -> RepositoryResult<Vec<NodeRelationshipRecord>> {
        if graph_node_ids.is_empty() {
            return Ok(Vec::new());
        }
        for graph_node_id in graph_node_ids {
            validate_identifier("graph node id", graph_node_id)?;
        }
        let placeholders = (1..=graph_node_ids.len())
            .map(|index| format!("?{index}"))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT relationship_id, source_graph_node_id, target_graph_node_id, rel_type,
                    properties_json, source_coordinates_json, evidence_tags_json, origin,
                    sync_state, relationship_revision, remote_revision, created_at, updated_at
             FROM graph_relationship
             WHERE source_graph_node_id IN ({placeholders})
                OR target_graph_node_id IN ({placeholders})
             ORDER BY relationship_id"
        );
        let mut statement = self.connection.prepare(&sql)?;
        let rows = statement.query_map(
            rusqlite::params_from_iter(graph_node_ids.iter()),
            relationship_from_row,
        )?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    /// Idempotent upsert with a stable relationship id. Replaying the same
    /// revision preserves the row; only a higher revision may replace its
    /// structured relationship contract.
    pub fn merge(
        &self,
        incoming: &NodeRelationshipRecord,
    ) -> RepositoryResult<RelationshipMutation> {
        validate_record(incoming)?;
        let Some(current) = self.get(&incoming.relationship_id)? else {
            let affected = self.connection.execute(
                "INSERT INTO graph_relationship(
                    relationship_id, source_graph_node_id, target_graph_node_id, rel_type,
                    properties_json, source_coordinates_json, evidence_tags_json, origin,
                    sync_state, relationship_revision, remote_revision
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                 ON CONFLICT(relationship_id) DO NOTHING",
                record_params(incoming)?,
            )?;
            return if affected == 1 {
                Ok(RelationshipMutation::Created)
            } else {
                let current_revision = self
                    .get(&incoming.relationship_id)?
                    .map(|record| record.revision)
                    .unwrap_or(incoming.revision);
                Ok(RelationshipMutation::Conflict {
                    current_revision,
                    reason: "relationship was concurrently created".into(),
                })
            };
        };

        if same_contract(&current, incoming) {
            return Ok(RelationshipMutation::Preserved);
        }
        if incoming.revision < current.revision {
            return Ok(RelationshipMutation::Preserved);
        }
        if incoming.revision == current.revision {
            return Ok(RelationshipMutation::Conflict {
                current_revision: current.revision,
                reason: "different relationship contract at the same revision".into(),
            });
        }

        let affected = self.connection.execute(
            "UPDATE graph_relationship SET
                source_graph_node_id=?2, target_graph_node_id=?3, rel_type=?4,
                properties_json=?5, source_coordinates_json=?6, evidence_tags_json=?7,
                origin=?8, sync_state=?9, relationship_revision=?10, remote_revision=?11,
                updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE relationship_id=?1 AND relationship_revision=?12",
            update_params(incoming, current.revision)?,
        )?;
        if affected == 1 {
            return Ok(RelationshipMutation::Updated);
        }
        let current_revision = self
            .get(&incoming.relationship_id)?
            .map(|record| record.revision)
            .unwrap_or(current.revision);
        Ok(RelationshipMutation::Conflict {
            current_revision,
            reason: "relationship changed during merge".into(),
        })
    }
}

fn same_contract(left: &NodeRelationshipRecord, right: &NodeRelationshipRecord) -> bool {
    left.relationship_id == right.relationship_id
        && left.source_graph_node_id == right.source_graph_node_id
        && left.target_graph_node_id == right.target_graph_node_id
        && left.rel_type == right.rel_type
        && left.properties == right.properties
        && left.source_coordinates == right.source_coordinates
        && left.evidence_tags == right.evidence_tags
        && left.origin == right.origin
        && left.sync_state == right.sync_state
        && left.revision == right.revision
        && left.remote_revision == right.remote_revision
}

fn record_params(
    record: &NodeRelationshipRecord,
) -> RepositoryResult<[rusqlite::types::Value; 11]> {
    Ok([
        record.relationship_id.clone().into(),
        record.source_graph_node_id.clone().into(),
        record.target_graph_node_id.clone().into(),
        record.rel_type.clone().into(),
        json_value(&record.properties)?.into(),
        json_strings(&record.source_coordinates)?.into(),
        json_strings(&record.evidence_tags)?.into(),
        record.origin.as_str().to_owned().into(),
        record.sync_state.as_str().to_owned().into(),
        record.revision.into(),
        match record.remote_revision {
            Some(revision) => revision.into(),
            None => rusqlite::types::Value::Null,
        },
    ])
}

fn update_params(
    record: &NodeRelationshipRecord,
    current_revision: i64,
) -> RepositoryResult<[rusqlite::types::Value; 12]> {
    let [id, source, target, rel_type, properties, coordinates, tags, origin, sync, revision, remote] =
        record_params(record)?;
    Ok([
        id,
        source,
        target,
        rel_type,
        properties,
        coordinates,
        tags,
        origin,
        sync,
        revision,
        remote,
        current_revision.into(),
    ])
}

fn validate_record(record: &NodeRelationshipRecord) -> RepositoryResult<()> {
    validate_identifier("relationship id", &record.relationship_id)?;
    validate_identifier("source graph node id", &record.source_graph_node_id)?;
    validate_identifier("target graph node id", &record.target_graph_node_id)?;
    validate_rel_type(&record.rel_type).map_err(RepositoryError::Validation)?;
    if !record.properties.is_object() {
        return Err(RepositoryError::Validation(
            "relationship properties must be a JSON object".into(),
        ));
    }
    validate_string_vector(
        "relationship source coordinates",
        &record.source_coordinates,
    )?;
    validate_string_vector("relationship evidence tags", &record.evidence_tags)?;
    validate_contract_revision("relationshipRevision", record.revision)
        .map_err(RepositoryError::Validation)?;
    if let Some(revision) = record.remote_revision {
        validate_contract_revision("remoteRevision", revision)
            .map_err(RepositoryError::Validation)?;
    }
    Ok(())
}

fn validate_identifier(label: &str, value: &str) -> RepositoryResult<()> {
    if value.trim().is_empty()
        || value.len() > MAX_IDENTIFIER_LENGTH
        || value.chars().any(char::is_control)
    {
        return Err(RepositoryError::Validation(format!(
            "{label} must be a non-empty, bounded identifier without control characters"
        )));
    }
    Ok(())
}

fn validate_string_vector(label: &str, values: &[String]) -> RepositoryResult<()> {
    if values.iter().any(|value| {
        value.trim().is_empty()
            || value.len() > MAX_IDENTIFIER_LENGTH
            || value.chars().any(char::is_control)
    }) {
        return Err(RepositoryError::Validation(format!(
            "{label} must contain non-empty bounded strings without control characters"
        )));
    }
    Ok(())
}

fn json_value(value: &Value) -> RepositoryResult<String> {
    serde_json::to_string(value).map_err(|error| RepositoryError::Validation(error.to_string()))
}

fn json_strings(values: &[String]) -> RepositoryResult<String> {
    serde_json::to_string(values).map_err(|error| RepositoryError::Validation(error.to_string()))
}

fn relationship_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<NodeRelationshipRecord> {
    let properties = object_json(row, 4, "relationship properties")?;
    let source_coordinates = string_vector(row, 5, "relationship source coordinates")?;
    let evidence_tags = string_vector(row, 6, "relationship evidence tags")?;
    let origin: String = row.get(7)?;
    let sync_state: String = row.get(8)?;
    Ok(NodeRelationshipRecord {
        relationship_id: row.get(0)?,
        source_graph_node_id: row.get(1)?,
        target_graph_node_id: row.get(2)?,
        rel_type: row.get(3)?,
        properties,
        source_coordinates,
        evidence_tags,
        origin: ContentOrigin::try_from(origin).map_err(|error| decode_error(7, error))?,
        sync_state: SyncState::try_from(sync_state).map_err(|error| decode_error(8, error))?,
        revision: row.get(9)?,
        remote_revision: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn object_json(row: &rusqlite::Row<'_>, index: usize, label: &str) -> rusqlite::Result<Value> {
    let raw: String = row.get(index)?;
    let value: Value = serde_json::from_str(&raw).map_err(|error| decode_error(index, error))?;
    if !value.is_object() {
        return Err(decode_error(
            index,
            format!("{label} must be a JSON object"),
        ));
    }
    Ok(value)
}

fn string_vector(
    row: &rusqlite::Row<'_>,
    index: usize,
    label: &str,
) -> rusqlite::Result<Vec<String>> {
    let raw: String = row.get(index)?;
    let values: Vec<String> =
        serde_json::from_str(&raw).map_err(|error| decode_error(index, error))?;
    if values.iter().any(|value| value.trim().is_empty()) {
        return Err(decode_error(
            index,
            format!("{label} cannot contain empty strings"),
        ));
    }
    Ok(values)
}

fn decode_error(index: usize, error: impl Display) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        index,
        Type::Text,
        Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            error.to_string(),
        )),
    )
}

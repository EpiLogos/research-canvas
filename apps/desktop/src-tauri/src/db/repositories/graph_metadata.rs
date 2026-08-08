use std::{error::Error, fmt::Display};

use rusqlite::{types::Type, Connection, OptionalExtension, Result as SqlResult};
use serde::{Deserialize, Serialize};

use super::error::{RepositoryError, RepositoryResult};
use super::graph::{
    validate_contract_revision, ClaimKind, ContentOrigin, EntityType, EvidenceStatus, Historicity,
    PlaceCoverage, QlArc, QlCompletenessStatus, QlForm, QlTopology, TemporalPrecision,
    TemporalRole,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SyncState {
    Pending,
    Synced,
    Conflict,
}

impl SyncState {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Synced => "synced",
            Self::Conflict => "conflict",
        }
    }
}

impl TryFrom<String> for SyncState {
    type Error = String;
    fn try_from(value: String) -> std::result::Result<Self, Self::Error> {
        match value.as_str() {
            "pending" => Ok(Self::Pending),
            "synced" => Ok(Self::Synced),
            "conflict" => Ok(Self::Conflict),
            _ => Err(format!("unknown SyncState value: {value}")),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GraphNodeMetadataRecord {
    pub graph_node_id: String,
    pub entity_type: EntityType,
    pub title: String,
    pub archetypal_resonance: Option<String>,
    pub coordinate: Option<String>,
    pub source_coordinates: Vec<String>,
    pub evidence_tags: Vec<String>,
    pub source_kind: Option<String>,
    pub content_origin: ContentOrigin,
    pub content_revision: i64,
    pub seed_schema_version: Option<i64>,
    pub body_source_coordinates: Vec<String>,
    pub historicity: Option<Historicity>,
    pub claim_kind: Option<ClaimKind>,
    pub evidence_status: Option<EvidenceStatus>,
    pub temporal_role: Option<TemporalRole>,
    pub place_coverage: Option<PlaceCoverage>,
    pub place: Option<String>,
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
    pub schema_version: i64,
    pub sync_state: SyncState,
    pub remote_revision: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TemporalGraphNodeMetadataRecord {
    pub metadata: GraphNodeMetadataRecord,
    /// The short face/subheading from the local document projection. This is
    /// intentionally joined into timeline reads; the long body remains lazy.
    pub summary: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GraphMetadataMutation {
    Created,
    Updated,
    Preserved,
    Conflict {
        current_revision: i64,
        reason: String,
    },
}

pub struct GraphNodeMetadataRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> GraphNodeMetadataRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn get(&self, graph_node_id: &str) -> RepositoryResult<Option<GraphNodeMetadataRecord>> {
        self.connection
            .query_row(
                "SELECT graph_node_id, entity_type, title, archetypal_resonance, coordinate,
             source_coordinates_json, evidence_tags_json, source_kind, content_origin,
             content_revision, seed_schema_version, body_source_coordinates_json, historicity,
             claim_kind, evidence_status, temporal_role, place_coverage, place_json, ql_form, ql_unit_id,
             ql_arc, ql_topology, ql_schema_version, ql_source_coordinates_json,
             ql_completeness_status, is_temporal, valid_from, valid_to, temporal_precision,
             schema_version, sync_state, remote_revision
             FROM graph_node_metadata WHERE graph_node_id = ?1",
                [graph_node_id],
                record_from_row,
            )
            .optional()
            .map_err(Into::into)
    }

    /// Reads the full local projection, including durable timestamps, for a
    /// companion record that must be presentable outside the temporal lens.
    pub fn get_with_timestamps(
        &self,
        graph_node_id: &str,
    ) -> RepositoryResult<Option<TemporalGraphNodeMetadataRecord>> {
        self.connection
            .query_row(
                "SELECT graph_node_id, entity_type, title, archetypal_resonance, coordinate,
             source_coordinates_json, evidence_tags_json, source_kind, content_origin,
             content_revision, seed_schema_version, body_source_coordinates_json, historicity,
             claim_kind, evidence_status, temporal_role, place_coverage, place_json, ql_form, ql_unit_id,
             ql_arc, ql_topology, ql_schema_version, ql_source_coordinates_json,
             ql_completeness_status, is_temporal, valid_from, valid_to, temporal_precision,
             schema_version, sync_state, remote_revision, created_at, updated_at,
             COALESCE((SELECT summary FROM node_document WHERE graph_node_id = graph_node_metadata.graph_node_id), '')
             FROM graph_node_metadata WHERE graph_node_id = ?1",
                [graph_node_id],
                |row| {
                    Ok(TemporalGraphNodeMetadataRecord {
                        metadata: record_from_row(row)?,
                        created_at: row.get(32)?,
                        updated_at: row.get(33)?,
                        summary: row.get(34)?,
                    })
                },
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn list_temporal(&self) -> RepositoryResult<Vec<TemporalGraphNodeMetadataRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT graph_node_id, entity_type, title, archetypal_resonance, coordinate,
             source_coordinates_json, evidence_tags_json, source_kind, content_origin,
             content_revision, seed_schema_version, body_source_coordinates_json, historicity,
             claim_kind, evidence_status, temporal_role, place_coverage, place_json, ql_form, ql_unit_id,
             ql_arc, ql_topology, ql_schema_version, ql_source_coordinates_json,
             ql_completeness_status, is_temporal, valid_from, valid_to, temporal_precision,
             schema_version, sync_state, remote_revision, created_at, updated_at,
             COALESCE((SELECT summary FROM node_document WHERE graph_node_id = graph_node_metadata.graph_node_id), '')
             FROM graph_node_metadata WHERE is_temporal=1 ORDER BY graph_node_id",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(TemporalGraphNodeMetadataRecord {
                metadata: record_from_row(row)?,
                created_at: row.get(32)?,
                updated_at: row.get(33)?,
                summary: row.get(34)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    /// Returns only temporal records whose inclusive temporal span intersects
    /// the requested year window. The indexed `is_temporal, valid_from` prefix
    /// keeps camera-driven timeline reads bounded. Only the short document
    /// summary is projected; long bodies remain lazy at the reader boundary.
    pub fn list_temporal_in_year_range(
        &self,
        start_year: i32,
        end_year: i32,
    ) -> RepositoryResult<Vec<TemporalGraphNodeMetadataRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT graph_node_id, entity_type, title, archetypal_resonance, coordinate,
             source_coordinates_json, evidence_tags_json, source_kind, content_origin,
             content_revision, seed_schema_version, body_source_coordinates_json, historicity,
             claim_kind, evidence_status, temporal_role, place_coverage, place_json, ql_form, ql_unit_id,
             ql_arc, ql_topology, ql_schema_version, ql_source_coordinates_json,
             ql_completeness_status, is_temporal, valid_from, valid_to, temporal_precision,
             schema_version, sync_state, remote_revision, created_at, updated_at,
             COALESCE((SELECT summary FROM node_document WHERE graph_node_id = graph_node_metadata.graph_node_id), '')
             FROM graph_node_metadata
             WHERE is_temporal=1
               AND valid_from IS NOT NULL
               AND CAST(substr(valid_from, 1, 4) AS INTEGER) <= ?2
               AND (valid_to IS NULL OR CAST(substr(valid_to, 1, 4) AS INTEGER) >= ?1)
             ORDER BY graph_node_id",
        )?;
        let rows = statement.query_map([start_year, end_year], |row| {
            Ok(TemporalGraphNodeMetadataRecord {
                metadata: record_from_row(row)?,
                created_at: row.get(32)?,
                updated_at: row.get(33)?,
                summary: row.get(34)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    /// Optimistic, ownership-aware persistence. `expected_revision` is required
    /// for changing an existing row. Exact retries are preserved. Automated
    /// origins can never replace user-authored substance.
    pub fn save(
        &self,
        incoming: &GraphNodeMetadataRecord,
        expected_revision: Option<i64>,
    ) -> RepositoryResult<GraphMetadataMutation> {
        validate_record_versions(incoming)?;
        if let Some(expected_revision) = expected_revision {
            validate_contract_revision("expectedRevision", expected_revision)
                .map_err(RepositoryError::Validation)?;
        }
        let Some(current) = self.get(&incoming.graph_node_id)? else {
            if insert_record(self.connection, incoming)? {
                return Ok(GraphMetadataMutation::Created);
            }
            let current_revision = self
                .get(&incoming.graph_node_id)?
                .map(|record| record.content_revision)
                .unwrap_or(incoming.content_revision);
            return Ok(GraphMetadataMutation::Conflict {
                current_revision,
                reason: "graph node id was concurrently created".into(),
            });
        };
        if current == *incoming {
            return Ok(GraphMetadataMutation::Preserved);
        }
        if current.content_origin == ContentOrigin::UserAuthored
            && incoming.content_origin != ContentOrigin::UserAuthored
        {
            return Ok(GraphMetadataMutation::Preserved);
        }
        if incoming.content_revision < current.content_revision {
            return Ok(GraphMetadataMutation::Preserved);
        }
        if incoming.content_revision == current.content_revision {
            return Ok(GraphMetadataMutation::Conflict {
                current_revision: current.content_revision,
                reason: "different content at the same revision".into(),
            });
        }
        if expected_revision != Some(current.content_revision) {
            return Ok(GraphMetadataMutation::Conflict {
                current_revision: current.content_revision,
                reason: "expected revision does not match persisted revision".into(),
            });
        }
        if update_record(self.connection, incoming, current.content_revision)? {
            return Ok(GraphMetadataMutation::Updated);
        }
        let current_revision = self
            .get(&incoming.graph_node_id)?
            .map(|record| record.content_revision)
            .unwrap_or(current.content_revision);
        Ok(GraphMetadataMutation::Conflict {
            current_revision,
            reason: "graph metadata changed during optimistic update".into(),
        })
    }

    /// Ensures the complete structural half of a canonical seed projection
    /// while retaining the persisted content owner, revision and remote-sync
    /// acknowledgement. Reviewed QL metadata is never erased by an older seed
    /// that has no QL disposition yet.
    pub fn ensure_seed_projection(
        &self,
        incoming: &GraphNodeMetadataRecord,
    ) -> RepositoryResult<GraphMetadataMutation> {
        validate_record_versions(incoming)?;
        let Some(current) = self.get(&incoming.graph_node_id)? else {
            return if insert_record(self.connection, incoming)? {
                Ok(GraphMetadataMutation::Created)
            } else {
                Ok(GraphMetadataMutation::Conflict {
                    current_revision: incoming.content_revision,
                    reason: "graph node id was concurrently created".into(),
                })
            };
        };

        let persisted_seed_is_newer =
            match (current.seed_schema_version, incoming.seed_schema_version) {
                (Some(current), Some(incoming)) => current > incoming,
                (Some(_), None) => true,
                _ => false,
            };
        let mut desired = if persisted_seed_is_newer {
            current.clone()
        } else {
            incoming.clone()
        };
        desired.content_origin = current.content_origin;
        desired.content_revision = current.content_revision;
        desired.body_source_coordinates = current.body_source_coordinates.clone();
        desired.sync_state = current.sync_state;
        desired.remote_revision = current.remote_revision;

        // QL is one versioned disposition, never a bag of independently
        // mergeable nullable fields. Equal versions deterministically accept
        // the incoming canonical disposition; an absent incoming version
        // preserves the persisted disposition intact.
        let incoming_ql_wins = match (incoming.ql_schema_version, current.ql_schema_version) {
            (Some(incoming), Some(current)) => incoming >= current,
            (Some(_), None) => true,
            (None, _) => false,
        };
        if incoming_ql_wins {
            copy_ql_disposition(&mut desired, incoming);
        } else {
            copy_ql_disposition(&mut desired, &current);
        }

        if desired == current {
            return Ok(GraphMetadataMutation::Preserved);
        }
        if update_record(self.connection, &desired, current.content_revision)? {
            return Ok(GraphMetadataMutation::Updated);
        }
        Ok(GraphMetadataMutation::Conflict {
            current_revision: self
                .get(&incoming.graph_node_id)?
                .map(|record| record.content_revision)
                .unwrap_or(current.content_revision),
            reason: "graph metadata changed during seed projection".into(),
        })
    }
}

fn copy_ql_disposition(target: &mut GraphNodeMetadataRecord, source: &GraphNodeMetadataRecord) {
    target.ql_form = source.ql_form;
    target.ql_unit_id = source.ql_unit_id.clone();
    target.ql_arc = source.ql_arc;
    target.ql_topology = source.ql_topology;
    target.ql_schema_version = source.ql_schema_version;
    target.ql_source_coordinates = source.ql_source_coordinates.clone();
    target.ql_completeness_status = source.ql_completeness_status;
}

fn validate_record_versions(record: &GraphNodeMetadataRecord) -> RepositoryResult<()> {
    for (name, value) in [
        ("contentRevision", Some(record.content_revision)),
        ("seedSchemaVersion", record.seed_schema_version),
        ("qlSchemaVersion", record.ql_schema_version),
        ("schemaVersion", Some(record.schema_version)),
        ("remoteRevision", record.remote_revision),
    ] {
        if let Some(value) = value {
            validate_contract_revision(name, value).map_err(RepositoryError::Validation)?;
        }
    }
    Ok(())
}

fn json(values: &[String]) -> RepositoryResult<String> {
    serde_json::to_string(values).map_err(|error| RepositoryError::Validation(error.to_string()))
}

fn mutation_params(
    record: &GraphNodeMetadataRecord,
) -> RepositoryResult<Vec<Box<dyn rusqlite::ToSql>>> {
    Ok(vec![
        Box::new(record.graph_node_id.clone()),
        Box::new(record.entity_type.as_str()),
        Box::new(record.title.clone()),
        Box::new(record.archetypal_resonance.clone()),
        Box::new(record.coordinate.clone()),
        Box::new(json(&record.source_coordinates)?),
        Box::new(json(&record.evidence_tags)?),
        Box::new(record.source_kind.clone()),
        Box::new(record.content_origin.as_str()),
        Box::new(record.content_revision),
        Box::new(record.seed_schema_version),
        Box::new(json(&record.body_source_coordinates)?),
        Box::new(record.historicity.map(|v| v.as_str())),
        Box::new(record.claim_kind.map(|v| v.as_str())),
        Box::new(record.evidence_status.map(|v| v.as_str())),
        Box::new(record.temporal_role.map(|v| v.as_str())),
        Box::new(record.place_coverage.map(|v| v.as_str())),
        Box::new(record.place.clone()),
        Box::new(record.ql_form.map(|v| v.as_str())),
        Box::new(record.ql_unit_id.clone()),
        Box::new(record.ql_arc.map(|v| v.as_str())),
        Box::new(record.ql_topology.map(|v| v.as_str())),
        Box::new(record.ql_schema_version),
        Box::new(json(&record.ql_source_coordinates)?),
        Box::new(record.ql_completeness_status.map(|v| v.as_str())),
        Box::new(record.is_temporal as i64),
        Box::new(record.valid_from.clone()),
        Box::new(record.valid_to.clone()),
        Box::new(record.temporal_precision.map(|v| v.as_str())),
        Box::new(record.schema_version),
        Box::new(record.sync_state.as_str()),
        Box::new(record.remote_revision),
    ])
}

fn insert_record(
    connection: &Connection,
    record: &GraphNodeMetadataRecord,
) -> RepositoryResult<bool> {
    let values = mutation_params(record)?;
    let affected = connection.execute(
        "INSERT INTO graph_node_metadata (
         graph_node_id, entity_type, title, archetypal_resonance, coordinate,
         source_coordinates_json, evidence_tags_json, source_kind, content_origin, content_revision,
         seed_schema_version, body_source_coordinates_json, historicity, claim_kind, evidence_status,
         temporal_role, place_coverage, place_json, ql_form, ql_unit_id, ql_arc, ql_topology,
         ql_schema_version, ql_source_coordinates_json, ql_completeness_status, is_temporal,
         valid_from, valid_to, temporal_precision, schema_version, sync_state, remote_revision)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30,?31,?32)
         ON CONFLICT(graph_node_id) DO NOTHING",
        rusqlite::params_from_iter(values.iter()),
    )?;
    Ok(affected == 1)
}

fn update_record(
    connection: &Connection,
    record: &GraphNodeMetadataRecord,
    current_revision: i64,
) -> RepositoryResult<bool> {
    let values = mutation_params(record)?;
    let affected = connection.execute(
        "UPDATE graph_node_metadata SET entity_type=?2, title=?3, archetypal_resonance=?4, coordinate=?5,
         source_coordinates_json=?6, evidence_tags_json=?7, source_kind=?8, content_origin=?9,
         content_revision=?10, seed_schema_version=?11, body_source_coordinates_json=?12,
         historicity=?13, claim_kind=?14, evidence_status=?15, temporal_role=?16, place_coverage=?17,
         place_json=?18, ql_form=?19, ql_unit_id=?20, ql_arc=?21, ql_topology=?22, ql_schema_version=?23,
         ql_source_coordinates_json=?24, ql_completeness_status=?25, is_temporal=?26, valid_from=?27,
         valid_to=?28, temporal_precision=?29, schema_version=?30, sync_state=?31, remote_revision=?32,
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE graph_node_id=?1 AND content_revision=?33",
        rusqlite::params_from_iter(values.iter().map(|v| v.as_ref()).chain(std::iter::once(&current_revision as &dyn rusqlite::ToSql))),
    )?;
    Ok(affected == 1)
}

fn decode_error(index: usize, error: impl Error + Send + Sync + 'static) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(index, Type::Text, Box::new(error))
}

#[derive(Debug)]
struct DecodeMessage(String);
impl Display for DecodeMessage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl Error for DecodeMessage {}

fn controlled<T>(row: &rusqlite::Row<'_>, index: usize) -> SqlResult<T>
where
    T: TryFrom<String, Error = String>,
{
    let raw: String = row.get(index)?;
    T::try_from(raw).map_err(|e| decode_error(index, DecodeMessage(e)))
}
fn optional_controlled<T>(row: &rusqlite::Row<'_>, index: usize) -> SqlResult<Option<T>>
where
    T: TryFrom<String, Error = String>,
{
    let raw: Option<String> = row.get(index)?;
    raw.map(|v| T::try_from(v).map_err(|e| decode_error(index, DecodeMessage(e))))
        .transpose()
}
fn string_vec(row: &rusqlite::Row<'_>, index: usize) -> SqlResult<Vec<String>> {
    let raw: String = row.get(index)?;
    serde_json::from_str(&raw).map_err(|e| decode_error(index, e))
}

fn record_from_row(row: &rusqlite::Row<'_>) -> SqlResult<GraphNodeMetadataRecord> {
    Ok(GraphNodeMetadataRecord {
        graph_node_id: row.get(0)?,
        entity_type: controlled(row, 1)?,
        title: row.get(2)?,
        archetypal_resonance: row.get(3)?,
        coordinate: row.get(4)?,
        source_coordinates: string_vec(row, 5)?,
        evidence_tags: string_vec(row, 6)?,
        source_kind: row.get(7)?,
        content_origin: controlled(row, 8)?,
        content_revision: row.get(9)?,
        seed_schema_version: row.get(10)?,
        body_source_coordinates: string_vec(row, 11)?,
        historicity: optional_controlled(row, 12)?,
        claim_kind: optional_controlled(row, 13)?,
        evidence_status: optional_controlled(row, 14)?,
        temporal_role: optional_controlled(row, 15)?,
        place_coverage: optional_controlled(row, 16)?,
        place: row.get(17)?,
        ql_form: optional_controlled(row, 18)?,
        ql_unit_id: row.get(19)?,
        ql_arc: optional_controlled(row, 20)?,
        ql_topology: optional_controlled(row, 21)?,
        ql_schema_version: row.get(22)?,
        ql_source_coordinates: string_vec(row, 23)?,
        ql_completeness_status: optional_controlled(row, 24)?,
        is_temporal: row.get::<_, i64>(25)? != 0,
        valid_from: row.get(26)?,
        valid_to: row.get(27)?,
        temporal_precision: optional_controlled(row, 28)?,
        schema_version: row.get(29)?,
        sync_state: controlled(row, 30)?,
        remote_revision: row.get(31)?,
    })
}

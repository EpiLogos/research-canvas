use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Result as SqlResult, Row};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::error::{RepositoryError, RepositoryResult};

/// Constellation kind (refinement-2 D11, ticket #27). Same data model, different
/// assembly and telos:
/// - `episode` — a transcript/recording becomes a QL reading of the event it
///   carries (agent-parse of the artifact; user-curated).
/// - `document` — a research doc parsed via QL/MEF into structure.
/// - `conceptual` — constructed idea networks assembled over graph objects.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConstellationKind {
    Episode,
    Document,
    Conceptual,
}

impl ConstellationKind {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Episode => "episode",
            Self::Document => "document",
            Self::Conceptual => "conceptual",
        }
    }
}

impl TryFrom<String> for ConstellationKind {
    type Error = RepositoryError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        match value.as_str() {
            "episode" => Ok(Self::Episode),
            "document" => Ok(Self::Document),
            "conceptual" => Ok(Self::Conceptual),
            other => Err(RepositoryError::Validation(format!(
                "unknown constellation kind: {other}"
            ))),
        }
    }
}

/// A constellation record (ticket #27). Projects ARE constellations (task #24,
/// D7) — the `projects` row is the ingestion context, and this table augments
/// it with the constellation's substance. Flexible parts (metadata, assembly,
/// curation events) stay JSON so living partial QL shapes (dyad / triad /
/// quaternity / 4+2 / nested) never force a rigid mod-6 schema.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstellationRecord {
    /// App-minted UUIDv4 — the same row as the project/constellation id.
    pub id: String,
    pub profile_scope: String,
    pub kind: ConstellationKind,
    pub title: String,
    pub slug: String,
    pub parent_constellation_id: Option<String>,
    /// `{ time?, placeId?, ql?, fileRefs[], content? }`.
    pub metadata: Value,
    /// `{ source, parseKind?, agentSessionId?, rawSourceRefs[], derivedAt }`.
    pub assembly: Value,
    /// `[{ type, at, detail? }]` curation events.
    pub curation_events: Vec<Value>,
    /// Stable id for idempotent corpus seeding.
    pub seed_key: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub struct ConstellationMetaRepository<'conn> {
    connection: &'conn Connection,
}

const SELECT_COLUMNS: &str =
    "id, profile_scope, kind, title, slug, parent_constellation_id, metadata_json, \
     assembly_json, curation_events_json, seed_key, created_at, updated_at";

impl<'conn> ConstellationMetaRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    fn validate(record: &ConstellationRecord) -> RepositoryResult<()> {
        if record.profile_scope.trim().is_empty() {
            return Err(RepositoryError::Validation(
                "constellation profileScope must not be blank".into(),
            ));
        }
        if record.title.trim().is_empty() {
            return Err(RepositoryError::Validation(
                "constellation title must not be blank".into(),
            ));
        }
        if record.slug.trim().is_empty() {
            return Err(RepositoryError::Validation(
                "constellation slug must not be blank".into(),
            ));
        }
        if !record.metadata.is_object() {
            return Err(RepositoryError::Validation(
                "constellation metadata must be a JSON object".into(),
            ));
        }
        if !record.assembly.is_object() {
            return Err(RepositoryError::Validation(
                "constellation assembly must be a JSON object".into(),
            ));
        }
        if record.assembly.get("rawSourceRefs").is_none() {
            return Err(RepositoryError::Validation(
                "constellation assembly must carry passage-level rawSourceRefs".into(),
            ));
        }
        if record
            .seed_key
            .as_deref()
            .is_some_and(|seed_key| seed_key.trim().is_empty())
        {
            return Err(RepositoryError::Validation(
                "constellation seedKey must not be blank".into(),
            ));
        }
        Ok(())
    }

    pub fn create(&self, record: ConstellationRecord) -> RepositoryResult<ConstellationRecord> {
        Self::validate(&record)?;
        let now = current_timestamp();
        self.connection.execute(
            "INSERT INTO constellations (
                id, profile_scope, kind, title, slug, parent_constellation_id,
                metadata_json, assembly_json, curation_events_json, seed_key,
                created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
            params![
                record.id,
                record.profile_scope,
                record.kind.as_str(),
                record.title,
                record.slug,
                record.parent_constellation_id,
                serde_json::to_string(&record.metadata)
                    .map_err(|e| RepositoryError::Validation(e.to_string()))?,
                serde_json::to_string(&record.assembly)
                    .map_err(|e| RepositoryError::Validation(e.to_string()))?,
                serde_json::to_string(&record.curation_events)
                    .map_err(|e| RepositoryError::Validation(e.to_string()))?,
                record.seed_key,
                now,
            ],
        )?;
        self.get_by_id(&record.id)?
            .ok_or(RepositoryError::Validation(
                "constellation record not found after insert".into(),
            ))
    }

    pub fn get_by_id(&self, id: &str) -> RepositoryResult<Option<ConstellationRecord>> {
        self.connection
            .query_row(
                &format!("SELECT {SELECT_COLUMNS} FROM constellations WHERE id = ?1"),
                [id],
                constellation_from_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn list_for_profile(
        &self,
        profile_scope: &str,
    ) -> RepositoryResult<Vec<ConstellationRecord>> {
        let mut statement = self.connection.prepare(&format!(
            "SELECT {SELECT_COLUMNS} FROM constellations WHERE profile_scope = ?1 \
             ORDER BY title COLLATE NOCASE ASC, created_at ASC"
        ))?;
        let rows = statement.query_map([profile_scope], constellation_from_row)?;
        rows.collect::<SqlResult<Vec<_>>>().map_err(Into::into)
    }

    pub fn find_by_seed_key(
        &self,
        profile_scope: &str,
        seed_key: &str,
    ) -> RepositoryResult<Option<ConstellationRecord>> {
        self.connection
            .query_row(
                &format!(
                    "SELECT {SELECT_COLUMNS} FROM constellations \
                     WHERE profile_scope = ?1 AND seed_key = ?2"
                ),
                params![profile_scope, seed_key],
                constellation_from_row,
            )
            .optional()
            .map_err(Into::into)
    }

    /// Idempotent corpus seeding: same (profileScope, seedKey) returns the
    /// existing record unchanged; a fresh key creates the record.
    pub fn create_or_seed(
        &self,
        record: ConstellationRecord,
    ) -> RepositoryResult<(ConstellationRecord, bool)> {
        if let Some(seed_key) = record.seed_key.as_deref() {
            if let Some(existing) = self.find_by_seed_key(&record.profile_scope, seed_key)? {
                return Ok((existing, false));
            }
        }
        Ok((self.create(record)?, true))
    }

    pub fn delete(&self, id: &str) -> RepositoryResult<()> {
        self.connection
            .execute("DELETE FROM constellations WHERE id = ?1", [id])?;
        Ok(())
    }
}

fn constellation_from_row(row: &Row<'_>) -> SqlResult<ConstellationRecord> {
    let kind: String = row.get(2)?;
    let metadata_json: String = row.get(6)?;
    let assembly_json: String = row.get(7)?;
    let curation_events_json: String = row.get(8)?;
    Ok(ConstellationRecord {
        id: row.get(0)?,
        profile_scope: row.get(1)?,
        kind: ConstellationKind::try_from(kind)
            .map_err(|e| rusqlite::Error::FromSqlConversionFailure(2, rusqlite::types::Type::Text, Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string()))))?,
        title: row.get(3)?,
        slug: row.get(4)?,
        parent_constellation_id: row.get(5)?,
        metadata: serde_json::from_str(&metadata_json).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(
                6,
                rusqlite::types::Type::Text,
                Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string())),
            )
        })?,
        assembly: serde_json::from_str(&assembly_json).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(
                7,
                rusqlite::types::Type::Text,
                Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string())),
            )
        })?,
        curation_events: serde_json::from_str(&curation_events_json).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(
                8,
                rusqlite::types::Type::Text,
                Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string())),
            )
        })?,
        seed_key: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

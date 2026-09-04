use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Result as SqlResult, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::error::{RepositoryError, RepositoryResult};
use super::street_view::assert_portable_path;

/// The `validation` block of the D3 fetch-record contract: one boolean per
/// gate check. The gate accepts an asset only when every flag is true.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchValidation {
    pub mime_ok: bool,
    pub size_ok: bool,
    pub license_ok: bool,
    pub source_ok: bool,
}

impl FetchValidation {
    pub fn all_ok(&self) -> bool {
        self.mime_ok && self.size_ok && self.license_ok && self.source_ok
    }
}

/// A fetch record (refinement-2 D3, ticket #20): one deterministic `rc-asset
/// ingest` attempt. Accepted records carry the content-addressed `artifact_path`
/// plus the street-view image id they registered; rejected records keep the
/// full validation flags so the reason is visible to the agent and the frontend.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchRecord {
    pub id: String,
    pub profile_scope: String,
    /// Links to the tmux session that produced the asset.
    pub agent_session_id: String,
    pub source_url: String,
    pub license: String,
    pub fetched_at: String,
    pub mime_type: String,
    pub byte_size: i64,
    pub validation: FetchValidation,
    /// SHA-256 of the fetched bytes (always computed, even on rejection).
    pub content_hash: String,
    /// Portable path under the media root; empty for rejected attempts.
    pub artifact_path: String,
    pub redaction_status: String,
    pub street_view_image_id: Option<String>,
    pub place_id: Option<String>,
    pub walk_id: Option<String>,
    pub scene_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub struct FetchRecordRepository<'conn> {
    connection: &'conn Connection,
}

const COLUMNS: &str = "id, profile_scope, agent_session_id, source_url, license, \
     fetched_at, mime_type, byte_size, validation_json, content_hash, artifact_path, \
     redaction_status, street_view_image_id, place_id, walk_id, scene_id, created_at, updated_at";

impl<'conn> FetchRecordRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    fn validate(record: &FetchRecord) -> RepositoryResult<()> {
        if record.profile_scope.trim().is_empty() {
            return Err(RepositoryError::Validation(
                "fetch record profileScope must not be blank".into(),
            ));
        }
        if record.agent_session_id.trim().is_empty() {
            return Err(RepositoryError::Validation(
                "fetch record agentSessionId must not be blank".into(),
            ));
        }
        if record.mime_type.trim().is_empty() {
            return Err(RepositoryError::Validation(
                "fetch record mimeType must not be blank".into(),
            ));
        }
        if record.byte_size < 0 {
            return Err(RepositoryError::Validation(
                "fetch record byteSize must not be negative".into(),
            ));
        }
        if ![
            "pending",
            "redacted",
            "none_needed",
        ]
        .contains(&record.redaction_status.as_str())
        {
            return Err(RepositoryError::Validation(format!(
                "unknown fetch record redaction status {}",
                record.redaction_status
            )));
        }
        // Accepted records must carry full provenance (source URL + license), a
        // content hash, and a portable relative artifact path inside the media
        // root. Rejected attempts keep an empty artifact path and may hold blank
        // fields that failed the gate (a missing license, an oversize file that
        // was never read so never hashed) — that blank is the audit trail, so it
        // must still persist.
        if !record.artifact_path.is_empty() {
            if record.source_url.trim().is_empty() {
                return Err(RepositoryError::Validation(
                    "accepted fetch record sourceUrl must not be blank".into(),
                ));
            }
            if record.license.trim().is_empty() {
                return Err(RepositoryError::Validation(
                    "accepted fetch record license must not be blank".into(),
                ));
            }
            if record.content_hash.trim().is_empty() {
                return Err(RepositoryError::Validation(
                    "accepted fetch record contentHash must not be blank".into(),
                ));
            }
            assert_portable_path(&record.artifact_path, "fetch record artifact")?;
        }
        Ok(())
    }

    pub fn create(
        &self,
        mut record: FetchRecord,
    ) -> RepositoryResult<FetchRecord> {
        Self::validate(&record)?;
        if record.id.trim().is_empty() {
            record.id = Uuid::new_v4().to_string();
        }
        let now = current_timestamp();
        record.created_at.clone_from(&now);
        record.updated_at.clone_from(&now);
        self.connection.execute(
            "INSERT INTO fetch_records (
             id, profile_scope, agent_session_id, source_url, license, fetched_at,
             mime_type, byte_size, validation_json, content_hash, artifact_path,
             redaction_status, street_view_image_id, place_id, walk_id, scene_id,
             created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)",
            params![
                record.id,
                record.profile_scope,
                record.agent_session_id,
                record.source_url,
                record.license,
                record.fetched_at,
                record.mime_type,
                record.byte_size,
                serde_json::to_string(&record.validation).map_err(validation_error)?,
                record.content_hash,
                record.artifact_path,
                record.redaction_status,
                record.street_view_image_id,
                record.place_id,
                record.walk_id,
                record.scene_id,
                record.created_at,
                record.updated_at,
            ],
        )?;
        self.get_by_id(&record.id)?
            .ok_or_else(|| RepositoryError::Storage(rusqlite::Error::QueryReturnedNoRows))
    }

    pub fn get_by_id(&self, id: &str) -> RepositoryResult<Option<FetchRecord>> {
        self.connection
            .query_row(
                &format!(
                    "SELECT {COLUMNS} FROM fetch_records WHERE id = ?1"
                ),
                [id],
                record_from_row,
            )
            .optional()
            .map_err(Into::into)
    }

    /// Idempotency lookup for accepted re-ingests (M2): the same profile scope,
    /// agent session, source URL, and byte hash already landed, so the gate
    /// returns the existing record instead of importing the bytes twice.
    /// Rejected rows (`artifact_path = ''`) never match, so a corrected
    /// re-ingest can still proceed.
    pub fn find_accepted_by_dedup_key(
        &self,
        profile_scope: &str,
        agent_session_id: &str,
        source_url: &str,
        content_hash: &str,
    ) -> RepositoryResult<Option<FetchRecord>> {
        self.connection
            .query_row(
                &format!(
                    "SELECT {COLUMNS} FROM fetch_records
                     WHERE profile_scope = ?1 AND agent_session_id = ?2
                       AND source_url = ?3 AND content_hash = ?4
                       AND artifact_path <> ''"
                ),
                params![profile_scope, agent_session_id, source_url, content_hash],
                record_from_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn list_for_profile(&self, profile_scope: &str) -> RepositoryResult<Vec<FetchRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT id, profile_scope, agent_session_id, source_url, license, fetched_at,
             mime_type, byte_size, validation_json, content_hash, artifact_path,
             redaction_status, street_view_image_id, place_id, walk_id, scene_id,
             created_at, updated_at
             FROM fetch_records WHERE profile_scope = ?1 ORDER BY created_at ASC",
        )?;
        let rows = statement.query_map([profile_scope], record_from_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    /// Walks/scenes/places association read: fetch records whose `place_id`
    /// matches a place on the Places surface, so a place's gathered imagery is
    /// enumerable from its own identity.
    pub fn list_for_place(
        &self,
        profile_scope: &str,
        place_id: &str,
    ) -> RepositoryResult<Vec<FetchRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT id, profile_scope, agent_session_id, source_url, license, fetched_at,
             mime_type, byte_size, validation_json, content_hash, artifact_path,
             redaction_status, street_view_image_id, place_id, walk_id, scene_id,
             created_at, updated_at
             FROM fetch_records
             WHERE profile_scope = ?1 AND place_id = ?2 ORDER BY created_at ASC",
        )?;
        let rows = statement.query_map(params![profile_scope, place_id], record_from_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }
}

fn validation_error(error: serde_json::Error) -> RepositoryError {
    RepositoryError::Validation(error.to_string())
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn record_from_row(row: &Row<'_>) -> SqlResult<FetchRecord> {
    let validation: String = row.get(8)?;
    Ok(FetchRecord {
        id: row.get(0)?,
        profile_scope: row.get(1)?,
        agent_session_id: row.get(2)?,
        source_url: row.get(3)?,
        license: row.get(4)?,
        fetched_at: row.get(5)?,
        mime_type: row.get(6)?,
        byte_size: row.get(7)?,
        validation: serde_json::from_str(&validation).map_err(json_decode)?,
        content_hash: row.get(9)?,
        artifact_path: row.get(10)?,
        redaction_status: row.get(11)?,
        street_view_image_id: row.get(12)?,
        place_id: row.get(13)?,
        walk_id: row.get(14)?,
        scene_id: row.get(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
    })
}

fn json_decode(error: serde_json::Error) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        8,
        rusqlite::types::Type::Text,
        Box::new(error),
    )
}

use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

use super::error::RepositoryResult;

/// Mind-palace curation persistence (vision §3.12, ticket #4): the curation
/// layer (pin/exclude/rename/reorder) is a derived artifact stored per
/// profile; the raw graph is never written through it.

pub struct PalaceRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> PalaceRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn get(&self, profile_scope: &str) -> RepositoryResult<Option<Value>> {
        let raw: Option<String> = self
            .connection
            .query_row(
                "SELECT curation_json FROM palace_curations WHERE profile_scope = ?1",
                [profile_scope],
                |row| row.get(0),
            )
            .optional()?;
        raw.map(|json| {
            serde_json::from_str(&json).map_err(|error| {
                super::error::RepositoryError::Storage(rusqlite::Error::ToSqlConversionFailure(
                    Box::new(error),
                ))
            })
        })
        .transpose()
    }

    pub fn save(&self, profile_scope: &str, curation: &Value) -> RepositoryResult<()> {
        if profile_scope.trim().is_empty() {
            return Err(super::error::RepositoryError::Validation(
                "palace profileScope must not be blank".into(),
            ));
        }
        if !curation.is_object() {
            return Err(super::error::RepositoryError::Validation(
                "palace curation must be a JSON object".into(),
            ));
        }
        let updated_at = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
        self.connection.execute(
            "INSERT INTO palace_curations (profile_scope, curation_json, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(profile_scope) DO UPDATE SET
               curation_json = excluded.curation_json,
               updated_at = excluded.updated_at",
            params![
                profile_scope,
                serde_json::to_string(curation)
                    .map_err(|error| {
                        super::error::RepositoryError::Validation(error.to_string())
                    })?,
                updated_at,
            ],
        )?;
        Ok(())
    }
}

use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Result as SqlResult, Row};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::error::{RepositoryError, RepositoryResult};

/// Route modes for movement streams (refinement-2 D2, ticket #19).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GeographyEdgeMode {
    Flight,
    Shipping,
    Overland,
    InlandWater,
}

impl GeographyEdgeMode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Flight => "flight",
            Self::Shipping => "shipping",
            Self::Overland => "overland",
            Self::InlandWater => "inland_water",
        }
    }
}

impl TryFrom<String> for GeographyEdgeMode {
    type Error = RepositoryError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        match value.as_str() {
            "flight" => Ok(Self::Flight),
            "shipping" => Ok(Self::Shipping),
            "overland" => Ok(Self::Overland),
            "inland_water" => Ok(Self::InlandWater),
            other => Err(RepositoryError::Validation(format!(
                "unknown geography edge mode: {other}"
            ))),
        }
    }
}

/// A surface-layer `geography_edge` record (locked by ticket #19): a derived
/// route between two Temporal Place graph nodes, seeded from the corpus with
/// passage-level provenance. Stored at the surface layer only — never a new
/// substrate relationship type.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeographyEdgeRecord {
    pub id: String,
    pub profile_scope: String,
    pub mode: GeographyEdgeMode,
    pub source_place_id: String,
    pub target_place_id: String,
    pub label: String,
    /// `{ start, end }` ISO temporal bounds; instants allowed.
    pub time_window: Value,
    /// GeoJSON `LineString` (computed great-circle default; explicit control
    /// points allowed), WGS84.
    pub geometry: Value,
    /// `{ sourceRefs: PassageRef[] }` — passage-level like every substrate
    /// object.
    pub provenance: Value,
    /// Stable id for idempotent corpus seeding.
    pub seed_key: String,
    pub created_at: String,
    pub updated_at: String,
}

pub struct GeographyEdgeRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> GeographyEdgeRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    fn validate(edge: &GeographyEdgeRecord) -> RepositoryResult<()> {
        if edge.profile_scope.trim().is_empty() {
            return Err(RepositoryError::Validation(
                "geography edge profileScope must not be blank".into(),
            ));
        }
        if edge.source_place_id.trim().is_empty()
            || edge.target_place_id.trim().is_empty()
        {
            return Err(RepositoryError::Validation(
                "geography edge sourcePlaceId and targetPlaceId must not be blank".into(),
            ));
        }
        if edge.label.trim().is_empty() {
            return Err(RepositoryError::Validation(
                "geography edge label must not be blank".into(),
            ));
        }
        if edge.seed_key.trim().is_empty() {
            return Err(RepositoryError::Validation(
                "geography edge seedKey must not be blank".into(),
            ));
        }
        let window = edge.time_window.as_object().ok_or_else(|| {
            RepositoryError::Validation("geography edge timeWindow must be an object".into())
        })?;
        for key in ["start", "end"] {
            let bound = window.get(key).ok_or_else(|| {
                RepositoryError::Validation(format!(
                    "geography edge timeWindow.{key} is required"
                ))
            })?;
            if !bound.is_string() || bound.as_str().unwrap_or("").is_empty() {
                return Err(RepositoryError::Validation(format!(
                    "geography edge timeWindow.{key} must be a non-empty ISO temporal bound"
                )));
            }
        }
        let start_bound = window["start"].as_str().unwrap_or("");
        let end_bound = window["end"].as_str().unwrap_or("");
        if let (Some(start_key), Some(end_key)) =
            (parse_iso_bound(start_bound), parse_iso_bound(end_bound))
        {
            if end_key < start_key {
                return Err(RepositoryError::Validation(
                    "geography edge timeWindow.end must not precede timeWindow.start".into(),
                ));
            }
        }
        validate_line_string(&edge.geometry)?;
        let provenance = edge.provenance.as_object().ok_or_else(|| {
            RepositoryError::Validation("geography edge provenance must be an object".into())
        })?;
        let source_refs = provenance.get("sourceRefs").ok_or_else(|| {
            RepositoryError::Validation(
                "geography edge provenance.sourceRefs is required".into(),
            )
        })?;
        let refs = source_refs.as_array().ok_or_else(|| {
            RepositoryError::Validation(
                "geography edge provenance.sourceRefs must be an array".into(),
            )
        })?;
        if refs.is_empty() {
            return Err(RepositoryError::Validation(
                "geography edge provenance.sourceRefs must not be empty".into(),
            ));
        }
        Ok(())
    }

    pub fn create(
        &self,
        mut edge: GeographyEdgeRecord,
    ) -> RepositoryResult<GeographyEdgeRecord> {
        Self::validate(&edge)?;
        if edge.id.trim().is_empty() {
            edge.id = Uuid::new_v4().to_string();
        }
        let now = current_timestamp();
        edge.created_at.clone_from(&now);
        edge.updated_at.clone_from(&now);
        self.connection.execute(
            "INSERT INTO geography_edges (
             id, profile_scope, mode, source_place_id, target_place_id, label,
             time_window_json, geometry_json, provenance_json, seed_key,
             created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            params![
                edge.id,
                edge.profile_scope,
                edge.mode.as_str(),
                edge.source_place_id,
                edge.target_place_id,
                edge.label,
                serde_json::to_string(&edge.time_window).map_err(validation_error)?,
                serde_json::to_string(&edge.geometry).map_err(validation_error)?,
                serde_json::to_string(&edge.provenance).map_err(validation_error)?,
                edge.seed_key,
                edge.created_at,
                edge.updated_at,
            ],
        )?;
        self.get_by_id(&edge.id)?
            .ok_or_else(|| RepositoryError::Storage(rusqlite::Error::QueryReturnedNoRows))
    }

    pub fn get_by_id(&self, id: &str) -> RepositoryResult<Option<GeographyEdgeRecord>> {
        self.connection
            .query_row(
                "SELECT id, profile_scope, mode, source_place_id, target_place_id, label,
                 time_window_json, geometry_json, provenance_json, seed_key,
                 created_at, updated_at
                 FROM geography_edges WHERE id = ?1",
                [id],
                edge_from_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn find_by_seed_key(
        &self,
        profile_scope: &str,
        seed_key: &str,
    ) -> RepositoryResult<Option<GeographyEdgeRecord>> {
        self.connection
            .query_row(
                "SELECT id, profile_scope, mode, source_place_id, target_place_id, label,
                 time_window_json, geometry_json, provenance_json, seed_key,
                 created_at, updated_at
                 FROM geography_edges WHERE profile_scope = ?1 AND seed_key = ?2",
                params![profile_scope, seed_key],
                edge_from_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn list_for_profile(
        &self,
        profile_scope: &str,
    ) -> RepositoryResult<Vec<GeographyEdgeRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT id, profile_scope, mode, source_place_id, target_place_id, label,
             time_window_json, geometry_json, provenance_json, seed_key,
             created_at, updated_at
             FROM geography_edges WHERE profile_scope = ?1 ORDER BY created_at ASC",
        )?;
        let rows = statement.query_map([profile_scope], edge_from_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn update(&self, edge: &GeographyEdgeRecord) -> RepositoryResult<GeographyEdgeRecord> {
        Self::validate(edge)?;
        let affected = self.connection.execute(
            "UPDATE geography_edges SET profile_scope=?2, mode=?3, source_place_id=?4,
             target_place_id=?5, label=?6, time_window_json=?7, geometry_json=?8,
             provenance_json=?9, seed_key=?10, updated_at=?11
             WHERE id=?1",
            params![
                edge.id,
                edge.profile_scope,
                edge.mode.as_str(),
                edge.source_place_id,
                edge.target_place_id,
                edge.label,
                serde_json::to_string(&edge.time_window).map_err(validation_error)?,
                serde_json::to_string(&edge.geometry).map_err(validation_error)?,
                serde_json::to_string(&edge.provenance).map_err(validation_error)?,
                edge.seed_key,
                current_timestamp(),
            ],
        )?;
        if affected == 0 {
            return Err(RepositoryError::Conflict(format!(
                "geography edge {} does not exist",
                edge.id
            )));
        }
        self.get_by_id(&edge.id)?
            .ok_or_else(|| RepositoryError::Storage(rusqlite::Error::QueryReturnedNoRows))
    }

    pub fn delete(&self, id: &str) -> RepositoryResult<bool> {
        let affected = self
            .connection
            .execute("DELETE FROM geography_edges WHERE id = ?1", [id])?;
        Ok(affected == 1)
    }
}

fn validate_line_string(geometry: &Value) -> RepositoryResult<()> {
    let object = geometry.as_object().ok_or_else(|| {
        RepositoryError::Validation("geography edge geometry must be an object".into())
    })?;
    if object.get("type").and_then(Value::as_str) != Some("LineString") {
        return Err(RepositoryError::Validation(
            "geography edge geometry.type must be \"LineString\"".into(),
        ));
    }
    let coordinates = object.get("coordinates").ok_or_else(|| {
        RepositoryError::Validation("geography edge geometry.coordinates is required".into())
    })?;
    let positions = coordinates.as_array().ok_or_else(|| {
        RepositoryError::Validation(
            "geography edge geometry.coordinates must be an array".into(),
        )
    })?;
    if positions.len() < 2 {
        return Err(RepositoryError::Validation(
            "geography edge LineString must have at least two positions".into(),
        ));
    }
    for position in positions {
        let pair = position.as_array().ok_or_else(|| {
            RepositoryError::Validation(
                "geography edge LineString positions must be [lon, lat] pairs".into(),
            )
        })?;
        if pair.len() != 2 {
            return Err(RepositoryError::Validation(
                "geography edge LineString positions must be [lon, lat] pairs".into(),
            ));
        }
        let longitude = pair[0].as_f64().ok_or_else(|| {
            RepositoryError::Validation("geography edge longitude must be a number".into())
        })?;
        let latitude = pair[1].as_f64().ok_or_else(|| {
            RepositoryError::Validation("geography edge latitude must be a number".into())
        })?;
        if longitude < -180.0 || longitude > 180.0 {
            return Err(RepositoryError::Validation(
                "geography edge longitude out of range".into(),
            ));
        }
        if latitude < -90.0 || latitude > 90.0 {
            return Err(RepositoryError::Validation(
                "geography edge latitude out of range".into(),
            ));
        }
    }
    Ok(())
}

/// Coarse ISO-8601 instant used only for ordering bounds against each other
/// (mirrors `checkBoundOrder` in `packages/schema/src/time.ts`). Year and
/// year-month bounds sort as their first instant; full datetimes sort by
/// instant. Returns `None` when the bound is not parseable, in which case the
/// caller leaves ordering unenforced (the TS side does the same).
fn parse_iso_bound(value: &str) -> Option<(i32, u32, u32, u32, u32, u32, u32)> {
    if value.trim() != value || value.is_empty() || value.starts_with('+') {
        return None;
    }
    let digits = |s: &str, min: u32, max: u32| -> Option<u32> {
        let n = s.parse::<u32>().ok()?;
        (n >= min && n <= max).then_some(n)
    };
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
    let parts = value.split('-').collect::<Vec<_>>();
    if parts.len() > 3 {
        return None;
    }
    let year = parts[0].parse::<i32>().ok()?;
    if !(parts[0].len() == 4) {
        return None;
    }
    match parts.len() {
        1 => Some((year, 1, 1, 0, 0, 0, 0)),
        2 => Some((year, digits(parts[1], 1, 12)?, 1, 0, 0, 0, 0)),
        _ => Some((
            year,
            digits(parts[1], 1, 12)?,
            digits(parts[2], 1, 31)?,
            0,
            0,
            0,
            0,
        )),
    }
}

fn validation_error(error: serde_json::Error) -> RepositoryError {
    RepositoryError::Validation(error.to_string())
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn edge_from_row(row: &Row<'_>) -> SqlResult<GeographyEdgeRecord> {
    let time_window: String = row.get(6)?;
    let geometry: String = row.get(7)?;
    let provenance: String = row.get(8)?;
    Ok(GeographyEdgeRecord {
        id: row.get(0)?,
        profile_scope: row.get(1)?,
        mode: GeographyEdgeMode::try_from(row.get::<_, String>(2)?).map_err(
            |error| {
                rusqlite::Error::FromSqlConversionFailure(
                    2,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            },
        )?,
        source_place_id: row.get(3)?,
        target_place_id: row.get(4)?,
        label: row.get(5)?,
        time_window: serde_json::from_str(&time_window).map_err(json_decode)?,
        geometry: serde_json::from_str(&geometry).map_err(json_decode)?,
        provenance: serde_json::from_str(&provenance).map_err(json_decode)?,
        seed_key: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn json_decode(error: serde_json::Error) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        0,
        rusqlite::types::Type::Text,
        Box::new(error),
    )
}

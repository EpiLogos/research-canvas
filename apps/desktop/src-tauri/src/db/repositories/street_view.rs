use std::path::Path;

use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Result as SqlResult, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::error::{RepositoryError, RepositoryResult};

/// Street-view imagery core (vision §3.9/§3.13, research findings §2): locally
/// captured fieldwork imagery is the privacy-safe base. Redaction regions are
/// normalized 0..1 rectangles over the frame with a reason (face, licence
/// plate, manual); the redaction pipeline applies them as blurred masks and
/// writes a derived copy — the raw artifact is never modified.

pub const REDACTION_STATUS_PENDING: &str = "pending";
pub const REDACTION_STATUS_REDACTED: &str = "redacted";
pub const REDACTION_STATUS_NONE_NEEDED: &str = "none_needed";

pub const REDACTION_REGION_REASONS: [&str; 3] = ["face", "license_plate", "manual"];
pub const REDACTION_REGION_SOURCES: [&str; 2] = ["detected", "manual"];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreetViewRegion {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub reason: String,
    pub source: String,
}

impl StreetViewRegion {
    pub fn validate(&self) -> RepositoryResult<()> {
        if !(0.0..=1.0).contains(&self.x) || !(0.0..=1.0).contains(&self.y) {
            return Err(RepositoryError::Validation(
                "street view region origin must be within 0..1".into(),
            ));
        }
        if self.width <= 0.0
            || self.height <= 0.0
            || self.x + self.width > 1.0
            || self.y + self.height > 1.0
        {
            return Err(RepositoryError::Validation(
                "street view region must stay within the normalized frame".into(),
            ));
        }
        if !REDACTION_REGION_REASONS.contains(&self.reason.as_str()) {
            return Err(RepositoryError::Validation(format!(
                "unknown street view region reason {}",
                self.reason
            )));
        }
        if !REDACTION_REGION_SOURCES.contains(&self.source.as_str()) {
            return Err(RepositoryError::Validation(format!(
                "unknown street view region source {}",
                self.source
            )));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreetViewImageRecord {
    pub id: String,
    pub profile_scope: String,
    pub artifact_path: String,
    pub captured_at: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub heading_degrees: Option<f64>,
    pub redaction_status: String,
    pub redaction_regions: Vec<StreetViewRegion>,
    pub redacted_artifact_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub struct StreetViewRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> StreetViewRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    fn validate(record: &StreetViewImageRecord) -> RepositoryResult<()> {
        if record.profile_scope.trim().is_empty() {
            return Err(RepositoryError::Validation(
                "street view profileScope must not be blank".into(),
            ));
        }
        assert_portable_path(&record.artifact_path, "street view artifact")?;
        if let Some(latitude) = record.latitude {
            if !(-90.0..=90.0).contains(&latitude) {
                return Err(RepositoryError::Validation(
                    "street view latitude must be within -90..90".into(),
                ));
            }
        }
        if let Some(longitude) = record.longitude {
            if !(-180.0..=180.0).contains(&longitude) {
                return Err(RepositoryError::Validation(
                    "street view longitude must be within -180..180".into(),
                ));
            }
        }
        if let Some(heading) = record.heading_degrees {
            if !(0.0..360.0).contains(&heading) {
                return Err(RepositoryError::Validation(
                    "street view heading must be within 0..360".into(),
                ));
            }
        }
        if ![
            REDACTION_STATUS_PENDING,
            REDACTION_STATUS_REDACTED,
            REDACTION_STATUS_NONE_NEEDED,
        ]
        .contains(&record.redaction_status.as_str())
        {
            return Err(RepositoryError::Validation(format!(
                "unknown street view redaction status {}",
                record.redaction_status
            )));
        }
        for region in &record.redaction_regions {
            region.validate()?;
        }
        if let Some(path) = record.redacted_artifact_path.as_deref() {
            assert_portable_path(path, "street view redacted artifact")?;
        }
        Ok(())
    }

    pub fn register(&self, mut record: StreetViewImageRecord) -> RepositoryResult<StreetViewImageRecord> {
        Self::validate(&record)?;
        if record.id.trim().is_empty() {
            record.id = Uuid::new_v4().to_string();
        }
        let now = current_timestamp();
        record.created_at.clone_from(&now);
        record.updated_at.clone_from(&now);
        self.connection.execute(
            "INSERT INTO street_view_images (
             id, profile_scope, artifact_path, captured_at, latitude, longitude,
             heading_degrees, redaction_status, redaction_regions_json,
             redacted_artifact_path, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            params![
                record.id,
                record.profile_scope,
                record.artifact_path,
                record.captured_at,
                record.latitude,
                record.longitude,
                record.heading_degrees,
                record.redaction_status,
                serde_json::to_string(&record.redaction_regions)
                    .map_err(validation_error)?,
                record.redacted_artifact_path,
                record.created_at,
                record.updated_at,
            ],
        )?;
        self.get_by_id(&record.id)?
            .ok_or_else(|| RepositoryError::Storage(rusqlite::Error::QueryReturnedNoRows))
    }

    pub fn get_by_id(&self, id: &str) -> RepositoryResult<Option<StreetViewImageRecord>> {
        self.connection
            .query_row(
                "SELECT id, profile_scope, artifact_path, captured_at, latitude, longitude,
                 heading_degrees, redaction_status, redaction_regions_json,
                 redacted_artifact_path, created_at, updated_at
                 FROM street_view_images WHERE id = ?1",
                [id],
                record_from_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn list_for_profile(&self, profile_scope: &str) -> RepositoryResult<Vec<StreetViewImageRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT id, profile_scope, artifact_path, captured_at, latitude, longitude,
             heading_degrees, redaction_status, redaction_regions_json,
             redacted_artifact_path, created_at, updated_at
             FROM street_view_images WHERE profile_scope = ?1 ORDER BY created_at ASC",
        )?;
        let rows = statement.query_map([profile_scope], record_from_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    /// Adds a manually authored region (human curation of the derived
    /// redaction layer) and re-checks the resulting record.
    pub fn add_manual_region(
        &self,
        id: &str,
        region: StreetViewRegion,
    ) -> RepositoryResult<StreetViewImageRecord> {
        region.validate()?;
        let mut record = self
            .get_by_id(id)?
            .ok_or_else(|| RepositoryError::Conflict(format!("street view image {id} not found")))?;
        record.redaction_regions.push(region);
        let updated = self.replace_regions(&record)?;
        Ok(updated)
    }

    /// Marks imagery as needing no redaction (the reviewer's explicit
    /// determination — never inferred by the system).
    pub fn mark_none_needed(&self, id: &str) -> RepositoryResult<StreetViewImageRecord> {
        let mut record = self
            .get_by_id(id)?
            .ok_or_else(|| RepositoryError::Conflict(format!("street view image {id} not found")))?;
        record.redaction_status = REDACTION_STATUS_NONE_NEEDED.to_string();
        record.updated_at = current_timestamp();
        self.connection.execute(
            "UPDATE street_view_images SET redaction_status=?2, updated_at=?3 WHERE id=?1",
            params![record.id, record.redaction_status, record.updated_at],
        )?;
        Ok(record)
    }

    pub fn set_redacted(
        &self,
        id: &str,
        redacted_artifact_path: &str,
    ) -> RepositoryResult<StreetViewImageRecord> {
        assert_portable_path(redacted_artifact_path, "street view redacted artifact")?;
        let mut record = self
            .get_by_id(id)?
            .ok_or_else(|| RepositoryError::Conflict(format!("street view image {id} not found")))?;
        record.redaction_status = REDACTION_STATUS_REDACTED.to_string();
        record.redacted_artifact_path = Some(redacted_artifact_path.to_string());
        record.updated_at = current_timestamp();
        self.connection.execute(
            "UPDATE street_view_images
             SET redaction_status=?2, redacted_artifact_path=?3, updated_at=?4
             WHERE id=?1",
            params![
                record.id,
                record.redaction_status,
                record.redacted_artifact_path,
                record.updated_at
            ],
        )?;
        Ok(record)
    }

    fn replace_regions(&self, record: &StreetViewImageRecord) -> RepositoryResult<StreetViewImageRecord> {
        Self::validate(record)?;
        let now = current_timestamp();
        self.connection.execute(
            "UPDATE street_view_images
             SET redaction_regions_json=?2, redaction_status=?3, updated_at=?4
             WHERE id=?1",
            params![
                record.id,
                serde_json::to_string(&record.redaction_regions)
                    .map_err(validation_error)?,
                record.redaction_status,
                now,
            ],
        )?;
        self.get_by_id(&record.id)?
            .ok_or_else(|| RepositoryError::Storage(rusqlite::Error::QueryReturnedNoRows))
    }
}

pub fn assert_portable_path(path: &str, context: &str) -> RepositoryResult<()> {
    if path.trim().is_empty()
        || path.starts_with('/')
        || path.starts_with('\\')
        || path.contains("..")
        || has_uri_scheme(path)
    {
        return Err(RepositoryError::Validation(format!(
            "{context} references a non-portable path: {path}"
        )));
    }
    Ok(())
}

fn has_uri_scheme(path: &str) -> bool {
    let Some(scheme_end) = path.find("://") else {
        return false;
    };
    if scheme_end == 0 {
        return false;
    }
    path[..scheme_end]
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '+' | '.' | '-'))
}

fn validation_error(error: serde_json::Error) -> RepositoryError {
    RepositoryError::Validation(error.to_string())
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn record_from_row(row: &Row<'_>) -> SqlResult<StreetViewImageRecord> {
    let regions: String = row.get(8)?;
    Ok(StreetViewImageRecord {
        id: row.get(0)?,
        profile_scope: row.get(1)?,
        artifact_path: row.get(2)?,
        captured_at: row.get(3)?,
        latitude: row.get(4)?,
        longitude: row.get(5)?,
        heading_degrees: row.get(6)?,
        redaction_status: row.get(7)?,
        redaction_regions: serde_json::from_str(&regions).map_err(json_decode)?,
        redacted_artifact_path: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn json_decode(error: serde_json::Error) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        8,
        rusqlite::types::Type::Text,
        Box::new(error),
    )
}

/// Applies the redaction pipeline: blurs every region on a derived copy of
/// the image and writes it next to the source under `redacted/`. Returns the
/// portable output path relative to the media root. The source file is never
/// modified. The pipeline decodes PNG in v1 (the bundled `image` feature set);
/// other formats are rejected with a clear error rather than silently
/// producing an unredacted copy.
pub fn apply_region_redaction(
    media_root: &Path,
    record: &StreetViewImageRecord,
) -> Result<String, String> {
    let source = media_root.join(&record.artifact_path);
    if !source.is_file() {
        return Err(format!(
            "street view source artifact not found: {}",
            record.artifact_path
        ));
    }
    let mut image = image::open(&source)
        .map_err(|error| format!("cannot decode {}: {error}", record.artifact_path))?
        .to_rgb8();
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        return Err("street view image has zero dimensions".into());
    }
    for region in &record.redaction_regions {
        let px = region_pixels(region, width, height);
        blur_region(&mut image, px);
    }

    let output_dir = media_root.join("redacted");
    std::fs::create_dir_all(&output_dir)
        .map_err(|error| format!("cannot create redacted output dir: {error}"))?;
    let output_path = output_dir.join(format!("{}.png", record.id));
    image
        .save(&output_path)
        .map_err(|error| format!("cannot write redacted artifact: {error}"))?;

    let relative = format!("redacted/{}.png", record.id);
    assert_portable_path(&relative, "street view redacted artifact")
        .map_err(|error| error.to_string())?;
    Ok(relative)
}

fn region_pixels(
    region: &StreetViewRegion,
    width: u32,
    height: u32,
) -> (u32, u32, u32, u32) {
    let x = (region.x * width as f64).round() as u32;
    let y = (region.y * height as f64).round() as u32;
    let w = ((region.width * width as f64).round() as u32).max(1);
    let h = ((region.height * height as f64).round() as u32).max(1);
    (x.min(width), y.min(height), w.min(width - x), h.min(height - y))
}

fn blur_region(image: &mut image::RgbImage, (x, y, w, h): (u32, u32, u32, u32)) {
    if w == 0 || h == 0 {
        return;
    }
    let sub = image::imageops::crop_imm(image, x, y, w, h).to_image();
    let blurred = image::imageops::blur(&sub, 6.0);
    image::imageops::overlay(image, &blurred, i64::from(x), i64::from(y));
}

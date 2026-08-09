use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::db::{
    connection::Database,
    repositories::{
        apply_region_redaction, StreetViewImageRecord, StreetViewRegion,
        StreetViewRepository,
    },
};

/// Street-view imagery commands (vision §3.9/§3.13, research findings §2):
/// own captured imagery is the privacy-safe base; redaction regions are
/// derived artifacts applied by the local pipeline. Mapillary browsing is a
/// frontend-side explicit opt-in and never touches this store.

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreetViewProfileRequest {
    pub database_path: String,
    pub profile_scope: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterStreetViewImageRequest {
    pub database_path: String,
    pub media_root: String,
    pub image: StreetViewImageRecord,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreetViewIdRequest {
    pub database_path: String,
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddStreetViewRegionRequest {
    pub database_path: String,
    pub id: String,
    pub region: StreetViewRegion,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyStreetViewRedactionRequest {
    pub database_path: String,
    pub media_root: String,
    pub id: String,
}

#[tauri::command]
pub fn list_street_view_images_command(
    request: StreetViewProfileRequest,
) -> Result<Vec<StreetViewImageRecord>, String> {
    list_street_view_images_at(&request.database_path, &request.profile_scope)
}

#[tauri::command]
pub fn register_street_view_image_command(
    request: RegisterStreetViewImageRequest,
) -> Result<StreetViewImageRecord, String> {
    register_street_view_image_at(&request.database_path, &request.media_root, request.image)
}

#[tauri::command]
pub fn add_manual_street_view_region_command(
    request: AddStreetViewRegionRequest,
) -> Result<StreetViewImageRecord, String> {
    add_manual_street_view_region_at(&request.database_path, &request.id, request.region)
}

#[tauri::command]
pub fn apply_street_view_redaction_command(
    request: ApplyStreetViewRedactionRequest,
) -> Result<StreetViewImageRecord, String> {
    apply_street_view_redaction_at(&request.database_path, &request.media_root, &request.id)
}

#[tauri::command]
pub fn mark_street_view_redaction_none_needed_command(
    request: StreetViewIdRequest,
) -> Result<StreetViewImageRecord, String> {
    mark_street_view_redaction_none_needed_at(&request.database_path, &request.id)
}

pub fn list_street_view_images_at(
    database_path: &str,
    profile_scope: &str,
) -> Result<Vec<StreetViewImageRecord>, String> {
    let db = open_database(database_path)?;
    let repo = StreetViewRepository::new(db.connection());
    repo.list_for_profile(profile_scope)
        .map_err(|error| error.to_string())
}

pub fn register_street_view_image_at(
    database_path: &str,
    media_root: &str,
    image: StreetViewImageRecord,
) -> Result<StreetViewImageRecord, String> {
    crate::db::repositories::assert_portable_street_view_path(
        &image.artifact_path,
        "street view artifact",
    )
        .map_err(|error| error.to_string())?;
    let source = PathBuf::from(media_root).join(&image.artifact_path);
    if !source.is_file() {
        return Err(format!(
            "street view source artifact not found at media root: {}",
            image.artifact_path
        ));
    }
    let db = open_database(database_path)?;
    let repo = StreetViewRepository::new(db.connection());
    repo.register(image).map_err(|error| error.to_string())
}

pub fn add_manual_street_view_region_at(
    database_path: &str,
    id: &str,
    region: StreetViewRegion,
) -> Result<StreetViewImageRecord, String> {
    let db = open_database(database_path)?;
    let repo = StreetViewRepository::new(db.connection());
    repo.add_manual_region(id, region)
        .map_err(|error| error.to_string())
}

pub fn apply_street_view_redaction_at(
    database_path: &str,
    media_root: &str,
    id: &str,
) -> Result<StreetViewImageRecord, String> {
    let db = open_database(database_path)?;
    let repo = StreetViewRepository::new(db.connection());
    let record = repo
        .get_by_id(id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("street view image {id} not found"))?;
    if record.redaction_status == crate::db::repositories::REDACTION_STATUS_NONE_NEEDED {
        return Err("street view image is marked none_needed; no redaction required".into());
    }
    let output = apply_region_redaction(Path::new(media_root), &record)?;
    repo.set_redacted(id, &output)
        .map_err(|error| error.to_string())
}

pub fn mark_street_view_redaction_none_needed_at(
    database_path: &str,
    id: &str,
) -> Result<StreetViewImageRecord, String> {
    let db = open_database(database_path)?;
    let repo = StreetViewRepository::new(db.connection());
    repo.mark_none_needed(id).map_err(|error| error.to_string())
}

fn open_database(database_path: &str) -> Result<Database, String> {
    if database_path.trim().is_empty() {
        return Err("databasePath must not be empty".into());
    }
    Database::open(PathBuf::from(database_path)).map_err(|error| error.to_string())
}

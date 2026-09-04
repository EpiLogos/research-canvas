use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::commands::constellations::resolve_active_profile_scope;
use crate::db::{
    connection::Database,
    repositories::{
        apply_region_redaction, StreetViewImageRecord, StreetViewRegion,
        StreetViewRepository,
    },
};
use crate::SharedApiState;

/// Street-view imagery commands (vision §3.9/§3.13, research findings §2):
/// own captured imagery is the privacy-safe base; redaction regions are
/// derived artifacts applied by the local pipeline. Mapillary browsing is a
/// frontend-side explicit opt-in and never touches this store.

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreetViewProfileRequest {
    pub database_path: String,
    pub profile_scope: Option<String>,
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
pub struct StageStreetViewImageRequest {
    pub media_root: String,
    pub profile_scope: Option<String>,
    pub file_name: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedStreetViewImage {
    pub artifact_path: String,
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
    api_state: tauri::State<SharedApiState>,
) -> Result<Vec<StreetViewImageRecord>, String> {
    let profile_scope = resolve_active_profile_scope(&api_state, request.profile_scope.as_deref())?;
    list_street_view_images_at(&request.database_path, &profile_scope)
}

#[tauri::command]
pub fn register_street_view_image_command(
    request: RegisterStreetViewImageRequest,
) -> Result<StreetViewImageRecord, String> {
    register_street_view_image_at(&request.database_path, &request.media_root, request.image)
}

#[tauri::command]
pub fn stage_street_view_image_command(
    request: StageStreetViewImageRequest,
    api_state: tauri::State<SharedApiState>,
) -> Result<StagedStreetViewImage, String> {
    let profile_scope = resolve_active_profile_scope(&api_state, request.profile_scope.as_deref())?;
    stage_street_view_image_at(
        &request.media_root,
        &profile_scope,
        &request.file_name,
        &request.bytes,
    )
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

/// Stages imported fieldwork imagery into the workspace media root so the
/// register command can resolve it. The bytes are written verbatim and the
/// portable artifact path is returned; raw source bytes are never stored in
/// the database, and the source file is never modified.
pub fn stage_street_view_image_at(
    media_root: &str,
    profile_scope: &str,
    file_name: &str,
    bytes: &[u8],
) -> Result<StagedStreetViewImage, String> {
    if profile_scope.trim().is_empty() {
        return Err("street view profileScope must not be blank".into());
    }
    if media_root.trim().is_empty() {
        return Err("street view mediaRoot must not be blank".into());
    }
    let file_name = sanitize_street_view_file_name(file_name)?;
    let extension = file_extension(&file_name).ok_or_else(|| {
        format!("street view file must be PNG or JPEG: {}", file_name)
    })?;
    if !matches!(extension.as_str(), "png" | "jpg" | "jpeg") {
        return Err(format!(
            "street view file must be PNG or JPEG: {}",
            file_name
        ));
    }
    if bytes.is_empty() {
        return Err("street view file bytes must not be empty".into());
    }
    if !sniffs_like_image(bytes) {
        return Err("street view bytes do not look like a PNG or JPEG image".into());
    }

    let media_root = PathBuf::from(media_root);
    let destination_dir = media_root
        .join("street-view")
        .join(profile_scope);
    std::fs::create_dir_all(&destination_dir).map_err(|error| error.to_string())?;
    let destination = destination_dir.join(&file_name);
    std::fs::write(&destination, bytes).map_err(|error| error.to_string())?;

    Ok(StagedStreetViewImage {
        artifact_path: format!(
            "street-view/{}/{}",
            profile_scope, file_name
        ),
    })
}

fn sanitize_street_view_file_name(file_name: &str) -> Result<String, String> {
    if file_name.contains("..") {
        return Err(format!("invalid street view file name: {file_name}"));
    }
    let base = file_name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(file_name);
    if base.is_empty() || base == "." || base == ".." {
        return Err(format!("invalid street view file name: {file_name}"));
    }
    let sanitized: String = base
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '-'
            }
        })
        .collect();
    if sanitized.is_empty() {
        return Err(format!("invalid street view file name: {file_name}"));
    }
    Ok(sanitized)
}

fn file_extension(file_name: &str) -> Option<String> {
    file_name
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
}

fn sniffs_like_image(bytes: &[u8]) -> bool {
    let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    let jpeg = [0xFF, 0xD8, 0xFF];
    bytes.starts_with(&png) || bytes.starts_with(&jpeg)
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

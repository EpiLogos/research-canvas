use std::path::PathBuf;

use serde_json::Value;

use crate::export::{export_project_bundle, resolve_publish_profile, ExportResult};

#[tauri::command]
pub fn export_project_bundle_command(
    database_path: String,
    project_id: String,
    output_dir: String,
) -> Result<ExportResult, String> {
    let database =
        crate::db::connection::Database::open(&database_path).map_err(|error| error.to_string())?;
    export_project_bundle(
        database.connection(),
        &project_id,
        PathBuf::from(output_dir),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn resolve_publish_profile_command(
    value: Value,
) -> Result<crate::export::PublishProfile, String> {
    resolve_publish_profile(value).map_err(|error| error.to_string())
}

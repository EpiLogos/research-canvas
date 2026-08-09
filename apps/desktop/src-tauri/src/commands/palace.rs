use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::db::{
    connection::Database,
    repositories::PalaceRepository,
};

/// Mind-palace curation commands (vision §3.12, ticket #4): the curation
/// layer is a derived artifact stored per profile — pin, exclude, rename,
/// reorder — and never touches the raw graph.

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PalaceScopeRequest {
    pub database_path: String,
    pub profile_scope: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePalaceCurationRequest {
    pub database_path: String,
    pub profile_scope: String,
    pub curation: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PalaceCurationPayload {
    pub profile_scope: String,
    pub curation: Option<Value>,
}

#[tauri::command]
pub fn load_palace_curation_command(
    request: PalaceScopeRequest,
) -> Result<PalaceCurationPayload, String> {
    load_palace_curation_at(&request.database_path, &request.profile_scope)
}

#[tauri::command]
pub fn save_palace_curation_command(
    request: SavePalaceCurationRequest,
) -> Result<PalaceCurationPayload, String> {
    save_palace_curation_at(&request.database_path, &request.profile_scope, request.curation)
}

pub fn load_palace_curation_at(
    database_path: &str,
    profile_scope: &str,
) -> Result<PalaceCurationPayload, String> {
    let db = open_database(database_path)?;
    let repo = PalaceRepository::new(db.connection());
    let curation = repo
        .get(profile_scope)
        .map_err(|error| error.to_string())?;
    Ok(PalaceCurationPayload {
        profile_scope: profile_scope.to_string(),
        curation,
    })
}

pub fn save_palace_curation_at(
    database_path: &str,
    profile_scope: &str,
    curation: Value,
) -> Result<PalaceCurationPayload, String> {
    let db = open_database(database_path)?;
    let repo = PalaceRepository::new(db.connection());
    repo.save(profile_scope, &curation)
        .map_err(|error| error.to_string())?;
    Ok(PalaceCurationPayload {
        profile_scope: profile_scope.to_string(),
        curation: Some(curation),
    })
}

fn open_database(database_path: &str) -> Result<Database, String> {
    if database_path.trim().is_empty() {
        return Err("databasePath must not be empty".into());
    }
    Database::open(PathBuf::from(database_path)).map_err(|error| error.to_string())
}

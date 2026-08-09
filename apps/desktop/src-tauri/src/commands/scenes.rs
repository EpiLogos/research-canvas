use std::path::PathBuf;

use serde::Deserialize;

use crate::{
    db::{
        connection::Database,
        repositories::{
            SceneRecord, SceneRepository, SceneSequenceRecord,
        },
    },
};

/// Profile-scoped scene/sequence commands (vision §3.7/§3.15, tickets #9/#10):
/// scenes are profile-level units stored in the SQLite profile store; the
/// shared TS zod contract stays the semantic authority, so the wire payloads
/// are the same camelCase records the repository already validates.

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneScopeRequest {
    pub database_path: String,
    pub profile_scope: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneIdRequest {
    pub database_path: String,
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertSceneRequest {
    pub database_path: String,
    pub scene: SceneRecord,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertSceneSequenceRequest {
    pub database_path: String,
    pub sequence: SceneSequenceRecord,
}

pub fn open_database(database_path: &str) -> Result<Database, String> {
    if database_path.trim().is_empty() {
        return Err("databasePath must not be empty".into());
    }
    Database::open(PathBuf::from(database_path)).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_scenes_command(request: SceneScopeRequest) -> Result<Vec<SceneRecord>, String> {
    list_scenes_at(&request.database_path, &request.profile_scope)
}

#[tauri::command]
pub fn list_scene_sequences_command(
    request: SceneScopeRequest,
) -> Result<Vec<SceneSequenceRecord>, String> {
    list_scene_sequences_at(&request.database_path, &request.profile_scope)
}

#[tauri::command]
pub fn get_scene_command(request: SceneIdRequest) -> Result<Option<SceneRecord>, String> {
    let db = open_database(&request.database_path)?;
    let repo = SceneRepository::new(db.connection());
    repo.get_by_id(&request.id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn upsert_scene_command(request: UpsertSceneRequest) -> Result<SceneRecord, String> {
    upsert_scene_at(&request.database_path, request.scene)
}

#[tauri::command]
pub fn upsert_scene_sequence_command(
    request: UpsertSceneSequenceRequest,
) -> Result<SceneSequenceRecord, String> {
    upsert_scene_sequence_at(&request.database_path, request.sequence)
}

#[tauri::command]
pub fn delete_scene_command(request: SceneIdRequest) -> Result<(), String> {
    let db = open_database(&request.database_path)?;
    let repo = SceneRepository::new(db.connection());
    repo.delete(&request.id)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_scene_sequence_command(request: SceneIdRequest) -> Result<(), String> {
    let db = open_database(&request.database_path)?;
    let repo = SceneRepository::new(db.connection());
    repo.delete_sequence(&request.id)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

// The browser bridge (dev mode) and the Tauri invoke handler need the same
// behaviour; these "at" helpers take an explicit database path.

pub fn upsert_scene_at(
    database_path: &str,
    scene: SceneRecord,
) -> Result<SceneRecord, String> {
    let db = open_database(database_path)?;
    let repo = SceneRepository::new(db.connection());
    let existing = repo
        .get_by_id(&scene.id)
        .map_err(|error| error.to_string())?;
    match existing {
        Some(_) => repo.update(&scene).map_err(|error| error.to_string()),
        None => repo.create(scene).map_err(|error| error.to_string()),
    }
}

pub fn upsert_scene_sequence_at(
    database_path: &str,
    sequence: SceneSequenceRecord,
) -> Result<SceneSequenceRecord, String> {
    let db = open_database(database_path)?;
    let repo = SceneRepository::new(db.connection());
    let existing = repo
        .get_sequence_by_id(&sequence.id)
        .map_err(|error| error.to_string())?;
    match existing {
        Some(_) => repo
            .update_sequence(&sequence)
            .map_err(|error| error.to_string()),
        None => repo
            .create_sequence(sequence)
            .map_err(|error| error.to_string()),
    }
}

pub fn list_scenes_at(
    database_path: &str,
    profile_scope: &str,
) -> Result<Vec<SceneRecord>, String> {
    let db = open_database(database_path)?;
    let repo = SceneRepository::new(db.connection());
    repo.list_for_profile(profile_scope)
        .map_err(|error| error.to_string())
}

pub fn list_scene_sequences_at(
    database_path: &str,
    profile_scope: &str,
) -> Result<Vec<SceneSequenceRecord>, String> {
    let db = open_database(database_path)?;
    let repo = SceneRepository::new(db.connection());
    repo.list_sequences_for_profile(profile_scope)
        .map_err(|error| error.to_string())
}

pub fn get_scene_at(
    database_path: &str,
    id: &str,
) -> Result<Option<SceneRecord>, String> {
    let db = open_database(database_path)?;
    let repo = SceneRepository::new(db.connection());
    repo.get_by_id(id).map_err(|error| error.to_string())
}

pub fn delete_scene_at(database_path: &str, id: &str) -> Result<(), String> {
    let db = open_database(database_path)?;
    let repo = SceneRepository::new(db.connection());
    repo.delete(id).map(|_| ()).map_err(|error| error.to_string())
}

pub fn delete_scene_sequence_at(database_path: &str, id: &str) -> Result<(), String> {
    let db = open_database(database_path)?;
    let repo = SceneRepository::new(db.connection());
    repo.delete_sequence(id)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

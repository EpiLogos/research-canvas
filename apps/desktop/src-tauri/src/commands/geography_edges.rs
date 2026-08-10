use std::path::PathBuf;

use serde::Deserialize;

use crate::{
    commands::constellations::resolve_active_profile_scope,
    db::{
        connection::Database,
        repositories::{GeographyEdgeRecord, GeographyEdgeRepository},
    },
    SharedApiState,
};

/// Profile-scoped geography-edge commands (refinement-2 D2, ticket #19):
/// surface-layer movement streams between Temporal Place graph nodes, seeded
/// from the corpus with passage-level provenance. The shared TS zod contract
/// stays the semantic authority, so the wire payloads are the same camelCase
/// records the repository already validates.

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeographyEdgeScopeRequest {
    pub database_path: String,
    pub profile_scope: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeographyEdgeIdRequest {
    pub database_path: String,
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertGeographyEdgeRequest {
    pub database_path: String,
    pub edge: GeographyEdgeRecord,
}

pub fn open_database(database_path: &str) -> Result<Database, String> {
    if database_path.trim().is_empty() {
        return Err("databasePath must not be empty".into());
    }
    Database::open(PathBuf::from(database_path)).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_geography_edges_command(
    request: GeographyEdgeScopeRequest,
    api_state: tauri::State<SharedApiState>,
) -> Result<Vec<GeographyEdgeRecord>, String> {
    let profile_scope = resolve_active_profile_scope(&api_state, request.profile_scope.as_deref())?;
    list_geography_edges_at(&request.database_path, &profile_scope)
}

#[tauri::command]
pub fn get_geography_edge_command(
    request: GeographyEdgeIdRequest,
) -> Result<Option<GeographyEdgeRecord>, String> {
    let db = open_database(&request.database_path)?;
    let repo = GeographyEdgeRepository::new(db.connection());
    repo.get_by_id(&request.id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn upsert_geography_edge_command(
    request: UpsertGeographyEdgeRequest,
) -> Result<GeographyEdgeRecord, String> {
    upsert_geography_edge_at(&request.database_path, request.edge)
}

#[tauri::command]
pub fn delete_geography_edge_command(request: GeographyEdgeIdRequest) -> Result<(), String> {
    let db = open_database(&request.database_path)?;
    let repo = GeographyEdgeRepository::new(db.connection());
    repo.delete(&request.id)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

// The browser bridge (dev mode) and the Tauri invoke handler need the same
// behaviour; these "at" helpers take an explicit database path.

pub fn upsert_geography_edge_at(
    database_path: &str,
    edge: GeographyEdgeRecord,
) -> Result<GeographyEdgeRecord, String> {
    let db = open_database(database_path)?;
    let repo = GeographyEdgeRepository::new(db.connection());
    let existing = repo
        .get_by_id(&edge.id)
        .map_err(|error| error.to_string())?;
    match existing {
        Some(_) => repo.update(&edge).map_err(|error| error.to_string()),
        None => repo.create(edge).map_err(|error| error.to_string()),
    }
}

pub fn list_geography_edges_at(
    database_path: &str,
    profile_scope: &str,
) -> Result<Vec<GeographyEdgeRecord>, String> {
    let db = open_database(database_path)?;
    let repo = GeographyEdgeRepository::new(db.connection());
    repo.list_for_profile(profile_scope)
        .map_err(|error| error.to_string())
}

pub fn get_geography_edge_at(
    database_path: &str,
    id: &str,
) -> Result<Option<GeographyEdgeRecord>, String> {
    let db = open_database(database_path)?;
    let repo = GeographyEdgeRepository::new(db.connection());
    repo.get_by_id(id).map_err(|error| error.to_string())
}

pub fn delete_geography_edge_at(database_path: &str, id: &str) -> Result<(), String> {
    let db = open_database(database_path)?;
    let repo = GeographyEdgeRepository::new(db.connection());
    repo.delete(id).map(|_| ()).map_err(|error| error.to_string())
}

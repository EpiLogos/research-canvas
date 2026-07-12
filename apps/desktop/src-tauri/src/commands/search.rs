use std::path::PathBuf;

use serde::Deserialize;

use crate::db::{
    connection::Database,
    repositories::{SearchHit, SearchIndexSummary, SearchRepository},
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuildConstellationSearchIndexRequest {
    pub database_path: String,
    pub constellation_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchConstellationRequest {
    pub database_path: String,
    pub constellation_id: String,
    pub query: String,
    pub limit: Option<u32>,
}

#[tauri::command]
pub fn rebuild_constellation_search_index_command(
    request: RebuildConstellationSearchIndexRequest,
) -> Result<SearchIndexSummary, String> {
    let database =
        Database::open(PathBuf::from(request.database_path)).map_err(|error| error.to_string())?;
    let repository = SearchRepository::new(database.connection());
    repository
        .rebuild_constellation_index(&request.constellation_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn search_constellation_command(
    request: SearchConstellationRequest,
) -> Result<Vec<SearchHit>, String> {
    let database =
        Database::open(PathBuf::from(request.database_path)).map_err(|error| error.to_string())?;
    let repository = SearchRepository::new(database.connection());
    repository
        .search_constellation(
            &request.constellation_id,
            &request.query,
            request.limit.unwrap_or(20).min(100) as usize,
        )
        .map_err(|error| error.to_string())
}

use std::path::PathBuf;

use serde::Deserialize;

use crate::db::{
    connection::Database,
    repositories::{SearchHit, SearchIndexSummary, SearchRepository},
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuildProjectSearchIndexRequest {
    pub database_path: String,
    pub project_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchProjectRequest {
    pub database_path: String,
    pub project_id: String,
    pub query: String,
    pub limit: Option<u32>,
}

#[tauri::command]
pub fn rebuild_project_search_index_command(
    request: RebuildProjectSearchIndexRequest,
) -> Result<SearchIndexSummary, String> {
    let database =
        Database::open(PathBuf::from(request.database_path)).map_err(|error| error.to_string())?;
    let repository = SearchRepository::new(database.connection());
    repository
        .rebuild_project_index(&request.project_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn search_project_command(request: SearchProjectRequest) -> Result<Vec<SearchHit>, String> {
    let database =
        Database::open(PathBuf::from(request.database_path)).map_err(|error| error.to_string())?;
    let repository = SearchRepository::new(database.connection());
    repository
        .search_project(
            &request.project_id,
            &request.query,
            request.limit.unwrap_or(20).min(100) as usize,
        )
        .map_err(|error| error.to_string())
}

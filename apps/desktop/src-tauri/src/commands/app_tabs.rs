use serde::{Deserialize, Serialize};

use crate::commands::graph::resolve_db_path;
use crate::db::{
    connection::Database,
    repositories::{AppTabRecord, AppTabRepository},
};
use crate::SharedApiState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadAppTabsRequest {
    #[serde(default)]
    pub database_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadAppTabsResponse {
    pub tabs: Vec<AppTabRecord>,
    pub active_tab_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAppTabsRequest {
    #[serde(default)]
    pub database_path: Option<String>,
    pub tabs: Vec<AppTabRecord>,
    pub active_tab_id: Option<String>,
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

#[tauri::command]
pub async fn load_app_tabs_command(
    request: LoadAppTabsRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<LoadAppTabsResponse, String> {
    let path = resolve_db_path(&request.database_path, &api_state)?;
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    let repo = AppTabRepository::new(db.connection());
    let tabs = repo.load_tabs().map_err(|e| e.to_string())?;
    let active_tab_id = repo.load_active_tab_id().map_err(|e| e.to_string())?;
    Ok(LoadAppTabsResponse { tabs, active_tab_id })
}

#[tauri::command]
pub async fn save_app_tabs_command(
    request: SaveAppTabsRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<(), String> {
    let path = resolve_db_path(&request.database_path, &api_state)?;
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    let repo = AppTabRepository::new(db.connection());
    repo.save_tabs(&request.tabs, request.active_tab_id.as_deref(), &now())
        .map_err(|e| e.to_string())?;
    Ok(())
}

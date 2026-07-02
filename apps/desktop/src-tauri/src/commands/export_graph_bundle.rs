// apps/desktop/src-tauri/src/commands/export_graph_bundle.rs
//
// Exposes Task 8's build_graph_bundle/serialize_graph_bundle as a Tauri
// command that writes graph-bundle.json into a chosen output directory, so
// the desktop app can produce the self-contained dataset the backend-less
// web build (apps/public-viewer) reads.

use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::commands::graph::SharedGraphState;
use crate::db::repositories::graph::GraphRepository;
use crate::export::graph_bundle::{build_graph_bundle, serialize_graph_bundle, GraphExportBundle};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportGraphBundleRequest {
    pub database_path: String,
    pub canvas_id: String,
    pub output_dir: String,
    pub project_json: serde_json::Value,
}

/// Pure, unit-testable writer: serialize the bundle and write graph-bundle.json.
pub fn write_graph_bundle(
    bundle: &GraphExportBundle,
    output_dir: &Path,
) -> Result<PathBuf, String> {
    std::fs::create_dir_all(output_dir).map_err(|error| error.to_string())?;
    let serialized = serialize_graph_bundle(bundle)?;
    let target = output_dir.join("graph-bundle.json");
    std::fs::write(&target, serialized).map_err(|error| error.to_string())?;
    Ok(target)
}

#[tauri::command]
pub async fn export_graph_bundle_command(
    request: ExportGraphBundleRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<String, String> {
    // Build the GraphRepository against the managed Neo4j graph (mirrors
    // commands::graph::repo()).
    let graph_repo = GraphRepository::new(graph_state.graph.clone(), graph_state.database.clone());

    // build_graph_bundle opens the SQLite connection itself (after its Neo4j
    // awaits complete) so the command future stays Send — see the doc comment
    // on build_graph_bundle for why a pre-opened &Connection can't be passed
    // through a #[tauri::command] async fn.
    let bundle = build_graph_bundle(
        &graph_repo,
        &request.database_path,
        &request.canvas_id,
        request.project_json,
    )
    .await?;

    let written = write_graph_bundle(&bundle, Path::new(&request.output_dir))?;
    Ok(written.to_string_lossy().to_string())
}

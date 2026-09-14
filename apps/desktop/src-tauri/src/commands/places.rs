use serde::Deserialize;
use std::path::Path;

use crate::{
    commands::{graph::resolve_db_path, timeline::graph_node_from_local_projection},
    db::{
        connection::Database,
        repositories::{graph::GraphNode, GraphNodeMetadataRepository, NodeDocumentRepository},
    },
    SharedApiState,
};

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListLocatedGraphNodesRequest {
    #[serde(default)]
    pub database_path: Option<String>,
}

/// Canonical project-wide Places read from the durable local graph projection.
///
/// The query deliberately begins at `graph_node_metadata.place_json`, not at a
/// Canvas, Timeline window, Story scene, or saved walk. This keeps Places
/// complete and useful offline: every locally projected node that carries a
/// Temporal Place can appear on the globe whether or not Neo4j is available.
pub fn list_located_graph_nodes_at_path(path: impl AsRef<Path>) -> Result<Vec<GraphNode>, String> {
    let database = Database::open(path).map_err(|error| error.to_string())?;
    let connection = database.connection();
    let metadata = GraphNodeMetadataRepository::new(connection);
    let documents = NodeDocumentRepository::new(connection);

    let mut statement = connection
        .prepare(
            "SELECT graph_node_id
             FROM graph_node_metadata
             WHERE place_json IS NOT NULL
             ORDER BY graph_node_id",
        )
        .map_err(|error| error.to_string())?;
    let ids = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    ids.into_iter()
        .map(|graph_node_id| {
            let record = metadata
                .get_with_timestamps(&graph_node_id)
                .map_err(|error| error.to_string())?
                .ok_or_else(|| {
                    format!(
                        "located graph node disappeared from local metadata projection: {graph_node_id}"
                    )
                })?;
            let document = documents
                .get_node_document(&graph_node_id)
                .map_err(|error| error.to_string())?;
            Ok(graph_node_from_local_projection(&record, document))
        })
        .collect()
}

#[tauri::command]
pub fn list_located_graph_nodes_command(
    request: ListLocatedGraphNodesRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<Vec<GraphNode>, String> {
    let database_path = resolve_db_path(&request.database_path, &api_state)?;
    list_located_graph_nodes_at_path(database_path)
}

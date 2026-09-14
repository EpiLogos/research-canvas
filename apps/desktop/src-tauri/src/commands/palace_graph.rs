use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::{
    commands::{
        graph::SharedGraphState,
        timeline::{
            load_timeline_view_at_path, LoadTimelineViewRequest, TimelineFilters, TimelineNode,
        },
    },
    db::{
        connection::Database,
        repositories::{
            graph::{GraphRelationship, GraphRepository},
            NodeRelationshipRepository,
        },
    },
    SharedApiState,
};

/// Palace subgraph loader (refinement-2 D5.8, ticket #22): the palace is fed
/// by a transport surface dedicated to the palace — the timeline view's nodes
/// and relationships plus the real ENCAPSULATES edges read through the graph
/// repository layer. `PalaceLensHost` consumes this surface instead of
/// filtering the timeline view's bounded relationship neighbourhood for
/// ENCAPSULATES, so full-form shaping (full → room, partial → alcove/corridor/
/// wallSection, compressed → single object) is driven by the Task-6
/// repository surface the design names.

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoadPalaceGraphRequest {
    pub workspace_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PalaceGraphView {
    pub workspace_id: String,
    pub nodes: Vec<TimelineNode>,
    pub relationships: Vec<GraphRelationship>,
    pub encapsulation_edges: Vec<GraphRelationship>,
}

/// Pure SQLite palace subgraph read. The palace surface reads ENCAPSULATES
/// edges from the graph repository layer; when a live graph connection is
/// unavailable (e.g. the read-only web bridge in CI) the local SQLite
/// projection of `graph_relationship` is the store — ENCAPSULATES is a valid
/// relation type in the vocabulary (migration 0033), so the projection can
/// carry the edges the palace shapes into rooms. The command/bridge merges
/// the live Neo4j edges over this projection when a graph is configured.
pub fn load_palace_graph_at(
    path: impl AsRef<std::path::Path>,
    request: LoadPalaceGraphRequest,
) -> Result<PalaceGraphView, String> {
    let workspace_id = request.workspace_id.clone();
    let view = load_timeline_view_at_path(
        path.as_ref(),
        LoadTimelineViewRequest {
            workspace_id,
            filters: TimelineFilters::default(),
            range: None,
        },
    )?;
    let database = Database::open(path.as_ref()).map_err(|error| error.to_string())?;
    let relationship_repository = NodeRelationshipRepository::new(database.connection());
    let encapsulation_edges = relationship_repository
        .list_by_type("ENCAPSULATES")
        .map_err(|error| error.to_string())?
        .into_iter()
        .filter(|record| !record.is_tombstone)
        .map(|record| record.as_graph_relationship())
        .collect::<Vec<_>>();

    Ok(PalaceGraphView {
        workspace_id: view.workspace_id,
        nodes: view.nodes,
        relationships: view.relationships,
        encapsulation_edges,
    })
}

fn encapsulation_edge_key(edge: &GraphRelationship) -> String {
    format!(
        "{}|{}|{}|{}",
        edge.source_graph_node_id, edge.target_graph_node_id, edge.rel_type, edge.properties
    )
}

/// Merge local-projection ENCAPSULATES edges with the live graph repository's
/// edges (the authoritative Task-6 surface). The remote edges win on the same
/// canonical key (source + target + type + properties), and the result is
/// stable-ordered so regeneration is deterministic.
pub fn merge_encapsulation_edges(
    local: Vec<GraphRelationship>,
    remote: Vec<GraphRelationship>,
) -> Vec<GraphRelationship> {
    let mut by_key = std::collections::BTreeMap::<String, GraphRelationship>::new();
    for edge in local {
        by_key.insert(encapsulation_edge_key(&edge), edge);
    }
    for edge in remote {
        by_key.insert(encapsulation_edge_key(&edge), edge);
    }
    by_key.into_values().collect()
}

#[tauri::command]
pub async fn load_palace_graph_command(
    request: LoadPalaceGraphRequest,
    api_state: tauri::State<'_, SharedApiState>,
    app_handle: tauri::AppHandle,
) -> Result<PalaceGraphView, String> {
    let path = api_state
        .lock()
        .map_err(|_| "API state lock poisoned".to_string())?
        .db_path
        .clone()
        .ok_or_else(|| "App not bootstrapped yet".to_string())?;
    let mut view = load_palace_graph_at(&path, request)?;
    let Some(graph_state) = app_handle.try_state::<SharedGraphState>() else {
        return Ok(view);
    };
    let graph = GraphRepository::new(
        graph_state.graph.clone(),
        graph_state.database.clone(),
    );
    let remote = graph.list_encapsulation_edges().await?;
    view.encapsulation_edges = merge_encapsulation_edges(view.encapsulation_edges, remote);
    Ok(view)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn edge(id: &str, src: &str, tgt: &str, mode: &str) -> GraphRelationship {
        GraphRelationship {
            id: id.into(),
            rel_type: "ENCAPSULATES".into(),
            source_graph_node_id: src.into(),
            target_graph_node_id: tgt.into(),
            properties: json!({ "mode": mode }),
        }
    }

    #[test]
    fn merge_unions_local_and_remote_edges_without_dropping_mode_variants() {
        // `mode` is part of the canonical key (it lives in `properties`), so a
        // local outgoing and a remote ingoing reading of the same endpoint pair
        // are distinct edges — both survive the union.
        let local = vec![
            edge("r1", "container-a", "member-1", "outgoing"),
            edge("r2", "container-b", "member-2", "outgoing"),
        ];
        let remote = vec![
            edge("r2", "container-b", "member-2", "ingoing"),
            edge("r3", "container-c", "member-3", "outgoing"),
        ];
        let merged = merge_encapsulation_edges(local, remote);
        // r1, r2-outgoing, r2-ingoing, r3 — four distinct canonical keys.
        assert_eq!(merged.len(), 4);
        let r2_outgoing = merged
            .iter()
            .find(|edge| edge.id == "r2" && edge.properties["mode"] == "outgoing")
            .expect("local r2 outgoing present");
        let r2_ingoing = merged
            .iter()
            .find(|edge| edge.id == "r2" && edge.properties["mode"] == "ingoing")
            .expect("remote r2 ingoing present");
        assert_eq!(r2_outgoing.properties["mode"], "outgoing");
        assert_eq!(r2_ingoing.properties["mode"], "ingoing");
    }

    #[test]
    fn merge_is_stable_ordered_and_deduplicates_exact_copies() {
        let local = vec![edge("r1", "a", "b", "outgoing")];
        let remote = vec![edge("r1", "a", "b", "outgoing")];
        let merged = merge_encapsulation_edges(local.clone(), remote);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].source_graph_node_id, "a");
        assert_eq!(merged[0].target_graph_node_id, "b");
    }
}

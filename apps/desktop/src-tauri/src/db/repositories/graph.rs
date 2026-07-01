// apps/desktop/src-tauri/src/db/repositories/graph.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub graph_node_id: String,
    pub entity_type: String,
    pub title: String,
    pub body: String,
    pub summary: String,
    pub archetypal_resonance: Option<String>,
    pub coordinate: Option<String>,
    pub source_coordinates: Vec<String>,
    pub is_temporal: bool,
    pub valid_from: Option<String>,
    pub valid_to: Option<String>,
    pub temporal_precision: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRelationship {
    pub id: String,
    pub rel_type: String,
    pub source_graph_node_id: String,
    pub target_graph_node_id: String,
    pub properties: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewGraphNode {
    pub entity_type: String,
    pub title: String,
    pub body: String,
    pub coordinate: Option<String>,
    pub source_coordinates: Vec<String>,
    pub is_temporal: bool,
    pub valid_from: Option<String>,
    pub valid_to: Option<String>,
    pub temporal_precision: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNodePatch {
    pub title: Option<String>,
    pub body: Option<String>,
    pub summary: Option<String>,
    pub archetypal_resonance: Option<String>,
    pub coordinate: Option<Option<String>>,
    pub source_coordinates: Option<Vec<String>>,
    pub is_temporal: Option<bool>,
    pub valid_from: Option<Option<String>>,
    pub valid_to: Option<Option<String>>,
    pub temporal_precision: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchetypalLightingResult {
    pub operator: GraphNode,
    pub instances: Vec<LitInstance>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LitInstance {
    pub node: GraphNode,
    pub rel_type: String,
    pub dominance: Option<String>,
}

use neo4rs::query;

pub struct GraphRepository {
    graph: crate::db::neo4j::SharedGraph,
    database: String,
}

const SCHEMA_STATEMENTS: &[&str] = &[
    "CREATE CONSTRAINT theory_node_id IF NOT EXISTS \
     FOR (n:TheoryNode) REQUIRE n.graph_node_id IS UNIQUE",
    "CREATE CONSTRAINT operator_node_id IF NOT EXISTS \
     FOR (n:Operator) REQUIRE n.graph_node_id IS UNIQUE",
    "CREATE CONSTRAINT operator_coordinate IF NOT EXISTS \
     FOR (n:Operator) REQUIRE n.coordinate IS UNIQUE",
    "CREATE INDEX theory_node_title IF NOT EXISTS FOR (n:TheoryNode) ON (n.title)",
    "CREATE INDEX theory_node_is_temporal IF NOT EXISTS FOR (n:TheoryNode) ON (n.is_temporal)",
    "CREATE INDEX theory_node_valid_from IF NOT EXISTS FOR (n:TheoryNode) ON (n.valid_from)",
    "CREATE INDEX theory_node_coordinate IF NOT EXISTS FOR (n:TheoryNode) ON (n.coordinate)",
    "CREATE FULLTEXT INDEX theory_node_fulltext IF NOT EXISTS \
     FOR (n:TheoryNode) ON EACH [n.title, n.summary, n.archetypal_resonance]",
];

impl GraphRepository {
    pub fn new(graph: crate::db::neo4j::SharedGraph, database: String) -> Self {
        Self { graph, database }
    }

    pub async fn ensure_schema(&self) -> Result<(), String> {
        for stmt in SCHEMA_STATEMENTS {
            self.graph
                .run_on(&self.database, query(stmt))
                .await
                .map_err(|e| format!("ensure_schema failed on `{stmt}`: {e}"))?;
        }
        Ok(())
    }
}

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

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

/// Build a GraphNode from a returned `n` node value plus its entity-type label.
fn node_from_neo(node: neo4rs::Node) -> Result<GraphNode, String> {
    let labels: Vec<String> = node.labels().iter().map(|s| s.to_string()).collect();
    let entity_type = labels
        .iter()
        .find(|l| l.as_str() != "TheoryNode" && l.as_str() != "Operator")
        .cloned()
        .unwrap_or_default();
    let source_coordinates: Vec<String> = node.get("source_coordinates").unwrap_or_default();
    Ok(GraphNode {
        graph_node_id: node.get("graph_node_id").map_err(|e| e.to_string())?,
        entity_type,
        title: node.get("title").unwrap_or_default(),
        body: node.get("body").unwrap_or_else(|_| "[]".to_string()),
        summary: node.get("summary").unwrap_or_default(),
        archetypal_resonance: node.get("archetypal_resonance").ok(),
        coordinate: node.get("coordinate").ok(),
        source_coordinates,
        is_temporal: node.get("is_temporal").unwrap_or(false),
        valid_from: node.get("valid_from").ok(),
        valid_to: node.get("valid_to").ok(),
        temporal_precision: node.get("temporal_precision").ok(),
        created_at: node.get("created_at").unwrap_or_default(),
        updated_at: node.get("updated_at").unwrap_or_default(),
    })
}

const ENTITY_LABELS: &[&str] = &[
    "Figure", "People", "Event", "Institution", "Source",
    "Place", "Work", "Archetype", "Dynamic",
];

fn validate_entity_label(entity_type: &str) -> Result<&str, String> {
    ENTITY_LABELS
        .iter()
        .find(|l| **l == entity_type)
        .copied()
        .ok_or_else(|| format!("unknown entity_type: {entity_type}"))
}

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

    pub async fn create_node(&self, input: NewGraphNode) -> Result<GraphNode, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_rfc3339();
        // Entity-type label is interpolated (validated against a known set) because
        // Cypher labels cannot be parameterized.
        let label = validate_entity_label(&input.entity_type)?;
        let cypher = format!(
            "CREATE (n:TheoryNode:{label} {{
                graph_node_id: $id, title: $title, body: $body, summary: '',
                coordinate: $coordinate, source_coordinates: $source_coordinates,
                is_temporal: $is_temporal, valid_from: $valid_from, valid_to: $valid_to,
                temporal_precision: $temporal_precision,
                created_at: $now, updated_at: $now
            }}) RETURN n"
        );
        let q = query(&cypher)
            .param("id", id.clone())
            .param("title", input.title)
            .param("body", input.body)
            .param("coordinate", input.coordinate)
            .param("source_coordinates", input.source_coordinates)
            .param("is_temporal", input.is_temporal)
            .param("valid_from", input.valid_from)
            .param("valid_to", input.valid_to)
            .param("temporal_precision", input.temporal_precision)
            .param("now", now);
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("create_node failed: {e}"))?;
        let row = rows
            .next()
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "create_node returned no row".to_string())?;
        let node: neo4rs::Node = row.get("n").map_err(|e| e.to_string())?;
        node_from_neo(node)
    }

    pub async fn get_node(&self, graph_node_id: &str) -> Result<Option<GraphNode>, String> {
        let q = query("MATCH (n:TheoryNode {graph_node_id: $id}) RETURN n")
            .param("id", graph_node_id.to_string());
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("get_node failed: {e}"))?;
        match rows.next().await.map_err(|e| e.to_string())? {
            Some(row) => {
                let node: neo4rs::Node = row.get("n").map_err(|e| e.to_string())?;
                Ok(Some(node_from_neo(node)?))
            }
            None => Ok(None),
        }
    }
}

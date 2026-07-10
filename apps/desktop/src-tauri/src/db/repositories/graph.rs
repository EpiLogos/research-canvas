// apps/desktop/src-tauri/src/db/repositories/graph.rs
use serde::{Deserialize, Serialize};

macro_rules! controlled_string_enum {
    ($name:ident { $($variant:ident => $value:literal),+ $(,)? }) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
        pub enum $name {
            $(#[serde(rename = $value)] $variant),+
        }

        impl $name {
            pub const fn as_str(self) -> &'static str {
                match self {
                    $(Self::$variant => $value),+
                }
            }
        }

        impl TryFrom<String> for $name {
            type Error = String;

            fn try_from(value: String) -> Result<Self, Self::Error> {
                match value.as_str() {
                    $($value => Ok(Self::$variant),)+
                    _ => Err(format!("unknown {} value: {value}", stringify!($name))),
                }
            }
        }
    };
}

controlled_string_enum!(ContentOrigin {
    Seed => "seed",
    CorpusCompiled => "corpus_compiled",
    UserAuthored => "user_authored",
    Imported => "imported",
});
controlled_string_enum!(Historicity {
    Historical => "historical",
    Mythic => "mythic",
    Literary => "literary",
    Theoretical => "theoretical",
    Mixed => "mixed",
});
controlled_string_enum!(ClaimKind {
    Fact => "fact",
    Inference => "inference",
    Interpretation => "interpretation",
    Allegation => "allegation",
    Hypothesis => "hypothesis",
    SymbolicParallel => "symbolic_parallel",
});
controlled_string_enum!(EvidenceStatus {
    Documented => "documented",
    WellEvidencedInference => "well_evidenced_inference",
    Interpretive => "interpretive",
    Contested => "contested",
    Alleged => "alleged",
    Unverified => "unverified",
    Disproven => "disproven",
});
controlled_string_enum!(TemporalRole {
    OccurredAt => "occurred_at",
    ActiveDuring => "active_during",
    SourcePublishedAt => "source_published_at",
    ClaimAboutTime => "claim_about_time",
    MythLocatedAt => "myth_located_at",
});
controlled_string_enum!(PlaceCoverage {
    Resolved => "resolved",
    Unknown => "unknown",
    NotApplicable => "not_applicable",
});
controlled_string_enum!(QlForm {
    CompleteSixfold => "complete_sixfold",
    PartialPositionalMap => "partial_positional_map",
    Quaternity => "quaternity",
    PositionWheel => "position_wheel",
    DoubleHelix => "double_helix",
    OtherExplicit => "other_explicit",
});
controlled_string_enum!(QlArc {
    Day => "day",
    Night => "night",
    Braided => "braided",
    NotApplicable => "not_applicable",
});
controlled_string_enum!(QlTopology {
    Torus => "torus",
    Klein => "klein",
    Lemniscatic => "lemniscatic",
    Composite => "composite",
    Unspecified => "unspecified",
});
controlled_string_enum!(QlCompletenessStatus {
    Complete => "complete",
    Partial => "partial",
    Incomplete => "incomplete",
    NotApplicable => "not_applicable",
});
controlled_string_enum!(TemporalPrecision {
    Millennium => "millennium",
    Century => "century",
    Decade => "decade",
    Year => "year",
    Month => "month",
    Day => "day",
});

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
    pub evidence_tags: Vec<String>,
    pub source_kind: Option<String>,
    pub content_origin: Option<ContentOrigin>,
    pub content_revision: Option<i64>,
    pub seed_schema_version: Option<i64>,
    pub body_source_coordinates: Vec<String>,
    pub historicity: Option<Historicity>,
    pub claim_kind: Option<ClaimKind>,
    pub evidence_status: Option<EvidenceStatus>,
    pub temporal_role: Option<TemporalRole>,
    pub place_coverage: Option<PlaceCoverage>,
    pub ql_form: Option<QlForm>,
    pub ql_unit_id: Option<String>,
    pub ql_arc: Option<QlArc>,
    pub ql_topology: Option<QlTopology>,
    pub ql_schema_version: Option<i64>,
    pub ql_source_coordinates: Vec<String>,
    pub ql_completeness_status: Option<QlCompletenessStatus>,
    pub is_temporal: bool,
    pub valid_from: Option<String>,
    pub valid_to: Option<String>,
    pub temporal_precision: Option<TemporalPrecision>,
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
    /// Optional client-supplied id. When `Some`, used verbatim as the Neo4j
    /// `graph_node_id`; when `None`, a fresh UUIDv4 is minted. This lets the
    /// frontend pre-mint a single id shared across all three stores (Neo4j,
    /// SQLite layout, canvas node) giving a true 1:1 join.
    #[serde(default)]
    pub graph_node_id: Option<String>,
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

/// Typed metadata supplied by modern creation boundaries. Keeping it separate
/// preserves the small internal `NewGraphNode` API used by existing callers,
/// while commands and importers can write the complete contract atomically.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewGraphNodeMetadata {
    #[serde(default)]
    pub evidence_tags: Vec<String>,
    #[serde(default)]
    pub source_kind: Option<String>,
    #[serde(default)]
    pub content_origin: Option<ContentOrigin>,
    #[serde(default)]
    pub content_revision: Option<i64>,
    #[serde(default)]
    pub seed_schema_version: Option<i64>,
    #[serde(default)]
    pub body_source_coordinates: Vec<String>,
    #[serde(default)]
    pub historicity: Option<Historicity>,
    #[serde(default)]
    pub claim_kind: Option<ClaimKind>,
    #[serde(default)]
    pub evidence_status: Option<EvidenceStatus>,
    #[serde(default)]
    pub temporal_role: Option<TemporalRole>,
    #[serde(default)]
    pub place_coverage: Option<PlaceCoverage>,
    #[serde(default)]
    pub ql_form: Option<QlForm>,
    #[serde(default)]
    pub ql_unit_id: Option<String>,
    #[serde(default)]
    pub ql_arc: Option<QlArc>,
    #[serde(default)]
    pub ql_topology: Option<QlTopology>,
    #[serde(default)]
    pub ql_schema_version: Option<i64>,
    #[serde(default)]
    pub ql_source_coordinates: Vec<String>,
    #[serde(default)]
    pub ql_completeness_status: Option<QlCompletenessStatus>,
}

fn deserialize_present_nullable<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNodePatch {
    pub title: Option<String>,
    pub body: Option<String>,
    pub summary: Option<String>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub archetypal_resonance: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub coordinate: Option<Option<String>>,
    pub source_coordinates: Option<Vec<String>>,
    pub evidence_tags: Option<Vec<String>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub source_kind: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub content_origin: Option<Option<ContentOrigin>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub content_revision: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub seed_schema_version: Option<Option<i64>>,
    pub body_source_coordinates: Option<Vec<String>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub historicity: Option<Option<Historicity>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub claim_kind: Option<Option<ClaimKind>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub evidence_status: Option<Option<EvidenceStatus>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub temporal_role: Option<Option<TemporalRole>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub place_coverage: Option<Option<PlaceCoverage>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub ql_form: Option<Option<QlForm>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub ql_unit_id: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub ql_arc: Option<Option<QlArc>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub ql_topology: Option<Option<QlTopology>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub ql_schema_version: Option<Option<i64>>,
    pub ql_source_coordinates: Option<Vec<String>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub ql_completeness_status: Option<Option<QlCompletenessStatus>>,
    pub is_temporal: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub valid_from: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub valid_to: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub temporal_precision: Option<Option<TemporalPrecision>>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperatorSeed {
    pub coordinate: String,
    pub title: String,
    pub operator_kind: String,
    pub position: Option<String>,
    pub source_coordinates: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedGraphNode {
    pub graph_node_id: String,
    pub entity_type: String,
    pub title: String,
    pub body: String,
    pub summary: String,
    pub archetypal_resonance: Option<String>,
    pub coordinate: Option<String>,
    pub source_coordinates: Vec<String>,
    pub evidence_tags: Vec<String>,
    pub source_kind: Option<String>,
    pub is_temporal: bool,
    pub valid_from: Option<String>,
    pub valid_to: Option<String>,
    pub temporal_precision: Option<String>,
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

/// Neo4j stores controlled values as strings. This is the sole compatibility
/// boundary: absent properties become `None`, while present unknown values are
/// rejected with their property name instead of leaking into the typed API.
fn controlled_from_neo<T>(node: &neo4rs::Node, property: &str) -> Result<Option<T>, String>
where
    T: TryFrom<String, Error = String>,
{
    match node.get::<String>(property) {
        Ok(value) => T::try_from(value)
            .map(Some)
            .map_err(|error| format!("invalid Neo4j property `{property}`: {error}")),
        Err(_) => Ok(None),
    }
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
        evidence_tags: node.get("evidence_tags").unwrap_or_default(),
        source_kind: node.get("source_kind").ok(),
        content_origin: controlled_from_neo(&node, "content_origin")?,
        content_revision: node.get("content_revision").ok(),
        seed_schema_version: node.get("seed_schema_version").ok(),
        body_source_coordinates: node.get("body_source_coordinates").unwrap_or_default(),
        historicity: controlled_from_neo(&node, "historicity")?,
        claim_kind: controlled_from_neo(&node, "claim_kind")?,
        evidence_status: controlled_from_neo(&node, "evidence_status")?,
        temporal_role: controlled_from_neo(&node, "temporal_role")?,
        place_coverage: controlled_from_neo(&node, "place_coverage")?,
        ql_form: controlled_from_neo(&node, "ql_form")?,
        ql_unit_id: node.get("ql_unit_id").ok(),
        ql_arc: controlled_from_neo(&node, "ql_arc")?,
        ql_topology: controlled_from_neo(&node, "ql_topology")?,
        ql_schema_version: node.get("ql_schema_version").ok(),
        ql_source_coordinates: node.get("ql_source_coordinates").unwrap_or_default(),
        ql_completeness_status: controlled_from_neo(&node, "ql_completeness_status")?,
        is_temporal: node.get("is_temporal").unwrap_or(false),
        valid_from: node.get("valid_from").ok(),
        valid_to: node.get("valid_to").ok(),
        temporal_precision: controlled_from_neo(&node, "temporal_precision")?,
        created_at: node.get("created_at").unwrap_or_default(),
        updated_at: node.get("updated_at").unwrap_or_default(),
    })
}

const ENTITY_LABELS: &[&str] = &[
    "Figure",
    "People",
    "Event",
    "Institution",
    "Source",
    "Claim",
    "Myth",
    "Interpretation",
    "Place",
    "Work",
    "Archetype",
    "Dynamic",
    "Constellation",
];

fn validate_entity_label(entity_type: &str) -> Result<&str, String> {
    ENTITY_LABELS
        .iter()
        .find(|l| **l == entity_type)
        .copied()
        .ok_or_else(|| format!("unknown entity_type: {entity_type}"))
}

const REL_TYPES: &[&str] = &[
    "INSTANTIATES",
    "ECHOES",
    "CAUSES",
    "INFLUENCES",
    "OPPOSES",
    "INHERITS",
    "TRANSFORMS_INTO",
    "LOCATED_AT",
    "SOURCED_FROM",
    "RESONATES_WITH",
];

fn validate_rel_type(rel_type: &str) -> Result<&str, String> {
    REL_TYPES
        .iter()
        .find(|r| **r == rel_type)
        .copied()
        .ok_or_else(|| format!("unknown rel_type: {rel_type}"))
}

fn relationship_from_row(
    row: &neo4rs::Row,
    properties: serde_json::Value,
) -> Result<GraphRelationship, String> {
    Ok(GraphRelationship {
        id: row.get::<String>("id").map_err(|e| e.to_string())?,
        rel_type: row.get::<String>("rel_type").map_err(|e| e.to_string())?,
        source_graph_node_id: row.get::<String>("src").map_err(|e| e.to_string())?,
        target_graph_node_id: row.get::<String>("tgt").map_err(|e| e.to_string())?,
        properties,
    })
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
        self.create_node_with_metadata(input, NewGraphNodeMetadata::default())
            .await
    }

    pub async fn create_node_with_metadata(
        &self,
        input: NewGraphNode,
        metadata: NewGraphNodeMetadata,
    ) -> Result<GraphNode, String> {
        if let Some(value) = input.temporal_precision.as_ref() {
            TemporalPrecision::try_from(value.clone())?;
        }
        let id = input
            .graph_node_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let now = now_rfc3339();
        // Entity-type label is interpolated (validated against a known set) because
        // Cypher labels cannot be parameterized.
        let label = validate_entity_label(&input.entity_type)?;
        let cypher = format!(
            "CREATE (n:TheoryNode:{label} {{
                graph_node_id: $id, title: $title, body: $body, summary: '',
                coordinate: $coordinate, source_coordinates: $source_coordinates,
                evidence_tags: $evidence_tags, source_kind: $source_kind,
                content_origin: $content_origin, content_revision: $content_revision,
                seed_schema_version: $seed_schema_version,
                body_source_coordinates: $body_source_coordinates,
                historicity: $historicity, claim_kind: $claim_kind,
                evidence_status: $evidence_status, temporal_role: $temporal_role,
                place_coverage: $place_coverage, ql_form: $ql_form,
                ql_unit_id: $ql_unit_id, ql_arc: $ql_arc, ql_topology: $ql_topology,
                ql_schema_version: $ql_schema_version,
                ql_source_coordinates: $ql_source_coordinates,
                ql_completeness_status: $ql_completeness_status,
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
            .param("evidence_tags", metadata.evidence_tags)
            .param("source_kind", metadata.source_kind)
            .param(
                "content_origin",
                metadata
                    .content_origin
                    .map(|value| value.as_str().to_string()),
            )
            .param("content_revision", metadata.content_revision)
            .param("seed_schema_version", metadata.seed_schema_version)
            .param("body_source_coordinates", metadata.body_source_coordinates)
            .param(
                "historicity",
                metadata.historicity.map(|value| value.as_str().to_string()),
            )
            .param(
                "claim_kind",
                metadata.claim_kind.map(|value| value.as_str().to_string()),
            )
            .param(
                "evidence_status",
                metadata
                    .evidence_status
                    .map(|value| value.as_str().to_string()),
            )
            .param(
                "temporal_role",
                metadata
                    .temporal_role
                    .map(|value| value.as_str().to_string()),
            )
            .param(
                "place_coverage",
                metadata
                    .place_coverage
                    .map(|value| value.as_str().to_string()),
            )
            .param(
                "ql_form",
                metadata.ql_form.map(|value| value.as_str().to_string()),
            )
            .param("ql_unit_id", metadata.ql_unit_id)
            .param(
                "ql_arc",
                metadata.ql_arc.map(|value| value.as_str().to_string()),
            )
            .param(
                "ql_topology",
                metadata.ql_topology.map(|value| value.as_str().to_string()),
            )
            .param("ql_schema_version", metadata.ql_schema_version)
            .param("ql_source_coordinates", metadata.ql_source_coordinates)
            .param(
                "ql_completeness_status",
                metadata
                    .ql_completeness_status
                    .map(|value| value.as_str().to_string()),
            )
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

    pub async fn update_node(
        &self,
        graph_node_id: &str,
        patch: GraphNodePatch,
    ) -> Result<GraphNode, String> {
        let mut sets: Vec<String> = vec!["n.updated_at = $now".to_string()];
        if patch.title.is_some() {
            sets.push("n.title = $title".into());
        }
        if patch.body.is_some() {
            sets.push("n.body = $body".into());
        }
        if patch.summary.is_some() {
            sets.push("n.summary = $summary".into());
        }
        if patch.archetypal_resonance.is_some() {
            sets.push("n.archetypal_resonance = $archetypal_resonance".into());
        }
        if patch.coordinate.is_some() {
            sets.push("n.coordinate = $coordinate".into());
        }
        if patch.source_coordinates.is_some() {
            sets.push("n.source_coordinates = $source_coordinates".into());
        }
        if patch.evidence_tags.is_some() {
            sets.push("n.evidence_tags = $evidence_tags".into());
        }
        if patch.source_kind.is_some() {
            sets.push("n.source_kind = $source_kind".into());
        }
        if patch.content_origin.is_some() {
            sets.push("n.content_origin = $content_origin".into());
        }
        if patch.content_revision.is_some() {
            sets.push("n.content_revision = $content_revision".into());
        }
        if patch.seed_schema_version.is_some() {
            sets.push("n.seed_schema_version = $seed_schema_version".into());
        }
        if patch.body_source_coordinates.is_some() {
            sets.push("n.body_source_coordinates = $body_source_coordinates".into());
        }
        if patch.historicity.is_some() {
            sets.push("n.historicity = $historicity".into());
        }
        if patch.claim_kind.is_some() {
            sets.push("n.claim_kind = $claim_kind".into());
        }
        if patch.evidence_status.is_some() {
            sets.push("n.evidence_status = $evidence_status".into());
        }
        if patch.temporal_role.is_some() {
            sets.push("n.temporal_role = $temporal_role".into());
        }
        if patch.place_coverage.is_some() {
            sets.push("n.place_coverage = $place_coverage".into());
        }
        if patch.ql_form.is_some() {
            sets.push("n.ql_form = $ql_form".into());
        }
        if patch.ql_unit_id.is_some() {
            sets.push("n.ql_unit_id = $ql_unit_id".into());
        }
        if patch.ql_arc.is_some() {
            sets.push("n.ql_arc = $ql_arc".into());
        }
        if patch.ql_topology.is_some() {
            sets.push("n.ql_topology = $ql_topology".into());
        }
        if patch.ql_schema_version.is_some() {
            sets.push("n.ql_schema_version = $ql_schema_version".into());
        }
        if patch.ql_source_coordinates.is_some() {
            sets.push("n.ql_source_coordinates = $ql_source_coordinates".into());
        }
        if patch.ql_completeness_status.is_some() {
            sets.push("n.ql_completeness_status = $ql_completeness_status".into());
        }
        if patch.is_temporal.is_some() {
            sets.push("n.is_temporal = $is_temporal".into());
        }
        if patch.valid_from.is_some() {
            sets.push("n.valid_from = $valid_from".into());
        }
        if patch.valid_to.is_some() {
            sets.push("n.valid_to = $valid_to".into());
        }
        if patch.temporal_precision.is_some() {
            sets.push("n.temporal_precision = $temporal_precision".into());
        }

        // No meaningful fields — return the current node without touching the DB.
        if sets.len() == 1 {
            return self
                .get_node(graph_node_id)
                .await?
                .ok_or_else(|| format!("update_node: no node with id {graph_node_id}"));
        }

        let cypher = format!(
            "MATCH (n:TheoryNode {{graph_node_id: $id}}) SET {} RETURN n",
            sets.join(", ")
        );
        let mut q = query(&cypher)
            .param("id", graph_node_id.to_string())
            .param("now", now_rfc3339());
        if let Some(v) = patch.title {
            q = q.param("title", v);
        }
        if let Some(v) = patch.body {
            q = q.param("body", v);
        }
        if let Some(v) = patch.summary {
            q = q.param("summary", v);
        }
        if let Some(v) = patch.archetypal_resonance {
            q = q.param("archetypal_resonance", v);
        }
        if let Some(v) = patch.coordinate {
            q = q.param("coordinate", v);
        }
        if let Some(v) = patch.source_coordinates {
            q = q.param("source_coordinates", v);
        }
        if let Some(v) = patch.evidence_tags {
            q = q.param("evidence_tags", v);
        }
        if let Some(v) = patch.source_kind {
            q = q.param("source_kind", v);
        }
        if let Some(v) = patch.content_origin {
            q = q.param("content_origin", v.map(|value| value.as_str().to_string()));
        }
        if let Some(v) = patch.content_revision {
            q = q.param("content_revision", v);
        }
        if let Some(v) = patch.seed_schema_version {
            q = q.param("seed_schema_version", v);
        }
        if let Some(v) = patch.body_source_coordinates {
            q = q.param("body_source_coordinates", v);
        }
        if let Some(v) = patch.historicity {
            q = q.param("historicity", v.map(|value| value.as_str().to_string()));
        }
        if let Some(v) = patch.claim_kind {
            q = q.param("claim_kind", v.map(|value| value.as_str().to_string()));
        }
        if let Some(v) = patch.evidence_status {
            q = q.param("evidence_status", v.map(|value| value.as_str().to_string()));
        }
        if let Some(v) = patch.temporal_role {
            q = q.param("temporal_role", v.map(|value| value.as_str().to_string()));
        }
        if let Some(v) = patch.place_coverage {
            q = q.param("place_coverage", v.map(|value| value.as_str().to_string()));
        }
        if let Some(v) = patch.ql_form {
            q = q.param("ql_form", v.map(|value| value.as_str().to_string()));
        }
        if let Some(v) = patch.ql_unit_id {
            q = q.param("ql_unit_id", v);
        }
        if let Some(v) = patch.ql_arc {
            q = q.param("ql_arc", v.map(|value| value.as_str().to_string()));
        }
        if let Some(v) = patch.ql_topology {
            q = q.param("ql_topology", v.map(|value| value.as_str().to_string()));
        }
        if let Some(v) = patch.ql_schema_version {
            q = q.param("ql_schema_version", v);
        }
        if let Some(v) = patch.ql_source_coordinates {
            q = q.param("ql_source_coordinates", v);
        }
        if let Some(v) = patch.ql_completeness_status {
            q = q.param(
                "ql_completeness_status",
                v.map(|value| value.as_str().to_string()),
            );
        }
        if let Some(v) = patch.is_temporal {
            q = q.param("is_temporal", v);
        }
        if let Some(v) = patch.valid_from {
            q = q.param("valid_from", v);
        }
        if let Some(v) = patch.valid_to {
            q = q.param("valid_to", v);
        }
        if let Some(v) = patch.temporal_precision {
            q = q.param(
                "temporal_precision",
                v.map(|value| value.as_str().to_string()),
            );
        }

        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("update_node failed: {e}"))?;
        let row = rows
            .next()
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("update_node: no node with id {graph_node_id}"))?;
        let node: neo4rs::Node = row.get("n").map_err(|e| e.to_string())?;
        node_from_neo(node)
    }

    pub async fn delete_node(&self, graph_node_id: &str) -> Result<(), String> {
        let q = query("MATCH (n:TheoryNode {graph_node_id: $id}) DETACH DELETE n")
            .param("id", graph_node_id.to_string());
        self.graph
            .run_on(&self.database, q)
            .await
            .map_err(|e| format!("delete_node failed: {e}"))?;
        Ok(())
    }

    pub async fn upsert_seed_node(&self, input: &SeedGraphNode) -> Result<GraphNode, String> {
        if let Some(value) = input.temporal_precision.as_ref() {
            TemporalPrecision::try_from(value.clone())?;
        }
        let label = validate_entity_label(&input.entity_type)?;
        let cypher = format!(
            "MERGE (n:TheoryNode {{graph_node_id: $id}}) \
             SET n:{label}, \
                 n.title = $title, \
                 n.body = $body, \
                 n.summary = $summary, \
                 n.archetypal_resonance = $archetypal_resonance, \
                 n.coordinate = $coordinate, \
                 n.source_coordinates = $source_coordinates, \
                 n.evidence_tags = $evidence_tags, \
                 n.source_kind = $source_kind, \
                 n.is_temporal = $is_temporal, \
                 n.valid_from = $valid_from, \
                 n.valid_to = $valid_to, \
                 n.temporal_precision = $temporal_precision, \
                 n.created_at = coalesce(n.created_at, $now), \
                 n.updated_at = $now \
             RETURN n"
        );
        let q = query(&cypher)
            .param("id", input.graph_node_id.clone())
            .param("title", input.title.clone())
            .param("body", input.body.clone())
            .param("summary", input.summary.clone())
            .param("archetypal_resonance", input.archetypal_resonance.clone())
            .param("coordinate", input.coordinate.clone())
            .param("source_coordinates", input.source_coordinates.clone())
            .param("evidence_tags", input.evidence_tags.clone())
            .param("source_kind", input.source_kind.clone())
            .param("is_temporal", input.is_temporal)
            .param("valid_from", input.valid_from.clone())
            .param("valid_to", input.valid_to.clone())
            .param("temporal_precision", input.temporal_precision.clone())
            .param("now", now_rfc3339());
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("upsert_seed_node failed for {}: {e}", input.graph_node_id))?;
        let row = rows
            .next()
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| {
                format!(
                    "upsert_seed_node returned no row for {}",
                    input.graph_node_id
                )
            })?;
        let node: neo4rs::Node = row.get("n").map_err(|e| e.to_string())?;
        node_from_neo(node)
    }

    pub async fn list_nodes_for_lens(&self, lens: &str) -> Result<Vec<GraphNode>, String> {
        let cypher = match lens {
            "timeline" => "MATCH (n:TheoryNode) WHERE n.is_temporal = true RETURN n",
            "canvas" => "MATCH (n:TheoryNode) RETURN n",
            other => return Err(format!("unknown lens: {other}")),
        };
        let mut rows = self
            .graph
            .execute_on(&self.database, query(cypher))
            .await
            .map_err(|e| format!("list_nodes_for_lens failed: {e}"))?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            let node: neo4rs::Node = row.get("n").map_err(|e| e.to_string())?;
            out.push(node_from_neo(node)?);
        }
        Ok(out)
    }

    pub async fn get_nodes(&self, ids: &[String]) -> Result<Vec<GraphNode>, String> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let q = query("MATCH (n:TheoryNode) WHERE n.graph_node_id IN $ids RETURN n")
            .param("ids", ids.to_vec());
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("get_nodes failed: {e}"))?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            let node: neo4rs::Node = row.get("n").map_err(|e| e.to_string())?;
            out.push(node_from_neo(node)?);
        }
        Ok(out)
    }

    pub async fn connect_nodes(
        &self,
        source_graph_node_id: &str,
        target_graph_node_id: &str,
        rel_type: &str,
        properties: serde_json::Value,
    ) -> Result<GraphRelationship, String> {
        let rel = validate_rel_type(rel_type)?;
        // Properties is a flat JSON object; serialize to a JSON string and set via apoc-free map.
        let props_str = serde_json::to_string(&properties).map_err(|e| e.to_string())?;
        let cypher = format!(
            "MATCH (s:TheoryNode {{graph_node_id: $src}}), (t {{graph_node_id: $tgt}}) \
             CREATE (s)-[r:{rel}]->(t) \
             SET r += apoc.convert.fromJsonMap($props) \
             RETURN elementId(r) AS id, type(r) AS rel_type, \
                    s.graph_node_id AS src, t.graph_node_id AS tgt, $props AS props"
        );
        let q = query(&cypher)
            .param("src", source_graph_node_id.to_string())
            .param("tgt", target_graph_node_id.to_string())
            .param("props", props_str);
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("connect_nodes failed: {e}"))?;
        let row = rows
            .next()
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "connect_nodes: endpoints not found".to_string())?;
        relationship_from_row(&row, properties)
    }

    pub async fn merge_seed_relationship(
        &self,
        source_graph_node_id: &str,
        target_graph_node_id: &str,
        rel_type: &str,
        seed_key: &str,
        properties: serde_json::Value,
    ) -> Result<GraphRelationship, String> {
        let rel = validate_rel_type(rel_type)?;
        let props = properties
            .as_object()
            .ok_or_else(|| "relationship properties must be a JSON object".to_string())?;
        let props_str = serde_json::to_string(props).map_err(|e| e.to_string())?;
        let cypher = format!(
            "MATCH (s {{graph_node_id: $src}}), (t {{graph_node_id: $tgt}}) \
             MERGE (s)-[r:{rel} {{seed_key: $seed_key}}]->(t) \
             SET r += apoc.convert.fromJsonMap($props) \
             RETURN elementId(r) AS id, type(r) AS rel_type, \
                    s.graph_node_id AS src, t.graph_node_id AS tgt, \
                    apoc.convert.toJson(properties(r)) AS props"
        );
        let q = query(&cypher)
            .param("src", source_graph_node_id.to_string())
            .param("tgt", target_graph_node_id.to_string())
            .param("seed_key", seed_key.to_string())
            .param("props", props_str);
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("merge_seed_relationship failed: {e}"))?;
        let row = rows
            .next()
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "merge_seed_relationship: endpoints not found".to_string())?;
        let props_json: String = row.get("props").unwrap_or_else(|_| "{}".to_string());
        let merged_props =
            serde_json::from_str(&props_json).unwrap_or_else(|_| serde_json::json!({}));
        relationship_from_row(&row, merged_props)
    }

    pub async fn disconnect(&self, relationship_id: &str) -> Result<(), String> {
        let q = query("MATCH ()-[r]-() WHERE elementId(r) = $id DELETE r")
            .param("id", relationship_id.to_string());
        self.graph
            .run_on(&self.database, q)
            .await
            .map_err(|e| format!("disconnect failed: {e}"))?;
        Ok(())
    }

    pub async fn archetypal_lighting(
        &self,
        operator_graph_node_id: &str,
    ) -> Result<ArchetypalLightingResult, String> {
        let operator = self
            .get_node(operator_graph_node_id)
            .await?
            .ok_or_else(|| format!("operator not found: {operator_graph_node_id}"))?;
        let q = query(
            "MATCH (op {graph_node_id: $id}) \
             WHERE op:Archetype OR op:Dynamic OR op:PsychoidOperator \
             MATCH (inst:TheoryNode)-[r:INSTANTIATES|ECHOES]->(op) \
             WHERE inst.is_temporal = true \
             RETURN inst, type(r) AS relType, r.dominance AS dominance \
             ORDER BY inst.valid_from",
        )
        .param("id", operator_graph_node_id.to_string());
        let instances = self.collect_lit_instances(q, "inst").await?;
        Ok(ArchetypalLightingResult {
            operator,
            instances,
        })
    }

    pub async fn resonances_for_instance(
        &self,
        graph_node_id: &str,
    ) -> Result<Vec<LitInstance>, String> {
        let q = query(
            "MATCH (inst {graph_node_id: $id})-[r:INSTANTIATES|ECHOES|RESONATES_WITH]->(op) \
             WHERE op:Archetype OR op:Dynamic OR op:PsychoidOperator \
             RETURN op AS node, type(r) AS relType, r.dominance AS dominance",
        )
        .param("id", graph_node_id.to_string());
        self.collect_lit_instances(q, "node").await
    }

    pub async fn search(&self, query_text: &str, limit: i64) -> Result<Vec<GraphNode>, String> {
        let q = query(
            "CALL db.index.fulltext.queryNodes('theory_node_fulltext', $q) \
             YIELD node, score RETURN node ORDER BY score DESC LIMIT $limit",
        )
        .param("q", query_text.to_string())
        .param("limit", limit);
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("search failed: {e}"))?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            let node: neo4rs::Node = row.get("node").map_err(|e| e.to_string())?;
            out.push(node_from_neo(node)?);
        }
        Ok(out)
    }

    async fn collect_lit_instances(
        &self,
        q: neo4rs::Query,
        node_key: &str,
    ) -> Result<Vec<LitInstance>, String> {
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("lighting query failed: {e}"))?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            let node: neo4rs::Node = row.get(node_key).map_err(|e| e.to_string())?;
            let rel_type: String = row.get("relType").map_err(|e| e.to_string())?;
            let dominance: Option<String> = row.get("dominance").ok();
            out.push(LitInstance {
                node: node_from_neo(node)?,
                rel_type,
                dominance,
            });
        }
        Ok(out)
    }

    pub async fn list_relationships(&self) -> Result<Vec<GraphRelationship>, String> {
        let q = query(
            "MATCH (s:TheoryNode)-[r]->(t) \
             RETURN elementId(r) AS id, type(r) AS rel_type, \
                    s.graph_node_id AS src, t.graph_node_id AS tgt, \
                    apoc.convert.toJson(properties(r)) AS props",
        );
        self.collect_relationships(q).await
    }

    pub async fn relationships_for_node(
        &self,
        graph_node_id: &str,
    ) -> Result<Vec<GraphRelationship>, String> {
        let q = query(
            "MATCH (s)-[r]-(t) WHERE s.graph_node_id = $id \
             RETURN elementId(r) AS id, type(r) AS rel_type, \
                    startNode(r).graph_node_id AS src, endNode(r).graph_node_id AS tgt, \
                    apoc.convert.toJson(properties(r)) AS props",
        )
        .param("id", graph_node_id.to_string());
        self.collect_relationships(q).await
    }

    pub async fn seed_operators(&self, operators: &[OperatorSeed]) -> Result<usize, String> {
        for op in operators {
            let now = now_rfc3339();
            let q = query(
                "MERGE (n:Operator {coordinate: $coordinate}) \
                 SET n:PsychoidOperator, \
                     n.graph_node_id = coalesce(n.graph_node_id, $id), \
                     n.title = $title, \
                     n.operator_kind = $operator_kind, \
                     n.position = $position, \
                     n.source_coordinates = $source_coordinates, \
                     n.is_temporal = false, \
                     n.created_at = coalesce(n.created_at, $now), \
                     n.updated_at = $now",
            )
            .param("coordinate", op.coordinate.clone())
            .param("id", uuid::Uuid::new_v4().to_string())
            .param("title", op.title.clone())
            .param("operator_kind", op.operator_kind.clone())
            .param("position", op.position.clone())
            .param("source_coordinates", op.source_coordinates.clone())
            .param("now", now);
            self.graph
                .run_on(&self.database, q)
                .await
                .map_err(|e| format!("seed_operators failed for {}: {e}", op.coordinate))?;
        }
        Ok(operators.len())
    }

    async fn collect_relationships(
        &self,
        q: neo4rs::Query,
    ) -> Result<Vec<GraphRelationship>, String> {
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("relationship query failed: {e}"))?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            let props_json: String = row.get("props").unwrap_or_else(|_| "{}".to_string());
            let props: serde_json::Value =
                serde_json::from_str(&props_json).unwrap_or(serde_json::json!({}));
            out.push(relationship_from_row(&row, props)?);
        }
        Ok(out)
    }
}

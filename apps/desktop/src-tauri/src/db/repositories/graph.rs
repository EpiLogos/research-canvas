// apps/desktop/src-tauri/src/db/repositories/graph.rs
use serde::{Deserialize, Serialize};

pub(crate) use super::relationship_vocabulary::{
    canonical_relationship_key, canonicalize_relationship_properties, validate_rel_type,
};

macro_rules! controlled_string_enum {
    ($name:ident { $($variant:ident => $value:literal),+ $(,)? }) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
        pub enum $name {
            $(#[serde(rename = $value)] $variant),+
        }

        impl $name {
            pub const ALL: &'static [Self] = &[$(Self::$variant),+];
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
controlled_string_enum!(EntityType {
    Figure => "Figure", People => "People", Event => "Event", Institution => "Institution",
    Source => "Source", Claim => "Claim", Myth => "Myth", Interpretation => "Interpretation",
    Place => "Place", Work => "Work", Archetype => "Archetype", Dynamic => "Dynamic",
    Constellation => "Constellation", PsychoidOperator => "PsychoidOperator",
});

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub graph_node_id: String,
    pub entity_type: EntityType,
    pub title: String,
    pub body: String,
    pub summary: String,
    pub archetypal_resonance: Option<String>,
    pub coordinate: Option<String>,
    pub source_coordinates: Vec<String>,
    #[serde(default)]
    pub evidence_tags: Vec<String>,
    pub source_kind: Option<String>,
    pub content_origin: Option<ContentOrigin>,
    pub content_revision: Option<i64>,
    pub seed_schema_version: Option<i64>,
    #[serde(default)]
    pub body_source_coordinates: Vec<String>,
    pub historicity: Option<Historicity>,
    pub claim_kind: Option<ClaimKind>,
    pub evidence_status: Option<EvidenceStatus>,
    pub temporal_role: Option<TemporalRole>,
    pub place_coverage: Option<PlaceCoverage>,
    #[serde(default)]
    pub place: Option<serde_json::Value>,
    pub ql_form: Option<QlForm>,
    pub ql_unit_id: Option<String>,
    pub ql_arc: Option<QlArc>,
    pub ql_topology: Option<QlTopology>,
    pub ql_schema_version: Option<i64>,
    #[serde(default)]
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphContentCasInput {
    pub graph_node_id: String,
    pub expected_remote_revision: Option<i64>,
    pub expected_remote_origin: Option<ContentOrigin>,
    #[serde(default)]
    pub allow_legacy_null: bool,
    pub body: String,
    pub summary: String,
    pub content_origin: ContentOrigin,
    pub content_revision: i64,
    #[serde(default)]
    pub body_source_coordinates: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum GraphContentCasMutation {
    Updated,
    Missing,
    Conflict {
        current_remote_revision: Option<i64>,
        current_remote_origin: Option<ContentOrigin>,
        reason: String,
    },
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
    pub summary: Option<String>,
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
    pub place: Option<serde_json::Value>,
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
#[serde(deny_unknown_fields)]
pub struct GraphNodePatch {
    pub title: Option<String>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub archetypal_resonance: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub coordinate: Option<Option<String>>,
    pub source_coordinates: Option<Vec<String>>,
    pub evidence_tags: Option<Vec<String>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub source_kind: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_present_nullable")]
    pub seed_schema_version: Option<Option<i64>>,
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
    pub place: Option<Option<serde_json::Value>>,
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
    pub content_origin: ContentOrigin,
    pub content_revision: i64,
    pub seed_schema_version: i64,
    pub body_source_coordinates: Vec<String>,
    pub historicity: Option<Historicity>,
    pub claim_kind: Option<ClaimKind>,
    pub evidence_status: Option<EvidenceStatus>,
    pub temporal_role: Option<TemporalRole>,
    pub place_coverage: Option<PlaceCoverage>,
    pub place: Option<serde_json::Value>,
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
    pub temporal_precision: Option<String>,
}

use neo4rs::query;

#[derive(Clone)]
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
    "CREATE CONSTRAINT source_coordinate IF NOT EXISTS \
     FOR (n:Source) REQUIRE n.coordinate IS UNIQUE",
    "CREATE INDEX theory_node_title IF NOT EXISTS FOR (n:TheoryNode) ON (n.title)",
    "CREATE INDEX theory_node_is_temporal IF NOT EXISTS FOR (n:TheoryNode) ON (n.is_temporal)",
    "CREATE INDEX theory_node_valid_from IF NOT EXISTS FOR (n:TheoryNode) ON (n.valid_from)",
    "CREATE INDEX theory_node_coordinate IF NOT EXISTS FOR (n:TheoryNode) ON (n.coordinate)",
    "CREATE FULLTEXT INDEX theory_node_fulltext IF NOT EXISTS \
     FOR (n:TheoryNode) ON EACH [n.title, n.summary, n.archetypal_resonance]",
    "CREATE FULLTEXT INDEX theory_node_context_fulltext IF NOT EXISTS \
     FOR (n:TheoryNode) ON EACH [n.title, n.summary, n.archetypal_resonance, n.body]",
];

const CONTEXT_SEARCH_MAX_LIMIT: i64 = 100;

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

/// Neo4j stores controlled values as strings. This is the sole compatibility
/// boundary: absent properties become `None`, while present unknown values are
/// rejected with their property name instead of leaking into the typed API.
const JS_MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

fn has_neo_property(node: &neo4rs::Node, property: &str) -> bool {
    node.keys().contains(&property)
}

fn controlled_from_neo<T>(node: &neo4rs::Node, property: &str) -> Result<Option<T>, String>
where
    T: TryFrom<String, Error = String>,
{
    if !has_neo_property(node, property) {
        return Ok(None);
    }
    let value = node
        .get::<String>(property)
        .map_err(|error| format!("Neo4j property `{property}` has wrong type: {error}"))?;
    T::try_from(value)
        .map(Some)
        .map_err(|error| format!("invalid Neo4j property `{property}`: {error}"))
}

fn string_list_from_neo(node: &neo4rs::Node, property: &str) -> Result<Vec<String>, String> {
    if !has_neo_property(node, property) {
        return Ok(Vec::new());
    }
    node.get::<Vec<String>>(property)
        .map_err(|error| format!("Neo4j property `{property}` has wrong type: {error}"))
}

fn optional_string_from_neo(node: &neo4rs::Node, property: &str) -> Result<Option<String>, String> {
    if !has_neo_property(node, property) {
        return Ok(None);
    }
    node.get::<String>(property)
        .map(Some)
        .map_err(|error| format!("Neo4j property `{property}` has wrong type: {error}"))
}

fn optional_json_from_neo(
    node: &neo4rs::Node,
    property: &str,
) -> Result<Option<serde_json::Value>, String> {
    if !has_neo_property(node, property) {
        return Ok(None);
    }
    let raw = node
        .get::<String>(property)
        .map_err(|error| format!("Neo4j property `{property}` has wrong type: {error}"))?;
    serde_json::from_str(&raw)
        .map(Some)
        .map_err(|error| format!("Neo4j property `{property}` is not valid JSON: {error}"))
}

fn string_from_neo(
    node: &neo4rs::Node,
    property: &str,
    absent_default: Option<&str>,
) -> Result<String, String> {
    if !has_neo_property(node, property) {
        return absent_default
            .map(str::to_string)
            .ok_or_else(|| format!("required Neo4j property `{property}` is absent"));
    }
    node.get::<String>(property)
        .map_err(|error| format!("Neo4j property `{property}` has wrong type: {error}"))
}

fn bool_from_neo(
    node: &neo4rs::Node,
    property: &str,
    absent_default: bool,
) -> Result<bool, String> {
    if !has_neo_property(node, property) {
        return Ok(absent_default);
    }
    node.get::<bool>(property)
        .map_err(|error| format!("Neo4j property `{property}` has wrong type: {error}"))
}

fn revision_from_neo(node: &neo4rs::Node, property: &str) -> Result<Option<i64>, String> {
    if !has_neo_property(node, property) {
        return Ok(None);
    }
    // neo4rs 0.8 decodes tiny negative integers as unsigned bytes (-1 => 255),
    // so numeric storage cannot enforce the shared signed range losslessly.
    // Decimal strings preserve the exact token; legacy numerics fail closed.
    let raw = node.get::<String>(property).map_err(|_| {
        format!(
            "Neo4j property `{property}` must use canonical decimal-string storage; legacy numeric values require migration"
        )
    })?;
    let value = raw
        .parse::<i64>()
        .map_err(|error| format!("Neo4j property `{property}` is not a valid integer: {error}"))?;
    validate_contract_revision(property, value)?;
    Ok(Some(value))
}

pub fn validate_contract_revision(property: &str, value: i64) -> Result<(), String> {
    if !(0..=JS_MAX_SAFE_INTEGER).contains(&value) {
        return Err(format!(
            "{property} must be a nonnegative JavaScript-safe integer (0..={JS_MAX_SAFE_INTEGER}), got {value}"
        ));
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntityLabelResolutionError {
    pub labels: Vec<String>,
    pub recognized: Vec<EntityType>,
    pub unknown: Vec<String>,
}

impl std::fmt::Display for EntityLabelResolutionError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "entity labels must contain exactly one recognized semantic label; labels={:?}, recognized={:?}, unknown={:?}",
            self.labels, self.recognized, self.unknown
        )
    }
}

pub fn resolve_entity_type_from_labels(
    labels: &[String],
) -> Result<EntityType, EntityLabelResolutionError> {
    let mut recognized = Vec::new();
    let mut unknown = Vec::new();
    for label in labels {
        if matches!(label.as_str(), "TheoryNode" | "Operator") {
            continue;
        }
        match EntityType::try_from(label.clone()) {
            Ok(entity_type) => recognized.push(entity_type),
            Err(_) => unknown.push(label.clone()),
        }
    }
    recognized.sort_by_key(|entity_type| entity_type.as_str());
    recognized.dedup();
    unknown.sort();
    unknown.dedup();
    if recognized.len() == 1 && unknown.is_empty() {
        return Ok(recognized[0]);
    }
    Err(EntityLabelResolutionError {
        labels: labels.to_vec(),
        recognized,
        unknown,
    })
}

/// Build a GraphNode from a returned `n` node value plus its entity-type label.
fn node_from_neo(node: neo4rs::Node) -> Result<GraphNode, String> {
    let labels: Vec<String> = node.labels().iter().map(|s| s.to_string()).collect();
    let entity_type =
        resolve_entity_type_from_labels(&labels).map_err(|error| error.to_string())?;
    let source_coordinates = string_list_from_neo(&node, "source_coordinates")?;
    Ok(GraphNode {
        graph_node_id: string_from_neo(&node, "graph_node_id", None)?,
        entity_type,
        title: string_from_neo(&node, "title", Some(""))?,
        body: string_from_neo(&node, "body", Some("[]"))?,
        summary: string_from_neo(&node, "summary", Some(""))?,
        archetypal_resonance: optional_string_from_neo(&node, "archetypal_resonance")?,
        coordinate: optional_string_from_neo(&node, "coordinate")?,
        source_coordinates,
        evidence_tags: string_list_from_neo(&node, "evidence_tags")?,
        source_kind: optional_string_from_neo(&node, "source_kind")?,
        content_origin: controlled_from_neo(&node, "content_origin")?,
        content_revision: revision_from_neo(&node, "content_revision")?,
        seed_schema_version: revision_from_neo(&node, "seed_schema_version")?,
        body_source_coordinates: string_list_from_neo(&node, "body_source_coordinates")?,
        historicity: controlled_from_neo(&node, "historicity")?,
        claim_kind: controlled_from_neo(&node, "claim_kind")?,
        evidence_status: controlled_from_neo(&node, "evidence_status")?,
        temporal_role: controlled_from_neo(&node, "temporal_role")?,
        place_coverage: controlled_from_neo(&node, "place_coverage")?,
        place: optional_json_from_neo(&node, "place")?,
        ql_form: controlled_from_neo(&node, "ql_form")?,
        ql_unit_id: optional_string_from_neo(&node, "ql_unit_id")?,
        ql_arc: controlled_from_neo(&node, "ql_arc")?,
        ql_topology: controlled_from_neo(&node, "ql_topology")?,
        ql_schema_version: revision_from_neo(&node, "ql_schema_version")?,
        ql_source_coordinates: string_list_from_neo(&node, "ql_source_coordinates")?,
        ql_completeness_status: controlled_from_neo(&node, "ql_completeness_status")?,
        is_temporal: bool_from_neo(&node, "is_temporal", false)?,
        valid_from: optional_string_from_neo(&node, "valid_from")?,
        valid_to: optional_string_from_neo(&node, "valid_to")?,
        temporal_precision: controlled_from_neo(&node, "temporal_precision")?,
        created_at: string_from_neo(&node, "created_at", Some(""))?,
        updated_at: string_from_neo(&node, "updated_at", Some(""))?,
    })
}

fn validate_entity_label(entity_type: &str) -> Result<EntityType, String> {
    let entity_type = EntityType::try_from(entity_type.to_string())?;
    if entity_type == EntityType::PsychoidOperator {
        return Err("PsychoidOperator is reserved for the operator seeding path".to_string());
    }
    Ok(entity_type)
}

pub fn semantic_relabel_entity_types() -> &'static [EntityType] {
    EntityType::ALL
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
        for (property, value) in [
            ("contentRevision", metadata.content_revision),
            ("seedSchemaVersion", metadata.seed_schema_version),
            ("qlSchemaVersion", metadata.ql_schema_version),
        ] {
            if let Some(value) = value {
                validate_contract_revision(property, value)?;
            }
        }
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
        let label = validate_entity_label(&input.entity_type)?.as_str();
        let cypher = format!(
            "CREATE (n:TheoryNode:{label} {{
                graph_node_id: $id, title: $title, body: $body, summary: $summary,
                coordinate: $coordinate, source_coordinates: $source_coordinates,
                evidence_tags: $evidence_tags, source_kind: $source_kind,
                content_origin: $content_origin, content_revision: $content_revision,
                seed_schema_version: $seed_schema_version,
                body_source_coordinates: $body_source_coordinates,
                historicity: $historicity, claim_kind: $claim_kind,
                evidence_status: $evidence_status, temporal_role: $temporal_role,
                place_coverage: $place_coverage, place: $place, ql_form: $ql_form,
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
            .param("summary", metadata.summary.unwrap_or_default())
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
            .param(
                "content_revision",
                metadata.content_revision.map(|v| v.to_string()),
            )
            .param(
                "seed_schema_version",
                metadata.seed_schema_version.map(|v| v.to_string()),
            )
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
                "place",
                metadata.place.clone().map(|value| value.to_string()),
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
            .param(
                "ql_schema_version",
                metadata.ql_schema_version.map(|v| v.to_string()),
            )
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
        for (property, value) in [
            ("seedSchemaVersion", patch.seed_schema_version.flatten()),
            ("qlSchemaVersion", patch.ql_schema_version.flatten()),
        ] {
            if let Some(value) = value {
                validate_contract_revision(property, value)?;
            }
        }
        let mut sets: Vec<String> = vec!["n.updated_at = $now".to_string()];
        if patch.title.is_some() {
            sets.push("n.title = $title".into());
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
        if patch.seed_schema_version.is_some() {
            sets.push("n.seed_schema_version = $seed_schema_version".into());
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
        if patch.place.is_some() {
            sets.push("n.place = $place".into());
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
        if let Some(v) = patch.seed_schema_version {
            q = q.param("seed_schema_version", v.map(|value| value.to_string()));
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
        if let Some(v) = patch.place {
            q = q.param("place", v.map(|value| value.to_string()));
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
            q = q.param("ql_schema_version", v.map(|value| value.to_string()));
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

    pub async fn add_evidence_tag(
        &self,
        graph_node_id: &str,
        tag: &str,
    ) -> Result<Option<(GraphNode, bool)>, String> {
        let q = query(
            "MATCH (n:TheoryNode {graph_node_id: $id})
             SET n.__agent_tag_lock = $marker
             WITH n, NOT $tag IN coalesce(n.evidence_tags, []) AS added
             SET n.evidence_tags = CASE
                    WHEN added THEN coalesce(n.evidence_tags, []) + $tag
                    ELSE coalesce(n.evidence_tags, [])
                 END,
                 n.updated_at = CASE WHEN added THEN $now ELSE n.updated_at END
             REMOVE n.__agent_tag_lock
             RETURN n, added",
        )
        .param("id", graph_node_id.to_string())
        .param("tag", tag.to_string())
        .param("now", now_rfc3339())
        .param("marker", uuid::Uuid::new_v4().to_string());
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("add_evidence_tag failed: {e}"))?;
        let Some(row) = rows.next().await.map_err(|e| e.to_string())? else {
            return Ok(None);
        };
        let node: neo4rs::Node = row.get("n").map_err(|e| e.to_string())?;
        let added: bool = row.get("added").map_err(|e| e.to_string())?;
        Ok(Some((node_from_neo(node)?, added)))
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

    /// Compare-and-swap boundary for body content. Generic `update_node`
    /// remains available for non-content metadata, but editors must use this
    /// operation so a stale client can never overwrite newer remote prose.
    pub async fn compare_and_swap_content(
        &self,
        input: &GraphContentCasInput,
    ) -> Result<GraphContentCasMutation, String> {
        validate_contract_revision("contentRevision", input.content_revision)?;
        let expected_condition = match (
            input.expected_remote_revision,
            input.expected_remote_origin,
            input.allow_legacy_null,
        ) {
            (Some(revision), Some(_), false) => {
                validate_contract_revision("expectedRemoteRevision", revision)?;
                if input.content_revision <= revision {
                    return Err("contentRevision must advance beyond expectedRemoteRevision".into());
                }
                "toString(n.content_revision) = $expected_revision AND n.content_origin = $expected_origin"
            }
            (None, None, true) => {
                "n.content_revision IS NULL AND n.content_origin IS NULL"
            }
            (Some(_), Some(_), true) => {
                return Err("allowLegacyNull requires both expected remote fields to be null".into())
            }
            _ => return Err("expectedRemoteRevision and expectedRemoteOrigin must both be supplied; legacy null requires allowLegacyNull=true".into()),
        };
        let cypher = format!(
            "OPTIONAL MATCH (n:TheoryNode {{graph_node_id: $id}}) \
             WITH n, n.content_revision AS old_revision, n.content_origin AS old_origin, \
                  coalesce(({expected_condition}), false) AS can_update \
             FOREACH (_ IN CASE WHEN can_update THEN [1] ELSE [] END | \
               SET n.body=$body, n.summary=$summary, n.content_origin=$content_origin, \
                   n.content_revision=$content_revision, n.body_source_coordinates=$body_sources, \
                   n.updated_at=$now) \
             RETURN n IS NOT NULL AS exists, can_update AS updated, \
                    coalesce(toString(old_revision), '') AS current_revision, \
                    coalesce(old_origin, '') AS current_origin"
        );
        let mut query = neo4rs::query(&cypher)
            .param("id", input.graph_node_id.clone())
            .param("body", input.body.clone())
            .param("summary", input.summary.clone())
            .param("content_origin", input.content_origin.as_str())
            .param("content_revision", input.content_revision.to_string())
            .param("body_sources", input.body_source_coordinates.clone())
            .param("now", now_rfc3339());
        if let (Some(revision), Some(origin)) =
            (input.expected_remote_revision, input.expected_remote_origin)
        {
            query = query
                .param("expected_revision", revision.to_string())
                .param("expected_origin", origin.as_str());
        }
        let mut rows = self
            .graph
            .execute_on(&self.database, query)
            .await
            .map_err(|error| format!("content compare-and-swap failed: {error}"))?;
        let row = rows
            .next()
            .await
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "content compare-and-swap returned no status row".to_string())?;
        let exists: bool = row.get("exists").map_err(|error| error.to_string())?;
        if !exists {
            return Ok(GraphContentCasMutation::Missing);
        }
        let updated: bool = row.get("updated").map_err(|error| error.to_string())?;
        if updated {
            return Ok(GraphContentCasMutation::Updated);
        }
        let raw_revision: String = row
            .get("current_revision")
            .map_err(|error| error.to_string())?;
        let current_revision = if raw_revision.is_empty() {
            None
        } else {
            Some(
                raw_revision
                    .parse::<i64>()
                    .map_err(|_| format!("invalid remote content revision {raw_revision:?}"))?,
            )
        };
        let raw_origin: String = row
            .get("current_origin")
            .map_err(|error| error.to_string())?;
        let current_origin = if raw_origin.is_empty() {
            None
        } else {
            Some(ContentOrigin::try_from(raw_origin)?)
        };
        Ok(GraphContentCasMutation::Conflict {
            current_remote_revision: current_revision,
            current_remote_origin: current_origin,
            reason: "remote content revision or ownership no longer matches".into(),
        })
    }

    pub async fn upsert_seed_node(&self, input: &SeedGraphNode) -> Result<GraphNode, String> {
        validate_contract_revision("contentRevision", input.content_revision)?;
        validate_contract_revision("seedSchemaVersion", input.seed_schema_version)?;
        if let Some(value) = input.ql_schema_version {
            validate_contract_revision("qlSchemaVersion", value)?;
        }
        if let Some(value) = input.temporal_precision.as_ref() {
            TemporalPrecision::try_from(value.clone())?;
        }
        let label = validate_entity_label(&input.entity_type)?.as_str();
        let remove_labels = semantic_relabel_entity_types()
            .iter()
            .map(|entity_type| entity_type.as_str())
            .collect::<Vec<_>>()
            .join(":");
        let cypher = format!(
            "MERGE (n:TheoryNode {{graph_node_id: $id}}) \
             ON CREATE SET n.title = $title, n.body = $body, n.summary = $summary, \
                 n.archetypal_resonance = $archetypal_resonance, \
                 n.coordinate = $coordinate, \
                 n.source_coordinates = $source_coordinates, \
                 n.evidence_tags = $evidence_tags, \
                 n.source_kind = $source_kind, \
                 n.content_origin = $content_origin, \
                 n.content_revision = $content_revision, \
                 n.seed_schema_version = $seed_schema_version, \
                 n.body_source_coordinates = $body_source_coordinates, \
                 n.historicity = $historicity, \
                 n.claim_kind = $claim_kind, \
                 n.evidence_status = $evidence_status, \
                 n.temporal_role = $temporal_role, \
                 n.place_coverage = $place_coverage, \
                 n.place = $place, \
                 n.ql_form = $ql_form, n.ql_unit_id = $ql_unit_id, \
                 n.ql_arc = $ql_arc, n.ql_topology = $ql_topology, \
                 n.ql_schema_version = $ql_schema_version, \
                 n.ql_source_coordinates = $ql_source_coordinates, \
                 n.ql_completeness_status = $ql_completeness_status, \
                 n.is_temporal = $is_temporal, \
                 n.valid_from = $valid_from, \
                 n.valid_to = $valid_to, \
                 n.temporal_precision = $temporal_precision, \
                 n.created_at = $now, n.updated_at = $now \
             WITH n, (n.content_origin = 'seed' AND toInteger($content_revision) > coalesce(toInteger(n.content_revision), -1)) AS newer_seed \
             SET n.title = CASE WHEN newer_seed THEN $title ELSE n.title END, \
                 n.body = CASE WHEN newer_seed THEN $body ELSE n.body END, n.summary = CASE WHEN newer_seed THEN $summary ELSE n.summary END, \
                 n.archetypal_resonance = CASE WHEN newer_seed THEN $archetypal_resonance ELSE n.archetypal_resonance END, \
                 n.coordinate = CASE WHEN newer_seed THEN $coordinate ELSE n.coordinate END, \
                 n.source_coordinates = CASE WHEN newer_seed THEN $source_coordinates ELSE n.source_coordinates END, \
                 n.evidence_tags = CASE WHEN newer_seed THEN $evidence_tags ELSE n.evidence_tags END, \
                 n.source_kind = CASE WHEN newer_seed THEN $source_kind ELSE n.source_kind END, \
                 n.body_source_coordinates = CASE WHEN newer_seed THEN $body_source_coordinates ELSE n.body_source_coordinates END, \
                 n.historicity = CASE WHEN newer_seed THEN $historicity ELSE n.historicity END, \
                 n.claim_kind = CASE WHEN newer_seed THEN $claim_kind ELSE n.claim_kind END, \
                 n.evidence_status = CASE WHEN newer_seed THEN $evidence_status ELSE n.evidence_status END, \
                 n.temporal_role = CASE WHEN newer_seed THEN $temporal_role ELSE n.temporal_role END, \
                 n.place_coverage = CASE WHEN newer_seed THEN $place_coverage ELSE n.place_coverage END, \
                 n.place = CASE WHEN newer_seed THEN $place ELSE n.place END, \
                 n.ql_form = CASE WHEN newer_seed THEN $ql_form ELSE n.ql_form END, n.ql_unit_id = CASE WHEN newer_seed THEN $ql_unit_id ELSE n.ql_unit_id END, \
                 n.ql_arc = CASE WHEN newer_seed THEN $ql_arc ELSE n.ql_arc END, n.ql_topology = CASE WHEN newer_seed THEN $ql_topology ELSE n.ql_topology END, \
                 n.ql_schema_version = CASE WHEN newer_seed THEN $ql_schema_version ELSE n.ql_schema_version END, \
                 n.ql_source_coordinates = CASE WHEN newer_seed THEN $ql_source_coordinates ELSE n.ql_source_coordinates END, \
                 n.ql_completeness_status = CASE WHEN newer_seed THEN $ql_completeness_status ELSE n.ql_completeness_status END, \
                 n.is_temporal = CASE WHEN newer_seed THEN $is_temporal ELSE n.is_temporal END, \
                 n.valid_from = CASE WHEN newer_seed THEN $valid_from ELSE n.valid_from END, n.valid_to = CASE WHEN newer_seed THEN $valid_to ELSE n.valid_to END, \
                 n.temporal_precision = CASE WHEN newer_seed THEN $temporal_precision ELSE n.temporal_precision END, \
                 n.seed_schema_version = CASE WHEN newer_seed THEN $seed_schema_version ELSE n.seed_schema_version END, \
                 n.content_revision = CASE WHEN newer_seed THEN $content_revision ELSE n.content_revision END, \
                 n.updated_at = CASE WHEN newer_seed THEN $now ELSE n.updated_at END \
             REMOVE n:{remove_labels} \
             SET n:{label} \
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
            .param("content_origin", input.content_origin.as_str())
            .param("content_revision", input.content_revision.to_string())
            .param("seed_schema_version", input.seed_schema_version.to_string())
            .param(
                "body_source_coordinates",
                input.body_source_coordinates.clone(),
            )
            .param("historicity", input.historicity.map(|v| v.as_str()))
            .param("claim_kind", input.claim_kind.map(|v| v.as_str()))
            .param("evidence_status", input.evidence_status.map(|v| v.as_str()))
            .param("temporal_role", input.temporal_role.map(|v| v.as_str()))
            .param("place_coverage", input.place_coverage.map(|v| v.as_str()))
            .param("place", input.place.clone().map(|value| value.to_string()))
            .param("ql_form", input.ql_form.map(|v| v.as_str()))
            .param("ql_unit_id", input.ql_unit_id.clone())
            .param("ql_arc", input.ql_arc.map(|v| v.as_str()))
            .param("ql_topology", input.ql_topology.map(|v| v.as_str()))
            .param(
                "ql_schema_version",
                input.ql_schema_version.map(|v| v.to_string()),
            )
            .param("ql_source_coordinates", input.ql_source_coordinates.clone())
            .param(
                "ql_completeness_status",
                input.ql_completeness_status.map(|v| v.as_str()),
            )
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
        let properties = relationship_properties_with_canonical_key(
            source_graph_node_id,
            target_graph_node_id,
            rel,
            properties,
        )?;
        let canonical_key = canonical_relationship_key(
            source_graph_node_id,
            target_graph_node_id,
            rel,
            &properties,
        );
        // Properties are a JSON object; serialize to an APOC map after adding
        // the durable canonical key used to reconcile local and remote copies.
        let props_str = serde_json::to_string(&properties).map_err(|e| e.to_string())?;
        let cypher = format!(
            "MATCH (s:TheoryNode {{graph_node_id: $src}}), (t {{graph_node_id: $tgt}}) \
             MERGE (s)-[r:{rel} {{canonicalKey: $canonical_key}}]->(t) \
             SET r += apoc.convert.fromJsonMap($props) \
             RETURN elementId(r) AS id, type(r) AS rel_type, \
                    s.graph_node_id AS src, t.graph_node_id AS tgt, $props AS props"
        );
        let q = query(&cypher)
            .param("src", source_graph_node_id.to_string())
            .param("tgt", target_graph_node_id.to_string())
            .param("canonical_key", canonical_key)
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

    /// Idempotently materialize a vault file as a typed `Source` node.  This
    /// is intentionally a narrow agent boundary: it never goes through the
    /// generic patch API and therefore cannot rewrite authored document body
    /// ownership or revisions.
    pub async fn ensure_vault_source_node(
        &self,
        canonical_path: &str,
        title: &str,
    ) -> Result<(GraphNode, bool), String> {
        let generated_id = uuid::Uuid::new_v4().to_string();
        let coordinate = format!("vault-file:{canonical_path}");
        let now = now_rfc3339();
        let q = query(
            "MERGE (n:TheoryNode:Source {coordinate: $coordinate}) \
             ON CREATE SET n.graph_node_id = $id, n.title = $title, n.body = '[]', \
                n.summary = '', n.source_coordinates = [$coordinate], \
                n.evidence_tags = [], n.source_kind = 'vault-file', \
                n.is_temporal = false, n.created_at = $now, n.updated_at = $now \
             RETURN n, n.graph_node_id = $id AS created",
        )
        .param("coordinate", coordinate)
        .param("id", generated_id)
        .param("title", title.to_string())
        .param("now", now);
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|error| format!("ensure_vault_source_node failed: {error}"))?;
        let row = rows
            .next()
            .await
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "ensure_vault_source_node returned no row".to_string())?;
        let node: neo4rs::Node = row.get("n").map_err(|error| error.to_string())?;
        let created: bool = row.get("created").map_err(|error| error.to_string())?;
        Ok((node_from_neo(node)?, created))
    }

    /// Create one evidence edge per node/source/path.  Quotes and notes are
    /// first-write evidence, so a repeated curation request cannot multiply
    /// relationships or silently overwrite an earlier citation.
    pub async fn ensure_sourced_from_relationship(
        &self,
        source_graph_node_id: &str,
        target_graph_node_id: &str,
        source_path: &str,
        quote: &str,
        note: &str,
    ) -> Result<(GraphRelationship, bool), String> {
        let marker = uuid::Uuid::new_v4().to_string();
        let canonical_key = format!(
            "source:{}\u{1f}{}\u{1f}SOURCED_FROM\u{1f}{source_path}",
            source_graph_node_id, target_graph_node_id
        );
        let q = query(
            "MATCH (s:TheoryNode {graph_node_id: $src}), (t:TheoryNode {graph_node_id: $tgt}) \
             MERGE (s)-[r:SOURCED_FROM {sourcePath: $source_path}]->(t) \
             ON CREATE SET r.quote = $quote, r.note = $note, r.canonicalKey = $canonical_key, r.__agent_created = $marker \
             WITH s, t, r, coalesce(r.__agent_created = $marker, false) AS created \
             REMOVE r.__agent_created \
             RETURN elementId(r) AS id, type(r) AS rel_type, \
                    s.graph_node_id AS src, t.graph_node_id AS tgt, \
                    apoc.convert.toJson(properties(r)) AS props, created",
        )
        .param("src", source_graph_node_id.to_string())
        .param("tgt", target_graph_node_id.to_string())
        .param("source_path", source_path.to_string())
        .param("quote", quote.to_string())
        .param("note", note.to_string())
        .param("canonical_key", canonical_key)
        .param("marker", marker);
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|error| format!("ensure_sourced_from_relationship failed: {error}"))?;
        let row = rows
            .next()
            .await
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "ensure_sourced_from_relationship: endpoints not found".to_string())?;
        let props_json: String = row.get("props").unwrap_or_else(|_| "{}".to_string());
        let properties =
            serde_json::from_str(&props_json).unwrap_or_else(|_| serde_json::json!({}));
        let relationship = relationship_from_row(&row, properties)?;
        let created: bool = row.get("created").map_err(|error| error.to_string())?;
        Ok((relationship, created))
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

    /// Deletes a remotely projected edge by its semantic contract, never by a
    /// locally generated SQLite id. The caller already removed the local
    /// authoritative row; an unavailable or stale remote is deliberately
    /// non-fatal at that boundary.
    pub async fn disconnect_by_canonical_relationship(
        &self,
        relationship: &GraphRelationship,
    ) -> Result<(), String> {
        let rel = validate_rel_type(&relationship.rel_type)?;
        let canonical_key = canonical_relationship_key(
            &relationship.source_graph_node_id,
            &relationship.target_graph_node_id,
            rel,
            &relationship.properties,
        );
        let cypher = format!(
            "MATCH (s:TheoryNode {{graph_node_id: $src}})-[r:{rel}]->(t:TheoryNode {{graph_node_id: $tgt}}) \
             WHERE coalesce(r.canonicalKey, r.canonical_key, r.seed_key) = $canonical_key \
             DELETE r"
        );
        self.graph
            .run_on(
                &self.database,
                query(&cypher)
                    .param("src", relationship.source_graph_node_id.clone())
                    .param("tgt", relationship.target_graph_node_id.clone())
                    .param("canonical_key", canonical_key),
            )
            .await
            .map_err(|error| format!("disconnect_by_canonical_relationship failed: {error}"))?;
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

    pub async fn search_context(
        &self,
        query_text: &str,
        limit: i64,
    ) -> Result<Vec<GraphNode>, String> {
        let Some(limit) = Self::normalize_context_search_limit(limit) else {
            return Ok(Vec::new());
        };
        let Some(query_text) = Self::context_fulltext_query(query_text) else {
            return Ok(Vec::new());
        };
        let q = query(
            "CALL db.index.fulltext.queryNodes('theory_node_context_fulltext', $q) \
             YIELD node, score RETURN node ORDER BY score DESC LIMIT $limit",
        )
        .param("q", query_text)
        .param("limit", limit);
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("search_context failed: {e}"))?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            let node: neo4rs::Node = row.get("node").map_err(|e| e.to_string())?;
            out.push(node_from_neo(node)?);
        }
        Ok(out)
    }

    fn normalize_context_search_limit(limit: i64) -> Option<i64> {
        if limit <= 0 {
            None
        } else {
            Some(limit.min(CONTEXT_SEARCH_MAX_LIMIT))
        }
    }

    fn context_fulltext_query(query_text: &str) -> Option<String> {
        let terms: Vec<String> = query_text
            .split(|character: char| !character.is_alphanumeric())
            .map(str::trim)
            .map(|term| term.to_ascii_lowercase())
            .filter(|term| !term.is_empty() && !matches!(term.as_str(), "and" | "or" | "not"))
            .collect();
        if terms.is_empty() {
            None
        } else {
            Some(terms.join(" "))
        }
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

    /// Queries only the relationship neighbourhood required by a displayed
    /// timeline. This avoids a global graph scan and preserves links where
    /// exactly one endpoint is temporal (Event → Archetype/Constellation).
    pub async fn relationships_involving(
        &self,
        graph_node_ids: &[String],
    ) -> Result<Vec<GraphRelationship>, String> {
        if graph_node_ids.is_empty() {
            return Ok(Vec::new());
        }
        let q = query(RELATIONSHIPS_INVOLVING_CYPHER).param("ids", graph_node_ids.to_vec());
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

const RELATIONSHIPS_INVOLVING_CYPHER: &str = "MATCH (s)-[r]->(t) \
     WHERE s.graph_node_id IN $ids OR t.graph_node_id IN $ids \
     RETURN elementId(r) AS id, type(r) AS rel_type, \
            s.graph_node_id AS src, t.graph_node_id AS tgt, \
            apoc.convert.toJson(properties(r)) AS props";

/// Generic graph writes use Neo4j's element id for addressing only. Persist a
/// semantic identity too, so a later SQLite projection can reconcile that
/// edge with an offline or seeded copy across storage engines.
fn relationship_properties_with_canonical_key(
    source_graph_node_id: &str,
    target_graph_node_id: &str,
    rel_type: &str,
    properties: serde_json::Value,
) -> Result<serde_json::Value, String> {
    canonicalize_relationship_properties(
        source_graph_node_id,
        target_graph_node_id,
        rel_type,
        properties,
    )
}

#[cfg(test)]
mod tests {
    use super::{
        relationship_properties_with_canonical_key, GraphRepository, RELATIONSHIPS_INVOLVING_CYPHER,
    };

    #[test]
    fn context_search_query_drops_lucene_syntax_and_empty_queries() {
        assert_eq!(
            GraphRepository::context_fulltext_query("\"body-only:(term"),
            Some("body only term".to_string())
        );
        assert_eq!(
            GraphRepository::context_fulltext_query("foo OR bar AND NOT baz"),
            Some("foo bar baz".to_string())
        );
        assert_eq!(
            GraphRepository::context_fulltext_query("+-&&||!(){}[]^~*?:\\/"),
            None
        );
        assert_eq!(GraphRepository::context_fulltext_query("AND OR NOT"), None);
    }

    #[test]
    fn context_search_limit_is_positive_and_bounded() {
        assert_eq!(GraphRepository::normalize_context_search_limit(-1), None);
        assert_eq!(GraphRepository::normalize_context_search_limit(0), None);
        assert_eq!(
            GraphRepository::normalize_context_search_limit(25),
            Some(25)
        );
        assert_eq!(
            GraphRepository::normalize_context_search_limit(500),
            Some(100)
        );
    }

    #[test]
    fn timeline_relationship_query_is_endpoint_scoped_not_a_global_graph_scan() {
        assert!(RELATIONSHIPS_INVOLVING_CYPHER.contains("s.graph_node_id IN $ids"));
        assert!(RELATIONSHIPS_INVOLVING_CYPHER.contains("t.graph_node_id IN $ids"));
        assert!(!RELATIONSHIPS_INVOLVING_CYPHER.contains("MATCH (s:TheoryNode)-[r]->(t)"));
    }

    #[test]
    fn generic_relationship_writes_persist_a_stable_key_without_overriding_seed_identity() {
        let generic = relationship_properties_with_canonical_key(
            "event-1888",
            "archetype-antichrist",
            "INSTANTIATES",
            serde_json::json!({"reading": "expression"}),
        )
        .expect("normalise generic relationship properties");
        assert_eq!(
            generic["canonicalKey"],
            "edge:event-1888\u{1f}archetype-antichrist\u{1f}INSTANTIATES"
        );

        let seed = relationship_properties_with_canonical_key(
            "root-field",
            "ql-unit",
            "NESTS",
            serde_json::json!({"seed_key": "root:field:NESTS:ql-unit"}),
        )
        .expect("normalise seed relationship properties");
        assert_eq!(seed["seed_key"], "root:field:NESTS:ql-unit");
        assert!(seed.get("canonicalKey").is_none());
    }
}

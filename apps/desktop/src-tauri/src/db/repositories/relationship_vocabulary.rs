use serde_json::Value;

/// One semantic vocabulary for root seeding, Neo4j writes, and the local
/// SQLite projection. The migration runner materialises this exact list in
/// the SQLite CHECK constraint so the three boundaries cannot drift.
pub const RELATIONSHIP_TYPES: &[&str] = &[
    "CONTAINS",
    "PART_OF",
    "NESTS",
    "INSTANTIATES",
    "ECHOES",
    "CAUSES",
    "INFLUENCES",
    "OPPOSES",
    "INHERITS",
    "TRANSFORMS_INTO",
    "LOCATED_AT",
    "SOURCED_FROM",
    "SUPPORTS",
    "QUALIFIES",
    "CONTESTS",
    "RESONATES_WITH",
    "UNCLASSIFIED_RESEARCH_CONNECTION",
];

pub fn validate_rel_type(rel_type: &str) -> Result<&str, String> {
    RELATIONSHIP_TYPES
        .iter()
        .find(|candidate| **candidate == rel_type)
        .copied()
        .ok_or_else(|| format!("unknown rel_type: {rel_type}"))
}

pub fn sqlite_check_values() -> String {
    RELATIONSHIP_TYPES
        .iter()
        .map(|rel_type| format!("'{rel_type}'"))
        .collect::<Vec<_>>()
        .join(",")
}

/// Produces a durable identity independent of Neo4j's element id. Seed and
/// authored writes carry an explicit key; old edges fall back to their stable
/// semantic endpoints and type rather than a storage-address surrogate.
pub fn canonical_relationship_key(
    source_graph_node_id: &str,
    target_graph_node_id: &str,
    rel_type: &str,
    properties: &Value,
) -> String {
    for property_name in ["canonicalKey", "canonical_key", "seed_key"] {
        if let Some(value) = properties.get(property_name).and_then(Value::as_str) {
            if !value.trim().is_empty() {
                return value.to_string();
            }
        }
    }
    format!(
        "edge:{}\u{1f}{}\u{1f}{rel_type}",
        source_graph_node_id, target_graph_node_id
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn structural_relationships_share_the_canonical_vocabulary() {
        for structural in ["NESTS", "PART_OF"] {
            assert_eq!(validate_rel_type(structural), Ok(structural));
        }
        assert!(sqlite_check_values().contains("'NESTS'"));
        assert!(sqlite_check_values().contains("'PART_OF'"));
    }

    #[test]
    fn canonical_key_prefers_seed_and_authored_keys_over_storage_identity() {
        assert_eq!(
            canonical_relationship_key(
                "event",
                "archetype",
                "INSTANTIATES",
                &serde_json::json!({"seed_key": "root:event:INSTANTIATES:archetype"}),
            ),
            "root:event:INSTANTIATES:archetype",
        );
        assert_eq!(
            canonical_relationship_key(
                "event",
                "archetype",
                "INSTANTIATES",
                &serde_json::json!({})
            ),
            "edge:event\u{1f}archetype\u{1f}INSTANTIATES",
        );
    }
}

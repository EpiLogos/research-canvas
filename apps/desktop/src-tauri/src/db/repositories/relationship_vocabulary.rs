use serde_json::Value;
use sha2::{Digest, Sha256};

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

/// Validates and materialises the durable semantic key carried by a generic
/// local or remote relationship write. Seed keys remain the canonical key;
/// writes without an explicit key receive a stable endpoint/type key.
pub fn canonicalize_relationship_properties(
    source_graph_node_id: &str,
    target_graph_node_id: &str,
    rel_type: &str,
    properties: Value,
) -> Result<Value, String> {
    let mut properties = properties
        .as_object()
        .cloned()
        .ok_or_else(|| "relationship properties must be a JSON object".to_string())?;
    let mut supplied_key: Option<String> = None;
    for property_name in ["canonicalKey", "canonical_key", "seed_key"] {
        let Some(value) = properties.get(property_name) else {
            continue;
        };
        let value = value
            .as_str()
            .ok_or_else(|| format!("relationship properties.{property_name} must be a string"))?;
        if value.trim().is_empty() {
            return Err(format!(
                "relationship properties.{property_name} must not be blank"
            ));
        }
        if let Some(existing) = supplied_key.as_deref() {
            if existing != value {
                return Err("relationship properties contain conflicting canonical keys".into());
            }
        } else {
            supplied_key = Some(value.to_string());
        }
    }
    if supplied_key.is_none() {
        properties.insert(
            "canonicalKey".into(),
            Value::String(canonical_relationship_key(
                source_graph_node_id,
                target_graph_node_id,
                rel_type,
                &Value::Object(properties.clone()),
            )),
        );
    }
    Ok(Value::Object(properties))
}

/// Local row ids must be safe SQLite identifiers while retaining a durable,
/// collision-resistant identity derived from the semantic canonical key. A
/// full SHA-256 digest is deterministic across restarts and avoids a trivial
/// collision surface for user-supplied canonical keys.
pub fn durable_relationship_id(canonical_key: &str) -> String {
    format!(
        "relationship:{:x}",
        Sha256::digest(canonical_key.as_bytes())
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

    #[test]
    fn durable_local_id_is_a_sha256_digest_and_repeatable_for_one_canonical_edge() {
        let canonical_key = "edge:event\u{1f}archetype\u{1f}INSTANTIATES";
        let relationship_id = durable_relationship_id(canonical_key);
        assert_eq!(relationship_id, durable_relationship_id(canonical_key));
        let digest = relationship_id
            .strip_prefix("relationship:")
            .expect("stable local relationship prefix");
        assert_eq!(digest.len(), 64, "full SHA-256 hex digest");
        assert!(digest.bytes().all(|byte| byte.is_ascii_hexdigit()));
    }

    #[test]
    fn canonical_properties_reject_invalid_or_conflicting_explicit_keys() {
        assert!(canonicalize_relationship_properties(
            "event",
            "archetype",
            "INSTANTIATES",
            serde_json::json!({"canonicalKey": 12}),
        )
        .is_err());
        assert!(canonicalize_relationship_properties(
            "event",
            "archetype",
            "INSTANTIATES",
            serde_json::json!({"canonicalKey": "a", "seed_key": "b"}),
        )
        .is_err());
        assert_eq!(
            canonicalize_relationship_properties(
                "event",
                "archetype",
                "INSTANTIATES",
                serde_json::json!({}),
            )
            .expect("derive generic key")["canonicalKey"],
            "edge:event\u{1f}archetype\u{1f}INSTANTIATES"
        );
    }
}

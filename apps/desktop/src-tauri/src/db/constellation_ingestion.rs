// Constellation ingestion (refinement-2 D11 + D12, ticket #27).
//
// General ingestion design — not an Antichrist-specific one. Two source
// families route through the same derivation boundary:
//   - raw source files (documents, transcripts, recordings, images)
//   - agent work (chats and agent-produced structure in the terminal)
//
// The raw corpus is canonical and agent-immutable: derivation only READS source
// files. Every derived constellation carries passage-level provenance
// (text_span offsets anchored to the actual file bytes) back to the raw
// passages it was read from.
//
// Projects ARE constellations (task #24, D7). Ingesting a constellation creates
// the project row (the ingestion context, via ConstellationRepository), the
// constellation record (constellations metadata table), and — when a graph
// repository is supplied — the constellation's graph node plus the ENCAPSULATES
// edges to its members (D12).
//
// Agent harnesses plug in through the documented seams (docs/agents/
// constellation-ingestion.md): the tmux terminal session, skill packages, and
// lifecycle hooks — harness-agnostic by design.

use rusqlite::Connection;
use serde_json::{json, Value};

use crate::db::repositories::{
    graph::{
        ContentOrigin, GraphRepository, NewGraphNode, NewGraphNodeMetadata, ENCAPSULATES_MODE_OUTGOING,
    },
    ConstellationKind, ConstellationMetaRepository, ConstellationRecord, ConstellationRepository,
};

/// Source-family classification for the raw corpus artifact being parsed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceKind {
    Document,
    Transcript,
    Recording,
    Image,
    Chat,
}

impl SourceKind {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Document => "document",
            Self::Transcript => "transcript",
            Self::Recording => "recording",
            Self::Image => "image",
            Self::Chat => "chat",
        }
    }
}

/// The raw-source input to a derivation. `source_path` is a real file on disk
/// (read-only); the derived constellation is written to SQLite + graph stores.
#[derive(Debug, Clone)]
pub struct ConstellationIngestionInput {
    pub profile_scope: String,
    pub kind: ConstellationKind,
    pub title: String,
    pub slug: String,
    pub parent_constellation_id: Option<String>,
    /// Raw corpus path (canonical, agent-immutable). Only read, never written.
    pub source_path: String,
    pub source_kind: SourceKind,
    /// The QL/MEF parse output: which graph objects are members of the
    /// derived constellation.
    pub member_graph_node_ids: Vec<String>,
    /// Harness-agnostic agent session (the durable per-workspace tmux session).
    pub agent_session_id: Option<String>,
    /// `ql` or `mef` — present when the artifact was agent-parsed.
    pub parse_kind: Option<String>,
}

/// The derived artifact: a constellation record (SQLite) plus its members.
#[derive(Debug, Clone)]
pub struct DerivedConstellation {
    pub record: ConstellationRecord,
    pub member_graph_node_ids: Vec<String>,
}

/// Counts written by an ingest run, for deterministic test assertions.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConstellationIngestReport {
    pub constellation_id: String,
    pub member_edges_written: usize,
}

/// Derive a constellation from a real raw source file. Pure derivation: reads
/// the source, computes passage-level text_span provenance anchored to the
/// actual bytes, and returns the record plus member graph node ids. Performs no
/// writes.
pub fn derive_constellation(input: &ConstellationIngestionInput) -> Result<DerivedConstellation, String> {
    let content = std::fs::read_to_string(&input.source_path)
        .map_err(|e| format!("failed to read raw source {}: {e}", input.source_path))?;
    let passage_refs = derive_passage_refs(&input.source_path, &content, 8);

    let derived_at = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let assembly = json!({
        "source": if input.parse_kind.is_some() { "agent_parse" } else { "construct" },
        "parseKind": input.parse_kind,
        "agentSessionId": input.agent_session_id,
        "rawSourceRefs": passage_refs,
        "derivedAt": derived_at,
    });
    let metadata = json!({
        "time": null,
        "placeId": null,
        "ql": null,
        "fileRefs": [{
            "path": input.source_path,
            "kind": input.source_kind.as_str(),
            "passageRefs": passage_refs,
        }],
        "content": format!(
            "Derived {} constellation from raw source `{}` via QL/MEF parse.",
            input.kind.as_str(),
            input.source_path,
        ),
    });

    let record = ConstellationRecord {
        id: String::new(), // filled on ingest when the project row is created
        profile_scope: input.profile_scope.clone(),
        kind: input.kind,
        title: input.title.clone(),
        slug: input.slug.clone(),
        parent_constellation_id: input.parent_constellation_id.clone(),
        metadata,
        assembly,
        curation_events: Vec::new(),
        seed_key: Some(format!("{}-constellation:{}", input.slug, input.kind.as_str())),
        created_at: String::new(),
        updated_at: String::new(),
    };

    Ok(DerivedConstellation {
        record,
        member_graph_node_ids: input.member_graph_node_ids.clone(),
    })
}

/// Write a derived constellation into SQLite (project row + constellation
/// record). Returns the constellation/project id used for the shared identity.
pub fn persist_constellation(
    connection: &Connection,
    derived: &DerivedConstellation,
) -> Result<ConstellationIngestReport, String> {
    let repository = ConstellationMetaRepository::new(connection);

    // Idempotent ingestion: a seed_key already present returns the existing
    // constellation id WITHOUT minting another project row (projects ARE
    // constellations — re-ingesting the same raw source must not duplicate the
    // ingestion context).
    if let Some(seed_key) = derived.record.seed_key.as_deref() {
        if let Some(existing) = repository
            .find_by_seed_key(&derived.record.profile_scope, seed_key)
            .map_err(|e| e.to_string())?
        {
            return Ok(ConstellationIngestReport {
                constellation_id: existing.id,
                member_edges_written: 0,
            });
        }
    }

    // Projects ARE constellations — the project root is anchored at the raw
    // source's directory so resource roots can reach the canonical corpus.
    let root_path = first_source_parent(derived).unwrap_or_else(|| ".".to_string());
    let project = ConstellationRepository::new(connection)
        .create_project(
            derived.record.title.clone(),
            derived.record.slug.clone(),
            derived.record.parent_constellation_id.clone(),
            root_path,
            "directory".to_string(),
            derived.record.profile_scope.clone(),
            Some(
                derived
                    .record
                    .assembly
                    .get("rawSourceRefs")
                    .map(|refs| format!("Derived from {} passage(s).", refs.as_array().map(|a| a.len()).unwrap_or(0)))
                    .unwrap_or_default(),
            ),
            None,
            json!({ "includeResources": true, "theme": "dark" }),
        )
        .map_err(|e| e.to_string())?;

    let mut record = derived.record.clone();
    record.id = project.id.clone();
    record.created_at = project.created_at.clone();
    record.updated_at = project.updated_at.clone();

    repository
        .create_or_seed(record)
        .map_err(|e| e.to_string())?;

    Ok(ConstellationIngestReport {
        constellation_id: project.id,
        member_edges_written: 0,
    })
}

/// Write the graph side of an ingested constellation: create the Constellation
/// node (graph_node_id = the constellation/project id) and ENCAPSULATES edges
/// to each member node. Real graph store, no mocks.
pub async fn persist_constellation_graph(
    graph_repo: &GraphRepository,
    derived: &DerivedConstellation,
    constellation_id: &str,
) -> Result<ConstellationIngestReport, String> {
    graph_repo.ensure_schema().await?;

    let body = serde_json::to_string(&json!([
        { "type": "paragraph", "content": [
            { "type": "text", "text": derived.record.title, "styles": { "bold": true } }
        ] },
        { "type": "paragraph", "content": [
            { "type": "text", "text": format!("{} constellation", derived.record.kind.as_str()), "styles": {} }
        ] }
    ]))
    .map_err(|e| e.to_string())?;

    let source_coordinates = raw_source_coordinates(derived);
    graph_repo
        .create_node_with_metadata(
            NewGraphNode {
                graph_node_id: Some(constellation_id.to_string()),
                entity_type: "Constellation".to_string(),
                title: derived.record.title.clone(),
                body,
                coordinate: None,
                source_coordinates: source_coordinates.clone(),
                is_temporal: false,
                valid_from: None,
                valid_to: None,
                temporal_precision: None,
            },
            NewGraphNodeMetadata {
                summary: Some(
                    derived
                        .record
                        .assembly
                        .get("rawSourceRefs")
                        .map(|refs| format!("Derived from {} passage(s).", refs.as_array().map(|a| a.len()).unwrap_or(0)))
                        .unwrap_or_default(),
                ),
                evidence_tags: vec!["constellation".to_string()],
                source_kind: Some(derived.record.kind.as_str().to_string()),
                content_origin: Some(ContentOrigin::CorpusCompiled),
                content_revision: Some(1),
                seed_schema_version: Some(1),
                body_source_coordinates: source_coordinates.clone(),
                ..Default::default()
            },
        )
        .await?;

    let mut written = 0;
    for member in &derived.member_graph_node_ids {
        graph_repo
            .encapsulate(
                constellation_id,
                member,
                ENCAPSULATES_MODE_OUTGOING,
                json!({
                    "seed_key": format!("{constellation_id}:ENCAPSULATES:{member}"),
                    "evidence_tags": ["constellation"],
                    "source_coordinates": source_coordinates,
                }),
            )
            .await?;
        written += 1;
    }

    Ok(ConstellationIngestReport {
        constellation_id: constellation_id.to_string(),
        member_edges_written: written,
    })
}

/// Derive text_span passage refs anchored to a real file. Non-empty lines up to
/// `limit` become passage refs with exact byte offsets into the file. Each
/// line's start offset is unique, so the refs are inherently distinct.
fn derive_passage_refs(source_path: &str, content: &str, limit: usize) -> Vec<Value> {
    let mut refs = Vec::new();
    let mut offset = 0usize;
    for line in content.lines() {
        let line_start = offset;
        // Rust's `lines()` splits on `\n` and strips a trailing `\r`, so a
        // CRLF line ending costs 2 bytes in the byte-offset arithmetic and a
        // bare LF costs 1. The final line may carry no terminator at all. The
        // offsets must stay byte-accurate so the refs are readable back from
        // the real file.
        offset += line.len();
        if content[offset..].starts_with("\r\n") {
            offset += 2;
        } else if content[offset..].starts_with('\n') {
            offset += 1;
        }
        if line.trim().is_empty() || refs.len() >= limit {
            continue;
        }
        refs.push(json!({
            "artifactId": source_path,
            "unit": {
                "kind": "text_span",
                "startOffset": line_start,
                "endOffset": line_start + line.len(),
            },
        }));
    }
    refs
}

/// Parent directory of the first raw source file, used as the derived
/// constellation's project root. Defaults to `"."` when no fileRef is present.
fn first_source_parent(derived: &DerivedConstellation) -> Option<String> {
    derived
        .record
        .metadata
        .get("fileRefs")
        .and_then(Value::as_array)
        .and_then(|file_refs| file_refs.first())
        .and_then(|file_ref| file_ref.get("path").and_then(Value::as_str))
        .map(std::path::Path::new)
        .and_then(std::path::Path::parent)
        .map(|parent| parent.to_string_lossy().into_owned())
}

fn raw_source_coordinates(derived: &DerivedConstellation) -> Vec<String> {
    derived
        .record
        .metadata
        .get("fileRefs")
        .and_then(Value::as_array)
        .map(|file_refs| {
            file_refs
                .iter()
                .filter_map(|file_ref| file_ref.get("path").and_then(Value::as_str))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// Convenience helper used by tests and commands: derive from a real source and
/// persist to both SQLite and the real graph store.
pub async fn ingest_constellation(
    connection: &Connection,
    graph_repo: &GraphRepository,
    input: &ConstellationIngestionInput,
) -> Result<ConstellationIngestReport, String> {
    let derived = derive_constellation(input)?;
    let sqlite_report = persist_constellation(connection, &derived)?;
    let graph_report = persist_constellation_graph(graph_repo, &derived, &sqlite_report.constellation_id)
        .await?;
    Ok(graph_report)
}

#[cfg(test)]
mod tests {
    use super::derive_passage_refs;

    #[test]
    fn passage_ref_offsets_are_byte_accurate_for_crlf_and_lf() {
        let content = "alpha\r\nbeta\ngamma";
        let refs = derive_passage_refs("source.md", content, 8);
        let offsets: Vec<(u64, u64)> = refs
            .iter()
            .map(|entry| {
                let unit = entry.get("unit").unwrap();
                (
                    unit.get("startOffset").unwrap().as_u64().unwrap(),
                    unit.get("endOffset").unwrap().as_u64().unwrap(),
                )
            })
            .collect();
        // alpha spans [0,5), beta follows the CRLF at byte 7, gamma follows
        // the LF at byte 12. A naive +1 newline assumption would shift beta.
        assert_eq!(offsets, vec![(0, 5), (7, 11), (12, 17)]);
        assert!(refs.iter().all(|entry| entry.get("artifactId").unwrap() == "source.md"));
    }

    #[test]
    fn passage_ref_offsets_are_byte_accurate_for_a_lone_crlf_terminated_line() {
        let content = "only\r\n";
        let refs = derive_passage_refs("source.md", content, 8);
        let unit = refs[0].get("unit").unwrap();
        assert_eq!(unit.get("startOffset").unwrap().as_u64().unwrap(), 0);
        assert_eq!(unit.get("endOffset").unwrap().as_u64().unwrap(), 4);
    }
}

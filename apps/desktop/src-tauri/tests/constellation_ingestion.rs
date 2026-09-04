// apps/desktop/src-tauri/tests/constellation_ingestion.rs
// Ticket #27 (refinement-2 D11): constellation ingestion from raw sources and
// agent chats. The raw corpus is canonical and agent-immutable — derivation
// only READS real files and produces passage-level provenance (text_span
// offsets anchored to the actual bytes). Persists to real SQLite; no mocks.

use research_canvas_desktop_lib::db::{
    connection::Database,
    constellation_ingestion::{
        derive_constellation, persist_constellation, ConstellationIngestionInput, SourceKind,
    },
    repositories::{
        ConstellationKind, ConstellationMetaRepository, ConstellationRepository,
    },
};
use std::fs;
use tempfile::tempdir;

const RAW_SOURCE: &str = "\
The Image of the Antichrist\n\
==========================\n\
\n\
First paragraph of the raw source.\n\
Second paragraph introduces the archetype.\n\
Third paragraph names the civilizational structure.\n\
Fourth paragraph closes the reading.\n\
";

#[test]
fn deriving_a_document_constellation_carries_passage_level_provenance() {
    let dir = tempdir().unwrap();
    let source_path = dir.path().join("raw-document.md");
    fs::write(&source_path, RAW_SOURCE).unwrap();

    let derived = derive_constellation(&ConstellationIngestionInput {
        profile_scope: "bootstrapping".into(),
        kind: ConstellationKind::Document,
        title: "The Image of the Antichrist".into(),
        slug: "image-of-the-antichrist".into(),
        parent_constellation_id: None,
        source_path: source_path.to_str().unwrap().into(),
        source_kind: SourceKind::Document,
        member_graph_node_ids: vec![
            "member:archetype".into(),
            "member:structure".into(),
        ],
        agent_session_id: Some("wayfinder:test-session".into()),
        parse_kind: Some("ql".into()),
    })
    .expect("derive document constellation");

    assert_eq!(derived.record.kind.as_str(), "document");
    assert_eq!(derived.record.assembly["source"], serde_json::json!("agent_parse"));
    assert_eq!(derived.record.assembly["parseKind"], serde_json::json!("ql"));
    assert_eq!(
        derived.record.assembly["agentSessionId"],
        serde_json::json!("wayfinder:test-session")
    );
    assert_eq!(derived.member_graph_node_ids.len(), 2);

    // Passage-level provenance: rawSourceRefs anchored to real byte offsets.
    let raw_source_refs = derived.record.assembly["rawSourceRefs"]
        .as_array()
        .expect("rawSourceRefs is an array");
    assert!(!raw_source_refs.is_empty());
    assert!(raw_source_refs.len() <= 8);

    // Each ref must be a real text span: slicing the file yields the line.
    let content = fs::read_to_string(&source_path).unwrap();
    for passage in raw_source_refs {
        let unit = &passage["unit"];
        assert_eq!(unit["kind"], serde_json::json!("text_span"));
        let start: usize = unit["startOffset"].as_u64().unwrap() as usize;
        let end: usize = unit["endOffset"].as_u64().unwrap() as usize;
        assert!(end > start);
        let slice = &content[start..end];
        assert!(!slice.trim().is_empty(), "passage slice must be non-empty");
        assert!(content[start..].starts_with(slice));
    }

    // fileRefs carry the same passage refs (provenance back to the raw corpus).
    let file_refs = derived.record.metadata["fileRefs"].as_array().unwrap();
    assert_eq!(file_refs.len(), 1);
    assert_eq!(file_refs[0]["kind"], serde_json::json!("document"));
    assert_eq!(
        file_refs[0]["passageRefs"],
        derived.record.assembly["rawSourceRefs"]
    );
}

#[test]
fn deriving_a_chat_constellation_uses_construct_when_not_agent_parsed() {
    let dir = tempdir().unwrap();
    let source_path = dir.path().join("raw-chat.txt");
    fs::write(&source_path, "user: what shapes the field?\nassistant: a dyad of light and shadow.\n").unwrap();

    let derived = derive_constellation(&ConstellationIngestionInput {
        profile_scope: "bootstrapping".into(),
        kind: ConstellationKind::Episode,
        title: "Field shaping chat".into(),
        slug: "field-shaping-chat".into(),
        parent_constellation_id: None,
        source_path: source_path.to_str().unwrap().into(),
        source_kind: SourceKind::Chat,
        member_graph_node_ids: vec![],
        agent_session_id: None,
        parse_kind: None,
    })
    .expect("derive chat constellation");

    assert_eq!(derived.record.kind.as_str(), "episode");
    assert_eq!(derived.record.assembly["source"], serde_json::json!("construct"));
    assert!(derived.record.assembly["parseKind"].is_null());
    assert_eq!(
        derived.record.metadata["fileRefs"][0]["kind"],
        serde_json::json!("chat")
    );
    assert!(!derived.record.assembly["rawSourceRefs"]
        .as_array()
        .unwrap()
        .is_empty());
}

#[test]
fn persisting_a_derived_constellation_writes_sqlite_with_provenance_intact() {
    let dir = tempdir().unwrap();
    let source_path = dir.path().join("raw-document.md");
    fs::write(&source_path, RAW_SOURCE).unwrap();
    let db = Database::open(dir.path().join("ingestion.sqlite")).unwrap();

    // The active project is the ingestion context.
    let active = ConstellationRepository::new(db.connection())
        .create(
            "Active project".into(),
            "active-project".into(),
            None,
            dir.path().to_str().unwrap().into(),
            None,
            None,
            serde_json::json!({}),
        )
        .unwrap();

    let derived = derive_constellation(&ConstellationIngestionInput {
        profile_scope: "bootstrapping".into(),
        kind: ConstellationKind::Document,
        title: "The Image of the Antichrist".into(),
        slug: "image-of-the-antichrist".into(),
        parent_constellation_id: Some(active.id.clone()),
        source_path: source_path.to_str().unwrap().into(),
        source_kind: SourceKind::Document,
        member_graph_node_ids: vec!["member:archetype".into()],
        agent_session_id: Some("wayfinder:test-session".into()),
        parse_kind: Some("mef".into()),
    })
    .expect("derive");

    let report = persist_constellation(db.connection(), &derived)
        .expect("persist constellation to SQLite");
    assert!(!report.constellation_id.is_empty());

    // The constellation record is readable with its provenance intact.
    let stored = ConstellationMetaRepository::new(db.connection())
        .get_by_id(&report.constellation_id)
        .expect("get stored")
        .expect("record exists");
    assert_eq!(stored.title, "The Image of the Antichrist");
    assert_eq!(stored.parent_constellation_id.as_deref(), Some(active.id.as_str()));
    assert_eq!(stored.assembly["source"], serde_json::json!("agent_parse"));
    assert_eq!(stored.assembly["parseKind"], serde_json::json!("mef"));
    assert_eq!(
        stored.assembly["rawSourceRefs"],
        derived.record.assembly["rawSourceRefs"]
    );
    assert_eq!(stored.metadata["fileRefs"], derived.record.metadata["fileRefs"]);
}

#[test]
fn persisting_the_same_seed_twice_is_idempotent_and_never_orphans_a_project() {
    let dir = tempdir().unwrap();
    let source_path = dir.path().join("raw-document.md");
    fs::write(&source_path, RAW_SOURCE).unwrap();
    let db = Database::open(dir.path().join("ingestion-idempotent.sqlite")).unwrap();

    let input = ConstellationIngestionInput {
        profile_scope: "bootstrapping".into(),
        kind: ConstellationKind::Document,
        title: "The Image of the Antichrist".into(),
        slug: "image-of-the-antichrist".into(),
        parent_constellation_id: None,
        source_path: source_path.to_str().unwrap().into(),
        source_kind: SourceKind::Document,
        member_graph_node_ids: vec!["member:archetype".into()],
        agent_session_id: Some("wayfinder:test-session".into()),
        parse_kind: Some("ql".into()),
    };

    let derived = derive_constellation(&input).expect("derive");
    let first = persist_constellation(db.connection(), &derived).expect("first persist");
    let second = persist_constellation(db.connection(), &derived).expect("second persist");

    // Same constellation id — no duplicate record, no orphan project.
    assert_eq!(first.constellation_id, second.constellation_id);
    let meta = ConstellationMetaRepository::new(db.connection());
    assert_eq!(
        meta.list_for_profile("bootstrapping").unwrap().len(),
        1
    );
    // The project row created by the first persist is the constellation's id.
    assert!(ConstellationRepository::new(db.connection())
        .get_by_id(&first.constellation_id)
        .unwrap()
        .is_some());
}

#[test]
fn derive_fails_on_a_missing_raw_source() {
    let dir = tempdir().unwrap();
    let err = derive_constellation(&ConstellationIngestionInput {
        profile_scope: "bootstrapping".into(),
        kind: ConstellationKind::Document,
        title: "Missing".into(),
        slug: "missing".into(),
        parent_constellation_id: None,
        source_path: dir.path().join("does-not-exist.md").to_str().unwrap().into(),
        source_kind: SourceKind::Document,
        member_graph_node_ids: vec![],
        agent_session_id: None,
        parse_kind: None,
    })
    .expect_err("missing raw source must fail");

    assert!(err.contains("failed to read raw source"));
}

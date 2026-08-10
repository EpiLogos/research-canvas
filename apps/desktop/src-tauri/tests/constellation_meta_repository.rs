// apps/desktop/src-tauri/tests/constellation_meta_repository.rs
// Ticket #27 (refinement-2 D11): the constellation metadata store. Projects ARE
// constellations — the `projects` row is the ingestion context and the
// `constellations` table augments it. Real SQLite in a temp dir; no mocks.

use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{
        Constellation, ConstellationKind, ConstellationMetaRepository, ConstellationRecord,
        ConstellationRepository, RepositoryError,
    },
};
use tempfile::tempdir;

fn project(db: &Database, slug: &str) -> Constellation {
    ConstellationRepository::new(db.connection())
        .create(
            format!("Project {slug}"),
            slug.into(),
            None,
            ".".into(),
            None,
            None,
            serde_json::json!({}),
        )
        .unwrap()
}

fn record(project_id: &str, kind: ConstellationKind) -> ConstellationRecord {
    ConstellationRecord {
        id: project_id.into(),
        profile_scope: "bootstrapping".into(),
        kind,
        title: "QL constellation".into(),
        slug: "ql-constellation".into(),
        parent_constellation_id: None,
        metadata: serde_json::json!({
            "time": { "year": 1947, "label": "Partition" },
            "placeId": "root-archetypal-field:place-india",
            "ql": { "shape": "triad" },
            "fileRefs": [{
                "path": "antichrist-vault/documents/test.md",
                "kind": "document",
                "passageRefs": [{
                    "artifactId": "antichrist-vault/documents/test.md",
                    "unit": { "kind": "text_span", "startOffset": 0, "endOffset": 40 }
                }]
            }],
            "content": "Test constellation content.",
        }),
        assembly: serde_json::json!({
            "source": "agent_parse",
            "parseKind": "ql",
            "agentSessionId": "wayfinder:test-session",
            "rawSourceRefs": [{
                "artifactId": "antichrist-vault/documents/test.md",
                "unit": { "kind": "text_span", "startOffset": 0, "endOffset": 40 }
            }],
            "derivedAt": "2026-08-09T00:00:00Z",
        }),
        curation_events: vec![serde_json::json!({
            "type": "title",
            "at": "2026-08-09T00:00:00Z",
            "detail": { "before": "old", "after": "QL constellation" }
        })],
        seed_key: Some(format!("{project_id}:constellation")),
        created_at: String::new(),
        updated_at: String::new(),
    }
}

#[test]
fn constellation_round_trips_with_provenance() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("constellation-meta.sqlite")).unwrap();
    let project = project(&db, "constellation-meta");
    let repository = ConstellationMetaRepository::new(db.connection());

    let created = repository
        .create(record(&project.id, ConstellationKind::Document))
        .expect("create constellation record");
    assert_eq!(created.id, project.id);
    assert_eq!(created.created_at, created.updated_at);
    assert_eq!(created.kind.as_str(), "document");
    assert_eq!(created.metadata["ql"]["shape"], serde_json::json!("triad"));
    assert_eq!(
        created.assembly["parseKind"],
        serde_json::json!("ql")
    );
    assert_eq!(created.assembly["source"], serde_json::json!("agent_parse"));
    assert_eq!(
        created.assembly["rawSourceRefs"].as_array().unwrap().len(),
        1
    );

    let fetched = repository
        .get_by_id(&project.id)
        .expect("get")
        .expect("record exists");
    assert_eq!(fetched, created);

    let list = repository
        .list_for_profile("bootstrapping")
        .expect("list bootstrapping");
    assert_eq!(list.len(), 1);
    assert!(repository.list_for_profile("migration").unwrap().is_empty());
}

#[test]
fn constellation_kinds_are_the_three_families() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("constellation-kinds.sqlite")).unwrap();
    let repository = ConstellationMetaRepository::new(db.connection());

    for (index, kind) in [
        ConstellationKind::Episode,
        ConstellationKind::Document,
        ConstellationKind::Conceptual,
    ]
    .iter()
    .enumerate()
    {
        let project = project(&db, &format!("kind-{index}"));
        let mut rec = record(&project.id, *kind);
        rec.slug = format!("kind-{index}");
        rec.seed_key = Some(format!("kind-{index}:constellation"));
        let created = repository.create(rec).unwrap();
        assert_eq!(created.kind.as_str(), kind.as_str());
        assert_eq!(repository.get_by_id(&project.id).unwrap().unwrap().kind, *kind);
    }

    let list = repository.list_for_profile("bootstrapping").unwrap();
    assert_eq!(list.len(), 3);
    let mut kinds: Vec<&str> = list.iter().map(|r| r.kind.as_str()).collect();
    kinds.sort_unstable();
    assert_eq!(kinds, ["conceptual", "document", "episode"]);
}

#[test]
fn seed_key_create_is_idempotent() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("constellation-seed.sqlite")).unwrap();
    let repository = ConstellationMetaRepository::new(db.connection());

    let project = project(&db, "seed-idempotent");
    let rec = record(&project.id, ConstellationKind::Episode);

    let (first, created) = repository.create_or_seed(rec.clone()).unwrap();
    assert!(created);
    let (second, created_again) = repository.create_or_seed(rec).unwrap();
    assert!(!created_again);
    assert_eq!(first.id, second.id);

    assert_eq!(
        repository
            .find_by_seed_key("bootstrapping", &format!("{}:constellation", project.id))
            .unwrap()
            .unwrap()
            .id,
        project.id
    );
}

#[test]
fn constellation_requires_passage_level_assembly_provenance() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("constellation-validation.sqlite")).unwrap();
    let repository = ConstellationMetaRepository::new(db.connection());

    let project = project(&db, "validation");
    let mut rec = record(&project.id, ConstellationKind::Conceptual);
    rec.assembly = serde_json::json!({
        "source": "agent_parse",
        "derivedAt": "2026-08-09T00:00:00Z",
    });

    let err = repository.create(rec).unwrap_err();
    assert!(matches!(err, RepositoryError::Validation(_)));
    assert!(err.to_string().contains("rawSourceRefs"));
}

#[test]
fn delete_removes_the_constellation_record() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("constellation-delete.sqlite")).unwrap();
    let repository = ConstellationMetaRepository::new(db.connection());

    let project = project(&db, "delete-me");
    repository
        .create(record(&project.id, ConstellationKind::Document))
        .unwrap();

    repository.delete(&project.id).unwrap();
    assert!(repository.get_by_id(&project.id).unwrap().is_none());
}

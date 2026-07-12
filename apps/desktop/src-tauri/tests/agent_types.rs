use research_canvas_desktop_lib::agent::markdown::MarkdownHeading;
use research_canvas_desktop_lib::agent::types::{
    AgentContextPack, AgentEnvelope, AgentSearchHit, AgentWarning, ByteRange, VaultDocument,
    WikiLink,
};
use serde_json::{json, Map};

#[test]
fn agent_warning_serializes_with_optional_path() {
    let warning = AgentWarning {
        code: "vault.unreadable".into(),
        message: "Could not read linked note".into(),
        path: Some("notes/missing.md".into()),
    };

    let json = serde_json::to_value(&warning).expect("serialize warning");

    assert_eq!(
        json,
        json!({
            "code": "vault.unreadable",
            "message": "Could not read linked note",
            "path": "notes/missing.md"
        })
    );

    let without_path = AgentWarning {
        code: "vault.empty".into(),
        message: "No vault documents were discovered".into(),
        path: None,
    };
    let json = serde_json::to_value(&without_path).expect("serialize warning without path");

    assert_eq!(
        json,
        json!({
            "code": "vault.empty",
            "message": "No vault documents were discovered"
        })
    );
}

#[test]
fn wiki_link_serializes_camel_case() {
    let link = WikiLink {
        target: "People/Friedrich Nietzsche".into(),
        label: Some("Nietzsche".into()),
        source_path: "essays/antichrist.md".into(),
        byte_start: 42,
        byte_end: 74,
    };

    let json = serde_json::to_value(&link).expect("serialize wiki link");

    assert_eq!(
        json,
        json!({
            "target": "People/Friedrich Nietzsche",
            "label": "Nietzsche",
            "sourcePath": "essays/antichrist.md",
            "byteStart": 42,
            "byteEnd": 74
        })
    );

    let round_trip: WikiLink = serde_json::from_value(json).expect("deserialize wiki link");
    assert_eq!(round_trip, link);
}

#[test]
fn vault_document_serializes_camel_case_with_wikilinks() {
    let link = WikiLink {
        target: "People/Friedrich Nietzsche".into(),
        label: Some("Nietzsche".into()),
        source_path: "/vault/essays/antichrist.md".into(),
        byte_start: 27,
        byte_end: 67,
    };
    let document = VaultDocument {
        path: "/vault/essays/antichrist.md".into(),
        absolute_path: "/vault/essays/antichrist.md".into(),
        root_path: "/vault".into(),
        relative_path: "essays/antichrist.md".into(),
        title: "The Antichrist".into(),
        body: "# The Antichrist\n\nSee [[People/Friedrich Nietzsche|Nietzsche]].".into(),
        tags: vec!["philosophy".into(), "source".into()],
        headings: vec![MarkdownHeading {
            level: 1,
            text: "The Antichrist".into(),
        }],
        wikilinks: vec![link.clone()],
        frontmatter: Map::from_iter([
            ("status".into(), json!("draft")),
            ("tags".into(), json!(["philosophy", "source"])),
        ]),
        size_bytes: 68,
        snippet: "# The Antichrist\n\nSee [[People/Friedrich Nietzsche|Nietzsche]].".into(),
    };

    let json = serde_json::to_value(&document).expect("serialize vault document");

    assert_eq!(
        json,
        json!({
            "path": "/vault/essays/antichrist.md",
            "absolutePath": "/vault/essays/antichrist.md",
            "rootPath": "/vault",
            "relativePath": "essays/antichrist.md",
            "title": "The Antichrist",
            "body": "# The Antichrist\n\nSee [[People/Friedrich Nietzsche|Nietzsche]].",
            "tags": ["philosophy", "source"],
            "headings": [
                {
                    "level": 1,
                    "text": "The Antichrist"
                }
            ],
            "wikilinks": [
                {
                    "target": "People/Friedrich Nietzsche",
                    "label": "Nietzsche",
                    "sourcePath": "/vault/essays/antichrist.md",
                    "byteStart": 27,
                    "byteEnd": 67
                }
            ],
            "frontmatter": {
                "status": "draft",
                "tags": ["philosophy", "source"]
            },
            "sizeBytes": 68,
            "snippet": "# The Antichrist\n\nSee [[People/Friedrich Nietzsche|Nietzsche]]."
        })
    );

    let round_trip: VaultDocument =
        serde_json::from_value(json).expect("deserialize vault document");
    assert_eq!(round_trip, document);
}

#[test]
fn vault_document_defaults_omitted_frontmatter_to_an_object_and_rejects_non_objects() {
    let document: VaultDocument = serde_json::from_value(json!({
        "path": "notes/plain.md",
        "title": "Plain Note",
        "body": "No frontmatter here."
    }))
    .expect("deserialize document with omitted frontmatter");

    assert!(document.frontmatter.is_empty());
    assert_eq!(document.absolute_path, "");
    assert_eq!(document.root_path, "");
    assert_eq!(document.relative_path, "");
    assert!(document.tags.is_empty());
    assert!(document.headings.is_empty());
    assert!(document.wikilinks.is_empty());
    assert_eq!(document.size_bytes, 0);
    assert_eq!(document.snippet, "");

    let json = serde_json::to_value(&document).expect("serialize document");
    assert_eq!(json["frontmatter"], json!({}));
    assert_eq!(json["absolutePath"], "");
    assert_eq!(json["rootPath"], "");
    assert_eq!(json["relativePath"], "");
    assert_eq!(json["tags"], json!([]));
    assert_eq!(json["headings"], json!([]));
    assert_eq!(json["wikilinks"], json!([]));
    assert!(json.get("links").is_none());
    assert_eq!(json["sizeBytes"], 0);
    assert_eq!(json["snippet"], "");

    let err = serde_json::from_value::<VaultDocument>(json!({
        "path": "notes/bad.md",
        "title": "Bad Note",
        "body": "Frontmatter must be an object.",
        "frontmatter": ["not", "an", "object"]
    }))
    .expect_err("non-object frontmatter must be rejected");

    assert!(
        err.to_string().contains("map"),
        "serde should reject array frontmatter as non-object: {err}"
    );
}

#[test]
fn agent_search_hit_serializes_camel_case() {
    let hit = AgentSearchHit {
        path: "essays/antichrist.md".into(),
        title: "The Antichrist".into(),
        snippet: "Christianity as a revaluation problem".into(),
        score: 0.87,
        match_ranges: vec![
            ByteRange {
                byte_start: 0,
                byte_end: 12,
            },
            ByteRange {
                byte_start: 18,
                byte_end: 29,
            },
        ],
    };

    let json = serde_json::to_value(&hit).expect("serialize search hit");

    assert_eq!(
        json,
        json!({
            "path": "essays/antichrist.md",
            "title": "The Antichrist",
            "snippet": "Christianity as a revaluation problem",
            "score": 0.87,
            "matchRanges": [
                { "byteStart": 0, "byteEnd": 12 },
                { "byteStart": 18, "byteEnd": 29 }
            ]
        })
    );

    let round_trip: AgentSearchHit = serde_json::from_value(json).expect("deserialize search hit");
    assert_eq!(round_trip, hit);
}

#[test]
fn agent_context_pack_serializes_documents_search_hits_and_warnings() {
    let pack = AgentContextPack {
        project_id: "project-1".into(),
        query: "Nietzsche critique".into(),
        documents: vec![VaultDocument {
            path: "/vault/essays/antichrist.md".into(),
            absolute_path: "/vault/essays/antichrist.md".into(),
            root_path: "/vault".into(),
            relative_path: "essays/antichrist.md".into(),
            title: "The Antichrist".into(),
            body: "Body text".into(),
            tags: vec!["source".into()],
            headings: vec![MarkdownHeading {
                level: 1,
                text: "The Antichrist".into(),
            }],
            wikilinks: vec![],
            frontmatter: Map::new(),
            size_bytes: 9,
            snippet: "Body text".into(),
        }],
        search_hits: vec![AgentSearchHit {
            path: "essays/antichrist.md".into(),
            title: "The Antichrist".into(),
            snippet: "critique".into(),
            score: 1.0,
            match_ranges: vec![ByteRange {
                byte_start: 0,
                byte_end: 8,
            }],
        }],
        warnings: vec![AgentWarning {
            code: "context.truncated".into(),
            message: "Context was truncated to fit the request budget".into(),
            path: None,
        }],
    };

    let json = serde_json::to_value(&pack).expect("serialize context pack");

    assert_eq!(json["projectId"], "project-1");
    assert_eq!(
        json["searchHits"][0]["matchRanges"][0],
        json!({ "byteStart": 0, "byteEnd": 8 })
    );
    assert_eq!(json["warnings"][0]["code"], "context.truncated");
    assert!(json["warnings"][0].get("path").is_none());

    let round_trip: AgentContextPack =
        serde_json::from_value(json).expect("deserialize context pack");
    assert_eq!(round_trip, pack);
}

#[test]
fn agent_envelope_serializes_success_and_error_shapes() {
    let success = AgentEnvelope::success(
        "agent.contextPack",
        json!({
            "answer": "God is dead as a diagnostic, not a slogan."
        }),
    )
    .with_warning(AgentWarning {
        code: "context.partial".into(),
        message: "Only local vault context was available".into(),
        path: Some("essays/antichrist.md".into()),
    });

    let json = serde_json::to_value(&success).expect("serialize success envelope");

    assert_eq!(
        json,
        json!({
            "ok": true,
            "command": "agent.contextPack",
            "warnings": [
                {
                    "code": "context.partial",
                    "message": "Only local vault context was available",
                    "path": "essays/antichrist.md"
                }
            ],
            "data": {
                "answer": "God is dead as a diagnostic, not a slogan."
            }
        })
    );

    let error = AgentEnvelope::<serde_json::Value>::failure(
        "agent.contextPack",
        "Unable to build agent context",
        vec![AgentWarning {
            code: "vault.unreadable".into(),
            message: "Could not read a vault file".into(),
            path: Some("vault/private.md".into()),
        }],
    );

    let json = serde_json::to_value(&error).expect("serialize error envelope");

    assert_eq!(
        json,
        json!({
            "ok": false,
            "command": "agent.contextPack",
            "error": "Unable to build agent context",
            "warnings": [
                {
                    "code": "vault.unreadable",
                    "message": "Could not read a vault file",
                    "path": "vault/private.md"
                }
            ]
        })
    );

    let round_trip: AgentEnvelope<serde_json::Value> =
        serde_json::from_value(json).expect("deserialize error envelope");
    assert!(!round_trip.is_ok());
    assert_eq!(round_trip.command(), "agent.contextPack");
    assert_eq!(round_trip.warnings()[0].code, "vault.unreadable");
}

#[test]
fn agent_envelope_accessors_expose_deserialized_success_data_and_error_message() {
    let success: AgentEnvelope<serde_json::Value> = serde_json::from_value(json!({
        "ok": true,
        "command": "agent.answer",
        "warnings": [],
        "data": {
            "answer": "The accessor should expose this without reserializing."
        }
    }))
    .expect("deserialize success envelope");

    assert!(success.is_ok());
    assert_eq!(success.command(), "agent.answer");
    assert_eq!(
        success.data().expect("success data")["answer"],
        "The accessor should expose this without reserializing."
    );
    assert!(success.error().is_none());

    let owned_data = success.into_data().expect("owned success data");
    assert_eq!(
        owned_data["answer"],
        "The accessor should expose this without reserializing."
    );

    let failure: AgentEnvelope<serde_json::Value> = serde_json::from_value(json!({
        "ok": false,
        "command": "agent.answer",
        "error": "Unable to produce an answer",
        "warnings": [
            {
                "code": "context.empty",
                "message": "No context was available"
            }
        ]
    }))
    .expect("deserialize failure envelope");

    assert!(!failure.is_ok());
    assert_eq!(failure.command(), "agent.answer");
    assert_eq!(failure.error(), Some("Unable to produce an answer"));
    assert!(failure.data().is_none());
    assert!(failure.clone().into_data().is_none());
    assert_eq!(failure.warnings()[0].code, "context.empty");
}

#[test]
fn agent_envelope_rejects_invalid_ok_shape_combinations() {
    let false_success = serde_json::from_value::<AgentEnvelope<serde_json::Value>>(json!({
        "ok": false,
        "command": "agent.contextPack",
        "warnings": [],
        "data": {
            "answer": "This claims to be both failure and success."
        }
    }));
    assert!(
        false_success.is_err(),
        "ok=false envelopes must not deserialize as success data"
    );

    let true_error = serde_json::from_value::<AgentEnvelope<serde_json::Value>>(json!({
        "ok": true,
        "command": "agent.contextPack",
        "error": "This claims to be both success and failure.",
        "warnings": []
    }));
    assert!(
        true_error.is_err(),
        "ok=true envelopes must not deserialize as errors"
    );

    let true_with_data_and_error =
        serde_json::from_value::<AgentEnvelope<serde_json::Value>>(json!({
            "ok": true,
            "command": "agent.contextPack",
            "warnings": [],
            "data": {
                "answer": "This is success data."
            },
            "error": "This error must make the envelope invalid."
        }));
    assert!(
        true_with_data_and_error.is_err(),
        "ok=true envelopes must reject an unexpected error field"
    );

    let false_with_error_and_data =
        serde_json::from_value::<AgentEnvelope<serde_json::Value>>(json!({
            "ok": false,
            "command": "agent.contextPack",
            "warnings": [],
            "error": "This is the failure message.",
            "data": {
                "answer": "This data must make the envelope invalid."
            }
        }));
    assert!(
        false_with_error_and_data.is_err(),
        "ok=false envelopes must reject an unexpected data field"
    );
}

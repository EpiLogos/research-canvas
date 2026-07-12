use research_canvas_desktop_lib::agent::context::{
    ContextConstellation, ContextFile, ContextNode, ContextPack, ContextProject,
    ContextRelationship, ContextTemporal, ContextTimeline, ContextWikiLink,
};
use research_canvas_desktop_lib::agent::note::generate_note_skeleton;

fn sample_pack() -> ContextPack {
    ContextPack {
        query: "mithraic bull sacrifice".to_string(),
        project: ContextProject {
            id: "project-1".to_string(),
            display_name: "Mithraic Study".to_string(),
            root_path: "/tmp/mithras".to_string(),
            primary_canvas_id: Some("canvas-1".to_string()),
        },
        files: vec![ContextFile {
            path: "/tmp/mithras/rituals/mithras.md".to_string(),
            relative_path: "rituals/mithras.md".to_string(),
            title: "Mithras Tauroctony".to_string(),
            score: 1.25,
            snippet: "The mithraic bull sacrifice appears beside Sol.".to_string(),
            tags: vec!["source".to_string(), "ritual".to_string()],
            wikilinks: vec![ContextWikiLink {
                target: "Sol Invictus".to_string(),
                alias: None,
            }],
            backlinks: Vec::new(),
        }],
        nodes: vec![ContextNode {
            graph_node_id: "graph-node-mithras".to_string(),
            entity_type: "Event".to_string(),
            title: "Tauroctony scene".to_string(),
            summary: "Bull sacrifice as iconographic center.".to_string(),
            temporal: ContextTemporal {
                is_temporal: true,
                valid_from: Some("200".to_string()),
                valid_to: None,
                precision: Some("century".to_string()),
            },
            evidence_tags: vec!["contested".to_string()],
            source_kind: Some("archive".to_string()),
            relationships: vec![ContextRelationship {
                id: "rel-1".to_string(),
                rel_type: "SOURCED_FROM".to_string(),
                source_graph_node_id: "graph-node-mithras".to_string(),
                target_graph_node_id: "source-node-1".to_string(),
                properties: serde_json::json!({
                    "sourcePath": "/tmp/mithras/rituals/mithras.md",
                    "quote": "bull sacrifice"
                }),
            }],
        }],
        timeline: ContextTimeline {
            canvas_id: Some("canvas-1".to_string()),
            neighbor_nodes: Vec::new(),
            visible_range: None,
        },
        constellation: ContextConstellation {
            project_id: "project-1".to_string(),
            canvas_id: Some("canvas-1".to_string()),
            node_count: 2,
            relationship_count: 1,
            node_ids: vec![
                "graph-node-mithras".to_string(),
                "source-node-1".to_string(),
            ],
            relationship_ids: vec!["rel-1".to_string()],
        },
        warnings: Vec::new(),
        suggested_next_actions: Vec::new(),
    }
}

#[test]
fn note_skeleton_is_deterministic_markdown_with_source_backed_sections() {
    let pack = sample_pack();
    let markdown = generate_note_skeleton(&pack);

    assert!(markdown.starts_with("# Research Note: mithraic bull sacrifice\n"));
    assert!(markdown.contains("Project: Mithraic Study (`project-1`)"));
    assert!(markdown.contains("- `graph-node-mithras` Event: Tauroctony scene"));
    assert!(markdown.contains("Bull sacrifice as iconographic center\\."));
    assert!(markdown.contains("- `/tmp/mithras/rituals/mithras.md`"));
    assert!(markdown.contains("The mithraic bull sacrifice appears beside Sol\\."));
    assert!(markdown.contains("- `rel-1` SOURCED\\_FROM: `graph-node-mithras` -> `source-node-1`"));
    assert!(markdown.contains("- [[Sol Invictus]] from `/tmp/mithras/rituals/mithras.md`"));
    assert!(markdown.contains(
        "- Compare graph node `graph-node-mithras` with file `/tmp/mithras/rituals/mithras.md`."
    ));

    let second = generate_note_skeleton(&pack);
    assert_eq!(markdown, second);
}

#[test]
fn empty_pack_still_cites_project_and_query_without_fabricated_claims() {
    let mut pack = sample_pack();
    pack.nodes.clear();
    pack.files.clear();
    pack.constellation.relationship_ids.clear();

    let markdown = generate_note_skeleton(&pack);

    assert!(markdown.contains("Query: mithraic bull sacrifice"));
    assert!(markdown.contains("Project: Mithraic Study (`project-1`)"));
    assert!(markdown.contains("- No graph nodes were selected."));
    assert!(markdown.contains("- No relevant files were selected."));
    assert!(!markdown.contains("TBD"));
    assert!(!markdown.contains("Lorem"));
}

#[test]
fn skeleton_escapes_hostile_markdown_and_dedupes_relationships() {
    let mut pack = sample_pack();
    let relationship = ContextRelationship {
        id: "rel-`dup`".to_string(),
        rel_type: "SOURCED_FROM".to_string(),
        source_graph_node_id: "node-`a`".to_string(),
        target_graph_node_id: "node-|b|".to_string(),
        properties: serde_json::json!({
            "sourcePath": "/tmp/a`b.md",
            "quote": "# heading\n- injected | table"
        }),
    };
    pack.query = "query\n# injected".to_string();
    pack.project.display_name = "Project [link](bad)".to_string();
    pack.files[0].path = "/tmp/a`b.md".to_string();
    pack.files[0].relative_path = "a`b.md".to_string();
    pack.files[0].title = "Title | **bold**".to_string();
    pack.files[0].snippet = "Line one\n> quote".to_string();
    pack.files[0].tags = vec!["tag`one".to_string(), "tag|two".to_string()];
    pack.files[0].wikilinks = vec![ContextWikiLink {
        target: "Bad|Target]]".to_string(),
        alias: Some("Alias[[Pipe|".to_string()),
    }];
    pack.nodes = vec![
        ContextNode {
            graph_node_id: "node-`a`".to_string(),
            entity_type: "Event|Type".to_string(),
            title: "Node # title".to_string(),
            summary: "Summary\n- not list".to_string(),
            temporal: ContextTemporal {
                is_temporal: false,
                valid_from: None,
                valid_to: None,
                precision: None,
            },
            evidence_tags: vec!["tag`one".to_string()],
            source_kind: None,
            relationships: vec![relationship.clone()],
        },
        ContextNode {
            graph_node_id: "node-|b|".to_string(),
            entity_type: "Source".to_string(),
            title: "Source".to_string(),
            summary: String::new(),
            temporal: ContextTemporal {
                is_temporal: false,
                valid_from: None,
                valid_to: None,
                precision: None,
            },
            evidence_tags: Vec::new(),
            source_kind: None,
            relationships: vec![relationship],
        },
    ];

    let markdown = generate_note_skeleton(&pack);

    assert!(markdown.contains("# Research Note: query \\# injected"));
    assert!(markdown.contains("Project: Project \\[link\\]\\(bad\\) (`project-1`)"));
    assert!(markdown.contains("- `/tmp/a'b.md`"));
    assert!(markdown.contains("Title: Title \\| \\*\\*bold\\*\\*"));
    assert!(markdown.contains("Snippet: Line one \\> quote"));
    assert!(markdown.contains("Tags: `tag'one`, `tag|two`"));
    assert!(markdown.contains("- [[Bad Target|Alias Pipe]] from `/tmp/a'b.md`"));
    assert_eq!(markdown.matches("`rel-'dup'` SOURCED\\_FROM").count(), 1);
    assert_eq!(markdown.matches("via `rel-'dup'`").count(), 1);
    assert!(!markdown.contains("\n- injected | table"));
}

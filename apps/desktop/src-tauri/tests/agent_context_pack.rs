mod support;

use std::fs;
use std::path::{Path, PathBuf};

use neo4rs::query;
use research_canvas_desktop_lib::agent::context::build_context_pack;
use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{
        graph::{GraphRepository, NewGraphNode},
        layout::{EdgeLayoutRecord, LayoutRepository, NodeLayoutRecord},
        ConstellationRepository,
    },
};
use serde_json::json;
use tempfile::{tempdir, TempDir};

fn open_temp_database() -> (TempDir, String) {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("research-canvas.sqlite");
    let _database = Database::open(&path).expect("database open");
    (dir, path.to_string_lossy().to_string())
}

fn write_file(root: &Path, relative_path: &str, contents: &str) -> PathBuf {
    let path = root.join(relative_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create fixture parent");
    }
    fs::write(&path, contents).expect("write fixture file");
    path
}

fn create_project(database_path: &str, display_name: &str, root_path: &Path) -> String {
    let database = Database::open(database_path).expect("database");
    let project = ConstellationRepository::new(database.connection())
        .create(
            display_name.to_string(),
            display_name.to_lowercase().replace(' ', "-"),
            None,
            root_path.to_string_lossy().to_string(),
            Some("Real project metadata summary".to_string()),
            None,
            json!({}),
        )
        .expect("create project");
    project.id
}

fn primary_canvas_id(database_path: &str, project_id: &str) -> String {
    let database = Database::open(database_path).expect("database");
    ConstellationRepository::new(database.connection())
        .get_by_id(project_id)
        .expect("load project")
        .expect("project exists")
        .primary_canvas_id
        .expect("primary canvas id")
}

fn seed_layout_metadata(database_path: &str, canvas_id: &str) {
    let database = Database::open(database_path).expect("database");
    let layout = LayoutRepository::new(database.connection());
    let first = "2026-07-08T00:00:00Z".to_string();
    let second = "2026-07-08T00:00:01Z".to_string();

    layout
        .upsert_node_layout(&NodeLayoutRecord {
            graph_node_id: "graph-node-mithras".to_string(),
            canvas_id: canvas_id.to_string(),
            position_x: 10.0,
            position_y: 20.0,
            width: 240.0,
            height: 160.0,
            style_json: json!({
                "__canvasNode": {
                    "type": "note",
                    "title": "Mithras tauroctony"
                }
            })
            .to_string(),
            created_at: first.clone(),
            updated_at: first,
        })
        .expect("upsert node layout");
    layout
        .upsert_node_layout(&NodeLayoutRecord {
            graph_node_id: "graph-node-bull".to_string(),
            canvas_id: canvas_id.to_string(),
            position_x: 320.0,
            position_y: 40.0,
            width: 220.0,
            height: 140.0,
            style_json: json!({
                "__canvasNode": {
                    "type": "resource",
                    "title": "Bull sacrifice source"
                }
            })
            .to_string(),
            created_at: second.clone(),
            updated_at: second.clone(),
        })
        .expect("upsert second node layout");
    layout
        .upsert_edge_layout(&EdgeLayoutRecord {
            id: "layout-rel-mithras-bull".to_string(),
            canvas_id: canvas_id.to_string(),
            source_graph_node_id: "graph-node-mithras".to_string(),
            target_graph_node_id: "graph-node-bull".to_string(),
            relation_kind: "SOURCED_FROM".to_string(),
            source_handle_id: Some("source".to_string()),
            target_handle_id: Some("target".to_string()),
            style_json: json!({ "stroke": "#445566" }).to_string(),
            created_at: second.clone(),
            updated_at: second,
        })
        .expect("upsert edge layout");
}

fn seed_layout_for_graph_node(database_path: &str, canvas_id: &str, graph_node_id: &str) {
    let database = Database::open(database_path).expect("database");
    let now = "2026-07-08T00:00:02Z".to_string();
    LayoutRepository::new(database.connection())
        .upsert_node_layout(&NodeLayoutRecord {
            graph_node_id: graph_node_id.to_string(),
            canvas_id: canvas_id.to_string(),
            position_x: 640.0,
            position_y: 90.0,
            width: 260.0,
            height: 170.0,
            style_json: json!({
                "__canvasNode": {
                    "type": "note",
                    "title": "Graph backed node"
                }
            })
            .to_string(),
            created_at: now.clone(),
            updated_at: now,
        })
        .expect("upsert graph node layout");
}

struct EnvGuard {
    neo4j_uri: Option<String>,
    neo4j_password: Option<String>,
}

impl EnvGuard {
    fn without_neo4j() -> Self {
        let guard = Self {
            neo4j_uri: std::env::var("NEO4J_URI").ok(),
            neo4j_password: std::env::var("NEO4J_PASSWORD").ok(),
        };
        std::env::remove_var("NEO4J_URI");
        std::env::remove_var("NEO4J_PASSWORD");
        guard
    }
}

impl Drop for EnvGuard {
    fn drop(&mut self) {
        if let Some(value) = &self.neo4j_uri {
            std::env::set_var("NEO4J_URI", value);
        } else {
            std::env::remove_var("NEO4J_URI");
        }
        if let Some(value) = &self.neo4j_password {
            std::env::set_var("NEO4J_PASSWORD", value);
        } else {
            std::env::remove_var("NEO4J_PASSWORD");
        }
    }
}

#[test]
fn builds_file_only_context_pack_from_real_sqlite_search_and_vault_documents() {
    let _neo4j_env = EnvGuard::without_neo4j();
    let (temp_dir, database_path) = open_temp_database();
    let vault_root = temp_dir.path().join("vault");
    fs::create_dir_all(&vault_root).expect("create vault");
    let source_path = write_file(
        &vault_root,
        "rituals/mithras.md",
        concat!(
            "---\n",
            "title: Mithras Tauroctony\n",
            "tags: [source, ritual]\n",
            "---\n",
            "# Mithras Tauroctony\n",
            "The mithraic bull sacrifice appears beside [[Sol Invictus]].\n"
        ),
    );
    write_file(
        &vault_root,
        "indices/solar.md",
        "Solar index points back to [[rituals/mithras|Mithras]].\n",
    );
    write_file(
        &vault_root,
        "notes/unmatched.md",
        "This note should stay out of the focused file context.\n",
    );

    let project_id = create_project(&database_path, "Mithraic Study", &vault_root);
    let canvas_id = primary_canvas_id(&database_path, &project_id);
    seed_layout_metadata(&database_path, &canvas_id);

    let pack = build_context_pack(&database_path, &project_id, "mithraic bull sacrifice", 5)
        .expect("context pack");

    assert_eq!(pack.query, "mithraic bull sacrifice");
    assert_eq!(pack.project.id, project_id);
    assert_eq!(pack.project.display_name, "Mithraic Study");
    assert_eq!(
        pack.project.root_path,
        fs::canonicalize(&vault_root)
            .expect("canonical vault")
            .to_string_lossy()
    );
    assert_eq!(
        pack.project.primary_canvas_id.as_deref(),
        Some(canvas_id.as_str())
    );

    assert_eq!(pack.files.len(), 1);
    let file = &pack.files[0];
    assert_eq!(
        file.path,
        source_path
            .canonicalize()
            .expect("canonical source")
            .to_string_lossy()
    );
    assert_eq!(file.relative_path, "rituals/mithras.md");
    assert_eq!(file.title, "Mithras Tauroctony");
    assert!(file.score > 0.0);
    assert!(file.snippet.contains("bull"));
    assert_eq!(file.tags, vec!["source", "ritual"]);
    assert_eq!(file.wikilinks.len(), 1);
    assert_eq!(file.wikilinks[0].target, "Sol Invictus");
    assert_eq!(file.backlinks.len(), 1);
    assert_eq!(file.backlinks[0].source_relative_path, "indices/solar.md");
    assert_eq!(file.backlinks[0].target, "rituals/mithras");

    assert!(
        pack.nodes.is_empty(),
        "Neo4j graph nodes should not be fabricated in file-only mode"
    );
    assert_eq!(pack.timeline.canvas_id.as_deref(), Some(canvas_id.as_str()));
    assert_eq!(pack.timeline.neighbor_nodes.len(), 2);
    assert_eq!(
        pack.timeline.neighbor_nodes[0].graph_node_id,
        "graph-node-mithras"
    );
    assert_eq!(pack.constellation.project_id, project_id);
    assert_eq!(
        pack.constellation.canvas_id.as_deref(),
        Some(canvas_id.as_str())
    );
    assert_eq!(pack.constellation.node_count, 2);
    assert_eq!(pack.constellation.relationship_count, 1);
    assert!(pack
        .constellation
        .relationship_ids
        .contains(&"layout-rel-mithras-bull".to_string()));

    assert_eq!(pack.warnings.len(), 1);
    assert_eq!(pack.warnings[0].code, "neo4j_unconfigured");
    assert!(pack.warnings[0].message.contains("NEO4J_PASSWORD"));
    assert!(pack.suggested_next_actions.is_empty());

    let serialized = serde_json::to_value(&pack).expect("serialize context pack");
    assert_eq!(serialized["project"]["id"], pack.project.id);
    assert_eq!(serialized["files"][0]["path"], file.path);
    assert_eq!(
        serialized["files"][0]["wikilinks"][0]["target"],
        "Sol Invictus"
    );
    assert_eq!(
        serialized["constellation"]["relationshipIds"],
        json!(["layout-rel-mithras-bull"])
    );
}

#[test]
fn graph_context_pack_includes_selected_node_relationships_without_global_relationships() {
    let (graph, run_id, database_name) = support::neo4j_test_graph();
    support::block_on(async {
        graph
            .run_on(
                &database_name,
                query("MATCH (n) WHERE n.graph_node_id CONTAINS $run_id DETACH DELETE n")
                    .param("run_id", run_id.clone()),
            )
            .await
            .expect("pre-clean graph");
    });

    let (temp_dir, database_path) = open_temp_database();
    let vault_root = temp_dir.path().join("vault");
    fs::create_dir_all(&vault_root).expect("create vault");
    let project_id = create_project(&database_path, "Graph Context Study", &vault_root);
    let canvas_id = primary_canvas_id(&database_path, &project_id);

    let repo = GraphRepository::new(graph.clone(), database_name.clone());
    support::block_on(repo.ensure_schema()).expect("schema");
    let selected = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: Some(format!("selected-{run_id}")),
        entity_type: "Event".to_string(),
        title: format!("Selected Context Node {run_id}"),
        body: format!("[{{\"type\":\"paragraph\",\"content\":\"celadon-context-{run_id}\"}}]"),
        coordinate: None,
        source_coordinates: Vec::new(),
        is_temporal: true,
        valid_from: Some("312".to_string()),
        valid_to: None,
        temporal_precision: Some("year".to_string()),
    }))
    .expect("create selected node");
    let source = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: Some(format!("source-{run_id}")),
        entity_type: "Source".to_string(),
        title: format!("Selected Source {run_id}"),
        body: "[]".to_string(),
        coordinate: Some(format!("source-coordinate-{run_id}")),
        source_coordinates: Vec::new(),
        is_temporal: false,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
    }))
    .expect("create source node");
    let selected_rel = support::block_on(repo.connect_nodes(
        &selected.graph_node_id,
        &source.graph_node_id,
        "SOURCED_FROM",
        json!({
            "sourcePath": vault_root.join("graph-source.md").to_string_lossy(),
            "quote": "celadon context"
        }),
    ))
    .expect("connect selected relationship");

    let unrelated_a = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: Some(format!("unrelated-a-{run_id}")),
        entity_type: "Event".to_string(),
        title: format!("Unrelated A {run_id}"),
        body: "[]".to_string(),
        coordinate: None,
        source_coordinates: Vec::new(),
        is_temporal: false,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
    }))
    .expect("create unrelated a");
    let unrelated_b = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: Some(format!("unrelated-b-{run_id}")),
        entity_type: "Event".to_string(),
        title: format!("Unrelated B {run_id}"),
        body: "[]".to_string(),
        coordinate: None,
        source_coordinates: Vec::new(),
        is_temporal: false,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
    }))
    .expect("create unrelated b");
    let off_canvas_match = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: Some(format!("off-canvas-match-{run_id}")),
        entity_type: "Event".to_string(),
        title: format!("Off Canvas Match {run_id}"),
        body: format!("[{{\"type\":\"paragraph\",\"content\":\"celadon-context-{run_id}\"}}]"),
        coordinate: None,
        source_coordinates: Vec::new(),
        is_temporal: true,
        valid_from: Some("313".to_string()),
        valid_to: None,
        temporal_precision: Some("year".to_string()),
    }))
    .expect("create off canvas matching node");
    let unrelated_rel = support::block_on(repo.connect_nodes(
        &unrelated_a.graph_node_id,
        &unrelated_b.graph_node_id,
        "ECHOES",
        json!({ "note": "must not leak" }),
    ))
    .expect("connect unrelated relationship");
    seed_layout_for_graph_node(&database_path, &canvas_id, &selected.graph_node_id);

    let pack = build_context_pack(
        &database_path,
        &project_id,
        &format!("celadon-context-{run_id}"),
        5,
    )
    .expect("context pack");

    assert!(pack
        .nodes
        .iter()
        .any(|node| node.graph_node_id == selected.graph_node_id));
    assert!(!pack
        .nodes
        .iter()
        .any(|node| node.graph_node_id == off_canvas_match.graph_node_id));
    let selected_context = pack
        .nodes
        .iter()
        .find(|node| node.graph_node_id == selected.graph_node_id)
        .expect("selected context node");
    assert_eq!(selected_context.relationships.len(), 1);
    assert_eq!(selected_context.relationships[0].id, selected_rel.id);
    assert!(!selected_context
        .relationships
        .iter()
        .any(|relationship| relationship.id == unrelated_rel.id));
    assert_eq!(pack.constellation.relationship_count, 0);
    assert!(pack.constellation.relationship_ids.is_empty());
    assert_eq!(pack.timeline.canvas_id.as_deref(), Some(canvas_id.as_str()));
    assert!(pack
        .timeline
        .neighbor_nodes
        .iter()
        .any(|node| node.graph_node_id == selected.graph_node_id));

    support::block_on(async {
        graph
            .run_on(
                &database_name,
                query("MATCH (n) WHERE n.graph_node_id CONTAINS $run_id DETACH DELETE n")
                    .param("run_id", run_id),
            )
            .await
            .expect("cleanup graph");
    });
}

#[test]
fn graph_context_pack_does_not_include_matches_when_canvas_has_no_layout_nodes() {
    let (graph, run_id, database_name) = support::neo4j_test_graph();

    let (temp_dir, database_path) = open_temp_database();
    let vault_root = temp_dir.path().join("vault");
    fs::create_dir_all(&vault_root).expect("create vault");
    let project_id = create_project(&database_path, "Empty Canvas Graph Study", &vault_root);
    let canvas_id = primary_canvas_id(&database_path, &project_id);

    let repo = GraphRepository::new(graph.clone(), database_name.clone());
    support::block_on(repo.ensure_schema()).expect("schema");
    let matching_node = support::block_on(repo.create_node(NewGraphNode {
        graph_node_id: Some(format!("empty-canvas-match-{run_id}")),
        entity_type: "Event".to_string(),
        title: format!("Empty Canvas Match {run_id}"),
        body: format!("[{{\"type\":\"paragraph\",\"content\":\"empty-canvas-context-{run_id}\"}}]"),
        coordinate: None,
        source_coordinates: Vec::new(),
        is_temporal: true,
        valid_from: Some("314".to_string()),
        valid_to: None,
        temporal_precision: Some("year".to_string()),
    }))
    .expect("create matching node");

    let pack = build_context_pack(
        &database_path,
        &project_id,
        &format!("empty-canvas-context-{run_id}"),
        5,
    )
    .expect("context pack");

    assert_eq!(
        pack.constellation.canvas_id.as_deref(),
        Some(canvas_id.as_str())
    );
    assert_eq!(pack.constellation.node_count, 0);
    assert!(
        pack.nodes.is_empty(),
        "Neo4j matches must not leak into an empty SQLite canvas"
    );

    support::block_on(async {
        graph
            .run_on(
                &database_name,
                query("MATCH (n { graph_node_id: $node_id }) DETACH DELETE n")
                    .param("node_id", matching_node.graph_node_id),
            )
            .await
            .expect("cleanup graph");
    });
}

use std::{collections::HashMap, path::PathBuf, process};

use research_canvas_desktop_lib::{
    agent::{
        context::build_context_pack,
        curation::{add_file_tag, add_node_tag, attach_evidence},
        note::generate_note_skeleton,
        project::search_project_files,
        types::{AgentEnvelope, AgentWarning},
        vault::{backlinks, links_for_file},
    },
    db::{
        connection::Database,
        neo4j::{self, config::Neo4jConfig},
        repositories::{
            GraphNode, GraphRelationship, GraphRepository, LayoutRepository, NodeLayoutRecord,
        },
    },
};
use serde::Serialize;
use serde_json::json;

fn main() {
    let mut args = std::env::args().skip(1).collect::<Vec<_>>();
    if args.is_empty() || args.iter().any(|arg| arg == "--help" || arg == "-h") {
        print_help();
        return;
    }

    let command = args.remove(0);
    let options = parse_options(args);
    let json_mode = options.flag("json");

    let result = dispatch(&command, &options);
    let ok = result.is_ok();
    if json_mode {
        match result {
            Ok(value) => {
                let warnings = warnings_from_value(&value);
                print_json(AgentEnvelope::success_with_warnings(
                    command, value, warnings,
                ));
            }
            Err(error) => print_json(AgentEnvelope::<serde_json::Value>::failure(
                command,
                error,
                Vec::new(),
            )),
        }
    } else {
        match result {
            Ok(value) => println!("{}", human_output(&command, &value)),
            Err(error) => eprintln!("agent_research {command}: {error}"),
        }
    }

    if !ok {
        process::exit(1);
    }
}

fn dispatch(command: &str, options: &Options) -> Result<serde_json::Value, String> {
    if let Some(error) = &options.parse_error {
        return Err(error.clone());
    }

    match command {
        "search" => {
            let result = search_project_files(
                required(options, "database")?,
                required_constellation(options)?,
                required(options, "query")?,
                limit(options),
            )?;
            Ok(serde_json::to_value(result).map_err(|error| error.to_string())?)
        }
        "context" => {
            let pack = build_context_pack(
                required(options, "database")?,
                required_constellation(options)?,
                required(options, "query")?,
                limit(options),
            )?;
            Ok(serde_json::to_value(pack).map_err(|error| error.to_string())?)
        }
        "node-context" => node_context(
            required(options, "database")?,
            required(options, "canvas")?,
            required(options, "node")?,
        ),
        "constellation-context" => {
            let pack = build_context_pack(
                required(options, "database")?,
                required_constellation(options)?,
                options.value("query").unwrap_or(""),
                limit(options),
            )?;
            Ok(serde_json::to_value(pack.constellation).map_err(|error| error.to_string())?)
        }
        "wikilinks" => {
            let links = links_for_file(required(options, "root")?, required(options, "file")?)
                .map_err(|error| error.to_string())?;
            Ok(serde_json::to_value(links).map_err(|error| error.to_string())?)
        }
        "backlinks" => {
            let links = backlinks(required(options, "root")?, required(options, "target")?)
                .map_err(|error| error.to_string())?;
            Ok(serde_json::to_value(links).map_err(|error| error.to_string())?)
        }
        "tag-file" => {
            let report = add_file_tag(required(options, "file")?, required(options, "tag")?)
                .map_err(|error| error.to_string())?;
            Ok(serde_json::to_value(report).map_err(|error| error.to_string())?)
        }
        "tag-node" => {
            let node_id = required(options, "graph-node")?.to_string();
            let tag = required(options, "tag")?.to_string();
            let report = with_graph(|repo| async move { add_node_tag(&repo, node_id, tag).await })?
                .map_err(|error| error.to_string())?;
            Ok(serde_json::to_value(report).map_err(|error| error.to_string())?)
        }
        "attach-evidence" => {
            let node_id = required(options, "graph-node")?.to_string();
            let source_path = PathBuf::from(required(options, "source-path")?);
            let quote = required(options, "quote")?.to_string();
            let note = options.value("note").unwrap_or("").to_string();
            let report = with_graph(|repo| async move {
                attach_evidence(&repo, node_id, source_path, quote, note).await
            })?
            .map_err(|error| error.to_string())?;
            Ok(serde_json::to_value(report).map_err(|error| error.to_string())?)
        }
        "note-skeleton" => {
            let pack = build_context_pack(
                required(options, "database")?,
                required_constellation(options)?,
                required(options, "query")?,
                limit(options),
            )?;
            Ok(json!({ "markdown": generate_note_skeleton(&pack) }))
        }
        other => Err(format!("unknown command: {other}")),
    }
}

fn with_graph<F, Fut, T>(
    operation: F,
) -> Result<Result<T, research_canvas_desktop_lib::agent::curation::MutationError>, String>
where
    F: FnOnce(GraphRepository) -> Fut + Send + 'static,
    Fut: std::future::Future<
            Output = Result<T, research_canvas_desktop_lib::agent::curation::MutationError>,
        > + Send
        + 'static,
    T: Send + 'static,
{
    let config = Neo4jConfig::from_env()?;
    run_graph(async move {
        let graph = neo4j::connect(&config).await?;
        let repo = GraphRepository::new(graph, config.database);
        repo.ensure_schema().await?;
        Ok(operation(repo).await)
    })
}

fn with_graph_read<F, Fut, T>(operation: F) -> Result<T, String>
where
    F: FnOnce(GraphRepository) -> Fut + Send + 'static,
    Fut: std::future::Future<Output = Result<T, String>> + Send + 'static,
    T: Send + 'static,
{
    let config = Neo4jConfig::from_env()?;
    run_graph(async move {
        let graph = neo4j::connect(&config).await?;
        let repo = GraphRepository::new(graph, config.database);
        repo.ensure_schema().await?;
        operation(repo).await
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NodeContextResponse {
    canvas_id: String,
    node: GraphNode,
    relationships: Vec<GraphRelationship>,
    layout: Option<NodeLayoutRecord>,
}

fn node_context(
    database_path: &str,
    canvas_id: &str,
    node_id: &str,
) -> Result<serde_json::Value, String> {
    let database = Database::open(database_path).map_err(|error| error.to_string())?;
    let layout = LayoutRepository::new(database.connection())
        .list_node_layout(canvas_id)
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|record| record.graph_node_id == node_id);
    let canvas_id = canvas_id.to_string();
    let node_id = node_id.to_string();
    let response = with_graph_read(move |repo| async move {
        let node = repo
            .get_node(&node_id)
            .await?
            .ok_or_else(|| format!("graph node not found: {node_id}"))?;
        let relationships = repo.relationships_for_node(&node_id).await?;
        Ok(NodeContextResponse {
            canvas_id,
            node,
            relationships,
            layout,
        })
    })?;
    Ok(serde_json::to_value(response).map_err(|error| error.to_string())?)
}

fn run_graph<F, T>(future: F) -> Result<T, String>
where
    F: std::future::Future<Output = Result<T, String>> + Send + 'static,
    T: Send + 'static,
{
    if tokio::runtime::Handle::try_current().is_ok() {
        std::thread::spawn(move || run_graph_runtime(future))
            .join()
            .map_err(|_| "Neo4j worker thread panicked".to_string())?
    } else {
        run_graph_runtime(future)
    }
}

fn run_graph_runtime<F, T>(future: F) -> Result<T, String>
where
    F: std::future::Future<Output = Result<T, String>>,
{
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| error.to_string())?
        .block_on(future)
}

fn print_json<T: Serialize>(value: T) {
    println!(
        "{}",
        serde_json::to_string_pretty(&value).expect("serialize CLI JSON")
    );
}

fn warnings_from_value(value: &serde_json::Value) -> Vec<AgentWarning> {
    value
        .get("warnings")
        .cloned()
        .and_then(|warnings| serde_json::from_value(warnings).ok())
        .unwrap_or_default()
}

fn human_output(command: &str, value: &serde_json::Value) -> String {
    match command {
        "note-skeleton" => value["markdown"].as_str().unwrap_or_default().to_string(),
        "search" => render_search(value),
        "context" => render_context(value),
        "node-context" => render_node_context(value),
        "constellation-context" => render_constellation(value),
        "wikilinks" => render_wikilinks(value),
        "backlinks" => render_backlinks(value),
        "tag-file" | "tag-node" | "attach-evidence" => render_mutation(value),
        _ => serde_json::to_string_pretty(value).expect("serialize human output"),
    }
}

fn render_search(value: &serde_json::Value) -> String {
    let mut out = String::from("# Search Results\n");
    out.push_str(&format!(
        "\nQuery: {}\n",
        value["query"].as_str().unwrap_or("")
    ));
    let hits = value["hits"].as_array().map(Vec::as_slice).unwrap_or(&[]);
    if hits.is_empty() {
        out.push_str("\nNo file hits.\n");
        return out;
    }
    for hit in hits {
        out.push_str(&format!(
            "\n- {} ({:.3})\n",
            hit["title"].as_str().unwrap_or("untitled"),
            hit["score"].as_f64().unwrap_or_default()
        ));
        if let Some(path) = hit["relativePath"]
            .as_str()
            .or_else(|| hit["sourcePath"].as_str())
        {
            out.push_str(&format!("  Path: {path}\n"));
        }
        if let Some(snippet) = hit["snippet"]
            .as_str()
            .filter(|snippet| !snippet.is_empty())
        {
            out.push_str(&format!("  {snippet}\n"));
        }
    }
    out
}

fn render_context(value: &serde_json::Value) -> String {
    let mut out = String::from("# Context Pack\n");
    out.push_str(&format!(
        "\nQuery: {}\nProject: {}\n",
        value["query"].as_str().unwrap_or(""),
        value["project"]["displayName"].as_str().unwrap_or("")
    ));
    out.push_str("\n## Files\n");
    for file in value["files"].as_array().map(Vec::as_slice).unwrap_or(&[]) {
        out.push_str(&format!(
            "- {} ({})\n",
            file["title"].as_str().unwrap_or("untitled"),
            file["relativePath"].as_str().unwrap_or("")
        ));
    }
    out.push_str("\n## Graph Nodes\n");
    for node in value["nodes"].as_array().map(Vec::as_slice).unwrap_or(&[]) {
        out.push_str(&format!(
            "- {} [{}]\n",
            node["title"].as_str().unwrap_or("untitled"),
            node["graphNodeId"].as_str().unwrap_or("")
        ));
    }
    out
}

fn render_node_context(value: &serde_json::Value) -> String {
    let mut out = String::from("# Node Context\n");
    out.push_str(&format!(
        "\nCanvas: {}\nNode: {} [{}]\n",
        value["canvasId"].as_str().unwrap_or(""),
        value["node"]["title"].as_str().unwrap_or("untitled"),
        value["node"]["graphNodeId"].as_str().unwrap_or("")
    ));
    out.push_str("\n## Relationships\n");
    let relationships = value["relationships"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    if relationships.is_empty() {
        out.push_str("No relationships.\n");
    } else {
        for relationship in relationships {
            out.push_str(&format!(
                "- {}: {} -> {}\n",
                relationship["relType"].as_str().unwrap_or("RELATED"),
                relationship["sourceGraphNodeId"].as_str().unwrap_or(""),
                relationship["targetGraphNodeId"].as_str().unwrap_or("")
            ));
        }
    }
    out
}

fn render_constellation(value: &serde_json::Value) -> String {
    format!(
        "# Constellation\n\nProject: {}\nCanvas: {}\nNodes: {}\nRelationships: {}\n",
        value["constellationId"].as_str().unwrap_or(""),
        value["canvasId"].as_str().unwrap_or(""),
        value["nodeCount"].as_u64().unwrap_or_default(),
        value["relationshipCount"].as_u64().unwrap_or_default()
    )
}

fn render_wikilinks(value: &serde_json::Value) -> String {
    let mut out = String::from("# Wikilinks\n");
    for link in value.as_array().map(Vec::as_slice).unwrap_or(&[]) {
        out.push_str(&format!(
            "\n- {}",
            link["target"].as_str().unwrap_or("untitled")
        ));
        if let Some(label) = link["label"].as_str().filter(|label| !label.is_empty()) {
            out.push_str(&format!(" as {label}"));
        }
    }
    out.push('\n');
    out
}

fn render_backlinks(value: &serde_json::Value) -> String {
    let mut out = String::from("# Backlinks\n");
    for link in value.as_array().map(Vec::as_slice).unwrap_or(&[]) {
        out.push_str(&format!(
            "\n- {} -> {}",
            link["sourceRelativePath"].as_str().unwrap_or(""),
            link["target"].as_str().unwrap_or("")
        ));
    }
    out.push('\n');
    out
}

fn render_mutation(value: &serde_json::Value) -> String {
    let changed = value["changed"].as_bool().unwrap_or(false);
    let detail = value["detail"].as_str().unwrap_or("");
    let path = value["path"].as_str().unwrap_or("");
    format!(
        "# Mutation Report\n\nChanged: {}\nPath: {}\nDetail: {}\n",
        changed, path, detail
    )
}

fn required<'a>(options: &'a Options, name: &str) -> Result<&'a str, String> {
    options
        .value(name)
        .ok_or_else(|| format!("missing required --{name}"))
}

/// `--constellation` is the canonical scope selector.  `--project` remains a
/// read-compatible spelling for existing automation while the domain migration
/// settles.
fn required_constellation<'a>(options: &'a Options) -> Result<&'a str, String> {
    options
        .value("constellation")
        .or_else(|| options.value("project"))
        .ok_or_else(|| "missing required --constellation".to_string())
}

fn limit(options: &Options) -> usize {
    options
        .value("limit")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(10)
}

#[derive(Debug, Default)]
struct Options {
    values: HashMap<String, String>,
    flags: Vec<String>,
    parse_error: Option<String>,
}

impl Options {
    fn value(&self, name: &str) -> Option<&str> {
        self.values.get(name).map(String::as_str)
    }

    fn flag(&self, name: &str) -> bool {
        self.flags.iter().any(|flag| flag == name)
    }
}

fn parse_options(args: Vec<String>) -> Options {
    let mut options = Options::default();
    let mut index = 0;
    while index < args.len() {
        let arg = &args[index];
        if !arg.starts_with("--") {
            index += 1;
            continue;
        }
        let key = arg.trim_start_matches("--").to_string();
        if key == "json" {
            options.flags.push(key);
            index += 1;
            continue;
        }
        if let Some(value) = args.get(index + 1).filter(|value| !value.starts_with("--")) {
            options.values.insert(key, value.clone());
            index += 2;
        } else {
            if options.parse_error.is_none() {
                options.parse_error = Some(format!("missing value for --{key}"));
            }
            index += 1;
        }
    }
    options
}

fn print_help() {
    println!(
        "agent_research <command> [--json]\n\nConstellation-scoped commands require --constellation <id> (--project remains a compatibility alias).\n\nCommands: search, context, node-context, constellation-context, wikilinks, backlinks, tag-file, tag-node, attach-evidence, note-skeleton"
    );
}

use std::collections::BTreeMap;

use crate::agent::context::{ContextFile, ContextNode, ContextPack, ContextRelationship};

pub fn generate_note_skeleton(pack: &ContextPack) -> String {
    let mut out = String::new();
    push_line(
        &mut out,
        &format!("# Research Note: {}", markdown_plain(&pack.query)),
    );
    push_line(&mut out, "");
    push_line(&mut out, &format!("Query: {}", markdown_plain(&pack.query)));
    push_line(
        &mut out,
        &format!(
            "Project: {} (`{}`)",
            markdown_plain(&pack.project.display_name),
            code_text(&pack.project.id)
        ),
    );
    if let Some(canvas_id) = &pack.project.primary_canvas_id {
        push_line(&mut out, &format!("Canvas: `{}`", code_text(canvas_id)));
    }
    push_line(&mut out, "");

    push_graph_nodes(&mut out, &pack.nodes);
    push_files(&mut out, &pack.files);
    push_evidence(&mut out, &pack.nodes, &pack.files);
    push_open_questions(&mut out, pack);
    push_wikilinks(&mut out, &pack.files);
    push_relationships(&mut out, &pack.nodes);

    out
}

fn push_graph_nodes(out: &mut String, nodes: &[ContextNode]) {
    push_line(out, "## Selected Graph Nodes");
    if nodes.is_empty() {
        push_line(out, "- No graph nodes were selected.");
    } else {
        for node in nodes {
            push_line(
                out,
                &format!(
                    "- `{}` {}: {}",
                    code_text(&node.graph_node_id),
                    markdown_plain(&node.entity_type),
                    markdown_plain(&node.title)
                ),
            );
            if !node.summary.trim().is_empty() {
                push_line(
                    out,
                    &format!("  Source note: {}", markdown_plain(&node.summary)),
                );
            }
            if node.temporal.is_temporal {
                let from = markdown_plain(node.temporal.valid_from.as_deref().unwrap_or("unknown"));
                let precision =
                    markdown_plain(node.temporal.precision.as_deref().unwrap_or("unspecified"));
                push_line(out, &format!("  Temporal: {from} ({precision})"));
            }
            if !node.evidence_tags.is_empty() {
                push_line(
                    out,
                    &format!(
                        "  Evidence tags: {}",
                        node.evidence_tags
                            .iter()
                            .map(|tag| format!("`{}`", code_text(tag)))
                            .collect::<Vec<_>>()
                            .join(", ")
                    ),
                );
            }
        }
    }
    push_line(out, "");
}

fn push_files(out: &mut String, files: &[ContextFile]) {
    push_line(out, "## Relevant Files");
    if files.is_empty() {
        push_line(out, "- No relevant files were selected.");
    } else {
        for file in files {
            push_line(out, &format!("- `{}`", code_text(&file.path)));
            push_line(out, &format!("  Title: {}", markdown_plain(&file.title)));
            push_line(
                out,
                &format!("  Relative path: `{}`", code_text(&file.relative_path)),
            );
            if !file.snippet.trim().is_empty() {
                push_line(
                    out,
                    &format!("  Snippet: {}", markdown_plain(&file.snippet)),
                );
            }
            if !file.tags.is_empty() {
                push_line(
                    out,
                    &format!(
                        "  Tags: {}",
                        file.tags
                            .iter()
                            .map(|tag| format!("`{}`", code_text(tag)))
                            .collect::<Vec<_>>()
                            .join(", ")
                    ),
                );
            }
        }
    }
    push_line(out, "");
}

fn push_evidence(out: &mut String, nodes: &[ContextNode], files: &[ContextFile]) {
    push_line(out, "## Evidence To Inspect");
    let mut wrote = false;
    for (_relationship_id, (node_id, relationship)) in sourced_relationships(nodes) {
        wrote = true;
        let source_path = relationship
            .properties
            .get("sourcePath")
            .and_then(|value| value.as_str())
            .unwrap_or("source path unavailable");
        let quote = relationship
            .properties
            .get("quote")
            .and_then(|value| value.as_str())
            .unwrap_or("");
        let suffix = if quote.is_empty() {
            String::new()
        } else {
            format!(" quote: {}", markdown_plain(quote))
        };
        push_line(
            out,
            &format!(
                "- `{}` via `{}` from `{}`{}",
                code_text(&node_id),
                code_text(&relationship.id),
                code_text(source_path),
                suffix
            ),
        );
    }
    for file in files {
        wrote = true;
        push_line(
            out,
            &format!(
                "- {} (`{}`)",
                markdown_plain(&file.title),
                code_text(&file.path)
            ),
        );
    }
    if !wrote {
        push_line(out, "- No source-backed evidence was selected.");
    }
    push_line(out, "");
}

fn sourced_relationships<'a>(
    nodes: &'a [ContextNode],
) -> BTreeMap<String, (String, &'a ContextRelationship)> {
    let mut relationships = BTreeMap::new();
    for node in nodes {
        for relationship in &node.relationships {
            if relationship.rel_type == "SOURCED_FROM" {
                relationships
                    .entry(relationship.id.clone())
                    .or_insert((node.graph_node_id.clone(), relationship));
            }
        }
    }
    relationships
}

fn push_open_questions(out: &mut String, pack: &ContextPack) {
    push_line(out, "## Open Questions");
    if pack.nodes.is_empty() && pack.files.is_empty() {
        push_line(
            out,
            &format!(
                "- Gather source-backed files or graph nodes for query: {}.",
                markdown_plain(&pack.query)
            ),
        );
    } else {
        for node in &pack.nodes {
            for file in &pack.files {
                push_line(
                    out,
                    &format!(
                        "- Compare graph node `{}` with file {}.",
                        code_text(&node.graph_node_id),
                        code_span(&file.path)
                    ),
                );
            }
        }
        if pack.nodes.is_empty() {
            for file in &pack.files {
                push_line(
                    out,
                    &format!(
                        "- Identify graph nodes that should be linked to file {}.",
                        code_span(&file.path)
                    ),
                );
            }
        }
        if pack.files.is_empty() {
            for node in &pack.nodes {
                push_line(
                    out,
                    &format!(
                        "- Attach file evidence for graph node `{}`.",
                        code_text(&node.graph_node_id)
                    ),
                );
            }
        }
    }
    push_line(out, "");
}

fn push_wikilinks(out: &mut String, files: &[ContextFile]) {
    push_line(out, "## Suggested Wikilinks");
    let mut wrote = false;
    for file in files {
        for link in &file.wikilinks {
            wrote = true;
            let display = link.alias.as_deref().unwrap_or(&link.target);
            let target = wikilink_component(&link.target);
            let display = wikilink_component(display);
            if display == target {
                push_line(
                    out,
                    &format!("- [[{}]] from `{}`", target, code_text(&file.path)),
                );
            } else {
                push_line(
                    out,
                    &format!(
                        "- [[{}|{}]] from `{}`",
                        target,
                        display,
                        code_text(&file.path)
                    ),
                );
            }
        }
    }
    if !wrote {
        push_line(out, "- No wikilinks were present in selected files.");
    }
    push_line(out, "");
}

fn push_relationships(out: &mut String, nodes: &[ContextNode]) {
    push_line(out, "## Suggested Graph Relationships");
    let relationships = nodes
        .iter()
        .flat_map(|node| node.relationships.iter())
        .map(|relationship| (relationship.id.clone(), relationship))
        .collect::<BTreeMap<_, _>>();
    if relationships.is_empty() {
        push_line(out, "- No graph relationships were selected.");
    } else {
        for relationship in relationships.values() {
            push_relationship(out, relationship);
        }
    }
}

fn push_relationship(out: &mut String, relationship: &ContextRelationship) {
    push_line(
        out,
        &format!(
            "- `{}` {}: `{}` -> `{}`",
            code_text(&relationship.id),
            markdown_plain(&relationship.rel_type),
            code_text(&relationship.source_graph_node_id),
            code_text(&relationship.target_graph_node_id)
        ),
    );
}

fn push_line(out: &mut String, line: &str) {
    out.push_str(line);
    out.push('\n');
}

fn markdown_plain(value: &str) -> String {
    normalize_text(value)
        .chars()
        .flat_map(|character| {
            if matches!(
                character,
                '\\' | '`'
                    | '*'
                    | '_'
                    | '{'
                    | '}'
                    | '['
                    | ']'
                    | '('
                    | ')'
                    | '#'
                    | '+'
                    | '-'
                    | '.'
                    | '!'
                    | '|'
                    | '>'
            ) {
                vec!['\\', character]
            } else {
                vec![character]
            }
        })
        .collect()
}

fn code_span(value: &str) -> String {
    format!("`{}`", code_text(value))
}

fn code_text(value: &str) -> String {
    normalize_text(value).replace('`', "'")
}

fn wikilink_component(value: &str) -> String {
    normalize_text(value)
        .chars()
        .map(|character| {
            if matches!(character, '[' | ']' | '|') {
                ' '
            } else {
                character
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn normalize_text(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

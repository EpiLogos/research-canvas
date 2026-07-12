# Agent Research CLI

`agent_research` is the provider-neutral local tool layer for retrieval, curation, and context packaging. It composes the existing Research Canvas stores instead of creating a parallel substrate:

- vault/resource files from project and resource roots
- SQLite project, search, canvas, layout, and constellation metadata
- Neo4j graph nodes, relationships, evidence tags, and `Source` provenance when configured

It does not call an LLM provider. It does not replace Graphiti. Graphiti remains the theory-authoring MCP path for creating and deduplicating theory substance; this CLI prepares local evidence-backed context and performs deterministic local curation.

## Run The CLI

During development, run through Cargo:

```bash
cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --bin agent_research -- \
  context --database /path/to/research-canvas.sqlite --project project-id \
  --query "mithraic bull sacrifice" --limit 8 --json
```

The installed binary is named `agent_research`.

Every command accepts `--json`. JSON responses use the envelope:

```json
{
  "ok": true,
  "command": "context",
  "warnings": [],
  "data": {}
}
```

Errors return `ok: false`, the command name, a human-readable `error`, and any warnings. Without `--json`, read commands print short Markdown-ish summaries for a person at a terminal.

## File And Vault Commands

These commands need only real files on disk:

```bash
agent_research wikilinks --root /path/to/vault --file /path/to/vault/note.md --json
agent_research backlinks --root /path/to/vault --target "Mithras" --json
agent_research tag-file --file /path/to/vault/note.md --tag reviewed --json
```

`wikilinks` reads outbound Obsidian-style links such as `[[Target]]` and `[[Target|Alias]]`.

`backlinks` searches markdown/text-like files under the root for links to a wiki target, basename, relative path, or normalized title.

`tag-file` mutates the target markdown file only. It updates or creates YAML-like frontmatter, preserves line endings and the rest of the file where practical, rejects unsafe tag syntax, and reports whether anything changed.

## Project And Context Commands

These commands require a SQLite database path and a project id:

```bash
agent_research search --database /path/to/research-canvas.sqlite \
  --project project-id --query "bull sacrifice" --limit 8 --json

agent_research context --database /path/to/research-canvas.sqlite \
  --project project-id --query "bull sacrifice" --limit 8 --json

agent_research constellation-context --database /path/to/research-canvas.sqlite \
  --project project-id --json

agent_research note-skeleton --database /path/to/research-canvas.sqlite \
  --project project-id --query "bull sacrifice" --limit 8 --json
```

`search` rebuilds and queries the existing SQLite FTS index for the project root and attached resource roots. Hits include root metadata so an agent can distinguish project files from external resources.

`context` returns a structured context pack with file hits, parsed tags/wikilinks/backlinks, project metadata, constellation counts, timeline/layout metadata, warnings, and Neo4j graph context when Neo4j is configured.

`constellation-context` returns the pack's constellation metadata.

`note-skeleton` returns deterministic Markdown under `data.markdown`. It is a scaffold, not generated prose: selected nodes, files, evidence to inspect, open questions, suggested links, and suggested graph relationships all point back to file paths or graph node ids.

Example context pack shape:

```json
{
  "ok": true,
  "command": "context",
  "warnings": [],
  "data": {
    "query": "mithraic bull sacrifice",
    "project": {
      "id": "project-id",
      "displayName": "Mithraic Study",
      "rootPath": "/abs/vault",
      "primaryCanvasId": "canvas-id"
    },
    "files": [
      {
        "path": "/abs/vault/rituals/mithras.md",
        "relativePath": "rituals/mithras.md",
        "title": "Mithras Tauroctony",
        "score": 1.23,
        "snippet": "The mithraic bull sacrifice...",
        "tags": ["source", "ritual"],
        "wikilinks": [{ "target": "Sol Invictus", "alias": null }],
        "backlinks": []
      }
    ],
    "nodes": [],
    "timeline": {
      "canvasId": "canvas-id",
      "neighborNodes": [],
      "visibleRange": null
    },
    "constellation": {
      "projectId": "project-id",
      "canvasId": "canvas-id",
      "nodeCount": 0,
      "relationshipCount": 0,
      "nodeIds": [],
      "relationshipIds": []
    },
    "suggestedNextActions": []
  }
}
```

## Neo4j-Backed Commands

Set the same Neo4j environment used by the app:

```bash
export NEO4J_URI=bolt://127.0.0.1:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=...
export NEO4J_DATABASE=neo4j
```

Then graph-backed reads and curation are available:

```bash
agent_research node-context --database /path/to/research-canvas.sqlite \
  --canvas canvas-id --node graph-node-id --json

agent_research tag-node --graph-node graph-node-id --tag contested --json

agent_research attach-evidence --database /path/to/research-canvas.sqlite \
  --graph-node graph-node-id --source-path /path/to/source.md \
  --quote "quoted evidence" --note "optional note" --json
```

`node-context` reads the Neo4j node and its relationships, and includes the SQLite layout row for the requested canvas when present.

`tag-node` adds an evidence tag idempotently.

`attach-evidence` canonicalizes the source file path, creates or reuses a `Source` node keyed by `coordinate = "vault-file:/canonical/path"`, and creates or reuses a `SOURCED_FROM` relationship with `sourcePath`, `quote`, and `note`. Re-running it with the same node/source/quote does not create duplicate relationships.

If Neo4j is not configured or unavailable, graph commands fail clearly and do not mutate SQLite or files. File-only commands continue to work.

## MCP And Agent Integration

The local MCP adapter in `.claude/mcp-servers/research-canvas` exposes read/context tools that shell out to this CLI:

- `agent_search_context`
- `agent_context_pack`
- `agent_wikilinks`
- `agent_backlinks`

Set `AGENT_RESEARCH_BIN` if the binary is not on `PATH`.

Codex, Claude, Pi, or another local agent should call the CLI or MCP adapter as a deterministic substrate:

1. Use Graphiti MCP for theory authoring and deduplication.
2. Use `agent_research search` or `agent_search_context` to find source-backed local material.
3. Use `agent_research context` or `agent_context_pack` to package files, layout, constellation, timeline, and scoped graph context.
4. Use `note-skeleton` for a deterministic research-note scaffold.
5. Use `tag-file`, `tag-node`, and `attach-evidence` only when the agent has explicit permission to curate local state.

## Troubleshooting

- Missing database path: pass `--database /absolute/path/to/research-canvas.sqlite`.
- Missing project id: use a real project id from the SQLite database; display names and slugs are not accepted.
- Missing root directories: context/search returns warnings and continues with roots that exist.
- Missing Neo4j: set `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, and optionally `NEO4J_DATABASE`. Graph commands fail until this is set.
- Malformed frontmatter: `tag-file` returns a structured error when safe conversion is ambiguous.
- Empty context: lower the query specificity, check the project root path, and confirm files are text-like markdown/resources that the indexer includes.

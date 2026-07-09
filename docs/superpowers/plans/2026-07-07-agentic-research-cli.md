# Agentic Research CLI Implementation Plan

> **For Claude/Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. If staying in one controlling session, use `superpowers:subagent-driven-development`: dispatch one fresh implementer subagent per task, then run a spec-compliance review and a code-quality review before moving on.

**Goal:** Build the first production-ready agentic intelligence layer for the Antichrist research canvas: a local CLI and reusable Rust tool layer that can search, read, tag, link, retrieve, and package context across vault files, timeline nodes, constellations/projects, source evidence, wiki links, SQLite layout state, and Neo4j graph substance.

**Architecture:** The first durable interface is a local, provider-neutral CLI binary, `agent_research`, backed by reusable Rust modules under `apps/desktop/src-tauri/src/agent/`. The CLI composes existing stores instead of creating a parallel substrate: file/vault retrieval uses real project and resource roots, timeline/constellation context uses SQLite project/canvas/layout state, and node/relationship substance uses Neo4j through the existing `GraphRepository`. Codex, Claude, Pi, and future MCP tools plug into this same command/JSON contract.

**Tech Stack:** Rust 2021, `rusqlite`, existing filesystem indexer, existing `GraphRepository`/`CanvasService`, `serde`/`serde_json`, manual CLI parsing initially, existing Neo4j test support, real temp filesystem fixtures, cargo integration tests, docs under `docs/`.

---

## Non-Negotiables

- Code for production readiness. No mock/demo/placeholder implementations.
- Tests must exercise real behavior: temp directories, real markdown files, real SQLite databases, and real Neo4j when available.
- Do not start long-running dev/Tauri/browser processes.
- Do not revert unrelated dirty worktree changes.
- Follow TDD: write failing tests first, verify failure, implement, verify pass.
- Keep the CLI provider-neutral. It prepares context and performs local curation; it does not call LLM providers in this pass.
- Mutations must be idempotent where possible and must report exactly what changed.

## Current System Facts To Preserve

- Project/resource roots are managed through `ProjectRepository` and `ResourceRootRepository`.
- Existing file indexing lives in `apps/desktop/src-tauri/src/fs/indexer.rs`.
- Existing SQLite FTS lives in `apps/desktop/src-tauri/src/db/repositories/search.rs`.
- Neo4j graph substance lives behind `apps/desktop/src-tauri/src/db/repositories/graph.rs`.
- Joined graph plus layout reads live in `apps/desktop/src-tauri/src/db/canvas_service.rs`.
- Node layout, card sizing, style, and constellation/project grouping are SQLite presentation state, not graph substance.
- Graphiti remains the future theory-authoring path. This CLI is the local retrieval/curation/context pack layer that any agent can call.

## User-Facing CLI Contract

The final CLI should be runnable without launching the app:

```bash
cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --bin agent_research -- \
  context --database /path/to/research-canvas.sqlite --project <project-id> \
  --query "mithraic bull sacrifice" --limit 8 --json
```

Supported v1 commands:

```bash
agent_research search --database <sqlite> --project <id> --query <text> --limit <n> --json
agent_research context --database <sqlite> --project <id> --query <text> --limit <n> --json
agent_research node-context --database <sqlite> --canvas <id> --node <graphNodeId> --json
agent_research constellation-context --database <sqlite> --project <id> --json
agent_research wikilinks --root <path> --file <path> --json
agent_research backlinks --root <path> --target <wiki-target-or-path> --json
agent_research tag-file --file <path> --tag <tag> --json
agent_research tag-node --graph-node <id> --tag <tag> --json
agent_research attach-evidence --database <sqlite> --graph-node <id> --source-path <path> --quote <text> --json
agent_research note-skeleton --database <sqlite> --project <id> --query <text> --limit <n> --json
```

`tag-node` and `attach-evidence` require Neo4j environment configuration. If Neo4j is unavailable, they must fail clearly without modifying SQLite or files.

## JSON Shape

All JSON responses share this envelope:

```json
{
  "ok": true,
  "command": "context",
  "warnings": [],
  "data": {}
}
```

Errors use:

```json
{
  "ok": false,
  "command": "context",
  "error": "human-readable message",
  "warnings": []
}
```

Context packs use this stable shape:

```json
{
  "query": "mithraic bull sacrifice",
  "project": {
    "id": "project-id",
    "displayName": "Constellation or Project",
    "rootPath": "/abs/path",
    "primaryCanvasId": "canvas-id"
  },
  "files": [
    {
      "path": "/abs/path/file.md",
      "relativePath": "supporting-bits/file.md",
      "title": "file.md",
      "score": 1.23,
      "snippet": "matched text",
      "tags": ["source"],
      "wikilinks": [{"target": "Mithras", "alias": null}],
      "backlinks": []
    }
  ],
  "nodes": [
    {
      "graphNodeId": "uuid",
      "entityType": "Event",
      "title": "Banda massacre",
      "summary": "...",
      "temporal": {
        "isTemporal": true,
        "validFrom": "1621",
        "validTo": null,
        "precision": "year"
      },
      "evidenceTags": ["contested"],
      "sourceKind": "archive",
      "relationships": []
    }
  ],
  "timeline": {
    "canvasId": "canvas-id",
    "neighborNodes": [],
    "visibleRange": null
  },
  "constellation": {
    "projectId": "project-id",
    "canvasId": "canvas-id",
    "nodeCount": 0,
    "relationshipCount": 0
  },
  "suggestedNextActions": []
}
```

---

## Task 1: Add Agent Module Skeleton And Shared Types

**Files:**
- Create: `apps/desktop/src-tauri/src/agent/mod.rs`
- Create: `apps/desktop/src-tauri/src/agent/types.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Test: `apps/desktop/src-tauri/tests/agent_types.rs`

**Steps:**
1. Write failing serialization tests for `AgentEnvelope`, `AgentWarning`, `WikiLink`, `VaultDocument`, `AgentContextPack`, and `AgentSearchHit`.
2. Run `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test agent_types -- --test-threads=1`; expect compile failure because module/types do not exist.
3. Implement serializable structs in `agent/types.rs`; expose them through `agent/mod.rs`.
4. Add `pub mod agent;` to `lib.rs`.
5. Re-run the test; expect pass.

Acceptance:
- JSON field names are camelCase.
- Warnings are structured with `code`, `message`, and optional `path`.
- No CLI behavior yet.

## Task 2: Parse Markdown Frontmatter, Tags, Headings, And Wikilinks

**Files:**
- Create: `apps/desktop/src-tauri/src/agent/markdown.rs`
- Modify: `apps/desktop/src-tauri/src/agent/mod.rs`
- Test: `apps/desktop/src-tauri/tests/agent_markdown.rs`

**Behavior:**
- Parse YAML-like frontmatter delimited by leading `---`.
- Extract tags from `tags: [a, b]`, `tags: a, b`, and list form:
  ```markdown
  tags:
    - myth
    - source
  ```
- Extract headings with level and text.
- Extract Obsidian wikilinks: `[[Target]]`, `[[Target|Alias]]`, `[[folder/page#Heading|Alias]]`.
- Return byte ranges for wikilinks so future edits can be precise.

**Steps:**
1. Write tests with real temp markdown files for each tag and wikilink form.
2. Verify tests fail.
3. Implement a small deterministic parser. Do not add a new dependency unless absolutely required.
4. Re-run tests.

Acceptance:
- Parser preserves non-frontmatter body text.
- Hidden files are not special-cased here; root indexing handles that.
- Invalid or unterminated frontmatter degrades to empty frontmatter plus full body.

## Task 3: Build Vault Index Over Real Roots

**Files:**
- Create: `apps/desktop/src-tauri/src/agent/vault.rs`
- Modify: `apps/desktop/src-tauri/src/agent/mod.rs`
- Test: `apps/desktop/src-tauri/tests/agent_vault.rs`

**Behavior:**
- Index one or more roots using existing `fs::indexer::index_directory`.
- Include markdown and text-like files.
- Skip hidden directories and existing skipped build dirs through the existing indexer.
- Deduplicate by canonical absolute path.
- Return `VaultDocument` with title, absolute path, root path, relative path, tags, headings, wikilinks, size, and text snippet.

**Steps:**
1. Write failing tests with a temp root and an attached resource root containing overlapping symlink/canonical paths if feasible.
2. Verify failure.
3. Implement indexing and dedupe.
4. Re-run tests.

Acceptance:
- Tests use real files, not fake in-memory documents.
- Large files are truncated safely for snippets, but path/link metadata still parses.

## Task 4: Add Backlink And Candidate Link Tools

**Files:**
- Modify: `apps/desktop/src-tauri/src/agent/vault.rs`
- Create: `apps/desktop/src-tauri/tests/agent_wikilinks.rs`

**Behavior:**
- `links_for_file(root, file)` returns outbound wikilinks.
- `backlinks(root, target)` finds files linking to a wiki target, basename, relative path, or normalized title.
- `candidate_links(root, file)` suggests existing files whose title/basename appears unlinked in the file text.

**Steps:**
1. Write failing tests using a fixture vault with at least five markdown files and ambiguous names.
2. Verify failure.
3. Implement target normalization: trim `.md`, normalize slash direction, lowercase for matching, preserve original display.
4. Re-run tests.

Acceptance:
- Candidate links do not suggest a link already present in the file.
- Backlinks include source path, target string, alias, and line number where possible.

## Task 5: Add Safe File Tag Mutation

**Files:**
- Create: `apps/desktop/src-tauri/src/agent/curation.rs`
- Modify: `apps/desktop/src-tauri/src/agent/mod.rs`
- Test: `apps/desktop/src-tauri/tests/agent_file_tags.rs`

**Behavior:**
- `add_file_tag(path, tag)` adds a tag to frontmatter.
- If frontmatter exists, update it without duplicating the tag.
- If no frontmatter exists, create frontmatter at top.
- Preserve the rest of the file byte-for-byte after the frontmatter block where practical.

**Steps:**
1. Write failing tests for no frontmatter, inline tags, list tags, duplicate tag no-op, and malformed frontmatter.
2. Verify failure.
3. Implement mutation with a clear `MutationReport { changed, path, detail }`.
4. Re-run tests.

Acceptance:
- No tag duplication.
- No mutation outside the target file.
- Malformed frontmatter returns a structured error unless safe conversion is unambiguous.

## Task 6: Fix Neo4j Evidence Patch Contract

**Files:**
- Modify: `apps/desktop/src-tauri/src/db/repositories/graph.rs`
- Modify: `apps/desktop/src-tauri/src/commands/graph.rs` if needed
- Test: `apps/desktop/src-tauri/tests/graph_node_evidence_patch.rs`

**Behavior:**
- Add `evidence_tags: Option<Vec<String>>` and `source_kind: Option<Option<String>>` to Rust `GraphNodePatch`.
- Update Neo4j properties through `update_node`.
- Preserve existing patch semantics.

**Steps:**
1. Write a Neo4j integration test using existing support helpers. If Neo4j is absent, the test should skip consistently like existing graph tests.
2. Verify failure.
3. Implement fields and update Cypher parameter handling.
4. Re-run the focused test.

Acceptance:
- `source_kind: Some(None)` clears the property.
- `evidence_tags: Some(vec![])` clears tags to an empty array.
- TypeScript contract and Rust contract now agree.

## Task 7: Improve Graph Search For Context Retrieval

**Files:**
- Modify: `apps/desktop/src-tauri/src/db/repositories/graph.rs`
- Test: `apps/desktop/src-tauri/tests/graph_search_context.rs`

**Behavior:**
- Include node body in the graph search path used by the agent layer.
- Prefer a new method over destabilizing existing UI search if needed:
  `pub async fn search_context(&self, query_text: &str, limit: i64) -> Result<Vec<GraphNode>, String>`.
- If Neo4j fulltext index changes are needed, create a new index name to avoid breaking existing `search`.

**Steps:**
1. Write a Neo4j test where the query term appears only in `body`, not title/summary.
2. Verify failure.
3. Implement context search.
4. Re-run the focused test.

Acceptance:
- Existing `search` behavior remains compatible unless tests prove it can be safely widened.
- Body search works with BlockNote JSON string bodies.

## Task 8: Compose Project Roots And File Search For CLI

**Files:**
- Create: `apps/desktop/src-tauri/src/agent/project.rs`
- Modify: `apps/desktop/src-tauri/src/agent/mod.rs`
- Test: `apps/desktop/src-tauri/tests/agent_project_roots.rs`

**Behavior:**
- Given `databasePath` and `projectId`, load the project root plus attached resource roots.
- Return roots with display names and canonical paths.
- Rebuild and query existing SQLite FTS for file/project hits through `SearchRepository`.
- Include root metadata in every file hit.

**Steps:**
1. Write tests with a real temp SQLite database, real project, and real attached resource root.
2. Verify failure.
3. Implement helper functions over existing repositories.
4. Re-run tests.

Acceptance:
- Attached resource roots are included.
- Duplicate roots are deduped.
- Missing root directories produce warnings, not panics.

## Task 9: Build Context Packager

**Files:**
- Create: `apps/desktop/src-tauri/src/agent/context.rs`
- Modify: `apps/desktop/src-tauri/src/agent/mod.rs`
- Test: `apps/desktop/src-tauri/tests/agent_context_pack.rs`

**Behavior:**
- Build context packs from:
  - file search hits
  - parsed vault documents
  - graph search hits when Neo4j is configured
  - project/canvas constellation metadata from SQLite
  - timeline/layout info from `CanvasService` when Neo4j is available
- If Neo4j is unavailable, return file/project context plus a warning.

**Steps:**
1. Write tests for file-only context using real SQLite and fixture vault.
2. Write a Neo4j-available test for graph nodes/relationships if support helper is present.
3. Verify failures.
4. Implement packager.
5. Re-run tests.

Acceptance:
- Context pack JSON is deterministic enough for snapshot-like assertions.
- Context includes source paths, project id, canvas id, graph node ids, relationship ids where available.
- No LLM calls.

## Task 10: Add Node Tag And Evidence Attachment Curation

**Files:**
- Modify: `apps/desktop/src-tauri/src/agent/curation.rs`
- Test: `apps/desktop/src-tauri/tests/agent_graph_curation.rs`

**Behavior:**
- `add_node_tag(graph, node_id, tag)` reads existing evidence tags, adds one, and updates Neo4j.
- `attach_evidence(graph, node_id, source_path, quote, note)` creates or reuses a `Source` node for the file path and creates a `SOURCED_FROM` relationship with properties `{ sourcePath, quote, note }`.
- If source node creation needs a deterministic key, derive it from canonical path and store it in `coordinate` or relationship properties only if consistent with existing ontology. Prefer a Source node title from file basename and `source_kind = "vault-file"`.

**Steps:**
1. Write Neo4j integration tests. Skip if Neo4j unavailable.
2. Verify failure.
3. Implement curation functions.
4. Re-run tests.

Acceptance:
- Re-running `attach_evidence` with same node/source/quote should not create duplicate relationships if a matching relationship already exists.
- Curation reports created/reused IDs.

## Task 11: Add CLI Binary

**Files:**
- Create: `apps/desktop/src-tauri/src/bin/agent_research.rs`
- Test: `apps/desktop/src-tauri/tests/agent_cli.rs`

**Behavior:**
- Manual argument parser is acceptable for v1.
- Every command supports `--json`.
- Without `--json`, print readable Markdown-ish output for humans.
- Exit code 0 on `ok: true`, nonzero on `ok: false`.

**Steps:**
1. Write CLI integration tests using `env!("CARGO_BIN_EXE_agent_research")` where possible.
2. Verify failure.
3. Implement binary dispatch to agent modules.
4. Re-run CLI tests.

Acceptance:
- `context`, `search`, `wikilinks`, `backlinks`, `tag-file`, and `note-skeleton` work without Neo4j.
- Graph mutation commands fail clearly when Neo4j env is missing.

## Task 12: Add Note Skeleton Generator

**Files:**
- Create: `apps/desktop/src-tauri/src/agent/note.rs`
- Modify: `apps/desktop/src-tauri/src/agent/mod.rs`
- Test: `apps/desktop/src-tauri/tests/agent_note_skeleton.rs`

**Behavior:**
- Generate a structured research-note draft from a context pack.
- This is not LLM prose. It is a deterministic scaffold:
  - title
  - query
  - selected graph nodes
  - relevant files
  - evidence to inspect
  - open questions
  - suggested wikilinks
  - suggested graph relationships

**Steps:**
1. Write tests from a hand-built context pack.
2. Verify failure.
3. Implement generator.
4. Re-run tests.

Acceptance:
- Output is valid Markdown.
- Every included claim points to a path or graph node id.

## Task 13: Expose Future MCP Adapter Without Overbuilding

**Files:**
- Create: `.claude/mcp-servers/research-canvas/src/tools/agent.ts`
- Modify: `.claude/mcp-servers/research-canvas/src/index.ts`
- Test: `.claude/mcp-servers/research-canvas/src/tools/agent.test.ts`

**Behavior:**
- Add MCP tools that shell out to the local CLI only for read/context commands:
  - `agent_search_context`
  - `agent_context_pack`
  - `agent_wikilinks`
  - `agent_backlinks`
- Do not add graph/file mutation MCP tools in this pass unless the CLI mutation tests are already green and the tool descriptions clearly warn that they mutate local data.

**Steps:**
1. Write tests for payload construction and command argument construction. Do not spawn the app.
2. Verify failure.
3. Implement minimal adapter.
4. Run MCP package tests.

Acceptance:
- MCP adapter uses CLI as the single implementation path.
- No duplicate business logic in TypeScript.

## Task 14: Write User Documentation

**Files:**
- Create: `docs/agent-research-cli.md`
- Modify: `README.md` only if adding a short pointer is useful

**Content:**
- What the CLI does and does not do.
- How to run file-only commands.
- How to run project/context commands.
- How to enable Neo4j-backed node/evidence commands.
- JSON examples for context packs.
- How Codex/Claude/Pi should call it.
- Troubleshooting: missing DB path, missing project id, missing Neo4j, malformed frontmatter.

**Steps:**
1. Write docs after CLI behavior is implemented.
2. Run docs-related tests if any exist.
3. Verify commands in docs match actual CLI help/output.

Acceptance:
- Docs do not promise provider integration.
- Docs explain that Graphiti remains the theory-authoring MCP path.

## Task 15: Final Verification

Run focused tests first:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test agent_types -- --test-threads=1
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test agent_markdown -- --test-threads=1
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test agent_vault -- --test-threads=1
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test agent_wikilinks -- --test-threads=1
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test agent_file_tags -- --test-threads=1
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test agent_project_roots -- --test-threads=1
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test agent_context_pack -- --test-threads=1
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test agent_cli -- --test-threads=1
```

Run broader checks:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1
pnpm exec tsc -b
pnpm vitest run
```

If MCP adapter was implemented:

```bash
npm test --prefix .claude/mcp-servers/research-canvas
npx --yes tsc --noEmit --project .claude/mcp-servers/research-canvas/tsconfig.json
```

Final report must state:
- exactly which commands passed
- which commands were skipped and why
- whether Neo4j-backed tests ran or skipped
- remaining limitations

---

## Fresh-Session Execution Strategy

Use subagents where tasks are naturally independent:

- Subagent A: Tasks 1-5, file/vault/wiki parser and mutation foundation.
- Subagent B: Tasks 6-7, Neo4j evidence patch and search context.
- Subagent C: Tasks 8-12, project roots, context pack, CLI, note skeleton.
- Subagent D: Task 13 MCP adapter, only after CLI tests are green.
- Main controller: review diffs after each task, run verification, coordinate conflicts, and write final docs/report.

Do not run implementers in parallel against the same files. The controller may dispatch research/review subagents in parallel, but implementation should remain sequential by task to avoid merge churn.

## Known Risks

- The worktree is currently dirty. Read `git status --short` before every task and never revert unrelated changes.
- Timeline/category UI work appears mid-flight. The CLI should read persisted layout/style data but must not depend on unfinished React timeline behavior.
- Neo4j may not be running in all environments. File-only commands must still work; graph commands must fail clearly or skip tests consistently.
- Existing SQLite search indexes legacy canvas nodes. Do not rely on it for Neo4j body retrieval; use the graph context search path for graph substance.
- `GraphRepository::connect_nodes` uses APOC map conversion. Keep tests aligned with the repo's Docker Neo4j/APOC setup.

# CLI-First Agent Tooling — Design Spec

**Date:** 2026-07-14
**Status:** Approved design, pending implementation plan

---

## 1. Problem

The app exposes two local, agent-facing surfaces that need no LLM provider and no running
MCP process:

- `agent_research` — a compiled Rust CLI binary (`apps/desktop/src-tauri/target/debug/agent_research`)
  covering vault/wiki files, SQLite search/context, and Neo4j graph reads + curation.
- A local HTTP API on `127.0.0.1:9876`, started by the running Tauri app, covering canvas
  layout (place/update/remove/batch-place nodes).

Both are real, both work, and both were verified live in this session. But an agent picking up
this repo cold has no way to discover either:

1. **CLAUDE.md never mentions them.** Its Documentation section lists `setup.md`,
   `architecture.md`, `data-model.md` — not `docs/agent-research-cli.md`, which is otherwise a
   solid, accurate reference. A fresh agent defaults to inventing something or reaching for the
   `research-canvas` MCP server, which exists only as a thin wrapper around these same two
   surfaces (`canvas.ts` tools `fetch()` port 9876; `agent.ts` tools `execFile()` the CLI binary)
   and adds a Node/tsx process + JSON-RPC framing for zero additional capability.
2. **The two files under `.claude/skills/` are dead.** `canvas-api.md` and `build-movement.md`
   are flat `.md` files directly in `.claude/skills/`, not the `.claude/skills/<name>/SKILL.md`
   layout Claude Code actually loads — confirmed absent from the available-skills listing. Worse,
   their content is stale: both document `canvas_create_node` / `canvas_create_edge` /
   `canvas_batch_create`, tools that predate the Neo4j cutover and no longer exist. `canvas.ts`
   today only exposes layout-only operations (`canvas_get_state`, `canvas_place_node`,
   `canvas_update_layout`, `canvas_remove_node`, `canvas_batch_place`) against nodes Graphiti has
   already authored.
3. **The port-9876 HTTP API has no accurate documentation anywhere.** The only place it was ever
   described (`canvas-api.md`) describes the wrong tool surface.
4. **Two of the seven `agent_cli.rs` integration tests are silently broken** in exactly the
   environment that matters most — a real dev checkout with a working `.env`. They assert the CLI
   fails cleanly with no Neo4j config; `Neo4jConfig::from_env()` actually falls back to reading
   `.env` straight off disk (via `find_up` from the compiled-in `CARGO_MANIFEST_DIR`), bypassing
   the tests' env-var-only guard. Reproduced twice: once with `.env` sourced into the shell, once
   with a fully clean `env -i` shell — same failure both times, because the fallback reads the
   file directly, not the process environment.
5. **`docs/agent-research-cli.md` examples use `--project`**, a compatibility alias, instead of
   the canonical `--constellation` flag.

## 2. Goals

- Make `agent_research` (CLI) + the port-9876 HTTP API the documented, first-class way for
  Claude Code to engage the app's three data layers (Neo4j graph, SQLite layout/search, vault
  markdown/wiki) from a shell — no MCP round-trip for routine work.
- Remove the `research-canvas` MCP server registration entirely; `graphiti` MCP (theory
  authoring) is untouched.
- Retire the two dead/stale `.claude/skills/*.md` files; replace with one real, loadable skill.
- Fix the `EnvGuard` test gap so "fails cleanly with no Neo4j config" is actually verified in a
  real dev checkout, not just in a hypothetical CI environment with no `.env` present.
- Fix the `--project` → `--constellation` staleness in `docs/agent-research-cli.md`.

**Explicitly out of scope:** no new CLI capabilities. Canvas layout mutation stays HTTP-API-only
(requires the live app process); `agent_research` is not being extended to cover it. The
`build-movement` workflow (episode spec → canvas nodes) is being deleted, not redesigned — it
needs a fresh design against the current Graphiti-authors/CLI-places split if wanted later.

## 3. Changes

### 3.1 CLAUDE.md

Add `docs/agent-research-cli.md` to the Documentation list. Add a short new section (near
Documentation or Development Commands) stating: `agent_research` (spawned directly) and the
local HTTP API (`curl` to `127.0.0.1:9876`) are the first-class way to engage app content from a
shell for Claude Code specifically — not MCP.

### 3.2 docs/agent-research-cli.md

- Replace `--project` with `--constellation` in every example command.
- Rewrite the "MCP And Agent Integration" section: it currently frames "the CLI or MCP adapter"
  as interchangeable. State plainly that the `research-canvas` MCP server has been removed and
  the CLI + HTTP API are the only sanctioned path for Claude Code. (Other agents named in that
  section — Codex, Pi — are out of scope for this pass; the doc should stop implying an MCP path
  exists for anyone without re-litigating their tooling here.)

### 3.3 New skill: `.claude/skills/research-canvas-cli/SKILL.md`

Correct format this time (`<name>/SKILL.md`), so Claude Code actually loads it. Two parts:

**Reference** — every `agent_research` subcommand (flags, what it reads/writes, required env,
JSON envelope shape) transcribed from `docs/agent-research-cli.md` and
`apps/desktop/src-tauri/src/bin/agent_research.rs` (the binary's `--help` only prints a generic
top-level command list, not per-command flags, so it's not a usable reference source on its
own), plus the four port-9876 HTTP routes transcribed from `apps/desktop/src-tauri/src/api/mod.rs`
and `handlers.rs` (ground truth, not the stale `canvas-api.md`):

| Route | Method | Purpose |
|---|---|---|
| `/api/canvas` | GET | Read active canvas: nodes + edges, joined layout + graph data |
| `/api/layout/node` | PUT | Place or restyle one node's layout row |
| `/api/layout/batch` | POST | Place multiple nodes' layout rows in one call |
| `/api/layout/node/:graphNodeId` | DELETE | Remove a node's layout row (graph node untouched) |

**Workflow** — the same procedure already in `docs/agent-research-cli.md`:
1. Graphiti MCP for theory authoring/deduplication (unchanged — still MCP, still the only path
   for writing graph substance).
2. `agent_research search` / `context` for source-backed local material.
3. `agent_research note-skeleton` for a deterministic research-note scaffold.
4. `agent_research tag-file` / `tag-node` / `attach-evidence` only with explicit permission to
   curate local state.
5. Port-9876 HTTP API only for canvas layout (placing/moving/removing nodes Graphiti has already
   authored) — requires the Tauri app running.

Delete `.claude/skills/canvas-api.md` and `.claude/skills/build-movement.md`.

### 3.4 `.claude/settings.json`

Remove the `research-canvas` entry from `mcpServers`. Leave `graphiti` untouched. Leave
`.claude/mcp-servers/research-canvas/` source in place (harmless dead code, not wired to
anything once the registration is gone) — not deleting the implementation in this pass.

### 3.5 `Neo4jConfig::from_env` test bypass

Add a test-only escape hatch so "no Neo4j config" is actually testable in a real checkout:

```rust
// apps/desktop/src-tauri/src/db/neo4j/config.rs
fn from_env_with_optional_dotenv(dotenv_path: Option<PathBuf>) -> Result<Self, String> {
    let dotenv_path = if std::env::var("RESEARCH_CANVAS_SKIP_DOTENV").is_ok() {
        None
    } else {
        dotenv_path
    };
    // ... unchanged from here
}
```

Nothing outside the two affected tests ever sets `RESEARCH_CANVAS_SKIP_DOTENV` — zero behavior
change for the real app or real CLI invocations. `EnvGuard::without_neo4j()` in `agent_cli.rs`
sets it (via `Command::env(...)` on the spawned subprocess, alongside removing/not-forwarding
`NEO4J_URI`/`NEO4J_PASSWORD`) and the `Drop` impl un-sets it.

Rejected alternatives:
- Temporarily rename the real `.env` on disk during the test — mutates a live credentials file
  shared with the actually-running app; a panic mid-test leaves it renamed and could break the
  app's next Neo4j reconnect.
- Weaken the test to assert on a bogus-password *connection* failure instead of a
  *missing-config* failure — quietly drops the real "fresh clone, no `.env` yet" coverage instead
  of fixing it.

## 4. Testing

- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test agent_cli -- --test-threads=1`
  — all 7 tests pass, including the previously-broken two, for real (not skipped/ignored).
- Full existing suite re-run (`pnpm vitest run`, `pnpm exec tsc -b`, full `cargo test ...
  --test-threads=1`) to confirm no regressions from the config.rs change.
- Manual live sanity pass: 2-3 `agent_research` commands + 1 `curl` call against the running app
  and live Neo4j, same style as already done earlier in this session.
- `.claude/settings.json` change verified by confirming `research-canvas` no longer appears in
  a fresh session's MCP tool listing (informational — can't be asserted by an automated test).

## 5. File-level change list

| File | Change |
|---|---|
| `CLAUDE.md` | Add `agent-research-cli.md` to docs list; add CLI-first guidance section |
| `docs/agent-research-cli.md` | `--project` → `--constellation`; rewrite MCP section |
| `.claude/skills/research-canvas-cli/SKILL.md` | New — reference + workflow |
| `.claude/skills/canvas-api.md` | Delete |
| `.claude/skills/build-movement.md` | Delete |
| `.claude/settings.json` | Remove `research-canvas` MCP server entry |
| `apps/desktop/src-tauri/src/db/neo4j/config.rs` | Add `RESEARCH_CANVAS_SKIP_DOTENV` bypass |
| `apps/desktop/src-tauri/tests/agent_cli.rs` | `EnvGuard` sets/unsets the bypass var |

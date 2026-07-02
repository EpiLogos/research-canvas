# Graphiti MCP setup (operator runbook)

Short, concrete steps to get the agent's theory-authoring loop running locally.
Reads with `docs/superpowers/plans/2026-06-28-ws0-contracts-and-architecture.md` §1 and §6.

## 1. Start Neo4j

```bash
cd "/Users/admin/Documents/Antichrist Project"
docker compose up -d
```

This starts the single `neo4j:5.26-community` service defined in `docker-compose.yml`
(bolt on `7687`, browser UI on `7474`, APOC enabled — required by Graphiti).

## 2. Configure env

```bash
cp .env.example .env
```

Fill in `.env`:

- `NEO4J_PASSWORD` — required, no default (used by both the Tauri app and the
  Graphiti MCP, and by `docker-compose.yml`'s `NEO4J_AUTH`).
- `GOOGLE_API_KEY` — required for Graphiti's Gemini-backed LLM/embedder/reranker.

Leave `NEO4J_URI`, `NEO4J_USER`, `NEO4J_DATABASE`, and the `GRAPHITI_*_MODEL`
vars at their `.env.example` defaults unless you have a reason to change them.

`.env` is git-ignored; the Tauri app loads it at startup, and Claude Code
substitutes `${VAR}` references from the same shell env into `.claude/settings.json`
when launching the `graphiti` MCP server (see step 3).

## 3. The two MCP servers

`.claude/settings.json` registers both:

- **`research-canvas`** — place-on-canvas / layout only, keyed by `graphNodeId`.
  Talks to the app's internal HTTP API on `:9876`. It cannot create or edit
  theory (no `canvas_create_node`, no `canvas_create_edge` — those were removed;
  see contracts §6.1).
- **`graphiti`** — Graphiti's official Python MCP (`uvx graphiti-mcp`), the
  agent's theory-write path. Talks bolt directly to the same Neo4j the app uses.

## 4. Agent loop

1. Agent calls Graphiti's `add_episode` (or other entity/relationship tools)
   to author or update theory substance in Neo4j — nodes, relationships,
   provenance, bi-temporal bookkeeping. This does **not** touch the canvas.
2. Agent calls `research-canvas`'s `canvas_get_state` (read-only) to see what
   graph nodes exist and how the current canvas is laid out.
3. Agent calls `canvas_place_node` (single) or `canvas_batch_place` (many) with
   the new `graphNodeId`(s) to surface the newly-authored node(s) on the
   active canvas. This only upserts a layout row — it never mutates theory.
4. The desktop app's Agent Activity panel (right panel) shows what the agent
   added/changed (from the `agent_activity` log) and offers a **Review & place**
   action per entry — clicking it places that node onto the canvas (via the
   same layout upsert path) so it can then be opened in the timeline/canvas
   reader.

Notes:
- Placing a node is a prerequisite for opening it in `FullScreenReader`'s node
  mode, which only resolves nodes already on the active canvas — so step 3 (or
  the "Review & place" action) must happen before a newly-authored node is
  readable in the desktop UI.
- The canvas and activity feed do not auto-refresh after an agent ingest;
  refresh is driven by the `canvas:updated` Tauri event fired after any
  `:9876` mutation (including layout upserts from `canvas_place_node`).

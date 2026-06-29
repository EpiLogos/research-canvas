# Terminal / Agent MCP UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the terminal passthrough intact, wire the **Graphiti MCP** so the terminal agent authors theory nodes/episodes/relationships directly into Neo4j, slim the repo's **`research-canvas` MCP** down to place-on-canvas / layout-only tools keyed by `graphNodeId`, and make the agent loop **legible**: an "Agent Activity" feed surfaces what the agent added/changed (new nodes, episodes, relationships) and lets the developer review new nodes and place them on the canvas/timeline.

**Architecture:** The terminal agent (Claude Code / Codex) writes theory substance through Graphiti's official Python MCP server (registered in `.claude/settings.json`). The repo's `research-canvas` MCP no longer authors theory — its theory-write tools (`canvas_create_node`, `canvas_update_node`, `canvas_delete_node`, `canvas_create_edge`, `canvas_delete_edge`, `canvas_batch_create`) are deleted and replaced with layout-only tools (`canvas_get_state`, `canvas_place_node`, `canvas_update_layout`, `canvas_remove_node`, `canvas_batch_place`) that hit the internal HTTP API on `:9876`. **WS2 Task 15 owns the `:9876` slim-down** (replacing the theory-mutation routes with layout/place routes backed by **`LayoutRepository`**, SQLite; `GET /api/canvas` returns the layout-joined read, and the full graph⨝layout substance reaches the UI via WS2's `load_canvas_view_command`). WS6 is **additive on top of WS2**: it adds a new Rust "agent activity log" table/repository, and records an `agent_activity` row inside WS2's existing `upsert_node_layout` / `batch_place` handlers (no route, type, or `start_server` signature changes). The Tauri frontend reads the log through a new `WorkspaceTransport.listAgentActivity` method, renders an **Agent Activity** right-panel tab, and offers a "Review & place" action that calls WS2's `upsertNodeLayout` (threading the workspace `databasePath`, which WS2's `upsert_node_layout_command` requires). The `canvas:updated` Tauri event already fires after `:9876` mutations and triggers a refresh.

**Tech Stack:** Tauri v2; React 19 + Vite 7 + TypeScript 5.9; pnpm monorepo; XYFlow `@xyflow/react` v12.8.5; Zustand v5 vanilla stores; Rust backend (`rusqlite` sync, `neo4rs` async); MCP via `@modelcontextprotocol/sdk` (TypeScript) for `research-canvas` and the external Graphiti Python MCP; Vitest (frontend) + `cargo test` (Rust, `--test-threads=1`).

## Global Constraints

Tauri v2; React 19 + Vite 7 + TypeScript 5.9; pnpm monorepo; XYFlow @xyflow/react v12.8.5; Zustand v5 vanilla stores; test-first (TDD) for every backend repository, frontend state model, and export behavior; prefer REAL integration tests (real SQLite in temp dir, real Neo4j against an ephemeral/docker instance, real fixture filesystem) over mocks; ALWAYS run Rust tests with `--test-threads=1`; keep file/folder/package names per the repo's existing conventions.

---

## Dependencies on other workstreams (read before starting)

This workstream **consumes** types and methods defined by WS0 (contracts) and implemented by WS2 (data layer). Each task's **Interfaces → Consumes** block names the exact signatures relied upon. The load-bearing ones:

- **WS0 §4.1 / §4.2 — `GraphRepository`** (Rust, `apps/desktop/src-tauri/src/db/repositories/graph.rs`):
  - `pub fn new(graph: crate::db::neo4j::SharedGraph, database: String) -> Self`
  - `pub async fn get_node(&self, graph_node_id: &str) -> Result<Option<GraphNode>, String>`
  - `pub async fn get_nodes(&self, ids: &[String]) -> Result<Vec<GraphNode>, String>`
  - `pub async fn list_nodes_for_lens(&self, lens: &str) -> Result<Vec<GraphNode>, String>`
  - `pub async fn list_relationships(&self) -> Result<Vec<GraphRelationship>, String>`
  - Types `GraphNode`, `GraphRelationship` (Rust, `#[serde(rename_all = "camelCase")]`).
- **WS0 §4.3 — `LayoutRepository`** (Rust, `apps/desktop/src-tauri/src/db/repositories/layout.rs`):
  - `pub fn new(connection: &'conn rusqlite::Connection) -> Self`
  - `pub fn list_node_layout(&self, canvas_id: &str) -> rusqlite::Result<Vec<NodeLayoutRecord>>`
  - `pub fn upsert_node_layout(&self, record: &NodeLayoutRecord) -> rusqlite::Result<()>`
  - `pub fn upsert_node_layouts(&self, records: &[NodeLayoutRecord]) -> rusqlite::Result<usize>`
  - `pub fn delete_node_layout(&self, canvas_id: &str, graph_node_id: &str) -> rusqlite::Result<()>`
  - Type `NodeLayoutRecord` (Rust).
- **WS0 §5 — `WorkspaceTransport`** (TS, `packages/desktop-api/src/index.ts`): existing interface this plan extends with one new method `listAgentActivity`. Existing helpers reused: `invokeTauri<T>(command, args)`, `createWorkspaceTransport()`, `resolveBrowserBridgeBaseUrl()`.
- **WS1 — incremental layout save**: the SQLite layout tables `node_layout` / `canvas_app_state` from migration `0008_layout_store.sql`. WS6 adds a sibling migration `0009_agent_activity.sql`.

If, when you reach a task, `GraphRepository` / `LayoutRepository` are not yet present (WS2 not merged), **stop and integrate after WS2**. This plan assumes they exist exactly as in WS0. WS6 does **not** redefine them.

---

## Task 1 — Slim the `research-canvas` MCP: delete theory-write tool files

**Files:**
- Delete `/Users/admin/Documents/Antichrist Project/.claude/mcp-servers/research-canvas/src/tools/edges.ts`
- Delete `/Users/admin/Documents/Antichrist Project/.claude/mcp-servers/research-canvas/src/tools/batch.ts`
- Modify `/Users/admin/Documents/Antichrist Project/.claude/mcp-servers/research-canvas/src/index.ts` (lines 7-11: imports + `allTools`)

**Interfaces:**
- Consumes: nothing (pure deletion / re-wiring).
- Produces: `allTools` in `index.ts` becomes `[...canvasTools]` only (the new canvas tools are authored in Task 3).

Steps:

- [ ] **1.1** Confirm current state: run
  ```bash
  ls "/Users/admin/Documents/Antichrist Project/.claude/mcp-servers/research-canvas/src/tools/"
  ```
  Expect output containing `batch.ts`, `canvas.ts`, `edges.ts`.

- [ ] **1.2** Delete the two theory-write tool files:
  ```bash
  rm "/Users/admin/Documents/Antichrist Project/.claude/mcp-servers/research-canvas/src/tools/edges.ts" \
     "/Users/admin/Documents/Antichrist Project/.claude/mcp-servers/research-canvas/src/tools/batch.ts"
  ```
  Then re-run the `ls` from 1.1; expect only `canvas.ts` remaining.

- [ ] **1.3** Edit `index.ts` to drop the deleted imports and reduce `allTools`. Replace lines 7-11 (the two extra imports + the `allTools` line) so the top of the file reads exactly:
  ```ts
  import { Server } from "@modelcontextprotocol/sdk/server/index.js";
  import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
  import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
  } from "@modelcontextprotocol/sdk/types.js";
  import { canvasTools } from "./tools/canvas.js";

  const allTools = [...canvasTools];
  ```

- [ ] **1.4** Verify the MCP server still type-checks against the (now stale) `canvas.ts` — it will, because Task 3 rewrites `canvas.ts`. Run:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project/.claude/mcp-servers/research-canvas" && npx --yes tsc --noEmit
  ```
  Expect: exit code 0, no errors (the existing `canvas.ts` is still valid TypeScript).

- [ ] **1.5** Commit:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project" && git add -A && git commit -m "WS6: remove theory-write tools from research-canvas MCP

Graphiti MCP now owns theory authoring; research-canvas is layout-only.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 2 — Add a unit test for the slimmed MCP request payload mapping

The slimmed canvas tools translate camelCase MCP args into the snake_case JSON the HTTP API expects. We test the **payload-building** logic in isolation (no live HTTP), so the agent contract is locked before we touch the server. We extract the body-building into a pure function so it is testable.

**Files:**
- Create `/Users/admin/Documents/Antichrist Project/.claude/mcp-servers/research-canvas/src/tools/payloads.ts`
- Create `/Users/admin/Documents/Antichrist Project/.claude/mcp-servers/research-canvas/src/tools/payloads.test.ts`
- Modify `/Users/admin/Documents/Antichrist Project/.claude/mcp-servers/research-canvas/package.json` (add `vitest` devDependency + `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `buildPlaceNodeBody(input: PlaceNodeInput): PlaceNodeBody` where
    `PlaceNodeInput = { graphNodeId: string; x: number; y: number; width?: number; height?: number; dotColour?: string; bgColour?: string; textColour?: string; thumbnail?: string }`
    and `PlaceNodeBody = { graph_node_id: string; x: number; y: number; width?: number; height?: number; dot_colour?: string; bg_colour?: string; text_colour?: string; thumbnail?: string }`.
  - `buildUpdateLayoutBody(input: UpdateLayoutInput): UpdateLayoutBody` where `UpdateLayoutInput = Partial<PlaceNodeInput> & { graphNodeId: string }` and `UpdateLayoutBody = Partial<PlaceNodeBody> & { graph_node_id: string }`.
  - `buildBatchPlaceBody(input: { placements: Array<{ graphNodeId: string; x: number; y: number; width?: number; height?: number }> }): { placements: Array<{ graph_node_id: string; x: number; y: number; width?: number; height?: number }> }`.

Steps:

- [ ] **2.1** Add vitest to the MCP package. Edit `package.json` so `scripts` and `devDependencies` read exactly:
  ```json
  {
    "name": "research-canvas-mcp",
    "version": "1.0.0",
    "type": "module",
    "description": "MCP server for Research Canvas app",
    "scripts": {
      "start": "tsx src/index.ts",
      "test": "vitest run"
    },
    "dependencies": {
      "@modelcontextprotocol/sdk": "^1.0.0"
    },
    "devDependencies": {
      "@types/node": "^22.0.0",
      "tsx": "^4.19.0",
      "typescript": "^5.7.0",
      "vitest": "^3.0.0"
    }
  }
  ```
  Then install:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project/.claude/mcp-servers/research-canvas" && npm install
  ```
  Expect: `vitest` resolved, exit code 0.

- [ ] **2.2** Write the failing test. Create `src/tools/payloads.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import {
    buildBatchPlaceBody,
    buildPlaceNodeBody,
    buildUpdateLayoutBody,
  } from "./payloads.js";

  describe("research-canvas layout payload builders", () => {
    it("maps place-node camelCase args to snake_case body, dropping undefined", () => {
      expect(
        buildPlaceNodeBody({
          graphNodeId: "n-1",
          x: 10,
          y: 20,
          dotColour: "#4a4aff",
        }),
      ).toEqual({
        graph_node_id: "n-1",
        x: 10,
        y: 20,
        dot_colour: "#4a4aff",
      });
    });

    it("maps update-layout partial args, keeping only provided fields", () => {
      expect(
        buildUpdateLayoutBody({ graphNodeId: "n-2", width: 320 }),
      ).toEqual({ graph_node_id: "n-2", width: 320 });
    });

    it("maps batch placements preserving order", () => {
      expect(
        buildBatchPlaceBody({
          placements: [
            { graphNodeId: "a", x: 0, y: 0 },
            { graphNodeId: "b", x: 100, y: 0, width: 200 },
          ],
        }),
      ).toEqual({
        placements: [
          { graph_node_id: "a", x: 0, y: 0 },
          { graph_node_id: "b", x: 100, y: 0, width: 200 },
        ],
      });
    });
  });
  ```

- [ ] **2.3** Run it, expect FAIL:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project/.claude/mcp-servers/research-canvas" && npm test
  ```
  Expect failure: `Cannot find module './payloads.js'` (or `Failed to resolve import "./payloads.js"`).

- [ ] **2.4** Implement the builders. Create `src/tools/payloads.ts`:
  ```ts
  export interface PlaceNodeInput {
    graphNodeId: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    dotColour?: string;
    bgColour?: string;
    textColour?: string;
    thumbnail?: string;
  }

  export interface PlaceNodeBody {
    graph_node_id: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    dot_colour?: string;
    bg_colour?: string;
    text_colour?: string;
    thumbnail?: string;
  }

  export type UpdateLayoutInput = Partial<PlaceNodeInput> & {
    graphNodeId: string;
  };
  export type UpdateLayoutBody = Partial<PlaceNodeBody> & {
    graph_node_id: string;
  };

  function prune<T extends Record<string, unknown>>(obj: T): T {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        out[key] = value;
      }
    }
    return out as T;
  }

  export function buildPlaceNodeBody(input: PlaceNodeInput): PlaceNodeBody {
    return prune({
      graph_node_id: input.graphNodeId,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
      dot_colour: input.dotColour,
      bg_colour: input.bgColour,
      text_colour: input.textColour,
      thumbnail: input.thumbnail,
    });
  }

  export function buildUpdateLayoutBody(
    input: UpdateLayoutInput,
  ): UpdateLayoutBody {
    return prune({
      graph_node_id: input.graphNodeId,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
      dot_colour: input.dotColour,
      bg_colour: input.bgColour,
      text_colour: input.textColour,
      thumbnail: input.thumbnail,
    });
  }

  export function buildBatchPlaceBody(input: {
    placements: Array<{
      graphNodeId: string;
      x: number;
      y: number;
      width?: number;
      height?: number;
    }>;
  }): {
    placements: Array<{
      graph_node_id: string;
      x: number;
      y: number;
      width?: number;
      height?: number;
    }>;
  } {
    return {
      placements: input.placements.map((p) =>
        prune({
          graph_node_id: p.graphNodeId,
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
        }),
      ),
    };
  }
  ```

- [ ] **2.5** Run the test, expect PASS:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project/.claude/mcp-servers/research-canvas" && npm test
  ```
  Expect: `3 passed`.

- [ ] **2.6** Commit:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project" && git add -A && git commit -m "WS6: add tested layout-payload builders for slimmed MCP

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 3 — Rewrite `canvas.ts` with layout-only tools

Replace the theory-write tools in `canvas.ts` with the five layout tools from WS0 §6.2, using the tested builders from Task 2 and the existing `apiCall` client.

**Files:**
- Modify (full rewrite) `/Users/admin/Documents/Antichrist Project/.claude/mcp-servers/research-canvas/src/tools/canvas.ts`
- Create `/Users/admin/Documents/Antichrist Project/.claude/mcp-servers/research-canvas/src/tools/canvas.test.ts`

**Interfaces:**
- Consumes:
  - `apiCall<T>(method: string, path: string, body?: unknown): Promise<T>` from `../client.js` (existing).
  - `buildPlaceNodeBody`, `buildUpdateLayoutBody`, `buildBatchPlaceBody` from `./payloads.js` (Task 2).
- Produces: `canvasTools` — an array of MCP tool definitions, each `{ name, description, inputSchema, handler }`, with names exactly `canvas_get_state`, `canvas_place_node`, `canvas_update_layout`, `canvas_remove_node`, `canvas_batch_place`.

Steps:

- [ ] **3.1** Write the failing test. Create `src/tools/canvas.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import { canvasTools } from "./canvas.js";

  describe("slimmed canvasTools", () => {
    it("exposes exactly the layout-only tools", () => {
      expect(canvasTools.map((t) => t.name).sort()).toEqual([
        "canvas_batch_place",
        "canvas_get_state",
        "canvas_place_node",
        "canvas_remove_node",
        "canvas_update_layout",
      ]);
    });

    it("does not expose any theory-write tools", () => {
      const names = canvasTools.map((t) => t.name);
      for (const banned of [
        "canvas_create_node",
        "canvas_update_node",
        "canvas_delete_node",
        "canvas_create_edge",
        "canvas_delete_edge",
        "canvas_batch_create",
      ]) {
        expect(names).not.toContain(banned);
      }
    });

    it("requires graphNodeId on place_node", () => {
      const place = canvasTools.find((t) => t.name === "canvas_place_node");
      expect(place?.inputSchema.required).toEqual(["graphNodeId", "x", "y"]);
    });
  });
  ```

- [ ] **3.2** Run it, expect FAIL:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project/.claude/mcp-servers/research-canvas" && npm test -- canvas.test.ts
  ```
  Expect failure: the current `canvas.ts` still exports `canvas_create_node` etc., so both list assertions fail.

- [ ] **3.3** Replace the entire contents of `src/tools/canvas.ts` with:
  ```ts
  import { apiCall } from "../client.js";
  import {
    buildBatchPlaceBody,
    buildPlaceNodeBody,
    buildUpdateLayoutBody,
    type PlaceNodeInput,
    type UpdateLayoutInput,
  } from "./payloads.js";

  export const canvasTools = [
    {
      name: "canvas_get_state",
      description:
        "List graph nodes on the active canvas with their layout (graphNodeId, entityType, title, position, style) and edges. Read-only. Call this first to see what already exists before placing.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [] as string[],
      },
      async handler(_input: Record<string, never>) {
        return apiCall("GET", "/api/canvas");
      },
    },
    {
      name: "canvas_place_node",
      description:
        "Place an existing graph node (by graphNodeId) on the active canvas at (x, y). Creates/updates its layout row only; does NOT create theory. Use after the Graphiti MCP has authored the node.",
      inputSchema: {
        type: "object" as const,
        properties: {
          graphNodeId: { type: "string", description: "Neo4j node id to place" },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
          dotColour: { type: "string" },
          bgColour: { type: "string" },
          textColour: { type: "string" },
          thumbnail: { type: "string" },
        },
        required: ["graphNodeId", "x", "y"] as string[],
      },
      async handler(input: PlaceNodeInput) {
        return apiCall("PUT", "/api/layout/node", buildPlaceNodeBody(input));
      },
    },
    {
      name: "canvas_update_layout",
      description:
        "Update an existing node's position, size, or style on the active canvas. Layout only; theory is untouched.",
      inputSchema: {
        type: "object" as const,
        properties: {
          graphNodeId: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
          dotColour: { type: "string" },
          bgColour: { type: "string" },
          textColour: { type: "string" },
          thumbnail: { type: "string" },
        },
        required: ["graphNodeId"] as string[],
      },
      async handler(input: UpdateLayoutInput) {
        return apiCall("PUT", "/api/layout/node", buildUpdateLayoutBody(input));
      },
    },
    {
      name: "canvas_remove_node",
      description:
        "Remove a node's placement from the active canvas. The graph node (theory) is NOT deleted.",
      inputSchema: {
        type: "object" as const,
        properties: {
          graphNodeId: { type: "string" },
        },
        required: ["graphNodeId"] as string[],
      },
      async handler(input: { graphNodeId: string }) {
        return apiCall(
          "DELETE",
          `/api/layout/node/${encodeURIComponent(input.graphNodeId)}`,
        );
      },
    },
    {
      name: "canvas_batch_place",
      description:
        "Place multiple existing graph nodes (by graphNodeId) on the active canvas in one call. Layout only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          placements: {
            type: "array",
            items: {
              type: "object",
              properties: {
                graphNodeId: { type: "string" },
                x: { type: "number" },
                y: { type: "number" },
                width: { type: "number" },
                height: { type: "number" },
              },
              required: ["graphNodeId", "x", "y"],
            },
          },
        },
        required: ["placements"] as string[],
      },
      async handler(input: {
        placements: Array<{
          graphNodeId: string;
          x: number;
          y: number;
          width?: number;
          height?: number;
        }>;
      }) {
        return apiCall("POST", "/api/layout/batch", buildBatchPlaceBody(input));
      },
    },
  ];
  ```

- [ ] **3.4** Run the test, expect PASS:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project/.claude/mcp-servers/research-canvas" && npm test
  ```
  Expect: all suites pass (payloads + canvas).

- [ ] **3.5** Type-check the whole MCP package (catches the `apiCall("DELETE", path)` overload + import paths):
  ```bash
  cd "/Users/admin/Documents/Antichrist Project/.claude/mcp-servers/research-canvas" && npx --yes tsc --noEmit
  ```
  Expect: exit code 0.

- [ ] **3.6** Commit:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project" && git add -A && git commit -m "WS6: rewrite research-canvas canvas tools as layout-only

canvas_get_state, canvas_place_node, canvas_update_layout,
canvas_remove_node, canvas_batch_place — all keyed by graphNodeId.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 4 — Migration `0009_agent_activity.sql` (SQLite agent-activity log)

The agent-activity feed needs a durable, queryable record. We record one row per observed graph mutation. This lives in SQLite (presentation/app-state side, same DB as layout) keyed by `graph_node_id`, so the desktop UI can list it without re-querying Neo4j.

**Files:**
- Create `/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/migrations/0009_agent_activity.sql`
- Modify `/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/src/db/migrations.rs` (register `0009_agent_activity` in the `MIGRATIONS` array)
- Create/append Rust test in `/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/tests/agent_activity_repository.rs`

**Interfaces:**
- Consumes: existing `crate::db::connection::Database::open(path) -> rusqlite::Result<Database>` and `Database::connection() -> &rusqlite::Connection` (existing repo pattern); the existing migration runner that applies all files in `MIGRATIONS` on `Database::open`.
- Produces: SQLite table `agent_activity` with columns:
  `id TEXT PK`, `canvas_id TEXT NULL`, `kind TEXT NOT NULL` (`"node_created"|"node_updated"|"relationship_created"|"episode_ingested"`), `graph_node_id TEXT NULL`, `relationship_id TEXT NULL`, `title TEXT NOT NULL DEFAULT ''`, `entity_type TEXT NULL`, `detail_json TEXT NOT NULL DEFAULT '{}'`, `reviewed INTEGER NOT NULL DEFAULT 0`, `placed INTEGER NOT NULL DEFAULT 0`, `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`.

Steps:

- [ ] **4.1** Inspect how migrations are registered so the new file slots in correctly:
  ```bash
  grep -n "MIGRATIONS\|0008\|0007\|include_str" "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/src/db/migrations.rs"
  ```
  Note the exact array syntax and the highest existing migration number (WS1/WS2 add `0008_layout_store`; this task adds `0009`).

- [ ] **4.2** Write the failing integration test. Create `tests/agent_activity_repository.rs`:
  ```rust
  use research_canvas_desktop_lib::db::connection::Database;

  fn temp_db() -> (tempfile::TempDir, Database) {
      let dir = tempfile::tempdir().expect("tempdir");
      let path = dir.path().join("activity.db");
      let db = Database::open(path.to_str().unwrap()).expect("open db");
      (dir, db)
  }

  #[test]
  fn agent_activity_table_exists_after_migration() {
      let (_dir, db) = temp_db();
      let conn = db.connection();
      let count: i64 = conn
          .query_row(
              "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='agent_activity'",
              [],
              |row| row.get(0),
          )
          .expect("query sqlite_master");
      assert_eq!(count, 1, "agent_activity table should exist after migrations");
  }

  #[test]
  fn agent_activity_accepts_a_node_created_row() {
      let (_dir, db) = temp_db();
      let conn = db.connection();
      conn.execute(
          "INSERT INTO agent_activity (id, kind, graph_node_id, title, entity_type) \
           VALUES ('a1', 'node_created', 'gn-1', 'Cosimo de Medici', 'Figure')",
          [],
      )
      .expect("insert activity row");
      let (reviewed, placed): (i64, i64) = conn
          .query_row(
              "SELECT reviewed, placed FROM agent_activity WHERE id='a1'",
              [],
              |row| Ok((row.get(0)?, row.get(1)?)),
          )
          .expect("read defaults");
      assert_eq!(reviewed, 0);
      assert_eq!(placed, 0);
  }
  ```
  > Note: `research_canvas_desktop_lib` is the crate's `[lib] name` (verified in `apps/desktop/src-tauri/Cargo.toml` and matching every existing `tests/*.rs` `use research_canvas_desktop_lib::...` import). If it ever differs, confirm with `grep -n "^name" "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml"` under `[lib]` and match whatever the existing integration tests import.

- [ ] **4.3** Run it, expect FAIL:
  ```bash
  cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" agent_activity -- --test-threads=1
  ```
  Expect failure: `no such table: agent_activity`.

- [ ] **4.4** Create the migration file `migrations/0009_agent_activity.sql`:
  ```sql
  -- migrations/0009_agent_activity.sql
  -- Durable log of agent-observed graph mutations (presentation side, SQLite).
  -- Joins to Neo4j substance via graph_node_id when present.
  CREATE TABLE IF NOT EXISTS agent_activity (
      id              TEXT PRIMARY KEY NOT NULL,
      canvas_id       TEXT,
      kind            TEXT NOT NULL,            -- node_created | node_updated | relationship_created | episode_ingested
      graph_node_id   TEXT,
      relationship_id TEXT,
      title           TEXT NOT NULL DEFAULT '',
      entity_type     TEXT,
      detail_json     TEXT NOT NULL DEFAULT '{}',
      reviewed        INTEGER NOT NULL DEFAULT 0,
      placed          INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_agent_activity_created_at ON agent_activity(created_at);
  CREATE INDEX IF NOT EXISTS idx_agent_activity_graph_node_id ON agent_activity(graph_node_id);
  CREATE INDEX IF NOT EXISTS idx_agent_activity_reviewed ON agent_activity(reviewed);
  ```

- [ ] **4.5** Register it in `migrations.rs`. Add `0009_agent_activity` to the `MIGRATIONS` array immediately after `0008_layout_store`, matching the exact pattern observed in 4.1 (each entry is typically `("0009_agent_activity", include_str!("../../migrations/0009_agent_activity.sql"))` — copy the exact tuple shape used by the surrounding entries).

- [ ] **4.6** Run the test, expect PASS:
  ```bash
  cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" agent_activity -- --test-threads=1
  ```
  Expect: `test agent_activity_table_exists_after_migration ... ok` and `test agent_activity_accepts_a_node_created_row ... ok`.

- [ ] **4.7** Commit:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project" && git add -A && git commit -m "WS6: add agent_activity migration (0009) + tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 5 — `AgentActivityRepository` (Rust, SQLite)

A sync `rusqlite` repository mirroring the existing repo pattern. It records mutations and lists them for the UI, and flips `reviewed` / `placed` flags.

**Files:**
- Create `/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/src/db/repositories/agent_activity.rs`
- Modify `/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/src/db/repositories/mod.rs` (add `pub mod agent_activity;` and re-export the public types)
- Append to `/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/tests/agent_activity_repository.rs`

**Interfaces:**
- Consumes: `rusqlite::Connection` (existing); the `agent_activity` table (Task 4).
- Produces:
  ```rust
  // src/db/repositories/agent_activity.rs
  #[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct AgentActivityRecord {
      pub id: String,
      pub canvas_id: Option<String>,
      pub kind: String,
      pub graph_node_id: Option<String>,
      pub relationship_id: Option<String>,
      pub title: String,
      pub entity_type: Option<String>,
      pub detail_json: String,
      pub reviewed: bool,
      pub placed: bool,
      pub created_at: String,
  }

  #[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct NewAgentActivity {
      pub kind: String,
      pub canvas_id: Option<String>,
      pub graph_node_id: Option<String>,
      pub relationship_id: Option<String>,
      pub title: String,
      pub entity_type: Option<String>,
      pub detail_json: String,
  }

  pub struct AgentActivityRepository<'conn> { connection: &'conn rusqlite::Connection }

  impl<'conn> AgentActivityRepository<'conn> {
      pub fn new(connection: &'conn rusqlite::Connection) -> Self;
      pub fn record(&self, input: &NewAgentActivity) -> rusqlite::Result<AgentActivityRecord>;
      pub fn list_recent(&self, limit: i64) -> rusqlite::Result<Vec<AgentActivityRecord>>;
      pub fn mark_reviewed(&self, id: &str) -> rusqlite::Result<()>;
      pub fn mark_placed(&self, graph_node_id: &str) -> rusqlite::Result<()>;
  }
  ```

Steps:

- [ ] **5.1** Append failing tests to `tests/agent_activity_repository.rs`:
  ```rust
  use research_canvas_desktop_lib::db::repositories::agent_activity::{
      AgentActivityRepository, NewAgentActivity,
  };

  fn sample(kind: &str, gid: &str, title: &str) -> NewAgentActivity {
      NewAgentActivity {
          kind: kind.to_string(),
          canvas_id: Some("canvas-1".to_string()),
          graph_node_id: Some(gid.to_string()),
          relationship_id: None,
          title: title.to_string(),
          entity_type: Some("Figure".to_string()),
          detail_json: "{}".to_string(),
      }
  }

  #[test]
  fn records_and_lists_recent_newest_first() {
      let (_dir, db) = temp_db();
      let conn = db.connection();
      let repo = AgentActivityRepository::new(conn);
      let first = repo.record(&sample("node_created", "gn-1", "First")).unwrap();
      let second = repo.record(&sample("node_created", "gn-2", "Second")).unwrap();
      assert!(!first.id.is_empty());
      assert!(!first.reviewed);
      let recent = repo.list_recent(10).unwrap();
      assert_eq!(recent.len(), 2);
      // newest first
      assert_eq!(recent[0].id, second.id);
  }

  #[test]
  fn marks_reviewed_and_placed() {
      let (_dir, db) = temp_db();
      let conn = db.connection();
      let repo = AgentActivityRepository::new(conn);
      let rec = repo.record(&sample("node_created", "gn-9", "Node")).unwrap();
      repo.mark_reviewed(&rec.id).unwrap();
      repo.mark_placed("gn-9").unwrap();
      let recent = repo.list_recent(10).unwrap();
      let found = recent.iter().find(|r| r.id == rec.id).unwrap();
      assert!(found.reviewed);
      assert!(found.placed);
  }
  ```

- [ ] **5.2** Run, expect FAIL:
  ```bash
  cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" agent_activity -- --test-threads=1
  ```
  Expect failure: `unresolved import research_canvas_desktop_lib::db::repositories::agent_activity`.

- [ ] **5.3** Create `src/db/repositories/agent_activity.rs`:
  ```rust
  use rusqlite::{params, Connection, Result};

  #[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct AgentActivityRecord {
      pub id: String,
      pub canvas_id: Option<String>,
      pub kind: String,
      pub graph_node_id: Option<String>,
      pub relationship_id: Option<String>,
      pub title: String,
      pub entity_type: Option<String>,
      pub detail_json: String,
      pub reviewed: bool,
      pub placed: bool,
      pub created_at: String,
  }

  #[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct NewAgentActivity {
      pub kind: String,
      pub canvas_id: Option<String>,
      pub graph_node_id: Option<String>,
      pub relationship_id: Option<String>,
      pub title: String,
      pub entity_type: Option<String>,
      pub detail_json: String,
  }

  pub struct AgentActivityRepository<'conn> {
      connection: &'conn Connection,
  }

  impl<'conn> AgentActivityRepository<'conn> {
      pub fn new(connection: &'conn Connection) -> Self {
          Self { connection }
      }

      pub fn record(&self, input: &NewAgentActivity) -> Result<AgentActivityRecord> {
          let id = uuid::Uuid::new_v4().to_string();
          self.connection.execute(
              "INSERT INTO agent_activity \
               (id, canvas_id, kind, graph_node_id, relationship_id, title, entity_type, detail_json) \
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
              params![
                  id,
                  input.canvas_id,
                  input.kind,
                  input.graph_node_id,
                  input.relationship_id,
                  input.title,
                  input.entity_type,
                  input.detail_json,
              ],
          )?;
          self.get(&id).map(|opt| opt.expect("row just inserted"))
      }

      fn get(&self, id: &str) -> Result<Option<AgentActivityRecord>> {
          let mut stmt = self.connection.prepare(
              "SELECT id, canvas_id, kind, graph_node_id, relationship_id, title, \
               entity_type, detail_json, reviewed, placed, created_at \
               FROM agent_activity WHERE id = ?1",
          )?;
          let mut rows = stmt.query_map(params![id], Self::map_row)?;
          match rows.next() {
              Some(r) => Ok(Some(r?)),
              None => Ok(None),
          }
      }

      pub fn list_recent(&self, limit: i64) -> Result<Vec<AgentActivityRecord>> {
          let mut stmt = self.connection.prepare(
              "SELECT id, canvas_id, kind, graph_node_id, relationship_id, title, \
               entity_type, detail_json, reviewed, placed, created_at \
               FROM agent_activity ORDER BY created_at DESC, rowid DESC LIMIT ?1",
          )?;
          let rows = stmt.query_map(params![limit], Self::map_row)?;
          rows.collect()
      }

      pub fn mark_reviewed(&self, id: &str) -> Result<()> {
          self.connection.execute(
              "UPDATE agent_activity SET reviewed = 1 WHERE id = ?1",
              params![id],
          )?;
          Ok(())
      }

      pub fn mark_placed(&self, graph_node_id: &str) -> Result<()> {
          self.connection.execute(
              "UPDATE agent_activity SET placed = 1 WHERE graph_node_id = ?1",
              params![graph_node_id],
          )?;
          Ok(())
      }

      fn map_row(row: &rusqlite::Row<'_>) -> Result<AgentActivityRecord> {
          Ok(AgentActivityRecord {
              id: row.get(0)?,
              canvas_id: row.get(1)?,
              kind: row.get(2)?,
              graph_node_id: row.get(3)?,
              relationship_id: row.get(4)?,
              title: row.get(5)?,
              entity_type: row.get(6)?,
              detail_json: row.get(7)?,
              reviewed: row.get::<_, i64>(8)? != 0,
              placed: row.get::<_, i64>(9)? != 0,
              created_at: row.get(10)?,
          })
      }
  }
  ```
  > `uuid` is already a dependency of this crate (used by `CanvasGraphRepository`). Confirm with `grep -n "uuid" "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml"`; if absent, add `uuid = { version = "1", features = ["v4"] }`.

- [ ] **5.4** Register the module. In `src/db/repositories/mod.rs` add (matching the existing `pub mod ...;` / re-export style):
  ```rust
  pub mod agent_activity;
  pub use agent_activity::{AgentActivityRecord, AgentActivityRepository, NewAgentActivity};
  ```

- [ ] **5.5** Run the tests, expect PASS:
  ```bash
  cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" agent_activity -- --test-threads=1
  ```
  Expect: all four `agent_activity` tests `ok`.

- [ ] **5.6** Commit:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project" && git add -A && git commit -m "WS6: AgentActivityRepository (record/list/mark)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 6 — Add `agent_activity` recording to the (WS2-owned) `:9876` layout handlers

> **HARD DEPENDENCY — WS2 Task 15 owns the `:9876` slim-down.** WS2 Task 15 ("Internal HTTP API (`:9876`) re-pointed to layout/place routes") already **rewrites `api/types.rs`, `api/handlers.rs`, and the `api/mod.rs` dispatch**, deleting the theory-mutation routes and adding `GET /api/canvas` (layout-only joined read), `PUT /api/layout/node`, `DELETE /api/layout/node/:graphNodeId`, `POST /api/layout/batch`. **WS6 does NOT redefine those types or rewrite those files.** If WS2 Task 15 is not yet merged when you reach this task, **stop and integrate after WS2**. This task only *adds* an `agent_activity` row to the existing `upsert_node_layout` / `batch_place` handlers (and, optionally, enriches the activity title/type from Neo4j — see 6.1).

WS2 Task 15 produces the canonical names this task consumes verbatim:
- **Types (in `api/types.rs`, do not redefine):** `PlaceNodeRequest { graph_node_id, x, y, width?, height?, dot_colour?, bg_colour?, text_colour?, thumbnail? }`, `BatchPlaceItem`, `BatchPlaceRequest { placements }`, `PlacedNodeResponse { ok, graph_node_id }`, `RemoveNodeResponse { ok }`, `BatchPlaceResponse { ok, placed }`. All `#[serde(rename_all = "camelCase")]` where noted in WS2.
- **Handlers (in `api/handlers.rs`):** `get_canvas(state: &SharedApiState) -> Result<serde_json::Value, String>` (layout-only, sync), `upsert_node_layout(req: PlaceNodeRequest, state: &SharedApiState) -> Result<PlacedNodeResponse, String>`, `remove_node_layout(graph_node_id: String, state: &SharedApiState) -> Result<RemoveNodeResponse, String>`, `batch_place(req: BatchPlaceRequest, state: &SharedApiState) -> Result<BatchPlaceResponse, String>`. **All synchronous, SQLite-only — WS2's `:9876` handlers do NOT take a `SharedGraph` or a `tokio::runtime::Handle`, and `start_server`'s signature is unchanged by WS2.**
- **Dispatch (in `api/mod.rs`):** the slimmed `match (method, path)` arms (WS2 Task 15 step 5) and the `Method::Put` body-read extension already exist.

This task makes the smallest possible additive change: after `upsert_node_layout` / `batch_place` write the SQLite layout, also `record` an `agent_activity` row so the feed legibly reflects what the agent placed. `get_canvas` and `remove_node_layout` are unchanged. The `canvas:updated` event continues to fire from WS2's dispatch (unchanged).

**Files:**
- Modify `/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/src/api/handlers.rs` (add `agent_activity` recording inside the WS2 `upsert_node_layout` + `batch_place` handlers only — do **not** rewrite the file or touch `get_canvas` / `remove_node_layout`)
- (No change to `api/types.rs` or `api/mod.rs` — owned by WS2 Task 15.)

**Interfaces:**
- Consumes:
  - WS2 Task 15's handlers + types named above (do not redefine).
  - `LayoutRepository` (already used by the WS2 handlers; WS0 §4.3) — reused as-is.
  - `AgentActivityRepository::new(conn)`, `AgentActivityRepository::record(&NewAgentActivity)`, `NewAgentActivity` (Task 5).
  - Existing `SharedApiState` with `db_path`, `active_canvas_id`.
- Produces: every `PUT /api/layout/node` and `POST /api/layout/batch` mutation now also writes an `agent_activity` row (`node_created` on first placement, `node_updated` on a subsequent one). `GET /api/canvas`, `DELETE /api/layout/node/:graphNodeId`, and `start_server`'s signature are untouched.

> **Activity title/type enrichment (OPTIONAL, off the hot path).** The activity row's `title`/`entity_type` are best-effort cosmetics for the feed. WS2's `:9876` handlers are deliberately SQLite-only and synchronous — they have **no** `SharedGraph` and **no** `tokio::runtime::Handle`, because WS2 did **not** thread a runtime handle into `start_server`. **Do not assume a runtime handle is reachable from `lib.rs` or `start_server`.** Default to recording `title: String::new()` / `entity_type: None` here; the Agent Activity panel already shows the kind and graph node id, and `GET /api/canvas` plus the Tauri `load_canvas_view_command` (WS2 Task 13/14) supply substance to the UI. If you genuinely want the title resolved at record time, you must add the runtime yourself: amend WS2 to persist a `tokio::runtime::Handle` in managed state and pass it into `start_server` (preferred — coordinate the WS2 amendment), **or** have WS6 create and own a long-lived `tokio::runtime::Runtime` for the `:9876` server thread and pass its `Handle` into `start_server` + the two handlers. Both options are extra scope and are **hard-gated on amending WS2 Task 15's `start_server` signature**; the steps below take the no-enrichment path so WS6 stays additive and does not fork WS2's files.

Steps:

- [ ] **6.1** Confirm WS2 Task 15 has already slimmed `:9876` (this task is additive on top of it). Verify the canonical handlers + types exist before editing:
  ```bash
  grep -n "pub fn upsert_node_layout\|pub fn batch_place\|pub fn get_canvas\|pub fn remove_node_layout" "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/src/api/handlers.rs"
  grep -n "PlaceNodeRequest\|BatchPlaceRequest\|PlacedNodeResponse\|RemoveNodeResponse\|BatchPlaceResponse" "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/src/api/types.rs"
  ```
  Expect: all four handlers and all five WS2 types present, and the theory-mutation routes already gone. **If they are absent, WS2 Task 15 is not merged — STOP and integrate after WS2.** Do not recreate the slim-down here; WS2 owns `api/types.rs` and the `api/mod.rs` dispatch, and WS6 must not fork them.

- [ ] **6.2** Note the runtime/graph situation before editing (Fix for the false runtime-handle assumption). WS2 Task 15's `:9876` handlers are **synchronous and SQLite-only**: `get_canvas`/`upsert_node_layout`/`remove_node_layout`/`batch_place` take only `(req?, state: &SharedApiState)`, and `start_server` was **not** given a `SharedGraph` or a `tokio::runtime::Handle`. There is **no runtime handle reachable from `lib.rs` or `start_server`**. This task therefore records `agent_activity` rows with `title: String::new()` / `entity_type: None` (no Neo4j read on the hot path). The Agent Activity panel surfaces the kind + graph node id regardless, and the UI gets substance via the Tauri `load_canvas_view_command` (WS2 Task 14). Do not add `graph`/`database`/`rt` parameters to these handlers or to `start_server`. (If title enrichment is later wanted, see the "Activity title/type enrichment" note above — it is hard-gated on a WS2 amendment to `start_server` and is out of scope here.)

- [ ] **6.3** Write the failing handler test. We test that placing through WS2's `upsert_node_layout` handler **also writes an `agent_activity` row** (the WS2-owned SQLite layout write is already covered by WS2's own `api_layout_dispatch.rs`). Create `tests/api_layout_handlers.rs`:
  ```rust
  use research_canvas_desktop_lib::api::handlers::upsert_node_layout;
  use research_canvas_desktop_lib::api::types::PlaceNodeRequest;
  use research_canvas_desktop_lib::db::connection::Database;
  use research_canvas_desktop_lib::db::repositories::{
      agent_activity::AgentActivityRepository, layout::LayoutRepository, ProjectRepository,
  };
  use research_canvas_desktop_lib::{ApiState, SharedApiState};
  use std::sync::{Arc, Mutex};

  // Build a SharedApiState backed by a real temp SQLite DB with an active canvas,
  // mirroring WS2 Task 15's `state_with_canvas` helper.
  fn state_with_canvas() -> (tempfile::TempDir, SharedApiState, String) {
      let dir = tempfile::tempdir().unwrap();
      let db_path = dir.path().join("t.db");
      let db = Database::open(&db_path).unwrap();
      let project = ProjectRepository::new(db.connection())
          .create(
              "P".into(),
              "p".into(),
              None,
              dir.path().to_str().unwrap().into(),
              None,
              None,
              serde_json::json!({}),
          )
          .unwrap();
      let canvas_id = project.primary_canvas_id.unwrap();
      let state: SharedApiState = Arc::new(Mutex::new(ApiState {
          db_path: Some(db_path.to_string_lossy().to_string()),
          active_project_id: Some(project.id),
          active_canvas_id: Some(canvas_id.clone()),
      }));
      (dir, state, canvas_id)
  }

  #[test]
  fn placing_via_handler_persists_layout_and_records_activity() {
      let (_dir, state, canvas_id) = state_with_canvas();

      upsert_node_layout(
          PlaceNodeRequest {
              graph_node_id: "gn-1".into(),
              x: 42.0,
              y: 7.0,
              width: Some(200.0),
              height: Some(120.0),
              dot_colour: None,
              bg_colour: None,
              text_colour: None,
              thumbnail: None,
          },
          &state,
      )
      .expect("place");

      let db_path = state.lock().unwrap().db_path.clone().unwrap();
      let db = Database::open(&db_path).unwrap();
      let conn = db.connection();

      // Layout row written (WS2's behaviour, re-asserted here as a guard).
      let rows = LayoutRepository::new(conn).list_node_layout(&canvas_id).unwrap();
      let found = rows.iter().find(|r| r.graph_node_id == "gn-1").unwrap();
      assert_eq!(found.position_x, 42.0);
      assert_eq!(found.position_y, 7.0);

      // WS6's addition: a node_created activity row was recorded.
      let activity = AgentActivityRepository::new(conn).list_recent(10).unwrap();
      let logged = activity
          .iter()
          .find(|a| a.graph_node_id.as_deref() == Some("gn-1"))
          .expect("activity recorded for placement");
      assert_eq!(logged.kind, "node_created");
  }
  ```
  > This test consumes WS2 Task 15's `PlaceNodeRequest` + `upsert_node_layout` handler verbatim, the WS2 `ApiState`/`SharedApiState` shape, and `ProjectRepository::create` (existing). It will not compile until WS2 Task 15 (handler + types) **and** Task 5 (`AgentActivityRepository`) are merged. If `ProjectRepository::create`'s arity differs in your tree, copy WS2 Task 15's exact `state_with_canvas` helper (it constructs the same state).

- [ ] **6.4** Run, expect FAIL (until the `agent_activity` recording is added to the handler):
  ```bash
  cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" placing_via_handler_persists_layout_and_records_activity -- --test-threads=1
  ```
  Expect failure: the assertion `activity recorded for placement` fails because the WS2 handler writes layout only and does not yet record activity (compile error first if WS2/Task 5 are unmerged — integrate those first).

- [ ] **6.5** Add `agent_activity` recording **inside WS2's existing `upsert_node_layout` handler** in `api/handlers.rs`. Do **not** rewrite the file, do **not** change the function signature, do **not** touch `get_canvas` / `remove_node_layout`. Make these two surgical edits:
  - Add the `AgentActivityRepository` + `NewAgentActivity` imports to the existing `use crate::{ ... }` block at the top of the file (alongside the layout imports WS2 already declares):
    ```rust
    use crate::db::repositories::{agent_activity::AgentActivityRepository, agent_activity::NewAgentActivity};
    ```
  - Inside `upsert_node_layout`, immediately **after** the `repo.upsert_node_layout(&NodeLayoutRecord { ... }).map_err(...)?;` call that WS2 already wrote and **before** the final `Ok(PlacedNodeResponse { ... })`, insert the recording. Use the `existing` lookup WS2 already performs (the `let existing = repo.list_node_layout(&canvas_id)...find(...)` binding) to choose the kind; reuse the same `db.connection()` (`repo` borrows it, so re-open is unnecessary — record through a fresh `AgentActivityRepository::new(db.connection())`). Keep `title`/`entity_type` empty per 6.2 (no Neo4j read on this thread):
    ```rust
        // WS6: record the placement in the agent-activity feed (layout only; theory untouched).
        // `existing` is the same binding WS2's handler computed above for position/size merge.
        let kind = if existing.is_some() { "node_updated" } else { "node_created" };
        AgentActivityRepository::new(db.connection())
            .record(&NewAgentActivity {
                kind: kind.to_string(),
                canvas_id: Some(canvas_id.clone()),
                graph_node_id: Some(req.graph_node_id.clone()),
                relationship_id: None,
                title: String::new(),    // enrichment is gated on a WS2 runtime-handle amendment (see 6.2)
                entity_type: None,
                detail_json: "{}".to_string(),
            })
            .map_err(|e| e.to_string())?;
    ```
    > WS2's handler moves `canvas_id` into the `NodeLayoutRecord` it builds. If that consumes `canvas_id`, clone it for the record there (`canvas_id: canvas_id.clone()`) so the binding is still available for the activity row — or capture `let canvas_id_for_activity = canvas_id.clone();` right after `active_canvas_id(state)?`. Match whatever borrow shape WS2's merged handler has; the only requirement is the activity row carries the same `canvas_id` and `req.graph_node_id`.

- [ ] **6.6** (Optional, same surgical style) Record `node_created` activity in WS2's `batch_place` handler too, so batch placements also surface in the feed. Inside WS2's `batch_place`, after the `tx.commit()...?` and before `Ok(BatchPlaceResponse { ... })`, record one row per placement (a fresh connection after the transaction commits):
  ```rust
      // WS6: log each batch placement (best-effort; outside the layout transaction).
      let db2 = Database::open(&path).map_err(|e| e.to_string())?;
      let activity = AgentActivityRepository::new(db2.connection());
      for item in &req.placements {
          activity
              .record(&NewAgentActivity {
                  kind: "node_created".to_string(),
                  canvas_id: Some(canvas_id.clone()),
                  graph_node_id: Some(item.graph_node_id.clone()),
                  relationship_id: None,
                  title: String::new(),
                  entity_type: None,
                  detail_json: "{}".to_string(),
              })
              .map_err(|e| e.to_string())?;
      }
  ```
  > `path` and `canvas_id` are the bindings WS2's `batch_place` already holds; if WS2 consumed `req.placements` into the records vec before this point, capture the graph node ids first (`let placed_ids: Vec<String> = req.placements.iter().map(|p| p.graph_node_id.clone()).collect();`) and loop over those. Skip this step entirely if you prefer to keep WS6 to single-node placement only — `canvas_batch_place` still works; it just will not emit activity rows. (`api/mod.rs` dispatch and `start_server` are untouched either way.)

- [ ] **6.7** Build the backend (catches any borrow/import mismatch from the additive edits):
  ```bash
  cargo build --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml"
  ```
  Expect: exit code 0. (`SharedGraph`/`GraphRepository`/`tokio` are **not** needed by this task — the handlers stay sync and SQLite-only.)

- [ ] **6.8** Run the handler test, expect PASS:
  ```bash
  cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" placing_via_handler_persists_layout_and_records_activity -- --test-threads=1
  ```
  Expect: `ok`.

- [ ] **6.9** Commit:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project" && git add -A && git commit -m "WS6: record agent_activity on :9876 layout placements

Additive on WS2 Task 15's slimmed :9876 handlers — upsert_node_layout
(and batch_place) now log a node_created/node_updated activity row.
No theory routes, no start_server signature change.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 7 — Tauri command + `WorkspaceTransport.listAgentActivity`

Expose the activity feed to the frontend through a typed Tauri command and a new transport method.

**Files:**
- Create `/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/src/commands/agent_activity.rs`
- Modify `/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/src/lib.rs` (declare `commands::agent_activity` module + register command in `generate_handler!`)
- Modify `/Users/admin/Documents/Antichrist Project/packages/desktop-api/src/index.ts` (new `AgentActivity` type, `listAgentActivity` on `WorkspaceTransport`, both transports)
- Modify `/Users/admin/Documents/Antichrist Project/packages/desktop-api/src/index.test.ts` (assert the type shape via a fixture mapper)

**Interfaces:**
- Consumes:
  - `AgentActivityRepository::new(conn)`, `AgentActivityRepository::list_recent(limit)` (Task 5).
  - Existing `SharedApiState` (managed) + `Database::open` (existing).
  - Existing `invokeTauri<T>(command, args)`, `createTauriWorkspaceTransport`, `createBrowserBridgeTransport`, `resolveBrowserBridgeBaseUrl` (desktop-api).
- Produces:
  - Tauri command `list_agent_activity_command(limit: Option<i64>) -> Result<Vec<AgentActivityRecord>, String>`.
  - TS type `AgentActivity` and `WorkspaceTransport.listAgentActivity(input: { limit?: number }): Promise<AgentActivity[]>`.

Steps:

- [ ] **7.1** Write the failing TS test in `packages/desktop-api/src/index.test.ts`. Append:
  ```ts
  import { mapAgentActivityRow, type AgentActivity } from "./index";

  describe("agent activity mapping", () => {
    it("maps a raw row into the AgentActivity shape", () => {
      const row = {
        id: "a1",
        canvasId: "c1",
        kind: "node_created",
        graphNodeId: "gn-1",
        relationshipId: null,
        title: "Cosimo de Medici",
        entityType: "Figure",
        detailJson: "{}",
        reviewed: false,
        placed: false,
        createdAt: "2026-06-28T00:00:00Z",
      };
      const mapped: AgentActivity = mapAgentActivityRow(row);
      expect(mapped.kind).toBe("node_created");
      expect(mapped.graphNodeId).toBe("gn-1");
      expect(mapped.reviewed).toBe(false);
    });
  });
  ```

- [ ] **7.2** Run, expect FAIL:
  ```bash
  pnpm vitest run packages/desktop-api/src/index.test.ts
  ```
  Expect failure: `mapAgentActivityRow` / `AgentActivity` not exported.

- [ ] **7.3** Add the TS type, mapper, and transport method in `packages/desktop-api/src/index.ts`.
  - Add near the other interfaces:
    ```ts
    export interface AgentActivity {
      id: string;
      canvasId: string | null;
      kind: "node_created" | "node_updated" | "relationship_created" | "episode_ingested";
      graphNodeId: string | null;
      relationshipId: string | null;
      title: string;
      entityType: string | null;
      detailJson: string;
      reviewed: boolean;
      placed: boolean;
      createdAt: string;
    }

    export function mapAgentActivityRow(row: AgentActivity): AgentActivity {
      return {
        id: row.id,
        canvasId: row.canvasId ?? null,
        kind: row.kind,
        graphNodeId: row.graphNodeId ?? null,
        relationshipId: row.relationshipId ?? null,
        title: row.title ?? "",
        entityType: row.entityType ?? null,
        detailJson: row.detailJson ?? "{}",
        reviewed: Boolean(row.reviewed),
        placed: Boolean(row.placed),
        createdAt: row.createdAt,
      };
    }
    ```
  - Add to the `WorkspaceTransport` interface (after the existing methods):
    ```ts
      listAgentActivity(input: { limit?: number }): Promise<AgentActivity[]>;
    ```
  - In `createTauriWorkspaceTransport`, add the method:
    ```ts
      async listAgentActivity(input: { limit?: number }) {
        const rows = await invokeTauri<AgentActivity[]>("list_agent_activity_command", {
          limit: input.limit ?? null,
        });
        return rows.map(mapAgentActivityRow);
      },
    ```
  - In `createBrowserBridgeTransport`, add a read-only HTTP variant (web build is read-only per design §6 — listing activity is a read, so it is allowed):
    ```ts
      async listAgentActivity(input: { limit?: number }) {
        const url = `${BRIDGE_BASE_URL}/agent-activity?limit=${input.limit ?? 50}`;
        const response = await fetch(url);
        if (!response.ok) return [];
        const rows = (await response.json()) as AgentActivity[];
        return rows.map(mapAgentActivityRow);
      },
    ```

- [ ] **7.4** Run the TS test, expect PASS:
  ```bash
  pnpm vitest run packages/desktop-api/src/index.test.ts
  ```
  Expect: the new `agent activity mapping` test passes alongside the existing tree tests.

- [ ] **7.5** Implement the Tauri command. Create `src/commands/agent_activity.rs`:
  ```rust
  use crate::{
      db::{connection::Database, repositories::{AgentActivityRecord, AgentActivityRepository}},
      SharedApiState,
  };
  use tauri::State;

  #[tauri::command]
  pub fn list_agent_activity_command(
      limit: Option<i64>,
      state: State<'_, SharedApiState>,
  ) -> Result<Vec<AgentActivityRecord>, String> {
      let db_path = state
          .lock()
          .unwrap()
          .db_path
          .clone()
          .ok_or_else(|| "App not bootstrapped yet".to_string())?;
      let db = Database::open(&db_path).map_err(|e| e.to_string())?;
      let conn = db.connection();
      AgentActivityRepository::new(conn)
          .list_recent(limit.unwrap_or(50))
          .map_err(|e| e.to_string())
  }
  ```

- [ ] **7.6** Register the module + command in `lib.rs`. Add `agent_activity;` to the `pub mod commands { ... }` block and add `commands::agent_activity::list_agent_activity_command,` inside `tauri::generate_handler![ ... ]`.

- [ ] **7.7** Build the backend, expect success:
  ```bash
  cargo build --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml"
  ```
  Expect: exit code 0.

- [ ] **7.8** Commit:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project" && git add -A && git commit -m "WS6: list_agent_activity command + transport.listAgentActivity

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 8 — Agent Activity feed: state model (Zustand vanilla store)

A vanilla Zustand store holds the activity feed, loading/error state, and a `reviewedIds` set the UI toggles optimistically. Tested in isolation (no React).

**Files:**
- Create `/Users/admin/Documents/Antichrist Project/apps/desktop/src/features/agent/agentActivityStore.ts`
- Create `/Users/admin/Documents/Antichrist Project/apps/desktop/src/features/agent/agentActivityStore.test.ts`

**Interfaces:**
- Consumes: `AgentActivity` type, `WorkspaceTransport.listAgentActivity` (Task 7).
- Produces:
  ```ts
  export interface AgentActivityState {
    items: AgentActivity[];
    status: "idle" | "loading" | "ready" | "error";
    error: string | null;
    refresh(): Promise<void>;
    markReviewed(id: string): void;
    newCount(): number; // unreviewed, kind=node_created
  }
  export function createAgentActivityStore(
    transport: Pick<WorkspaceTransport, "listAgentActivity">,
  ): StoreApi<AgentActivityState>;
  ```

Steps:

- [ ] **8.1** Write the failing test. Create `agentActivityStore.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import type { AgentActivity } from "@research-canvas/desktop-api";
  import { createAgentActivityStore } from "./agentActivityStore";

  function activity(over: Partial<AgentActivity>): AgentActivity {
    return {
      id: "a1",
      canvasId: "c1",
      kind: "node_created",
      graphNodeId: "gn-1",
      relationshipId: null,
      title: "Node",
      entityType: "Figure",
      detailJson: "{}",
      reviewed: false,
      placed: false,
      createdAt: "2026-06-28T00:00:00Z",
      ...over,
    };
  }

  describe("agentActivityStore", () => {
    it("loads items and reports ready", async () => {
      const items = [activity({ id: "a1" }), activity({ id: "a2" })];
      const store = createAgentActivityStore({
        listAgentActivity: async () => items,
      });
      await store.getState().refresh();
      expect(store.getState().status).toBe("ready");
      expect(store.getState().items).toHaveLength(2);
    });

    it("counts unreviewed node_created items", async () => {
      const store = createAgentActivityStore({
        listAgentActivity: async () => [
          activity({ id: "a1", kind: "node_created", reviewed: false }),
          activity({ id: "a2", kind: "node_created", reviewed: true }),
          activity({ id: "a3", kind: "relationship_created", reviewed: false }),
        ],
      });
      await store.getState().refresh();
      expect(store.getState().newCount()).toBe(1);
    });

    it("markReviewed flips an item optimistically", async () => {
      const store = createAgentActivityStore({
        listAgentActivity: async () => [activity({ id: "a1", reviewed: false })],
      });
      await store.getState().refresh();
      store.getState().markReviewed("a1");
      expect(store.getState().items[0].reviewed).toBe(true);
      expect(store.getState().newCount()).toBe(0);
    });

    it("sets error status when the transport throws", async () => {
      const store = createAgentActivityStore({
        listAgentActivity: async () => {
          throw new Error("backend down");
        },
      });
      await store.getState().refresh();
      expect(store.getState().status).toBe("error");
      expect(store.getState().error).toBe("backend down");
    });
  });
  ```

- [ ] **8.2** Run, expect FAIL:
  ```bash
  pnpm vitest run apps/desktop/src/features/agent/agentActivityStore.test.ts
  ```
  Expect failure: cannot resolve `./agentActivityStore`.

- [ ] **8.3** Implement the store. Create `agentActivityStore.ts`:
  ```ts
  import { createStore, type StoreApi } from "zustand/vanilla";
  import type { AgentActivity, WorkspaceTransport } from "@research-canvas/desktop-api";

  export interface AgentActivityState {
    items: AgentActivity[];
    status: "idle" | "loading" | "ready" | "error";
    error: string | null;
    refresh(): Promise<void>;
    markReviewed(id: string): void;
    newCount(): number;
  }

  export function createAgentActivityStore(
    transport: Pick<WorkspaceTransport, "listAgentActivity">,
  ): StoreApi<AgentActivityState> {
    return createStore<AgentActivityState>((set, get) => ({
      items: [],
      status: "idle",
      error: null,
      async refresh() {
        set({ status: "loading", error: null });
        try {
          const items = await transport.listAgentActivity({ limit: 100 });
          set({ items, status: "ready" });
        } catch (cause) {
          set({
            status: "error",
            error: cause instanceof Error ? cause.message : String(cause),
          });
        }
      },
      markReviewed(id: string) {
        set({
          items: get().items.map((item) =>
            item.id === id ? { ...item, reviewed: true } : item,
          ),
        });
      },
      newCount() {
        return get().items.filter(
          (item) => item.kind === "node_created" && !item.reviewed,
        ).length;
      },
    }));
  }
  ```

- [ ] **8.4** Run the test, expect PASS:
  ```bash
  pnpm vitest run apps/desktop/src/features/agent/agentActivityStore.test.ts
  ```
  Expect: `4 passed`.

- [ ] **8.5** Commit:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project" && git add -A && git commit -m "WS6: agentActivityStore (vanilla Zustand) with tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 9 — Agent Activity panel component + "Review & place" action

A React panel listing activity items newest-first, badging unreviewed `node_created` entries, with a **Review & place** button per new node that places it on the active canvas (via `upsertNodeLayout`) and marks it reviewed. Refreshes on `canvas:updated`.

> **HARD DEPENDENCY — WS2 `upsert_node_layout_command` requires `database_path` (Fix).** WS2 Task 14's Tauri command `upsert_node_layout_command(request: UpsertNodeLayoutRequest)` deserializes `UpsertNodeLayoutRequest { database_path: String, layout: LayoutPayload }` — `database_path` is **required**, not server-resolved. WS2's TS signature (`upsertNodeLayout(input: { databasePath?: string; layout: NodeLayout })`) makes it *optional in the type* but the Rust command will reject a call that omits it. Therefore this panel must **thread the workspace `databasePath` into the call** — it cannot call `upsertNodeLayout({ layout })` with no `databasePath`. We pass `databasePath` in as a prop (read from `CanvasWorkspaceContext`, which already exposes `databasePath: string | null`, in Task 10) and include it in `upsertNodeLayout({ databasePath, layout })`. This is hard-gated on WS2 Task 14 being merged; if WS2 later changes the command to resolve `database_path` from managed `SharedApiState` (making it truly optional server-side), this prop becomes optional and may be dropped.

**Files:**
- Create `/Users/admin/Documents/Antichrist Project/apps/desktop/src/features/agent/AgentActivityPanel.tsx`
- Create `/Users/admin/Documents/Antichrist Project/apps/desktop/src/features/agent/AgentActivityPanel.test.tsx`

**Interfaces:**
- Consumes:
  - `createAgentActivityStore` + `AgentActivityState` (Task 8).
  - `WorkspaceTransport.listAgentActivity`, `WorkspaceTransport.upsertNodeLayout` (Task 7 + WS0 §5.2 / WS2 Task 16). The WS2 signature is `upsertNodeLayout(input: { databasePath?: string; layout: NodeLayout }): Promise<void>` where `NodeLayout` is WS0 §5.1; the backing Tauri command requires `database_path`, so this panel always supplies `databasePath`.
  - React 19, `useSyncExternalStore` via `zustand`'s `useStore`.
- Produces: `AgentActivityPanel({ transport, canvasId, databasePath }: { transport: WorkspaceTransport; canvasId: string; databasePath: string | null })` React component; default placement offset constant `PLACE_OFFSET`. When `databasePath` is null (workspace not hydrated) the **Review & place** action is disabled/no-ops.

Steps:

- [ ] **9.1** Write the failing component test. Create `AgentActivityPanel.test.tsx`:
  ```tsx
  import { describe, expect, it, vi } from "vitest";
  import { render, screen, waitFor, fireEvent } from "@testing-library/react";
  import type { AgentActivity, NodeLayout } from "@research-canvas/desktop-api";
  import { AgentActivityPanel } from "./AgentActivityPanel";

  function activity(over: Partial<AgentActivity>): AgentActivity {
    return {
      id: "a1",
      canvasId: "c1",
      kind: "node_created",
      graphNodeId: "gn-1",
      relationshipId: null,
      title: "Cosimo de Medici",
      entityType: "Figure",
      detailJson: "{}",
      reviewed: false,
      placed: false,
      createdAt: "2026-06-28T00:00:00Z",
      ...over,
    };
  }

  function makeTransport(
    items: AgentActivity[],
    onPlace: (input: { databasePath?: string; layout: NodeLayout }) => void,
  ) {
    return {
      listAgentActivity: vi.fn(async () => items),
      upsertNodeLayout: vi.fn(
        async (input: { databasePath?: string; layout: NodeLayout }) => {
          onPlace(input);
        },
      ),
    } as never;
  }

  describe("AgentActivityPanel", () => {
    it("lists activity titles", async () => {
      const transport = makeTransport([activity({ title: "Cosimo de Medici" })], () => {});
      render(
        <AgentActivityPanel transport={transport} canvasId="c1" databasePath="/tmp/db.sqlite" />,
      );
      await waitFor(() =>
        expect(screen.getByText("Cosimo de Medici")).toBeInTheDocument(),
      );
    });

    it("places a new node (with databasePath) and removes the Review & place button", async () => {
      const placed: Array<{ databasePath?: string; layout: NodeLayout }> = [];
      const transport = makeTransport(
        [activity({ id: "a1", graphNodeId: "gn-1", reviewed: false })],
        (input) => placed.push(input),
      );
      render(
        <AgentActivityPanel transport={transport} canvasId="c1" databasePath="/tmp/db.sqlite" />,
      );
      const button = await screen.findByRole("button", { name: /review & place/i });
      fireEvent.click(button);
      await waitFor(() => expect(placed).toHaveLength(1));
      expect(placed[0].databasePath).toBe("/tmp/db.sqlite");
      expect(placed[0].layout.graphNodeId).toBe("gn-1");
      expect(placed[0].layout.canvasId).toBe("c1");
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: /review & place/i }),
        ).not.toBeInTheDocument(),
      );
    });
  });
  ```

- [ ] **9.2** Run, expect FAIL:
  ```bash
  pnpm vitest run apps/desktop/src/features/agent/AgentActivityPanel.test.tsx
  ```
  Expect failure: cannot resolve `./AgentActivityPanel`.

- [ ] **9.3** Implement the panel. Create `AgentActivityPanel.tsx`:
  ```tsx
  import { useEffect, useMemo } from "react";
  import { useStore } from "zustand";
  import type { NodeLayout, WorkspaceTransport } from "@research-canvas/desktop-api";
  import { createAgentActivityStore } from "./agentActivityStore";

  export const PLACE_OFFSET = 80;

  interface AgentActivityPanelProps {
    transport: WorkspaceTransport;
    canvasId: string;
    /** Active workspace SQLite path; required by WS2's upsert_node_layout_command.
     *  Null until the workspace is hydrated — Review & place is disabled while null. */
    databasePath: string | null;
  }

  const KIND_LABEL: Record<string, string> = {
    node_created: "New node",
    node_updated: "Node updated",
    relationship_created: "New relationship",
    episode_ingested: "Episode ingested",
  };

  export function AgentActivityPanel({
    transport,
    canvasId,
    databasePath,
  }: AgentActivityPanelProps) {
    const store = useMemo(() => createAgentActivityStore(transport), [transport]);
    const items = useStore(store, (s) => s.items);
    const status = useStore(store, (s) => s.status);
    const error = useStore(store, (s) => s.error);
    const newCount = useStore(store, (s) => s.newCount());

    useEffect(() => {
      void store.getState().refresh();
    }, [store]);

    async function reviewAndPlace(graphNodeId: string | null, id: string, index: number) {
      if (!graphNodeId || !databasePath) return;
      const layout: NodeLayout = {
        graphNodeId,
        canvasId,
        positionX: index * PLACE_OFFSET,
        positionY: index * PLACE_OFFSET,
        width: 240,
        height: 140,
        style: {},
      };
      // WS2's upsert_node_layout_command requires database_path; thread it through.
      await transport.upsertNodeLayout({ databasePath, layout });
      store.getState().markReviewed(id);
    }

    return (
      <section className="agent-activity-panel" data-testid="agent-activity-panel">
        <header className="agent-activity-panel__header">
          <h2>Agent Activity</h2>
          {newCount > 0 && (
            <span className="agent-activity-panel__badge" data-testid="agent-new-count">
              {newCount} new
            </span>
          )}
        </header>

        {status === "error" && (
          <p className="agent-activity-panel__error">{error}</p>
        )}
        {status === "ready" && items.length === 0 && (
          <p className="agent-activity-panel__empty">
            No agent activity yet. Run the agent in the terminal to author nodes.
          </p>
        )}

        <ul className="agent-activity-panel__list">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="agent-activity-item"
              data-reviewed={item.reviewed ? "true" : "false"}
            >
              <span className="agent-activity-item__kind">
                {KIND_LABEL[item.kind] ?? item.kind}
              </span>
              <span className="agent-activity-item__title">{item.title || "(untitled)"}</span>
              {item.entityType && (
                <span className="agent-activity-item__type">{item.entityType}</span>
              )}
              {item.kind === "node_created" && !item.reviewed && item.graphNodeId && (
                <button
                  type="button"
                  className="agent-activity-item__place"
                  disabled={!databasePath}
                  title={databasePath ? undefined : "Open a workspace to place nodes"}
                  onClick={() => void reviewAndPlace(item.graphNodeId, item.id, index)}
                >
                  Review &amp; place
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    );
  }
  ```

- [ ] **9.4** Run the test, expect PASS:
  ```bash
  pnpm vitest run apps/desktop/src/features/agent/AgentActivityPanel.test.tsx
  ```
  Expect: `2 passed`. (If `@testing-library/jest-dom` matchers like `toBeInTheDocument` are not globally set up, confirm the existing `Shell.test.tsx` setup imports them; mirror that import at the top of the test.)

- [ ] **9.5** Commit:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project" && git add -A && git commit -m "WS6: AgentActivityPanel with Review & place action

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 10 — Wire the Agent Activity tab into the right panel

Add an "Agent" tab next to Terminal in the right panel and mount `AgentActivityPanel` (always-mounted, like Terminal, so its feed/badge persists). Refresh the feed on `canvas:updated`.

**Files:**
- Modify `/Users/admin/Documents/Antichrist Project/apps/desktop/src/layout/useShellLayout.ts` (extend `RightTab` union)
- Modify `/Users/admin/Documents/Antichrist Project/apps/desktop/src/layout/RightPanelSlot.tsx` (add tab + pane)
- Modify `/Users/admin/Documents/Antichrist Project/apps/desktop/src/layout/Shell.test.tsx` (assert the tab renders)

**Interfaces:**
- Consumes:
  - `AgentActivityPanel` (Task 9), which now requires `databasePath: string | null` in addition to `transport` and `canvasId` (Fix — WS2's `upsert_node_layout_command` requires `database_path`).
  - `useCanvasWorkspace()` from `../features/canvas/CanvasWorkspaceContext` to get the live `transport`, `canvasId`, and `databasePath`. The context **already exposes** `databasePath: string | null` (confirmed in `CanvasWorkspaceContext.tsx`, the context value object). It exposes `canvasId`; confirm it also exposes `transport` — if `transport` is not on the context value, add it to the value object and the `CanvasWorkspaceContextValue` interface in this task.
  - `RightTab` union (existing in `useShellLayout.ts`).
- Produces: `RightTab` gains `"agent"`; `RightPanelSlot` renders an Agent tab + always-mounted pane wired with `transport`, `canvasId`, and `databasePath` from the workspace context.

Steps:

- [ ] **10.1** Extend the `RightTab` union in `useShellLayout.ts`:
  ```ts
  export type RightTab = "inspector" | "content" | "terminal" | "agent";
  ```

- [ ] **10.2** Confirm the canvas context exposes `transport`, `canvasId`, and `databasePath`:
  ```bash
  grep -n "transport\|canvasId\|databasePath" "/Users/admin/Documents/Antichrist Project/apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx" | head
  ```
  `databasePath: string | null` is already on the context value (used throughout the file). If `transport` is not part of the context value object (the `useMemo` near line 376), add `transport,` to it and to the `CanvasWorkspaceContextValue` interface so the panel can read it. (`databasePath` is already present — no change needed for it.)

- [ ] **10.3** Write a failing assertion in `Shell.test.tsx`. Add a test that the Agent tab button is present when the right panel is open. Mirror the existing right-panel test pattern in that file; the new assertion:
  ```tsx
  it("shows an Agent tab in the right panel", async () => {
    // (reuse the existing render-with-open-right-panel helper in this file)
    renderShellWithRightPanelOpen();
    expect(
      await screen.findByRole("button", { name: "Agent" }),
    ).toBeInTheDocument();
  });
  ```
  > Use the same render helper/imports the surrounding tests in `Shell.test.tsx` already use; do not invent a new harness.

- [ ] **10.4** Run, expect FAIL:
  ```bash
  pnpm vitest run apps/desktop/src/layout/Shell.test.tsx
  ```
  Expect failure: no button named "Agent".

- [ ] **10.5** Add the tab to `RightPanelSlot.tsx`. Update the `TABS` array and import + render the pane:
  - Add the import:
    ```tsx
    import { AgentActivityPanel } from "../features/agent/AgentActivityPanel";
    import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
    ```
  - Extend `TABS`:
    ```tsx
    const TABS: { id: RightTab; label: string }[] = [
      { id: "inspector", label: "Inspector" },
      { id: "content", label: "Content" },
      { id: "terminal", label: "Terminal" },
      { id: "agent", label: "Agent" },
    ];
    ```
  - Inside the component, read the workspace and add an always-mounted pane after the Terminal pane:
    ```tsx
      const workspace = useCanvasWorkspace();
    ```
    ```tsx
              <div className="rps-pane" data-visible={activeTab === "agent" ? "true" : "false"}>
                <AgentActivityPanel
                  transport={workspace.transport}
                  canvasId={workspace.canvasId}
                  databasePath={workspace.databasePath}
                />
              </div>
    ```

- [ ] **10.6** Run the Shell test, expect PASS:
  ```bash
  pnpm vitest run apps/desktop/src/layout/Shell.test.tsx
  ```
  Expect: the new `shows an Agent tab` test passes (and existing Shell tests stay green).

- [ ] **10.7** Type-check the whole frontend:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project" && pnpm exec tsc -b
  ```
  Expect: exit code 0.

- [ ] **10.8** Commit:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project" && git add -A && git commit -m "WS6: add Agent tab mounting AgentActivityPanel in right panel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 11 — Refresh the activity feed on `canvas:updated`

When the agent places/authors something (any `:9876` mutation fires `canvas:updated`), the feed should refresh without a manual reload. We add a Tauri event subscription inside `AgentActivityPanel`.

**Files:**
- Modify `/Users/admin/Documents/Antichrist Project/apps/desktop/src/features/agent/AgentActivityPanel.tsx`
- Modify `/Users/admin/Documents/Antichrist Project/apps/desktop/src/features/agent/AgentActivityPanel.test.tsx`

**Interfaces:**
- Consumes: `listen` from `@tauri-apps/api/event` (used the same way as `CanvasWorkspaceContext.tsx` line 361); `isTauriRuntime` guard (mirror the inline check used elsewhere: `typeof window !== "undefined" && "__TAURI_INTERNALS__" in window`).
- Produces: `AgentActivityPanel` re-fetches on `canvas:updated`.

Steps:

- [ ] **11.1** Write the failing test — verify a second refresh happens when the event fires. Append to `AgentActivityPanel.test.tsx`:
  ```tsx
  it("refreshes when canvas:updated fires", async () => {
    const handlers: Array<() => void> = [];
    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {};
    vi.mock("@tauri-apps/api/event", () => ({
      listen: (_name: string, cb: () => void) => {
        handlers.push(cb);
        return Promise.resolve(() => {});
      },
    }));
    const list = vi.fn(async () => [] as never);
    const transport = { listAgentActivity: list, upsertNodeLayout: vi.fn() } as never;
    render(
      <AgentActivityPanel transport={transport} canvasId="c1" databasePath="/tmp/db.sqlite" />,
    );
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    handlers.forEach((h) => h());
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
  ```
  > `vi.mock` must be hoisted; if the surrounding test file already imports `listen` at module top, move the `vi.mock` to the top of the file (above imports) per Vitest hoisting rules, and drop the per-test `vi.mock`. Keep the assertion (`>= 2` calls) in the test body.

- [ ] **11.2** Run, expect FAIL:
  ```bash
  pnpm vitest run apps/desktop/src/features/agent/AgentActivityPanel.test.tsx
  ```
  Expect failure: `list` called only once (no event subscription yet).

- [ ] **11.3** Add the subscription in `AgentActivityPanel.tsx`. Add imports:
  ```tsx
  import { listen } from "@tauri-apps/api/event";
  ```
  And a second effect after the initial-refresh effect:
  ```tsx
    useEffect(() => {
      if (!(typeof window !== "undefined" && "__TAURI_INTERNALS__" in window)) {
        return undefined;
      }
      let active = true;
      let unlisten: (() => void) | undefined;
      void listen("canvas:updated", () => {
        void store.getState().refresh();
      }).then((fn) => {
        if (active) {
          unlisten = fn;
        } else {
          fn();
        }
      });
      return () => {
        active = false;
        unlisten?.();
      };
    }, [store]);
  ```

- [ ] **11.4** Run the test, expect PASS:
  ```bash
  pnpm vitest run apps/desktop/src/features/agent/AgentActivityPanel.test.tsx
  ```
  Expect: all `AgentActivityPanel` tests pass (list, place, refresh-on-event).

- [ ] **11.5** Commit:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project" && git add -A && git commit -m "WS6: refresh Agent Activity feed on canvas:updated

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 12 — Register the Graphiti MCP server in `.claude/settings.json`

Wire Graphiti's official Python MCP as the agent's theory-write path, alongside the slimmed `research-canvas` MCP. The Graphiti MCP reads the same Neo4j connection env as the app (WS0 §1.3).

**Files:**
- Modify `/Users/admin/Documents/Antichrist Project/.claude/settings.json` (add `graphiti` under `mcpServers`)
- Create `/Users/admin/Documents/Antichrist Project/.env.example` (committed; documents the env the Graphiti MCP + app share — if WS2 already created it, append the Graphiti keys instead)
- Create `/Users/admin/Documents/Antichrist Project/docs/superpowers/notes/ws6-graphiti-mcp-setup.md` (operator setup note)

**Interfaces:**
- Consumes: WS0 §1.3 env vars (`NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`, `GOOGLE_API_KEY`, `GRAPHITI_LLM_MODEL`, `GRAPHITI_EMBEDDER_MODEL`, `GRAPHITI_RERANKER_MODEL`). WS2 owns Neo4j+Graphiti bring-up; this task only registers the MCP and documents env.
- Produces: a `graphiti` entry in `mcpServers`; a committed `.env.example`.

Steps:

- [ ] **12.1** Confirm the current `mcpServers` block:
  ```bash
  grep -n "mcpServers\|research-canvas\|graphiti" "/Users/admin/Documents/Antichrist Project/.claude/settings.json"
  ```
  Expect only `research-canvas` present.

- [ ] **12.2** Add the `graphiti` MCP entry. Edit `.claude/settings.json` so `mcpServers` reads exactly (keep the existing `hooks` block unchanged):
  ```json
    "mcpServers": {
      "research-canvas": {
        "command": "npx",
        "args": [
          "--yes",
          "tsx",
          ".claude/mcp-servers/research-canvas/src/index.ts"
        ],
        "cwd": "."
      },
      "graphiti": {
        "command": "uvx",
        "args": ["graphiti-mcp"],
        "env": {
          "NEO4J_URI": "${NEO4J_URI}",
          "NEO4J_USER": "${NEO4J_USER}",
          "NEO4J_PASSWORD": "${NEO4J_PASSWORD}",
          "NEO4J_DATABASE": "${NEO4J_DATABASE}",
          "GOOGLE_API_KEY": "${GOOGLE_API_KEY}",
          "GRAPHITI_LLM_MODEL": "${GRAPHITI_LLM_MODEL}",
          "GRAPHITI_EMBEDDER_MODEL": "${GRAPHITI_EMBEDDER_MODEL}",
          "GRAPHITI_RERANKER_MODEL": "${GRAPHITI_RERANKER_MODEL}"
        }
      }
    },
  ```
  > `uvx graphiti-mcp` is the documented invocation for Graphiti's MCP via `uv` (the repo already uses `uv run` in hooks, so `uv`/`uvx` is available). If WS2's docs pin a different launch command (e.g. a git-cloned `graphiti/mcp_server`), use that exact command here instead — the contract is "Graphiti's official MCP server registered under key `graphiti`".

- [ ] **12.3** Validate the JSON is well-formed:
  ```bash
  python3 -c "import json,sys; json.load(open('/Users/admin/Documents/Antichrist Project/.claude/settings.json')); print('settings.json OK')"
  ```
  Expect: `settings.json OK`.

- [ ] **12.4** Create (or append to) `.env.example` documenting the shared env (passwords/keys blank):
  ```bash
  NEO4J_URI=bolt://127.0.0.1:7687
  NEO4J_USER=neo4j
  NEO4J_PASSWORD=
  NEO4J_DATABASE=neo4j
  GOOGLE_API_KEY=
  GRAPHITI_LLM_MODEL=gemini-2.5-flash
  GRAPHITI_EMBEDDER_MODEL=gemini-embedding-001
  GRAPHITI_RERANKER_MODEL=gemini-2.5-flash-lite
  ```
  > If WS2 already created `.env.example` with the Neo4j keys, only append the `GRAPHITI_*` and `GOOGLE_API_KEY` lines so there are no duplicates.

- [ ] **12.5** Write the operator setup note `docs/superpowers/notes/ws6-graphiti-mcp-setup.md` describing: (a) start Neo4j via `docker compose up -d` (WS0 §1.4); (b) copy `.env.example` → `.env` and fill `NEO4J_PASSWORD` + `GOOGLE_API_KEY`; (c) the two MCP servers now registered (`research-canvas` = layout/place-on-canvas, `graphiti` = theory authoring); (d) the agent loop: agent calls Graphiti `add_episode`/entity tools to author theory → `research-canvas` `canvas_get_state` to see what exists → `canvas_place_node` / `canvas_batch_place` to surface new nodes → the Agent Activity panel shows what changed and offers Review & place. Keep it to a short, concrete runbook.

- [ ] **12.6** Verify the slimmed MCP still launches (does not crash on startup) under the registered command:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project" && timeout 5 npx --yes tsx .claude/mcp-servers/research-canvas/src/index.ts < /dev/null; echo "exit: $?"
  ```
  Expect: it starts, waits on stdio, and is killed by `timeout` (exit 124) — i.e. no import/parse crash before the timeout. A stack trace before the timeout is a failure to fix.

- [ ] **12.7** Commit:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project" && git add -A && git commit -m "WS6: register Graphiti MCP, document shared env + agent loop runbook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 13 — Full-suite verification

**Files:** none (verification only).

**Interfaces:** Consumes everything above; produces a green build.

Steps:

- [ ] **13.1** Frontend type-check:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project" && pnpm exec tsc -b
  ```
  Expect: exit code 0.

- [ ] **13.2** Frontend tests:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project" && pnpm vitest run
  ```
  Expect: all suites pass, including `agentActivityStore`, `AgentActivityPanel`, `Shell`, and `desktop-api` mapping tests.

- [ ] **13.3** MCP tests:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project/.claude/mcp-servers/research-canvas" && npm test
  ```
  Expect: `payloads` + `canvas` suites pass.

- [ ] **13.4** Rust tests (always single-threaded):
  ```bash
  cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" -- --test-threads=1
  ```
  Expect: all tests `ok`, including `agent_activity_repository` and `upsert_layout_persists_position`.

- [ ] **13.5** Backend build (release-mode sanity is optional; debug build is sufficient):
  ```bash
  cargo build --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml"
  ```
  Expect: exit code 0.

- [ ] **13.6** Final commit if any verification fixups were needed:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project" && git add -A && git commit -m "WS6: verification fixups" || echo "nothing to commit"
  ```

---

## Done When

- [ ] The `research-canvas` MCP exposes **only** `canvas_get_state`, `canvas_place_node`, `canvas_update_layout`, `canvas_remove_node`, `canvas_batch_place` — and none of `canvas_create_node` / `canvas_update_node` / `canvas_delete_node` / `canvas_create_edge` / `canvas_delete_edge` / `canvas_batch_create` (asserted by `canvas.test.ts`).
- [ ] `src/tools/edges.ts` and `src/tools/batch.ts` no longer exist; `index.ts` `allTools` is `[...canvasTools]`.
- [ ] The internal `:9876` API (slimmed by WS2 Task 15) serves `GET /api/canvas` (layout-only joined read), `PUT /api/layout/node`, `DELETE /api/layout/node/:graphNodeId`, `POST /api/layout/batch`, and **no** theory-mutation routes; every layout mutation still emits `canvas:updated`. WS6 adds only `agent_activity` recording to the `upsert_node_layout` / `batch_place` handlers (no route, type, or `start_server` changes).
- [ ] Placing a node via the MCP writes a `node_layout` row (layout only) and records a row in `agent_activity` (verified by Rust tests).
- [ ] `AgentActivityRepository` records, lists newest-first, and marks reviewed/placed (Rust tests green with `--test-threads=1`).
- [ ] `WorkspaceTransport.listAgentActivity` exists on both transports; `mapAgentActivityRow` test passes.
- [ ] The right panel has an **Agent** tab mounting `AgentActivityPanel`, which lists new nodes/episodes/relationships, badges unreviewed new nodes, refreshes on `canvas:updated`, and a **Review & place** button calls `upsertNodeLayout` with the workspace `databasePath` + active `canvasId` (per WS2's `upsert_node_layout_command`) then marks the item reviewed (component tests green).
- [ ] `.claude/settings.json` registers a `graphiti` MCP server (theory authoring) alongside the slimmed `research-canvas` MCP (layout), with shared Neo4j/Gemini env per WS0 §1.3; `.env.example` documents that env; a setup runbook documents the loop.
- [ ] `pnpm exec tsc -b`, `pnpm vitest run`, the MCP `npm test`, and `cargo test ... -- --test-threads=1` all pass.

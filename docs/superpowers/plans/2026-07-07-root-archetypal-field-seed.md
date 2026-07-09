# Root Archetypal Field Seed Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the real root archetypal-field project as Neo4j ontology nodes/relationships plus SQLite canvas layout, with timeline-projected historical events and claim provenance preserved.

**Architecture:** Add a production seed module in the Tauri crate that writes through `GraphRepository`, `ProjectRepository`, and `LayoutRepository`. Neo4j remains the source of truth for ontology substance; SQLite stores project/canvas layout only, keyed by `graph_node_id`. Timeline behavior is verified through `CanvasService::load_canvas_view(..., "timeline")`.

**Tech Stack:** Rust Tauri backend, `neo4rs`, `rusqlite`, real Neo4j integration tests, real SQLite temp databases, existing React/WorkspaceTransport timeline path.

---

### Task 1: Graph Metadata Support

**Files:**
- Modify: `apps/desktop/src-tauri/src/db/repositories/graph.rs`
- Modify: `packages/desktop-api/src/graph.ts`
- Test: `apps/desktop/src-tauri/tests/root_archetypal_field_seed.rs`

**Steps:**
1. Write a failing real-Neo4j test proving seeded nodes expose `evidence_tags` and claim `source_kind`.
2. Extend `GraphNode`, `NewGraphNode`, and `GraphNodePatch` with `evidence_tags: Vec<String>` and `source_kind: Option<String>`.
3. Persist and read those properties in create/update/query paths.
4. Keep `source_kind` optional so existing nodes remain compatible.

### Task 2: Root Ontology Seed

**Files:**
- Create: `apps/desktop/src-tauri/src/db/root_archetypal_seed.rs`
- Modify: `apps/desktop/src-tauri/src/db/mod.rs`
- Test: `apps/desktop/src-tauri/tests/root_archetypal_field_seed.rs`

**Steps:**
1. Write failing tests for idempotent ontology seeding, relationship semantics, source coordinates, temporal fields, and contested claims as `Source` nodes.
2. Implement static seed data from Stream A with stable slug-derived graph ids.
3. Write nodes through `GraphRepository` and relationships through existing relationship APIs.
4. Avoid flattening contested claims into factual edges; represent them as `Source` nodes with `source_kind = "claim"`.

### Task 3: Project And Layout Seed

**Files:**
- Modify: `apps/desktop/src-tauri/src/db/root_archetypal_seed.rs`
- Test: `apps/desktop/src-tauri/tests/root_archetypal_field_seed.rs`

**Steps:**
1. Write failing SQLite + Neo4j integration tests proving a `root-archetypal-field` project exists with layout rows joined to real graph nodes.
2. Implement idempotent project lookup/create by slug.
3. Persist cluster/orbit layout rows in SQLite using graph ids from the ontology seed.
4. Verify `CanvasService` returns joined nodes for canvas and only temporal nodes for timeline.

### Task 4: UI/E2E Verification

**Files:**
- Add or update e2e test under `tests/e2e/` only if the existing app shell can expose the seeded project without extra product wiring.

**Steps:**
1. Start Neo4j and the app dev target.
2. Run Rust integration tests with `NEO4J_TEST_URI=bolt://127.0.0.1:17687`.
3. Run relevant Vitest tests for graph/timeline contract shape.
4. Run Playwright against the actual UI path and record any blocker with exact failure evidence.

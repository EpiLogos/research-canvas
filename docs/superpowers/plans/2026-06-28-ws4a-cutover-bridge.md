# WS4a — Frontend Node-Lifecycle Cutover to Neo4j Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the two subsystems that already work in isolation — the Neo4j data layer (WS2) and the BlockNote document view (WS3) — so the theory actually *lives in Neo4j at runtime*. Today no canvas node carries a real `graphNodeId`, so WS3's `NodeDocumentPane` (gated on `node.graphNodeId` in `apps/desktop/src/features/viewer/ContentTab.tsx` and `apps/desktop/src/layout/FullScreenReader.tsx`) is dead code, and the frontend node lifecycle (create/load/save) still runs entirely on the legacy SQLite `canvas_nodes` tables via `transport.loadProjectDocument` / `transport.persistProjectDocument`. This plan makes every canvas node carry a real `graphNodeId` equal to a live Neo4j `GraphNode.graph_node_id`; routes node CREATE through `createGraphNode`, node LOAD through `loadCanvasView`, and retires the legacy `persistProjectDocument` substance double-write for nodes — so opening a node mounts the WS3 document view reading/writing `GraphNode.body`.

**Architecture:** The frontend mints a canvas node id (`crypto.randomUUID()`) exactly as it does today; that id becomes the single source of truth used for **all three** stores: the Neo4j `graph_node_id` (substance), the SQLite `node_layout.graph_node_id` (layout), and the canvas node `id`. To make that possible the Rust `create_node` gains an **optional client-supplied id** (coalesced to a fresh UUID when absent), so the frontend can pass its minted id in. `CanvasWorkspaceContext` node-creation callbacks become async: they call `transport.createGraphNode` with the pre-minted id, stamp the returned `graphNodeId` onto the canvas node, and let `flushCanvasLayout` persist the layout row keyed by the same id. Node hydration switches from `loadProjectDocument` (legacy `canvas_nodes`) to `loadCanvasView({ canvasId, lens: "canvas" })` (Neo4j ⨝ SQLite layout), mapped into `CanvasNode`s carrying `graphNodeId`. The legacy substance double-write (`persistProjectDocument` for nodes/edges) is removed from the persist and project-switch paths; annotations stay on the legacy path (WS1), layout stays on `flushCanvasLayout`. We adopt a **clean cutover** (no lazy legacy migration) because there is negligible real authored data on this branch — justified in Task 1.

**Tech Stack:** Tauri v2; React 19 + Vite 7 + TypeScript 5.9; pnpm monorepo; XYFlow @xyflow/react v12.8.5; Zustand v5 vanilla stores; `neo4rs` bolt driver (Rust); Vitest 3 + @testing-library/react (frontend); real Neo4j integration tests via `cargo test` (Rust). Reuses WS0 §5 transport methods, WS0 §2 graph schema, WS0 §3 SQLite layout store, all already implemented on this branch.

## Global Constraints

Tauri v2; React 19 + Vite 7 + TypeScript 5.9; pnpm monorepo; XYFlow @xyflow/react v12.8.5; Zustand v5 vanilla stores; test-first (TDD) for every backend repository, frontend state model, and cutover behavior; prefer REAL integration tests over mocked equivalents — real SQLite in a temp dir, **real Neo4j against the live Docker instance** (running at `bolt://127.0.0.1:7687`, creds in repo `.env`), env-gated on `NEO4J_TEST_URI` (tests source `.env` + set `NEO4J_TEST_URI`; when unset the Rust graph tests `eprintln!` a skip and return); ALWAYS run Rust tests with `--test-threads=1`; keep file/folder/package names per the repo's existing conventions.

---

## Workstream dependencies & grounding (read once)

This plan **consumes** the following, all already implemented on `feat/theory-tool-v1.1`:

- **WS0 §5.1 TS types** (in `packages/desktop-api/src/graph.ts`, re-exported from `index.ts`): `GraphNode { graphNodeId; entityType; title; body; summary; ... isTemporal; ... }`, `NewGraphNodeInput { entityType: CreatableEntityType; title; body; coordinate?; sourceCoordinates?; isTemporal; validFrom?; validTo?; temporalPrecision? }`, `JoinedCanvasNode { node: GraphNode; layout: NodeLayout }`, `CanvasView { canvasId; nodes: JoinedCanvasNode[]; edges: EdgeLayout[]; relationships; viewport; appState }`, `CreatableEntityType = Exclude<EntityType, "PsychoidOperator">`.
- **WS0 §5.2 transport methods** (in `packages/desktop-api/src/index.ts`, `WorkspaceTransport`): `createGraphNode(input: NewGraphNodeInput): Promise<GraphNode>`, `readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>`, `updateGraphNode(input: { graphNodeId: string; patch: GraphNodePatch }): Promise<GraphNode>`, `deleteGraphNode(input: { graphNodeId: string }): Promise<void>`, `loadCanvasView(input: { databasePath?: string; canvasId: string; lens: "canvas" | "timeline" }): Promise<CanvasView>`, `flushCanvasLayout(...)`. The browser-bridge transport already throws `new Error("read-only web build")` for `createGraphNode`/`updateGraphNode`; **this plan only changes the desktop lifecycle** (the read-only web build keeps loading via its own `loadCanvasView` path, unchanged).
- **WS2 Rust** (`apps/desktop/src-tauri/src/db/repositories/graph.rs`): `GraphRepository::create_node(NewGraphNode) -> Result<GraphNode, String>` — **CRITICAL FINDING: today it mints its own id** (`let id = uuid::Uuid::new_v4().to_string();`, line ~195) and `NewGraphNode`/`CreateGraphNodeRequest` have **no** `graph_node_id` field. This is the crux this plan reconciles (Task 1).
- **WS2 Rust join** (`apps/desktop/src-tauri/src/db/canvas_service.rs`): `CanvasService::load_canvas_view(canvas_id, lens)` zips Neo4j substance with SQLite `node_layout` on `graph_node_id`, auto-placing nodes without a layout row. `load_canvas_view_command` (`commands/graph.rs`) is registered in `lib.rs`.
- **WS3** (`apps/desktop/src/features/viewer/ContentTab.tsx`, `apps/desktop/src/layout/FullScreenReader.tsx`, `apps/desktop/src/features/viewer/NodeDocumentPane.tsx`): both read `graphNodeId = (node as unknown as { graphNodeId?: string }).graphNodeId ?? null` and, when present, mount `NodeDocumentPane` (which calls `transport.readGraphNode` / `updateGraphNode`). These are the consumers this plan unblocks — **no WS3 file is modified**, we only make `graphNodeId` non-null at runtime.
- **Schema** (`packages/schema/src/node.ts`): `baseNodeSchema` (Zod) has **no** `graphNodeId` today, and Zod `.object()` **strips unknown keys**, so `graphNodeId` must be added to the schema or `hydrate`/`serialize` will drop it (Task 2).
- **Store** (`packages/canvas/src/state/canvasStore.ts`): `createNoteNode`/`createGroupNode`/`createResourceNode` mint `id: crypto.randomUUID()` and `nodeSchema.parse(...)`; `hydrate`/`serialize` round-trip through `nodeSchema`.
- **Context** (`apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`): the load effect (lines ~185-223) calls `loadProjectDocument` → `hydrateWorkspaceDocument`; the persist effect (lines ~240-296) calls `flushCanvasLayout` **then** `persistProjectDocument`; `selectProject` (lines ~547-562) also calls `persistProjectDocument`. Node-creation callbacks (`createNoteNode`, `createGroupNode`, `addResourceNode`, `addResourceNodeFromAbsolutePath`) are synchronous today.

**Entity-type mapping decision (used across tasks):** legacy canvas node types have no graph entity type. For the cutover, node creation maps canvas `type` → `NewGraphNodeInput.entityType` as: `note` → `"Work"`, `group` → `"Work"`, `resource` → `"Source"`. All are created with `isTemporal: false` and `body: "[]"` (WS0 §7 empty-doc sentinel). `"Work"`/`"Source"` are both `CreatableEntityType`s and default trans-temporal (canvas lens), which matches how these legacy nodes behave (no timeline projection). Rationale: these are placeholder substances the author refines in the document view; entity type is authorable later via WS2 `updateGraphNode` patches / Graphiti. This mapping lives in one helper (Task 3) so it is not duplicated.

This plan **must run before the rest of WS4 and before WS5.** It touches: `apps/desktop/src-tauri/src/db/repositories/graph.rs`, `apps/desktop/src-tauri/src/commands/graph.rs`, `packages/schema/src/node.ts`, `packages/canvas/src/state/canvasStore.ts`, `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`, and deletes `packages/exporter/src/renderMarkdown.d.ts`.

---

## Task 1 — Rust `create_node` accepts an optional client-supplied `graph_node_id`

**Id-reconciliation decision (the crux):** `create_node` will accept an **optional** `graph_node_id`; when `Some`, it is used verbatim as the Neo4j `graph_node_id`; when `None`, `create_node` mints a fresh UUIDv4 exactly as today (preserving every existing caller — operator seeding, tests, agent paths). This makes the frontend the single source of truth for the id across all three stores (Neo4j substance, SQLite layout, canvas node), giving a true 1:1 join by `graph_node_id`. Chosen over "adopt the returned id as the canvas node id" because the frontend must mint the id *before* the async create resolves (React needs a stable node id to render immediately and to key the optimistic layout row); a client-provided id keeps creation synchronous-feeling and avoids a two-phase id swap in the store.

**Legacy-migration decision:** clean cutover, no lazy migration. The load path (Task 5) reads only `loadCanvasView` (Neo4j ⨝ layout); any pre-existing legacy `canvas_nodes` rows are simply not read. Justified because this branch has negligible real authored theory data (the legacy rows are throwaway dev fixtures), a lazy "create a GraphNode for each legacy node" migration would add substantial one-time code and a Neo4j write on first load for data nobody needs, and WS0 §3.2 already retains the legacy tables (for annotations) rather than dropping them — so nothing is destroyed, it is only bypassed.

**Files:**
- Modify: `apps/desktop/src-tauri/src/db/repositories/graph.rs` (`NewGraphNode` struct + `create_node` fn)
- Modify: `apps/desktop/src-tauri/src/commands/graph.rs` (`CreateGraphNodeRequest` struct + `create_graph_node_command` mapping)
- Create: `apps/desktop/src-tauri/tests/graph_node_client_id.rs`

**Interfaces:**
- Consumes: `GraphRepository::new(SharedGraph, String)`, `GraphRepository::ensure_schema()`, `GraphRepository::get_node(&str)`; `support::neo4j_test_graph()`, `support::block_on(...)` from `apps/desktop/src-tauri/tests/support/mod.rs`.
- Produces: `pub struct NewGraphNode { pub graph_node_id: Option<String>, pub entity_type: String, pub title: String, pub body: String, pub coordinate: Option<String>, pub source_coordinates: Vec<String>, pub is_temporal: bool, pub valid_from: Option<String>, pub valid_to: Option<String>, pub temporal_precision: Option<String> }` and `GraphRepository::create_node(&self, input: NewGraphNode) -> Result<GraphNode, String>` using `input.graph_node_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string())`. `CreateGraphNodeRequest` gains `#[serde(default)] pub graph_node_id: Option<String>`.

Steps:
- [ ] Write failing test `apps/desktop/src-tauri/tests/graph_node_client_id.rs`: `mod support;`. Test `create_node_honours_client_supplied_id`: skip when `support::neo4j_test_graph()` is `None` (`eprintln!("skipping: NEO4J_TEST_URI unset"); return;`). Build `GraphRepository`, `block_on(repo.ensure_schema())`. Set `let wanted = format!("ws4a-{run_id}");` and call `repo.create_node(NewGraphNode { graph_node_id: Some(wanted.clone()), entity_type: "Work".into(), title: format!("Client-id {run_id}"), body: "[]".into(), coordinate: None, source_coordinates: vec![], is_temporal: false, valid_from: None, valid_to: None, temporal_precision: None })`. Assert `created.graph_node_id == wanted`. Assert `block_on(repo.get_node(&wanted)).unwrap().unwrap().title == format!("Client-id {run_id}")`. Add a second assertion: `create_node` with `graph_node_id: None` still returns a non-empty id (`assert!(!minted.graph_node_id.is_empty())`). Teardown: `DETACH DELETE` both ids.
- [ ] Run `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml graph_node_client_id -- --test-threads=1` (with `.env` sourced + `NEO4J_TEST_URI` set to the bolt URI) expecting a **compile failure**: `NewGraphNode` has no field `graph_node_id`.
- [ ] Minimal implementation: in `graph.rs`, add `pub graph_node_id: Option<String>` as the first field of `NewGraphNode`. In `create_node`, replace `let id = uuid::Uuid::new_v4().to_string();` with `let id = input.graph_node_id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());`. Leave the rest of the Cypher and param binding unchanged (still `.param("id", id.clone())`). In `commands/graph.rs`, add `#[serde(default)] pub graph_node_id: Option<String>,` to `CreateGraphNodeRequest` and pass `graph_node_id: request.graph_node_id` into the `NewGraphNode { ... }` literal in `create_graph_node_command`.
- [ ] Fix the two existing `NewGraphNode { ... }` literals in the tests that now miss the field: `apps/desktop/src-tauri/tests/graph_node_crud.rs` and `apps/desktop/src-tauri/tests/canvas_view_join.rs` — add `graph_node_id: None,` as the first field to each `NewGraphNode { ... }` (three literals total: one in crud, two in join). Also grep for any other `NewGraphNode {` in `src/` (e.g. operator/seed callers) and add `graph_node_id: None,`.
- [ ] Run `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml graph_node_client_id -- --test-threads=1` expecting **pass**, then `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1` expecting all graph/join tests still green.
- [ ] Commit: `git add apps/desktop/src-tauri/src/db/repositories/graph.rs apps/desktop/src-tauri/src/commands/graph.rs apps/desktop/src-tauri/tests/ && git commit -m "feat(ws4a): create_node accepts optional client-supplied graph_node_id"`

---

## Task 2 — Add `graphNodeId` to the canvas node schema

**Files:**
- Modify: `packages/schema/src/node.ts` (`baseNodeSchema`)
- Modify: `packages/schema/src/index.test.ts` (add a case) OR create `packages/schema/src/node.test.ts` if no schema test file exists — check first; reuse the existing file.

**Interfaces:**
- Consumes: `nodeSchema`, `noteNodeSchema` from `packages/schema/src/node.ts`.
- Produces: `baseNodeSchema` gains `graphNodeId: z.string().uuid().nullable().default(null)`; therefore every `CanvasNode` variant carries `graphNodeId: string | null`. `nodeSchema.parse(input)` preserves a provided `graphNodeId` and defaults it to `null` when absent (so legacy/hand-built nodes still parse).

Steps:
- [ ] Write failing test in the schema package: `parses a note node preserving graphNodeId` — `nodeSchema.parse({ ...validNoteNodeFixture, graphNodeId: "11111111-1111-4111-8111-111111111111" })` and expect the parsed result's `graphNodeId` to equal that UUID; and `defaults graphNodeId to null when absent` — parse the same fixture without `graphNodeId` and expect `.graphNodeId === null`. (Build the fixture from the existing `noteNodeSchema` shape already used in `packages/schema` tests.)
- [ ] Run `pnpm vitest run packages/schema/` expecting failure: parsed `graphNodeId` is `undefined` (stripped by Zod) rather than the UUID / `null`.
- [ ] Minimal implementation: in `baseNodeSchema` add `graphNodeId: z.string().uuid().nullable().default(null),` (place it directly after the `id` field). No other schema change.
- [ ] Run `pnpm vitest run packages/schema/` expecting pass, then `pnpm exec tsc -b` expecting clean (the union type now includes `graphNodeId`).
- [ ] Commit: `git add packages/schema/src/node.ts packages/schema/src/*.test.ts && git commit -m "feat(ws4a): add nullable graphNodeId to canvas node schema"`

---

## Task 3 — Canvas store node creation accepts a pre-minted id + entity-type helper

**Files:**
- Modify: `packages/canvas/src/state/canvasStore.ts` (`createNoteNode`, `createGroupNode`, `createResourceNode` inputs; add `entityTypeForNodeType` helper)
- Modify: `packages/canvas/src/state/canvasStore.test.ts`

**Interfaces:**
- Consumes: `nodeSchema` (now carrying `graphNodeId`), `crypto.randomUUID()`.
- Produces:
  - `entityTypeForNodeType(type: "note" | "group" | "resource" | "portal"): "Work" | "Source"` — `resource` → `"Source"`, everything else → `"Work"` (exported from `canvasStore.ts`).
  - `CreateNoteNodeInput` / `CreateGroupNodeInput` / `CreateResourceNodeInput` each gain an optional `id?: string` and `graphNodeId?: string`. When `id` is provided the created node uses it (else `crypto.randomUUID()`); `graphNodeId` is stamped onto the node (default `null`). The store does **not** call any transport — it stays framework-agnostic; the context (Task 4) supplies the ids.

Steps:
- [ ] Write failing test in `canvasStore.test.ts`: `createNoteNode uses a provided id and graphNodeId` — call `store.getState().createNoteNode({ title: "t", content: "", id: "22222222-2222-4222-8222-222222222222", graphNodeId: "22222222-2222-4222-8222-222222222222" })`, assert `node.id === node.graphNodeId === "2222...."`. Add `entityTypeForNodeType maps resource to Source and note/group to Work` importing `entityTypeForNodeType` and asserting the three mappings. Keep an existing test proving the no-arg path still mints a random id and `graphNodeId` defaults to `null`.
- [ ] Run `pnpm vitest run packages/canvas/src/state/canvasStore.test.ts` expecting failure: `createNoteNode` ignores `id`/`graphNodeId`; `entityTypeForNodeType` is not exported.
- [ ] Minimal implementation: add `id?: string; graphNodeId?: string;` to `CreateNoteNodeInput`, `CreateGroupNodeInput`, `CreateResourceNodeInput`. In each `create*Node`, replace `id: crypto.randomUUID()` with `id: input.id ?? crypto.randomUUID()` and add `graphNodeId: input.graphNodeId ?? null` to the object passed to `nodeSchema.parse(...)`. Export `export function entityTypeForNodeType(type: "note" | "group" | "resource" | "portal"): "Work" | "Source" { return type === "resource" ? "Source" : "Work"; }`. (The input params are already destructured objects; add `id`, `graphNodeId` to each destructure.)
- [ ] Run `pnpm vitest run packages/canvas/src/state/canvasStore.test.ts` expecting pass, then `pnpm exec tsc -b`.
- [ ] Commit: `git add packages/canvas/src/state/canvasStore.ts packages/canvas/src/state/canvasStore.test.ts && git commit -m "feat(ws4a): canvas store accepts pre-minted id/graphNodeId + entity-type helper"`

---

## Task 4 — Node CREATE routes through `createGraphNode` (context callbacks become async)

**Files:**
- Modify: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx` (`createNoteNode`, `createGroupNode`, `addResourceNode`, `addResourceNodeFromAbsolutePath` callbacks + their interface signatures)
- Create: `apps/desktop/src/features/canvas/nodeCreation.ts` (pure helper `buildNewGraphNodeInput`)
- Create: `apps/desktop/src/features/canvas/nodeCreation.test.ts`

**Interfaces:**
- Consumes: `transport.createGraphNode(input: NewGraphNodeInput): Promise<GraphNode>`; `entityTypeForNodeType` (Task 3); `NewGraphNodeInput`, `CreatableEntityType` from `@research-canvas/desktop-api`.
- Produces:
  - `nodeCreation.ts`: `export function buildNewGraphNodeInput(args: { nodeType: "note" | "group" | "resource"; title: string }): NewGraphNodeInput` returning `{ entityType: entityTypeForNodeType(args.nodeType), title: args.title, body: "[]", isTemporal: false, sourceCoordinates: [] }`.
  - The four `CanvasWorkspaceContext` create callbacks become `async` and, before/around inserting the node into the store, mint `const graphNodeId = crypto.randomUUID();`, call `await transport.createGraphNode(buildNewGraphNodeInput({ nodeType, title }))` (using the pre-minted id via the request's `graphNodeId` field), then create the store node with `{ id: graphNodeId, graphNodeId }`. The `CanvasWorkspaceContextValue` signatures for `createNoteNode`/`createGroupNode`/`addResourceNode` change from `(...) => void` to `(...) => Promise<void>` (`addResourceNodeFromAbsolutePath` is already `Promise<void>`).

Steps:
- [ ] Write failing test `nodeCreation.test.ts`: `buildNewGraphNodeInput maps a note to a Work substance with empty body` — assert `buildNewGraphNodeInput({ nodeType: "note", title: "T" })` deep-equals `{ entityType: "Work", title: "T", body: "[]", isTemporal: false, sourceCoordinates: [] }`; and a `resource` case yields `entityType: "Source"`.
- [ ] Run `pnpm vitest run apps/desktop/src/features/canvas/nodeCreation.test.ts` expecting failure: module `./nodeCreation` does not exist.
- [ ] Implement `nodeCreation.ts` with `buildNewGraphNodeInput` per the interface. Import `entityTypeForNodeType` from `@research-canvas/canvas`. (Confirm `entityTypeForNodeType` is re-exported from the canvas package index; if not, add it to `packages/canvas/src/index.ts` exports.)
- [ ] Run the test expecting pass.
- [ ] Wire the context: add `graphNodeId` to the create request. The transport already sends `request: input` verbatim to `create_graph_node_command`, and `CreateGraphNodeRequest` now has `graphNodeId` (Task 1). Since `NewGraphNodeInput` (TS) has no `graphNodeId` field, pass it explicitly: change the four callbacks to `const graphNodeId = crypto.randomUUID(); await transport.createGraphNode({ ...buildNewGraphNodeInput({ nodeType, title }), graphNodeId } as NewGraphNodeInput & { graphNodeId: string });`. Then create the store node with `id: graphNodeId, graphNodeId`. For `createNoteNode`: `const node = stores.store.getState().createNoteNode({ title: "Untitled note", content: "", id: graphNodeId, graphNodeId }); if (position) { stores.store.getState().updateNodePosition(node.id, position); }`. Apply the analogous change to `createGroupNode` (title `"New group"`, uses `createGroupNode` with `x`/`y`), `addResourceNode` (title `entry.name`, nodeType `"resource"`), and `addResourceNodeFromAbsolutePath` (title `plan.title`, nodeType `"resource"`). On a rejected `createGraphNode`, `setErrorMessage(error instanceof Error ? error.message : "failed to create node")` and return without inserting a store node (no orphan layout row for a substance that failed to persist).
- [ ] Add `graphNodeId` to the TS `NewGraphNodeInput` type? NO — keep it off the public input type (WS0 §5.1 fixed shape); the extra field is passed via the inline intersection cast above so the Tauri `#[serde]` request picks it up while the public type stays stable. Confirm this compiles.
- [ ] Update the `CanvasWorkspaceContextValue` interface: `createNoteNode`, `createGroupNode` → `(position?: {...}) => Promise<void>`; `addResourceNode` → `(entry, position) => Promise<void>`. Update every caller of these callbacks in the app to `void`/`await` the promise (grep `createNoteNode(`, `createGroupNode(`, `addResourceNode(` under `apps/desktop/src/`; wrap fire-and-forget UI handlers as `void workspace.createNoteNode(...)`).
- [ ] Run `pnpm exec tsc -b` expecting clean; run `pnpm vitest run apps/desktop/src/features/canvas/` expecting green.
- [ ] Commit: `git add apps/desktop/src/features/canvas/ packages/canvas/src/index.ts && git commit -m "feat(ws4a): node creation creates a Neo4j GraphNode with the same id"`

---

## Task 5 — Node LOAD hydrates from `loadCanvasView` instead of `loadProjectDocument`

**Files:**
- Create: `apps/desktop/src/features/canvas/canvasViewToNodes.ts` (pure mapper `CanvasView` → `{ nodes: CanvasNode[]; edges: CanvasEdge[] }`)
- Create: `apps/desktop/src/features/canvas/canvasViewToNodes.test.ts`
- Modify: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx` (load effect + `refreshCanvas` + `hydrateWorkspaceDocument`)

**Interfaces:**
- Consumes: `transport.loadCanvasView(input: { canvasId; lens: "canvas" }): Promise<CanvasView>`; `transport.loadProjectDocument` (still used for `project`, `entries`, `resourceRoots`, `workingRoot`, `annotations` — WS0 §5.3 keeps these on the legacy path); `JoinedCanvasNode`, `CanvasView`, `EdgeLayout`, `GraphNode`, `NodeLayout` from `@research-canvas/desktop-api`; `CanvasNode`, `CanvasEdge` from `@research-canvas/schema`.
- Produces: `export function canvasViewToCanvasNodes(view: CanvasView): { nodes: CanvasNode[]; edges: CanvasEdge[] }`. Each `JoinedCanvasNode` maps to a `note`-typed `CanvasNode` carrying `id: node.graphNodeId`, `graphNodeId: node.graphNodeId`, `canvasId: view.canvasId`, `title: node.title`, `content: ""`, `summary: node.summary`, `position: { x: layout.positionX, y: layout.positionY }`, `size: { width: layout.width, height: layout.height }`, style from `layout.style`, `tags: []`, `createdAt: node.createdAt`, `updatedAt: node.updatedAt`, all validated through `nodeSchema.parse`. Each `EdgeLayout` maps to a `CanvasEdge` (`id`, `canvasId`, `sourceNodeId: sourceGraphNodeId`, `targetNodeId: targetGraphNodeId`, `relationKind`, handles, `style`, `label: relationKind`) validated through `edgeSchema.parse`.

Steps:
- [ ] Write failing test `canvasViewToNodes.test.ts`: build a `CanvasView` fixture with one `JoinedCanvasNode` (`node.graphNodeId = "33333333-3333-4333-8333-333333333333"`, `body: "[]"`, `title: "N"`, `layout.positionX = 12`, `.width = 240`, `.height = 160`) and one `EdgeLayout`. Assert `canvasViewToCanvasNodes(view).nodes[0]` has `id === graphNodeId === "3333..."`, `type === "note"`, `position.x === 12`, `size.width === 240`; and `edges[0].sourceNodeId === view.edges[0].sourceGraphNodeId`. (This is the load-time analogue proving the compact-node shape carries a real `graphNodeId`.)
- [ ] Run `pnpm vitest run apps/desktop/src/features/canvas/canvasViewToNodes.test.ts` expecting failure: module missing.
- [ ] Implement `canvasViewToNodes.ts` per the interface (import `nodeSchema`, `edgeSchema` from `@research-canvas/schema`). Use `node.summary ?? ""` and coerce `layout.style` fields (`dotColour`, `bgColour`, `textColour`, `thumbnail`) onto the node. Run expecting pass.
- [ ] Rewrite the load effect in `CanvasWorkspaceContext.tsx` (lines ~185-223): still `await transport.loadProjectDocument({ databasePath, projectId })` for `project`/`entries`/`resourceRoots`/`workingRoot`/`annotations`, but ALSO `const view = await transport.loadCanvasView({ databasePath, canvasId: document.project.primaryCanvasId, lens: "canvas" });` and build `const { nodes, edges } = canvasViewToCanvasNodes(view);`. Change `hydrateWorkspaceDocument` to accept the mapped `nodes`/`edges` (from the view) instead of `document.nodes`/`document.edges`: hydrate `nextStores.store` with `{ nodes, edges }` (the graph-derived ones), and hydrate annotations from `document.annotations` (unchanged). Everything else in `hydrateWorkspaceDocument` (selection defaulting, entries, resource roots) stays.
- [ ] Update `refreshCanvas` (lines ~356-371): replace its `loadProjectDocument` + `stores.store.getState().hydrate({ edges, nodes })` with `const view = await transport.loadCanvasView({ databasePath, canvasId: activeProject.primaryCanvasId, lens: "canvas" }); const { nodes, edges } = canvasViewToCanvasNodes(view); stores.store.getState().hydrate({ nodes, edges });` (guard on `activeProject`).
- [ ] Run `pnpm exec tsc -b` and `pnpm vitest run apps/desktop/src/features/canvas/` expecting green.
- [ ] Commit: `git add apps/desktop/src/features/canvas/ && git commit -m "feat(ws4a): hydrate canvas nodes from loadCanvasView (Neo4j join)"`

---

## Task 6 — Retire the legacy `persistProjectDocument` substance double-write for nodes/edges

**Files:**
- Modify: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx` (persist effect lines ~271-278; `selectProject` lines ~547-562)

**Interfaces:**
- Consumes: `transport.flushCanvasLayout(...)` (layout — kept); `stores.annotationStore.getState().serialize()` (annotations — kept on legacy path per WS1).
- Produces: node/edge **substance** is no longer written via `persistProjectDocument`. Layout is written via `flushCanvasLayout`; annotations continue via the legacy path (see step for how annotations remain persisted). Node substance edits flow through WS3 `updateGraphNode` (already wired); node CREATE flows through `createGraphNode` (Task 4).

Steps:
- [ ] Write a failing test — a focused unit around the persist decision. Create `apps/desktop/src/features/canvas/persistPolicy.test.ts` that imports a new pure helper `shouldWriteSubstanceOnLayoutFlush(): boolean` (to be added in `CanvasWorkspaceContext` or a small sibling `persistPolicy.ts`) and asserts it returns `false`. (This encodes the cutover invariant as a test so a future re-introduction of the double-write fails.) If a pure-helper seam feels artificial, instead assert via a render test that after a node drag the mocked `transport.persistProjectDocument` is **not** called while `flushCanvasLayout` **is** — mirror the existing `CanvasWorkspaceContext` test harness if one exists; otherwise the `persistPolicy` helper is the minimal real test.
- [ ] Run the test expecting failure (helper/behavior not present).
- [ ] Implement: create `apps/desktop/src/features/canvas/persistPolicy.ts` exporting `export function shouldWriteSubstanceOnLayoutFlush(): boolean { return false; }`. In the persist effect, remove the `await transport.persistProjectDocument({ ... nodes ..., edges ... })` block (lines ~271-278) that ran after a successful `flushCanvasLayout`. **CONFIRMED CONSTRAINT:** `persist_project_document_command` (`apps/desktop/src-tauri/src/commands/projects.rs` ~line 540-553) is a **full replace-all** — it `DELETE FROM canvas_edges`/`canvas_nodes WHERE canvas_id = ?1` then re-inserts `request.nodes`/`request.edges`, and writes annotations in the same command. So calling it with empty `nodes`/`edges` **clears** the legacy `canvas_nodes`/`canvas_edges` rows (harmless — that abandoned substance is exactly what the cutover drops) while re-inserting the passed annotations. Annotations must still persist: replace the removed call with a dedicated annotations-only write — `transport.persistProjectDocument({ annotations: stores.annotationStore.getState().serialize(), canvasId: activeProject.primaryCanvasId, databasePath, edges: [], nodes: [], projectId: activeProject.id })`. Before shipping, **verify in `persist_project_document_command` that the annotations write does not key off `canvas_nodes`** (annotations live in `canvas_annotations`; read the annotation-insert branch of the command to confirm it is independent of the node rows). If annotations turn out coupled to node rows, keep the annotations write but leave a `flushCanvasLayout`-only persist for nodes and file the coupling as a WS1 follow-up rather than risking annotation loss.
- [ ] Update `selectProject` (lines ~547-562): remove the `persistProjectDocument({ ...nodes..., edges... })` call on project switch; replace with a `flushCanvasLayout` of the current layout (so the outgoing canvas's positions are saved) plus the annotations-only `persistProjectDocument` from the previous step. Keep `setSelectedEdgeId(null); setSelectedNodeId(null); setActiveProjectId(projectId);`.
- [ ] Run `pnpm exec tsc -b` and `pnpm vitest run apps/desktop/src/features/canvas/` expecting green.
- [ ] Commit: `git add apps/desktop/src/features/canvas/ && git commit -m "feat(ws4a): retire legacy node/edge substance double-write; annotations stay on legacy path"`

---

## Task 7 — End-to-end proof: a created node round-trips its body through Neo4j

**Files:**
- Create: `apps/desktop/src-tauri/tests/ws4a_cutover_roundtrip.rs`

**Interfaces:**
- Consumes: `GraphRepository::{new, ensure_schema, create_node, update_node, get_node}`; `GraphNodePatch`; `CanvasService::{new, load_canvas_view}`; `LayoutRepository::upsert_node_layout`, `NodeLayoutRecord`; `ProjectRepository::create`; `support::neo4j_test_graph`, `support::block_on`.
- Produces: a real integration test proving the exact cutover invariant — creating a node with a client-supplied id, placing a layout row with the *same* id, editing its body via `update_node`, and reading it back through `load_canvas_view` yields one `JoinedCanvasNode` whose `node.graph_node_id` equals the id and whose `node.body` is the edited body. This is the substance of "opening a real node mounts WS3's document view reading/writing `GraphNode.body`" at the data layer.

Steps:
- [ ] Write failing test `ws4a_cutover_roundtrip.rs`: `mod support;`. Skip when `neo4j_test_graph()` is `None`. Create a temp SQLite `Database`, a `ProjectRepository::create(...)` project, take its `primary_canvas_id`. Mint `let id = format!("ws4a-rt-{run_id}");`. `block_on(repo.ensure_schema())`. `block_on(repo.create_node(NewGraphNode { graph_node_id: Some(id.clone()), entity_type: "Work".into(), title: format!("RT {run_id}"), body: "[]".into(), coordinate: None, source_coordinates: vec![], is_temporal: false, valid_from: None, valid_to: None, temporal_precision: None }))`. Upsert a `NodeLayoutRecord { graph_node_id: id.clone(), canvas_id, position_x: 10.0, position_y: 20.0, width: 240.0, height: 160.0, style_json: "{}".into(), ... }`. Edit body: `block_on(repo.update_node(&id, GraphNodePatch { body: Some("[{\"type\":\"paragraph\"}]".into()), ..Default::default() }))`. Load via `CanvasService::new(GraphRepository::new(graph.clone(), database.clone()), db_path).load_canvas_view(&canvas_id, "canvas")`. Assert exactly one joined node has `node.graph_node_id == id`, `node.body == "[{\"type\":\"paragraph\"}]"`, `layout.position_x == 10.0`. Teardown `DETACH DELETE`.
- [ ] Run `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml ws4a_cutover_roundtrip -- --test-threads=1` (`.env` sourced, `NEO4J_TEST_URI` set) expecting a **pass** (all consumed APIs already exist after Task 1). If it fails, that failure is the real signal — debug per superpowers:systematic-debugging, do not weaken the assertions.
- [ ] Run the full Rust suite `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1` expecting green.
- [ ] Commit: `git add apps/desktop/src-tauri/tests/ws4a_cutover_roundtrip.rs && git commit -m "test(ws4a): created node round-trips body through Neo4j via loadCanvasView"`

---

## Task 8 — WS3 cleanups: delete the stray committed `renderMarkdown.d.ts`; document the beforeunload limitation

**Files:**
- Delete: `packages/exporter/src/renderMarkdown.d.ts`
- Modify: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx` (add a code comment noting the beforeunload-not-awaited limitation — no behavior change)

**Interfaces:**
- Consumes: nothing new.
- Produces: the committed build artifact `packages/exporter/src/renderMarkdown.d.ts` is removed from `src/` (the real declarations are emitted to the package's build output, not `src/`); a documented (not chased) note that `window.addEventListener("beforeunload", flushLatest)` cannot await the async `flushCanvasLayout`, so the final flush is best-effort on hard unload.

Steps:
- [ ] Confirm the file is a stray artifact: `git log --oneline -- packages/exporter/src/renderMarkdown.d.ts` and `grep -rn "renderMarkdown.d.ts\|from \"./renderMarkdown\"" packages/exporter/src/` — verify the real `renderMarkdown.ts` (source) exists alongside it and nothing imports the `.d.ts` explicitly (TS resolves `.ts`, not the committed `.d.ts`).
- [ ] Delete it: `git rm packages/exporter/src/renderMarkdown.d.ts`.
- [ ] Run `pnpm exec tsc -b` and `pnpm vitest run packages/exporter/` expecting green (removing a redundant declaration file next to its `.ts` source must not break typing).
- [ ] In `CanvasWorkspaceContext.tsx`, above the `window.addEventListener("beforeunload", flushLatest);` line, add the comment: `// LIMITATION (WS3 review): beforeunload cannot await this async flush; the final layout write is best-effort on hard window close. The document-view body flush has the same constraint (WS3 flushOnClose). Not addressed here — tracked for a future durable-flush task.` No code change.
- [ ] Commit: `git add -A && git commit -m "chore(ws4a): remove stray committed renderMarkdown.d.ts; note beforeunload flush limitation"`

---

## Done When

- [ ] Rust `create_node` accepts an optional `graph_node_id` and uses it verbatim when supplied, minting a fresh UUID otherwise (`graph_node_id: None` callers unchanged) — proven by `graph_node_client_id.rs` against live Neo4j.
- [ ] `baseNodeSchema` carries `graphNodeId: string | null`, so `hydrate`/`serialize` preserve it (no longer stripped by Zod).
- [ ] Creating a node on the canvas (`createNoteNode`/`createGroupNode`/`addResourceNode`/`addResourceNodeFromAbsolutePath`) creates a real Neo4j `GraphNode` whose `graph_node_id` equals the canvas node's `id` and its `node_layout.graph_node_id` — a 1:1 join across all three stores.
- [ ] Node hydration reads from `transport.loadCanvasView({ lens: "canvas" })` (Neo4j ⨝ SQLite layout), not `loadProjectDocument`; `project`/`entries`/`resourceRoots`/`annotations` still come from `loadProjectDocument`.
- [ ] The legacy `persistProjectDocument` node/edge **substance** double-write is gone from the persist effect and `selectProject`; annotations still persist (legacy path, WS1); layout still persists via `flushCanvasLayout`.
- [ ] **Key criterion:** opening a real canvas node mounts WS3's `NodeDocumentPane` (because `node.graphNodeId` is now a live Neo4j id) — proven at the data layer by `ws4a_cutover_roundtrip.rs`: a created node's `body`, edited via `update_node`, is read back through `load_canvas_view` at the same `graph_node_id`.
- [ ] The stray `packages/exporter/src/renderMarkdown.d.ts` is deleted; the beforeunload-not-awaited limitation is documented in a code comment (not chased).
- [ ] `pnpm exec tsc -b` clean; `pnpm vitest run` green; `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1` green (graph tests pass against the live Docker Neo4j when `NEO4J_TEST_URI` is set, skip cleanly when unset).

## Tasks requiring live Neo4j

Tasks **1** and **7** run real Cypher against the Docker Neo4j (`bolt://127.0.0.1:7687`, creds in repo `.env`). Their tests source `.env` and set `NEO4J_TEST_URI` to the bolt URI; when unset they `eprintln!` a skip and return (so CI without Neo4j stays green, but the acceptance run must have Neo4j up). Tasks 2–6 and 8 are pure TS/schema/context changes with Vitest + `tsc` only (no Neo4j).

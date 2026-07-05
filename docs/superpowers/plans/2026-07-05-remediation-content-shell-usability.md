# Remediation: Usable Content + Coherent Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **Every workstream ends with RUNTIME verification by operating the real app — not just jsdom unit tests.** Unit-only green is what let all these regressions ship; do not repeat it.

**Goal:** Make the app genuinely usable: node content editable and persistent offline (local-first, syncs to Neo4j), real file/image ingestion via native pickers, and a coherent shell where every panel opens/closes predictably and nothing overlaps or gets stuck.

**Architecture:** Five workstreams on one branch, merged once. (1) **Content local-first** — the node document body gets a local SQLite store that is the working copy; the editor always mounts from local; edits persist locally and sync to Neo4j best-effort with retry; Neo4j is a sync target, not a read gate. (2) **File/image ingestion** — add Tauri `plugin-dialog` + `plugin-fs` (broad scope), native "Insert image"/"Attach file" actions that get an absolute path and use the existing (working) Rust import command, with errors surfaced. (3) **Coherent shell state** — one authoritative overlay model: every panel has a close, selection never force-reopens a closed panel, modals are mutually exclusive, the rail stays reachable, Files restores Files, Projects un-buried. (4) **Reading routing + z-index** — Back returns to canvas; unify the two z-index scales. (5) **Sequences → modal.**

**Tech Stack:** Tauri v2 (Rust), React 19, TypeScript, Zustand, SQLite (rusqlite/migrations), Neo4j (existing transport), Vitest (unit), Playwright (e2e — the real composed app), `@research-canvas/node-document` (BlockNote doc store), `@tauri-apps/plugin-dialog` + `@tauri-apps/plugin-fs` (new).

## Context: verified root causes (from parallel investigation, `main`)

- **Content is Neo4j-gated but nodes are local-first.** `NodeDocumentPane.tsx:42-85` mounts the editor only inside `.then()` of `transport.readGraphNode({graphNodeId})`; on failure it shows "failed to read node" (`:69-71,79-85`). `createNoteNode` (`CanvasWorkspaceContext.tsx:558-579`) mints `graphNodeId` locally, places the node, and fires `createGraphNode` best-effort with the error swallowed. So any node whose Neo4j write failed (Docker/Neo4j down, transient) is permanently unreadable. The local sidecar body (`style.__canvasNode.content`, `canvasViewToNodes.ts:110`, schema `graphBundle.ts:71-112`) exists but is never used for graph-backed nodes (`NodeReaderBody.tsx:34-45`).
- **Images silently vanish.** Only trigger is drag/paste reading `File.path` (undefined in Tauri v2) in `NodeContentDropSurface.tsx:35-39`; no file/image picker; no `plugin-dialog`/`plugin-fs` installed. The Rust `import_node_image` command works (`commands/assets.rs:48-76`).
- **Shell state is incoherent.** `leftMode` never resets to "files" (Files rail = `toggleBrowser` only; Search/Annotate = `setBrowserMode` which set+force-open) — strands the panel on the un-closable Annotations view (`IconStrip.tsx:38-48`, `Shell.tsx:53-59`). Inspector auto-reopens on every node select unless pinned (`Shell.tsx:79-87`). `drawingMode` has no off-path when its panel closes. `LeftOverlay`/`AnnotationsPanel` have no close button. Full-screen layers (reader/sequences/settings) have no mutual exclusion. Projects buried behind the new Graph-default `browserView` (`LeftOverlay.tsx:23`, two conditionals deep). Rail hidden entirely in reading lens (`Shell.tsx:112`).
- **Back button never returns to canvas.** `closeFullScreen` only sets `fullScreenMode="closed"`, never `setLens("canvas")` (`FullScreenReader.tsx:50` → `Shell.tsx:27`), so you fall back into the in-stage `ReadingLens` (`Shell.tsx:158`). `.ishell-reading` has no z-index while `.ishell-inspector` has `z-index:7` (`observatory.css`), so the inspector covers the ⤢/back control.
- **Sequences is a full opaque takeover** (`styles.css:2189`, `position:fixed;inset:0;z-index:8000`), not a modal.

## Global Constraints

- Frontend unit tests: `pnpm vitest run <file>`. Type-check: `pnpm exec tsc -b`. Rust tests: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml <name> -- --test-threads=1`. E2E: `pnpm playwright test <spec>`.
- **RUNTIME GATE:** each workstream's final task launches the real app (`pnpm launch`) and/or a Playwright e2e against the composed frontend, and the controller confirms the specific behavior by operating it. A workstream is not "done" on unit-green alone.
- Two-store discipline: SQLite = presentation + **local working copies** (now includes the node document body); Neo4j = graph substance / relationships / temporal, reached only via the transport/repository layer. Never join across the DB boundary in SQL.
- Dirty-tree staging rule: working tree carries ~246 UNRELATED changes; stage ONLY each task's files by explicit path. NEVER `git add -A`/`.`/`commit -a`.
- Observatory palette: cyan `var(--ob-accent)` sole UI accent; amber reserved for archetypal lighting.
- Preserve the theory/graph model: this plan does NOT remove Neo4j; it stops content editing from being *gated* on Neo4j. Relationships, temporal validity, lighting, timeline all stay Neo4j-backed.

---

## WORKSTREAM 1 — Content local-first (the core defect)

**Design.** Introduce a local node-document store in SQLite keyed by `graph_node_id`, holding the BlockNote `body` (JSON string) + `summary` + a `dirty`/sync marker. `NodeDocumentPane` mounts the editor **synchronously from the local body** (empty if none) — no Neo4j read gate, no "failed to read node." Every edit flushes to the local store (authoritative) and syncs to Neo4j best-effort with retry. On mount, a best-effort Neo4j read reconciles (if local is empty and Neo4j has a body, seed local). This mirrors the already-adopted layout-authoritative canvas load.

### Task 1.1: `node_document` SQLite migration + repository

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0010_node_document.sql`
- Modify: `apps/desktop/src-tauri/src/db/repositories/` (add a `node_document.rs` repo module or extend the existing layout repo — follow the pattern in `db/repositories/graph.rs`/`layout` repo)
- Test: `apps/desktop/src-tauri/tests/node_document_repository.rs`

**Interfaces (Produces):**
- SQL table `node_document(graph_node_id TEXT PRIMARY KEY, body TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL, neo4j_synced INTEGER NOT NULL DEFAULT 0)`.
- Rust: `LocalNodeDocument { graph_node_id: String, body: String, summary: String, neo4j_synced: bool }`; `get_node_document(&self, graph_node_id: &str) -> Result<Option<LocalNodeDocument>>`; `upsert_node_document(&self, graph_node_id: &str, body: &str, summary: &str, neo4j_synced: bool) -> Result<()>` (true ON CONFLICT upsert on `graph_node_id`).

- [ ] **Step 1: Read the pattern.** Read `apps/desktop/src-tauri/migrations/0008_layout_store.sql` and the layout repository + one existing `tests/*_repository.rs` to match the migration registration, connection, and test-harness style exactly.
- [ ] **Step 2: Write the failing repository test** at `tests/node_document_repository.rs`: open a temp DB, run migrations, assert `get_node_document("x")` is `None`; `upsert_node_document("x","BODY","sum",false)` then `get_node_document("x")` returns the row with `body=="BODY"`; a second upsert updates in place (no duplicate row).
- [ ] **Step 3: Run** `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml node_document_repository -- --test-threads=1` — expect FAIL (no table/methods).
- [ ] **Step 4: Add the migration + repo methods**, registering the migration where `0009_agent_activity.sql` is registered (grep for `0009` in the src to find the migration list).
- [ ] **Step 5: Run** the test — expect PASS.
- [ ] **Step 6: Commit** (stage only the migration, repo file, test).

### Task 1.2: Tauri commands + transport for the local node document

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/` (add `read_local_node_document_command`, `upsert_local_node_document_command`), register in `lib.rs` `generate_handler![]`.
- Modify: `packages/desktop-api/src/index.ts` (transport methods + the `WorkspaceTransport` interface).
- Test: Rust command test (or exercise via the repo test) + `packages/desktop-api` type-check.

**Interfaces (Produces):**
- Commands take `{ database_path, graph_node_id }` (read) and `{ database_path, graph_node_id, body, summary }` (upsert), matching the arg-casing convention used by the existing layout commands (read one to confirm snake_case vs camel bridging).
- Transport: `readLocalNodeDocument(input: { databasePath: string; graphNodeId: string }): Promise<{ body: string; summary: string; neo4jSynced: boolean } | null>`; `upsertLocalNodeDocument(input: { databasePath: string; graphNodeId: string; body: string; summary: string; neo4jSynced?: boolean }): Promise<void>`. Add both to the `WorkspaceTransport` interface AND the static/web read-only transport (read returns the value; upsert is a no-op-or-throw consistent with how the web transport handles other layout writes — follow the existing pattern).

- [ ] **Step 1: Read** an existing command pair (e.g. the layout upsert command + its transport method in `desktop-api/src/index.ts`) to copy arg-casing, error handling, and the `invokeTauri` wrapper.
- [ ] **Step 2:** Add the two Rust commands (delegating to Task 1.1's repo), register them in `lib.rs`.
- [ ] **Step 3:** Add the two transport methods + interface entries + the web-transport counterparts.
- [ ] **Step 4: Verify** `pnpm exec tsc -b` clean and `cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml` compiles.
- [ ] **Step 5: Commit** (stage only the command file, lib.rs, desktop-api index).

### Task 1.3: `NodeDocumentPane` mounts from local, syncs to Neo4j (removes the read gate)

**Files:**
- Modify: `apps/desktop/src/features/viewer/NodeDocumentPane.tsx`
- Modify: `apps/desktop/src/features/viewer/NodeReaderBody.tsx` (pass `databasePath` through) and `GraphDocumentContent.tsx` (thread `databasePath`)
- Test: `apps/desktop/src/features/viewer/NodeDocumentPane.test.tsx` (extend)

**Interfaces (Consumes):** Task 1.2 transport methods. **Produces:** an editor that ALWAYS mounts (no `loadError` dead-end) and persists locally + syncs Neo4j.

Behavior to implement (replace the `readGraphNode`-gated `useEffect` at `NodeDocumentPane.tsx:42-77`):
- On mount: call `transport.readLocalNodeDocument({ databasePath, graphNodeId })`. Mount the `createNodeDocumentStore` with `initialBody = local?.body ?? ""` **synchronously** (no gate). If `readLocalNodeDocument` itself throws (DB error), mount with empty body and show a small non-blocking status, NOT a full-pane error.
- `flush(body, summary)`: **await `upsertLocalNodeDocument(...)` first (authoritative)**, then fire `transport.updateGraphNode({graphNodeId, patch:{body,summary}})` best-effort; on Neo4j failure, mark local `neo4j_synced=false` and DO NOT surface a blocking error (a subtle "saved locally, sync pending" status is fine). Retry the Neo4j sync on the next successful flush.
- Reconcile (best-effort, non-blocking): after mount, fire `readGraphNode` in the background; if it succeeds and the local body was empty while Neo4j has a non-empty body, seed the local store + `upsertLocalNodeDocument(..., neo4jSynced:true)`. If it fails, ignore (offline is fine).
- The `editable` prop and `flushOnClose` behavior are preserved (the close-flush now writes local first).

- [ ] **Step 1:** Extend `NodeDocumentPane.test.tsx` with a test that a **failed `readGraphNode` no longer produces a dead-end**: mock transport so `readLocalNodeDocument` returns `{body:"LOCAL",...}` and `readGraphNode` REJECTS; assert the editor (BlockNote body) mounts with "LOCAL" and NO `role="alert"` "failed to read node" element appears. Add a second test: `setBody` → flush calls `upsertLocalNodeDocument` (and best-effort `updateGraphNode`).
- [ ] **Step 2: Run** — expect FAIL (current code shows the error pane).
- [ ] **Step 3: Implement** the local-first mount/flush/reconcile above; thread `databasePath` from the workspace through `NodeReaderBody`/`GraphDocumentContent` into `NodeDocumentPane` (read how `databasePath` is currently obtained — `useCanvasWorkspace().databasePath`).
- [ ] **Step 4: Run** — expect PASS. Then `pnpm vitest run apps/desktop/src/features/viewer` and `pnpm exec tsc -b`.
- [ ] **Step 5: Commit** (stage only the viewer files + test).

### Task 1.4: Seed local doc on note creation + retry unsynced creates

**Files:**
- Modify: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx` (`createNoteNode`, and a reconnect-retry for failed `createGraphNode`)
- Test: `apps/desktop/src/features/canvas/nodeCreation.test.ts` (extend)

**Behavior:**
- `createNoteNode`: after placing the local node, call `transport.upsertLocalNodeDocument({ databasePath, graphNodeId, body:"", summary:"" })` so the node has a local document immediately (editor opens instantly, even fully offline).
- The best-effort `createGraphNode` `.catch` should record the `graphNodeId` as "pending sync" (a module-level Set or a small store), and a reconnect/retry helper re-attempts pending `createGraphNode` + `updateGraphNode` when a later transport call succeeds (or on an interval). Keep it simple and best-effort; the acceptance is that a node created offline becomes editable and, once Neo4j is up, its content lands there.

- [ ] Steps: write failing test (createNoteNode calls upsertLocalNodeDocument) → run fail → implement → run pass → tsc → commit (explicit paths).

### Task 1.5: **RUNTIME verification** — content works offline and online

- [ ] **Step 1: Add a Playwright e2e** `tests/e2e/content-local-first.spec.ts` that drives the composed frontend (per the existing `tests/e2e/smoke.spec.ts` harness): create a note node, open it (double-click → reading lens), type content, and assert the editor is present and no "failed to read node" alert appears — with the graph transport forced to reject reads (simulating Neo4j down). Read `tests/e2e/smoke.spec.ts` first to match the harness/mocking approach.
- [ ] **Step 2: Run** `pnpm playwright test tests/e2e/content-local-first.spec.ts` — must pass.
- [ ] **Step 3: Controller manual launch:** `pnpm launch`, with Neo4j/Docker STOPPED. Create a note, open it, type, close, reopen — content persists and the editor never bricks. Then start Neo4j and confirm content syncs. Record the observed result (this is the gate).
- [ ] **Step 4: Commit** the e2e spec.

---

## WORKSTREAM 2 — File & image ingestion (native pickers, broad FS)

### Task 2.1: Install + register `plugin-dialog` and `plugin-fs`

**Files:**
- Modify: `apps/desktop/package.json` (add `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`), `apps/desktop/src-tauri/Cargo.toml` (`tauri-plugin-dialog`, `tauri-plugin-fs`), `apps/desktop/src-tauri/src/lib.rs` (`.plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_fs::init())`), and the Tauri v2 capabilities file under `apps/desktop/src-tauri/capabilities/` (grant `dialog:default`, `dialog:allow-open`, and `fs` read scope broadly — `$HOME/**` and absolute reads per the user's "broad access" choice).

- [ ] **Step 1: Read** `apps/desktop/src-tauri/tauri.conf.json` and the `capabilities/` dir to learn the v2 permission format in THIS project. Read the Tauri v2 dialog/fs plugin docs conventions (permissions live in capabilities json, not tauri.conf `allowlist`).
- [ ] **Step 2:** Add the deps (pnpm + cargo), register the plugins, add the capability permissions.
- [ ] **Step 3: Verify** `pnpm install` + `cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml` succeed and the app still boots (`pnpm launch` opens).
- [ ] **Step 4: Commit** (explicit paths: package.json, Cargo.toml, lib.rs, capabilities file).

### Task 2.2: "Insert image" + "Attach file" actions via native picker

**Files:**
- Modify: `apps/desktop/src/features/canvas/contentLinkingActions.ts` (or a new `apps/desktop/src/features/canvas/insertMedia.ts`) — a function `pickAndInsertImage(graphNodeId)` that uses `open({ multiple:false, filters:[{name:'Images',extensions:['png','jpg','jpeg','gif','webp','svg']}] })` from `@tauri-apps/plugin-dialog` to get an **absolute path**, then calls the existing working `importNodeImage` + append-image-block + `updateGraphNode` pipeline (which already exists at `contentLinkingActions.ts:58-63`). A `pickAndAttachFile(graphNodeId)` similarly for arbitrary files.
- Modify: the reading surface / node document UI to add visible "Insert image" and "Attach file" buttons (in `GraphDocumentContent.tsx` near the existing link pickers, or the reading-lens bar) wired to these actions.
- Modify: `NodeContentDropSurface.tsx:35-39` — for drag/paste, when `File.path` is undefined (Tauri v2), fall back to writing the `File` bytes via the fs plugin / a Rust command, OR at minimum **surface an error toast instead of silently dropping**. (Read the file; the robust path is to read the File as an ArrayBuffer and hand bytes to a Rust import-by-bytes command; if that's too large for this task, at least stop the silent no-op and route users to the picker.)
- Test: unit test the picker→import wiring with the dialog + transport mocked; assert `importNodeImage` is called with the picked absolute path and an image block is appended.

- [ ] Steps: read current `contentLinkingActions.ts` + `import_node_image` transport; write failing unit test (pick → importNodeImage called with abs path → image block appended); run fail → implement picker action + buttons + drop-surface error surfacing → run pass → tsc → commit.
- [ ] **CRITICAL:** every action must `try/catch` and surface failure (toast/status), never swallow — the current silent-failure is half the "nothing works" complaint.

### Task 2.3: **RUNTIME verification** — get an image into a node

- [ ] Controller manual launch `pnpm launch`: open a node, click "Insert image", pick a real image from disk, confirm it appears in the document and persists across reopen. Confirm "Attach file" links a file. Record observed result. Add a Playwright e2e where feasible (dialog is native — may only be manually verifiable; if so, document that and rely on the unit test + manual gate).

---

## WORKSTREAM 3 — Coherent shell state model

**Design.** Introduce one authoritative rule set in `useShellLayout` / `Shell`:
- **Every summoned panel has an explicit close** and a single toggle; opening a panel never mutates an unrelated panel's state.
- **Selection does not force-reopen a closed inspector.** Track a user-intent `inspectorDismissed` so node-select only auto-opens when the user hasn't explicitly closed it (or gate auto-open behind a setting; simplest: auto-open only if `inspectorOpen` was never explicitly closed this session — use a `inspectorUserClosed` flag reset when the user opens it via rail/⌘I).
- **Left panel:** the Files rail verb sets mode to "files" AND toggles visibility (symmetric with Search/Annotate); add an in-panel close button to `LeftOverlay`; `drawingMode` resets to false whenever the browser closes or leaves annotations mode; Projects visible by default (either make `browserView` default to "files", or surface the project switcher above the Graph/Files toggle so it's always visible).
- **Modals mutually exclusive:** opening the palette/sequences/settings/full-screen closes the others; global shortcuts are ignored while a full-screen/modal layer is open (except its own dismiss).
- **Rail reachable in reading lens:** do not hide `IconStrip` in reading; instead let reading recede other chrome but keep the rail (or provide an always-visible lens switch + a way to summon panels).

### Task 3.1: `useShellLayout` — symmetric toggles, explicit closes, no cross-coupling
- [ ] Add/repair: `openBrowser(mode)` that sets both mode+open; `closeBrowser()`; `inspectorUserClosed` intent; a single `closeAllModals()`; `drawingMode` reset hook. TDD the hook (extend `useShellLayout.test.ts`): closing the inspector then selecting a node does NOT reopen it; opening the browser via Files sets mode "files"; closing the browser resets drawingMode. Implement → pass → commit.

### Task 3.2: `IconStrip` + `Shell` wiring — Files restores Files, inspector respects dismissal, rail in reading
- [ ] Fix `IconStrip.handleNavClick` so Files calls `onSetBrowserMode("files")` (symmetric with search/annotate) with toggle-off-if-active (restore the pre-redesign uniform pattern from `git show b3377f9:.../IconStrip.tsx`). Fix `Shell.handleNodeSelect` to respect `inspectorUserClosed`. Stop hiding the rail in reading (`Shell.tsx:112`) — keep it, let reading recede via CSS only. Add mutual-exclusion on modal open. TDD via `Shell.test.tsx`: rail present in reading; Files reopens Files not Annotations; inspector stays closed after explicit close + node select. Implement → pass → commit.

### Task 3.3: `LeftOverlay` close button + Projects un-buried + `AnnotationsPanel` close
- [ ] Add an in-panel `×` close to `LeftOverlay` (calls `closeBrowser`); make the project switcher always visible in files mode (not gated behind `browserView==="files"`); add a close/exit affordance to the annotations/drawing panel that also clears `drawingMode`. TDD `LeftOverlay.test.tsx`. Implement → pass → commit.

### Task 3.4: **RUNTIME verification** — panels open/close cleanly, nothing sticks
- [ ] Playwright e2e `tests/e2e/shell-panels.spec.ts`: open annotations then click Files → file browser shows (not annotations); open inspector via node select, close it, select another node → stays closed; open browser, close via its × ; switch to reading → rail still visible. Run it. Controller `pnpm launch` and operate each. Record. Commit.

---

## WORKSTREAM 4 — Reading routing + z-index unification

### Task 4.1: Back returns to canvas
- [ ] In `Shell.tsx`, make the full-screen "Back"/close reconcile the lens: `closeFullScreen` (or a wrapper) sets `fullScreenMode="closed"` AND, if the user came from a node-read, `setLens("canvas")`. Decide the intended model: double-click opens the reading lens; the reading-lens ⤢ opens full-screen; full-screen Back → returns to the **reading lens**; a separate reading-lens "← Canvas" affordance → `setLens("canvas")`. Ensure there is always a one-click path back to the canvas from both reading surfaces (add an explicit "← Canvas" control to `ReadingLens`). TDD `Shell.test.tsx` / `ReadingLens.test.tsx`: from reading lens, the canvas-return control sets lens to canvas; from full-screen, Back returns to reading lens, and canvas-return from there reaches canvas. Implement → pass → commit.

### Task 4.2: Unify z-index scale
- [ ] Establish ONE z-index scale (document it as CSS custom properties in `observatory.css`, e.g. `--z-panel:7; --z-dock:8; --z-modal:500; --z-toast:900`) and apply it to `.ishell-reading` (give it a base below panels so the reading bar/controls aren't covered — actually the reading surface is the stage content; the inspector should NOT overlap the reading-lens bar controls: give `.ishell-reading__bar` a stacking context above the inspector, OR inset the inspector so it never covers the reading bar's ⤢/back). Reconcile `.fullscreen-reader` (styles.css:3001, z-index 500) into the same scale. Verify by launch that nothing covers the reading/back controls. Commit.

### Task 4.3: **RUNTIME verification**
- [ ] Controller `pnpm launch`: double-click node → read → ⤢ full-screen → Back → returns to reading → canvas-return → canvas. Inspector never covers the back/⤢ control. Record. (E2e where feasible.)

---

## WORKSTREAM 5 — Sequences as a modal

### Task 5.1: Convert `SequencesManager` to the SettingsOverlay modal pattern
- [ ] Read `apps/desktop/src/features/settings/SettingsOverlay.tsx` (backdrop `onClick={onClose}` + inner card `stopPropagation`) and its CSS. Restructure `SequencesManager.tsx` root into a `sequences-overlay__backdrop` (semi-transparent, canvas dimmed behind) wrapping a bounded `sequences-overlay__card`, with backdrop-click-to-close in addition to Escape/×. Update `styles.css` `.sequences-manager` from `position:fixed;inset:0;opaque` to the backdrop+card modal pattern. Keep the existing Escape/× handlers. TDD where practical (render → backdrop click calls onClose). Implement → pass → commit.
- [ ] **RUNTIME:** launch, open Sequences, confirm it's a dismissible overlay over the (dimmed) canvas, backdrop-click closes. Record.

---

## WORKSTREAM 6 — Final whole-app verification

### Task 6.1: Full runtime sweep + suites
- [ ] `pnpm exec tsc -b` clean; `pnpm vitest run apps/desktop packages/canvas packages/desktop-api` green; `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1` green; `pnpm playwright test` (all e2e) green.
- [ ] **Controller full manual operation of the real app** (`pnpm launch`), Neo4j both up and down: create nodes, add text + an image, link a file, switch all three lenses, open/close every panel, run a sequence, read a node and return to canvas. Confirm every originally-reported symptom is gone. Record the observed results explicitly (this is the acceptance gate the whole plan exists for).

---

## Self-Review

**Coverage of reported symptoms:**
- "No way to add content / failed to read node" → WS1 (local-first content; editor always mounts). ✔
- "Can't get images in / no file system" → WS2 (native pickers + plugins + broad fs). ✔
- "File panel bugs into un-closable drawing tab / projects coupled" → WS3 (symmetric Files toggle, inspector dismissal, closes, drawingMode reset, Projects un-buried). ✔
- "Back button doesn't return to canvas / inspector overlaps it" → WS4 (routing + z-index). ✔
- "Sequences should be a modal" → WS5. ✔

**Architecture note (systematic-debugging Phase 4.5):** WS1 is the one architectural change — it reconciles the split where node *existence* is local-first but node *content* was Neo4j-gated. It does NOT abandon the Neo4j+Graphiti model; it makes the local store the working copy and Neo4j the sync target for the body, consistent with the already-adopted layout-authoritative canvas load. If, during WS1, the local/Neo4j reconciliation proves to need a deeper redesign (e.g. conflict resolution), STOP and escalate rather than layering fixes.

**Process guardrail:** Every workstream has a RUNTIME verification task. Unit-green is necessary but NOT sufficient — the controller must operate the composed app (Neo4j up and down). This is the corrective for how these regressions shipped.

**Placeholder note:** the two architectural workstreams (WS1 Rust/SQLite, WS2 Tauri plugins/capabilities) specify design, interfaces, files, tests, and acceptance precisely but direct the implementer to read the named current files (migrations, repositories, commands, capabilities) for exact patterns — appropriate for deep cross-stack code and the existing conventions. The wiring workstreams (WS3–5) reference exact anchor lines from the verified investigation.

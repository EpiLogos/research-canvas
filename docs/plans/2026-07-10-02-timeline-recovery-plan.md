# First-Class Timeline Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Restore the timeline as a workspace-level first-class lens whose membership is independent of every constellation canvas.

**Architecture:** `loadTimelineView(workspaceId, filters)` queries local temporal graph metadata, optionally enriches from Neo4j, joins dedicated timeline presentation overrides, and returns a typed `TimelineView`. Horizontal position remains date-derived.

**Tech Stack:** Rust/Tauri transport, SQLite, TypeScript API, React timeline lens, Vitest, Cargo, Playwright.

---

## Task 1: Add timeline repository and command contract

**Files:** `packages/desktop-api/src/graph.ts`, `packages/desktop-api/src/index.ts`, `apps/desktop/src-tauri/src/api/types.rs`, `api/handlers.rs`, `commands/graph.rs`, new `commands/timeline.rs`, `lib.rs`, related tests.

1. Write deserialization/serialization tests for `LoadTimelineViewRequest`, filters, timeline nodes, lanes, precision, and layout overrides.
2. Implement `load_timeline_view` from all local temporal graph metadata for a workspace; do not accept `canvasId` as membership scope.
3. Reject invalid temporal anchors with an explicit diagnostic row rather than silently dropping data.
4. Run Rust command/API tests and desktop-api tests.
5. Commit: `feat: add workspace timeline read boundary`.

## Task 2: Project real temporal nodes independently of canvas layouts

**Files:** `apps/desktop/src/features/timeline/createTimelineDataSource.ts`, `apps/desktop/src/layout/Shell.tsx`, `Shell.timeline.test.tsx`, `packages/canvas/src/timeline/contracts.ts`, `projection.ts`, related tests.

1. Add a failing test with a persisted temporal node that has no canvas layout while the active root canvas contains only non-temporal portals.
2. Replace the `loadCanvasView(... lens: timeline)` call with `loadTimelineView(workspaceId)`.
3. Preserve fact/claim/myth/source distinctions from typed metadata; remove the `archetypalResonance => myth-in-time` shortcut.
4. Verify the temporal node renders and the portal does not.
5. Commit: `fix: decouple timeline membership from canvas placement`.

## Task 3: Persist timeline-specific presentation

**Files:** timeline repository/command, `packages/canvas/src/timeline/timelineStore.ts`, `TimelineNode.tsx`, desktop timeline datasource, tests.

1. Write real SQLite round-trip tests for lane, vertical offset, width, height, and style.
2. Persist only user-controlled overrides; derive horizontal location from normalized date and precision.
3. Wire resize and recolour to the timeline layout command and reload path.
4. Verify canvas layout remains unchanged after timeline edits.
5. Commit: `feat: persist independent timeline presentation`.

## Task 4: Open deep reading directly from timeline

**Files:** `apps/desktop/src/layout/Shell.tsx`, `ReadingLens.tsx`, `features/viewer/NodeDocumentPane.tsx`, timeline components/tests.

1. Add a failing double-click test proving the body loads by graph node ID without adding a layout row to the active canvas.
2. Implement direct reader navigation and preserve back/close state.
3. Verify a distinct face summary and BlockNote body render.
4. Commit: `feat: open node reading directly from timeline`.

## Task 5: Real rendered regression

**Files:** new Playwright timeline workflow, representative fixture/compiler input, screenshots under test output only.

1. Start the real desktop web surface plus isolated persistence dependencies.
2. Load a temporal node absent from all canvases, switch lenses, inspect lane/category, resize/recolour, reload, and double-click read.
3. Assert there is no timeline constellation/portal in persisted data.
4. Commit: `test: cover first-class timeline workflow`.


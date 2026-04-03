# Canvas Authoring Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Repair the current canvas authoring workflow so node resize, drag, edge authoring, sequences, image thumbnails, and note content editing behave like a production tool instead of a partial stub.

**Architecture:** The fixes split across three layers. First, persist richer edge metadata and sequence targets so authoring choices survive reloads. Second, wire React Flow interactions to live workspace state with clear resize and edge controls. Third, add real content and image-selection flows in the desktop shell so notes, resources, and thumbnails can be edited from the UI without dead buttons.

**Tech Stack:** React 19, TypeScript, Zustand, @xyflow/react, Tauri v2, Rust, rusqlite, Vitest, Playwright

---

### Task 1: Persist edge anchors and directionality

**Files:**
- Modify: `packages/schema/src/edge.ts`
- Modify: `packages/canvas/src/state/canvasStore.ts`
- Modify: `apps/desktop/src-tauri/migrations/0001_initial.sql`
- Create: `apps/desktop/src-tauri/migrations/0005_edge_anchor_fields.sql`
- Modify: `apps/desktop/src-tauri/src/db/migrations.rs`
- Modify: `apps/desktop/src-tauri/src/db/repositories/canvas.rs`
- Modify: `apps/desktop/src-tauri/src/commands/projects.rs`
- Test: `packages/canvas/src/state/canvasStore.test.ts`
- Test: `apps/desktop/src-tauri/tests/canvas_repository.rs`
- Test: `apps/desktop/src-tauri/tests/workspace_persistence.rs`

**Step 1: Write failing tests**

Add tests that prove:
- a new edge stores `sourceHandleId` and `targetHandleId`
- reconnecting or updating an edge can change those handle ids
- directionality changes survive persistence and reload

**Step 2: Run tests to verify they fail**

Run:
- `pnpm vitest run packages/canvas/src/state/canvasStore.test.ts`
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml canvas_repository workspace_persistence -- --test-threads=1`

**Step 3: Implement the schema and persistence changes**

Add optional edge anchor fields plus directionality update support all the way through the TypeScript schema, store snapshot, SQL migrations, Rust repository reads/writes, and project document payloads.

**Step 4: Re-run the tests**

Run the same commands from Step 2 and confirm they pass.

### Task 2: Make node drag and resize feel direct

**Files:**
- Modify: `packages/canvas/src/CanvasView.tsx`
- Modify: `packages/canvas/src/nodes/NoteNode.tsx`
- Modify: `packages/canvas/src/nodes/ResourceNode.tsx`
- Modify: `packages/canvas/src/nodes/GroupNode.tsx`
- Modify: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`
- Modify: `apps/desktop/src/styles.css`
- Test: `packages/canvas/src/state/canvasStore.test.ts`

**Step 1: Write failing tests**

Add tests covering live position updates and size updates in the store for the drag/resize interaction paths we expect the UI to use.

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/canvas/src/state/canvasStore.test.ts`

**Step 3: Implement the UI fixes**

Replace the generic multi-corner resizer with a visible bottom-right resize grip, wire `onNodeDrag` to update workspace state live, and debounce persistence so drag/resize stays smooth while still saving.

**Step 4: Re-run the tests**

Run: `pnpm vitest run packages/canvas/src/state/canvasStore.test.ts`

### Task 3: Turn edges into real authored objects

**Files:**
- Modify: `packages/canvas/src/CanvasView.tsx`
- Modify: `packages/canvas/src/edges/AnnotatedEdge.tsx`
- Modify: `packages/canvas/src/nodes/NoteNode.tsx`
- Modify: `packages/canvas/src/nodes/ResourceNode.tsx`
- Modify: `packages/canvas/src/nodes/GroupNode.tsx`
- Modify: `apps/desktop/src/styles.css`
- Test: `packages/canvas/src/state/canvasStore.test.ts`

**Step 1: Write failing tests**

Add tests that prove:
- edges can cycle or update directionality
- reversing or reconnecting an edge preserves anchor metadata
- deleting an edge by id still works after those changes

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/canvas/src/state/canvasStore.test.ts`

**Step 3: Implement edge authoring**

Add explicit top/right/bottom/left handles, persist the chosen handle ids, render markers from `directionality`, and add click actions so the user can select, flip, reconnect, or delete an edge without relying on hidden context-menu-only behavior.

**Step 4: Re-run the tests**

Run: `pnpm vitest run packages/canvas/src/state/canvasStore.test.ts`

### Task 4: Make sequences useful and integrate them with edges

**Files:**
- Modify: `packages/schema/src/sequence.ts`
- Modify: `packages/canvas/src/sequences/SequenceStore.ts`
- Modify: `packages/canvas/src/sequences/SequenceStore.test.ts`
- Modify: `packages/canvas/src/sequences/SequenceEditor.tsx`
- Modify: `packages/canvas/src/sequences/SequencePlayer.tsx`
- Modify: `packages/canvas/src/CanvasView.tsx`
- Modify: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`
- Modify: `apps/desktop/src/features/sequences/SequencePanel.tsx`
- Modify: `apps/desktop/src/features/canvas/CanvasScreen.tsx`

**Step 1: Write failing tests**

Add tests proving:
- a sequence can add both node and edge steps
- playback preserves ordering and active-step state
- captured viewport data is stored with each step

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/canvas/src/sequences/SequenceStore.test.ts`

**Step 3: Implement the sequence authoring flow**

Capture the current viewport from the canvas, let the sequence panel add the selected node or selected edge as a step, and teach playback to focus either the node or the edge’s authored viewport.

**Step 4: Re-run the tests**

Run: `pnpm vitest run packages/canvas/src/sequences/SequenceStore.test.ts`

### Task 5: Repair note content editing and resource content loading

**Files:**
- Create: `apps/desktop/src/features/viewer/NodeContentPane.tsx`
- Create: `apps/desktop/src/features/viewer/NodeContentPane.test.tsx`
- Create: `apps/desktop/src/features/viewer/resourceContent.ts`
- Modify: `apps/desktop/src/features/viewer/ContentTab.tsx`
- Modify: `apps/desktop/src/layout/FullScreenReader.tsx`
- Modify: `packages/viewers/src/index.ts`
- Create or modify supporting viewer component(s) if plain-text rendering needs its own view

**Step 1: Write failing tests**

Add UI tests that prove:
- note content can be edited from the content pane
- editing note content updates the callback immediately
- markdown and plain-text resources render through the shared content pane logic

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/desktop/src/features/viewer/NodeContentPane.test.tsx`

**Step 3: Implement the content workflow**

Extract the shared content pane, make note content editable with autosave-style updates, and centralize resource text loading so browser and Tauri modes use one robust path selection strategy instead of ad hoc `asset://` fetches.

**Step 4: Re-run the tests**

Run: `pnpm vitest run apps/desktop/src/features/viewer/NodeContentPane.test.tsx`

### Task 6: Wire image selection into project resources and thumbnails

**Files:**
- Create: `apps/desktop/src/features/canvas/resourceFileHelpers.ts`
- Create: `apps/desktop/src/features/canvas/resourceFileHelpers.test.ts`
- Modify: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`
- Modify: `apps/desktop/src/features/inspector/InspectorTab.tsx`
- Modify: `packages/canvas/src/components/FuzzyFilePicker.tsx`
- Modify: `apps/desktop/src/styles.css`

**Step 1: Write failing tests**

Add tests that prove:
- selecting an absolute image path derives the correct resource root and relative path
- existing project images can be chosen for thumbnails
- image thumbnail assignment updates node style with a stable asset path

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/desktop/src/features/canvas/resourceFileHelpers.test.ts`

**Step 3: Implement image selection**

Use the project’s indexed image files as the primary picker, add an absolute-path fallback for images outside the project, attach the parent folder as a resource root when needed, and wire the Inspector thumbnail button to the new flow.

**Step 4: Re-run the tests**

Run: `pnpm vitest run apps/desktop/src/features/canvas/resourceFileHelpers.test.ts`

### Task 7: Verify the integrated flow

**Files:**
- Modify: `tests/e2e/sequences.spec.ts`
- Modify: `tests/e2e/node-viewer.spec.ts`
- Add or modify one canvas interaction E2E if the browser fixture is stable

**Step 1: Update failing end-to-end coverage around the real UI**

Cover:
- creating/editing a note and seeing the node face update
- creating an edge from a chosen handle and preserving that anchor
- adding an edge step to a sequence and playing it back

**Step 2: Run focused verification**

Run:
- `pnpm vitest run packages/canvas/src/state/canvasStore.test.ts packages/canvas/src/sequences/SequenceStore.test.ts apps/desktop/src/features/viewer/NodeContentPane.test.tsx apps/desktop/src/features/canvas/resourceFileHelpers.test.ts`
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml canvas_repository workspace_persistence -- --test-threads=1`
- `pnpm playwright test tests/e2e/node-viewer.spec.ts tests/e2e/sequences.spec.ts`

**Step 3: Record any remaining gaps**

If the browser-bridge workspace bootstrap is still flaky, document that separately rather than weakening the new interaction coverage.

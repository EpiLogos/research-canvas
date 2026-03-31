# Research Canvas Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local-first Tauri v2 research canvas app and static export viewer with nested projects, graph authoring, freehand annotations, PTY terminal integration, real filesystem resource support, sequence-based traversal, and downloadable public exports.

**Architecture:** Use a monorepo with a Tauri desktop app, shared React packages for canvas and viewers, Rust backend services for SQLite, filesystem indexing, PTY orchestration, and export generation, plus a static viewer built from the same shared rendering primitives. The desktop app owns authoring; export produces a self-contained static bundle that preserves graph, sequences, rendered content, and downloadable assets.

**Tech Stack:** Tauri v2, Rust, React, TypeScript, Vite, React Flow, xterm.js, portable-pty, SQLite with FTS5, CodeMirror 6, Vitest, Playwright, cargo test, pnpm

---

## Delivery Rules

- Use test-first development for every backend repository, frontend state model, and export behavior.
- Prefer real integration tests over mocked equivalents.
- Keep files, folders, and package names exactly as specified unless reality during implementation forces a documented change.
- Use PDF as the supported deck format for v1.
- Treat the embedded terminal, freehand annotation layer, and static export as core v1 scope, not stretch goals.

---

### Task 1: Bootstrap The Workspace

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `playwright.config.ts`
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/vite.config.ts`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/build.rs`
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `README.md`
- Test: `tests/e2e/smoke.spec.ts`

**Step 1: Write the failing smoke test scaffold**

Create `tests/e2e/smoke.spec.ts` with a minimal launch expectation for the desktop shell.

**Step 2: Run the smoke test to verify it fails**

Run: `pnpm playwright test tests/e2e/smoke.spec.ts`
Expected: FAIL because the workspace and app do not exist yet.

**Step 3: Create the monorepo and desktop app scaffolding**

Set up the root workspace files, the desktop app package, Vite entry, and Tauri manifest with placeholder scripts that can build and launch.

**Step 4: Run workspace checks**

Run: `pnpm install`
Run: `pnpm exec tsc -b`
Expected: PASS for workspace bootstrapping.

**Step 5: Re-run the smoke test**

Run: `pnpm playwright test tests/e2e/smoke.spec.ts`
Expected: either PASS for launch or FAIL with a narrower runtime issue instead of missing workspace structure.

**Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.workspace.ts playwright.config.ts apps/desktop README.md tests/e2e/smoke.spec.ts
git commit -m "chore: bootstrap research canvas workspace"
```

---

### Task 2: Define Shared Domain Schema

**Files:**
- Create: `packages/schema/package.json`
- Create: `packages/schema/tsconfig.json`
- Create: `packages/schema/src/index.ts`
- Create: `packages/schema/src/project.ts`
- Create: `packages/schema/src/canvas.ts`
- Create: `packages/schema/src/node.ts`
- Create: `packages/schema/src/edge.ts`
- Create: `packages/schema/src/sequence.ts`
- Create: `packages/schema/src/annotation.ts`
- Test: `packages/schema/src/index.test.ts`

**Step 1: Write failing schema tests**

Create tests covering serialization and validation for projects, nodes, edges, sequences, and annotations.

**Step 2: Run the schema tests**

Run: `pnpm vitest run packages/schema/src/index.test.ts`
Expected: FAIL because the schema package does not exist yet.

**Step 3: Implement the shared schema package**

Create the core types and runtime validators for all persisted entities and export payloads.

**Step 4: Re-run the schema tests**

Run: `pnpm vitest run packages/schema/src/index.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/schema
git commit -m "feat: add shared domain schema"
```

---

### Task 3: Build The Desktop Shell Layout

**Files:**
- Create: `apps/desktop/src/main.tsx`
- Create: `apps/desktop/src/App.tsx`
- Create: `apps/desktop/src/styles.css`
- Create: `apps/desktop/src/layout/Shell.tsx`
- Create: `apps/desktop/src/layout/LeftRail.tsx`
- Create: `apps/desktop/src/layout/CanvasPane.tsx`
- Create: `apps/desktop/src/layout/RightPanel.tsx`
- Create: `apps/desktop/src/layout/BottomDock.tsx`
- Test: `apps/desktop/src/layout/Shell.test.tsx`
- Test: `tests/e2e/layout.spec.ts`

**Step 1: Write failing layout tests**

Add a component test asserting the four-region shell exists and an E2E test asserting the app renders left rail, canvas region, right panel, and bottom dock.

**Step 2: Run the layout tests**

Run: `pnpm vitest run apps/desktop/src/layout/Shell.test.tsx`
Run: `pnpm playwright test tests/e2e/layout.spec.ts`
Expected: FAIL.

**Step 3: Implement the shell layout**

Create the desktop shell with resizable panels and stable region identifiers for future tests.

**Step 4: Re-run the tests**

Run: `pnpm vitest run apps/desktop/src/layout/Shell.test.tsx`
Run: `pnpm playwright test tests/e2e/layout.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop/src tests/e2e/layout.spec.ts
git commit -m "feat: add desktop shell layout"
```

---

### Task 4: Add SQLite Migrations And Repository Layer

**Files:**
- Create: `apps/desktop/src-tauri/src/lib.rs`
- Create: `apps/desktop/src-tauri/src/db/mod.rs`
- Create: `apps/desktop/src-tauri/src/db/connection.rs`
- Create: `apps/desktop/src-tauri/src/db/migrations.rs`
- Create: `apps/desktop/src-tauri/src/db/repositories/mod.rs`
- Create: `apps/desktop/src-tauri/src/db/repositories/projects.rs`
- Create: `apps/desktop/src-tauri/src/db/repositories/canvas.rs`
- Create: `apps/desktop/src-tauri/src/db/repositories/resources.rs`
- Create: `apps/desktop/src-tauri/src/db/repositories/search.rs`
- Create: `apps/desktop/src-tauri/migrations/0001_initial.sql`
- Create: `apps/desktop/src-tauri/tests/db_migrations.rs`
- Create: `apps/desktop/src-tauri/tests/project_repository.rs`

**Step 1: Write failing Rust integration tests**

Add tests that create a temp database, run migrations, and verify core tables and basic project CRUD.

**Step 2: Run the Rust tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml db_migrations -- --test-threads=1`
Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml project_repository -- --test-threads=1`
Expected: FAIL.

**Step 3: Implement SQLite setup, migrations, and repositories**

Create the database connection layer, migrations runner, and repository methods for projects and canvases.

**Step 4: Re-run the Rust tests**

Run the same `cargo test` commands.
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop/src-tauri
git commit -m "feat: add sqlite migrations and repository layer"
```

---

### Task 5: Implement Workspace, Project Tree, And File Indexing

**Files:**
- Create: `apps/desktop/src-tauri/src/fs/mod.rs`
- Create: `apps/desktop/src-tauri/src/fs/watcher.rs`
- Create: `apps/desktop/src-tauri/src/fs/indexer.rs`
- Create: `apps/desktop/src-tauri/src/commands/projects.rs`
- Create: `packages/desktop-api/package.json`
- Create: `packages/desktop-api/src/index.ts`
- Create: `apps/desktop/src/features/projects/ProjectTree.tsx`
- Create: `apps/desktop/src/features/files/FileExplorer.tsx`
- Create: `apps/desktop/src/features/files/useFileExplorer.ts`
- Test: `apps/desktop/src-tauri/tests/file_indexer.rs`
- Test: `apps/desktop/src/features/files/FileExplorer.test.tsx`
- Test: `tests/fixtures/sample-project/README.md`
- Test: `tests/fixtures/sample-project/assets/example.png`
- Test: `tests/e2e/project-tree.spec.ts`

**Step 1: Write failing file indexing and project tree tests**

Create Rust tests for indexing a real fixture tree and frontend tests for rendering nested projects and files.

**Step 2: Run the tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml file_indexer -- --test-threads=1`
Run: `pnpm vitest run apps/desktop/src/features/files/FileExplorer.test.tsx`
Run: `pnpm playwright test tests/e2e/project-tree.spec.ts`
Expected: FAIL.

**Step 3: Implement workspace/project commands and file explorer state**

Add project CRUD commands, recursive project handling, file indexing, and a virtualized explorer UI wired to real backend data.

**Step 4: Re-run the tests**

Run the same commands.
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/fs apps/desktop/src-tauri/src/commands/projects.rs packages/desktop-api apps/desktop/src/features/projects apps/desktop/src/features/files tests/fixtures/sample-project tests/e2e/project-tree.spec.ts
git commit -m "feat: add projects and file indexing"
```

---

### Task 6: Build Canvas State, Node CRUD, And Edge Notes

**Files:**
- Create: `packages/canvas/package.json`
- Create: `packages/canvas/src/index.ts`
- Create: `packages/canvas/src/CanvasView.tsx`
- Create: `packages/canvas/src/nodes/ResourceNode.tsx`
- Create: `packages/canvas/src/nodes/NoteNode.tsx`
- Create: `packages/canvas/src/nodes/GroupNode.tsx`
- Create: `packages/canvas/src/edges/AnnotatedEdge.tsx`
- Create: `packages/canvas/src/state/canvasStore.ts`
- Create: `apps/desktop/src-tauri/src/commands/canvas.rs`
- Create: `apps/desktop/src/features/canvas/CanvasScreen.tsx`
- Test: `packages/canvas/src/state/canvasStore.test.ts`
- Test: `apps/desktop/src-tauri/tests/canvas_repository.rs`
- Test: `tests/e2e/canvas-crud.spec.ts`

**Step 1: Write failing tests for node and edge persistence**

Cover creating nodes, connecting edges, editing edge notes, saving, and reloading.

**Step 2: Run the tests**

Run: `pnpm vitest run packages/canvas/src/state/canvasStore.test.ts`
Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml canvas_repository -- --test-threads=1`
Run: `pnpm playwright test tests/e2e/canvas-crud.spec.ts`
Expected: FAIL.

**Step 3: Implement canvas commands, shared canvas package, and authoring screen**

Wire React Flow to the shared state model and persist graph changes through Rust commands.

**Step 4: Re-run the tests**

Run the same commands.
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/canvas apps/desktop/src-tauri/src/commands/canvas.rs apps/desktop/src/features/canvas tests/e2e/canvas-crud.spec.ts
git commit -m "feat: add canvas graph authoring"
```

---

### Task 7: Add Freehand Annotation Layer From Day One

**Files:**
- Create: `packages/canvas/src/annotations/AnnotationLayer.tsx`
- Create: `packages/canvas/src/annotations/annotationTools.ts`
- Create: `packages/canvas/src/annotations/annotationStore.ts`
- Create: `packages/canvas/src/annotations/annotationStore.test.ts`
- Create: `apps/desktop/src-tauri/src/commands/annotations.rs`
- Create: `apps/desktop/src-tauri/tests/annotation_repository.rs`
- Test: `tests/e2e/freehand.spec.ts`

**Step 1: Write failing annotation tests**

Add tests for persisting strokes and rendering them after reload using real serialized point arrays.

**Step 2: Run the tests**

Run: `pnpm vitest run packages/canvas/src/annotations/annotationStore.test.ts`
Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml annotation_repository -- --test-threads=1`
Run: `pnpm playwright test tests/e2e/freehand.spec.ts`
Expected: FAIL.

**Step 3: Implement the annotation layer**

Use `perfect-freehand` to render pen and highlighter strokes, plus arrow and callout support, all persisted in SQLite.

**Step 4: Re-run the tests**

Run the same commands.
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/canvas/src/annotations apps/desktop/src-tauri/src/commands/annotations.rs tests/e2e/freehand.spec.ts
git commit -m "feat: add freehand annotation layer"
```

---

### Task 8: Build Right Panel And Full-Page Node Viewers

**Files:**
- Create: `packages/viewers/package.json`
- Create: `packages/viewers/src/index.ts`
- Create: `packages/viewers/src/MarkdownViewer.tsx`
- Create: `packages/viewers/src/NoteViewer.tsx`
- Create: `packages/viewers/src/PdfViewer.tsx`
- Create: `packages/viewers/src/ImageViewer.tsx`
- Create: `packages/viewers/src/FileMetaViewer.tsx`
- Create: `apps/desktop/src/features/details/DetailsPanel.tsx`
- Create: `apps/desktop/src/features/viewer/NodeViewerScreen.tsx`
- Create: `apps/desktop/src/features/viewer/LightTextEditor.tsx`
- Test: `packages/viewers/src/MarkdownViewer.test.tsx`
- Test: `apps/desktop/src/features/details/DetailsPanel.test.tsx`
- Test: `tests/e2e/node-viewer.spec.ts`

**Step 1: Write failing viewer tests**

Cover markdown render, node summary display, and opening a selected node into focused mode.

**Step 2: Run the tests**

Run: `pnpm vitest run packages/viewers/src/MarkdownViewer.test.tsx`
Run: `pnpm vitest run apps/desktop/src/features/details/DetailsPanel.test.tsx`
Run: `pnpm playwright test tests/e2e/node-viewer.spec.ts`
Expected: FAIL.

**Step 3: Implement viewers and details panel**

Render supported resource types, add metadata and related node sections, and allow light text editing for notes and simple markdown fixes.

**Step 4: Re-run the tests**

Run the same commands.
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/viewers apps/desktop/src/features/details apps/desktop/src/features/viewer tests/e2e/node-viewer.spec.ts
git commit -m "feat: add node viewers and details panel"
```

---

### Task 9: Add PTY Terminal Integration

**Files:**
- Create: `apps/desktop/src-tauri/src/pty/mod.rs`
- Create: `apps/desktop/src-tauri/src/pty/session.rs`
- Create: `apps/desktop/src-tauri/src/commands/terminal.rs`
- Create: `apps/desktop/src-tauri/tests/pty_session.rs`
- Create: `apps/desktop/src/features/terminal/TerminalPane.tsx`
- Create: `apps/desktop/src/features/terminal/useTerminal.ts`
- Test: `apps/desktop/src/features/terminal/TerminalPane.test.tsx`
- Test: `tests/e2e/terminal.spec.ts`

**Step 1: Write failing PTY tests**

Create Rust tests that spawn a real shell in a temp directory and verify output and cwd, plus E2E tests for showing terminal output in the UI.

**Step 2: Run the tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml pty_session -- --test-threads=1`
Run: `pnpm vitest run apps/desktop/src/features/terminal/TerminalPane.test.tsx`
Run: `pnpm playwright test tests/e2e/terminal.spec.ts`
Expected: FAIL.

**Step 3: Implement PTY orchestration and xterm integration**

Wire terminal sessions to the active project directory and support resize, input, output, and multiple sessions.

**Step 4: Re-run the tests**

Run the same commands.
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/pty apps/desktop/src-tauri/src/commands/terminal.rs apps/desktop/src/features/terminal tests/e2e/terminal.spec.ts
git commit -m "feat: add embedded pty terminal"
```

---

### Task 10: Add Search, Command Palette, And Explorer Quality

**Files:**
- Create: `packages/search/package.json`
- Create: `packages/search/src/index.ts`
- Create: `packages/search/src/fuzzy.ts`
- Create: `packages/search/src/query.ts`
- Create: `apps/desktop/src/features/search/CommandPalette.tsx`
- Create: `apps/desktop/src/features/search/useSearch.ts`
- Create: `apps/desktop/src-tauri/src/commands/search.rs`
- Create: `apps/desktop/src-tauri/tests/search_index.rs`
- Test: `packages/search/src/fuzzy.test.ts`
- Test: `tests/e2e/search.spec.ts`

**Step 1: Write failing search tests**

Add search tests over the real fixture project and an E2E test that opens the command palette and finds a file, node, and sequence stub.

**Step 2: Run the tests**

Run: `pnpm vitest run packages/search/src/fuzzy.test.ts`
Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml search_index -- --test-threads=1`
Run: `pnpm playwright test tests/e2e/search.spec.ts`
Expected: FAIL.

**Step 3: Implement search indexing and palette UI**

Build FTS-backed content search, fuzzy ranking, and a keyboard-driven command palette.

**Step 4: Re-run the tests**

Run the same commands.
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/search apps/desktop/src/features/search apps/desktop/src-tauri/src/commands/search.rs tests/e2e/search.spec.ts
git commit -m "feat: add search and command palette"
```

---

### Task 11: Implement Sequences And Guided Traversal

**Files:**
- Create: `apps/desktop/src-tauri/src/commands/sequences.rs`
- Create: `apps/desktop/src-tauri/tests/sequence_repository.rs`
- Create: `packages/canvas/src/sequences/SequenceStore.ts`
- Create: `packages/canvas/src/sequences/SequencePlayer.tsx`
- Create: `packages/canvas/src/sequences/SequenceEditor.tsx`
- Create: `apps/desktop/src/features/sequences/SequencePanel.tsx`
- Test: `packages/canvas/src/sequences/SequenceStore.test.ts`
- Test: `tests/e2e/sequences.spec.ts`

**Step 1: Write failing sequence tests**

Cover creating a sequence, adding ordered steps, restoring viewport state, and replaying the path.

**Step 2: Run the tests**

Run: `pnpm vitest run packages/canvas/src/sequences/SequenceStore.test.ts`
Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml sequence_repository -- --test-threads=1`
Run: `pnpm playwright test tests/e2e/sequences.spec.ts`
Expected: FAIL.

**Step 3: Implement sequence storage and playback**

Add sequence CRUD, UI editing, and playback transitions for both desktop presentation and future export reuse.

**Step 4: Re-run the tests**

Run the same commands.
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/canvas/src/sequences apps/desktop/src-tauri/src/commands/sequences.rs apps/desktop/src/features/sequences tests/e2e/sequences.spec.ts
git commit -m "feat: add guided sequences"
```

---

### Task 12: Build Static Export Pipeline

**Files:**
- Create: `packages/exporter/package.json`
- Create: `packages/exporter/src/index.ts`
- Create: `packages/exporter/src/manifest.ts`
- Create: `packages/exporter/src/renderMarkdown.ts`
- Create: `packages/exporter/src/copyAssets.ts`
- Create: `packages/exporter/src/buildSearchIndex.ts`
- Create: `apps/desktop/src-tauri/src/export/mod.rs`
- Create: `apps/desktop/src-tauri/src/commands/export.rs`
- Create: `apps/desktop/src-tauri/tests/export_bundle.rs`
- Test: `packages/exporter/src/manifest.test.ts`
- Test: `tests/e2e/export.spec.ts`

**Step 1: Write failing export tests**

Add a Rust integration test that exports a real fixture project to a temp folder and verifies `index.html`, graph data, rendered node pages, and copied resources exist. Add a Playwright test that opens the exported bundle and verifies navigation.

**Step 2: Run the tests**

Run: `pnpm vitest run packages/exporter/src/manifest.test.ts`
Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml export_bundle -- --test-threads=1`
Run: `pnpm playwright test tests/e2e/export.spec.ts`
Expected: FAIL.

**Step 3: Implement export generation**

Build manifest generation, markdown-to-HTML export, graph/sequence serialization, search index output, and asset copying with portable relative links.

**Step 4: Re-run the tests**

Run the same commands.
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/exporter apps/desktop/src-tauri/src/export apps/desktop/src-tauri/src/commands/export.rs tests/e2e/export.spec.ts
git commit -m "feat: add static export pipeline"
```

---

### Task 13: Build The Static Viewer Experience

**Files:**
- Create: `apps/public-viewer/package.json`
- Create: `apps/public-viewer/vite.config.ts`
- Create: `apps/public-viewer/src/main.tsx`
- Create: `apps/public-viewer/src/App.tsx`
- Create: `apps/public-viewer/src/OfflineBootstrap.tsx`
- Create: `apps/public-viewer/src/routes/MapView.tsx`
- Create: `apps/public-viewer/src/routes/NodePage.tsx`
- Create: `apps/public-viewer/src/routes/SequenceView.tsx`
- Create: `apps/public-viewer/src/routes/MobileFallback.tsx`
- Test: `apps/public-viewer/src/App.test.tsx`
- Test: `tests/e2e/public-viewer.spec.ts`

**Step 1: Write failing viewer tests**

Cover booting from exported data, desktop map display, mobile fallback behavior, and file download links.

**Step 2: Run the tests**

Run: `pnpm vitest run apps/public-viewer/src/App.test.tsx`
Run: `pnpm playwright test tests/e2e/public-viewer.spec.ts`
Expected: FAIL.

**Step 3: Implement the static viewer app**

Reuse shared schema, canvas rendering, and viewer components to display exported projects without any backend.

**Step 4: Re-run the tests**

Run the same commands.
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/public-viewer tests/e2e/public-viewer.spec.ts
git commit -m "feat: add static public viewer"
```

---

### Task 14: Add Downloadable Resources And Publish Profiles

**Files:**
- Modify: `packages/exporter/src/manifest.ts`
- Modify: `apps/desktop/src-tauri/src/export/mod.rs`
- Create: `apps/desktop/src/features/publish/PublishProfileForm.tsx`
- Create: `apps/desktop/src/features/publish/ExportDialog.tsx`
- Test: `apps/desktop/src-tauri/tests/publish_profiles.rs`
- Test: `tests/e2e/downloads.spec.ts`

**Step 1: Write failing tests for download behavior and publish profile rules**

Cover the default `all resources downloadable` rule and a future-safe profile mechanism.

**Step 2: Run the tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml publish_profiles -- --test-threads=1`
Run: `pnpm playwright test tests/e2e/downloads.spec.ts`
Expected: FAIL.

**Step 3: Implement resource download mapping and export dialog**

Ensure every eligible resource node gets a downloadable public artifact and expose publish profiles in the desktop UI.

**Step 4: Re-run the tests**

Run the same commands.
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/exporter/src/manifest.ts apps/desktop/src-tauri/src/export/mod.rs apps/desktop/src/features/publish tests/e2e/downloads.spec.ts
git commit -m "feat: add downloadable exports and publish profiles"
```

---

### Task 15: Hardening, Performance, And Release Readiness

**Files:**
- Create: `apps/desktop/src/features/performance/useVirtualization.ts`
- Create: `apps/desktop/src-tauri/tests/reload_persistence.rs`
- Create: `tests/e2e/reload-and-reopen.spec.ts`
- Create: `tests/e2e/large-project.spec.ts`
- Modify: `README.md`
- Modify: `apps/desktop/package.json`
- Modify: `apps/public-viewer/package.json`

**Step 1: Write failing resilience and performance smoke tests**

Add tests for reopening persisted projects, handling a larger fixture set, and verifying export after reload.

**Step 2: Run the tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml reload_persistence -- --test-threads=1`
Run: `pnpm playwright test tests/e2e/reload-and-reopen.spec.ts`
Run: `pnpm playwright test tests/e2e/large-project.spec.ts`
Expected: FAIL or expose concrete regressions.

**Step 3: Implement hardening work**

Add virtualization where needed, improve incremental indexing, tighten save/reload flows, and document release commands.

**Step 4: Run the full verification suite**

Run: `pnpm vitest run`
Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1`
Run: `pnpm playwright test`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop apps/public-viewer README.md tests/e2e
git commit -m "chore: harden research canvas for release"
```

---

## Verification Checklist

Before claiming the feature complete, verify all of the following with real tests and manual spot checks:

- A real fixture project can be indexed and browsed.
- Nodes, edges, and freehand annotations persist across reloads.
- The terminal opens in the expected working directory and handles interactive commands.
- Sequences restore viewport state and replay correctly.
- Export produces a static bundle with rendered content and copied resources.
- The public viewer opens exported projects without any backend.
- Download links work for all published resources.
- Mobile fallback shows sequence-first exploration while desktop preserves the authored map.

---

## Suggested Execution Strategy

Use this plan sequentially. Do not skip the backend repository and export tests in the name of frontend momentum. The product’s integrity depends on real persistence, real filesystem behavior, real PTY behavior, and real export correctness.

Plan complete and saved to `docs/plans/2026-03-30-research-canvas-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**

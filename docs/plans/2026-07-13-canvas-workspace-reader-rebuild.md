# Canvas Workspace and Reader Rebuild Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make canvas constellations navigable as persistent tabs, make the Explorer coherent and low-friction, and present every graph node through one rich, media-aware reader regardless of whether it was opened from canvas or timeline.

**Architecture:** Introduce a view-independent reader record keyed by `graphNodeId`, with canonical document, source, relation, and media projections. Keep canvas presentation state scoped to an explicit tab/session identity instead of replacing the singleton workspace on every constellation selection. The timeline remains an independent lens and invokes the canonical reader by graph identity.

**Tech Stack:** React 19, TypeScript, Zustand, React Flow, Tauri v2, SQLite, BlockNote, Vitest/Testing Library, Playwright, Rust integration tests.

---

### Task 1: Establish the reader-data boundary

**Files:**
- Create: `apps/desktop/src/features/viewer/readerRecord.ts`
- Test: `apps/desktop/src/features/viewer/readerRecord.test.ts`
- Modify: `apps/desktop/src/layout/Shell.tsx`

1. Write a failing test showing that a `GraphNode` opened from the timeline preserves its graph identity, pith, temporal/place metadata, source coordinates, and a canonical cover reference.
2. Run `pnpm vitest run apps/desktop/src/features/viewer/readerRecord.test.ts`; confirm it fails because the resolver does not exist.
3. Implement `ReaderRecord` and pure `readerRecordFromGraphNode` / `readerRecordFromCanvasNode` adapters. The adapter must never fabricate a canvas note solely to open the reader.
4. Run the focused test and then `pnpm vitest run apps/desktop/src/layout/Shell.timeline.test.ts`.
5. Commit: `refactor: resolve reader content by graph identity`.

### Task 2: Make media first-class reader data

**Files:**
- Create: `apps/desktop/src/features/viewer/readerMedia.ts`
- Test: `apps/desktop/src/features/viewer/readerMedia.test.ts`
- Modify: `apps/desktop/src/features/canvas/resourceFileHelpers.ts`
- Modify: `apps/desktop/src/layout/ReadingLens.tsx`

1. Write failing tests for portable `assets/...` image resolution, legacy asset URL repair, a reader cover shared by canvas and timeline, and a rejected `blob:` source represented as an unresolved attachment rather than a broken image URL.
2. Run the focused Vitest file and confirm all four behaviours fail before implementation.
3. Implement a display-only media resolver that accepts only local portable paths, absolute paths, or remote HTTPS URLs. Persisted reader references must remain portable; `blob:` values become explicit unresolved media records.
4. Use the resolver in `ReadingLens`, not canvas-only thumbnail state.
5. Run focused tests and `pnpm vitest run apps/desktop/src/features/canvas/resourceFileHelpers.test.ts`.
6. Commit: `feat: resolve portable reader media consistently`.

### Task 3: Consolidate the reader frame and long-form document surface

**Files:**
- Create: `apps/desktop/src/features/viewer/ReaderSurface.tsx`
- Create: `apps/desktop/src/features/viewer/ReaderSurface.test.tsx`
- Modify: `apps/desktop/src/layout/ReadingLens.tsx`
- Modify: `apps/desktop/src/features/viewer/NodeReaderBody.tsx`
- Modify: `apps/desktop/src/features/viewer/GraphDocumentContent.tsx`
- Modify: `apps/desktop/src/layout/observatory.css`

1. Write a failing rendered test for identical reader headings, source metadata, cover media, close button, scrim-close, and Escape-close behaviour for a canvas origin and a timeline origin.
2. Confirm RED with `pnpm vitest run apps/desktop/src/features/viewer/ReaderSurface.test.tsx`.
3. Implement one document frame: compact title/pith header, semantic icon buttons with accessible labels, document stage, and a contextual details drawer. Keep deep content in BlockNote/resource views only; do not render it in cards.
4. Move insert-image, attach-file, and link-node controls out of the prose flow into a labelled reader action menu/drawer.
5. Run the focused reader tests and existing `GraphDocumentContent` / `NodeDocumentPane` tests.
6. Commit: `feat: unify the rich node reader`.

### Task 4: Preserve tab-local canvas state

**Files:**
- Create: `apps/desktop/src/features/canvas/canvasTabState.ts`
- Test: `apps/desktop/src/features/canvas/canvasTabState.test.ts`
- Modify: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`
- Test: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.test.tsx`

1. Write failing state tests for open-or-activate uniqueness by `(constellationId, canvasId)`, a pinned root tab, close protection for pinned tabs, and preservation of viewport/selection for two tabs.
2. Run the focused test and confirm the current singleton workspace fails the tab contract.
3. Implement a serialisable tab/session state model. Active React Flow state may mount once, but every tab must retain its last committed viewport and selection and must flush only its own canvas.
4. Add context operations for `openConstellationTab`, `activateCanvasTab`, and `closeCanvasTab`; retain `openCanvas` as a compatibility delegate.
5. Run focused tests plus canvas persistence tests.
6. Commit: `feat: retain canvas workspaces as tabs`.

### Task 5: Add the canvas tab strip and portal navigation

**Files:**
- Create: `apps/desktop/src/layout/CanvasTabs.tsx`
- Test: `apps/desktop/src/layout/CanvasTabs.test.tsx`
- Modify: `apps/desktop/src/layout/Shell.tsx`
- Modify: `apps/desktop/src/layout/CanvasPane.tsx`
- Modify: `apps/desktop/src/layout/observatory.css`

1. Write a failing UI test that opening two constellations creates two labelled canvas tabs, activating either does not create a duplicate, and a portal opens/activates its target tab.
2. Confirm RED, then render the tab strip only in the canvas lens.
3. Make the root tab pinned and make non-root close buttons explicit, keyboard reachable, and non-overlapping with tab labels.
4. Keep timeline navigation separate: timeline may request a constellation tab, but the timeline itself is never represented as a canvas tab.
5. Run focused tests and `Shell.timeline.test.tsx`.
6. Commit: `feat: navigate constellations through canvas tabs`.

### Task 6: Replace the mixed sidebar with a hoverable Explorer

**Files:**
- Create: `apps/desktop/src/layout/ExplorerDrawer.tsx`
- Test: `apps/desktop/src/layout/ExplorerDrawer.test.tsx`
- Modify: `apps/desktop/src/layout/LeftOverlay.tsx`
- Modify: `apps/desktop/src/layout/Shell.tsx`
- Modify: `apps/desktop/src/layout/observatory.css`

1. Write failing interaction tests for delayed hover opening, grace-period leave closing, focus retention, manual pinning, Escape close, and no drawer interaction behind a modal reader.
2. Confirm RED; implement the drawer state machine with pointer/focus timers and reduced-motion-safe transitions.
3. Separate Explorer sections into Constellations, Library, Search, and Annotations. The constellation section must show hierarchy, active tab state, and node/relation counts without flattening hierarchy.
4. Remove the compulsory close affordance; retain an accessible close control only where keyboard/pointer hover is unavailable.
5. Run focused tests and relevant Shell tests.
6. Commit: `feat: replace sidebar with contextual explorer`.

### Task 7: Model source and attachment blocks instead of prose approximations

**Files:**
- Modify: `packages/canvas/src/content/contentBlocks.ts`
- Test: `packages/canvas/src/content/contentBlocks.test.ts`
- Modify: `packages/canvas/src/content/contentLinkingActions.ts`
- Test: `packages/canvas/src/content/contentLinkingActions.test.ts`
- Modify: `apps/desktop/src/features/viewer/ReaderSurface.tsx`

1. Write failing tests proving an attached file and linked Markdown source retain a stable path, label, and graph/source target in a structured block.
2. Confirm RED; replace the current text-only `Attached file: ...` and `Linked source: ...` approximations with structured, renderable source/attachment blocks.
3. Render source blocks as clickable reader references with graceful unresolved state; preserve source coordinates and relationship provenance.
4. Run package and desktop viewer tests.
5. Commit: `feat: preserve structured reader sources and attachments`.

### Task 8: Audit and register vault media without guessing provenance

**Files:**
- Create: `scripts/audit-vault-media.mjs`
- Create: `scripts/audit-vault-media.test.mjs` or Vitest equivalent
- Create: `antichrist-vault/media-manifest.json`
- Modify: `package.json`

1. Write a failing fixture-based test that reports portable local assets, referenced local assets, remote assets, and unresolved `blob:` image references separately.
2. Confirm RED; implement a read-only audit that never infers graph-node ownership from filenames.
3. Seed a manifest with the two known local images in an `unassigned` review state and record the two blob URLs as unresolved source artefacts.
4. Add `pnpm audit:vault-media` and test idempotent output.
5. Commit: `feat: audit vault media provenance`.

### Task 9: Native and visual verification

**Files:**
- Test: `apps/desktop/src-tauri/tests/...` for actual asset copy/read paths
- Test: `tests/e2e/...` for canvas-tabs, reader, and Explorer workflows

1. Add a real temporary workspace test that imports an image, stores a portable path, and proves the native asset handler can resolve the resulting URL path shape.
2. Add a browser E2E workflow for tab activation and reader parity, using real fixture content rather than mocked UI data.
3. Capture the canvas, timeline reader, and Explorer at desktop dimensions; inspect the rendered result for one-surface cards, no bolted raw controls, and no broken image question marks for resolved assets.
4. Run `pnpm typecheck`, `pnpm test`, required Rust tests with `--test-threads=1`, and focused Playwright tests.
5. Commit: `test: verify workspace reader and explorer workflows`.


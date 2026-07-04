# Instrument Shell — Phase 3: First-Class Reading Lens + Carried Cleanups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Reading a genuine third surface. Replace the `ReadingStub` with a real in-stage `ReadingLens` that renders the selected node's document (reusing the reader body shared with the full-screen reader), recede the chrome in reading mode, and route double-click + timeline open-node into the lens. Fold in the four cleanups carried from the Phase-2 review.

**Architecture:** Extract the node→pane rendering from `FullScreenReader` into a shared `NodeReaderBody` so the in-stage lens and the full-screen reader stay DRY. `ReadingLens` wraps it with a receded-chrome layout and an empty state. `Shell` renders `ReadingLens` for the reading lens, hides the rail + inspector while reading (immersive), and points double-click / timeline-open at the lens instead of the full-screen modal (which stays available via a fullscreen button and for sequence playback).

**Tech Stack:** React 19, TypeScript, Vite, Zustand (`CanvasWorkspaceContext`), Vitest + `@testing-library/react` (jsdom), Observatory CSS tokens (`apps/desktop/src/layout/observatory.css`).

**Series:** Phase 3 of 4. Builds on Phase 2 (merged at `b8b7284`). Spec: `docs/superpowers/specs/2026-07-03-instrument-shell-redesign-design.md`. Deferred to a later focused effort: the timeline **transport** (scrub/play) — archetypal lighting already works inside `TimelineLens`. Phase 4 remains: command-palette expansion + CanvasScreen toolbar removal.

## Global Constraints

- Frontend tests via `pnpm vitest run <file>`; type-check via `pnpm exec tsc -b`.
- Test-first for every component and state change.
- Observatory palette authoritative: cyan `var(--ob-accent)` sole UI accent; amber `var(--ob-amber)` reserved for archetypal lighting only.
- Do NOT edit `apps/desktop/src/styles.css`; all new CSS in `apps/desktop/src/layout/observatory.css`.
- **Dirty-tree staging rule:** the working tree carries ~246 UNRELATED changes. Every task stages ONLY its own files by explicit path. NEVER `git add -A`/`.`/`commit -a`. (No Phase-3 file collides with the dirty set — the dirty set is episode assets + `tauri.conf.json` + `packages/canvas/src/CanvasView.tsx`; Phase 3 touches none of those.)
- Keep `data-testid`s: `transport-bar`, `left-rail`, `status-strip`, `canvas-pane`, `timeline-pane`, `left-overlay`, `bottom-dock`, `inspector-overlay`. The reading surface testid changes from `reading-pane` (stub) to a real `ReadingLens` that KEEPS `data-testid="reading-pane"` on its root so existing lens tests stay valid.
- Preserve functionality: canvas, timeline (incl. lighting), browser, inspector, terminal dock, sequence playback (`FullScreenReader` sequence mode), node editing.

---

## File Structure

**Create:**
- `apps/desktop/src/features/viewer/NodeReaderBody.tsx` (+ `NodeReaderBody.test.tsx`) — shared node→pane renderer.
- `apps/desktop/src/layout/ReadingLens.tsx` (+ `ReadingLens.test.tsx`) — in-stage reading surface.

**Modify:**
- `apps/desktop/src/layout/FullScreenReader.tsx` — its `NodeMode` uses `NodeReaderBody` (DRY; no behavior change).
- `apps/desktop/src/layout/Shell.tsx` (+ `Shell.test.tsx`) — render `ReadingLens`; double-click + timeline-open → reading lens; recede chrome in reading mode; fullscreen button → `FullScreenReader`.
- `apps/desktop/src/layout/IconStrip.tsx` — nothing (the inspector-active fix is a Shell prop change).
- `apps/desktop/src/layout/observatory.css` — reading-lens layout + receded-chrome rule.
- `apps/desktop/src/layout/useShellLayout.test.ts` — add resize-handle tests.

**Delete:**
- `apps/desktop/src/layout/ReadingStub.tsx` (replaced by `ReadingLens`).
- `apps/desktop/src/features/viewer/ContentTab.tsx` + `ContentTab.graphdoc.test.tsx` (orphaned after `RightPanelSlot` deletion — grep-guarded).

---

### Task 1: Extract `NodeReaderBody` shared reader

**Files:**
- Create: `apps/desktop/src/features/viewer/NodeReaderBody.tsx`
- Test: `apps/desktop/src/features/viewer/NodeReaderBody.test.tsx`
- Modify: `apps/desktop/src/layout/FullScreenReader.tsx`

**Interfaces:**
- Produces: `NodeReaderBody({ node }: { node: CanvasNode }): JSX.Element`. For a node carrying a `graphNodeId`, renders `NodeDocumentPane`; otherwise renders `NodeContentPane` (loading text content for markdown/text resource nodes). Uses `useCanvasWorkspace()` internally for note-content updates. No header/close chrome — callers wrap it.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/features/viewer/NodeReaderBody.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NodeReaderBody } from "./NodeReaderBody";

vi.mock("../canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => ({ updateNodeContent: vi.fn() }),
}));

vi.mock("./NodeDocumentPane", () => ({
  NodeDocumentPane: ({ graphNodeId }: { graphNodeId: string }) => (
    <div data-testid="doc-pane">doc:{graphNodeId}</div>
  ),
}));

vi.mock("./NodeContentPane", () => ({
  NodeContentPane: ({ node }: { node: { id: string } }) => (
    <div data-testid="content-pane">content:{node.id}</div>
  ),
}));

describe("NodeReaderBody", () => {
  it("renders the document pane for a graph-backed node", () => {
    const node = { id: "n1", title: "T", type: "note", graphNodeId: "g-1" } as never;
    render(<NodeReaderBody node={node} />);
    expect(screen.getByTestId("doc-pane")).toHaveTextContent("doc:g-1");
  });

  it("renders the content pane for a node without a graphNodeId", () => {
    const node = { id: "n2", title: "T", type: "note" } as never;
    render(<NodeReaderBody node={node} />);
    expect(screen.getByTestId("content-pane")).toHaveTextContent("content:n2");
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm vitest run apps/desktop/src/features/viewer/NodeReaderBody.test.tsx`
Expected: FAIL — cannot find module `./NodeReaderBody`.

- [ ] **Step 3: Implement `NodeReaderBody`**

Create `apps/desktop/src/features/viewer/NodeReaderBody.tsx` by lifting the node→pane logic out of `FullScreenReader`'s `NodeMode` (see current `FullScreenReader.tsx`):

```tsx
import { useEffect, useState } from "react";
import type { CanvasNode } from "@research-canvas/schema";
import { createWorkspaceTransport, readWorkspaceTextFile } from "@research-canvas/desktop-api";
import type { GraphNode, GraphNodePatch } from "@research-canvas/desktop-api";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import { NodeContentPane } from "./NodeContentPane";
import { NodeDocumentPane } from "./NodeDocumentPane";

export function NodeReaderBody({ node }: { node: CanvasNode }) {
  const workspace = useCanvasWorkspace();
  const textResourceNode =
    node.type === "resource" &&
    node.absolutePath &&
    (node.resourceKind === "markdown" || node.resourceKind === "text")
      ? node
      : null;
  const [textContent, setTextContent] = useState<string | null>(null);

  useEffect(() => {
    setTextContent(null);
    if (!textResourceNode) return;
    readWorkspaceTextFile(textResourceNode.absolutePath)
      .then(setTextContent)
      .catch(() => setTextContent(null));
  }, [textResourceNode]);

  const graphNodeId = (node as unknown as { graphNodeId?: string }).graphNodeId ?? null;
  if (graphNodeId) {
    return (
      <NodeDocumentPane
        graphNodeId={graphNodeId}
        transport={createWorkspaceTransport() as unknown as {
          readGraphNode: (input: { graphNodeId: string }) => Promise<GraphNode>;
          updateGraphNode: (input: { graphNodeId: string; patch: GraphNodePatch }) => Promise<GraphNode>;
        }}
      />
    );
  }

  return (
    <NodeContentPane
      node={node}
      textContent={textContent}
      onFullScreen={() => {}}
      onNoteContentChange={(content) => workspace.updateNodeContent(node.id, content)}
      showToolbar={false}
    />
  );
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm vitest run apps/desktop/src/features/viewer/NodeReaderBody.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Refactor `FullScreenReader` NodeMode to use it**

In `apps/desktop/src/layout/FullScreenReader.tsx`: import `NodeReaderBody`, remove the now-duplicated `textResourceNode`/`textContent`/`readWorkspaceTextFile` logic and the two-branch pane rendering from `NodeMode`, and replace both `<main className="fullscreen-reader__body">…</main>` inner contents with `<main className="fullscreen-reader__body"><NodeReaderBody node={node} /></main>`. Keep the header, breadcrumb, `onClose`, Esc handler, and the `if (!node) onClose()` effect. Remove now-unused imports (`readWorkspaceTextFile`, `NodeContentPane`, `NodeDocumentPane`, `createWorkspaceTransport`, `GraphNode`, `GraphNodePatch`) from `FullScreenReader.tsx` if no longer referenced (the `SequenceMode`/`SequenceNodeContent` still use `NodeContentPane`, `readWorkspaceTextFile` — keep those imports).

- [ ] **Step 6: Verify FullScreenReader still type-checks and layout suite passes**

Run: `pnpm exec tsc -b`
Expected: no errors.
Run: `pnpm vitest run apps/desktop/src/layout`
Expected: PASS (existing FullScreenReader-touching tests unchanged in behavior).

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/features/viewer/NodeReaderBody.tsx apps/desktop/src/features/viewer/NodeReaderBody.test.tsx apps/desktop/src/layout/FullScreenReader.tsx
git commit -m "refactor(viewer): extract shared NodeReaderBody from FullScreenReader"
```

---

### Task 2: `ReadingLens` component

**Files:**
- Create: `apps/desktop/src/layout/ReadingLens.tsx`
- Test: `apps/desktop/src/layout/ReadingLens.test.tsx`

**Interfaces:**
- Consumes: `useCanvasWorkspace()` (for `nodes` + `selectedNodeId`), `NodeReaderBody` (Task 1).
- Produces: `ReadingLens({ onFullScreen }: { onFullScreen: () => void }): JSX.Element`. Root `[data-testid="reading-pane"]`. When no node is selected, shows an empty state ("Select a node to read"). When a node is selected, renders a centered reading column with `NodeReaderBody` and a fullscreen button (accessible name `Read full screen`) that calls `onFullScreen`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/layout/ReadingLens.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReadingLens } from "./ReadingLens";

const state = { nodes: [] as Array<{ id: string; title: string; type: string }>, selectedNodeId: null as string | null };

vi.mock("../features/canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => state,
}));

vi.mock("../features/viewer/NodeReaderBody", () => ({
  NodeReaderBody: ({ node }: { node: { id: string } }) => <div data-testid="reader-body">reading:{node.id}</div>,
}));

describe("ReadingLens", () => {
  it("shows an empty state when nothing is selected", () => {
    state.nodes = [];
    state.selectedNodeId = null;
    render(<ReadingLens onFullScreen={() => {}} />);
    expect(screen.getByTestId("reading-pane")).toBeVisible();
    expect(screen.getByText(/select a node to read/i)).toBeInTheDocument();
    expect(screen.queryByTestId("reader-body")).not.toBeInTheDocument();
  });

  it("renders the reader body for the selected node", () => {
    state.nodes = [{ id: "n1", title: "The Naked Face", type: "note" }];
    state.selectedNodeId = "n1";
    render(<ReadingLens onFullScreen={() => {}} />);
    expect(screen.getByTestId("reader-body")).toHaveTextContent("reading:n1");
  });

  it("calls onFullScreen from the fullscreen button", () => {
    state.nodes = [{ id: "n1", title: "T", type: "note" }];
    state.selectedNodeId = "n1";
    const onFullScreen = vi.fn();
    render(<ReadingLens onFullScreen={onFullScreen} />);
    fireEvent.click(screen.getByRole("button", { name: "Read full screen" }));
    expect(onFullScreen).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm vitest run apps/desktop/src/layout/ReadingLens.test.tsx`
Expected: FAIL — cannot find module `./ReadingLens`.

- [ ] **Step 3: Implement `ReadingLens`**

Create `apps/desktop/src/layout/ReadingLens.tsx`:

```tsx
import type { CanvasNode } from "@research-canvas/schema";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { NodeReaderBody } from "../features/viewer/NodeReaderBody";

export function ReadingLens({ onFullScreen }: { onFullScreen: () => void }) {
  const workspace = useCanvasWorkspace();
  const node = (workspace.nodes as CanvasNode[]).find((n) => n.id === workspace.selectedNodeId) ?? null;

  return (
    <section className="ishell-reading" data-testid="reading-pane">
      {node ? (
        <>
          <div className="ishell-reading__bar">
            <span className="ishell-reading__title">{node.title}</span>
            <button
              type="button"
              className="ishell-reading__full"
              aria-label="Read full screen"
              onClick={onFullScreen}
            >
              ⤢
            </button>
          </div>
          <div className="ishell-reading__col">
            <NodeReaderBody node={node} />
          </div>
        </>
      ) : (
        <div className="ishell-reading__empty">Select a node to read</div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm vitest run apps/desktop/src/layout/ReadingLens.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/layout/ReadingLens.tsx apps/desktop/src/layout/ReadingLens.test.tsx
git commit -m "feat(shell): in-stage ReadingLens surface (reader body + empty state)"
```

---

### Task 3: Wire ReadingLens into Shell + recede chrome

**Files:**
- Modify: `apps/desktop/src/layout/Shell.tsx`
- Modify: `apps/desktop/src/layout/Shell.test.tsx`
- Delete: `apps/desktop/src/layout/ReadingStub.tsx`

**Interfaces:**
- Consumes: `ReadingLens` (Task 2).
- Produces: reading lens rendered in-stage; double-click node → `setLens("reading")`; timeline open-node → `setLens("reading")`; rail + inspector hidden while `lens === "reading"`; a body-level `data-lens` attribute for CSS.

- [ ] **Step 1: Write the failing test additions**

Add to `apps/desktop/src/layout/Shell.test.tsx` (inside the existing `describe`):

```tsx
  it("hides the rail while in the reading lens", () => {
    renderShell();
    expect(screen.getByTestId("left-rail")).toBeVisible();
    fireEvent.click(screen.getByTestId("lens-reading"));
    expect(screen.getByTestId("reading-pane")).toBeVisible();
    expect(screen.queryByTestId("left-rail")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm vitest run apps/desktop/src/layout/Shell.test.tsx`
Expected: FAIL — rail still present in reading lens.

- [ ] **Step 3: Edit `Shell.tsx`**

1. Replace the import `import { ReadingStub } from "./ReadingStub";` with `import { ReadingLens } from "./ReadingLens";`.
2. Change `handleNodeDoubleClick` to open the reading lens instead of the modal:

```tsx
  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      workspace.selectNode(nodeId);
      setLens("reading");
    },
    [workspace, setLens],
  );
```

3. Change `openNodeDocument` (timeline open) similarly:

```tsx
  const openNodeDocument = useCallback(
    (graphNodeId: string) => {
      workspace.selectNode(graphNodeId);
      setLens("reading");
    },
    [workspace, setLens],
  );
```

4. Gate the rail so it hides in reading mode — replace the `<IconStrip … />` block with:

```tsx
        {lens !== "reading" && (
          <IconStrip
            browserActive={layout.browserOpen}
            activeLeftMode={leftMode}
            onToggleBrowser={layout.toggleBrowser}
            onSetBrowserMode={setBrowserMode}
            onOpenSequences={() => setSequencesOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            inspectorActive={inspectorVisible}
            onToggleInspector={layout.toggleInspector}
            terminalActive={layout.dockOpen}
            onToggleTerminal={layout.toggleDock}
          />
        )}
```

(Note the `inspectorActive={inspectorVisible}` change — this is the carried Phase-2 inspector-affordance fix: the rail icon now reflects actual visibility, not just `inspectorOpen`.)

5. Replace `{lens === "reading" && <ReadingStub title={selectedTitle} />}` with:

```tsx
          {lens === "reading" && <ReadingLens onFullScreen={() => setFullScreenMode("node")} />}
```

6. Add `data-lens={lens}` to the root `<div className="ishell" …>` so CSS can respond to the reading lens.

- [ ] **Step 4: Delete the stub**

```bash
git rm apps/desktop/src/layout/ReadingStub.tsx
```

- [ ] **Step 5: Run tests + type-check**

Run: `pnpm vitest run apps/desktop/src/layout/Shell.test.tsx`
Expected: PASS (including the new reading-lens rail-hidden test).
Run: `pnpm exec tsc -b`
Expected: no errors. If `selectedTitle` becomes unused after removing the stub prop, keep it (still used by the TransportBar breadcrumb).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/layout/Shell.tsx apps/desktop/src/layout/Shell.test.tsx apps/desktop/src/layout/ReadingStub.tsx
git commit -m "feat(shell): first-class reading lens — double-click/timeline open it, rail recedes, inspector affordance honest"
```

---

### Task 4: Reading-lens styles

**Files:**
- Modify: `apps/desktop/src/layout/observatory.css`

- [ ] **Step 1: Append the reading-lens CSS**

Append to `apps/desktop/src/layout/observatory.css`:

```css
/* ===== Phase 3: reading lens ===== */
.ishell-reading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--ob-bg-2);
  overflow: hidden;
}
.ishell-reading__bar {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 34px;
  flex: 0 0 auto;
  padding: 0 16px;
  border-bottom: 1px solid var(--ob-line);
}
.ishell-reading__title {
  font-family: var(--ob-serif);
  font-size: 13px;
  color: var(--ob-dim);
}
.ishell-reading__full {
  margin-left: auto;
  background: transparent;
  border: 1px solid var(--ob-line-2);
  border-radius: 6px;
  color: var(--ob-dim);
  cursor: pointer;
  padding: 3px 9px;
  font-size: 13px;
}
.ishell-reading__full:hover { color: var(--ob-accent); border-color: var(--ob-accent-deep); }
.ishell-reading__col {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: flex;
  justify-content: center;
}
.ishell-reading__col > * {
  width: min(720px, 92%);
}
.ishell-reading__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ob-faint);
  font-family: var(--ob-serif);
  font-size: 15px;
}
/* Reading lens runs edge-to-edge: no rail column, stage is the whole body. */
.ishell[data-lens="reading"] .ishell-body { }
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/layout/observatory.css
git commit -m "style(shell): reading-lens layout (centered column, receded chrome)"
```

---

### Task 5: Sweep the orphaned `ContentTab`

**Files:**
- Delete: `apps/desktop/src/features/viewer/ContentTab.tsx`, `apps/desktop/src/features/viewer/ContentTab.graphdoc.test.tsx`

- [ ] **Step 1: Grep-guard**

Run: `grep -rn "ContentTab" apps/desktop/src --include='*.ts' --include='*.tsx'`
Expected: only `ContentTab.tsx` and `ContentTab.graphdoc.test.tsx` self-reference. If anything else imports `ContentTab`, STOP and report — do not delete.

- [ ] **Step 2: Delete**

```bash
git rm apps/desktop/src/features/viewer/ContentTab.tsx apps/desktop/src/features/viewer/ContentTab.graphdoc.test.tsx
```

- [ ] **Step 3: Type-check + focused suite**

Run: `pnpm exec tsc -b`
Expected: no errors.
Run: `pnpm vitest run apps/desktop/src/features/viewer`
Expected: PASS (remaining viewer tests: NodeReaderBody, NodeContentPane, NodeDocumentPane).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(viewer): remove orphaned ContentTab (superseded by NodeReaderBody path)"
```

---

### Task 6: Resize-handle tests + full verify

Covers the highest-risk untested code carried from Phase 2 — the sign-inverted resize math in `useShellLayout`.

**Files:**
- Modify: `apps/desktop/src/layout/useShellLayout.test.ts`

**Interfaces:**
- Consumes: `useShellLayout()` resize helpers `beginBrowserResize`, `beginInspectorResize`, `beginDockResize` and the widths/height they mutate.

- [ ] **Step 1: Add the failing/again-green resize tests**

Append inside the existing `describe` in `apps/desktop/src/layout/useShellLayout.test.ts`:

```ts
  it("browser resize widens as the pointer moves right", () => {
    const { result } = renderHook(() => useShellLayout());
    const start = { clientX: 100, preventDefault() {} } as unknown as React.PointerEvent;
    act(() => result.current.beginBrowserResize(start));
    act(() => window.dispatchEvent(new PointerEvent("pointermove", { clientX: 140 })));
    expect(result.current.browserWidth).toBe(280);
    act(() => window.dispatchEvent(new PointerEvent("pointerup")));
  });

  it("inspector resize widens as the pointer moves LEFT (right-anchored)", () => {
    const { result } = renderHook(() => useShellLayout());
    const start = { clientX: 500, preventDefault() {} } as unknown as React.PointerEvent;
    act(() => result.current.beginInspectorResize(start));
    act(() => window.dispatchEvent(new PointerEvent("pointermove", { clientX: 460 })));
    expect(result.current.inspectorWidth).toBe(300);
    act(() => window.dispatchEvent(new PointerEvent("pointerup")));
  });

  it("dock grows as the pointer moves UP (bottom-anchored)", () => {
    const { result } = renderHook(() => useShellLayout());
    const start = { clientY: 400, preventDefault() {} } as unknown as React.PointerEvent;
    act(() => result.current.beginDockResize(start));
    act(() => window.dispatchEvent(new PointerEvent("pointermove", { clientY: 360 })));
    expect(result.current.dockHeight).toBe(280);
    act(() => window.dispatchEvent(new PointerEvent("pointerup")));
  });
```

(Defaults are 240 browser / 260 inspector / 240 dock; a 40px move in the widening direction gives 280 / 300 / 280 respectively — all inside the min/max clamps.)

- [ ] **Step 2: Run — verify pass**

Run: `pnpm vitest run apps/desktop/src/layout/useShellLayout.test.ts`
Expected: PASS (7 tests total). If a resize test fails, the sign of that helper's delta is wrong — fix the helper in `useShellLayout.ts` (this is exactly the bug these tests exist to catch) and re-run.

Note: jsdom supports `PointerEvent` via the testing environment; if `PointerEvent` is undefined in this jsdom version, substitute `new MouseEvent("pointermove", { clientX })` (the handlers read `clientX`/`clientY` off the event, which `MouseEvent` provides) and note the substitution.

- [ ] **Step 3: Full desktop suite + type-check**

Run: `pnpm exec tsc -b`
Expected: no errors.
Run: `pnpm vitest run apps/desktop`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/layout/useShellLayout.test.ts
git commit -m "test(shell): cover browser/inspector/dock resize direction math"
```

- [ ] **Step 5: Launch and eyeball (manual — controller/user)**

Run `pnpm launch`. Confirm: ⌘3 (or double-click a node, or open a node from the timeline) enters the reading lens — a centered document column with the rail gone; the fullscreen button opens the immersive reader; ⌘1/⌘2 return to canvas/timeline (rail returns). Timeline lighting still works.

---

## Self-Review

**Spec coverage (Phase 3 slice):**
- §6 Reading lens as a first-class surface (centered column; reached by lens switch, double-click, timeline open) → Tasks 2, 3. ✔
- §6 reading chrome recedes (rail hidden) → Task 3 (`lens !== "reading"` gate) + Task 4 CSS. ✔ (transport bar kept so the lens switch remains reachable; inspector hidden because it only shows on canvas selection.)
- §8/§6 document home moves from the `FullScreenReader` bridge into the lens → Tasks 1–3; `FullScreenReader` retained for immersive fullscreen (reading-lens button) + sequence playback. ✔
- Carried Phase-2 items: inspector-affordance fix → Task 3 (`inspectorActive={inspectorVisible}`); `ContentTab` sweep → Task 5; resize-handle tests → Task 6. ✔ (BottomDock `title`→`label` rename intentionally left — cosmetic, not worth the churn now.)
- Timeline transport (scrub/play) → explicitly DEFERRED; lighting already works in `TimelineLens`. ✔

**Placeholder scan:** every code step has complete code. No TBD/TODO. The one environment nuance (jsdom `PointerEvent` vs `MouseEvent`) is called out with a concrete fallback in Task 6 Step 2. ✔

**Type consistency:** `NodeReaderBody({ node })` (Task 1) is consumed identically by `FullScreenReader` (Task 1 Step 5) and `ReadingLens` (Task 2). `ReadingLens({ onFullScreen })` (Task 2) matches Shell's usage (Task 3). CSS classes in Task 4 (`ishell-reading*`) match those emitted by `ReadingLens` (Task 2). Resize helper names in Task 6 match `useShellLayout`'s exports. ✔

**Green-at-every-commit:** Task 1 is a pure refactor (behavior-preserving, suite stays green). Tasks 2, 4, 6 are additive. Task 3 swaps stub→lens and deletes the stub in one commit (no dangling import). Task 5 deletes `ContentTab` after grep-guard. ✔

**Deferred to Phase 4 (noted):** command-palette expansion (⌘K currently opens the browser search mode); CanvasScreen toolbar removal; the timeline transport; `BottomDock` `title`→`label`.

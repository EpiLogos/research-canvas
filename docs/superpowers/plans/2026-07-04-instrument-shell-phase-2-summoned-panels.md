# Instrument Shell — Phase 2: Summoned Panels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the standing panels into *summoned* panels so the stage runs full-bleed. The rail folds into the flex flow (Observatory-styled, no longer floating over the canvas); the terminal becomes a bottom pull-up dock (⌘J) and *is* the agent (the standalone Agent panel is deleted); the inspector becomes an appear-on-select floating overlay (⌘I, pinnable); the left browser floats as a card (⌘B); `RightPanelSlot` is retired; node documents open via the existing `FullScreenReader` as the Phase-2 bridge.

**Architecture:** New standalone presentational components (`BottomDock`, `InspectorOverlay`) are built first with props only — they don't touch shared state, so the build stays green. The left overlay gains a Graph/Files toggle + filter in place. Then one atomic integration task rewrites `useShellLayout` to a summoned-panel state model AND recomposes `Shell` and `IconStrip` together (they are tightly coupled through the hook, so they must change in one commit to keep `tsc` green). A final task deletes the now-dead code.

**Tech Stack:** React 19, TypeScript, Vite, Zustand (`CanvasWorkspaceContext`), Vitest + `@testing-library/react` (jsdom), CSS custom properties (Observatory tokens from Phase 1, in `apps/desktop/src/layout/observatory.css`).

**Series:** Phase 2 of 4. Builds on Phase 1 (merged at `bda0f0a`). Spec: `docs/superpowers/specs/2026-07-03-instrument-shell-redesign-design.md`. Phase 3 (first-class Reading lens + timeline transport) and Phase 4 (command palette, toolbar removal) follow.

## Global Constraints

- Frontend tests via `pnpm vitest run <file>`; type-check via `pnpm exec tsc -b`.
- Test-first for every component and state change (failing test → verify fail → implement → verify pass → commit).
- Observatory palette is authoritative. Cyan `var(--ob-accent)` `#79c0d4` is the only UI accent; amber `var(--ob-amber)` `#d0a24a` stays reserved for the archetypal-lighting semantic — do NOT use it for generic UI here.
- Do NOT edit `apps/desktop/src/styles.css`; all new/overriding CSS goes in `apps/desktop/src/layout/observatory.css`.
- **Dirty-tree staging rule (critical):** the working tree carries ~246 UNRELATED changes (episode-asset deletions, plus edits to `LeftOverlay.tsx`? no — see note, `tauri.conf.json`, `CanvasView.tsx`). Every task stages ONLY its own files by explicit path. NEVER `git add -A`, `git add .`, or `git commit -a`.
- Keep `data-testid`s other tests depend on unless a task explicitly changes them: `left-rail`, `canvas-pane`, `timeline-pane`, `transport-bar`, `status-strip`, `reading-pane`.
- Preserve working functionality: canvas, timeline, file tree, resource-root management, annotations, terminal session, node-document viewing (via `FullScreenReader` after this phase), and the timeline "open node" path.

---

## File Structure

**Create:**
- `apps/desktop/src/layout/BottomDock.tsx` + `BottomDock.test.tsx` — terminal pull-up dock shell (presentational).
- `apps/desktop/src/layout/InspectorOverlay.tsx` + `InspectorOverlay.test.tsx` — floating right inspector card (presentational).

**Modify:**
- `apps/desktop/src/features/canvas/... ` — none.
- `apps/desktop/src/layout/LeftOverlay.tsx` (+ new `LeftOverlay.test.tsx`) — add Graph/Files segmented toggle + filter to `files` mode; Graph lists `workspace.nodes` grouped by type, filtered.
- `apps/desktop/src/layout/useShellLayout.ts` (+ rewrite `useShellLayout` test if present — none exists today, add `useShellLayout.test.ts`) — summoned-panel state model.
- `apps/desktop/src/layout/IconStrip.tsx` + `IconStrip.test.tsx` — active-state props keyed to the summoned panels; Browser/Inspector/Terminal as toggles.
- `apps/desktop/src/layout/Shell.tsx` + `Shell.test.tsx` + `Shell.timeline.test.tsx` — recompose with the summoned overlays + bottom dock; retire `RightPanelSlot`; double-click → `FullScreenReader`.
- `apps/desktop/src/layout/observatory.css` — rail flex-flow + Observatory restyle; overlay/dock/segmented/filter styles.

**Delete (final task, after grep-guard):**
- `apps/desktop/src/layout/RightPanelSlot.tsx`
- `apps/desktop/src/features/agent/AgentActivityPanel.tsx` + `AgentActivityPanel.test.tsx` + `agentActivityStore.ts` + `agentActivityStore.test.ts` (only if no non-panel consumer remains).

---

### Task 1: BottomDock component

**Files:**
- Create: `apps/desktop/src/layout/BottomDock.tsx`
- Test: `apps/desktop/src/layout/BottomDock.test.tsx`

**Interfaces:**
- Produces: `BottomDock(props: { open: boolean; height: number; title: string; onClose: () => void; onResizeStart: (e: React.PointerEvent) => void; children: React.ReactNode }): JSX.Element`. Renders `[data-testid="bottom-dock"]`; when `open` is false renders nothing (returns `null`). Has a resize handle on its top edge (`onResizeStart`) and a close button (accessible name `Close terminal`).

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/layout/BottomDock.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BottomDock } from "./BottomDock";

describe("BottomDock", () => {
  it("renders nothing when closed", () => {
    render(
      <BottomDock open={false} height={200} title="Terminal" onClose={() => {}} onResizeStart={() => {}}>
        <div>session</div>
      </BottomDock>,
    );
    expect(screen.queryByTestId("bottom-dock")).not.toBeInTheDocument();
  });

  it("renders children and title when open", () => {
    render(
      <BottomDock open height={200} title="Terminal · antichrist" onClose={() => {}} onResizeStart={() => {}}>
        <div>session-body</div>
      </BottomDock>,
    );
    expect(screen.getByTestId("bottom-dock")).toBeVisible();
    expect(screen.getByText("Terminal · antichrist")).toBeInTheDocument();
    expect(screen.getByText("session-body")).toBeInTheDocument();
  });

  it("calls onClose from the close button", () => {
    const onClose = vi.fn();
    render(
      <BottomDock open height={200} title="Terminal" onClose={onClose} onResizeStart={() => {}}>
        <div>x</div>
      </BottomDock>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close terminal" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("applies the height to the dock element", () => {
    render(
      <BottomDock open height={321} title="Terminal" onClose={() => {}} onResizeStart={() => {}}>
        <div>x</div>
      </BottomDock>,
    );
    expect(screen.getByTestId("bottom-dock")).toHaveStyle({ height: "321px" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/desktop/src/layout/BottomDock.test.tsx`
Expected: FAIL — cannot find module `./BottomDock`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/desktop/src/layout/BottomDock.tsx`:

```tsx
interface BottomDockProps {
  open: boolean;
  height: number;
  title: string;
  onClose: () => void;
  onResizeStart: (e: React.PointerEvent) => void;
  children: React.ReactNode;
}

export function BottomDock({ open, height, title, onClose, onResizeStart, children }: BottomDockProps) {
  if (!open) return null;
  return (
    <section className="ishell-dock" data-testid="bottom-dock" style={{ height: `${height}px` }}>
      <div className="ishell-dock__resize" onPointerDown={onResizeStart} title="Drag to resize" />
      <header className="ishell-dock__bar">
        <span className="ishell-dock__title">{title}</span>
        <button
          type="button"
          className="ishell-dock__close"
          aria-label="Close terminal"
          onClick={onClose}
        >
          ✕
        </button>
      </header>
      <div className="ishell-dock__body">{children}</div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/desktop/src/layout/BottomDock.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/layout/BottomDock.tsx apps/desktop/src/layout/BottomDock.test.tsx
git commit -m "feat(shell): BottomDock terminal pull-up (presentational)"
```

---

### Task 2: InspectorOverlay component

**Files:**
- Create: `apps/desktop/src/layout/InspectorOverlay.tsx`
- Test: `apps/desktop/src/layout/InspectorOverlay.test.tsx`

**Interfaces:**
- Produces: `InspectorOverlay(props: { open: boolean; pinned: boolean; width: number; onTogglePin: () => void; onClose: () => void; onResizeStart: (e: React.PointerEvent) => void; children: React.ReactNode }): JSX.Element`. Renders `[data-testid="inspector-overlay"]`; returns `null` when `open` is false. Pin button has accessible name `Pin inspector` and `data-pinned` reflecting `pinned`. Close button accessible name `Close inspector`. Left-edge resize handle calls `onResizeStart`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/layout/InspectorOverlay.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InspectorOverlay } from "./InspectorOverlay";

function props(overrides = {}) {
  return {
    open: true,
    pinned: false,
    width: 260,
    onTogglePin: vi.fn(),
    onClose: vi.fn(),
    onResizeStart: vi.fn(),
    ...overrides,
  };
}

describe("InspectorOverlay", () => {
  it("renders nothing when closed", () => {
    render(<InspectorOverlay {...props({ open: false })}><div>body</div></InspectorOverlay>);
    expect(screen.queryByTestId("inspector-overlay")).not.toBeInTheDocument();
  });

  it("renders children and applies width when open", () => {
    render(<InspectorOverlay {...props({ width: 300 })}><div>ins-body</div></InspectorOverlay>);
    expect(screen.getByTestId("inspector-overlay")).toBeVisible();
    expect(screen.getByText("ins-body")).toBeInTheDocument();
    expect(screen.getByTestId("inspector-overlay")).toHaveStyle({ width: "300px" });
  });

  it("reflects pinned state and toggles it", () => {
    const p = props({ pinned: true });
    render(<InspectorOverlay {...p}><div>x</div></InspectorOverlay>);
    const pin = screen.getByRole("button", { name: "Pin inspector" });
    expect(pin).toHaveAttribute("data-pinned", "true");
    fireEvent.click(pin);
    expect(p.onTogglePin).toHaveBeenCalledTimes(1);
  });

  it("calls onClose", () => {
    const p = props();
    render(<InspectorOverlay {...p}><div>x</div></InspectorOverlay>);
    fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/desktop/src/layout/InspectorOverlay.test.tsx`
Expected: FAIL — cannot find module `./InspectorOverlay`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/desktop/src/layout/InspectorOverlay.tsx`:

```tsx
interface InspectorOverlayProps {
  open: boolean;
  pinned: boolean;
  width: number;
  onTogglePin: () => void;
  onClose: () => void;
  onResizeStart: (e: React.PointerEvent) => void;
  children: React.ReactNode;
}

export function InspectorOverlay({ open, pinned, width, onTogglePin, onClose, onResizeStart, children }: InspectorOverlayProps) {
  if (!open) return null;
  return (
    <aside className="ishell-inspector" data-testid="inspector-overlay" style={{ width: `${width}px` }}>
      <div className="ishell-inspector__resize" onPointerDown={onResizeStart} title="Drag to resize" />
      <header className="ishell-inspector__bar">
        <span className="ishell-inspector__title">Inspector</span>
        <button
          type="button"
          className="ishell-inspector__pin"
          aria-label="Pin inspector"
          data-pinned={pinned ? "true" : "false"}
          onClick={onTogglePin}
        >
          ⚲
        </button>
        <button
          type="button"
          className="ishell-inspector__close"
          aria-label="Close inspector"
          onClick={onClose}
        >
          ✕
        </button>
      </header>
      <div className="ishell-inspector__body">{children}</div>
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/desktop/src/layout/InspectorOverlay.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/layout/InspectorOverlay.tsx apps/desktop/src/layout/InspectorOverlay.test.tsx
git commit -m "feat(shell): InspectorOverlay appear-on-select card (presentational)"
```

---

### Task 3: Graph/Files toggle + filter in LeftOverlay

Adds the unified-browser affordances to the existing left overlay's `files` mode: a Graph/Files segmented toggle and a filter input. Files view keeps the existing project list, resource-roots, and file tree. Graph view lists the current canvas's nodes grouped by type, filtered by the same query. Search/annotations modes are untouched.

**Files:**
- Modify: `apps/desktop/src/layout/LeftOverlay.tsx`
- Test: `apps/desktop/src/layout/LeftOverlay.test.tsx` (create)

**Interfaces:**
- Consumes: `useCanvasWorkspace()` (existing) — uses `workspace.nodes` (each has `id: string`, `title: string`, `type: string`), `workspace.selectNode(id)`, plus the existing projects/resourceRoots/entries already used by the component.
- Produces: within `files` mode, a segmented control with buttons `[data-testid="browser-graph"]` / `[data-testid="browser-files"]` (Graph default), a filter input with `[data-testid="browser-filter"]`, and — in Graph view — rows `[data-testid="graph-node-<id>"]` grouped under type headers. Selecting a Graph row calls `workspace.selectNode(id)`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/layout/LeftOverlay.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LeftOverlay } from "./LeftOverlay";

const selectNode = vi.fn();

vi.mock("../features/canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => ({
    projects: [],
    activeProjectId: null,
    selectProject: vi.fn(),
    resourceRoots: [],
    listDirectories: vi.fn().mockResolvedValue([]),
    attachResourceRoot: vi.fn(),
    detachResourceRoot: vi.fn(),
    entries: [],
    selectedEntryId: null,
    selectEntry: vi.fn(),
    selectNode,
    nodes: [
      { id: "n1", title: "The Accuser", type: "operator" },
      { id: "n2", title: "The Naked Face", type: "note" },
      { id: "n3", title: "Satan Exulting", type: "resource" },
    ],
  }),
}));

function renderFiles() {
  return render(
    <LeftOverlay open mode="files" onResizeStart={() => {}} />,
  );
}

describe("LeftOverlay browser", () => {
  it("defaults to the Graph view and groups nodes by type", () => {
    renderFiles();
    expect(screen.getByTestId("browser-graph")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("graph-node-n1")).toHaveTextContent("The Accuser");
    expect(screen.getByTestId("graph-node-n2")).toHaveTextContent("The Naked Face");
  });

  it("filters graph rows by the query", () => {
    renderFiles();
    fireEvent.change(screen.getByTestId("browser-filter"), { target: { value: "accus" } });
    expect(screen.getByTestId("graph-node-n1")).toBeInTheDocument();
    expect(screen.queryByTestId("graph-node-n2")).not.toBeInTheDocument();
  });

  it("selects a node from a graph row", () => {
    renderFiles();
    fireEvent.click(screen.getByTestId("graph-node-n1"));
    expect(selectNode).toHaveBeenCalledWith("n1");
  });

  it("switches to the Files view", () => {
    renderFiles();
    fireEvent.click(screen.getByTestId("browser-files"));
    expect(screen.getByTestId("browser-files")).toHaveAttribute("data-active", "true");
    // Files view shows the Files section label from the existing tree UI.
    expect(screen.getByText("Files")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/desktop/src/layout/LeftOverlay.test.tsx`
Expected: FAIL — no `browser-graph`/`browser-filter` testids.

- [ ] **Step 3: Implement the Graph/Files toggle + filter**

In `apps/desktop/src/layout/LeftOverlay.tsx`:

1. Add imports/state at the top of the component body (after the existing `useState` hooks):

```tsx
  const [browserView, setBrowserView] = useState<"graph" | "files">("graph");
  const [filter, setFilter] = useState("");
```

2. Inside the `mode === "files"` block, immediately after the opening `<>` fragment (before the Projects section), insert the segmented control + filter:

```tsx
            <div className="lo-browser-controls">
              <div className="lo-seg" role="tablist" aria-label="Browser view">
                <button
                  type="button"
                  data-testid="browser-graph"
                  data-active={browserView === "graph" ? "true" : "false"}
                  onClick={() => setBrowserView("graph")}
                >
                  Graph
                </button>
                <button
                  type="button"
                  data-testid="browser-files"
                  data-active={browserView === "files" ? "true" : "false"}
                  onClick={() => setBrowserView("files")}
                >
                  Files
                </button>
              </div>
              <input
                className="lo-filter"
                data-testid="browser-filter"
                placeholder="Filter…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
```

3. Wrap the existing Projects + Resource Folders + Files-tree sections so they only render in `files` view, and add the Graph view. Replace the three existing `lo-section` blocks' visibility by conditionalizing them on `browserView === "files"`, and add before them a Graph block rendered when `browserView === "graph"`:

```tsx
            {browserView === "graph" && (
              <div className="lo-section lo-section--grow">
                {(() => {
                  const q = filter.trim().toLowerCase();
                  const matches = workspace.nodes.filter(
                    (n) => !q || n.title.toLowerCase().includes(q),
                  );
                  const groups = new Map<string, typeof matches>();
                  for (const n of matches) {
                    const arr = groups.get(n.type) ?? [];
                    arr.push(n);
                    groups.set(n.type, arr);
                  }
                  if (matches.length === 0) {
                    return <div className="lo-empty">No matching nodes</div>;
                  }
                  return Array.from(groups.entries()).map(([type, ns]) => (
                    <div key={type}>
                      <div className="lo-section__header">
                        <span className="lo-label">{type} · {ns.length}</span>
                      </div>
                      <div className="lo-file-list">
                        {ns.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            className="lo-file-row"
                            data-testid={`graph-node-${n.id}`}
                            onClick={() => workspace.selectNode(n.id)}
                            title={n.title}
                          >
                            <span className="lo-file-icon">·</span>
                            <span className="lo-file-name">{n.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
```

Then guard the existing Projects, Resource Folders, and Files sections each with `{browserView === "files" && ( … )}` so they only show in Files view. (When wrapping, apply the filter to the file tree too if trivial — otherwise leave the file tree unfiltered; the test only requires the Files label to be present.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/desktop/src/layout/LeftOverlay.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc -b`
Expected: no errors. (`workspace.nodes[].type` is a string on the canvas node model; if the field is typed more narrowly, use `String(n.type)` when grouping.)

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/layout/LeftOverlay.tsx apps/desktop/src/layout/LeftOverlay.test.tsx
git commit -m "feat(shell): Graph/Files toggle and filter in the browser overlay"
```

---

### Task 4: Phase 2 styles — rail flex-flow + overlay/dock CSS

Pure CSS in `observatory.css`. Folds the rail into the body's flex flow (fixing the Phase-1 canvas-under-rail geometry), restyles it to Observatory, and styles the floating browser overlay, inspector overlay, bottom dock, and the Graph/Files segmented control + filter. No test (CSS); verified by build + manual eyeball.

**Files:**
- Modify: `apps/desktop/src/layout/observatory.css`

- [ ] **Step 1: Append the Phase 2 styles**

Append to `apps/desktop/src/layout/observatory.css`:

```css
/* ===== Phase 2: summoned panels ===== */

/* Rail folds into the body flex flow (no longer absolute over the stage). */
.ishell-body { display: flex; flex-direction: row; }
.ishell .icon-strip {
  position: relative;
  left: auto; top: auto; bottom: auto;
  width: 44px;
  flex: 0 0 44px;
  background: var(--ob-panel);
  border-right: 1px solid var(--ob-line);
  z-index: 1;
  padding: 9px 0;
}
.ishell .icon-strip__btn { width: 30px; height: 30px; color: var(--ob-faint); border-radius: 8px; padding: 7px; }
.ishell .icon-strip__btn svg { width: 16px; height: 16px; }
.ishell .icon-strip__btn:hover { color: var(--ob-dim); background: var(--ob-line); }
.ishell .icon-strip__btn[data-active="true"] { color: var(--ob-accent); background: var(--ob-tint); }
.ishell-stage { flex: 1 1 auto; }

/* Floating browser overlay (the existing .left-overlay, restyled to a card). */
.ishell-stage .left-overlay {
  position: absolute;
  left: 8px; top: 8px; bottom: 8px;
  width: var(--browser-width, 240px);
  background: var(--ob-float);
  border: 1px solid var(--ob-line-3);
  border-radius: 11px;
  box-shadow: 0 22px 50px -20px rgba(0,0,0,0.9);
  z-index: 7;
  overflow: hidden;
}
.lo-browser-controls { display: flex; flex-direction: column; gap: 6px; padding: 10px 10px 6px; }
.lo-seg { display: flex; background: var(--ob-panel); border: 1px solid var(--ob-line-2); border-radius: 7px; padding: 2px; }
.lo-seg button { flex: 1; font: inherit; font-size: 11px; border: 0; background: transparent; color: var(--ob-dim); padding: 4px 0; border-radius: 5px; cursor: pointer; }
.lo-seg button[data-active="true"] { background: var(--ob-tint); color: var(--ob-accent); }
.lo-filter { font: inherit; font-size: 11px; background: var(--ob-panel); border: 1px solid var(--ob-line-2); border-radius: 7px; padding: 5px 9px; color: var(--ob-ink); }
.lo-filter::placeholder { color: var(--ob-faint); }

/* Floating inspector overlay. */
.ishell-inspector {
  position: absolute;
  right: 8px; top: 8px; bottom: 8px;
  background: var(--ob-float);
  border: 1px solid var(--ob-line-3);
  border-radius: 11px;
  box-shadow: 0 22px 50px -20px rgba(0,0,0,0.9);
  z-index: 7;
  display: flex; flex-direction: column; overflow: hidden;
}
.ishell-inspector__bar { display: flex; align-items: center; gap: 8px; padding: 9px 11px; border-bottom: 1px solid var(--ob-line); }
.ishell-inspector__title { font-family: var(--ob-mono); font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ob-dim); }
.ishell-inspector__pin { margin-left: auto; }
.ishell-inspector__pin, .ishell-inspector__close { background: transparent; border: 0; color: var(--ob-faint); font-size: 12px; cursor: pointer; }
.ishell-inspector__pin[data-pinned="true"] { color: var(--ob-accent); }
.ishell-inspector__body { flex: 1; overflow: auto; }
.ishell-inspector__resize { position: absolute; left: 0; top: 0; bottom: 0; width: 5px; cursor: ew-resize; }

/* Bottom terminal dock. */
.ishell-dock {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  background: var(--ob-panel);
  border-top: 1px solid var(--ob-line-3);
  box-shadow: 0 -18px 40px -20px rgba(0,0,0,0.8);
  z-index: 8;
  display: flex; flex-direction: column;
}
.ishell-dock__bar { display: flex; align-items: center; gap: 8px; padding: 5px 10px; border-bottom: 1px solid var(--ob-line); }
.ishell-dock__title { font-family: var(--ob-mono); font-size: 10px; letter-spacing: 0.06em; color: var(--ob-dim); }
.ishell-dock__close { margin-left: auto; background: transparent; border: 0; color: var(--ob-faint); font-size: 11px; cursor: pointer; }
.ishell-dock__body { flex: 1; min-height: 0; overflow: hidden; }
.ishell-dock__resize { position: absolute; left: 0; right: 0; top: 0; height: 5px; cursor: ns-resize; }
```

- [ ] **Step 2: Type-check / build sanity**

Run: `pnpm exec tsc -b`
Expected: no errors (CSS-only change; tsc unaffected but confirms nothing else regressed).

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/layout/observatory.css
git commit -m "style(shell): rail flex-flow + summoned-overlay/dock styling"
```

---

### Task 5: useShellLayout summoned-panel model + Shell/IconStrip recomposition

The atomic integration. Rewrites `useShellLayout` to a summoned-panel state model, rewrites `IconStrip` active-state props, and recomposes `Shell` — all in one commit so `tsc` stays green. Retires `RightPanelSlot`; routes node double-click and timeline open-node to `FullScreenReader`; wires ⌘B/⌘I/⌘J as toggles and appear-on-select inspector.

**Files:**
- Modify: `apps/desktop/src/layout/useShellLayout.ts`
- Create: `apps/desktop/src/layout/useShellLayout.test.ts`
- Modify: `apps/desktop/src/layout/IconStrip.tsx`
- Modify: `apps/desktop/src/layout/IconStrip.test.tsx`
- Modify: `apps/desktop/src/layout/Shell.tsx`
- Modify: `apps/desktop/src/layout/Shell.test.tsx`
- Modify: `apps/desktop/src/layout/Shell.timeline.test.tsx`
- Delete: `apps/desktop/src/layout/RightPanelSlot.tsx` (its only consumers are `Shell` — which stops importing it here — and itself; and it imports the now-removed `RightTab`/`openRightTab` from `useShellLayout`, so it must go in this same commit to keep `tsc` green).

**Interfaces:**
- Produces `useShellLayout()` returning:
  `{ shellRef, browserOpen, setBrowserOpen, toggleBrowser, browserWidth, beginBrowserResize, inspectorOpen, setInspectorOpen, toggleInspector, inspectorPinned, toggleInspectorPin, inspectorWidth, beginInspectorResize, dockOpen, setDockOpen, toggleDock, dockHeight, beginDockResize }`.
- Produces `IconStrip` props: `{ browserActive: boolean; onToggleBrowser: () => void; onSetBrowserMode: (m: "files" | "search" | "annotations") => void; activeLeftMode: "files" | "search" | "annotations"; inspectorActive: boolean; onToggleInspector: () => void; terminalActive: boolean; onToggleTerminal: () => void; onOpenSequences: () => void; onOpenSettings: () => void }`. Keeps `data-testid="left-rail"`. Files/Search/Annotate buttons call `onSetBrowserMode` (and open the browser); the Browser (files) button's `data-active` reflects `browserActive`.

- [ ] **Step 1: Write the failing hook test**

Create `apps/desktop/src/layout/useShellLayout.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useShellLayout } from "./useShellLayout";

describe("useShellLayout summoned panels", () => {
  it("all panels start closed", () => {
    const { result } = renderHook(() => useShellLayout());
    expect(result.current.browserOpen).toBe(false);
    expect(result.current.inspectorOpen).toBe(false);
    expect(result.current.dockOpen).toBe(false);
    expect(result.current.inspectorPinned).toBe(false);
  });

  it("toggles each panel", () => {
    const { result } = renderHook(() => useShellLayout());
    act(() => result.current.toggleBrowser());
    expect(result.current.browserOpen).toBe(true);
    act(() => result.current.toggleInspector());
    expect(result.current.inspectorOpen).toBe(true);
    act(() => result.current.toggleDock());
    expect(result.current.dockOpen).toBe(true);
    act(() => result.current.toggleBrowser());
    expect(result.current.browserOpen).toBe(false);
  });

  it("toggles the inspector pin", () => {
    const { result } = renderHook(() => useShellLayout());
    act(() => result.current.toggleInspectorPin());
    expect(result.current.inspectorPinned).toBe(true);
  });

  it("setBrowserOpen sets explicitly", () => {
    const { result } = renderHook(() => useShellLayout());
    act(() => result.current.setBrowserOpen(true));
    expect(result.current.browserOpen).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/desktop/src/layout/useShellLayout.test.ts`
Expected: FAIL — `browserOpen` etc. undefined.

- [ ] **Step 3: Rewrite `useShellLayout.ts`**

Replace the contents of `apps/desktop/src/layout/useShellLayout.ts`:

```ts
import { useCallback, useRef, useState } from "react";

const BROWSER_MIN = 200;
const BROWSER_MAX = 380;
const INSPECTOR_MIN = 220;
const INSPECTOR_MAX = 380;
const DOCK_MIN = 120;
const DOCK_MAX = 560;

export function useShellLayout() {
  const shellRef = useRef<HTMLDivElement>(null);

  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserWidth, setBrowserWidth] = useState(240);
  const toggleBrowser = useCallback(() => setBrowserOpen((v) => !v), []);

  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorPinned, setInspectorPinned] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(260);
  const toggleInspector = useCallback(() => setInspectorOpen((v) => !v), []);
  const toggleInspectorPin = useCallback(() => setInspectorPinned((v) => !v), []);

  const [dockOpen, setDockOpen] = useState(false);
  const [dockHeight, setDockHeight] = useState(240);
  const toggleDock = useCallback(() => setDockOpen((v) => !v), []);

  const browserWidthRef = useRef(browserWidth);
  browserWidthRef.current = browserWidth;
  const inspectorWidthRef = useRef(inspectorWidth);
  inspectorWidthRef.current = inspectorWidth;
  const dockHeightRef = useRef(dockHeight);
  dockHeightRef.current = dockHeight;

  const beginBrowserResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = browserWidthRef.current;
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(BROWSER_MAX, Math.max(BROWSER_MIN, startW + ev.clientX - startX));
      setBrowserWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const beginInspectorResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = inspectorWidthRef.current;
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, startW + startX - ev.clientX));
      setInspectorWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const beginDockResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = dockHeightRef.current;
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(DOCK_MAX, Math.max(DOCK_MIN, startH + startY - ev.clientY));
      setDockHeight(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  return {
    shellRef,
    browserOpen,
    setBrowserOpen,
    toggleBrowser,
    browserWidth,
    beginBrowserResize,
    inspectorOpen,
    setInspectorOpen,
    toggleInspector,
    inspectorPinned,
    toggleInspectorPin,
    inspectorWidth,
    beginInspectorResize,
    dockOpen,
    setDockOpen,
    toggleDock,
    dockHeight,
    beginDockResize,
  };
}
```

- [ ] **Step 4: Run the hook test — verify pass**

Run: `pnpm vitest run apps/desktop/src/layout/useShellLayout.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Rewrite `IconStrip.tsx` props**

Replace the `IconStripProps` interface and component signature in `apps/desktop/src/layout/IconStrip.tsx`, and update the nav-button wiring. New interface:

```tsx
interface IconStripProps {
  browserActive: boolean;
  activeLeftMode: "files" | "search" | "annotations";
  onToggleBrowser: () => void;
  onSetBrowserMode: (mode: "files" | "search" | "annotations") => void;
  onOpenSequences: () => void;
  onOpenSettings: () => void;
  inspectorActive: boolean;
  onToggleInspector: () => void;
  terminalActive: boolean;
  onToggleTerminal: () => void;
}
```

Component signature:

```tsx
export function IconStrip({ browserActive, activeLeftMode, onToggleBrowser, onSetBrowserMode, onOpenSequences, onOpenSettings, inspectorActive, onToggleInspector, terminalActive, onToggleTerminal }: IconStripProps) {
```

Replace `handleNavClick`:

```tsx
  const handleNavClick = (id: string) => {
    if (id === "files") {
      onToggleBrowser();
    } else if (id === "search") {
      onSetBrowserMode("search");
    } else if (id === "annotate") {
      onSetBrowserMode("annotations");
    } else if (id === "sequences") {
      onOpenSequences();
    }
  };
```

Update the mapped nav buttons' `data-active` so only the Files (browser) icon reflects browser state, and search/annotate reflect the active mode while the browser is open:

```tsx
            data-active={
              (icon.id === "files" && browserActive) ||
              (icon.id === "search" && browserActive && activeLeftMode === "search") ||
              (icon.id === "annotate" && browserActive && activeLeftMode === "annotations")
                ? "true"
                : undefined
            }
```

Change the existing Inspector button's `onClick` to `onToggleInspector` and add `data-active={inspectorActive ? "true" : undefined}`; change the Terminal button's `onClick` to `onToggleTerminal` and add `data-active={terminalActive ? "true" : undefined}`.

- [ ] **Step 6: Update `IconStrip.test.tsx`**

Replace the `setup` props object and the assertions in `apps/desktop/src/layout/IconStrip.test.tsx` to the new interface:

```tsx
function setup(overrides: Partial<Parameters<typeof IconStrip>[0]> = {}) {
  const props = {
    browserActive: false,
    activeLeftMode: "files" as const,
    onToggleBrowser: vi.fn(),
    onSetBrowserMode: vi.fn(),
    onOpenSequences: vi.fn(),
    onOpenSettings: vi.fn(),
    inspectorActive: false,
    onToggleInspector: vi.fn(),
    terminalActive: false,
    onToggleTerminal: vi.fn(),
    ...overrides,
  };
  render(<IconStrip {...props} />);
  return props;
}

describe("IconStrip rail", () => {
  it("exposes Inspector and Terminal verbs", () => {
    setup();
    expect(screen.getByRole("button", { name: "Inspector" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminal" })).toBeInTheDocument();
  });

  it("summons the terminal", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));
    expect(props.onToggleTerminal).toHaveBeenCalledTimes(1);
  });

  it("summons the inspector", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Inspector" }));
    expect(props.onToggleInspector).toHaveBeenCalledTimes(1);
  });

  it("toggles the browser from the Files verb", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Files & Project" }));
    expect(props.onToggleBrowser).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 7: Rewrite `Shell.tsx`**

Replace the contents of `apps/desktop/src/layout/Shell.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { CanvasPane } from "./CanvasPane";
import { FullScreenReader } from "./FullScreenReader";
import { IconStrip } from "./IconStrip";
import { LeftOverlay } from "./LeftOverlay";
import { BottomDock } from "./BottomDock";
import { InspectorOverlay } from "./InspectorOverlay";
import { StatusStrip } from "./StatusStrip";
import { TransportBar } from "./TransportBar";
import { ReadingStub } from "./ReadingStub";
import { InspectorTab } from "../features/inspector/InspectorTab";
import { TerminalPane } from "../features/terminal/TerminalPane";
import { useShellLayout } from "./useShellLayout";
import { useLensMode } from "./useLensMode";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { SequencesManager } from "../features/sequences/SequencesManager";
import { SettingsOverlay } from "../features/settings/SettingsOverlay";
import { TimelineLens } from "@research-canvas/canvas";
import { createWorkspaceTransport } from "@research-canvas/desktop-api";
import { createTimelineDataSource } from "../features/timeline/createTimelineDataSource";

export function Shell() {
  const layout = useShellLayout();
  const workspace = useCanvasWorkspace();
  const [fullScreenMode, setFullScreenMode] = useState<"closed" | "node" | "sequence">("closed");
  const closeFullScreen = useCallback(() => setFullScreenMode("closed"), []);
  const [leftMode, setLeftMode] = useState<"files" | "search" | "annotations">("files");
  const [sequencesOpen, setSequencesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drawingMode, setDrawingMode] = useState(false);
  const [strokeColour, setStrokeColour] = useState("#f97316");

  const { lens, setLens } = useLensMode();
  const timelineDataSource = useMemo(
    () =>
      createTimelineDataSource({
        transport: createWorkspaceTransport(),
        canvasId: workspace.canvasId,
      }),
    [workspace.canvasId],
  );

  const openNodeDocument = useCallback(
    (graphNodeId: string) => {
      workspace.selectNode(graphNodeId);
      setFullScreenMode("node");
    },
    [workspace],
  );

  const setBrowserMode = useCallback(
    (mode: "files" | "search" | "annotations") => {
      setLeftMode(mode);
      layout.setBrowserOpen(true);
    },
    [layout],
  );

  // Global keyboard shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setLeftMode("search");
        layout.setBrowserOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "j") { e.preventDefault(); layout.toggleDock(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "i") { e.preventDefault(); layout.toggleInspector(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") { e.preventDefault(); layout.toggleBrowser(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "1") { e.preventDefault(); setLens("canvas"); }
      if ((e.metaKey || e.ctrlKey) && e.key === "2") { e.preventDefault(); setLens("timeline"); }
      if ((e.metaKey || e.ctrlKey) && e.key === "3") { e.preventDefault(); setLens("reading"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [layout, setLens]);

  const handleNodeSelect = useCallback(
    (nodeId: string) => {
      workspace.selectNode(nodeId);
      if (!layout.inspectorPinned) {
        layout.setInspectorOpen(true);
      }
    },
    [workspace, layout],
  );

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      workspace.selectNode(nodeId);
      setFullScreenMode("node");
    },
    [workspace],
  );

  const handlePlaySequence = useCallback(() => setFullScreenMode("sequence"), []);

  const selectedTitle = workspace.nodes.find((n) => n.id === workspace.selectedNodeId)?.title;
  const inspectorVisible = layout.inspectorOpen && (Boolean(workspace.selectedNodeId) || layout.inspectorPinned);

  return (
    <div className="ishell" ref={layout.shellRef} style={{ "--browser-width": `${layout.browserWidth}px` } as React.CSSProperties}>
      <TransportBar
        lens={lens}
        onSetLens={setLens}
        breadcrumb={selectedTitle}
        onOpenPalette={() => {
          setLeftMode("search");
          layout.setBrowserOpen(true);
        }}
      />

      <div className="ishell-body">
        <IconStrip
          browserActive={layout.browserOpen}
          activeLeftMode={leftMode}
          onToggleBrowser={layout.toggleBrowser}
          onSetBrowserMode={setBrowserMode}
          onOpenSequences={() => setSequencesOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          inspectorActive={layout.inspectorOpen}
          onToggleInspector={layout.toggleInspector}
          terminalActive={layout.dockOpen}
          onToggleTerminal={layout.toggleDock}
        />

        <div className="ishell-stage">
          {layout.browserOpen && (
            <LeftOverlay
              open
              mode={leftMode}
              onResizeStart={layout.beginBrowserResize}
              drawingMode={drawingMode}
              onToggleDrawing={() => setDrawingMode((v) => !v)}
              strokeColour={strokeColour}
              onSetStrokeColour={setStrokeColour}
            />
          )}

          {lens === "canvas" && (
            <CanvasPane
              onNodeSelect={handleNodeSelect}
              onNodeDoubleClick={handleNodeDoubleClick}
              onPlaySequence={handlePlaySequence}
              leftPanelOpen={layout.browserOpen}
              rightPanelOpen={inspectorVisible}
              drawingMode={drawingMode}
              strokeColour={strokeColour}
            />
          )}

          {lens === "timeline" && (
            <section className="canvas-pane" data-testid="timeline-pane" style={{ position: "absolute", inset: 0 }}>
              <TimelineLens dataSource={timelineDataSource} onOpenNode={openNodeDocument} />
            </section>
          )}

          {lens === "reading" && <ReadingStub title={selectedTitle} />}

          <InspectorOverlay
            open={inspectorVisible}
            pinned={layout.inspectorPinned}
            width={layout.inspectorWidth}
            onTogglePin={layout.toggleInspectorPin}
            onClose={() => layout.setInspectorOpen(false)}
            onResizeStart={layout.beginInspectorResize}
          >
            <InspectorTab />
          </InspectorOverlay>

          <BottomDock
            open={layout.dockOpen}
            height={layout.dockHeight}
            title="Terminal · antichrist"
            onClose={() => layout.setDockOpen(false)}
            onResizeStart={layout.beginDockResize}
          >
            <TerminalPane />
          </BottomDock>

          {fullScreenMode !== "closed" && (
            <FullScreenReader mode={fullScreenMode} onClose={closeFullScreen} />
          )}
        </div>
      </div>

      <StatusStrip
        synced
        nodeCount={workspace.nodes.length}
        relationCount={workspace.edges.length}
        lens={lens}
      />

      {sequencesOpen && (
        <SequencesManager
          onClose={() => setSequencesOpen(false)}
          onPlaySequence={() => {
            setSequencesOpen(false);
            setFullScreenMode("sequence");
          }}
        />
      )}

      {settingsOpen && <SettingsOverlay onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
```

Note: `TerminalPane` is always mounted only while the dock is open. If terminal-session persistence across dock close/open is required, that is a Phase-3+ concern; for Phase 2 the session re-initialises on reopen, matching the "summoned" model.

- [ ] **Step 8: Update `Shell.test.tsx`**

Replace `apps/desktop/src/layout/Shell.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { CanvasWorkspaceProvider } from "../features/canvas/CanvasWorkspaceContext";
import { Shell } from "./Shell";

function renderShell() {
  return render(
    <MemoryRouter>
      <CanvasWorkspaceProvider>
        <Shell />
      </CanvasWorkspaceProvider>
    </MemoryRouter>,
  );
}

describe("Shell frame", () => {
  it("renders the persistent chrome and the canvas stage by default", () => {
    renderShell();
    expect(screen.getByTestId("transport-bar")).toBeVisible();
    expect(screen.getByTestId("left-rail")).toBeVisible();
    expect(screen.getByTestId("status-strip")).toBeVisible();
    expect(screen.getByTestId("canvas-pane")).toBeVisible();
  });

  it("summoned panels are closed by default", () => {
    renderShell();
    expect(screen.queryByTestId("bottom-dock")).not.toBeInTheDocument();
    expect(screen.queryByTestId("inspector-overlay")).not.toBeInTheDocument();
    expect(screen.queryByTestId("left-overlay")).not.toBeInTheDocument();
  });

  it("summons the terminal dock via the rail Terminal verb", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));
    expect(screen.getByTestId("bottom-dock")).toBeVisible();
  });

  it("switches the stage surface when a lens is chosen", () => {
    renderShell();
    fireEvent.click(screen.getByTestId("lens-timeline"));
    expect(screen.getByTestId("timeline-pane")).toBeVisible();
    fireEvent.click(screen.getByTestId("lens-reading"));
    expect(screen.getByTestId("reading-pane")).toBeVisible();
  });
});
```

Note: `.left-overlay` currently has no `data-testid`. Add `data-testid="left-overlay"` to the root `<aside>` in `LeftOverlay.tsx` so the "closed by default" assertion is meaningful (one-line addition).

- [ ] **Step 9: Update `Shell.timeline.test.tsx` mock**

The timeline test's workspace mock must satisfy the new Shell (it reads `workspace.nodes`, `workspace.edges`, `workspace.selectedNodeId`, `workspace.selectNode`). Ensure the mock object includes `nodes: []`, `edges: []`, `selectedNodeId: null` if not already present. Then run it; if any assertion referenced removed structures (Agent tab, right panel), update to the timeline-pane/lens-timeline flow already used. Keep the existing `lens-timeline` click.

- [ ] **Step 10: Run the layout suite**

Run: `pnpm vitest run apps/desktop/src/layout`
Expected: PASS (BottomDock, InspectorOverlay, LeftOverlay, IconStrip, useShellLayout, Shell, Shell.timeline, TransportBar, StatusStrip, useLensMode). Fix any timeline-test mock gaps surfaced.

- [ ] **Step 11: Delete `RightPanelSlot.tsx` (its only external consumer, `Shell`, no longer imports it, and it imports the removed `RightTab`)**

```bash
git rm apps/desktop/src/layout/RightPanelSlot.tsx
```

- [ ] **Step 12: Type-check**

Run: `pnpm exec tsc -b`
Expected: no errors. `Shell` no longer imports `RightPanelSlot`; the file is gone; the agent panel/store are now orphaned (only self + their own tests reference them) and are deleted in Task 6.

- [ ] **Step 13: Commit**

```bash
git add apps/desktop/src/layout/useShellLayout.ts apps/desktop/src/layout/useShellLayout.test.ts apps/desktop/src/layout/IconStrip.tsx apps/desktop/src/layout/IconStrip.test.tsx apps/desktop/src/layout/Shell.tsx apps/desktop/src/layout/Shell.test.tsx apps/desktop/src/layout/Shell.timeline.test.tsx apps/desktop/src/layout/LeftOverlay.tsx apps/desktop/src/layout/RightPanelSlot.tsx
git commit -m "feat(shell): summoned-panel layout model — browser/inspector/terminal overlays, retire right panel"
```

---

### Task 6: Remove the retired Agent panel + verify

`RightPanelSlot.tsx` was already deleted in Task 5. This task removes the now-orphaned standalone Agent panel (the agent is the terminal — spec §8) after grep-confirming nothing else consumes it, then verifies the whole desktop suite.

**Files:**
- Delete (only if grep confirms no non-panel consumer): `apps/desktop/src/features/agent/AgentActivityPanel.tsx`, `AgentActivityPanel.test.tsx`, `agentActivityStore.ts`, `agentActivityStore.test.ts`

- [ ] **Step 1: Confirm `RightPanelSlot` is already gone**

Run: `git ls-files apps/desktop/src/layout/RightPanelSlot.tsx`
Expected: empty output (deleted in Task 5). Also `grep -rn "RightPanelSlot" apps/desktop/src` returns nothing.

- [ ] **Step 2: Confirm the agent panel + store are orphaned**

Run: `grep -rn "AgentActivityPanel\|agentActivityStore\|useAgentActivityStore" apps/desktop/src --include='*.ts' --include='*.tsx'`
Expected: only the four agent files reference each other; no import from `Shell` or elsewhere (RightPanelSlot, the former consumer, is gone). If a live consumer remains (e.g. a Tauri event wiring outside the panel), STOP and report — keep the store, delete only the panel + its test.

- [ ] **Step 3: Delete the orphaned files**

```bash
git rm apps/desktop/src/features/agent/AgentActivityPanel.tsx apps/desktop/src/features/agent/AgentActivityPanel.test.tsx apps/desktop/src/features/agent/agentActivityStore.ts apps/desktop/src/features/agent/agentActivityStore.test.ts
```

(If Step 2 found a live store consumer, `git rm` only the panel + its test, and leave the store.)

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc -b`
Expected: no errors.

- [ ] **Step 5: Full desktop suite**

Run: `pnpm vitest run apps/desktop`
Expected: PASS. Any test that imported the deleted agent/right-panel files is itself deleted in Step 3; no other test should reference them (Step 1–2 confirmed).

- [ ] **Step 6: Commit**

The `git rm` in Step 3 already staged the deletions. Commit them (do NOT `git add -A`):

```bash
git commit -m "chore(shell): remove standalone Agent panel (agent is the terminal)"
```

- [ ] **Step 7: Launch and eyeball (manual — controller/user)**

Run: `pnpm launch`. Confirm: rail sits beside the stage (no overlap), Observatory-cyan; canvas runs full-bleed; ⌘J toggles the bottom terminal; selecting a node opens the inspector overlay (pin keeps it); ⌘B toggles the floating browser with Graph/Files + filter; double-clicking a node opens the full-screen document reader; timeline still opens nodes.

---

## Self-Review

**Spec coverage (Phase 2 slice of `2026-07-03-instrument-shell-redesign-design.md`):**
- §5 summoned browser overlay (floats, dismiss/pin, project switcher + Graph/Files + filter) → Task 3 (+ float styling Task 4, toggle wiring Task 5). ✔ (dismiss-on-click-away is deferred to Phase 3 polish; ⌘B/rail toggle + close covers open/close.)
- §5 appear-on-select inspector (pin) → Tasks 2, 5 (`inspectorVisible`, `handleNodeSelect`). ✔
- §5 bottom terminal dock (⌘J, resize) → Tasks 1, 4, 5. ✔
- §8 terminal IS the agent (no separate agent panel) → Task 6 deletes `AgentActivityPanel`. ✔
- Rail full-bleed (Phase-1 carried geometry) → Task 4 flex-flow + restyle. ✔
- ⌘I/⌘J/⌘B true toggles (Phase-1 carried) → Task 5. ✔
- Retire `RightPanelSlot` → Tasks 5 (unmount) + 6 (delete). ✔
- Content/document home → interim `FullScreenReader` (double-click + timeline open); the first-class Reading lens is Phase 3, correctly out of scope. ✔

**Placeholder scan:** every code step contains complete code. No TBD/TODO. The one runtime nuance (terminal session re-init on dock reopen) is called out explicitly in Task 5 Step 7, not left implicit. ✔

**Type consistency:** `useShellLayout` return members defined in Task 5 Step 3 match the exact names consumed in Shell (Task 5 Step 7) and asserted in the hook test (Task 5 Step 1). `IconStrip` new props (Task 5 Step 5) match Shell's call site (Step 7) and the updated `IconStrip.test.tsx` (Step 6). `BottomDock`/`InspectorOverlay` prop names (Tasks 1–2) match Shell's usage (Step 7). CSS class names in Task 4 match those emitted by Tasks 1–3 components (`ishell-dock*`, `ishell-inspector*`, `.left-overlay`, `.lo-seg`, `.lo-filter`). ✔

**Ordering / green-at-every-commit:** Tasks 1–4 add new files / additive CSS / additive LeftOverlay props without breaking existing call sites (`LeftOverlay` new state is internal; its existing props unchanged). The hook-API break is confined to Task 5, where `useShellLayout` + `IconStrip` + `Shell` + their tests change together in one commit. `RightPanelSlot` is unmounted in Task 5 (still compiles as an orphaned file) and deleted in Task 6. ✔

**Known follow-through for Phase 3 (noted, not addressed here):** dismiss-browser-on-click-away; terminal session persistence across dock toggles; the Reading lens as the real document surface (replacing the `FullScreenReader` bridge); `data-active` string normalization across TransportBar/IconStrip.

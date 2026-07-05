# Instrument Shell — Phase 5: Deferred Items — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the bounded items deferred across the redesign: make the immersive full-screen reader distraction-free (while the in-stage reading lens keeps its edit/link affordances), rename `BottomDock`'s `title` prop to `label`, sweep the now-dead `.canvas-toolbar` CSS, and add a **timeline transport** — a scrub/play time-cursor plus a play-sequence button — to the timeline lens.

**Architecture:** The reader split reuses the existing `NodeReaderBody` with a new `affordances` flag (full screen passes `false` → bare `NodeDocumentPane`; the reading lens keeps the default `true` → `GraphDocumentContent`). The transport adds `cursorYear`/`playing` state to the existing timeline store, a presentational `TimelineTransport` bar, and a cursor line in `TimelineLens`; `TimelineLens` gains an optional `onPlaySequence` prop wired from the Shell to the existing sequence player.

**Tech Stack:** React 19, TypeScript, Vite, Zustand (`CanvasWorkspaceContext`, timeline vanilla store), Vitest + `@testing-library/react` (jsdom), Observatory CSS tokens.

**Series:** Follows the completed 4-phase redesign (merged to `main` at `9624b93`). Spec: `docs/superpowers/specs/2026-07-03-instrument-shell-redesign-design.md`.

**Explicitly NOT in this plan (bigger than a deferred cleanup):** mounting `ExportDialog` — there is no frontend export-invocation transport today (`ExportDialog.onExport` has nowhere to go; no `exportProject`/publish method exists in `desktop-api`). Wiring the static exporter end-to-end (transport method → Rust command → success feedback) is a feature in its own right and should be its own plan. Also deferred: richer transport behavior (dimming not-yet-reached events, snapping the cursor to events).

## Global Constraints

- Frontend tests via `pnpm vitest run <file>`; Rust none this phase. Type-check `pnpm exec tsc -b`.
- Test-first for every component and state change.
- Observatory palette: cyan `var(--ob-accent)` sole UI accent; amber reserved for archetypal lighting. The timeline **cursor** uses cyan; do not use amber for it.
- Canvas-package styles live in `packages/canvas` CSS or the desktop `timeline.css`/`styles.css` as the existing code does — follow the file each component already uses. The `.canvas-toolbar` sweep (Task 3) is the one intentional edit to `apps/desktop/src/styles.css`.
- **Dirty-tree staging rule:** working tree carries ~246 UNRELATED changes; stage ONLY each task's files by explicit path. NEVER `git add -A`/`.`/`commit -a`. (One dirty file, `packages/canvas/src/CanvasView.tsx`, is NOT touched by this phase; the timeline files are clean.)
- Preserve functionality: the reading lens keeps affordances; the timeline keeps lighting, zoom, pan, open-node; sequence playback unchanged.

---

## File Structure

**Modify:**
- `apps/desktop/src/features/viewer/NodeReaderBody.tsx` (+ its test) — `affordances` flag.
- `apps/desktop/src/layout/FullScreenReader.tsx` — pass `affordances={false}`.
- `apps/desktop/src/layout/BottomDock.tsx` (+ its test) — `title`→`label`.
- `apps/desktop/src/layout/Shell.tsx` — `BottomDock label=…`; pass `onPlaySequence` to `TimelineLens`.
- `apps/desktop/src/styles.css` — remove dead `.canvas-toolbar*` rules (Task 3 only).
- `packages/canvas/src/timeline/timelineStore.ts` (+ new/updated store test) — cursor/play state.
- `packages/canvas/src/timeline/TimelineLens.tsx` — cursor line + transport + `onPlaySequence` prop.
- `packages/canvas/src/index.ts` — export `TimelineTransport` if it needs to be public (it is internal to the canvas package; export only if a test imports it from the barrel).

**Create:**
- `packages/canvas/src/timeline/TimelineTransport.tsx` (+ `TimelineTransport.test.tsx`) — presentational transport bar.

---

### Task 1: Distraction-free full-screen reader (`affordances` flag)

**Files:**
- Modify: `apps/desktop/src/features/viewer/NodeReaderBody.tsx`
- Modify: `apps/desktop/src/features/viewer/NodeReaderBody.test.tsx`
- Modify: `apps/desktop/src/layout/FullScreenReader.tsx`

**Interfaces:**
- Produces: `NodeReaderBody({ node, affordances = true }: { node: CanvasNode; affordances?: boolean }): JSX.Element`. Graph-backed node + `affordances` → `GraphDocumentContent` (drop surface + link pickers); graph-backed node + `!affordances` → bare `NodeDocumentPane`; non-graph node → `NodeContentPane` (unchanged, both cases).

- [ ] **Step 1: Update the test (add the affordances branch)**

In `apps/desktop/src/features/viewer/NodeReaderBody.test.tsx`, add a `NodeDocumentPane` mock and a new assertion. Add alongside the existing mocks:

```tsx
vi.mock("./NodeDocumentPane", () => ({
  NodeDocumentPane: ({ graphNodeId }: { graphNodeId: string }) => (
    <div data-testid="bare-doc-pane">bare:{graphNodeId}</div>
  ),
}));
```

(The existing mock of `./GraphDocumentContent` renders `data-testid="doc-pane"`.) Add these cases:

```tsx
  it("renders GraphDocumentContent (affordances) for a graph node by default", () => {
    const node = { id: "n1", title: "T", type: "note", graphNodeId: "g-1" } as never;
    render(<NodeReaderBody node={node} />);
    expect(screen.getByTestId("doc-pane")).toHaveTextContent("doc:g-1");
    expect(screen.queryByTestId("bare-doc-pane")).not.toBeInTheDocument();
  });

  it("renders a bare document pane when affordances is false", () => {
    const node = { id: "n1", title: "T", type: "note", graphNodeId: "g-1" } as never;
    render(<NodeReaderBody node={node} affordances={false} />);
    expect(screen.getByTestId("bare-doc-pane")).toHaveTextContent("bare:g-1");
    expect(screen.queryByTestId("doc-pane")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm vitest run apps/desktop/src/features/viewer/NodeReaderBody.test.tsx`
Expected: FAIL — `affordances={false}` still renders `doc-pane` (GraphDocumentContent), no `bare-doc-pane`.

- [ ] **Step 3: Implement the flag**

In `apps/desktop/src/features/viewer/NodeReaderBody.tsx`:
- Add `import { NodeDocumentPane } from "./NodeDocumentPane";`
- Change the signature to `export function NodeReaderBody({ node, affordances = true }: { node: CanvasNode; affordances?: boolean })`.
- In the `if (graphNodeId)` branch, keep the existing `createWorkspaceTransport() as unknown as {...}` cast in a local const and render:

```tsx
  if (graphNodeId) {
    const transport = createWorkspaceTransport() as unknown as {
      readGraphNode: (input: { graphNodeId: string }) => Promise<GraphNode>;
      updateGraphNode: (input: { graphNodeId: string; patch: GraphNodePatch }) => Promise<GraphNode>;
    };
    return affordances
      ? <GraphDocumentContent graphNodeId={graphNodeId} transport={transport} />
      : <NodeDocumentPane graphNodeId={graphNodeId} transport={transport} />;
  }
```

(The `GraphNode`/`GraphNodePatch` type imports are already present for the cast.)

- [ ] **Step 4: Run — verify pass**

Run: `pnpm vitest run apps/desktop/src/features/viewer/NodeReaderBody.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Full-screen reader passes `affordances={false}`**

In `apps/desktop/src/layout/FullScreenReader.tsx`, change the `NodeMode` body from `<NodeReaderBody node={node} />` to `<NodeReaderBody node={node} affordances={false} />`. (The in-stage `ReadingLens` continues to render `<NodeReaderBody node={node} />` with the default `true` — do not touch it.)

- [ ] **Step 6: Type-check + focused suites**

Run: `pnpm exec tsc -b`
Expected: no errors.
Run: `pnpm vitest run apps/desktop/src/features/viewer apps/desktop/src/layout`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/features/viewer/NodeReaderBody.tsx apps/desktop/src/features/viewer/NodeReaderBody.test.tsx apps/desktop/src/layout/FullScreenReader.tsx
git commit -m "feat(viewer): distraction-free full-screen reader (affordances flag); lens keeps affordances"
```

---

### Task 2: Rename `BottomDock` `title` → `label`

**Files:**
- Modify: `apps/desktop/src/layout/BottomDock.tsx`
- Modify: `apps/desktop/src/layout/BottomDock.test.tsx`
- Modify: `apps/desktop/src/layout/Shell.tsx`

**Interfaces:**
- Produces: `BottomDock(props: { open; height; label: string; onClose; onResizeStart; children })` — the `title` prop is renamed `label` (avoids shadowing the native HTML `title` tooltip attribute). The rendered `.ishell-dock__title` element and its text are unchanged.

- [ ] **Step 1: Update the test**

In `apps/desktop/src/layout/BottomDock.test.tsx`, replace every `title=` prop on `<BottomDock>` with `label=`, and update the prop name in any inline props object. The text assertions (`getByText("Terminal · antichrist")` etc.) stay identical.

- [ ] **Step 2: Run — verify fail**

Run: `pnpm vitest run apps/desktop/src/layout/BottomDock.test.tsx`
Expected: FAIL — `label` not accepted / title still required (type error or missing text).

- [ ] **Step 3: Rename the prop**

In `apps/desktop/src/layout/BottomDock.tsx`, rename `title` to `label` in the `BottomDockProps` interface and the destructure, and render `{label}` in `.ishell-dock__title`. Nothing else changes.

- [ ] **Step 4: Update the Shell call site**

In `apps/desktop/src/layout/Shell.tsx`, change the `<BottomDock … title="Terminal · antichrist" …>` prop to `label="Terminal · antichrist"`.

- [ ] **Step 5: Run + type-check**

Run: `pnpm vitest run apps/desktop/src/layout/BottomDock.test.tsx apps/desktop/src/layout/Shell.test.tsx`
Expected: PASS.
Run: `pnpm exec tsc -b`
Expected: no errors (no other `BottomDock` call site exists).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/layout/BottomDock.tsx apps/desktop/src/layout/BottomDock.test.tsx apps/desktop/src/layout/Shell.tsx
git commit -m "refactor(shell): BottomDock title prop -> label (avoid native title shadowing)"
```

---

### Task 3: Sweep dead `.canvas-toolbar` CSS

The CanvasScreen toolbar was removed in Phase 4; its CSS is now unused.

**Files:**
- Modify: `apps/desktop/src/styles.css`

- [ ] **Step 1: Confirm the classes are unused in markup**

Run: `grep -rn "canvas-toolbar" apps/desktop/src packages --include='*.tsx'`
Expected: no matches in any `.tsx` (only the CSS file defines the rules). If a component still uses the class, STOP and report.

- [ ] **Step 2: Remove the rules**

In `apps/desktop/src/styles.css`, delete the rulesets for `.canvas-toolbar` and `.canvas-toolbar__group` (and any `.canvas-toolbar …` descendant selectors). Locate them with `grep -n "canvas-toolbar" apps/desktop/src/styles.css`. Remove only those rulesets; leave all other CSS intact. Do not remove `.canvas-chrome`, `.canvas-status`, `.canvas-footer`, or `.canvas-stage` (still used).

- [ ] **Step 3: Verify braces + build**

Run: `grep -c "^}" apps/desktop/src/styles.css` before and after is not required, but confirm the file still parses by running:
Run: `pnpm exec tsc -b`
Expected: no errors (CSS isn't type-checked, but this confirms nothing else broke).
Run: `pnpm vitest run apps/desktop/src/layout`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/styles.css
git commit -m "chore(styles): remove dead .canvas-toolbar rules (toolbar removed in phase 4)"
```

---

### Task 4: Timeline transport — cursor/play store state

**Files:**
- Modify: `packages/canvas/src/timeline/timelineStore.ts`
- Test: `packages/canvas/src/timeline/timelineStore.test.ts` (create if absent, else extend)

**Interfaces:**
- Produces: `TimelineStoreState` gains `cursorYear: number | null`, `playing: boolean`, `setCursorYear: (year: number | null) => void`, `setPlaying: (playing: boolean) => void`. Defaults: `cursorYear: null`, `playing: false`.

- [ ] **Step 1: Write the failing test**

Create (or append to) `packages/canvas/src/timeline/timelineStore.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createTimelineStore } from "./timelineStore";

describe("timeline transport state", () => {
  it("defaults cursorYear to null and playing to false", () => {
    const store = createTimelineStore();
    expect(store.getState().cursorYear).toBeNull();
    expect(store.getState().playing).toBe(false);
  });

  it("sets the cursor year", () => {
    const store = createTimelineStore();
    store.getState().setCursorYear(1789);
    expect(store.getState().cursorYear).toBe(1789);
    store.getState().setCursorYear(null);
    expect(store.getState().cursorYear).toBeNull();
  });

  it("toggles playing", () => {
    const store = createTimelineStore();
    store.getState().setPlaying(true);
    expect(store.getState().playing).toBe(true);
    store.getState().setPlaying(false);
    expect(store.getState().playing).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm vitest run packages/canvas/src/timeline/timelineStore.test.ts`
Expected: FAIL — `cursorYear`/`playing`/setters undefined.

- [ ] **Step 3: Add the state**

In `packages/canvas/src/timeline/timelineStore.ts`:
- Add to the `TimelineStoreState` interface: `cursorYear: number | null;`, `playing: boolean;`, `setCursorYear: (year: number | null) => void;`, `setPlaying: (playing: boolean) => void;`.
- In the store body, add initial `cursorYear: null,` and `playing: false,`, and the actions `setCursorYear: (year) => set({ cursorYear: year }),` and `setPlaying: (playing) => set({ playing }),`.

- [ ] **Step 4: Run — verify pass**

Run: `pnpm vitest run packages/canvas/src/timeline/timelineStore.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc -b`
Expected: no errors (existing `TimelineLens` doesn't reference the new fields yet).

- [ ] **Step 6: Commit**

```bash
git add packages/canvas/src/timeline/timelineStore.ts packages/canvas/src/timeline/timelineStore.test.ts
git commit -m "feat(timeline): cursor/play state on the timeline store"
```

---

### Task 5: `TimelineTransport` bar + cursor line + wiring

**Files:**
- Create: `packages/canvas/src/timeline/TimelineTransport.tsx`
- Test: `packages/canvas/src/timeline/TimelineTransport.test.tsx`
- Modify: `packages/canvas/src/timeline/TimelineLens.tsx`
- Modify: `apps/desktop/src/layout/Shell.tsx`

**Interfaces:**
- Produces: `TimelineTransport(props: { playing: boolean; onTogglePlay: () => void; fraction: number; onScrub: (fraction: number) => void; label: string; onPlaySequence?: () => void }): JSX.Element`. Renders `[data-testid="timeline-transport"]`, a play/pause button (accessible name `Play` / `Pause` reflecting `playing`), a range input (`[data-testid="timeline-scrub"]`, value = `fraction` in 0..1) that calls `onScrub` with the new fraction, the `label` (current instant), and — when `onPlaySequence` is given — a button `Play sequence`.
- `TimelineLens` gains an optional prop `onPlaySequence?: () => void`. It renders a cursor line at the projected x of `cursorYear` (when non-null) and the `TimelineTransport` at the bottom; scrubbing maps `fraction` → year across the current visible range via `pixelToYear(viewport, fraction * widthPx)`; play advances the cursor with `requestAnimationFrame`, stopping at the right edge.

- [ ] **Step 1: Write the failing TimelineTransport test**

Create `packages/canvas/src/timeline/TimelineTransport.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimelineTransport } from "./TimelineTransport";

function props(overrides = {}) {
  return { playing: false, onTogglePlay: vi.fn(), fraction: 0.25, onScrub: vi.fn(), label: "1789", onPlaySequence: vi.fn(), ...overrides };
}

describe("TimelineTransport", () => {
  it("shows Play when paused and toggles", () => {
    const p = props();
    render(<TimelineTransport {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(p.onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it("shows Pause when playing", () => {
    render(<TimelineTransport {...props({ playing: true })} />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("reports scrub changes as a 0..1 fraction", () => {
    const p = props();
    render(<TimelineTransport {...p} />);
    fireEvent.change(screen.getByTestId("timeline-scrub"), { target: { value: "0.5" } });
    expect(p.onScrub).toHaveBeenCalledWith(0.5);
  });

  it("shows the instant label and a play-sequence button", () => {
    const p = props();
    render(<TimelineTransport {...p} />);
    expect(screen.getByText("1789")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play sequence" }));
    expect(p.onPlaySequence).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm vitest run packages/canvas/src/timeline/TimelineTransport.test.tsx`
Expected: FAIL — cannot find module `./TimelineTransport`.

- [ ] **Step 3: Implement `TimelineTransport`**

Create `packages/canvas/src/timeline/TimelineTransport.tsx`:

```tsx
interface TimelineTransportProps {
  playing: boolean;
  onTogglePlay: () => void;
  fraction: number;
  onScrub: (fraction: number) => void;
  label: string;
  onPlaySequence?: () => void;
}

export function TimelineTransport({ playing, onTogglePlay, fraction, onScrub, label, onPlaySequence }: TimelineTransportProps) {
  return (
    <div className="timeline-transport" data-testid="timeline-transport">
      <button
        type="button"
        className="timeline-transport__play"
        aria-label={playing ? "Pause" : "Play"}
        onClick={onTogglePlay}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <input
        className="timeline-transport__scrub"
        data-testid="timeline-scrub"
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={fraction}
        onChange={(e) => onScrub(Number(e.target.value))}
      />
      <span className="timeline-transport__label">{label}</span>
      {onPlaySequence && (
        <button type="button" className="timeline-transport__sequence" onClick={onPlaySequence}>
          Play sequence
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm vitest run packages/canvas/src/timeline/TimelineTransport.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire into `TimelineLens`**

Read `packages/canvas/src/timeline/TimelineLens.tsx`. Then:
1. Import `TimelineTransport`, `yearToPixel`/`pixelToYear` from `./viewport`, and `useEffect`/`useRef` (already imported).
2. Add `onPlaySequence?: () => void` to `TimelineLensProps`; destructure it.
3. Read `state.cursorYear` / `state.playing` from the store.
4. Compute the visible year range from the viewport: `const vp = state.viewport(); const minYear = pixelToYear(vp, 0); const maxYear = pixelToYear(vp, vp.widthPx);`. `fraction = cursorYear == null ? 0 : clamp01((cursorYear - minYear) / (maxYear - minYear))`. `onScrub(f)` → `store.getState().setCursorYear(minYear + f * (maxYear - minYear))`.
5. Render, inside the track element (the same positioned container the nodes/axis live in), a cursor line when `cursorYear != null`: `<div className="timeline-cursor" style={{ left: `${yearToPixel(vp, cursorYear)}px` }} />`.
6. Render `<TimelineTransport playing={state.playing} onTogglePlay={() => store.getState().setPlaying(!state.playing)} fraction={fraction} onScrub={...} label={cursorYear == null ? "—" : String(Math.round(cursorYear))} onPlaySequence={onPlaySequence} />` at the bottom of the lens (outside/after the track, or absolutely positioned — match the existing layout container).
7. Play animation: in a `useEffect` keyed on `state.playing`, when playing, start a `requestAnimationFrame` loop that advances the cursor: on each frame compute `deltaYears = (yearsPerSecond) * dt` (use the rAF timestamp delta; `yearsPerSecond` = `(maxYear - minYear) / 8` for an ~8s sweep), call `store.getState().setCursorYear(min(next, maxYear))`, and when it reaches `maxYear` call `setPlaying(false)`. Initialise `cursorYear` to `minYear` when play starts from `null`. Cancel the frame on cleanup. Guard against `maxYear === minYear`.

Add a helper `clamp01` locally or inline. Keep the rAF loop self-cancelling and reduced-motion-agnostic (it's user-initiated playback, not ambient).

- [ ] **Step 6: Wire `onPlaySequence` from the Shell**

In `apps/desktop/src/layout/Shell.tsx`, pass the existing sequence trigger to the timeline: on the `<TimelineLens dataSource={…} onOpenNode={…} />`, add `onPlaySequence={handlePlaySequence}` (the Shell already has `handlePlaySequence = () => setFullScreenMode("sequence")`).

- [ ] **Step 7: Styles**

Add to `apps/desktop/src/layout/timeline.css` (the timeline stylesheet the lens already uses) — or `observatory.css` if the lens has no dedicated sheet — the cursor + transport styles:

```css
.timeline-cursor {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--ob-accent, #79c0d4);
  pointer-events: none;
  z-index: 5;
}
.timeline-transport {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  height: 40px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  background: var(--ob-float, #18202e);
  border: 1px solid var(--ob-line-3, #3a4e64);
  border-radius: 10px;
  z-index: 7;
}
.timeline-transport__play {
  width: 26px; height: 26px; border-radius: 50%;
  background: var(--ob-tint, rgba(121,192,212,0.12));
  color: var(--ob-accent, #79c0d4);
  border: 0; cursor: pointer;
}
.timeline-transport__scrub { flex: 1; accent-color: var(--ob-accent, #79c0d4); }
.timeline-transport__label { font-family: var(--ob-mono, ui-monospace); font-size: 11px; color: var(--ob-dim, #8797ab); min-width: 3ch; }
.timeline-transport__sequence {
  font-size: 11px; color: var(--ob-dim, #8797ab);
  background: transparent; border: 1px solid var(--ob-line-2, #2a3a4d);
  border-radius: 6px; padding: 4px 9px; cursor: pointer;
}
```

- [ ] **Step 8: Run tests + type-check**

Run: `pnpm vitest run packages/canvas/src/timeline`
Expected: PASS (transport, store, and existing timeline tests). If a test double for the store now needs `cursorYear`/`playing`, they exist on the real store; any component test that mocks the store must include them.
Run: `pnpm exec tsc -b`
Expected: no errors.
Run: `pnpm vitest run apps/desktop/src/layout`
Expected: PASS (Shell timeline test still green with the new `onPlaySequence` prop).

- [ ] **Step 9: Commit**

```bash
git add packages/canvas/src/timeline/TimelineTransport.tsx packages/canvas/src/timeline/TimelineTransport.test.tsx packages/canvas/src/timeline/TimelineLens.tsx apps/desktop/src/layout/Shell.tsx apps/desktop/src/layout/timeline.css
git commit -m "feat(timeline): scrub/play transport with time cursor and play-sequence"
```

---

### Task 6: Full verify + eyeball

- [ ] **Step 1: Type-check**

Run: `pnpm exec tsc -b`
Expected: no errors.

- [ ] **Step 2: Full frontend suites**

Run: `pnpm vitest run apps/desktop packages/canvas`
Expected: PASS.

- [ ] **Step 3: Launch and eyeball (manual — controller/user)**

Run `pnpm launch`. Confirm: the timeline lens shows a transport bar; play sweeps a cyan cursor left→right and stops at the end; dragging the scrub moves the cursor; "Play sequence" opens the sequence player. Full-screen reading a node (the ⤢ button in the reading lens) shows a bare document with no link pickers; the in-stage reading lens still shows the drop surface + link pickers. The terminal dock still labels correctly.

---

## Self-Review

**Coverage of the deferred list:**
- Fullscreen distraction-free (design decision: lens keeps affordances, fullscreen bare) → Task 1. ✔
- `BottomDock` `title`→`label` → Task 2. ✔
- Sweep `.canvas-toolbar` CSS → Task 3. ✔
- Timeline transport (scrub/play cursor + play-sequence) → Tasks 4–5. ✔
- `ExportDialog` mount → explicitly excluded (no export transport exists; needs its own plan). ✔
- Richer transport (event dimming/snapping) → explicitly deferred. ✔

**Placeholder scan:** every code step has complete code except Task 5 Step 5 (the `TimelineLens` integration), which is described precisely against the real store/viewport API (`viewport()`, `pixelToYear`, `yearToPixel`, `setCursorYear`, `setPlaying`) rather than pseudo-code — the implementer reads the file and wires the named calls. The rAF loop is the one piece that is behavioural prose, because its exact shape depends on the existing render container; it is bounded (self-cancelling, guarded, ~8s sweep). ✔

**Type consistency:** `NodeReaderBody`'s `affordances?: boolean` (Task 1) matches `FullScreenReader`'s `affordances={false}`. `BottomDock`'s `label` (Task 2) matches the Shell call site. Store fields `cursorYear`/`playing`/`setCursorYear`/`setPlaying` (Task 4) are consumed by `TimelineLens` (Task 5). `TimelineTransport` props (Task 5) match its test and the `TimelineLens` usage. `onPlaySequence?` added to `TimelineLensProps` matches the Shell's `handlePlaySequence`. ✔

**Green-at-every-commit:** Tasks 1–4 are independent and self-contained. Task 4 adds store state unused until Task 5 (compiles fine). Task 5 consumes it and adds the prop. No cross-task red window. ✔

**Note:** the Phase-1/2 "rail over stage" geometry concern is already resolved on `main` (Phase 2's `.ishell .icon-strip { position: relative; flex: 0 0 44px }` folds the rail into the flex flow) — no action needed here; confirm by grep if in doubt.

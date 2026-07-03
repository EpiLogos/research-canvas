# Instrument Shell — Phase 1: Foundation & Persistent Chrome — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the desktop app's outer shell with the Observatory instrument frame — a title bar, a thin transport bar carrying the three-lens segmented switch (Canvas / Timeline / Reading), a 44px verb rail, a full-width stage, and a thin status strip — plus the Observatory design-token layer. Existing panels stay reachable through the rail so the app keeps working; converting them to summoned overlays is Phase 2.

**Architecture:** A new root component tree (`ishell` classes) composes the frame independent of the legacy `.app-shell` grid, so there are no cascade fights. Lens state is lifted to a three-value hook that maps each lens to a stage surface. The floating `.lens-switch` buttons are deleted; lens switching lives in the new `TransportBar`. Design tokens land in a new `observatory.css` imported after `styles.css` so they win without editing the 3,456-line legacy stylesheet.

**Tech Stack:** React 19, TypeScript, Vite, Zustand (existing `CanvasWorkspaceContext`), Vitest + `@testing-library/react` (jsdom), CSS custom properties.

**Series:** This is Phase 1 of 4. It references the design spec `docs/superpowers/specs/2026-07-03-instrument-shell-redesign-design.md`. Phases 2–4 are separate plans written after this one lands.

## Global Constraints

- Rust tests (none in this phase) always run with `--test-threads=1`.
- Frontend tests run via `pnpm vitest run <file>`; type-check via `pnpm exec tsc -b`.
- Test-first for every component and state change (write failing test → verify fail → implement → verify pass → commit).
- Observatory palette is authoritative for new chrome. Cyan `#79c0d4` is the only UI accent; amber `#d0a24a` is reserved for the archetypal-lighting semantic (introduced in later phases — do not use it for generic UI here).
- Do not edit `styles.css`; all new styling goes in `apps/desktop/src/layout/observatory.css`.
- Keep existing `data-testid` values that other tests depend on unless a task explicitly changes them: `left-rail`, `canvas-pane`, `timeline-pane`, `right-panel`.
- Preserve all currently-working functionality (canvas, timeline, right panel tabs, left overlay). This phase reframes; it does not remove features.

---

## File Structure

**Create:**
- `apps/desktop/src/layout/observatory.css` — design tokens (`:root` custom properties) + `ishell*` layout classes.
- `apps/desktop/src/layout/TransportBar.tsx` — thin bar: three-lens segmented switch, breadcrumb, ⌘K affordance.
- `apps/desktop/src/layout/TransportBar.test.tsx`
- `apps/desktop/src/layout/StatusStrip.tsx` — thin status line (sync state, counts, register).
- `apps/desktop/src/layout/StatusStrip.test.tsx`
- `apps/desktop/src/layout/ReadingStub.tsx` — minimal reading surface so ⌘3 renders (real surface is Phase 3).

**Modify:**
- `apps/desktop/src/layout/useLensMode.ts` — three lenses + ⌘1/2/3 semantics.
- `apps/desktop/src/layout/useLensMode.test.ts` — cover three lenses.
- `apps/desktop/src/layout/IconStrip.tsx` — add Inspector + Terminal verbs, keep `left-rail` testid, widen summon callback (becomes the rail).
- `apps/desktop/src/layout/Shell.tsx` — recompose into the `ishell` frame; delete floating `.lens-switch`; add reading lens branch; wire transport + status strip.
- `apps/desktop/src/layout/Shell.test.tsx` — assert new frame regions and three-lens switching.
- `apps/desktop/src/layout/CanvasPane.tsx` — drop the `left: 26` offset (rail now lives outside the stage).
- `apps/desktop/src/main.tsx` — import `observatory.css` after `styles.css`.

---

### Task 1: Three-lens mode hook

**Files:**
- Modify: `apps/desktop/src/layout/useLensMode.ts`
- Test: `apps/desktop/src/layout/useLensMode.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type LensMode = "canvas" | "timeline" | "reading"`; `useLensMode(initial?: LensMode): { lens: LensMode; setLens: (l: LensMode) => void; cycleLens: () => void }`. `cycleLens` advances canvas → timeline → reading → canvas.

- [ ] **Step 1: Write the failing test**

Replace the contents of `apps/desktop/src/layout/useLensMode.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useLensMode } from "./useLensMode";

describe("useLensMode", () => {
  it("defaults to canvas", () => {
    const { result } = renderHook(() => useLensMode());
    expect(result.current.lens).toBe("canvas");
  });

  it("sets any of the three lenses", () => {
    const { result } = renderHook(() => useLensMode());
    act(() => result.current.setLens("reading"));
    expect(result.current.lens).toBe("reading");
    act(() => result.current.setLens("timeline"));
    expect(result.current.lens).toBe("timeline");
  });

  it("cycles canvas -> timeline -> reading -> canvas", () => {
    const { result } = renderHook(() => useLensMode());
    act(() => result.current.cycleLens());
    expect(result.current.lens).toBe("timeline");
    act(() => result.current.cycleLens());
    expect(result.current.lens).toBe("reading");
    act(() => result.current.cycleLens());
    expect(result.current.lens).toBe("canvas");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/desktop/src/layout/useLensMode.test.ts`
Expected: FAIL — `cycleLens` is not a function / `"reading"` not assignable.

- [ ] **Step 3: Write minimal implementation**

Replace the contents of `apps/desktop/src/layout/useLensMode.ts`:

```ts
import { useCallback, useState } from "react";

export type LensMode = "canvas" | "timeline" | "reading";

const ORDER: LensMode[] = ["canvas", "timeline", "reading"];

export function useLensMode(initial: LensMode = "canvas"): {
  lens: LensMode;
  setLens: (lens: LensMode) => void;
  cycleLens: () => void;
} {
  const [lens, setLens] = useState<LensMode>(initial);
  const cycleLens = useCallback(() => {
    setLens((current) => ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]);
  }, []);
  return { lens, setLens, cycleLens };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/desktop/src/layout/useLensMode.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/layout/useLensMode.ts apps/desktop/src/layout/useLensMode.test.ts
git commit -m "feat(shell): three-lens mode hook (canvas/timeline/reading)"
```

---

### Task 2: TransportBar component

**Files:**
- Create: `apps/desktop/src/layout/TransportBar.tsx`
- Test: `apps/desktop/src/layout/TransportBar.test.tsx`

**Interfaces:**
- Consumes: `LensMode` from Task 1.
- Produces: `TransportBar(props: { lens: LensMode; onSetLens: (l: LensMode) => void; breadcrumb?: string; onOpenPalette: () => void }): JSX.Element`. Renders a `[data-testid="transport-bar"]` container, three lens buttons each with `data-testid={"lens-" + id}` and `data-active`, and a palette button with accessible name `Do anything`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/layout/TransportBar.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TransportBar } from "./TransportBar";

describe("TransportBar", () => {
  it("renders the three lens options with the active one marked", () => {
    render(
      <TransportBar lens="timeline" onSetLens={() => {}} onOpenPalette={() => {}} />,
    );
    expect(screen.getByTestId("lens-canvas")).toHaveAttribute("data-active", "false");
    expect(screen.getByTestId("lens-timeline")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("lens-reading")).toHaveAttribute("data-active", "false");
  });

  it("calls onSetLens when a lens is clicked", () => {
    const onSetLens = vi.fn();
    render(<TransportBar lens="canvas" onSetLens={onSetLens} onOpenPalette={() => {}} />);
    fireEvent.click(screen.getByTestId("lens-reading"));
    expect(onSetLens).toHaveBeenCalledWith("reading");
  });

  it("calls onOpenPalette from the palette affordance", () => {
    const onOpenPalette = vi.fn();
    render(<TransportBar lens="canvas" onSetLens={() => {}} onOpenPalette={onOpenPalette} />);
    fireEvent.click(screen.getByRole("button", { name: "Do anything" }));
    expect(onOpenPalette).toHaveBeenCalledTimes(1);
  });

  it("shows the breadcrumb text when provided", () => {
    render(
      <TransportBar
        lens="canvas"
        onSetLens={() => {}}
        onOpenPalette={() => {}}
        breadcrumb="The Naked Face"
      />,
    );
    expect(screen.getByText("The Naked Face")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/desktop/src/layout/TransportBar.test.tsx`
Expected: FAIL — cannot find module `./TransportBar`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/desktop/src/layout/TransportBar.tsx`:

```tsx
import type { LensMode } from "./useLensMode";

interface TransportBarProps {
  lens: LensMode;
  onSetLens: (lens: LensMode) => void;
  breadcrumb?: string;
  onOpenPalette: () => void;
}

const LENSES: { id: LensMode; label: string }[] = [
  { id: "canvas", label: "Canvas" },
  { id: "timeline", label: "Timeline" },
  { id: "reading", label: "Reading" },
];

export function TransportBar({ lens, onSetLens, breadcrumb, onOpenPalette }: TransportBarProps) {
  return (
    <div className="ishell-transport" data-testid="transport-bar">
      <div className="ishell-lensswitch" role="tablist" aria-label="Lens">
        {LENSES.map((l) => (
          <button
            key={l.id}
            type="button"
            role="tab"
            data-testid={`lens-${l.id}`}
            data-active={lens === l.id ? "true" : "false"}
            aria-selected={lens === l.id}
            onClick={() => onSetLens(l.id)}
          >
            {l.label}
          </button>
        ))}
      </div>

      {breadcrumb ? <span className="ishell-breadcrumb">{breadcrumb}</span> : null}

      <span className="ishell-transport__spacer" />

      <button
        type="button"
        className="ishell-palette-affordance"
        aria-label="Do anything"
        onClick={onOpenPalette}
      >
        <kbd>⌘K</kbd>
        <span>Do anything</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/desktop/src/layout/TransportBar.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/layout/TransportBar.tsx apps/desktop/src/layout/TransportBar.test.tsx
git commit -m "feat(shell): TransportBar with three-lens switch and palette affordance"
```

---

### Task 3: StatusStrip component

**Files:**
- Create: `apps/desktop/src/layout/StatusStrip.tsx`
- Test: `apps/desktop/src/layout/StatusStrip.test.tsx`

**Interfaces:**
- Consumes: `LensMode` from Task 1.
- Produces: `StatusStrip(props: { synced: boolean; nodeCount: number; relationCount: number; lens: LensMode }): JSX.Element`. Renders `[data-testid="status-strip"]`. The register text is `"trans-temporal"` for canvas/reading and `"datable"` for timeline.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/layout/StatusStrip.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusStrip } from "./StatusStrip";

describe("StatusStrip", () => {
  it("shows counts and synced state", () => {
    render(<StatusStrip synced nodeCount={214} relationCount={340} lens="canvas" />);
    expect(screen.getByTestId("status-strip")).toBeVisible();
    expect(screen.getByText(/214 nodes/)).toBeInTheDocument();
    expect(screen.getByText(/340 relations/)).toBeInTheDocument();
    expect(screen.getByText(/synced/i)).toBeInTheDocument();
  });

  it("labels the register by lens", () => {
    const { rerender } = render(
      <StatusStrip synced nodeCount={0} relationCount={0} lens="canvas" />,
    );
    expect(screen.getByText(/trans-temporal/)).toBeInTheDocument();
    rerender(<StatusStrip synced nodeCount={0} relationCount={0} lens="timeline" />);
    expect(screen.getByText(/datable/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/desktop/src/layout/StatusStrip.test.tsx`
Expected: FAIL — cannot find module `./StatusStrip`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/desktop/src/layout/StatusStrip.tsx`:

```tsx
import type { LensMode } from "./useLensMode";

interface StatusStripProps {
  synced: boolean;
  nodeCount: number;
  relationCount: number;
  lens: LensMode;
}

export function StatusStrip({ synced, nodeCount, relationCount, lens }: StatusStripProps) {
  const register = lens === "timeline" ? "datable projection" : "trans-temporal";
  return (
    <footer className="ishell-status" data-testid="status-strip">
      <span className="ishell-status__sync" data-synced={synced ? "true" : "false"}>
        <i className="ishell-status__dot" />
        {synced ? "synced" : "offline"}
      </span>
      <span>{nodeCount} nodes · {relationCount} relations</span>
      <span className="ishell-status__register">{lens} · {register}</span>
    </footer>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/desktop/src/layout/StatusStrip.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/layout/StatusStrip.tsx apps/desktop/src/layout/StatusStrip.test.tsx
git commit -m "feat(shell): StatusStrip with counts and per-lens register"
```

---

### Task 4: Rail verbs (Inspector + Terminal) on IconStrip

**Files:**
- Modify: `apps/desktop/src/layout/IconStrip.tsx`
- Test: `apps/desktop/src/layout/IconStrip.test.tsx` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces: `IconStrip` gains two callbacks — `onOpenInspector: () => void` and `onOpenTerminal: () => void` — and renders rail buttons titled `Inspector` and `Terminal` in addition to the existing Files/Search/Sequences/Annotations/Settings. Keeps `data-testid="left-rail"`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/layout/IconStrip.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IconStrip } from "./IconStrip";

function setup(overrides: Partial<Parameters<typeof IconStrip>[0]> = {}) {
  const props = {
    leftOpen: false,
    activeLeftMode: "files" as const,
    onToggleLeft: vi.fn(),
    onSetLeftMode: vi.fn(),
    onOpenSequences: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenInspector: vi.fn(),
    onOpenTerminal: vi.fn(),
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
    expect(props.onOpenTerminal).toHaveBeenCalledTimes(1);
  });

  it("summons the inspector", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Inspector" }));
    expect(props.onOpenInspector).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/desktop/src/layout/IconStrip.test.tsx`
Expected: FAIL — no `Inspector` / `Terminal` buttons; props not accepted.

- [ ] **Step 3: Write minimal implementation**

In `apps/desktop/src/layout/IconStrip.tsx`, extend the props interface and add the two nav buttons. Replace the `IconStripProps` interface and the component signature, and add the buttons inside `.icon-strip__nav` after the mapped `NAV_ICONS`:

```tsx
interface IconStripProps {
  leftOpen: boolean;
  activeLeftMode: "files" | "search" | "annotations";
  onToggleLeft: () => void;
  onSetLeftMode: (mode: "files" | "search" | "annotations") => void;
  onOpenSequences: () => void;
  onOpenSettings: () => void;
  onOpenInspector: () => void;
  onOpenTerminal: () => void;
}
```

Change the component signature to destructure the new props:

```tsx
export function IconStrip({ leftOpen, activeLeftMode, onToggleLeft, onSetLeftMode, onOpenSequences, onOpenSettings, onOpenInspector, onOpenTerminal }: IconStripProps) {
```

Immediately after the `{NAV_ICONS.map(...)}` block (still inside `<div className="icon-strip__nav">`), add:

```tsx
        <button
          className="icon-strip__btn"
          title="Inspector"
          aria-label="Inspector"
          onClick={onOpenInspector}
          dangerouslySetInnerHTML={{
            __html: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="10" height="10" rx="2"/><line x1="8" y1="3" x2="8" y2="13"/></svg>`,
          }}
        />
        <button
          className="icon-strip__btn"
          title="Terminal"
          aria-label="Terminal"
          onClick={onOpenTerminal}
          dangerouslySetInnerHTML={{
            __html: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 5l3 3-3 3"/><line x1="8.5" y1="11" x2="12" y2="11"/></svg>`,
          }}
        />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/desktop/src/layout/IconStrip.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/layout/IconStrip.tsx apps/desktop/src/layout/IconStrip.test.tsx
git commit -m "feat(shell): add Inspector and Terminal verbs to the rail"
```

---

### Task 5: Observatory tokens + shell recomposition

This task assembles the frame: it creates the token/layout stylesheet, a reading stub, rewrites `Shell.tsx` to the `ishell` structure (deleting the floating `.lens-switch`), drops the canvas `left: 26` offset, wires everything, and updates `Shell.test.tsx`.

**Files:**
- Create: `apps/desktop/src/layout/observatory.css`
- Create: `apps/desktop/src/layout/ReadingStub.tsx`
- Modify: `apps/desktop/src/main.tsx`
- Modify: `apps/desktop/src/layout/CanvasPane.tsx`
- Modify: `apps/desktop/src/layout/Shell.tsx`
- Test: `apps/desktop/src/layout/Shell.test.tsx`

**Interfaces:**
- Consumes: `TransportBar` (Task 2), `StatusStrip` (Task 3), extended `IconStrip` (Task 4), three-lens `useLensMode` (Task 1).
- Produces: a `Shell` rendering `[data-testid="transport-bar"]`, `[data-testid="left-rail"]`, one of `[data-testid="canvas-pane"]` / `[data-testid="timeline-pane"]` / `[data-testid="reading-pane"]`, and `[data-testid="status-strip"]`.

- [ ] **Step 1: Write the failing test**

Replace the contents of `apps/desktop/src/layout/Shell.test.tsx`:

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

  it("switches the stage surface when a lens is chosen", () => {
    renderShell();
    fireEvent.click(screen.getByTestId("lens-timeline"));
    expect(screen.getByTestId("timeline-pane")).toBeVisible();
    fireEvent.click(screen.getByTestId("lens-reading"));
    expect(screen.getByTestId("reading-pane")).toBeVisible();
    fireEvent.click(screen.getByTestId("lens-canvas"));
    expect(screen.getByTestId("canvas-pane")).toBeVisible();
  });

  it("no longer renders the legacy floating lens switch", () => {
    renderShell();
    expect(screen.queryByTestId("lens-switch")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/desktop/src/layout/Shell.test.tsx`
Expected: FAIL — no `transport-bar` / `status-strip`; legacy `lens-switch` still present.

- [ ] **Step 3: Create the Observatory stylesheet**

Create `apps/desktop/src/layout/observatory.css`:

```css
/* Observatory design tokens — authoritative for the instrument shell. */
:root {
  --ob-bg: #090d13;
  --ob-bg-2: #0c1119;
  --ob-panel: #111825;
  --ob-panel-2: #16202f;
  --ob-float: #18202e;
  --ob-ink: #e4ebf4;
  --ob-dim: #8797ab;
  --ob-faint: #5a6a7d;
  --ob-line: #1b2634;
  --ob-line-2: #2a3a4d;
  --ob-line-3: #3a4e64;
  --ob-accent: #79c0d4;
  --ob-accent-deep: #3f7d90;
  --ob-tint: rgba(121, 192, 212, 0.12);
  --ob-amber: #d0a24a; /* archetypal-lighting semantic only */
  --ob-live: #5fb8a0;
  --ob-sans: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --ob-serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --ob-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}

/* Frame: a column of title-area(existing) / transport / body / status. */
.ishell {
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-rows: 34px minmax(0, 1fr) 24px;
  background: radial-gradient(130% 90% at 50% -10%, #10161f 0%, var(--ob-bg) 58%);
  color: var(--ob-ink);
  font-family: var(--ob-sans);
}

.ishell-transport {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 10px;
  background: var(--ob-bg-2);
  border-bottom: 1px solid var(--ob-line);
}
.ishell-lensswitch {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--ob-panel);
  border: 1px solid var(--ob-line-2);
  border-radius: 8px;
}
.ishell-lensswitch button {
  font: inherit;
  font-size: 11px;
  border: 0;
  background: transparent;
  color: var(--ob-dim);
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
}
.ishell-lensswitch button[data-active="true"] {
  background: var(--ob-tint);
  color: var(--ob-accent);
}
.ishell-breadcrumb { font-size: 11px; color: var(--ob-dim); }
.ishell-transport__spacer { flex: 1; }
.ishell-palette-affordance {
  display: flex;
  align-items: center;
  gap: 7px;
  font: inherit;
  font-size: 11px;
  color: var(--ob-dim);
  background: var(--ob-panel);
  border: 1px solid var(--ob-line-2);
  border-radius: 7px;
  padding: 3px 9px;
  cursor: pointer;
}
.ishell-palette-affordance kbd {
  font-family: var(--ob-mono);
  font-size: 10px;
  background: var(--ob-line-2);
  border-radius: 3px;
  padding: 1px 5px;
  color: var(--ob-ink);
}

/* Body: rail (44px) + stage (fills). Legacy panels still mount inside. */
.ishell-body { position: relative; display: flex; min-height: 0; }
.ishell-stage { position: relative; flex: 1; min-width: 0; overflow: hidden; }

/* Status */
.ishell-status {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 12px;
  background: var(--ob-panel);
  border-top: 1px solid var(--ob-line);
  font-family: var(--ob-mono);
  font-size: 9.5px;
  letter-spacing: 0.05em;
  color: var(--ob-faint);
}
.ishell-status__sync { display: flex; align-items: center; gap: 6px; }
.ishell-status__dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--ob-live); box-shadow: 0 0 6px var(--ob-live);
}
.ishell-status__sync[data-synced="false"] .ishell-status__dot {
  background: var(--ob-faint); box-shadow: none;
}
.ishell-status__register { margin-left: auto; }

/* Reading stub (Phase 3 replaces it) */
.ishell-reading-stub {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--ob-dim); font-family: var(--ob-serif); font-size: 15px;
}
```

- [ ] **Step 4: Create the reading stub**

Create `apps/desktop/src/layout/ReadingStub.tsx`:

```tsx
interface ReadingStubProps {
  title?: string;
}

export function ReadingStub({ title }: ReadingStubProps) {
  return (
    <section className="ishell-reading-stub" data-testid="reading-pane">
      {title ? `Reading — ${title}` : "Reading lens — select a node to read"}
    </section>
  );
}
```

- [ ] **Step 5: Import Observatory CSS after styles.css**

In `apps/desktop/src/main.tsx`, add the import directly below the existing `styles.css` import so it wins the cascade:

```tsx
import "./styles.css";
import "./layout/observatory.css";
import "./layout/timeline.css";
```

- [ ] **Step 6: Drop the canvas offset**

In `apps/desktop/src/layout/CanvasPane.tsx`, change the inline style so the pane fills the stage (the rail now lives outside the stage). Replace the `<section>` style attribute:

```tsx
    <section
      className="canvas-pane"
      data-testid="canvas-pane"
      style={{ position: "absolute", inset: 0 }}
    >
```

- [ ] **Step 7: Recompose Shell.tsx**

Replace the contents of `apps/desktop/src/layout/Shell.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { CanvasPane } from "./CanvasPane";
import { FullScreenReader } from "./FullScreenReader";
import { IconStrip } from "./IconStrip";
import { LeftOverlay } from "./LeftOverlay";
import { RightPanelSlot } from "./RightPanelSlot";
import { StatusStrip } from "./StatusStrip";
import { TransportBar } from "./TransportBar";
import { ReadingStub } from "./ReadingStub";
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

  const { lens, setLens, cycleLens } = useLensMode();
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
      setLens("reading");
    },
    [workspace, setLens],
  );

  const handleSetLeftMode = useCallback((mode: "files" | "search" | "annotations") => {
    setLeftMode(mode);
    layout.setLeftOpen(true);
  }, [layout]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setLeftMode("search");
        layout.setLeftOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        layout.openRightTab("terminal");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        layout.openRightTab("inspector");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        layout.toggleLeft();
      }
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
      if (!layout.rightOpen) {
        layout.openRightTab("inspector");
      }
    },
    [workspace, layout],
  );

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      workspace.selectNode(nodeId);
      setLens("reading");
    },
    [workspace, setLens],
  );

  const handlePlaySequence = useCallback(() => setFullScreenMode("sequence"), []);

  const selectedTitle = workspace.nodes.find((n) => n.id === workspace.selectedNodeId)?.title;

  return (
    <div className="ishell">
      <TransportBar
        lens={lens}
        onSetLens={setLens}
        breadcrumb={selectedTitle}
        onOpenPalette={() => {
          setLeftMode("search");
          layout.setLeftOpen(true);
        }}
      />

      <div className="ishell-body">
        <IconStrip
          leftOpen={layout.leftOpen}
          activeLeftMode={leftMode}
          onToggleLeft={layout.toggleLeft}
          onSetLeftMode={handleSetLeftMode}
          onOpenSequences={() => setSequencesOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenInspector={() => layout.openRightTab("inspector")}
          onOpenTerminal={() => layout.openRightTab("terminal")}
        />

        <div className="ishell-stage">
          <LeftOverlay
            open={layout.leftOpen}
            mode={leftMode}
            onResizeStart={layout.beginLeftResize}
            drawingMode={drawingMode}
            onToggleDrawing={() => setDrawingMode((v) => !v)}
            strokeColour={strokeColour}
            onSetStrokeColour={setStrokeColour}
          />

          {lens === "canvas" && (
            <CanvasPane
              onNodeSelect={handleNodeSelect}
              onNodeDoubleClick={handleNodeDoubleClick}
              onPlaySequence={handlePlaySequence}
              leftPanelOpen={layout.leftOpen}
              rightPanelOpen={layout.rightOpen}
              drawingMode={drawingMode}
              strokeColour={strokeColour}
            />
          )}

          {lens === "timeline" && (
            <section
              className="canvas-pane"
              data-testid="timeline-pane"
              style={{ position: "absolute", inset: 0 }}
            >
              <TimelineLens dataSource={timelineDataSource} onOpenNode={openNodeDocument} />
            </section>
          )}

          {lens === "reading" && <ReadingStub title={selectedTitle} />}

          <RightPanelSlot
            open={layout.rightOpen}
            activeTab={layout.rightTab}
            onTabChange={layout.openRightTab}
            onClose={() => layout.setRightOpen(false)}
            onResizeStart={layout.beginRightResize}
            onFullScreen={() => setFullScreenMode("node")}
          />

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

      {/* cycleLens reserved for a future palette command */}
      <span hidden aria-hidden onClick={cycleLens} />
    </div>
  );
}
```

- [ ] **Step 8: Run the Shell test to verify it passes**

Run: `pnpm vitest run apps/desktop/src/layout/Shell.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 9: Type-check the workspace**

Run: `pnpm exec tsc -b`
Expected: no errors. (If `workspace.nodes[].title` is not present on the node type, use `?.title` — it is already optional-safe via `find(...)?.title`.)

- [ ] **Step 10: Run the full desktop layout test suite**

Run: `pnpm vitest run apps/desktop/src/layout`
Expected: initially FAILS in `Shell.timeline.test.tsx`, which clicks the removed testid `lens-switch-timeline` (two occurrences, ~lines 86 and 95). Fix both: replace `screen.getByTestId("lens-switch-timeline")` with `screen.getByTestId("lens-timeline")`. The assertions on `timeline-lens` / `timeline-node-banda` are unchanged. Re-run; expected PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/desktop/src/layout/observatory.css apps/desktop/src/layout/ReadingStub.tsx apps/desktop/src/main.tsx apps/desktop/src/layout/CanvasPane.tsx apps/desktop/src/layout/Shell.tsx apps/desktop/src/layout/Shell.test.tsx apps/desktop/src/layout/Shell.timeline.test.tsx
git commit -m "feat(shell): Observatory instrument frame — transport, rail, stage, status, three lenses"
```

---

### Task 6: Verify the app boots in the new frame

**Files:** none (verification only).

- [ ] **Step 1: Type-check**

Run: `pnpm exec tsc -b`
Expected: no errors.

- [ ] **Step 2: Run the whole desktop frontend suite**

Run: `pnpm vitest run apps/desktop`
Expected: PASS. Any test still referencing the removed floating `lens-switch` or the old `StatusBar`/`bottom-dock` testid must be updated to the new testids (`lens-<id>`, `status-strip`). Fix, re-run, and include those edits in the commit below.

- [ ] **Step 3: Launch and eyeball**

Run: `pnpm launch` (or the project's dev command).
Confirm by eye: the app opens in the dark Observatory frame; the transport bar shows Canvas · Timeline · Reading; clicking each switches the stage (Reading shows the stub); the rail opens the left overlay / right panel; the status strip shows node/relation counts. No panel overlaps the transport bar or the status strip.

- [ ] **Step 4: Commit any test fixups**

```bash
git add -A
git commit -m "test(shell): update layout tests to the Observatory frame testids"
```

---

## Self-Review

**Spec coverage (Phase 1 slice of `2026-07-03-instrument-shell-redesign-design.md`):**
- §4 Observatory tokens → Task 5 (`observatory.css` `:root`). ✔
- §5 persistent chrome (title/transport/rail/status) → Tasks 2, 3, 4, 5. ✔ (Title area is the existing OS window chrome; a dedicated title bar row is deferred — the transport bar is the top row.)
- §5 stage full-width → Task 5 (`.ishell-stage`, canvas offset dropped). ✔
- §6 three lenses incl. Reading entry (lens switch + double-click) → Tasks 1, 5 (`handleNodeDoubleClick` → reading; ⌘3). ✔
- §9 ⌘K/⌘J/⌘I/⌘1-3 keyboard map → Task 5. ✔ (Full palette + context-menu grammar and toolbar removal are Phase 4, correctly out of this plan.)
- Summoned overlays, unified browser, terminal-as-agent → Phases 2–4, explicitly out of scope here. ✔

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The `cycleLens` reserved element is intentional and documented (avoids an unused-variable type error while keeping the API for Phase 4's palette). ✔

**Type consistency:** `LensMode` (`canvas|timeline|reading`) is defined in Task 1 and consumed identically in Tasks 2, 3, 5. `onOpenInspector`/`onOpenTerminal` defined in Task 4 match the call sites in Task 5's `Shell`. `openRightTab`/`setLeftOpen`/`toggleLeft` are existing `useShellLayout` members (unchanged). `StatusStrip` prop names (`synced`, `nodeCount`, `relationCount`, `lens`) match Task 3's definition. ✔

**Known follow-through:** `Shell.timeline.test.tsx` and any test using `bottom-dock`/`lens-switch` testids are updated in Tasks 5–6 as encountered. This is called out in-step rather than left implicit.

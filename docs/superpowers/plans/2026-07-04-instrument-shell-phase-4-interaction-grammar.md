# Instrument Shell — Phase 4: Interaction Grammar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the interaction grammar. Mount the existing (but never-wired) command palette on ⌘K with real commands (create note, switch lens, toggle terminal), and delete the redundant CanvasScreen toolbar so node creation and annotation happen through the palette, context menus, and direct manipulation instead of standing buttons.

**Architecture:** `useSearch` already produces file/node/command items; it's consumed only by the unmounted `CommandPalette`. This phase (1) reshapes `useSearch`'s command list to be driven by injected action callbacks, (2) forwards those callbacks through `CommandPalette`, (3) mounts `CommandPalette` in `Shell` on ⌘K (replacing the current "⌘K opens the browser search"), and (4) removes the CanvasScreen toolbar. The browser's own search (`SearchPanel`, via the rail search verb) is untouched.

**Tech Stack:** React 19, TypeScript, Vite, Zustand (`CanvasWorkspaceContext`), Vitest + `@testing-library/react` (jsdom), Observatory CSS tokens.

**Series:** Phase 4 of 4 (final). Builds on Phase 3 (merged at `b9e9af2`). Spec: `docs/superpowers/specs/2026-07-03-instrument-shell-redesign-design.md`. Explicitly out of scope / deferred to later focused efforts: the timeline transport (scrub/play — lighting already works), an `ExportDialog` mount (it isn't mounted today; the dead "Export project" palette command is removed rather than wired), and the `BottomDock` `title`→`label` rename (cosmetic).

## Global Constraints

- Frontend tests via `pnpm vitest run <file>`; type-check via `pnpm exec tsc -b`.
- Test-first for every state/logic change.
- Observatory palette: cyan `var(--ob-accent)` sole UI accent; amber reserved.
- Do NOT edit `apps/desktop/src/styles.css`; new CSS (if any) in `apps/desktop/src/layout/observatory.css`. The existing `.command-palette*` styles already live in `styles.css` — do not touch them.
- **Dirty-tree staging rule:** working tree carries ~246 UNRELATED changes; stage ONLY each task's files by explicit path. NEVER `git add -A`/`.`/`commit -a`. (Phase 4 touches no dirty file — the dirty set is episode assets + `tauri.conf.json` + `packages/canvas/src/CanvasView.tsx`.)
- Keep `data-testid`s: `transport-bar`, `left-rail`, `status-strip`, `canvas-pane`, `timeline-pane`, `reading-pane`, `left-overlay`, `bottom-dock`, `inspector-overlay`.
- Preserve functionality: node creation (now via canvas context menu / double-click / palette), annotation drawing (via rail annotate → annotations panel draw toggle), browser search (rail search verb → `SearchPanel`), canvas/timeline/reading/inspector/terminal.

---

## File Structure

**Modify:**
- `apps/desktop/src/features/search/useSearch.ts` (+ new `useSearch.test.ts`) — command list driven by injected actions.
- `apps/desktop/src/features/search/CommandPalette.tsx` (+ new `CommandPalette.test.tsx`) — forward command actions; drop dead `onOpenExport`.
- `apps/desktop/src/layout/Shell.tsx` (+ `Shell.test.tsx`) — mount palette on ⌘K; remove ⌘K→browser-search.
- `apps/desktop/src/features/canvas/CanvasScreen.tsx` — remove the toolbar.

---

### Task 1: Drive `useSearch` commands from injected actions

**Files:**
- Modify: `apps/desktop/src/features/search/useSearch.ts`
- Test: `apps/desktop/src/features/search/useSearch.test.ts` (create)

**Interfaces:**
- Produces: `useSearch(query: string, options?: { onSetLens?: (lens: "canvas" | "timeline" | "reading") => void; onToggleTerminal?: () => void }): SearchPaletteItem[]`. Command items: always "Create note"; plus "Go to Canvas/Timeline/Reading" when `onSetLens` is given; plus "Toggle terminal" when `onToggleTerminal` is given. The old `onOpenExport`/"Export project"/no-op "Focus terminal" commands are removed. File/node items and backend search are unchanged.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/features/search/useSearch.test.ts`:

```ts
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSearch } from "./useSearch";

const createNoteNode = vi.fn();
vi.mock("../canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => ({
    entries: [],
    nodes: [],
    createNoteNode,
    selectEntry: vi.fn(),
    selectNode: vi.fn(),
    selectProject: vi.fn(),
    searchProject: vi.fn().mockResolvedValue([]),
    projectId: "p1",
  }),
}));

function titles(query: string, options?: Parameters<typeof useSearch>[1]) {
  const { result } = renderHook(() => useSearch(query, options));
  return result.current.map((i) => i.title);
}

describe("useSearch command items", () => {
  it("always offers Create note", () => {
    expect(titles("create")).toContain("Create note");
  });

  it("offers lens commands only when onSetLens is provided", () => {
    expect(titles("go", {})).not.toContain("Go to Timeline");
    expect(titles("go", { onSetLens: vi.fn() })).toContain("Go to Timeline");
  });

  it("Toggle terminal command fires the injected action", () => {
    const onToggleTerminal = vi.fn();
    const { result } = renderHook(() => useSearch("terminal", { onToggleTerminal }));
    const cmd = result.current.find((i) => i.title === "Toggle terminal");
    expect(cmd).toBeDefined();
    cmd!.onSelect();
    expect(onToggleTerminal).toHaveBeenCalledTimes(1);
  });

  it("no longer offers the removed Export project command", () => {
    expect(titles("export", { onSetLens: vi.fn(), onToggleTerminal: vi.fn() })).not.toContain("Export project");
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm vitest run apps/desktop/src/features/search/useSearch.test.ts`
Expected: FAIL — "Go to Timeline"/"Toggle terminal" absent; "Export project" still present.

- [ ] **Step 3: Edit `useSearch.ts`**

Replace the `UseSearchOptions` interface:

```ts
interface UseSearchOptions {
  onSetLens?: (lens: "canvas" | "timeline" | "reading") => void;
  onToggleTerminal?: () => void;
}
```

Change the destructure `const { onOpenExport } = options;` to `const { onSetLens, onToggleTerminal } = options;`.

Replace the `commandItems` array (the three-item block with create-note/export/focus-terminal) with:

```ts
    const commandItems: SearchPaletteItem[] = [
      {
        id: "command:create-note",
        kind: "command",
        summary: "Create a new note node on the canvas",
        title: "Create note",
        onSelect: () => {
          void workspace.createNoteNode();
        },
      },
    ];

    if (onSetLens) {
      commandItems.push(
        { id: "command:lens-canvas", kind: "command", title: "Go to Canvas", summary: "Switch to the canvas lens", onSelect: () => onSetLens("canvas") },
        { id: "command:lens-timeline", kind: "command", title: "Go to Timeline", summary: "Switch to the timeline lens", onSelect: () => onSetLens("timeline") },
        { id: "command:lens-reading", kind: "command", title: "Go to Reading", summary: "Switch to the reading lens", onSelect: () => onSetLens("reading") },
      );
    }
    if (onToggleTerminal) {
      commandItems.push({ id: "command:toggle-terminal", kind: "command", title: "Toggle terminal", summary: "Show or hide the terminal dock", onSelect: () => onToggleTerminal() });
    }
```

In the `localItems` `useMemo` dependency array, replace `onOpenExport` with `onSetLens, onToggleTerminal`.

- [ ] **Step 4: Run — verify pass**

Run: `pnpm vitest run apps/desktop/src/features/search/useSearch.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc -b`
Expected: no errors. (If `CommandPalette.tsx` still passes `onOpenExport` to `useSearch`, that's fixed in Task 2 — but tsc may flag it now. If so, proceed straight to Task 2 before declaring tsc green, and run tsc at the end of Task 2. Note this in your report.)

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/features/search/useSearch.ts apps/desktop/src/features/search/useSearch.test.ts
git commit -m "feat(search): drive palette commands from injected actions (lens/terminal); drop dead export command"
```

---

### Task 2: Forward command actions through `CommandPalette`

**Files:**
- Modify: `apps/desktop/src/features/search/CommandPalette.tsx`
- Test: `apps/desktop/src/features/search/CommandPalette.test.tsx` (create)

**Interfaces:**
- Produces: `CommandPalette(props: { isOpen: boolean; onClose: () => void; onSetLens?: (lens: "canvas" | "timeline" | "reading") => void; onToggleTerminal?: () => void }): JSX.Element | null`. Returns `null` when `!isOpen`. Forwards `onSetLens`/`onToggleTerminal` to `useSearch`. The `onOpenExport` prop is removed.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/features/search/CommandPalette.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CommandPalette } from "./CommandPalette";

vi.mock("../canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => ({
    entries: [],
    nodes: [],
    createNoteNode: vi.fn(),
    selectEntry: vi.fn(),
    selectNode: vi.fn(),
    selectProject: vi.fn(),
    searchProject: vi.fn().mockResolvedValue([]),
    projectId: "p1",
  }),
}));

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    render(<CommandPalette isOpen={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
  });

  it("runs a lens command and closes", () => {
    const onSetLens = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette isOpen onClose={onClose} onSetLens={onSetLens} onToggleTerminal={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search workspace"), { target: { value: "timeline" } });
    fireEvent.click(screen.getByRole("button", { name: /Go to Timeline command/ }));
    expect(onSetLens).toHaveBeenCalledWith("timeline");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm vitest run apps/desktop/src/features/search/CommandPalette.test.tsx`
Expected: FAIL — `onSetLens` not forwarded (command absent) / type error on removed prop.

- [ ] **Step 3: Edit `CommandPalette.tsx`**

Replace the props interface and the two component signatures:

```tsx
interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSetLens?: (lens: "canvas" | "timeline" | "reading") => void;
  onToggleTerminal?: () => void;
}

export function CommandPalette({ isOpen, onClose, onSetLens, onToggleTerminal }: CommandPaletteProps) {
  if (!isOpen) {
    return null;
  }
  return <CommandPaletteDialog onClose={onClose} onSetLens={onSetLens} onToggleTerminal={onToggleTerminal} />;
}

function CommandPaletteDialog({
  onClose,
  onSetLens,
  onToggleTerminal,
}: Omit<CommandPaletteProps, "isOpen">) {
  const [query, setQuery] = useState("");
  const items = useSearch(query, { onSetLens, onToggleTerminal });
```

(The rest of `CommandPaletteDialog` — the Esc effect, the JSX, the `item.onSelect()` + `onClose()` click handler — is unchanged.)

- [ ] **Step 4: Run — verify pass + type-check**

Run: `pnpm vitest run apps/desktop/src/features/search/CommandPalette.test.tsx`
Expected: PASS (2 tests).
Run: `pnpm exec tsc -b`
Expected: no errors (Task 1's tsc concern resolves here).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/search/CommandPalette.tsx apps/desktop/src/features/search/CommandPalette.test.tsx
git commit -m "feat(search): forward lens/terminal command actions through CommandPalette"
```

---

### Task 3: Mount the palette on ⌘K in Shell

**Files:**
- Modify: `apps/desktop/src/layout/Shell.tsx`
- Modify: `apps/desktop/src/layout/Shell.test.tsx`

**Interfaces:**
- Consumes: `CommandPalette` (Task 2).
- Produces: ⌘K opens the command palette (a `[role="dialog"][aria-label="Command palette"]`); the TransportBar palette affordance also opens it; the old "⌘K sets browser search mode and opens the browser" behavior is removed.

- [ ] **Step 1: Write the failing test addition**

Add to `apps/desktop/src/layout/Shell.test.tsx` (inside the existing `describe`):

```tsx
  it("opens the command palette on Cmd+K", () => {
    renderShell();
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  });
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm vitest run apps/desktop/src/layout/Shell.test.tsx`
Expected: FAIL — no command-palette dialog on ⌘K.

- [ ] **Step 3: Edit `Shell.tsx`**

1. Import: `import { CommandPalette } from "../features/search/CommandPalette";`
2. Add state: `const [paletteOpen, setPaletteOpen] = useState(false);`
3. In the keyboard effect, replace the `if ((e.metaKey || e.ctrlKey) && e.key === "k") { … setLeftMode("search"); layout.setBrowserOpen(true); }` block with:

```tsx
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
```

4. Change the `TransportBar`'s `onOpenPalette` prop to `onOpenPalette={() => setPaletteOpen(true)}` (remove the old `setLeftMode("search"); layout.setBrowserOpen(true)` body).
5. Render the palette near the other top-level overlays (e.g. just before the closing `</div>` of `.ishell`, alongside `SettingsOverlay`):

```tsx
      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSetLens={setLens}
        onToggleTerminal={layout.toggleDock}
      />
```

- [ ] **Step 4: Run — verify pass + type-check**

Run: `pnpm vitest run apps/desktop/src/layout/Shell.test.tsx`
Expected: PASS (including the new ⌘K test).
Run: `pnpm exec tsc -b`
Expected: no errors. (If `setLeftMode` or `leftMode` becomes unused after removing the ⌘K search body, check: they're still used by the rail search/annotate verbs via `setBrowserMode` and the `LeftOverlay mode={leftMode}` prop — keep them.)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/layout/Shell.tsx apps/desktop/src/layout/Shell.test.tsx
git commit -m "feat(shell): mount command palette on Cmd+K (create/lens/terminal commands)"
```

---

### Task 4: Remove the CanvasScreen toolbar

**Files:**
- Modify: `apps/desktop/src/features/canvas/CanvasScreen.tsx`

**Interfaces:**
- Node creation and annotation drawing no longer have standing toolbar buttons. Creation happens via the canvas context menu / double-click / the palette "Create note" command; annotation via the rail annotate verb → annotations panel draw toggle (which drives the `drawingMode` prop). Annotation mode in `CanvasScreen` is driven solely by the `drawingMode` prop.

- [ ] **Step 1: Confirm no test asserts the toolbar strings**

Run: `grep -rn "Add note node\|Add resource node\|Draw annotation\|canvas-toolbar" apps/desktop/src --include='*.ts' --include='*.tsx'`
Expected: matches only in `CanvasScreen.tsx` (and possibly `styles.css`, which we do NOT edit). If a test asserts these labels, STOP and report — it must be updated too.

- [ ] **Step 2: Edit `CanvasScreen.tsx`**

1. Delete the entire `<header className="canvas-toolbar"> … </header>` block (the two `canvas-toolbar__group` divs with "Add note node", `WorkspaceFilePickerButton`, and "Draw annotation").
2. Remove the `localAnnotationMode` state and `setLocalAnnotationMode`, the `useEffect` that resets it, and change `const annotationMode = drawingMode || localAnnotationMode;` to `const annotationMode = drawingMode;`. Remove the `createAnnotation`'s `setLocalAnnotationMode(false)` call (it stays a `workspace.annotationStore…createStrokeAnnotation` call).
3. Remove the now-unused import `WorkspaceFilePickerButton` and any import (`useState`) left unused. Keep `useCallback`/`useEffect` if still used elsewhere in the file (verify with tsc).
4. Leave the `canvas-chrome` wrapper and the `errorMessage` status `<p>` intact (or keep the wrapper if it still holds the error status). The `CanvasView` render, footer, and all other props are unchanged.

- [ ] **Step 3: Type-check + focused suite**

Run: `pnpm exec tsc -b`
Expected: no errors (no unused vars/imports).
Run: `pnpm vitest run apps/desktop/src/layout apps/desktop/src/features/canvas`
Expected: PASS. The Shell/canvas tests render `CanvasScreen` (via `canvas-pane`) and must still pass; the annotation-count/testids are unaffected.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/features/canvas/CanvasScreen.tsx
git commit -m "refactor(canvas): remove redundant toolbar (create via context menu/palette, annotate via rail)"
```

---

### Task 5: Full verify + eyeball

- [ ] **Step 1: Type-check**

Run: `pnpm exec tsc -b`
Expected: no errors.

- [ ] **Step 2: Full desktop suite**

Run: `pnpm vitest run apps/desktop`
Expected: PASS.

- [ ] **Step 3: Launch and eyeball (manual — controller/user)**

Run `pnpm launch`. Confirm: ⌘K opens the command palette; typing "timeline" → "Go to Timeline" switches lens; "Create note" adds a node; "Toggle terminal" shows/hides the dock. The canvas no longer shows the top toolbar; right-click the canvas still creates nodes; the rail annotate verb still enables drawing. The browser's own search (rail search verb) still works.

---

## Self-Review

**Spec coverage (Phase 4 / §9 interaction grammar):**
- Command palette as the "do anything" channel (⌘K) → Tasks 1–3. ✔ (create node, switch lens, toggle terminal; export deferred — dialog not mounted.)
- Context menus remain the object-local channel (already built in `CanvasView`) — unchanged. ✔
- Direct manipulation (drag file→node, double-click→note) — unchanged. ✔
- Remove standing action buttons (the CanvasScreen toolbar) → Task 4. ✔
- Browser search stays reachable via the rail search verb (`SearchPanel`) — untouched. ✔

**Placeholder scan:** every code step has complete code. The one cross-task tsc timing note (Task 1 tsc may be red until Task 2 removes the `onOpenExport` call site) is called out explicitly, not left implicit. ✔

**Type consistency:** `useSearch(query, { onSetLens, onToggleTerminal })` options (Task 1) match `CommandPalette`'s forwarding (Task 2) and `Shell`'s props (Task 3). Lens union `"canvas" | "timeline" | "reading"` matches `setLens`'s `LensMode`. `CommandPalette` renders `[role="dialog"][aria-label="Command palette"]` (existing markup) which Task 3's Shell test queries. ✔

**Green-at-every-commit:** Task 1 may leave tsc momentarily red (the unmounted `CommandPalette` still passes `onOpenExport`); Task 2 resolves it in the very next commit and both are additive/behavior-neutral until Task 3 mounts the palette. Task 4 is an isolated deletion guarded by a grep for test dependencies. Acceptable for a 2-commit pair that lands together; noted in Task 1 Step 5.

**Deferred (documented):** timeline transport; `ExportDialog` mount + export command; `BottomDock` `title`→`label`; the Phase-3 design question (linking affordances inside immersive fullscreen).

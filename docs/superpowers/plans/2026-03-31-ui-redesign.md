# Research Canvas UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Codex-built shell with a canvas-dominant layout — overlay panels, adaptive nodes, full node CRUD, edge drawing via hover handles, content viewer in a right-panel slot, and a persistent terminal tab.

**Architecture:** The canvas fills the entire window minus a 26px icon strip and 20px status bar. Left and right panels are absolutely-positioned overlays that slide over the canvas without shrinking it. The right panel is a single resizable slot with three tabs (Inspector / Content / Terminal). All interaction surfaces (node CRUD, edge drawing, file search) are reached via right-click context menus or keyboard shortcuts — no persistent toolbars.

**Tech Stack:** React 18, TypeScript, @xyflow/react, Zustand, xterm.js, plain CSS (no CSS-in-JS, no Tailwind, no animation library — CSS transitions only)

---

## File Map

**Modified:**
- `apps/desktop/src/App.tsx` — remove NodeViewerScreen route; add FullScreenReader as shell-internal mode
- `apps/desktop/src/layout/Shell.tsx` — full rewrite: icon strip + canvas + overlay panels + status bar
- `apps/desktop/src/layout/useShellLayout.ts` — simplify: remove dock state, add `rightActiveTab`
- `apps/desktop/src/layout/CanvasPane.tsx` — pass keyboard handlers down
- `apps/desktop/src/layout/RightPanel.tsx` — replace entirely (new RightPanelSlot)
- `apps/desktop/src/layout/LeftRail.tsx` — replace entirely (new LeftOverlay)
- `packages/canvas/src/CanvasView.tsx` — add zoom listener, context menu, hover handles, shift+drag
- `packages/canvas/src/state/canvasStore.ts` — add deleteNode, duplicateNode, createGroupNode, updateNodeStyle, setSelectedNodeId
- `apps/desktop/src/features/terminal/useTerminal.ts` — module-level session cache for persistence
- `apps/desktop/src/features/terminal/TerminalPane.tsx` — remove header chrome (tab provides it)
- `packages/canvas/src/nodes/ResourceNode.tsx` — refactor to use AdaptiveNode
- `packages/canvas/src/nodes/NoteNode.tsx` — refactor to use AdaptiveNode
- `packages/canvas/src/nodes/GroupNode.tsx` — refactor to use AdaptiveNode
- `apps/desktop/src/styles.css` — add all new layout, panel, node, context-menu, and animation rules
- `packages/schema/src/node.ts` — add optional style fields to node schema

**Created:**
- `apps/desktop/src/layout/IconStrip.tsx`
- `apps/desktop/src/layout/StatusBar.tsx`
- `apps/desktop/src/layout/LeftOverlay.tsx`
- `apps/desktop/src/layout/RightPanelSlot.tsx`
- `apps/desktop/src/layout/FullScreenReader.tsx`
- `packages/canvas/src/nodes/AdaptiveNode.tsx`
- `packages/canvas/src/components/ContextMenu.tsx`
- `packages/canvas/src/components/FuzzyFilePicker.tsx`
- `apps/desktop/src/features/inspector/InspectorTab.tsx`
- `apps/desktop/src/features/viewer/ContentTab.tsx`

**Deleted:**
- `apps/desktop/src/layout/BottomDock.tsx`
- `apps/desktop/src/features/viewer/NodeViewerScreen.tsx` (functionality absorbed into ContentTab + FullScreenReader)

---

## Task 1: Simplify useShellLayout — remove dock, add right tab state

**Files:**
- Modify: `apps/desktop/src/layout/useShellLayout.ts`

- [ ] **Step 1: Replace the hook body**

Open `apps/desktop/src/layout/useShellLayout.ts` and replace its entire contents with:

```ts
import { useCallback, useRef, useState } from "react";

export type RightTab = "inspector" | "content" | "terminal";

const LEFT_MIN = 200;
const LEFT_MAX = 480;
const RIGHT_MIN = 280;
const RIGHT_MAX = 560;

export function useShellLayout() {
  const shellRef = useRef<HTMLDivElement>(null);

  const [leftOpen, setLeftOpen] = useState(false);
  const [leftWidth, setLeftWidth] = useState(240);

  const [rightOpen, setRightOpen] = useState(false);
  const [rightWidth, setRightWidth] = useState(320);
  const [rightTab, setRightTab] = useState<RightTab>("inspector");

  const openRightTab = useCallback((tab: RightTab) => {
    setRightTab(tab);
    setRightOpen(true);
  }, []);

  const toggleLeft = useCallback(() => setLeftOpen((v) => !v), []);
  const toggleRight = useCallback(() => setRightOpen((v) => !v), []);

  const beginLeftResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = leftWidth;
      const onMove = (ev: PointerEvent) => {
        const next = Math.min(LEFT_MAX, Math.max(LEFT_MIN, startW + ev.clientX - startX));
        setLeftWidth(next);
        if (next <= LEFT_MIN) setLeftOpen(false);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [leftWidth],
  );

  const beginRightResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = rightWidth;
      const onMove = (ev: PointerEvent) => {
        const delta = startX - ev.clientX;
        const next = Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, startW + delta));
        setRightWidth(next);
        if (next <= RIGHT_MIN) setRightOpen(false);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [rightWidth],
  );

  return {
    shellRef,
    leftOpen,
    leftWidth,
    setLeftOpen,
    toggleLeft,
    beginLeftResize,
    rightOpen,
    rightWidth,
    rightTab,
    setRightOpen,
    openRightTab,
    toggleRight,
    beginRightResize,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/admin/Documents/Antichrist Project"
pnpm exec tsc -b --noEmit 2>&1 | head -40
```

Expected: errors only from files that still import the old hook shape (Shell.tsx, etc.) — those will be fixed in later tasks. No errors inside `useShellLayout.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/layout/useShellLayout.ts
git commit -m "refactor(shell): simplify useShellLayout — remove dock, add rightTab"
```

---

## Task 2: Rebuild Shell.tsx — canvas-dominant with overlay panels

**Files:**
- Modify: `apps/desktop/src/layout/Shell.tsx`
- Modify: `apps/desktop/src/styles.css` (shell section)

- [ ] **Step 1: Rewrite Shell.tsx**

Replace the entire file:

```tsx
import { useEffect } from "react";
import { CanvasPane } from "./CanvasPane";
import { IconStrip } from "./IconStrip";
import { LeftOverlay } from "./LeftOverlay";
import { RightPanelSlot } from "./RightPanelSlot";
import { StatusBar } from "./StatusBar";
import { useShellLayout } from "./useShellLayout";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";

export function Shell() {
  const layout = useShellLayout();
  const workspace = useCanvasWorkspace();

  // ⌘K — command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // TODO wire to CommandPalette in Task 10
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "t") {
        e.preventDefault();
        layout.openRightTab("terminal");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        layout.toggleLeft();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [layout]);

  return (
    <div
      className="app-shell"
      ref={layout.shellRef}
      style={
        {
          "--left-width": `${layout.leftWidth}px`,
          "--right-width": `${layout.rightWidth}px`,
        } as React.CSSProperties
      }
    >
      <IconStrip
        leftOpen={layout.leftOpen}
        onToggleLeft={layout.toggleLeft}
        onOpenRightTab={layout.openRightTab}
      />

      <div className="shell-canvas-area">
        <LeftOverlay
          open={layout.leftOpen}
          onClose={() => layout.setLeftOpen(false)}
          onResizeStart={layout.beginLeftResize}
        />

        <CanvasPane
          onNodeSelect={(nodeId) => {
            workspace.setSelectedNode(nodeId);
            layout.openRightTab("inspector");
          }}
          onNodeDoubleClick={(nodeId) => {
            workspace.setSelectedNode(nodeId);
            layout.openRightTab("content");
          }}
        />

        <RightPanelSlot
          open={layout.rightOpen}
          activeTab={layout.rightTab}
          onTabChange={layout.openRightTab}
          onClose={() => layout.setRightOpen(false)}
          onResizeStart={layout.beginRightResize}
        />
      </div>

      <StatusBar workspace={workspace} />
    </div>
  );
}
```

- [ ] **Step 2: Add shell CSS to styles.css**

Append to `apps/desktop/src/styles.css`:

```css
/* ─── Shell skeleton ──────────────────────────────────── */
.app-shell {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #07070e;
  color: #c0c0e0;
}

.shell-canvas-area {
  flex: 1;
  position: relative;
  overflow: hidden;
  min-height: 0;
}
```

- [ ] **Step 3: Verify no runtime import errors**

```bash
pnpm exec tsc -b --noEmit 2>&1 | grep "Shell.tsx"
```

Expected: errors about missing `IconStrip`, `LeftOverlay`, `RightPanelSlot`, `StatusBar` — those don't exist yet. No syntax errors within Shell.tsx itself.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/layout/Shell.tsx apps/desktop/src/styles.css
git commit -m "refactor(shell): rebuild Shell.tsx with overlay panel structure"
```

---

## Task 3: IconStrip component

**Files:**
- Create: `apps/desktop/src/layout/IconStrip.tsx`
- Modify: `apps/desktop/src/styles.css`

- [ ] **Step 1: Create IconStrip.tsx**

```tsx
import type { RightTab } from "./useShellLayout";

interface IconStripProps {
  leftOpen: boolean;
  onToggleLeft: () => void;
  onOpenRightTab: (tab: RightTab) => void;
}

const NAV_ICONS: { id: string; label: string; svg: string }[] = [
  {
    id: "files",
    label: "Files & Project",
    svg: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M2 3h5l1.5 2H14v8H2z"/>
    </svg>`,
  },
  {
    id: "search",
    label: "Search",
    svg: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="7" cy="7" r="4"/><line x1="10.5" y1="10.5" x2="13" y2="13"/>
    </svg>`,
  },
  {
    id: "sequences",
    label: "Sequences",
    svg: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="4" cy="8" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="12" cy="12" r="2"/>
      <line x1="6" y1="7" x2="10" y2="5"/><line x1="6" y1="9" x2="10" y2="11"/>
    </svg>`,
  },
  {
    id: "annotate",
    label: "Annotations",
    svg: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M3 13 Q2 8 8 4 Q14 0 13 8 Q12 13 8 14z"/>
    </svg>`,
  },
];

export function IconStrip({ leftOpen, onToggleLeft, onOpenRightTab }: IconStripProps) {
  return (
    <aside className="icon-strip" aria-label="Navigation">
      <div className="icon-strip__nav">
        {NAV_ICONS.map((icon) => (
          <button
            key={icon.id}
            className="icon-strip__btn"
            data-active={icon.id === "files" && leftOpen ? "true" : undefined}
            title={icon.label}
            aria-label={icon.label}
            onClick={icon.id === "files" ? onToggleLeft : undefined}
            dangerouslySetInnerHTML={{ __html: icon.svg }}
          />
        ))}
      </div>
      <div className="icon-strip__bottom">
        <button
          className="icon-strip__btn"
          title="Settings"
          aria-label="Settings"
          dangerouslySetInnerHTML={{
            __html: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="8" cy="8" r="2.5"/>
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4"/>
            </svg>`,
          }}
        />
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Add icon strip CSS**

Append to `apps/desktop/src/styles.css`:

```css
/* ─── Icon strip ──────────────────────────────────────── */
.icon-strip {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 26px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: #0d0d1a;
  border-right: 1px solid #111128;
  z-index: 200;
  padding: 6px 0;
}

.icon-strip__nav,
.icon-strip__bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.icon-strip__btn {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  border-radius: 3px;
  cursor: pointer;
  color: #3a3a6e;
  padding: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 120ms ease, background 120ms ease;
}

.icon-strip__btn:hover {
  color: #9090c0;
  background: #1a1a30;
}

.icon-strip__btn[data-active="true"] {
  color: #7c6fff;
  background: #1e1a40;
}

.icon-strip__btn svg {
  width: 12px;
  height: 12px;
  pointer-events: none;
}
```

- [ ] **Step 3: Check compile**

```bash
pnpm exec tsc -b --noEmit 2>&1 | grep "IconStrip"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/layout/IconStrip.tsx apps/desktop/src/styles.css
git commit -m "feat(shell): add IconStrip component"
```

---

## Task 4: StatusBar component

**Files:**
- Create: `apps/desktop/src/layout/StatusBar.tsx`
- Modify: `apps/desktop/src/styles.css`

- [ ] **Step 1: Create StatusBar.tsx**

```tsx
interface StatusBarWorkspace {
  activeProject?: { name: string } | null;
  nodes?: { id: string }[];
  edges?: { id: string }[];
}

interface StatusBarProps {
  workspace: StatusBarWorkspace;
}

export function StatusBar({ workspace }: StatusBarProps) {
  const projectName = workspace.activeProject?.name ?? "No project";
  const nodeCount = workspace.nodes?.length ?? 0;
  const edgeCount = workspace.edges?.length ?? 0;

  return (
    <footer className="status-bar">
      <span className="status-bar__left">{projectName}</span>
      <span className="status-bar__centre">
        {nodeCount} nodes · {edgeCount} edges
      </span>
      <span className="status-bar__right">
        <kbd>⌘T</kbd> terminal · <kbd>⌘K</kbd> search
      </span>
    </footer>
  );
}
```

- [ ] **Step 2: Add status bar CSS**

Append to `apps/desktop/src/styles.css`:

```css
/* ─── Status bar ──────────────────────────────────────── */
.status-bar {
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  background: #080812;
  border-top: 1px solid #111128;
  font-size: 10px;
  color: #2e2e50;
  user-select: none;
}

.status-bar__centre {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.status-bar kbd {
  font-size: 9px;
  background: #111128;
  border: 1px solid #1e1e35;
  border-radius: 2px;
  padding: 0 3px;
  color: #3a3a60;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/layout/StatusBar.tsx apps/desktop/src/styles.css
git commit -m "feat(shell): add StatusBar component"
```

---

## Task 5: LeftOverlay — flat project/file panel

**Files:**
- Create: `apps/desktop/src/layout/LeftOverlay.tsx`
- Modify: `apps/desktop/src/styles.css`

- [ ] **Step 1: Create LeftOverlay.tsx**

```tsx
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";

interface LeftOverlayProps {
  open: boolean;
  onClose: () => void;
  onResizeStart: (e: React.PointerEvent) => void;
}

export function LeftOverlay({ open, onClose, onResizeStart }: LeftOverlayProps) {
  const workspace = useCanvasWorkspace();

  return (
    <aside className="left-overlay" data-open={open ? "true" : "false"} aria-hidden={!open}>
      <div className="left-overlay__inner">
        {/* Project selector */}
        <div className="lo-section">
          <div className="lo-section__header">
            <span className="lo-label">Project</span>
            <button className="lo-icon-btn" title="New project">+</button>
          </div>
          <div className="lo-project-name">
            {workspace.activeProject?.name ?? "No project selected"}
          </div>
        </div>

        {/* Canvas switcher */}
        <div className="lo-section">
          <div className="lo-section__header">
            <span className="lo-label">Canvas</span>
            <button className="lo-icon-btn" title="New canvas">+</button>
          </div>
          <div className="lo-canvas-list">
            {/* Placeholder — wire to workspace.canvases when available */}
            <div className="lo-canvas-item lo-canvas-item--active">Default Canvas</div>
          </div>
        </div>

        {/* Resource roots */}
        <div className="lo-section">
          <div className="lo-section__header">
            <span className="lo-label">Resource Folders</span>
            <button
              className="lo-icon-btn"
              title="Add folder from machine"
              onClick={async () => {
                // Tauri open dialog — wired when desktop-api is available
                // workspace.addResourceRoot(path)
              }}
            >
              +
            </button>
          </div>
          {workspace.resourceRoots?.length ? (
            workspace.resourceRoots.map((root: { id: string; path: string }) => (
              <div key={root.id} className="lo-root-row" title={root.path}>
                <span className="lo-root-icon">⊞</span>
                <span className="lo-root-path">{root.path.split("/").pop()}</span>
              </div>
            ))
          ) : (
            <div className="lo-empty">No folders added</div>
          )}
        </div>

        {/* File tree */}
        <div className="lo-section lo-section--grow">
          <div className="lo-section__header">
            <span className="lo-label">Files</span>
          </div>
          <div className="lo-file-list">
            {workspace.entries?.map((entry: { id: string; name: string; kind: string; path: string }) => (
              <div key={entry.id} className="lo-file-row">
                <span className="lo-file-icon">{entry.kind === "directory" ? "▸" : "·"}</span>
                <span className="lo-file-name">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Resize handle on right edge */}
      <div
        className="left-overlay__resize-handle"
        onPointerDown={onResizeStart}
        title="Drag to resize"
      />
    </aside>
  );
}
```

- [ ] **Step 2: Add left overlay CSS**

Append to `apps/desktop/src/styles.css`:

```css
/* ─── Left overlay ────────────────────────────────────── */
.left-overlay {
  position: absolute;
  top: 0;
  left: 26px;
  bottom: 0;
  width: var(--left-width, 240px);
  transform: translateX(calc(-100% - 26px));
  transition: transform 180ms ease-out;
  z-index: 100;
  display: flex;
  pointer-events: none;
}

.left-overlay[data-open="true"] {
  transform: translateX(0);
  pointer-events: auto;
}

.left-overlay__inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(10, 10, 22, 0.97);
  border-right: 1px solid #1a1a35;
  backdrop-filter: blur(12px);
  overflow: hidden;
}

.left-overlay__resize-handle {
  width: 5px;
  cursor: ew-resize;
  background: transparent;
  flex-shrink: 0;
}

.left-overlay__resize-handle:hover {
  background: rgba(124, 111, 255, 0.25);
}

.lo-section {
  padding: 8px 0 4px;
  border-bottom: 1px solid #111128;
}

.lo-section--grow {
  flex: 1;
  overflow-y: auto;
  border-bottom: none;
}

.lo-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px 4px;
}

.lo-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #3a3a6e;
}

.lo-icon-btn {
  background: none;
  border: none;
  color: #3a3a6e;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}

.lo-icon-btn:hover {
  color: #7c6fff;
}

.lo-project-name {
  padding: 2px 10px 4px;
  font-size: 11px;
  color: #9090c0;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lo-canvas-item {
  padding: 3px 10px;
  font-size: 10px;
  color: #5a5a90;
  cursor: pointer;
  border-radius: 3px;
  margin: 0 6px 1px;
}

.lo-canvas-item:hover,
.lo-canvas-item--active {
  color: #9090c0;
  background: #141428;
}

.lo-root-row,
.lo-file-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  font-size: 10px;
  color: #5a5a90;
  height: 22px;
  cursor: default;
}

.lo-root-row:hover,
.lo-file-row:hover {
  color: #9090c0;
  background: #0e0e20;
}

.lo-root-icon,
.lo-file-icon {
  font-size: 9px;
  color: #3a3a6e;
  width: 10px;
  flex-shrink: 0;
}

.lo-root-path,
.lo-file-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lo-empty {
  padding: 3px 10px;
  font-size: 10px;
  color: #2e2e50;
  font-style: italic;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/layout/LeftOverlay.tsx apps/desktop/src/styles.css
git commit -m "feat(shell): add LeftOverlay — flat project/file panel"
```

---

## Task 6: RightPanelSlot — Inspector / Content / Terminal tabs

**Files:**
- Create: `apps/desktop/src/layout/RightPanelSlot.tsx`
- Create: `apps/desktop/src/features/inspector/InspectorTab.tsx`
- Create: `apps/desktop/src/features/viewer/ContentTab.tsx`
- Modify: `apps/desktop/src/styles.css`

- [ ] **Step 1: Create InspectorTab.tsx**

```tsx
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";

export function InspectorTab() {
  const workspace = useCanvasWorkspace();
  const node = workspace.selectedNode;

  if (!node) {
    return (
      <div className="inspector-empty">
        <p>Select a node to inspect it</p>
      </div>
    );
  }

  return (
    <div className="inspector-tab">
      <div className="inspector-field">
        <label className="inspector-label">Title</label>
        <div className="inspector-value">{node.title}</div>
      </div>
      <div className="inspector-field">
        <label className="inspector-label">Type</label>
        <div className="inspector-value inspector-value--type">{node.type}</div>
      </div>
      {node.absolutePath && (
        <div className="inspector-field">
          <label className="inspector-label">File</label>
          <div className="inspector-value inspector-value--path" title={node.absolutePath}>
            {node.absolutePath.split("/").pop()}
          </div>
        </div>
      )}
      <div className="inspector-field">
        <label className="inspector-label">Connections</label>
        <div className="inspector-value">
          {workspace.edges?.filter(
            (e: { source: string; target: string }) =>
              e.source === node.id || e.target === node.id,
          ).length ?? 0} edges
        </div>
      </div>

      {/* Style controls — wired in Task 14 */}
      <div className="inspector-section-title">Appearance</div>
      <div className="inspector-colours" data-placeholder="wired-task-14" />
    </div>
  );
}
```

- [ ] **Step 2: Create ContentTab.tsx**

```tsx
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";

interface ContentTabProps {
  onFullScreen: () => void;
}

export function ContentTab({ onFullScreen }: ContentTabProps) {
  const workspace = useCanvasWorkspace();
  const node = workspace.selectedNode;

  if (!node) {
    return <div className="content-tab-empty">No node selected</div>;
  }

  const kind = node.resourceKind ?? "text";

  return (
    <div className="content-tab">
      <div className="content-tab__toolbar">
        <span className="content-tab__title">{node.title}</span>
        <button
          className="content-tab__fullscreen-btn"
          onClick={onFullScreen}
          title="Full screen (double-click)"
        >
          ⤢
        </button>
      </div>
      <div className="content-tab__body">
        {kind === "markdown" && node.renderedHtml ? (
          <div
            className="content-tab__markdown"
            dangerouslySetInnerHTML={{ __html: node.renderedHtml }}
          />
        ) : kind === "image" && node.absolutePath ? (
          <img
            className="content-tab__image"
            src={`asset://localhost/${node.absolutePath}`}
            alt={node.title}
          />
        ) : node.type === "note" ? (
          <textarea
            className="content-tab__note-editor"
            defaultValue={node.content ?? ""}
            placeholder="Write a note…"
            onBlur={(e) => workspace.updateNodeContent?.(node.id, e.target.value)}
          />
        ) : (
          <div className="content-tab__placeholder">
            {node.absolutePath ?? "No content attached"}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create RightPanelSlot.tsx**

```tsx
import { TerminalPane } from "../features/terminal/TerminalPane";
import { ContentTab } from "../features/viewer/ContentTab";
import { InspectorTab } from "../features/inspector/InspectorTab";
import type { RightTab } from "./useShellLayout";

interface RightPanelSlotProps {
  open: boolean;
  activeTab: RightTab;
  onTabChange: (tab: RightTab) => void;
  onClose: () => void;
  onResizeStart: (e: React.PointerEvent) => void;
  onFullScreen?: () => void;
}

const TABS: { id: RightTab; label: string }[] = [
  { id: "inspector", label: "Inspector" },
  { id: "content", label: "Content" },
  { id: "terminal", label: "Terminal" },
];

export function RightPanelSlot({
  open,
  activeTab,
  onTabChange,
  onClose,
  onResizeStart,
  onFullScreen,
}: RightPanelSlotProps) {
  return (
    <aside className="right-panel-slot" data-open={open ? "true" : "false"} aria-hidden={!open}>
      {/* Resize handle on left edge */}
      <div
        className="right-panel-slot__resize-handle"
        onPointerDown={onResizeStart}
        title="Drag to resize"
      />

      <div className="right-panel-slot__inner">
        {/* Tab bar */}
        <div className="rps-tabbar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className="rps-tab"
              data-active={activeTab === tab.id ? "true" : "false"}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
          <button className="rps-close" onClick={onClose} title="Close panel">
            ✕
          </button>
        </div>

        {/* Tab content — Terminal always mounted so session persists */}
        <div className="rps-body">
          <div className="rps-pane" data-visible={activeTab === "inspector" ? "true" : "false"}>
            <InspectorTab />
          </div>
          <div className="rps-pane" data-visible={activeTab === "content" ? "true" : "false"}>
            <ContentTab onFullScreen={onFullScreen ?? (() => {})} />
          </div>
          <div className="rps-pane" data-visible={activeTab === "terminal" ? "true" : "false"}>
            <TerminalPane />
          </div>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Add right panel CSS**

Append to `apps/desktop/src/styles.css`:

```css
/* ─── Right panel slot ────────────────────────────────── */
.right-panel-slot {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: var(--right-width, 320px);
  transform: translateX(100%);
  transition: transform 180ms ease-out;
  z-index: 100;
  display: flex;
  pointer-events: none;
}

.right-panel-slot[data-open="true"] {
  transform: translateX(0);
  pointer-events: auto;
}

.right-panel-slot__resize-handle {
  width: 5px;
  cursor: ew-resize;
  background: transparent;
  flex-shrink: 0;
}

.right-panel-slot__resize-handle:hover {
  background: rgba(124, 111, 255, 0.25);
}

.right-panel-slot__inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(10, 10, 22, 0.97);
  border-left: 1px solid #1a1a35;
  backdrop-filter: blur(12px);
  overflow: hidden;
  min-width: 0;
}

.rps-tabbar {
  display: flex;
  align-items: center;
  height: 28px;
  border-bottom: 1px solid #111128;
  flex-shrink: 0;
}

.rps-tab {
  height: 100%;
  padding: 0 12px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: 10px;
  color: #3a3a6e;
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease;
}

.rps-tab:hover {
  color: #7070a0;
}

.rps-tab[data-active="true"] {
  color: #9090d0;
  border-bottom-color: #7c6fff;
}

.rps-close {
  margin-left: auto;
  margin-right: 6px;
  background: none;
  border: none;
  color: #2e2e50;
  font-size: 11px;
  cursor: pointer;
  padding: 0 4px;
}

.rps-close:hover {
  color: #6060a0;
}

.rps-body {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.rps-pane {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}

.rps-pane[data-visible="true"] {
  opacity: 1;
  pointer-events: auto;
}

/* Inspector tab */
.inspector-empty {
  padding: 20px 12px;
  font-size: 11px;
  color: #2e2e50;
  text-align: center;
}

.inspector-tab {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.inspector-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.inspector-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #2e2e50;
}

.inspector-value {
  font-size: 11px;
  color: #9090c0;
  background: #0a0a1a;
  border: 1px solid #1a1a35;
  border-radius: 3px;
  padding: 4px 7px;
}

.inspector-value--type {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #5555a0;
}

.inspector-value--path {
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-section-title {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #2e2e50;
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid #111128;
}

/* Content tab */
.content-tab-empty {
  padding: 20px 12px;
  font-size: 11px;
  color: #2e2e50;
  text-align: center;
}

.content-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.content-tab__toolbar {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  border-bottom: 1px solid #111128;
  gap: 8px;
  flex-shrink: 0;
}

.content-tab__title {
  font-size: 11px;
  color: #7070a0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.content-tab__fullscreen-btn {
  background: none;
  border: none;
  color: #3a3a6e;
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
}

.content-tab__fullscreen-btn:hover {
  color: #7c6fff;
}

.content-tab__body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
}

.content-tab__markdown {
  font-size: 12px;
  line-height: 1.7;
  color: #a0a0c0;
}

.content-tab__markdown h1,
.content-tab__markdown h2,
.content-tab__markdown h3 {
  color: #c0c0e0;
  margin: 16px 0 6px;
}

.content-tab__markdown code {
  background: #0a0a1a;
  padding: 1px 4px;
  border-radius: 2px;
  font-size: 10px;
  color: #6688cc;
}

.content-tab__image {
  max-width: 100%;
  height: auto;
  border-radius: 3px;
}

.content-tab__note-editor {
  width: 100%;
  height: calc(100% - 10px);
  background: transparent;
  border: none;
  color: #a0a0c0;
  font-size: 12px;
  line-height: 1.7;
  resize: none;
  outline: none;
  font-family: inherit;
}

.content-tab__placeholder {
  font-size: 11px;
  color: #2e2e50;
  font-family: monospace;
}
```

- [ ] **Step 5: Check compile**

```bash
pnpm exec tsc -b --noEmit 2>&1 | grep -E "(RightPanelSlot|InspectorTab|ContentTab)"
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/layout/RightPanelSlot.tsx \
        apps/desktop/src/features/inspector/InspectorTab.tsx \
        apps/desktop/src/features/viewer/ContentTab.tsx \
        apps/desktop/src/styles.css
git commit -m "feat(shell): add RightPanelSlot with Inspector/Content/Terminal tabs"
```

---

## Task 7: Terminal persistence — PTY session survives panel close

**Files:**
- Modify: `apps/desktop/src/features/terminal/useTerminal.ts`
- Modify: `apps/desktop/src/features/terminal/TerminalPane.tsx`
- Modify: `apps/desktop/src/styles.css`

The problem: `useTerminal` currently creates a new session on mount. When the Terminal tab is hidden (not unmounted — see Task 6 where all panes are always mounted), xterm.js still needs its DOM container. The `rps-pane` approach keeps the DOM node alive, so the terminal already persists as long as the panel is open. But we need the PTY session to survive the panel being _closed_ (fully unmounted).

The solution: lift the active session ID into a module-level cache so a remounting hook reconnects to the existing session instead of creating a new one.

- [ ] **Step 1: Add session cache to useTerminal.ts**

Open `apps/desktop/src/features/terminal/useTerminal.ts`. Find the top of the file (after imports) and add a module-level cache before the hook definition:

```ts
// Module-level session cache: survives component unmount
const _sessionCache: Map<string, { sessionId: string; transcript: string }> = new Map();
const DEFAULT_CACHE_KEY = "default";
```

- [ ] **Step 2: Update session creation logic in useTerminal**

Inside the hook's `useEffect` that creates the session, change the session creation to check the cache first:

```ts
// Before (creates new session every time):
const session = await transport.createSession();

// After (reuse cached session if available):
const cached = _sessionCache.get(DEFAULT_CACHE_KEY);
let sessionId: string;
if (cached) {
  sessionId = cached.sessionId;
  setTranscript(cached.transcript);
} else {
  const session = await transport.createSession();
  sessionId = session.id;
  _sessionCache.set(DEFAULT_CACHE_KEY, { sessionId, transcript: "" });
}
```

- [ ] **Step 3: Update transcript save in useTerminal**

Find where transcript is updated in the output listener and also save it to the cache:

```ts
// After the existing setTranscript call, add:
_sessionCache.set(DEFAULT_CACHE_KEY, {
  sessionId: currentSessionId,
  transcript: newTranscript,
});
```

- [ ] **Step 4: Strip chrome from TerminalPane.tsx**

The tab bar in RightPanelSlot provides all the chrome. Remove the header from TerminalPane so it's just the xterm viewport:

```tsx
export function TerminalPane() {
  const { error, terminalContainerRef } = useTerminal();

  return (
    <section className="terminal-pane">
      {error && <p className="terminal-pane__error">{error}</p>}
      <div className="terminal-pane__viewport" ref={terminalContainerRef} />
    </section>
  );
}
```

- [ ] **Step 5: Update terminal pane CSS**

In `apps/desktop/src/styles.css`, find `.terminal-pane` and ensure it fills its container:

```css
/* ─── Terminal pane ───────────────────────────────────── */
.terminal-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #050508;
}

.terminal-pane__viewport {
  flex: 1;
  min-height: 0;
  padding: 4px;
}

.terminal-pane__error {
  padding: 6px 10px;
  font-size: 10px;
  color: #e74c3c;
  background: #1a0808;
  border-bottom: 1px solid #2a1010;
  margin: 0;
}
```

- [ ] **Step 6: Compile check**

```bash
pnpm exec tsc -b --noEmit 2>&1 | grep "useTerminal"
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/features/terminal/useTerminal.ts \
        apps/desktop/src/features/terminal/TerminalPane.tsx \
        apps/desktop/src/styles.css
git commit -m "feat(terminal): persist PTY session across panel close/reopen"
```

---

## Task 8: Adaptive node rendering — dot → pill → card by zoom

**Files:**
- Create: `packages/canvas/src/nodes/AdaptiveNode.tsx`
- Modify: `packages/canvas/src/nodes/ResourceNode.tsx`
- Modify: `packages/canvas/src/nodes/NoteNode.tsx`
- Modify: `packages/canvas/src/nodes/GroupNode.tsx`
- Modify: `packages/canvas/src/CanvasView.tsx`
- Modify: `apps/desktop/src/styles.css`

- [ ] **Step 1: Create AdaptiveNode.tsx**

```tsx
import { useViewport } from "@xyflow/react";

export type ZoomLevel = "dot" | "pill" | "card";

function getZoomLevel(zoom: number): ZoomLevel {
  if (zoom < 0.4) return "dot";
  if (zoom < 0.8) return "pill";
  return "card";
}

export interface AdaptiveNodeStyle {
  dotColour?: string;
  bgColour?: string;
  textColour?: string;
  thumbnail?: string;
}

interface AdaptiveNodeProps {
  nodeType: "resource" | "note" | "group" | "portal";
  title: string;
  summary?: string;
  selected?: boolean;
  style?: AdaptiveNodeStyle;
}

export function AdaptiveNode({ nodeType, title, summary, selected, style }: AdaptiveNodeProps) {
  const { zoom } = useViewport();
  const level = getZoomLevel(zoom);

  const dotColour = style?.dotColour ?? defaultDotColour(nodeType);
  const bgColour = style?.bgColour;
  const textColour = style?.textColour;

  return (
    <div
      className={`adaptive-node adaptive-node--${level}`}
      data-type={nodeType}
      data-selected={selected ? "true" : undefined}
      style={
        {
          "--dot-colour": dotColour,
          "--node-bg": bgColour,
          "--node-text": textColour,
        } as React.CSSProperties
      }
    >
      {/* Dot (visible at all levels) */}
      <span className="an-dot" />

      {/* Label — visible at pill and card */}
      {level !== "dot" && (
        <span className="an-label">{title}</span>
      )}

      {/* Card extras — visible only at card */}
      {level === "card" && (
        <>
          <span className="an-type">{nodeType}</span>
          {summary && <span className="an-summary">{summary}</span>}
          {style?.thumbnail && (
            <img className="an-thumbnail" src={style.thumbnail} alt="" />
          )}
        </>
      )}
    </div>
  );
}

function defaultDotColour(nodeType: string): string {
  switch (nodeType) {
    case "resource": return "#4a4aff";
    case "note":     return "#9b59b6";
    case "group":    return "#e67e22";
    case "portal":   return "#1abc9c";
    default:         return "#4a4aff";
  }
}
```

- [ ] **Step 2: Refactor ResourceNode.tsx**

Replace the entire file:

```tsx
import { type NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { AdaptiveNode } from "./AdaptiveNode";
import type { AdaptiveNodeStyle } from "./AdaptiveNode";

interface ResourceNodeData {
  title: string;
  summary?: string;
  style?: AdaptiveNodeStyle;
  absolutePath?: string;
  resourceKind?: string;
}

export function ResourceNode({ data, selected }: NodeProps<{ data: ResourceNodeData }>) {
  return (
    <>
      <Handle type="target" position={Position.Top} className="flow-handle" />
      <AdaptiveNode
        nodeType="resource"
        title={data.title}
        summary={data.summary}
        selected={selected}
        style={data.style}
      />
      <Handle type="source" position={Position.Bottom} className="flow-handle" />
    </>
  );
}
```

- [ ] **Step 3: Refactor NoteNode.tsx**

```tsx
import { type NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { AdaptiveNode } from "./AdaptiveNode";
import type { AdaptiveNodeStyle } from "./AdaptiveNode";

interface NoteNodeData {
  title: string;
  summary?: string;
  style?: AdaptiveNodeStyle;
  content?: string;
}

export function NoteNode({ data, selected }: NodeProps<{ data: NoteNodeData }>) {
  return (
    <>
      <Handle type="target" position={Position.Top} className="flow-handle" />
      <AdaptiveNode
        nodeType="note"
        title={data.title}
        summary={data.summary}
        selected={selected}
        style={data.style}
      />
      <Handle type="source" position={Position.Bottom} className="flow-handle" />
    </>
  );
}
```

- [ ] **Step 4: Refactor GroupNode.tsx**

```tsx
import { type NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { AdaptiveNode } from "./AdaptiveNode";
import type { AdaptiveNodeStyle } from "./AdaptiveNode";

interface GroupNodeData {
  title: string;
  summary?: string;
  style?: AdaptiveNodeStyle;
}

export function GroupNode({ data, selected }: NodeProps<{ data: GroupNodeData }>) {
  return (
    <>
      <Handle type="target" position={Position.Top} className="flow-handle" />
      <AdaptiveNode
        nodeType="group"
        title={data.title}
        summary={data.summary}
        selected={selected}
        style={data.style}
      />
      <Handle type="source" position={Position.Bottom} className="flow-handle" />
    </>
  );
}
```

- [ ] **Step 5: Add adaptive node CSS**

Append to `apps/desktop/src/styles.css`:

```css
/* ─── Adaptive nodes ──────────────────────────────────── */
.adaptive-node {
  position: relative;
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  transition: opacity 150ms ease;
}

/* Dot level: just the circle */
.adaptive-node--dot {
  width: 12px;
  height: 12px;
}

.adaptive-node--dot .an-label,
.adaptive-node--dot .an-type,
.adaptive-node--dot .an-summary,
.adaptive-node--dot .an-thumbnail {
  display: none;
}

/* Pill level */
.adaptive-node--pill {
  background: var(--node-bg, #111128);
  border: 1px solid #252545;
  border-radius: 4px;
  padding: 3px 8px 3px 5px;
  min-width: 60px;
  max-width: 200px;
}

.adaptive-node--pill[data-selected="true"] {
  border-color: #7c6fff;
  box-shadow: 0 0 0 1px #7c6fff33;
}

/* Card level */
.adaptive-node--card {
  background: var(--node-bg, #0e0e22);
  border: 1px solid #252545;
  border-radius: 5px;
  padding: 6px 9px;
  min-width: 120px;
  max-width: 240px;
  flex-wrap: wrap;
  gap: 3px;
}

.adaptive-node--card[data-selected="true"] {
  border-color: #7c6fff;
  box-shadow: 0 0 0 1px #7c6fff33;
}

/* Dot (coloured circle) — all levels */
.an-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dot-colour, #4a4aff);
  flex-shrink: 0;
  display: block;
}

.adaptive-node--dot .an-dot {
  width: 12px;
  height: 12px;
}

/* Label */
.an-label {
  font-size: 10px;
  color: var(--node-text, #c0c0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

/* Card extras */
.an-type {
  font-size: 8px;
  color: #3a3a6e;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  width: 100%;
  order: -1;
}

.an-summary {
  font-size: 9px;
  color: #4a4a80;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.an-thumbnail {
  width: 100%;
  height: 48px;
  object-fit: cover;
  border-radius: 3px;
  margin-top: 3px;
  order: 10;
}

/* Hover handles (shown on node hover, wired in Task 10) */
.flow-handle {
  width: 8px !important;
  height: 8px !important;
  background: #7c6fff !important;
  border: 1px solid rgba(255,255,255,0.2) !important;
  border-radius: 50% !important;
  opacity: 0;
  transition: opacity 150ms ease;
}

.adaptive-node:hover ~ .flow-handle,
.react-flow__node:hover .flow-handle {
  opacity: 1;
}
```

- [ ] **Step 6: Run canvas unit tests**

```bash
pnpm vitest run packages/canvas/src/state/canvasStore.test.ts
```

Expected: PASS (canvasStore tests don't touch node components).

- [ ] **Step 7: Compile check**

```bash
pnpm exec tsc -b --noEmit 2>&1 | grep -E "(AdaptiveNode|ResourceNode|NoteNode|GroupNode)" | head -20
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/canvas/src/nodes/AdaptiveNode.tsx \
        packages/canvas/src/nodes/ResourceNode.tsx \
        packages/canvas/src/nodes/NoteNode.tsx \
        packages/canvas/src/nodes/GroupNode.tsx \
        apps/desktop/src/styles.css
git commit -m "feat(canvas): adaptive node rendering — dot/pill/card by zoom level"
```

---

## Task 9: canvasStore CRUD additions

**Files:**
- Modify: `packages/canvas/src/state/canvasStore.ts`
- Modify: `packages/schema/src/node.ts`
- Test: `packages/canvas/src/state/canvasStore.test.ts`

- [ ] **Step 1: Add style fields to node schema**

Open `packages/schema/src/node.ts`. Find the node schema definition and add optional style fields:

```ts
// Add these optional fields to the node Zod schema object:
dotColour:  z.string().optional(),
bgColour:   z.string().optional(),
textColour: z.string().optional(),
thumbnail:  z.string().optional(),
```

- [ ] **Step 2: Write failing tests for new store methods**

Open `packages/canvas/src/state/canvasStore.test.ts` and add:

```ts
describe("deleteNode", () => {
  it("removes the node from the store", () => {
    const store = createCanvasStore({ canvasId: "c1" });
    const node = store.getState().createNoteNode({ title: "t", content: "" });
    store.getState().deleteNode(node.id);
    expect(store.getState().nodes.find((n) => n.id === node.id)).toBeUndefined();
  });

  it("also removes edges connected to that node", () => {
    const store = createCanvasStore({ canvasId: "c1" });
    const a = store.getState().createNoteNode({ title: "a", content: "" });
    const b = store.getState().createNoteNode({ title: "b", content: "" });
    store.getState().connectNodes({ sourceNodeId: a.id, targetNodeId: b.id, relationKind: "ref" });
    store.getState().deleteNode(a.id);
    expect(store.getState().edges).toHaveLength(0);
  });
});

describe("duplicateNode", () => {
  it("creates a new node with the same data but a new id and offset position", () => {
    const store = createCanvasStore({ canvasId: "c1" });
    const original = store.getState().createNoteNode({ title: "orig", content: "hello" });
    const copy = store.getState().duplicateNode(original.id);
    expect(copy).toBeDefined();
    expect(copy!.id).not.toBe(original.id);
    expect(copy!.title).toBe("orig");
    expect(copy!.position.x).toBe(original.position.x + 24);
    expect(copy!.position.y).toBe(original.position.y + 24);
  });
});

describe("updateNodeStyle", () => {
  it("updates style fields on the node", () => {
    const store = createCanvasStore({ canvasId: "c1" });
    const node = store.getState().createNoteNode({ title: "t", content: "" });
    store.getState().updateNodeStyle(node.id, { dotColour: "#ff0000" });
    const updated = store.getState().nodes.find((n) => n.id === node.id);
    expect(updated?.dotColour).toBe("#ff0000");
  });
});
```

- [ ] **Step 3: Run tests to confirm failure**

```bash
pnpm vitest run packages/canvas/src/state/canvasStore.test.ts 2>&1 | tail -20
```

Expected: FAIL — `deleteNode`, `duplicateNode`, `updateNodeStyle` are not defined.

- [ ] **Step 4: Implement the new store methods**

Open `packages/canvas/src/state/canvasStore.ts`. Add these methods to the store state interface and implementation:

```ts
// Add to the interface:
deleteNode: (nodeId: string) => void;
duplicateNode: (nodeId: string) => CanvasNode | undefined;
updateNodeStyle: (nodeId: string, style: {
  dotColour?: string;
  bgColour?: string;
  textColour?: string;
  thumbnail?: string;
}) => void;
setSelectedNodeId: (nodeId: string | null) => void;
selectedNodeId: string | null;
updateNodeTitle: (nodeId: string, title: string) => void;
```

```ts
// Add to createStore implementation:
selectedNodeId: null,

setSelectedNodeId: (nodeId) => set({ selectedNodeId: nodeId }),

deleteNode: (nodeId) =>
  set((state) => ({
    nodes: state.nodes.filter((n) => n.id !== nodeId),
    edges: state.edges.filter(
      (e) => e.source !== nodeId && e.target !== nodeId,
    ),
  })),

duplicateNode: (nodeId) => {
  const state = get();
  const original = state.nodes.find((n) => n.id === nodeId);
  if (!original) return undefined;
  const copy = {
    ...original,
    id: crypto.randomUUID(),
    position: { x: original.position.x + 24, y: original.position.y + 24 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  set((s) => ({ nodes: [...s.nodes, copy] }));
  return copy;
},

updateNodeStyle: (nodeId, style) =>
  set((state) => ({
    nodes: state.nodes.map((n) =>
      n.id === nodeId ? { ...n, ...style, updatedAt: new Date().toISOString() } : n,
    ),
  })),

updateNodeTitle: (nodeId, title) =>
  set((state) => ({
    nodes: state.nodes.map((n) =>
      n.id === nodeId ? { ...n, title, updatedAt: new Date().toISOString() } : n,
    ),
  })),
```

- [ ] **Step 5: Run tests to confirm pass**

```bash
pnpm vitest run packages/canvas/src/state/canvasStore.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/node.ts \
        packages/canvas/src/state/canvasStore.ts \
        packages/canvas/src/state/canvasStore.test.ts
git commit -m "feat(canvas): add deleteNode, duplicateNode, updateNodeStyle, updateNodeTitle to canvasStore"
```

---

## Task 10: Context menu system + keyboard shortcuts

**Files:**
- Create: `apps/desktop/src/components/ContextMenu.tsx`
- Create: `apps/desktop/src/components/FuzzyFilePicker.tsx`
- Modify: `packages/canvas/src/CanvasView.tsx`
- Modify: `apps/desktop/src/styles.css`

**Important:** `ContextMenu` and `FuzzyFilePicker` must live in `packages/canvas/src/components/` (not `apps/desktop/src/components/`) because `CanvasView.tsx` (which imports them) is in the `packages/canvas` package and cannot import from `apps/`. Create the files at `packages/canvas/src/components/ContextMenu.tsx` and `packages/canvas/src/components/FuzzyFilePicker.tsx`. The `apps/desktop/src/components/` path mentioned in the File Map is wrong — use `packages/canvas/src/components/` for both.

- [ ] **Step 1: Create packages/canvas/src/components/ContextMenu.tsx**

```tsx
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
  header?: boolean;
  danger?: boolean;
  submenu?: () => void; // triggers a secondary popup
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Adjust position to stay within viewport
  const adjustedX = Math.min(x, window.innerWidth - 180);
  const adjustedY = Math.min(y, window.innerHeight - items.length * 28 - 16);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="ctx-menu"
      ref={ref}
      style={{ left: adjustedX, top: adjustedY }}
      role="menu"
    >
      {items.map((item, i) => {
        if (item.separator) return <div key={i} className="ctx-separator" />;
        if (item.header) return <div key={i} className="ctx-header">{item.label}</div>;
        return (
          <button
            key={i}
            className="ctx-item"
            data-danger={item.danger ? "true" : undefined}
            role="menuitem"
            onClick={() => {
              item.action?.();
              onClose();
            }}
          >
            <span className="ctx-item__label">{item.label}</span>
            {item.shortcut && (
              <span className="ctx-item__shortcut">{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Create packages/canvas/src/components/FuzzyFilePicker.tsx**

```tsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface FileEntry {
  id: string;
  name: string;
  path: string;
  kind: string;
}

interface FuzzyFilePickerProps {
  x: number;
  y: number;
  entries: FileEntry[];
  onSelect: (entry: FileEntry) => void;
  onClose: () => void;
}

function fuzzyMatch(query: string, str: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const s = str.toLowerCase();
  let qi = 0;
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function FuzzyFilePicker({ x, y, entries, onSelect, onClose }: FuzzyFilePickerProps) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = entries
    .filter((e) => fuzzyMatch(query, e.name))
    .slice(0, 8);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[activeIdx]) {
        onSelect(filtered[activeIdx]);
        onClose();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - 260);

  return createPortal(
    <div className="fuzzy-picker" style={{ left: adjustedX, top: adjustedY }}>
      <input
        ref={inputRef}
        className="fuzzy-picker__input"
        placeholder="Search files…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKey}
      />
      <div className="fuzzy-picker__list">
        {filtered.length === 0 ? (
          <div className="fuzzy-picker__empty">No matches</div>
        ) : (
          filtered.map((entry, i) => (
            <div
              key={entry.id}
              className="fuzzy-picker__item"
              data-active={i === activeIdx ? "true" : undefined}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => { onSelect(entry); onClose(); }}
            >
              <span className="fuzzy-picker__icon">{entry.kind === "directory" ? "▸" : "·"}</span>
              <span className="fuzzy-picker__name">{entry.name}</span>
              <span className="fuzzy-picker__path">{entry.path.replace(entry.name, "")}</span>
            </div>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 3: Add context menu + fuzzy picker CSS**

Append to `apps/desktop/src/styles.css`:

```css
/* ─── Context menu ────────────────────────────────────── */
.ctx-menu {
  position: fixed;
  z-index: 9999;
  background: #0e0e22;
  border: 1px solid #252545;
  border-radius: 6px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7);
  padding: 4px;
  min-width: 160px;
  max-width: 220px;
}

.ctx-header {
  padding: 3px 10px 4px;
  font-size: 10px;
  color: #3a3a6e;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.ctx-separator {
  height: 1px;
  background: #1a1a35;
  margin: 3px 4px;
}

.ctx-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 5px 10px;
  background: none;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  text-align: left;
  color: #9090c0;
  font-size: 11px;
  gap: 10px;
}

.ctx-item:hover {
  background: #1a1a35;
  color: #c0c0e0;
}

.ctx-item[data-danger="true"] {
  color: #7a3535;
}

.ctx-item[data-danger="true"]:hover {
  background: #1a0a0a;
  color: #e74c3c;
}

.ctx-item__label {
  flex: 1;
}

.ctx-item__shortcut {
  font-size: 9px;
  color: #2e2e50;
  font-family: monospace;
}

/* ─── Fuzzy file picker ───────────────────────────────── */
.fuzzy-picker {
  position: fixed;
  z-index: 10000;
  background: #0c0c1e;
  border: 1px solid #3a3a6e;
  border-radius: 5px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
  width: 220px;
  overflow: hidden;
}

.fuzzy-picker__input {
  display: block;
  width: 100%;
  background: #0a0a18;
  border: none;
  border-bottom: 1px solid #1e1e35;
  padding: 7px 10px;
  font-size: 11px;
  color: #9090c0;
  outline: none;
  box-sizing: border-box;
}

.fuzzy-picker__input::placeholder {
  color: #3a3a6e;
}

.fuzzy-picker__list {
  max-height: 200px;
  overflow-y: auto;
  padding: 3px;
}

.fuzzy-picker__empty {
  padding: 8px 10px;
  font-size: 10px;
  color: #2e2e50;
  text-align: center;
}

.fuzzy-picker__item {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 7px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 10px;
  color: #7070a0;
}

.fuzzy-picker__item:hover,
.fuzzy-picker__item[data-active="true"] {
  background: #1a1a35;
  color: #c0c0e0;
}

.fuzzy-picker__icon {
  color: #3a3a6e;
  font-size: 9px;
  width: 10px;
  flex-shrink: 0;
}

.fuzzy-picker__name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fuzzy-picker__path {
  font-size: 9px;
  color: #2e2e50;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60px;
}
```

- [ ] **Step 4: Wire context menu into CanvasView.tsx**

Open `packages/canvas/src/CanvasView.tsx`. Add imports and state:

```tsx
import { useState, useCallback } from "react";
import { ContextMenu, type MenuItem } from "../../apps/desktop/src/components/ContextMenu";
// Note: adjust import path based on actual relative distance, or move ContextMenu to packages/canvas/src/components/
import { FuzzyFilePicker } from "../../apps/desktop/src/components/FuzzyFilePicker";
```

Add context menu state to `CanvasView`:

```tsx
const [contextMenu, setContextMenu] = useState<{
  x: number;
  y: number;
  kind: "canvas" | "node";
  nodeId?: string;
} | null>(null);

const [showFilePicker, setShowFilePicker] = useState<{ x: number; y: number } | null>(null);

const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
  e.preventDefault();
  setContextMenu({ x: e.clientX, y: e.clientY, kind: "canvas" });
}, []);

const handleNodeContextMenu = useCallback((e: React.MouseEvent, nodeId: string) => {
  e.preventDefault();
  e.stopPropagation();
  setContextMenu({ x: e.clientX, y: e.clientY, kind: "node", nodeId });
}, []);
```

Add canvas keyboard shortcuts in a `useEffect`:

```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    // only when canvas is focused
    if ((e.target as HTMLElement).closest(".react-flow") === null) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedNodeId) {
        onDeleteNode?.(selectedNodeId);
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "d") {
      e.preventDefault();
      if (selectedNodeId) onDuplicateNode?.(selectedNodeId);
    }
    if (e.key === "n" && !e.metaKey && !e.ctrlKey) {
      // create note at centre
      onCreateNote?.();
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, [selectedNodeId, onDeleteNode, onDuplicateNode, onCreateNote]);
```

Add to the JSX return (after `</ReactFlow>`):

```tsx
{contextMenu && contextMenu.kind === "canvas" && (
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    onClose={() => setContextMenu(null)}
    items={[
      { label: "Add note", shortcut: "N", action: () => onCreateNote?.() },
      { label: "Add resource from file…", shortcut: "R", action: () => {
        setShowFilePicker({ x: contextMenu.x, y: contextMenu.y });
        setContextMenu(null);
      }},
      { label: "Add group", shortcut: "G", action: () => onCreateGroup?.() },
      { separator: true },
      { label: "Select all", shortcut: "⌘A", action: () => {} },
    ]}
  />
)}

{contextMenu && contextMenu.kind === "node" && contextMenu.nodeId && (
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    onClose={() => setContextMenu(null)}
    items={[
      { header: true, label: nodes.find(n => n.id === contextMenu.nodeId)?.data?.title ?? "Node" },
      { separator: true },
      { label: "Open content", shortcut: "↵", action: () => onNodeDoubleClick?.(contextMenu.nodeId!) },
      { label: "Draw edge →", action: () => {} }, // wired Task 11
      { label: "Duplicate", shortcut: "⌘D", action: () => onDuplicateNode?.(contextMenu.nodeId!) },
      { separator: true },
      { label: "Delete", danger: true, shortcut: "⌫", action: () => onDeleteNode?.(contextMenu.nodeId!) },
    ]}
  />
)}

{showFilePicker && (
  <FuzzyFilePicker
    x={showFilePicker.x}
    y={showFilePicker.y}
    entries={fileEntries ?? []}
    onSelect={(entry) => onCreateResourceFromFile?.(entry)}
    onClose={() => setShowFilePicker(null)}
  />
)}
```

Also add `onContextMenu={handleCanvasContextMenu}` to the `<ReactFlow>` element.

- [ ] **Step 5: Update CanvasViewProps interface**

Add these props to the `CanvasViewProps` interface in `CanvasView.tsx`:

```tsx
onDeleteNode?: (nodeId: string) => void;
onDuplicateNode?: (nodeId: string) => void;
onCreateNote?: () => void;
onCreateGroup?: () => void;
onCreateResourceFromFile?: (entry: { id: string; name: string; path: string; kind: string }) => void;
fileEntries?: { id: string; name: string; path: string; kind: string }[];
onNodeDoubleClick?: (nodeId: string) => void;
```

- [ ] **Step 6: Compile check**

```bash
pnpm exec tsc -b --noEmit 2>&1 | grep -E "(ContextMenu|FuzzyFilePicker)" | head -20
```

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/components/ContextMenu.tsx \
        apps/desktop/src/components/FuzzyFilePicker.tsx \
        packages/canvas/src/CanvasView.tsx \
        apps/desktop/src/styles.css
git commit -m "feat(canvas): right-click context menu + fuzzy file picker for node creation"
```

---

## Task 11: Edge drawing — hover handles + shift+drag

**Files:**
- Modify: `packages/canvas/src/CanvasView.tsx`
- Modify: `apps/desktop/src/styles.css`

React Flow's built-in `Handle` components (already added in Task 8) provide connection handles. The missing pieces are: making them visible on hover, and wiring the connection callback.

- [ ] **Step 1: Enable connections in CanvasView**

In `CanvasView.tsx`, add the `onConnect` callback and pass it to `<ReactFlow>`:

```tsx
import { addEdge, type Connection } from "@xyflow/react";

// Inside the component:
const handleConnect = useCallback(
  (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    onConnectNodes?.({
      sourceNodeId: connection.source,
      targetNodeId: connection.target,
      relationKind: "reference",
    });
  },
  [onConnectNodes],
);
```

Add `onConnect={handleConnect}` to `<ReactFlow>`.

Add to `CanvasViewProps`:
```tsx
onConnectNodes?: (input: { sourceNodeId: string; targetNodeId: string; relationKind: string }) => void;
```

- [ ] **Step 2: Enable shift+drag as connection mode**

In `<ReactFlow>`, set:
```tsx
connectOnClick={false}
connectionMode={ConnectionMode.Loose}
```

Add import: `import { ConnectionMode } from "@xyflow/react";`

React Flow already supports drag-from-handle. Shift+drag from anywhere on a node body requires a custom `onNodeMouseDown` with a check for the Shift key:

```tsx
const handleNodeMouseDown = useCallback(
  (e: React.MouseEvent, nodeId: string) => {
    if (!e.shiftKey) return;
    // Start a connection drag — React Flow exposes startConnection via useReactFlow
    // Set a pending connection source in local state; actual wiring is via onConnect
    e.stopPropagation();
    setPendingConnectionSource(nodeId);
  },
  [],
);
```

Add `onNodeMouseDown={handleNodeMouseDown}` to `<ReactFlow>`.

- [ ] **Step 3: Make handles visible on node hover (CSS)**

The `.flow-handle` CSS was added in Task 8. Ensure the React Flow container class allows hover propagation. Add to `apps/desktop/src/styles.css`:

```css
/* Show handles when parent node is hovered */
.react-flow__node:hover .flow-handle,
.react-flow__node.selected .flow-handle {
  opacity: 1 !important;
}
```

- [ ] **Step 4: Compile check**

```bash
pnpm exec tsc -b --noEmit 2>&1 | grep "CanvasView" | head -10
```

- [ ] **Step 5: Commit**

```bash
git add packages/canvas/src/CanvasView.tsx apps/desktop/src/styles.css
git commit -m "feat(canvas): edge drawing via hover handles and shift+drag"
```

---

## Task 12: FullScreenReader + wire double-click

**Files:**
- Create: `apps/desktop/src/layout/FullScreenReader.tsx`
- Modify: `apps/desktop/src/layout/Shell.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/styles.css`

- [ ] **Step 1: Create FullScreenReader.tsx**

```tsx
import { useEffect } from "react";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";

interface FullScreenReaderProps {
  onClose: () => void;
}

export function FullScreenReader({ onClose }: FullScreenReaderProps) {
  const workspace = useCanvasWorkspace();
  const node = workspace.selectedNode;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!node) {
    onClose();
    return null;
  }

  const kind = node.resourceKind ?? "text";

  return (
    <div className="fullscreen-reader">
      <header className="fullscreen-reader__header">
        <nav className="fullscreen-reader__breadcrumb">
          <span>{workspace.activeProject?.name ?? "Project"}</span>
          <span className="fsr-sep">›</span>
          <span>Canvas</span>
          <span className="fsr-sep">›</span>
          <span className="fsr-current">{node.title}</span>
        </nav>
        <button className="fullscreen-reader__close" onClick={onClose} title="Back to canvas (Esc)">
          ← Back
        </button>
      </header>

      <main className="fullscreen-reader__body">
        {kind === "markdown" && node.renderedHtml ? (
          <article
            className="fsr-markdown"
            dangerouslySetInnerHTML={{ __html: node.renderedHtml }}
          />
        ) : kind === "image" && node.absolutePath ? (
          <div className="fsr-image-wrap">
            <img
              className="fsr-image"
              src={`asset://localhost/${node.absolutePath}`}
              alt={node.title}
            />
          </div>
        ) : node.type === "note" ? (
          <textarea
            className="fsr-note-editor"
            defaultValue={node.content ?? ""}
            placeholder="Write a note…"
            onBlur={(e) => workspace.updateNodeContent?.(node.id, e.target.value)}
          />
        ) : (
          <div className="fsr-placeholder">{node.absolutePath ?? "No content"}</div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Add full-screen reader CSS**

Append to `apps/desktop/src/styles.css`:

```css
/* ─── Full-screen reader ──────────────────────────────── */
.fullscreen-reader {
  position: absolute;
  inset: 0;
  z-index: 500;
  background: #06060e;
  display: flex;
  flex-direction: column;
}

.fullscreen-reader__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 36px;
  border-bottom: 1px solid #111128;
  flex-shrink: 0;
}

.fullscreen-reader__breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #3a3a6e;
}

.fsr-sep {
  color: #1e1e35;
}

.fsr-current {
  color: #7070a0;
  font-weight: 600;
}

.fullscreen-reader__close {
  background: none;
  border: none;
  color: #3a3a6e;
  font-size: 11px;
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 3px;
}

.fullscreen-reader__close:hover {
  color: #9090c0;
  background: #111128;
}

.fullscreen-reader__body {
  flex: 1;
  overflow-y: auto;
  padding: 40px;
  max-width: 720px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.fsr-markdown {
  font-size: 14px;
  line-height: 1.8;
  color: #a0a0c0;
}

.fsr-markdown h1, .fsr-markdown h2, .fsr-markdown h3 {
  color: #d0d0e8;
  margin: 28px 0 10px;
}

.fsr-markdown code {
  background: #0a0a1a;
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 12px;
  color: #6688cc;
}

.fsr-markdown pre {
  background: #0a0a1a;
  border: 1px solid #1a1a35;
  border-radius: 5px;
  padding: 14px 16px;
  overflow-x: auto;
}

.fsr-markdown blockquote {
  border-left: 3px solid #3a3a6e;
  padding-left: 14px;
  color: #6060a0;
  margin: 0;
}

.fsr-image-wrap {
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.fsr-image {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

.fsr-note-editor {
  width: 100%;
  height: 100%;
  min-height: 400px;
  background: transparent;
  border: none;
  color: #a0a0c0;
  font-size: 14px;
  line-height: 1.8;
  resize: none;
  outline: none;
  font-family: inherit;
}

.fsr-placeholder {
  font-size: 12px;
  color: #2e2e50;
  font-family: monospace;
}
```

- [ ] **Step 3: Wire full-screen mode into Shell.tsx**

Add to Shell.tsx's state and JSX:

```tsx
import { useState } from "react";
import { FullScreenReader } from "./FullScreenReader";

// Inside Shell():
const [fullScreenOpen, setFullScreenOpen] = useState(false);

// Track double-click state: first double-click opens Content tab, second enters full screen
const handleNodeDoubleClick = useCallback((nodeId: string) => {
  workspace.setSelectedNode(nodeId);
  if (layout.rightOpen && layout.rightTab === "content") {
    setFullScreenOpen(true);
  } else {
    layout.openRightTab("content");
  }
}, [layout, workspace]);
```

In the JSX, wrap the `shell-canvas-area` to layer the full-screen reader:

```tsx
<div className="shell-canvas-area">
  <LeftOverlay ... />
  <CanvasPane
    onNodeSelect={...}
    onNodeDoubleClick={handleNodeDoubleClick}
  />
  <RightPanelSlot
    ...
    onFullScreen={() => setFullScreenOpen(true)}
  />
  {fullScreenOpen && (
    <FullScreenReader onClose={() => setFullScreenOpen(false)} />
  )}
</div>
```

- [ ] **Step 4: Remove NodeViewerScreen route from App.tsx**

Replace `apps/desktop/src/App.tsx` with:

```tsx
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CanvasWorkspaceProvider } from "./features/canvas/CanvasWorkspaceContext";
import { Shell } from "./layout/Shell";

export function App() {
  return (
    <BrowserRouter>
      <CanvasWorkspaceProvider>
        <Routes>
          <Route element={<Shell />} path="*" />
        </Routes>
      </CanvasWorkspaceProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 5: Compile check**

```bash
pnpm exec tsc -b --noEmit 2>&1 | grep -E "(FullScreenReader|App\.tsx)" | head -20
```

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/layout/FullScreenReader.tsx \
        apps/desktop/src/layout/Shell.tsx \
        apps/desktop/src/App.tsx \
        apps/desktop/src/styles.css
git commit -m "feat(viewer): full-screen reader mode, remove NodeViewerScreen route"
```

---

## Task 13: Node colour customisation in Inspector

**Files:**
- Modify: `apps/desktop/src/features/inspector/InspectorTab.tsx`
- Modify: `apps/desktop/src/styles.css`

- [ ] **Step 1: Add colour controls to InspectorTab.tsx**

Replace the `<div className="inspector-colours" .../>` placeholder with the full colour picker UI:

```tsx
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";

// Inside InspectorTab, after the existing fields:

const DOT_PRESETS = ["#4a4aff","#9b59b6","#27ae60","#e67e22","#e74c3c","#1abc9c","#f39c12","#888888"];
const BG_PRESETS  = ["#0e0e22","#140a0a","#0a140a","#14100a","#0a0a14","#111111"];
const TXT_PRESETS = ["#c0c0e0","#ffffff","#e74c3c","#f39c12","#7c6fff","#888888"];

function ColourRow({
  label,
  presets,
  current,
  onChange,
}: {
  label: string;
  presets: string[];
  current?: string;
  onChange: (colour: string) => void;
}) {
  return (
    <div className="inspector-field">
      <label className="inspector-label">{label}</label>
      <div className="colour-row">
        {presets.map((c) => (
          <button
            key={c}
            className="colour-swatch"
            data-active={current === c ? "true" : undefined}
            style={{ background: c }}
            onClick={() => onChange(c)}
            title={c}
          />
        ))}
        <input
          type="color"
          className="colour-custom-input"
          value={current ?? presets[0]}
          onChange={(e) => onChange(e.target.value)}
          title="Custom colour"
        />
      </div>
    </div>
  );
}
```

Then use it inside `InspectorTab`:

```tsx
// After inspector-section-title "Appearance":
<ColourRow
  label="Dot colour"
  presets={DOT_PRESETS}
  current={node.dotColour}
  onChange={(c) => workspace.updateNodeStyle?.(node.id, { dotColour: c })}
/>
<ColourRow
  label="Background"
  presets={BG_PRESETS}
  current={node.bgColour}
  onChange={(c) => workspace.updateNodeStyle?.(node.id, { bgColour: c })}
/>
<ColourRow
  label="Text colour"
  presets={TXT_PRESETS}
  current={node.textColour}
  onChange={(c) => workspace.updateNodeStyle?.(node.id, { textColour: c })}
/>
<div className="inspector-field">
  <label className="inspector-label">Thumbnail</label>
  <button
    className="inspector-value inspector-value--btn"
    onClick={() => {
      // Tauri open dialog — workspace.setNodeThumbnail(node.id, path)
    }}
  >
    {node.thumbnail ? node.thumbnail.split("/").pop() : "Set image…"}
  </button>
</div>
```

- [ ] **Step 2: Add colour swatch CSS**

Append to `apps/desktop/src/styles.css`:

```css
/* ─── Colour swatches (Inspector) ─────────────────────── */
.colour-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.colour-swatch {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: transform 100ms ease, box-shadow 100ms ease;
}

.colour-swatch:hover {
  transform: scale(1.15);
}

.colour-swatch[data-active="true"] {
  box-shadow: 0 0 0 2px #7c6fff;
}

.colour-custom-input {
  width: 18px;
  height: 18px;
  border: none;
  padding: 0;
  cursor: pointer;
  border-radius: 3px;
  background: none;
  overflow: hidden;
}

.inspector-value--btn {
  cursor: pointer;
  text-align: left;
  font-size: 10px;
  color: #5a5a90;
  background: #0a0a18;
  border: 1px dashed #1e1e35;
}

.inspector-value--btn:hover {
  border-color: #3a3a6e;
  color: #9090c0;
}
```

- [ ] **Step 3: Ensure selectedNode in workspace exposes style fields**

In `CanvasWorkspaceContext.tsx`, verify that when a node is selected and exposed as `workspace.selectedNode`, the `dotColour`, `bgColour`, `textColour`, and `thumbnail` fields from canvasStore are included. If `selectedNode` is built from a separate lookup, update it to spread the full node object from the store.

- [ ] **Step 4: Compile check**

```bash
pnpm exec tsc -b --noEmit 2>&1 | grep "InspectorTab" | head -10
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/inspector/InspectorTab.tsx apps/desktop/src/styles.css
git commit -m "feat(inspector): node colour customisation — dot, background, text, thumbnail"
```

---

## Task 14: Remove dead code

**Files:**
- Delete: `apps/desktop/src/layout/BottomDock.tsx`
- Delete: `apps/desktop/src/features/viewer/NodeViewerScreen.tsx`
- Modify: `apps/desktop/src/layout/LeftRail.tsx` (replace with LeftOverlay export shim or delete)
- Modify: `apps/desktop/src/layout/RightPanel.tsx` (replace with RightPanelSlot export shim or delete)
- Modify: `apps/desktop/src/styles.css` — remove stale classes

- [ ] **Step 1: Delete BottomDock.tsx**

```bash
rm apps/desktop/src/layout/BottomDock.tsx
```

- [ ] **Step 2: Delete NodeViewerScreen.tsx**

```bash
rm apps/desktop/src/features/viewer/NodeViewerScreen.tsx
```

- [ ] **Step 3: Replace LeftRail.tsx with a shim pointing to LeftOverlay**

Replace `apps/desktop/src/layout/LeftRail.tsx` with:

```tsx
// Removed — replaced by LeftOverlay.tsx
export { LeftOverlay as LeftRail } from "./LeftOverlay";
```

- [ ] **Step 4: Replace RightPanel.tsx with a shim**

Replace `apps/desktop/src/layout/RightPanel.tsx` with:

```tsx
// Removed — replaced by RightPanelSlot.tsx
export { RightPanelSlot as RightPanel } from "./RightPanelSlot";
```

- [ ] **Step 5: Compile check — should be clean**

```bash
pnpm exec tsc -b --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 6: Run all frontend tests**

```bash
pnpm vitest run
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove BottomDock, NodeViewerScreen — replaced by new shell layout"
```

---

## Task 15: CanvasPane keyboard wiring + CanvasWorkspaceContext bridge

**Files:**
- Modify: `apps/desktop/src/layout/CanvasPane.tsx`
- Modify: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`

- [ ] **Step 1: Update CanvasPane to accept and forward interaction props**

Replace `apps/desktop/src/layout/CanvasPane.tsx`:

```tsx
import { CanvasScreen } from "../features/canvas/CanvasScreen";

interface CanvasPaneProps {
  onNodeSelect?: (nodeId: string) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
}

export function CanvasPane({ onNodeSelect, onNodeDoubleClick }: CanvasPaneProps) {
  return (
    <section
      className="canvas-pane"
      data-testid="canvas-pane"
      style={{ position: "absolute", inset: 0, left: 26 }}
    >
      <CanvasScreen
        onNodeSelect={onNodeSelect}
        onNodeDoubleClick={onNodeDoubleClick}
      />
    </section>
  );
}
```

- [ ] **Step 2: Thread props through CanvasScreen to CanvasView**

In whatever `CanvasScreen` component exists (likely `apps/desktop/src/features/canvas/`), add the same `onNodeSelect` and `onNodeDoubleClick` props and pass them to `<CanvasView>`. Also wire `onDeleteNode`, `onDuplicateNode`, `onCreateNote`, `onCreateGroup`, `onConnectNodes`, `onCreateResourceFromFile`, and `fileEntries` through from the workspace context.

The `CanvasWorkspaceContext` already provides `nodes`, `edges`, `entries`. Ensure it also exposes:
- `updateNodeStyle(nodeId, style)` — delegates to canvasStore
- `deleteNode(nodeId)` — delegates to canvasStore
- `duplicateNode(nodeId)` — delegates to canvasStore
- `updateNodeContent(nodeId, content)` — updates note content
- `setSelectedNode(nodeId)` — sets selected node id, exposes as `selectedNode` (full node object)

- [ ] **Step 3: Final compile check**

```bash
pnpm exec tsc -b --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Run all tests**

```bash
pnpm vitest run
```

Expected: all PASS.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: wire CanvasPane interactions end-to-end through workspace context"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Canvas dominant, icon strip 26px | Task 2, 3 |
| Left overlay panel, drag to resize | Task 5 |
| Right panel slot: Inspector/Content/Terminal | Task 6 |
| Right panel resizable | Task 6 |
| Status bar | Task 4 |
| ⌘T terminal, ⌘K search, ⌘B panel | Task 2 |
| Flat project + canvas switcher | Task 5 |
| Resource roots from anywhere on machine | Task 5 |
| Adaptive nodes (dot/pill/card by zoom) | Task 8 |
| Node CRUD — create/edit/delete/duplicate | Task 9, 10 |
| Hover handles for edge drawing | Task 11 |
| Shift+drag edge drawing | Task 11 |
| Right-click context menus (canvas + node + edge) | Task 10 |
| Fuzzy file search for resource nodes | Task 10 |
| Node customisation (dot/bg/text/thumbnail) | Task 9, 13 |
| Single click → Inspector tab | Task 6, 15 |
| Double-click → Content tab | Task 12 |
| Double-click again → full-screen reader | Task 12 |
| Full-screen reader with breadcrumb | Task 12 |
| Terminal persistence (PTY survives panel close) | Task 7 |
| Animations — panel slide, node create/delete | Task 2, 5, 6, 8 (CSS transitions) |
| Remove giant buttons / topbar / BottomDock | Task 14 |
| Remove NodeViewerScreen route | Task 12, 14 |

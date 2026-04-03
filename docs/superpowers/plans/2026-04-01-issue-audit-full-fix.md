# Research Canvas — Full Issue Audit Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 9 issues from the 2026-04-01 audit report — from the trivial `#[serde(default)]` Rust crash through content pipeline wiring through sequence MVP.

**Architecture:** Each issue maps to 1–3 tasks. Tasks are ordered by dependency: Rust deserialization crash first (unblocks persist), CSS micro-fixes, node sizing (unblocks handles/edges), viewport-center node placement, sidebar drag, content pipeline, project-switch flush, panel viewport sync, and finally the sequence feature wiring.

**Tech Stack:** React 18, TypeScript, Zustand, @xyflow/react (React Flow), Tauri v2 (Rust/serde), CSS, `@research-canvas/*` monorepo packages.

---

## File Map

| File | Role | Tasks |
|------|------|-------|
| `apps/desktop/src-tauri/src/commands/projects.rs:125` | Rust CanvasNodePayload struct | 1 |
| `apps/desktop/src/styles.css:2157,2239-2241` | Node card CSS, drag transition | 2, 3 |
| `packages/canvas/src/nodes/NoteNode.tsx` | Note node component | 4 |
| `packages/canvas/src/nodes/ResourceNode.tsx` | Resource node component | 4 |
| `packages/canvas/src/nodes/AdaptiveNode.tsx` | Adaptive zoom-level node | 4 |
| `packages/canvas/src/CanvasView.tsx` | ReactFlow wrapper (CanvasViewInner) | 5, 6, 8, 13 |
| `packages/canvas/src/state/canvasStore.ts:258-263` | nextPosition grid | 6 |
| `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx` | Workspace context/provider | 6, 10, 13 |
| `apps/desktop/src/features/canvas/CanvasScreen.tsx` | Canvas toolbar + CanvasView mount | 6, 8, 13 |
| `apps/desktop/src/layout/LeftOverlay.tsx:90-104` | File entry buttons | 7 |
| `apps/desktop/src/layout/CanvasPane.tsx` | Canvas pane wrapper | 8 |
| `apps/desktop/src/layout/Shell.tsx` | App shell layout | 11, 13 |
| `apps/desktop/src/layout/RightPanelSlot.tsx` | Right panel tabs | 11 |
| `apps/desktop/src/layout/useShellLayout.ts` | Shell layout state hook | 11 |
| `apps/desktop/src/features/viewer/ContentTab.tsx` | Content tab viewer | 9 |
| `apps/desktop/src/layout/FullScreenReader.tsx` | Fullscreen node viewer | 9 |
| `packages/viewers/src/index.ts` | Viewer component barrel | 9 |
| `packages/viewers/src/MarkdownViewer.tsx` | Markdown renderer | 9 |
| `packages/viewers/src/NoteViewer.tsx` | Note renderer | 9 |
| `packages/viewers/src/ImageViewer.tsx` | Image renderer | 9 |
| `packages/viewers/src/PdfViewer.tsx` | PDF renderer | 9 |
| `packages/desktop-api/src/index.ts:193-195` | Tauri flushProjectDocument | 10 |
| `apps/desktop/src/features/sequences/SequencePanel.tsx` | Sequence panel | 12, 13 |
| `packages/canvas/src/sequences/SequenceStore.ts` | Sequence Zustand store | 12, 13 |
| `packages/canvas/src/sequences/SequenceEditor.tsx` | Sequence list/editor | 13 |
| `packages/canvas/src/sequences/SequencePlayer.tsx` | Playback controls | 13 |

---

### Task 1: Fix Rust serde crash on missing childNodeIds (Issue 1)

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/projects.rs:125`

- [ ] **Step 1: Add `#[serde(default)]` to `child_node_ids`**

In `apps/desktop/src-tauri/src/commands/projects.rs`, line 125 currently reads:

```rust
    pub child_node_ids: Vec<String>,
```

Change to:

```rust
    #[serde(default)]
    pub child_node_ids: Vec<String>,
```

- [ ] **Step 2: Run Rust tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1`
Expected: All existing tests pass. The deserialization path now tolerates absent `childNodeIds`.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/projects.rs
git commit -m "fix: add serde(default) to child_node_ids — unblocks persist for non-group nodes"
```

---

### Task 2: Delete drag-release transition CSS (Issue 3)

**Files:**
- Modify: `apps/desktop/src/styles.css:2238-2241`

- [ ] **Step 1: Remove the transition block**

Delete lines 2238–2241 in `apps/desktop/src/styles.css`:

```css
/* Smooth node repositioning (not during drag — React Flow adds .dragging) */
.react-flow__node:not(.dragging) {
  transition: transform 0.12s ease;
}
```

These 4 lines (comment + rule). React Flow handles drag via its own RAF loop; the CSS `transition: transform` conflicts and causes a 120ms rubber-band snap on mouse-up.

- [ ] **Step 2: Run frontend tests to confirm no breakage**

Run: `pnpm vitest run`
Expected: All pass. No test depends on this CSS transition.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/styles.css
git commit -m "fix: remove CSS transform transition that caused drag-release rubber-band"
```

---

### Task 3: Minimap hover-only visibility (Issue 8a)

**Files:**
- Modify: `apps/desktop/src/styles.css` (append after the `.flow-handle` block, around line 2236)

- [ ] **Step 1: Add minimap hover CSS**

Append these rules to `apps/desktop/src/styles.css`, right after the `.flow-handle` visibility rules (after the deleted transition block from Task 2):

```css
/* Minimap: hidden by default, visible on canvas hover */
.canvas-flow .react-flow__minimap {
  opacity: 0;
  transition: opacity 150ms ease;
  pointer-events: none;
}
.canvas-flow:hover .react-flow__minimap {
  opacity: 1;
  pointer-events: auto;
}
```

- [ ] **Step 2: Run frontend tests**

Run: `pnpm vitest run`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/styles.css
git commit -m "fix: hide minimap by default, show on canvas hover"
```

---

### Task 4: Fix AdaptiveNode fill sizing (Issue 2)

**Files:**
- Modify: `packages/canvas/src/nodes/NoteNode.tsx`
- Modify: `packages/canvas/src/nodes/ResourceNode.tsx`
- Modify: `packages/canvas/src/nodes/AdaptiveNode.tsx:44-68`
- Modify: `apps/desktop/src/styles.css:2163`

- [ ] **Step 1: Add `width:100%, height:100%` to AdaptiveNode root div**

In `packages/canvas/src/nodes/AdaptiveNode.tsx`, line 44–55, the root `<div>` currently has only class and style for CSS custom properties. Add `width: "100%"`, `height: "100%"`, and `overflow: "hidden"` to the inline style:

```tsx
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
          width: "100%",
          height: "100%",
          overflow: "hidden",
        } as React.CSSProperties
      }
    >
```

- [ ] **Step 2: Wrap Handle + AdaptiveNode in a fill container in NoteNode.tsx**

Replace the entire `NoteNode` return in `packages/canvas/src/nodes/NoteNode.tsx:15-36` with:

```tsx
export function NoteNode({ data, selected }: NodeProps<NoteNodeType>) {
  return (
    <>
      <NodeResizer
        minWidth={120}
        minHeight={60}
        isVisible={selected}
        lineStyle={{ borderColor: "rgba(74, 74, 255, 0.5)" }}
        handleStyle={{ borderColor: "rgba(74, 74, 255, 0.8)", background: "#0e0e22" }}
      />
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        <Handle type="target" position={Position.Top} className="flow-handle" />
        <AdaptiveNode
          nodeType="note"
          title={data.title}
          summary={data.summary}
          selected={selected}
          style={data.style}
        />
        <Handle type="source" position={Position.Bottom} className="flow-handle" />
      </div>
    </>
  );
}
```

`NodeResizer` stays as a direct sibling outside the wrapper — it resizes the React Flow wrapper element, and now the inner wrapper fills it.

- [ ] **Step 3: Same wrapper treatment in ResourceNode.tsx**

Replace the `ResourceNode` return in `packages/canvas/src/nodes/ResourceNode.tsx:16-37` with:

```tsx
export function ResourceNode({ data, selected }: NodeProps<ResourceNodeType>) {
  return (
    <>
      <NodeResizer
        minWidth={120}
        minHeight={60}
        isVisible={selected}
        lineStyle={{ borderColor: "rgba(39, 174, 96, 0.5)" }}
        handleStyle={{ borderColor: "rgba(39, 174, 96, 0.8)", background: "#0a140a" }}
      />
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        <Handle type="target" position={Position.Top} className="flow-handle" />
        <AdaptiveNode
          nodeType="resource"
          title={data.title}
          summary={data.summary}
          selected={selected}
          style={data.style}
        />
        <Handle type="source" position={Position.Bottom} className="flow-handle" />
      </div>
    </>
  );
}
```

- [ ] **Step 4: Change CSS max-width from 240px to 100%**

In `apps/desktop/src/styles.css:2163`, change:

```css
  max-width: 240px;
```

to:

```css
  max-width: 100%;
```

This is inside the `.adaptive-node--card` rule block (line 2157).

- [ ] **Step 5: Run frontend tests**

Run: `pnpm vitest run`
Expected: All pass. The node sizing tests in canvasStore test cover data, not DOM layout.

- [ ] **Step 6: Commit**

```bash
git add packages/canvas/src/nodes/NoteNode.tsx packages/canvas/src/nodes/ResourceNode.tsx packages/canvas/src/nodes/AdaptiveNode.tsx apps/desktop/src/styles.css
git commit -m "fix: AdaptiveNode fills React Flow wrapper — resize box now tracks node visual"
```

---

### Task 5: Add edge reconnection + connectOnClick (Issue 5)

**Files:**
- Modify: `packages/canvas/src/CanvasView.tsx:249-286`

- [ ] **Step 1: Add onReconnect and reconnectRadius to ReactFlow**

In `packages/canvas/src/CanvasView.tsx`, inside the `<ReactFlow>` props block (line 249–286), add these three props after the `onConnect={handleConnect}` prop (line 268):

```tsx
        onReconnect={(oldEdge, newConnection) => {
          onDeleteEdge?.(oldEdge.id);
          handleConnect(newConnection);
        }}
        reconnectRadius={20}
```

- [ ] **Step 2: Remove connectOnClick={false}**

Delete line 269:

```tsx
        connectOnClick={false}
```

This enables click-to-connect, making edge creation discoverable alongside the existing handle hover behavior.

- [ ] **Step 3: Run frontend tests**

Run: `pnpm vitest run`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add packages/canvas/src/CanvasView.tsx
git commit -m "fix: enable edge reconnection and click-to-connect on ReactFlow"
```

---

### Task 6: New nodes at viewport center instead of canvas origin (Issue 4)

**Files:**
- Modify: `packages/canvas/src/CanvasView.tsx:66-83,168-169,298,308`
- Modify: `packages/canvas/src/state/canvasStore.ts:258-263`
- Modify: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx:376-377`

- [ ] **Step 1: Add getViewportCenter helper inside CanvasViewInner**

In `packages/canvas/src/CanvasView.tsx`, after line 83 (`const { screenToFlowPosition, setCenter, getZoom } = useReactFlow();`), add:

```tsx
  const getViewportCenter = useCallback(() => {
    const container = document.querySelector('.canvas-flow') as HTMLElement;
    if (!container) return { x: 100, y: 100 };
    const rect = container.getBoundingClientRect();
    return screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    });
  }, [screenToFlowPosition]);
```

- [ ] **Step 2: Pass viewport center to onCreateNote callsites**

In the keyboard handler (line 168-169), change:

```tsx
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        onCreateNote?.();
      }
```

to:

```tsx
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        onCreateNote?.(getViewportCenter());
      }
```

In the canvas context menu (line 298), change:

```tsx
            { type: "item", label: "Add note", shortcut: "N", onClick: () => onCreateNote?.() },
```

to:

```tsx
            { type: "item", label: "Add note", shortcut: "N", onClick: () => onCreateNote?.(getViewportCenter()) },
```

In the "Add group" menu item (line 308), change:

```tsx
            { type: "item", label: "Add group", shortcut: "G", onClick: () => onCreateGroup?.() },
```

to:

```tsx
            { type: "item", label: "Add group", shortcut: "G", onClick: () => onCreateGroup?.(getViewportCenter()) },
```

- [ ] **Step 3: Remove nextPosition grid fallback from canvasStore**

In `packages/canvas/src/state/canvasStore.ts`, the `nextPosition` function (lines 258–263) is now unused by the viewport-aware callsites. However, `createNoteNode` and `createResourceNode` still use it as their default `position`. Leave the function but it will only serve as fallback for direct store calls without a position override. No code change needed here — the position override happens in `CanvasWorkspaceContext` (step 4).

- [ ] **Step 4: Remove the x:100,y:100 hardcode from context createGroupNode**

In `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx:373-378`, the `createGroupNode` callback currently hardcodes the fallback:

```tsx
      createGroupNode: (position) => {
        stores.store.getState().createGroupNode({
          title: "New group",
          x: position?.x ?? 100,
          y: position?.y ?? 100,
        });
      },
```

Now that `CanvasView` always supplies a position from `getViewportCenter()`, the `?? 100` values only fire if called outside CanvasView (toolbar buttons in CanvasScreen). Update CanvasScreen's toolbar to also pass position — see step 5.

- [ ] **Step 5: Update CanvasScreen toolbar buttons to pass position**

In `apps/desktop/src/features/canvas/CanvasScreen.tsx`, the toolbar's "Add note node" button (line 60) calls `workspace.createNoteNode()` with no position, and "Add resource node" (line 69) passes `{ x: 200, y: 200 }`. These toolbar buttons are outside the ReactFlow context, so they can't call `screenToFlowPosition`. The current behavior (store's `nextPosition` fallback) is acceptable for toolbar-initiated creation. No change needed here — the viewport-center fix covers the keyboard and context menu paths which are the primary UX paths.

- [ ] **Step 6: Run frontend tests**

Run: `pnpm vitest run`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add packages/canvas/src/CanvasView.tsx
git commit -m "fix: new nodes placed at viewport center via getViewportCenter()"
```

---

### Task 7: Sidebar drag-to-canvas (Issue 6d)

**Files:**
- Modify: `apps/desktop/src/layout/LeftOverlay.tsx:90-104`
- Modify: `packages/canvas/src/CanvasView.tsx:238-248`

- [ ] **Step 1: Make file entries draggable in LeftOverlay**

In `apps/desktop/src/layout/LeftOverlay.tsx`, the `<button>` for each file entry (lines 91–104) currently has no drag support. Add `draggable` and `onDragStart` to each button. Replace the button element (lines 91–104):

```tsx
            {workspace.entries.map((entry) => (
              <button
                key={entry.id}
                className="lo-file-row"
                data-selected={workspace.selectedEntryId === entry.id ? "true" : "false"}
                data-directory={entry.isDirectory ? "true" : "false"}
                style={{ paddingLeft: `${8 + entry.depth * 12}px` }}
                onClick={() => workspace.selectEntry(entry.id)}
                title={entry.relativePath}
                draggable={!entry.isDirectory}
                onDragStart={(e) => {
                  if (entry.isDirectory) {
                    e.preventDefault();
                    return;
                  }
                  e.dataTransfer.setData(
                    "application/x-canvas-entry",
                    JSON.stringify({
                      id: entry.id,
                      name: entry.name,
                      relativePath: entry.relativePath,
                      kind: entry.kind,
                    })
                  );
                  e.dataTransfer.effectAllowed = "copy";
                }}
              >
                <span className="lo-file-icon">
                  {entry.isDirectory ? "▸" : "·"}
                </span>
                <span className="lo-file-name">{entry.name}</span>
              </button>
            ))}
```

Uses a custom MIME type `application/x-canvas-entry` to avoid conflicts with plain text drag.

- [ ] **Step 2: Add onDragOver and onDrop to CanvasView wrapper div**

In `packages/canvas/src/CanvasView.tsx`, the wrapper `<div className="canvas-flow">` (line 239–248) needs drop handlers. Add after the existing `onMouseDown`:

```tsx
    <div
      className="canvas-flow"
      onMouseDown={(e: React.MouseEvent) => {
        const nodeEl = (e.target as HTMLElement).closest?.(".react-flow__node") as HTMLElement | null;
        if (nodeEl && e.shiftKey) {
          const nodeId = nodeEl.dataset["id"];
          if (nodeId) handleNodeMouseDown(e, nodeId);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-canvas-entry")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData("application/x-canvas-entry");
        if (!raw) return;
        e.preventDefault();
        try {
          const entry = JSON.parse(raw) as { id: string; name: string; relativePath: string; kind: string };
          const canvasPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          onCreateResourceFromFile?.({ id: entry.id, name: entry.name, path: entry.relativePath, kind: entry.kind }, canvasPos);
        } catch {
          // malformed drag data — ignore
        }
      }}
    >
```

- [ ] **Step 3: Run frontend tests**

Run: `pnpm vitest run`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/layout/LeftOverlay.tsx packages/canvas/src/CanvasView.tsx
git commit -m "feat: drag files from sidebar to canvas to create resource nodes"
```

---

### Task 8: Wire content pipeline — pass data to flowNodes + resource preview (Issue 6a)

**Files:**
- Modify: `packages/canvas/src/CanvasView.tsx:176-201` (flowNodes mapping)
- Modify: `packages/canvas/src/nodes/ResourceNode.tsx` (data interface)
- Modify: `packages/canvas/src/nodes/AdaptiveNode.tsx` (preview rendering)

- [ ] **Step 1: Pass resourceKind and absolutePath into flowNode data**

In `packages/canvas/src/CanvasView.tsx:176-201`, the `flowNodes` map currently only passes `summary`, `title`, `content`, and `style`. Add `resourceKind` and `absolutePath`:

Change the `data` object inside the `flowNodes` map (lines 182-197):

```tsx
    data: {
      summary:
        node.type === "resource"
          ? node.relativePath
          : node.type === "note"
            ? node.content
            : node.summary,
      title: node.title,
      content: node.type === "note" ? node.content : undefined,
      resourceKind: node.type === "resource" ? node.resourceKind : undefined,
      absolutePath: node.type === "resource" ? node.absolutePath : undefined,
      style: {
        dotColour: node.dotColour ?? undefined,
        bgColour: node.bgColour ?? undefined,
        textColour: node.textColour ?? undefined,
        thumbnail: node.thumbnail ?? undefined,
      },
    },
```

- [ ] **Step 2: Update ResourceNodeData interface**

In `packages/canvas/src/nodes/ResourceNode.tsx`, the `ResourceNodeData` interface (lines 5-12) already has `absolutePath` and `resourceKind` as optional fields. No change needed — these fields are already declared.

- [ ] **Step 3: Pass resourceKind and absolutePath through to AdaptiveNode**

In `packages/canvas/src/nodes/ResourceNode.tsx`, the `AdaptiveNode` call (lines 27-33) doesn't forward `resourceKind` or `absolutePath`. Update:

```tsx
        <AdaptiveNode
          nodeType="resource"
          title={data.title}
          summary={data.summary}
          selected={selected}
          style={data.style}
          resourceKind={data.resourceKind}
          absolutePath={data.absolutePath}
        />
```

- [ ] **Step 4: Add resourceKind and absolutePath props to AdaptiveNode**

In `packages/canvas/src/nodes/AdaptiveNode.tsx`, add to the `AdaptiveNodeProps` interface (line 28-34):

```tsx
interface AdaptiveNodeProps {
  nodeType: "resource" | "note" | "group" | "portal";
  title: string;
  summary?: string;
  selected?: boolean;
  style?: AdaptiveNodeStyle;
  resourceKind?: string;
  absolutePath?: string;
}
```

Update the function signature (line 36):

```tsx
export function AdaptiveNode({ nodeType, title, summary, selected, style, resourceKind, absolutePath }: AdaptiveNodeProps) {
```

- [ ] **Step 5: Render image thumbnail in AdaptiveNode card level**

In `AdaptiveNode.tsx`, inside the `level === "card"` block (lines 59-66), add an image preview for resource nodes with `resourceKind === "image"`. Replace the card block:

```tsx
      {level === "card" && (
        <>
          <span className="an-type">{nodeType}</span>
          {resourceKind === "image" && absolutePath ? (
            <img
              className="an-thumbnail"
              src={`asset://localhost/${absolutePath}`}
              alt=""
            />
          ) : style?.thumbnail ? (
            <img className="an-thumbnail" src={style.thumbnail} alt="" />
          ) : null}
          {summary && <span className="an-summary">{summary}</span>}
        </>
      )}
```

- [ ] **Step 6: Run frontend tests**

Run: `pnpm vitest run`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add packages/canvas/src/CanvasView.tsx packages/canvas/src/nodes/ResourceNode.tsx packages/canvas/src/nodes/AdaptiveNode.tsx
git commit -m "feat: pass resourceKind/absolutePath to node data, render image thumbnails in card view"
```

---

### Task 9: Wire viewer components into ContentTab and FullScreenReader (Issue 6b/c)

**Files:**
- Modify: `apps/desktop/src/features/viewer/ContentTab.tsx`
- Modify: `apps/desktop/src/layout/FullScreenReader.tsx`

- [ ] **Step 1: Rewrite ContentTab to use @research-canvas/viewers**

Replace the entire `apps/desktop/src/features/viewer/ContentTab.tsx`:

```tsx
import { useEffect, useState } from "react";
import {
  ImageViewer,
  MarkdownViewer,
  NoteViewer,
  PdfViewer,
  FileMetaViewer,
} from "@research-canvas/viewers";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";

interface ContentTabProps {
  onFullScreen: () => void;
}

export function ContentTab({ onFullScreen }: ContentTabProps) {
  const workspace = useCanvasWorkspace();
  const node = workspace.nodes.find((n) => n.id === workspace.selectedNodeId) ?? null;
  const [textContent, setTextContent] = useState<string | null>(null);

  useEffect(() => {
    setTextContent(null);
    if (!node) return;
    if (node.type === "resource" && node.absolutePath && (node.resourceKind === "markdown" || node.resourceKind === "text")) {
      fetch(`asset://localhost/${node.absolutePath}`)
        .then((r) => r.text())
        .then(setTextContent)
        .catch(() => setTextContent(null));
    }
  }, [node?.id, node?.type, node?.absolutePath, node?.resourceKind]);

  if (!node) {
    return <div className="content-tab-empty">No node selected</div>;
  }

  return (
    <div className="content-tab">
      <div className="content-tab__toolbar">
        <span className="content-tab__title">{node.title}</span>
        <button
          className="content-tab__fullscreen-btn"
          onClick={onFullScreen}
          title="Full screen"
        >
          ⤢
        </button>
      </div>
      <div className="content-tab__body">
        {node.type === "note" ? (
          <NoteViewer
            title={node.title}
            content={node.content ?? ""}
            tags={node.tags}
          />
        ) : node.type === "resource" && node.resourceKind === "image" && node.absolutePath ? (
          <ImageViewer
            source={`asset://localhost/${node.absolutePath}`}
            title={node.title}
          />
        ) : node.type === "resource" && node.resourceKind === "pdf" && node.absolutePath ? (
          <PdfViewer
            source={`asset://localhost/${node.absolutePath}`}
            title={node.title}
          />
        ) : node.type === "resource" && node.resourceKind === "markdown" && textContent !== null ? (
          <MarkdownViewer content={textContent} />
        ) : node.type === "resource" && node.resourceKind === "text" && textContent !== null ? (
          <MarkdownViewer content={textContent} />
        ) : node.type === "resource" ? (
          <FileMetaViewer
            title={node.title}
            absolutePath={node.absolutePath ?? ""}
            relativePath={node.relativePath ?? ""}
            mimeType={node.mimeType ?? ""}
            resourceKind={node.resourceKind ?? "binary"}
            fileFingerprint={node.fileFingerprint ?? ""}
          />
        ) : (
          <div className="content-tab__placeholder">No content</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite FullScreenReader to use @research-canvas/viewers**

Replace the entire `apps/desktop/src/layout/FullScreenReader.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { CanvasNode } from "@research-canvas/schema";
import {
  ImageViewer,
  MarkdownViewer,
  NoteViewer,
  PdfViewer,
  FileMetaViewer,
} from "@research-canvas/viewers";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";

interface FullScreenReaderProps {
  onClose: () => void;
}

export function FullScreenReader({ onClose }: FullScreenReaderProps) {
  const workspace = useCanvasWorkspace();
  const node: CanvasNode | null =
    workspace.nodes.find((n) => n.id === workspace.selectedNodeId) ?? null;
  const [textContent, setTextContent] = useState<string | null>(null);

  useEffect(() => {
    setTextContent(null);
    if (!node) return;
    if (node.type === "resource" && node.absolutePath && (node.resourceKind === "markdown" || node.resourceKind === "text")) {
      fetch(`asset://localhost/${node.absolutePath}`)
        .then((r) => r.text())
        .then(setTextContent)
        .catch(() => setTextContent(null));
    }
  }, [node?.id, node?.type, node?.absolutePath, node?.resourceKind]);

  useEffect(() => {
    if (!node) onClose();
  }, [node, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!node) {
    return null;
  }

  return (
    <div className="fullscreen-reader">
      <header className="fullscreen-reader__header">
        <nav className="fullscreen-reader__breadcrumb">
          <span>{workspace.activeProject?.displayName ?? "Project"}</span>
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
        {node.type === "note" ? (
          <NoteViewer
            title={node.title}
            content={node.content ?? ""}
            tags={node.tags}
          />
        ) : node.type === "resource" && node.resourceKind === "image" && node.absolutePath ? (
          <ImageViewer
            source={`asset://localhost/${node.absolutePath}`}
            title={node.title}
          />
        ) : node.type === "resource" && node.resourceKind === "pdf" && node.absolutePath ? (
          <PdfViewer
            source={`asset://localhost/${node.absolutePath}`}
            title={node.title}
          />
        ) : node.type === "resource" && (node.resourceKind === "markdown" || node.resourceKind === "text") && textContent !== null ? (
          <MarkdownViewer content={textContent} />
        ) : node.type === "resource" ? (
          <FileMetaViewer
            title={node.title}
            absolutePath={node.absolutePath ?? ""}
            relativePath={node.relativePath ?? ""}
            mimeType={node.mimeType ?? ""}
            resourceKind={node.resourceKind ?? "binary"}
            fileFingerprint={node.fileFingerprint ?? ""}
          />
        ) : (
          <div className="fsr-placeholder">No content</div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Check that FileMetaViewer props match the component signature**

The `FileMetaViewer` in `packages/viewers/src/FileMetaViewer.tsx` expects props: `title`, `absolutePath`, `relativePath`, `mimeType`, `resourceKind`, `fileFingerprint`. Verify by reading the file — the interface should match what we're passing.

- [ ] **Step 4: Run frontend tests**

Run: `pnpm vitest run`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/viewer/ContentTab.tsx apps/desktop/src/layout/FullScreenReader.tsx
git commit -m "feat: wire @research-canvas/viewers into ContentTab and FullScreenReader with asset:// fetch"
```

---

### Task 10: Fix project-switch data loss (Issue 7)

**Files:**
- Modify: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx:192-264,407`
- Modify: `packages/desktop-api/src/index.ts:193-195`

- [ ] **Step 1: Implement real flushProjectDocument in Tauri transport**

In `packages/desktop-api/src/index.ts`, the Tauri transport's `flushProjectDocument` (lines 193-195) returns `false` unconditionally. Replace it with a synchronous-style invoke:

```tsx
    async flushProjectDocument(request) {
      try {
        await invokeTauri<ProjectDocument>("persist_project_document_command", {
          request
        });
        return true;
      } catch {
        return false;
      }
    },
```

Note: this changes the return type from `boolean` to `Promise<boolean>`. Check the `WorkspaceTransport` interface definition to see if `flushProjectDocument` is typed as sync or async.

- [ ] **Step 2: Check WorkspaceTransport interface**

Read the `WorkspaceTransport` interface in `packages/desktop-api/src/index.ts` to find the `flushProjectDocument` signature. If it's typed as `flushProjectDocument(request?: PersistProjectDocumentRequest): boolean`, change it to `flushProjectDocument(request?: PersistProjectDocumentRequest): boolean | Promise<boolean>`.

- [ ] **Step 3: Make selectProject flush before switching**

In `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`, the `selectProject` callback (line 407) is currently just:

```tsx
      selectProject: setActiveProjectId,
```

Replace it with an async flush-then-switch:

```tsx
      selectProject: async (projectId: string) => {
        // Flush current state before switching
        if (activeProject && databasePath) {
          const currentState = {
            annotations: stores.annotationStore.getState().serialize(),
            canvasId: activeProject.primaryCanvasId,
            databasePath,
            edges: stores.store.getState().serialize().edges,
            nodes: stores.store.getState().serialize().nodes,
            projectId: activeProject.id,
            sequenceSteps: stores.sequenceStore.getState().serialize().steps,
            sequences: stores.sequenceStore.getState().serialize().sequences,
          };
          await transport.persistProjectDocument(currentState);
        }
        setActiveProjectId(projectId);
      },
```

- [ ] **Step 4: Split the cancelled flag — protect state updates, not the persist call**

In the persist effect (lines 192-265), the `cancelled` flag currently aborts the entire persist cycle. The Tauri write should still complete even if the effect is cleaning up — only the subsequent `setActiveProject` / `setEntries` / etc. calls should be skipped (they'd overwrite the new project's state).

The current code at line 224 does `if (cancelled) { return; }` right after the `await transport.persistProjectDocument(...)` completes. This is already correct — the persist has finished by this point, and we're only skipping the state updates. The bug described in the audit (persist call being cancelled mid-flight) doesn't actually occur because `cancelled` is checked *after* the await, not before. The real issue was that `selectProject` didn't flush — which Step 3 fixes.

No change needed here.

- [ ] **Step 5: Run frontend tests**

Run: `pnpm vitest run`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx packages/desktop-api/src/index.ts
git commit -m "fix: flush current project state before switching — prevents data loss on project change"
```

---

### Task 11: Panel change triggers fitView (Issue 8b)

**Files:**
- Modify: `apps/desktop/src/layout/useShellLayout.ts` (export `leftOpen`, `rightOpen` — already exported)
- Modify: `apps/desktop/src/layout/Shell.tsx` (pass panel state down)
- Modify: `apps/desktop/src/layout/CanvasPane.tsx` (thread props)
- Modify: `apps/desktop/src/features/canvas/CanvasScreen.tsx` (thread props)
- Modify: `packages/canvas/src/CanvasView.tsx` (accept + react to panel state)

- [ ] **Step 1: Add leftOpen/rightOpen props to CanvasView**

In `packages/canvas/src/CanvasView.tsx`, add to the `CanvasViewProps` interface (line 30-46):

```tsx
  leftPanelOpen?: boolean;
  rightPanelOpen?: boolean;
```

Add to the destructuring in `CanvasViewInner` (line 66-82):

```tsx
  leftPanelOpen,
  rightPanelOpen,
```

- [ ] **Step 2: Add fitView effect on panel change inside CanvasViewInner**

In `packages/canvas/src/CanvasView.tsx`, inside `CanvasViewInner`, after the `getViewportCenter` callback (added in Task 6), add:

```tsx
  const { fitView } = useReactFlow();

  useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.15 }), 200);
    return () => clearTimeout(timer);
  }, [leftPanelOpen, rightPanelOpen, fitView]);
```

Note: `useReactFlow()` is already destructured on line 83 — just add `fitView` to the destructured names:

```tsx
  const { screenToFlowPosition, setCenter, getZoom, fitView } = useReactFlow();
```

- [ ] **Step 3: Thread panel state through Shell → CanvasPane → CanvasScreen → CanvasView**

In `apps/desktop/src/layout/Shell.tsx`, pass `leftOpen` and `rightOpen` to `CanvasPane` (line 80-83):

```tsx
        <CanvasPane
          onNodeSelect={handleNodeSelect}
          onNodeDoubleClick={handleNodeDoubleClick}
          leftPanelOpen={layout.leftOpen}
          rightPanelOpen={layout.rightOpen}
        />
```

In `apps/desktop/src/layout/CanvasPane.tsx`, accept and forward the props:

```tsx
interface CanvasPaneProps {
  onNodeSelect?: (nodeId: string) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  leftPanelOpen?: boolean;
  rightPanelOpen?: boolean;
}

export function CanvasPane({ onNodeSelect, onNodeDoubleClick, leftPanelOpen, rightPanelOpen }: CanvasPaneProps) {
  return (
    <section
      className="canvas-pane"
      data-testid="canvas-pane"
      style={{ position: "absolute", inset: 0, left: 26 }}
    >
      <CanvasScreen
        onNodeSelect={onNodeSelect}
        onNodeDoubleClick={onNodeDoubleClick}
        leftPanelOpen={leftPanelOpen}
        rightPanelOpen={rightPanelOpen}
      />
    </section>
  );
}
```

In `apps/desktop/src/features/canvas/CanvasScreen.tsx`, accept and forward:

Add to `CanvasScreenProps` (line 7-10):

```tsx
interface CanvasScreenProps {
  onNodeSelect?: (nodeId: string) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  leftPanelOpen?: boolean;
  rightPanelOpen?: boolean;
}
```

Update function signature (line 12):

```tsx
export function CanvasScreen({ onNodeSelect, onNodeDoubleClick, leftPanelOpen, rightPanelOpen }: CanvasScreenProps) {
```

Add to the `<CanvasView>` call (line 99-138), after `fileEntries`:

```tsx
            leftPanelOpen={leftPanelOpen}
            rightPanelOpen={rightPanelOpen}
```

- [ ] **Step 4: Run frontend tests**

Run: `pnpm vitest run`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas/src/CanvasView.tsx apps/desktop/src/layout/Shell.tsx apps/desktop/src/layout/CanvasPane.tsx apps/desktop/src/features/canvas/CanvasScreen.tsx
git commit -m "fix: canvas fitView on panel open/close — viewport adjusts to visible area"
```

---

### Task 12: Add Sequences tab to right panel (Issue 9 — Phase 1)

**Files:**
- Modify: `apps/desktop/src/layout/useShellLayout.ts:3`
- Modify: `apps/desktop/src/layout/RightPanelSlot.tsx:1-19,56-67`

- [ ] **Step 1: Add "sequences" to RightTab union**

In `apps/desktop/src/layout/useShellLayout.ts:3`, change:

```tsx
export type RightTab = "inspector" | "content" | "terminal";
```

to:

```tsx
export type RightTab = "inspector" | "content" | "terminal" | "sequences";
```

- [ ] **Step 2: Add Sequences tab to TABS array**

In `apps/desktop/src/layout/RightPanelSlot.tsx`, add `SequencePanel` import at line 1:

```tsx
import { SequencePanel } from "../features/sequences/SequencePanel";
```

In the TABS array (line 15-19), add the sequences entry:

```tsx
const TABS: { id: RightTab; label: string }[] = [
  { id: "inspector", label: "Inspector" },
  { id: "content", label: "Content" },
  { id: "terminal", label: "Terminal" },
  { id: "sequences", label: "Sequences" },
];
```

- [ ] **Step 3: Add SequencePanel pane to RightPanelSlot body**

In `apps/desktop/src/layout/RightPanelSlot.tsx`, after the terminal pane (line 64-66), add:

```tsx
          <div className="rps-pane" data-visible={activeTab === "sequences" ? "true" : "false"}>
            <SequencePanel />
          </div>
```

- [ ] **Step 4: Run frontend tests**

Run: `pnpm vitest run`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/layout/useShellLayout.ts apps/desktop/src/layout/RightPanelSlot.tsx
git commit -m "feat: add Sequences tab to right panel — SequencePanel now reachable"
```

---

### Task 13: Sequence camera fly-to + authoring MVP (Issue 9 — Phase 2+3)

**Files:**
- Modify: `packages/canvas/src/CanvasView.tsx` (expose flyToNode via callback prop)
- Modify: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx` (add flyToNode to context)
- Modify: `apps/desktop/src/features/canvas/CanvasScreen.tsx` (wire flyToNode callback)
- Modify: `apps/desktop/src/features/sequences/SequencePanel.tsx` (call flyToNode, add authoring UI)
- Modify: `packages/canvas/src/sequences/SequenceStore.ts` (add removeStep, removeSequence)

- [ ] **Step 1: Add onFlyToNode callback prop to CanvasView**

In `packages/canvas/src/CanvasView.tsx`, add to `CanvasViewProps`:

```tsx
  onRegisterFlyToNode?: (flyTo: (nodeId: string, viewport?: { x: number; y: number; zoom: number }) => void) => void;
```

- [ ] **Step 2: Register flyToNode inside CanvasViewInner**

Inside `CanvasViewInner`, after the `fitView` effect (from Task 11), add:

```tsx
  const flyToNode = useCallback(
    (nodeId: string, viewport?: { x: number; y: number; zoom: number }) => {
      if (viewport) {
        setCenter(viewport.x, viewport.y, { duration: 500, zoom: viewport.zoom });
      } else {
        const node = nodes.find((n) => n.id === nodeId);
        if (node) {
          setCenter(
            node.position.x + (node.size?.width ?? 200) / 2,
            node.position.y + (node.size?.height ?? 140) / 2,
            { duration: 500, zoom: Math.max(1, getZoom()) }
          );
        }
      }
    },
    [nodes, setCenter, getZoom]
  );

  useEffect(() => {
    onRegisterFlyToNode?.(flyToNode);
  }, [flyToNode, onRegisterFlyToNode]);
```

Add `onRegisterFlyToNode` to the destructured props of `CanvasViewInner`.

- [ ] **Step 3: Add flyToNode to CanvasWorkspaceContext**

In `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`, add to `CanvasWorkspaceContextValue` interface:

```tsx
  flyToNode: (nodeId: string, viewport?: { x: number; y: number; zoom: number }) => void;
  registerFlyToNode: (fn: (nodeId: string, viewport?: { x: number; y: number; zoom: number }) => void) => void;
```

In `CanvasWorkspaceProvider`, add a ref to store the flyTo function:

```tsx
  const flyToNodeRef = useRef<(nodeId: string, viewport?: { x: number; y: number; zoom: number }) => void>(() => {});
```

In the `contextValue` useMemo, add:

```tsx
      flyToNode: (nodeId, viewport) => flyToNodeRef.current(nodeId, viewport),
      registerFlyToNode: (fn) => { flyToNodeRef.current = fn; },
```

- [ ] **Step 4: Wire registerFlyToNode through CanvasScreen**

In `apps/desktop/src/features/canvas/CanvasScreen.tsx`, add the `onRegisterFlyToNode` prop to the `<CanvasView>` call:

```tsx
            onRegisterFlyToNode={workspace.registerFlyToNode}
```

- [ ] **Step 5: Add removeStep and removeSequence to SequenceStore**

In `packages/canvas/src/sequences/SequenceStore.ts`, add to the `SequenceStoreState` interface:

```tsx
  removeStep: (stepId: string) => void;
  removeSequence: (sequenceId: string) => void;
```

Add implementations inside the store (after `playStep`):

```tsx
    removeStep: (stepId) => {
      set((state) =>
        withActiveStep({
          ...state,
          steps: state.steps.filter((s) => s.id !== stepId),
          activeStepIndex: Math.min(
            state.activeStepIndex,
            state.steps.filter((s) => s.id !== stepId).length - 1
          ),
        })
      );
    },
    removeSequence: (sequenceId) => {
      set((state) =>
        withActiveStep({
          ...state,
          sequences: state.sequences.filter((s) => s.id !== sequenceId),
          steps: state.steps.filter((s) => s.sequenceId !== sequenceId),
          activeSequenceId:
            state.activeSequenceId === sequenceId ? null : state.activeSequenceId,
          activeStepIndex:
            state.activeSequenceId === sequenceId ? -1 : state.activeStepIndex,
        })
      );
    },
```

- [ ] **Step 6: Rewrite SequencePanel with flyToNode + authoring**

Replace `apps/desktop/src/features/sequences/SequencePanel.tsx`:

```tsx
import { useCallback } from "react";
import { SequenceEditor, SequencePlayer } from "@research-canvas/canvas";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";

export function SequencePanel() {
  const workspace = useCanvasWorkspace();
  const activeSequenceSteps = workspace.activeSequenceId
    ? workspace.sequenceStore.getState().stepsForSequence(workspace.activeSequenceId)
    : [];

  const playNextStep = useCallback(() => {
    workspace.sequenceStore.getState().playNextStep();
    const activeStep = workspace.sequenceStore.getState().activeStep;
    if (activeStep?.targetType === "node") {
      workspace.selectNode(activeStep.targetId);
      workspace.flyToNode(activeStep.targetId, activeStep.viewport);
    }
  }, [workspace]);

  const handleAddCurrentNode = useCallback(() => {
    if (!workspace.activeSequenceId || !workspace.selectedNodeId) return;
    workspace.sequenceStore.getState().addNodeStep(workspace.activeSequenceId, {
      caption: workspace.nodes.find((n) => n.id === workspace.selectedNodeId)?.title ?? "Step",
      targetId: workspace.selectedNodeId,
      viewport: { x: 0, y: 0, zoom: 1 },
    });
  }, [workspace]);

  const handleCreateSequence = useCallback(() => {
    const name = window.prompt("Sequence name:", "New sequence");
    if (!name) return;
    workspace.sequenceStore.getState().createSequence({
      kind: "storyboard",
      name,
    });
  }, [workspace]);

  const handleDeleteStep = useCallback(
    (stepId: string) => {
      workspace.sequenceStore.getState().removeStep(stepId);
    },
    [workspace]
  );

  const handleDeleteSequence = useCallback(
    (sequenceId: string) => {
      workspace.sequenceStore.getState().removeSequence(sequenceId);
    },
    [workspace]
  );

  return (
    <section className="sequence-panel">
      <div className="sequence-panel__actions">
        <button onClick={handleCreateSequence} type="button">
          New sequence
        </button>
        {workspace.activeSequenceId && workspace.selectedNodeId && (
          <button onClick={handleAddCurrentNode} type="button">
            Add selected node
          </button>
        )}
      </div>

      <SequenceEditor
        activeSequenceId={workspace.activeSequenceId}
        sequences={workspace.sequences}
        steps={activeSequenceSteps}
      />

      {/* Step list with delete */}
      {activeSequenceSteps.length > 0 && (
        <div className="sequence-panel__steps">
          <h4>Steps</h4>
          <ol>
            {activeSequenceSteps.map((step, i) => (
              <li key={step.id} data-active={workspace.activeStepIndex === i ? "true" : "false"}>
                <span>{step.caption}</span>
                <button
                  onClick={() => handleDeleteStep(step.id)}
                  title="Remove step"
                  type="button"
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Sequence delete */}
      {workspace.activeSequenceId && (
        <button
          className="sequence-panel__delete"
          onClick={() => handleDeleteSequence(workspace.activeSequenceId!)}
          type="button"
        >
          Delete sequence
        </button>
      )}

      <SequencePlayer
        activeStep={workspace.activeStep}
        activeStepIndex={workspace.activeStepIndex}
        onPlayNext={playNextStep}
      />
    </section>
  );
}
```

- [ ] **Step 7: Update CanvasScreen's createSequence to open the Sequences tab**

In `apps/desktop/src/features/canvas/CanvasScreen.tsx`, the existing `createSequence` callback (lines 26-37) creates/activates a sequence but doesn't open the panel. This is already handled by the fact that the toolbar button exists. For now, no change needed — users can click the Sequences tab in the right panel after creating.

- [ ] **Step 8: Run frontend tests**

Run: `pnpm vitest run`
Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add packages/canvas/src/CanvasView.tsx apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx apps/desktop/src/features/canvas/CanvasScreen.tsx apps/desktop/src/features/sequences/SequencePanel.tsx packages/canvas/src/sequences/SequenceStore.ts
git commit -m "feat: sequence camera fly-to, step authoring UI, removeStep/removeSequence store actions"
```

---

## Execution Summary

| Task | Issue | What | Files touched |
|------|-------|------|--------------|
| 1 | #1 | `#[serde(default)]` on `child_node_ids` | 1 Rust file |
| 2 | #3 | Delete drag transition CSS | 1 CSS file |
| 3 | #8a | Minimap hover CSS | 1 CSS file |
| 4 | #2 | AdaptiveNode fills wrapper | 4 files |
| 5 | #5 | Edge reconnect + click-to-connect | 1 file |
| 6 | #4 | Viewport center node placement | 1 file |
| 7 | #6d | Sidebar drag-to-canvas | 2 files |
| 8 | #6a | Resource data in flowNodes + thumbnails | 3 files |
| 9 | #6b/c | Wire viewer components + asset fetch | 2 files |
| 10 | #7 | Flush before project switch | 2 files |
| 11 | #8b | fitView on panel change | 4 files |
| 12 | #9p1 | Sequences tab in right panel | 2 files |
| 13 | #9p2+3 | Camera fly-to + authoring MVP | 5 files |

Tasks 1–3 are independent single-file changes (parallelizable).
Tasks 4→5 are sequential (5 depends on 4 fixing handle positions).
Tasks 6, 7, 8 are independent of each other (parallelizable after 4).
Task 9 depends on 8 (needs resourceKind/absolutePath in node data).
Task 10 is independent.
Task 11 depends on 6 (uses the same CanvasView modifications).
Tasks 12→13 are sequential (13 needs the tab from 12).

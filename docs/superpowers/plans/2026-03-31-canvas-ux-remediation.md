# Canvas UX Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 9 reported issues: style persistence, colour rendering, edge UX, camera centering, node animations, note resizing, terminal workdir/layout, and left-sidebar wiring.

**Architecture:** Issues fall into three layers — Rust persistence pipeline (CanvasNodePayload missing style fields), React canvas rendering (CanvasView not passing style to nodes), and UI/UX polish (edge labels, animations, resizing, terminal, sidebar). Tasks are ordered so the persistence fix lands first, unblocking everything above it.

**Tech Stack:** Rust/rusqlite (persistence), React 18 + @xyflow/react (canvas), Zustand (state), Tauri v2 (IPC), xterm.js (terminal), TypeScript

---

## File Map

| File | Change |
|------|--------|
| `apps/desktop/src-tauri/src/commands/projects.rs` | Add style fields to `CanvasNodePayload`, `node_payload()`, and INSERT SQL |
| `packages/canvas/src/CanvasView.tsx` | Pass style into flowNodes data; add edge delete handler; add camera-centre-on-add effect |
| `packages/canvas/src/nodes/NoteNode.tsx` | Add `NodeResizer` |
| `packages/canvas/src/nodes/ResourceNode.tsx` | Add `NodeResizer` |
| `packages/canvas/src/edges/AnnotatedEdge.tsx` | Compact pill label; make edge clickable/selectable |
| `apps/desktop/src/features/canvas/CanvasScreen.tsx` | Remove "Link latest nodes" button; wire `onResizeNode` |
| `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx` | Add `resizeNode`; surface actual Rust error strings |
| `packages/canvas/src/state/canvasStore.ts` | Add `updateNodeSize` action |
| `apps/desktop/src/features/terminal/useTerminal.ts` | Accept `workdir` param, pass to `createSession` |
| `apps/desktop/src/features/terminal/TerminalPane.tsx` | Accept `workdir` prop; get `workingRoot` from workspace |
| `apps/desktop/src/layout/RightPanelSlot.tsx` | Pass `workingRoot` to `TerminalPane` |
| `apps/desktop/src/layout/LeftOverlay.tsx` | Wire projects, file tree, Add Folder button |
| `apps/desktop/src/styles.css` | Edge label CSS; node animation; terminal layout |

---

## Task 1: Fix style fields in the Rust persistence pipeline

Three places in `projects.rs` all need the same 4 fields added: the payload struct, the `node_payload()` conversion, and the INSERT SQL.

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/projects.rs:107-129` (CanvasNodePayload struct)
- Modify: `apps/desktop/src-tauri/src/commands/projects.rs:618-670` (INSERT SQL)
- Modify: `apps/desktop/src-tauri/src/commands/projects.rs:981-1012` (node_payload function)

- [ ] **Step 1: Add style fields to `CanvasNodePayload`**

In `projects.rs`, the struct starting at line 107 currently ends at `updated_at`. Add 4 fields before `created_at`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasNodePayload {
    pub id: String,
    pub canvas_id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub title: String,
    pub position: PositionPayload,
    pub size: SizePayload,
    pub summary: String,
    pub content: Option<String>,
    pub tags: Vec<String>,
    pub resource_kind: Option<String>,
    pub absolute_path: Option<String>,
    pub relative_path: Option<String>,
    pub mime_type: Option<String>,
    pub file_fingerprint: Option<String>,
    pub url: Option<String>,
    pub color: Option<String>,
    pub child_node_ids: Vec<String>,
    pub target_canvas_id: Option<String>,
    pub dot_colour: Option<String>,
    pub bg_colour: Option<String>,
    pub text_colour: Option<String>,
    pub thumbnail: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
```

- [ ] **Step 2: Add style fields to `node_payload()`**

The function at line 981 builds `CanvasNodePayload` from `CanvasNodeRecord`. Add the 4 style fields before `created_at`:

```rust
fn node_payload(
    record: crate::db::repositories::CanvasNodeRecord,
) -> Result<CanvasNodePayload, String> {
    Ok(CanvasNodePayload {
        id: record.id,
        canvas_id: record.canvas_id,
        node_type: record.node_type,
        title: record.title,
        position: PositionPayload {
            x: record.position_x,
            y: record.position_y,
        },
        size: SizePayload {
            width: record.width,
            height: record.height,
        },
        summary: record.summary,
        content: record.content,
        tags: record.tags,
        resource_kind: record.resource_kind,
        absolute_path: record.absolute_path,
        relative_path: record.relative_path,
        mime_type: record.mime_type,
        file_fingerprint: record.file_fingerprint,
        url: record.url,
        color: record.color,
        child_node_ids: record.child_node_ids,
        target_canvas_id: record.target_canvas_id,
        dot_colour: record.dot_colour,
        bg_colour: record.bg_colour,
        text_colour: record.text_colour,
        thumbnail: record.thumbnail,
        created_at: record.created_at,
        updated_at: record.updated_at,
    })
}
```

- [ ] **Step 3: Add style columns to the canvas_nodes INSERT**

The INSERT at line 618 currently lists 22 columns. Extend it to include the 4 style columns (insert them between `target_canvas_id` and `created_at`):

```rust
connection
    .execute(
        "INSERT INTO canvas_nodes (
            id,
            canvas_id,
            type,
            title,
            summary,
            position_x,
            position_y,
            width,
            height,
            content,
            tags,
            resource_kind,
            absolute_path,
            relative_path,
            mime_type,
            file_fingerprint,
            url,
            color,
            child_node_ids,
            target_canvas_id,
            dot_colour,
            bg_colour,
            text_colour,
            thumbnail,
            created_at,
            updated_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
            ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26
        )",
        params![
            node.id,
            node.canvas_id,
            node.node_type,
            node.title,
            node.summary,
            node.position.x,
            node.position.y,
            node.size.width,
            node.size.height,
            node.content.as_deref(),
            tags,
            node.resource_kind.as_deref(),
            node.absolute_path.as_deref(),
            node.relative_path.as_deref(),
            node.mime_type.as_deref(),
            node.file_fingerprint.as_deref(),
            node.url.as_deref(),
            node.color.as_deref(),
            child_node_ids,
            node.target_canvas_id.as_deref(),
            node.dot_colour.as_deref(),
            node.bg_colour.as_deref(),
            node.text_colour.as_deref(),
            node.thumbnail.as_deref(),
            node.created_at,
            node.updated_at,
        ],
    )
    .map_err(|error| error.to_string())?;
```

- [ ] **Step 4: Improve error surfacing in CanvasWorkspaceContext**

Currently when a Tauri command fails with a string error, the catch block shows "failed to persist workspace" instead of the actual message. In `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`, find the catch at line ~235:

```ts
} catch (error) {
  if (cancelled) {
    return;
  }

  setErrorMessage(
    error instanceof Error ? error.message : "failed to persist workspace"
  );
}
```

Replace with:

```ts
} catch (error) {
  if (cancelled) {
    return;
  }

  setErrorMessage(
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "failed to persist workspace"
  );
}
```

- [ ] **Step 5: Compile and run Rust tests**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1 2>&1 | tail -20
```

Expected: all tests pass (including `db_migrations` and `canvas_repository`).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/projects.rs apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx
git commit -m "fix: style fields round-trip through persist pipeline"
```

---

## Task 2: Wire style fields into canvas node rendering

`CanvasView.tsx` builds `flowNodes` from the workspace nodes but only passes `summary` and `title` into `data`. Style fields need to be passed too so `AdaptiveNode` can render dot colour, background, and text colour.

**Files:**
- Modify: `packages/canvas/src/CanvasView.tsx:136-152` (flowNodes mapping)

- [ ] **Step 1: Update `flowNodes` mapping in `CanvasView.tsx`**

Find the `flowNodes` mapping (currently around line 136):

```ts
const flowNodes: Node[] = nodes.map((node) => ({
  id: node.id,
  type: node.type === "portal" ? "group" : node.type,
  position: node.position,
  data: {
    summary:
      node.type === "resource"
        ? node.relativePath
        : node.type === "note"
          ? node.content
          : node.summary,
    title: node.title
  },
  draggable: true,
  selectable: true,
  selected: node.id === selectedNodeId
}));
```

Replace with:

```ts
const flowNodes: Node[] = nodes.map((node) => ({
  id: node.id,
  type: node.type === "portal" ? "group" : node.type,
  position: node.position,
  width: node.size?.width,
  height: node.size?.height,
  data: {
    summary:
      node.type === "resource"
        ? node.relativePath
        : node.type === "note"
          ? node.content
          : node.summary,
    title: node.title,
    content: node.type === "note" ? node.content : undefined,
    style: {
      dotColour: node.dotColour ?? undefined,
      bgColour: node.bgColour ?? undefined,
      textColour: node.textColour ?? undefined,
      thumbnail: node.thumbnail ?? undefined,
    },
  },
  draggable: true,
  selectable: true,
  selected: node.id === selectedNodeId
}));
```

- [ ] **Step 2: Type-check**

```bash
cd apps/desktop && pnpm exec tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/canvas/src/CanvasView.tsx
git commit -m "fix: pass style fields from store into canvas node rendering"
```

---

## Task 3: Edge UX — compact label, delete via context menu, remove toolbar button

Three sub-problems: (a) the edge label is an unstyled wide div, (b) there's no way to delete an edge except from code, (c) the "Link latest nodes" toolbar button is redundant.

**Files:**
- Modify: `packages/canvas/src/edges/AnnotatedEdge.tsx`
- Modify: `packages/canvas/src/CanvasView.tsx` (edge context menu + onEdgesChange)
- Modify: `apps/desktop/src/features/canvas/CanvasScreen.tsx` (remove toolbar button)
- Modify: `apps/desktop/src/styles.css` (edge label styles)

- [ ] **Step 1: Remove "Link latest nodes" button from toolbar**

In `apps/desktop/src/features/canvas/CanvasScreen.tsx`, delete the button block:

```tsx
// REMOVE this entire block:
<button
  onClick={() => {
    const latestNodes = workspace.nodes.slice(-2);
    if (latestNodes.length < 2) return;
    workspace.addEdge({
      sourceNodeId: latestNodes[0].id,
      targetNodeId: latestNodes[1].id,
      relationKind: "supports"
    });
  }}
  type="button"
>
  Link latest nodes
</button>
```

- [ ] **Step 2: Add edge right-click context menu in `CanvasView.tsx`**

Add `onEdgeContextMenu` to the `<ReactFlow>` component and wire up delete. First extend the `contextMenu` state to handle edges:

Change the state type definition from:
```ts
const [contextMenu, setContextMenu] = useState<{
  x: number;
  y: number;
  kind: "canvas" | "node";
  nodeId?: string;
  canvasPos?: { x: number; y: number };
} | null>(null);
```

To:
```ts
const [contextMenu, setContextMenu] = useState<{
  x: number;
  y: number;
  kind: "canvas" | "node" | "edge";
  nodeId?: string;
  edgeId?: string;
  canvasPos?: { x: number; y: number };
} | null>(null);
```

Add to the `<ReactFlow>` props (after `onNodeContextMenu`):
```tsx
onEdgeContextMenu={(e, edge) => {
  e.preventDefault();
  e.stopPropagation();
  setContextMenu({ x: e.clientX, y: e.clientY, kind: "edge", edgeId: edge.id });
}}
```

Add the edge context menu render (after the node context menu block):
```tsx
{contextMenu?.kind === "edge" && contextMenu.edgeId && (
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    onClose={closeContextMenu}
    items={[
      {
        type: "item",
        label: "Delete connection",
        shortcut: "⌫",
        danger: true,
        onClick: () => {
          onDeleteEdge?.(contextMenu.edgeId!);
          closeContextMenu();
        },
      },
    ]}
  />
)}
```

Add `onDeleteEdge?: (edgeId: string) => void` to `CanvasViewProps`.

- [ ] **Step 3: Wire `onDeleteEdge` in `CanvasScreen.tsx`**

In `CanvasScreen.tsx`, add `onDeleteEdge` to the `<CanvasView>` usage:

```tsx
onDeleteEdge={(edgeId) => {
  workspace.store.getState().deleteEdge(edgeId);
}}
```

Check `canvasStore.ts` has a `deleteEdge` method. If not, add it. The current store likely has `connectNodes` but may not have `deleteEdge`. Add it to the store:

In `packages/canvas/src/state/canvasStore.ts`, find the `CanvasStoreState` interface and add:
```ts
deleteEdge: (edgeId: string) => void;
```

And the implementation (in the `create()` call, near other edge methods):
```ts
deleteEdge: (edgeId) => {
  set((state) => ({
    edges: state.edges.filter((e) => e.id !== edgeId),
    updatedAt: currentTimestamp(),
  }));
},
```

- [ ] **Step 4: Fix edge label CSS**

In `apps/desktop/src/styles.css`, find `.flow-edge-label` or add it. Replace or add:

```css
.flow-edge-label {
  background: rgba(15, 12, 10, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  color: rgba(200, 190, 175, 0.9);
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
  padding: 3px 7px;
  pointer-events: all;
  position: absolute;
  white-space: nowrap;
  cursor: default;
  user-select: none;
}

.flow-edge-label strong {
  font-weight: 600;
  color: rgba(220, 210, 190, 1);
}

.flow-edge-label span {
  color: rgba(160, 150, 135, 0.85);
  margin-left: 4px;
}
```

- [ ] **Step 5: Type-check and run frontend tests**

```bash
cd apps/desktop && pnpm exec tsc --noEmit 2>&1
pnpm vitest run packages/canvas/src/state/canvasStore.test.ts 2>&1 | tail -10
```

Expected: no TypeScript errors; canvas store tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/canvas/src/CanvasView.tsx packages/canvas/src/edges/AnnotatedEdge.tsx packages/canvas/src/state/canvasStore.ts apps/desktop/src/features/canvas/CanvasScreen.tsx apps/desktop/src/styles.css
git commit -m "fix: compact edge labels, edge delete via right-click, remove redundant link button"
```

---

## Task 4: Camera centering on new node + node movement animation

When a node is created, the view should pan to it. Node movement should animate smoothly.

**Files:**
- Modify: `packages/canvas/src/CanvasView.tsx` (add `useEffect` for new node detection)
- Modify: `apps/desktop/src/styles.css` (transition on node transform)

- [ ] **Step 1: Add camera centering effect in `CanvasViewInner`**

In `packages/canvas/src/CanvasView.tsx`, inside `CanvasViewInner` (after the `useReactFlow()` call), add:

```ts
const prevNodeCountRef = useRef(nodes.length);
useEffect(() => {
  if (nodes.length > prevNodeCountRef.current) {
    const newest = nodes[nodes.length - 1];
    if (newest) {
      setCenter(newest.position.x + 80, newest.position.y + 60, {
        duration: 350,
        zoom: Math.max(1, 1 / (getZoom() || 1)),
      });
    }
  }
  prevNodeCountRef.current = nodes.length;
}, [nodes, setCenter, getZoom]);
```

Also destructure `getZoom` from `useReactFlow()`:

```ts
const { screenToFlowPosition, setCenter, getZoom } = useReactFlow();
```

- [ ] **Step 2: Add node movement animation CSS**

In `apps/desktop/src/styles.css`, add:

```css
/* Smooth node repositioning (not during drag — React Flow adds .dragging) */
.react-flow__node:not(.dragging) {
  transition: transform 0.12s ease;
}
```

- [ ] **Step 3: Type-check**

```bash
cd apps/desktop && pnpm exec tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/canvas/src/CanvasView.tsx apps/desktop/src/styles.css
git commit -m "feat: camera pans to new nodes; smooth node movement animation"
```

---

## Task 5: Note and resource node resizing

Add `NodeResizer` handles to note and resource nodes, persist size changes.

**Files:**
- Modify: `packages/canvas/src/nodes/NoteNode.tsx`
- Modify: `packages/canvas/src/nodes/ResourceNode.tsx`
- Modify: `packages/canvas/src/state/canvasStore.ts` (add `updateNodeSize`)
- Modify: `packages/canvas/src/CanvasView.tsx` (handle resize via `onNodesChange`)
- Modify: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx` (add `resizeNode`)

- [ ] **Step 1: Add `updateNodeSize` to `canvasStore.ts`**

In `packages/canvas/src/state/canvasStore.ts`, add to the `CanvasStoreState` interface:

```ts
updateNodeSize: (nodeId: string, size: { width: number; height: number }) => void;
```

And add the implementation in the `create()` call:

```ts
updateNodeSize: (nodeId, size) => {
  set((state) => ({
    nodes: state.nodes.map((n) =>
      n.id === nodeId ? { ...n, size, updatedAt: currentTimestamp() } : n
    ),
    updatedAt: currentTimestamp(),
  }));
},
```

- [ ] **Step 2: Add `NodeResizer` to `NoteNode.tsx`**

```tsx
import { Handle, Position, type Node, type NodeProps, NodeResizer } from "@xyflow/react";
import { AdaptiveNode } from "./AdaptiveNode";
import type { AdaptiveNodeStyle } from "./AdaptiveNode";

interface NoteNodeData {
  title: string;
  summary?: string;
  style?: AdaptiveNodeStyle;
  content?: string;
  [key: string]: unknown;
}

export type NoteNodeType = Node<NoteNodeData, "note">;

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

- [ ] **Step 3: Read `ResourceNode.tsx` and add `NodeResizer` to it**

First read the file: `packages/canvas/src/nodes/ResourceNode.tsx`. Add `NodeResizer` in the same way as NoteNode:

```tsx
import { NodeResizer } from "@xyflow/react";
// ... existing imports

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
      {/* existing handles and AdaptiveNode */}
    </>
  );
}
```

- [ ] **Step 4: Handle resize in `CanvasView.tsx` via `onNodesChange`**

Add `onResizeNode?: (nodeId: string, width: number, height: number) => void` to `CanvasViewProps`.

Add `onNodesChange` handler inside `CanvasViewInner`:

```ts
import { type NodeChange, applyNodeChanges } from "@xyflow/react";

const handleNodesChange = useCallback(
  (changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === "dimensions" && change.resizing && change.dimensions) {
        onResizeNode?.(change.id, change.dimensions.width, change.dimensions.height);
      }
    }
  },
  [onResizeNode],
);
```

Add to the `<ReactFlow>` component:
```tsx
onNodesChange={handleNodesChange}
```

- [ ] **Step 5: Wire `resizeNode` in `CanvasWorkspaceContext.tsx`**

In `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`, add `resizeNode` to the interface and implementation:

In `CanvasWorkspaceContextValue`:
```ts
resizeNode: (nodeId: string, width: number, height: number) => void;
```

In `contextValue`:
```ts
resizeNode: (nodeId, width, height) => {
  stores.store.getState().updateNodeSize(nodeId, { width, height });
},
```

- [ ] **Step 6: Wire `onResizeNode` in `CanvasScreen.tsx`**

```tsx
onResizeNode={(nodeId, width, height) => {
  workspace.resizeNode(nodeId, width, height);
}}
```

- [ ] **Step 7: Type-check and run store tests**

```bash
cd apps/desktop && pnpm exec tsc --noEmit 2>&1
pnpm vitest run packages/canvas/src/state/canvasStore.test.ts 2>&1 | tail -10
```

Expected: no TypeScript errors; all store tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/canvas/src/nodes/NoteNode.tsx packages/canvas/src/nodes/ResourceNode.tsx packages/canvas/src/state/canvasStore.ts packages/canvas/src/CanvasView.tsx apps/desktop/src/features/canvas/CanvasScreen.tsx apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx
git commit -m "feat: note and resource nodes are resizable; persist size changes"
```

---

## Task 6: Terminal — project root workdir + layout fix

Two problems: (a) the terminal session starts in whatever directory the binary was launched from, not the project root; (b) the terminal pane doesn't fill the right panel height.

**Files:**
- Modify: `apps/desktop/src/features/terminal/useTerminal.ts`
- Modify: `apps/desktop/src/features/terminal/TerminalPane.tsx`
- Modify: `apps/desktop/src/layout/RightPanelSlot.tsx`
- Modify: `apps/desktop/src/styles.css`

- [ ] **Step 1: Add `workdir` parameter to `useTerminal`**

In `apps/desktop/src/features/terminal/useTerminal.ts`, change the function signature from:

```ts
export function useTerminal() {
```

To:

```ts
export function useTerminal(workdir?: string) {
```

Then in `startSession`, change the `createSession()` call from:

```ts
const created = await transport.createSession();
```

To:

```ts
const created = await transport.createSession({ workdir: workdir ?? null });
```

Also change the module-level session cache key from `DEFAULT_CACHE_KEY` to incorporate the workdir, so different projects get separate sessions:

```ts
const cacheKey = workdir ?? DEFAULT_CACHE_KEY;
```

Replace every occurrence of `DEFAULT_CACHE_KEY` in the function body with `cacheKey` (there are typically 3: one for `_sessionCache.get`, two for `_sessionCache.set`).

- [ ] **Step 2: Pass `workdir` through `TerminalPane`**

In `apps/desktop/src/features/terminal/TerminalPane.tsx`:

```tsx
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import { useTerminal } from "./useTerminal";

export function TerminalPane() {
  const workspace = useCanvasWorkspace();
  const { error, terminalContainerRef } = useTerminal(workspace.workingRoot ?? undefined);

  return (
    <section className="terminal-pane">
      {error && <p className="terminal-pane__error">{error}</p>}
      <div className="terminal-pane__viewport" ref={terminalContainerRef} />
    </section>
  );
}
```

- [ ] **Step 3: Fix terminal layout CSS**

In `apps/desktop/src/styles.css`, find or add rules for `.terminal-pane`, `.terminal-pane__viewport`, `.rps-body`, and `.rps-pane`:

```css
/* Right panel body fills available height */
.rps-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.rps-pane {
  display: none;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.rps-pane[data-visible="true"] {
  display: flex;
  flex-direction: column;
}

/* Terminal pane fills its container */
.terminal-pane {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 4px;
}

.terminal-pane__viewport {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
```

Also ensure `.right-panel-slot__inner` is a flex column:

```css
.right-panel-slot__inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
```

- [ ] **Step 4: Type-check**

```bash
cd apps/desktop && pnpm exec tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/terminal/useTerminal.ts apps/desktop/src/features/terminal/TerminalPane.tsx apps/desktop/src/layout/RightPanelSlot.tsx apps/desktop/src/styles.css
git commit -m "fix: terminal opens in project root; terminal pane fills panel height"
```

---

## Task 7: Left sidebar — wire projects, file tree, Add Folder

`LeftOverlay.tsx` currently renders placeholder stubs. All the data is already available via `useCanvasWorkspace()`. This task wires it up.

**Files:**
- Modify: `apps/desktop/src/layout/LeftOverlay.tsx`

- [ ] **Step 1: Rewrite `LeftOverlay.tsx`**

Replace the entire file with the following. This wires up project switching, file entry selection, and the Add Folder button using Tauri's `dialog.open`:

```tsx
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";

interface LeftOverlayProps {
  open: boolean;
  onClose: () => void;
  onResizeStart: (e: React.PointerEvent) => void;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__);
}

export function LeftOverlay({ open, onResizeStart }: LeftOverlayProps) {
  const workspace = useCanvasWorkspace();

  const handleAddFolder = async () => {
    if (!isTauriRuntime()) return;
    try {
      const selected = await openDialog({ directory: true, multiple: false, title: "Add Resource Folder" });
      if (typeof selected === "string") {
        await workspace.attachResourceRoot(selected);
      }
    } catch {
      // user cancelled or dialog unavailable
    }
  };

  return (
    <aside className="left-overlay" data-open={open ? "true" : "false"} aria-hidden={!open}>
      <div className="left-overlay__inner">

        {/* Project selector */}
        <div className="lo-section">
          <div className="lo-section__header">
            <span className="lo-label">Projects</span>
          </div>
          <div className="lo-project-list">
            {workspace.projects.map((project) => (
              <button
                key={project.id}
                className="lo-project-item"
                data-active={workspace.activeProjectId === project.id ? "true" : "false"}
                onClick={() => workspace.selectProject(project.id)}
                title={project.rootPath}
              >
                {project.name}
              </button>
            ))}
            {workspace.projects.length === 0 && (
              <div className="lo-empty">No projects</div>
            )}
          </div>
        </div>

        {/* Resource roots */}
        <div className="lo-section">
          <div className="lo-section__header">
            <span className="lo-label">Resource Folders</span>
            <button
              className="lo-icon-btn"
              title="Add folder from machine"
              onClick={() => { void handleAddFolder(); }}
            >
              +
            </button>
          </div>
          {workspace.resourceRoots.length > 0 ? (
            workspace.resourceRoots.map((root) => (
              <div key={root.id} className="lo-root-row" title={root.rootPath}>
                <span className="lo-root-icon">⊞</span>
                <span className="lo-root-path">{root.rootPath.split("/").pop()}</span>
                <button
                  className="lo-icon-btn lo-icon-btn--danger"
                  title="Remove folder"
                  onClick={() => { void workspace.detachResourceRoot(root.rootPath); }}
                >
                  ×
                </button>
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
            {workspace.entries.map((entry) => (
              <button
                key={entry.id}
                className="lo-file-row"
                data-selected={workspace.selectedEntryId === entry.id ? "true" : "false"}
                data-directory={entry.isDirectory ? "true" : "false"}
                style={{ paddingLeft: `${8 + entry.depth * 12}px` }}
                onClick={() => workspace.selectEntry(entry.id)}
                title={entry.relativePath}
              >
                <span className="lo-file-icon">
                  {entry.isDirectory ? "▸" : "·"}
                </span>
                <span className="lo-file-name">{entry.name}</span>
              </button>
            ))}
            {workspace.entries.length === 0 && (
              <div className="lo-empty">Add a folder to see files</div>
            )}
          </div>
        </div>

      </div>

      {/* Resize handle */}
      <div
        className="left-overlay__resize-handle"
        onPointerDown={onResizeStart}
        title="Drag to resize"
      />
    </aside>
  );
}
```

> **Note:** `@tauri-apps/plugin-dialog` must be available. Check `apps/desktop/package.json` for `"@tauri-apps/plugin-dialog"`. If missing, add it: `pnpm --filter @research-canvas/desktop add @tauri-apps/plugin-dialog`. Also ensure `tauri-plugin-dialog` is in `src-tauri/Cargo.toml` and registered in `lib.rs` with `.plugin(tauri_plugin_dialog::init())`. If the dependency isn't present, fall back to using a simple `window.prompt()` for the folder path, or skip the dialog for now and just wire the list/tree.

- [ ] **Step 2: Add sidebar CSS for project buttons and file tree selection**

In `apps/desktop/src/styles.css`, add:

```css
.lo-project-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0;
}

.lo-project-item {
  background: transparent;
  border: none;
  border-radius: 4px;
  color: rgba(200, 190, 175, 0.7);
  cursor: pointer;
  font-size: 12px;
  padding: 5px 8px;
  text-align: left;
  transition: background 0.1s;
  width: 100%;
}

.lo-project-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(220, 210, 195, 0.9);
}

.lo-project-item[data-active="true"] {
  background: rgba(74, 74, 255, 0.15);
  color: #7c7cff;
}

.lo-file-row {
  align-items: center;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: rgba(190, 180, 165, 0.7);
  cursor: pointer;
  display: flex;
  font-size: 11.5px;
  gap: 5px;
  padding: 3px 8px;
  text-align: left;
  transition: background 0.1s;
  width: 100%;
}

.lo-file-row:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(210, 200, 185, 0.9);
}

.lo-file-row[data-selected="true"] {
  background: rgba(74, 74, 255, 0.12);
  color: #9090e8;
}

.lo-icon-btn--danger {
  color: rgba(231, 76, 60, 0.6);
  margin-left: auto;
}

.lo-icon-btn--danger:hover {
  color: #e74c3c;
}
```

- [ ] **Step 3: Check if `@tauri-apps/plugin-dialog` is installed**

```bash
grep "plugin-dialog" apps/desktop/package.json apps/desktop/src-tauri/Cargo.toml 2>/dev/null
```

If neither file mentions it, the dialog feature is not available. In that case, remove the `import { open as openDialog }` line and the `handleAddFolder` function, and replace the Add Folder button's onClick with a no-op comment so the button is visible but inert. The rest of the sidebar (project list, file tree) still works without this dependency.

- [ ] **Step 4: Type-check**

```bash
cd apps/desktop && pnpm exec tsc --noEmit 2>&1
```

Fix any TypeScript errors. Common issue: `entry.depth` may not exist on `IndexedEntry` — check the type definition in `packages/desktop-api/src/index.ts` and use `entry.depth ?? 0` if optional.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/layout/LeftOverlay.tsx apps/desktop/src/styles.css
git commit -m "feat: wire left sidebar — project switcher, file tree, detach root button"
```

---

## Self-Review

**Spec coverage:**
1. ✅ Colour picking — Task 1 (persistence) + Task 2 (rendering)
2. ✅ Edge UX + link button removal — Task 3
3. ✅ Camera centering — Task 4
4. ✅ Node animations — Task 4
5. ✅ Edge label compact — Task 3
6. ✅ Note resizing — Task 5
7. ✅ Persistence error surfacing — Task 1
8. ✅ Terminal workdir + layout — Task 6
9. ✅ Left sidebar wiring — Task 7

**Placeholder scan:** None found — all code blocks are complete.

**Type consistency check:**
- `updateNodeSize` defined in Task 5 Step 1, used in Task 5 Step 5 ✅
- `deleteEdge` defined in Task 3 Step 3, used in Task 3 Step 3 ✅
- `resizeNode` defined in Task 5 Step 5, used in Task 5 Step 6 ✅
- `onDeleteEdge` added to `CanvasViewProps` in Task 3, wired in Task 3 ✅
- `onResizeNode` added to `CanvasViewProps` in Task 5, wired in Task 5 ✅

**Known conditional:** Task 7 Add Folder requires `@tauri-apps/plugin-dialog`. Step 3 handles both cases (plugin present / absent).

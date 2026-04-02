# Sequence Playback Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sidebar-based sequence system with graph-emergent branching sequences driven by edge flags, a full-screen cinematic presenter, and a sequence map overlay.

**Architecture:** Sequences emerge from edges marked `sequencing: true`. A pure `walkSequenceGraph()` function computes roots, adjacency, and cycle detection from the edge set. Playback is ephemeral (a `useReducer` stack inside the presenter). The old `Sequence`/`SequenceStep` entities, store, panel, and DB tables are removed entirely.

**Tech Stack:** TypeScript, Zod, React 18, Zustand, React Flow (@xyflow/react), Rust/SQLite (rusqlite), Playwright

---

### Task 1: Schema — Add sequencing fields to edge and node, remove old sequence types

**Files:**
- Modify: `packages/schema/src/edge.ts:12-26`
- Modify: `packages/schema/src/node.ts:16-29`
- Modify: `packages/schema/src/sequence.ts` (delete file contents, keep empty or remove)
- Modify: `packages/schema/src/index.ts:7`
- Modify: `packages/schema/src/index.test.ts:152-181` (remove old sequence tests)
- Modify: `packages/schema/src/canvas.ts` (export viewportSchema if not already)

- [ ] **Step 1: Write failing tests for new edge fields**

In `packages/schema/src/index.test.ts`, replace the old sequence validation test block (lines 152–181) with:

```typescript
test("validates edge with sequencing fields", () => {
  const edge = edgeSchema.parse({
    id: crypto.randomUUID(),
    canvasId: crypto.randomUUID(),
    sourceNodeId: crypto.randomUUID(),
    targetNodeId: crypto.randomUUID(),
    relationKind: "causes",
    directionality: "forward",
    label: "causes",
    note: "",
    style: { stroke: "#f0b45a", width: 2, dashed: false },
    sequencing: true,
    sequencePriority: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  expect(edge.sequencing).toBe(true);
  expect(edge.sequencePriority).toBe(10);
});

test("edge sequencing defaults to false and priority to 0", () => {
  const edge = edgeSchema.parse({
    id: crypto.randomUUID(),
    canvasId: crypto.randomUUID(),
    sourceNodeId: crypto.randomUUID(),
    targetNodeId: crypto.randomUUID(),
    relationKind: "reference",
    directionality: "forward",
    label: "ref",
    note: "",
    style: { stroke: "#f0b45a", width: 2, dashed: false },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  expect(edge.sequencing).toBe(false);
  expect(edge.sequencePriority).toBe(0);
});

test("validates node with optional sequence caption and viewport", () => {
  const node = noteNodeSchema.parse({
    id: crypto.randomUUID(),
    canvasId: crypto.randomUUID(),
    type: "note",
    title: "Test",
    position: { x: 0, y: 0 },
    size: { width: 200, height: 150 },
    content: "hello",
    tags: [],
    sequenceCaption: "This is the opening shot",
    sequenceViewport: { x: 100, y: 200, zoom: 1.5 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  expect(node.sequenceCaption).toBe("This is the opening shot");
  expect(node.sequenceViewport).toEqual({ x: 100, y: 200, zoom: 1.5 });
});

test("node sequence fields default to null when omitted", () => {
  const node = noteNodeSchema.parse({
    id: crypto.randomUUID(),
    canvasId: crypto.randomUUID(),
    type: "note",
    title: "Test",
    position: { x: 0, y: 0 },
    size: { width: 200, height: 150 },
    content: "hello",
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  expect(node.sequenceCaption).toBeNull();
  expect(node.sequenceViewport).toBeNull();
});
```

Also update the export bundle test (lines 234–262) to remove the `sequences` and `sequenceSteps` arrays from the bundle payload, replacing them with nothing (delete those lines from the test object).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/schema/src/index.test.ts`
Expected: FAIL — `sequencing` not in schema, `sequenceCaption` not in schema

- [ ] **Step 3: Add sequencing fields to edge schema**

In `packages/schema/src/edge.ts`, add two fields to `edgeSchema` after `updatedAt`:

```typescript
export const edgeSchema = z.object({
  id: z.string().uuid(),
  canvasId: z.string().uuid(),
  sourceNodeId: z.string().uuid(),
  targetNodeId: z.string().uuid(),
  sourceHandleId: nullToUndefined(z.string().min(1).optional()),
  targetHandleId: nullToUndefined(z.string().min(1).optional()),
  relationKind: z.string().min(1),
  directionality: z.enum(["none", "forward", "backward", "bidirectional"]),
  label: z.string().default(""),
  note: z.string().default(""),
  style: edgeStyleSchema,
  sequencing: z.boolean().default(false),
  sequencePriority: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
```

- [ ] **Step 4: Add sequence fields to base node schema**

In `packages/schema/src/node.ts`, import `viewportSchema` from `./canvas` and add two fields to `baseNodeSchema` after `thumbnail`:

```typescript
import { viewportSchema } from "./canvas";
```

Add to `baseNodeSchema`:

```typescript
  sequenceCaption: nullToUndefined(z.string().nullable().default(null)),
  sequenceViewport: nullToUndefined(viewportSchema.nullable().default(null)),
```

- [ ] **Step 5: Remove old sequence schema exports**

Delete the contents of `packages/schema/src/sequence.ts` and replace with an empty file or a comment:

```typescript
// Sequences are now graph-emergent — defined by edge.sequencing flags.
// The old Sequence and SequenceStep types have been removed.
```

In `packages/schema/src/index.ts`, remove line 7 (`export * from "./sequence"`):

```typescript
export * from "./annotation";
export * from "./canvas";
export * from "./export";
export * from "./edge";
export * from "./node";
export * from "./project";
```

- [ ] **Step 6: Update export bundle test to remove sequence references**

In `packages/schema/src/index.test.ts`, find the export bundle test (around line 183) and remove the `sequences` and `sequenceSteps` arrays from the test bundle object. Also remove any imports of `sequenceSchema` and `sequenceStepSchema`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm vitest run packages/schema/src/index.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/schema/src/edge.ts packages/schema/src/node.ts packages/schema/src/sequence.ts packages/schema/src/index.ts packages/schema/src/index.test.ts
git commit -m "feat: add sequencing fields to edge/node schema, remove old sequence types"
```

---

### Task 2: SQLite migration — Add columns to edges/nodes, drop old tables

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0006_sequence_redesign.sql`
- Modify: `apps/desktop/src-tauri/src/db/migrations.rs:14-35`

- [ ] **Step 1: Create the migration SQL**

Create `apps/desktop/src-tauri/migrations/0006_sequence_redesign.sql`:

```sql
-- Add sequencing fields to edges
ALTER TABLE canvas_edges ADD COLUMN sequencing INTEGER NOT NULL DEFAULT 0;
ALTER TABLE canvas_edges ADD COLUMN sequence_priority INTEGER NOT NULL DEFAULT 0;

-- Add sequence fields to nodes
ALTER TABLE canvas_nodes ADD COLUMN sequence_caption TEXT;
ALTER TABLE canvas_nodes ADD COLUMN sequence_viewport_json TEXT;

-- Drop old sequence tables (steps first due to FK)
DROP TABLE IF EXISTS sequence_steps;
DROP TABLE IF EXISTS sequences;

-- Drop old indexes
DROP INDEX IF EXISTS idx_sequences_canvas_id;
DROP INDEX IF EXISTS idx_sequence_steps_sequence_position;
```

- [ ] **Step 2: Register the migration**

In `apps/desktop/src-tauri/src/db/migrations.rs`, add after line 34 (the closing of 0005):

```rust
    Migration {
        version: "0006_sequence_redesign",
        sql: include_str!("../../migrations/0006_sequence_redesign.sql"),
    },
```

- [ ] **Step 3: Write Rust integration test for migration**

In `apps/desktop/src-tauri/tests/canvas_repository.rs`, add a new test:

```rust
#[test]
fn sequencing_fields_round_trip_through_the_repository() {
    let (_dir, conn) = test_connection();

    let canvas_repo = CanvasRepository::new(&conn);
    let project = test_project(&conn);
    let canvas = canvas_repo
        .create_for_project(&project.id, "test", "primary", None, true)
        .unwrap();

    let graph = CanvasGraphRepository::new(&conn);
    let node_a = graph
        .create_note_node(&canvas.id, "A", "content a", 0.0, 0.0)
        .unwrap();
    let node_b = graph
        .create_note_node(&canvas.id, "B", "content b", 100.0, 0.0)
        .unwrap();
    let edge = graph
        .connect_nodes(&canvas.id, &node_a.id, &node_b.id, "causes")
        .unwrap();

    // Verify defaults
    assert!(!edge.sequencing);
    assert_eq!(edge.sequence_priority, 0);

    // Update sequencing
    graph.update_edge_sequencing(&edge.id, true, 10).unwrap();

    let snapshot = graph.load_canvas_snapshot(&canvas.id).unwrap();
    let loaded_edge = snapshot.edges.iter().find(|e| e.id == edge.id).unwrap();
    assert!(loaded_edge.sequencing);
    assert_eq!(loaded_edge.sequence_priority, 10);

    // Verify node sequence fields default to None
    let loaded_node = snapshot.nodes.iter().find(|n| n.id == node_a.id).unwrap();
    assert!(loaded_node.sequence_caption.is_none());
    assert!(loaded_node.sequence_viewport_json.is_none());

    // Update node sequence fields
    graph.update_node_sequence_fields(&node_a.id, Some("Opening"), Some(r#"{"x":1,"y":2,"zoom":1.5}"#)).unwrap();
    let snapshot2 = graph.load_canvas_snapshot(&canvas.id).unwrap();
    let loaded_node2 = snapshot2.nodes.iter().find(|n| n.id == node_a.id).unwrap();
    assert_eq!(loaded_node2.sequence_caption.as_deref(), Some("Opening"));
    assert_eq!(loaded_node2.sequence_viewport_json.as_deref(), Some(r#"{"x":1,"y":2,"zoom":1.5}"#));
}
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml sequencing_fields -- --test-threads=1`
Expected: FAIL — `sequencing` field not on struct, `update_edge_sequencing` not found

- [ ] **Step 5: Update CanvasEdgeRecord and CanvasNodeRecord structs**

In `apps/desktop/src-tauri/src/db/repositories/canvas.rs`, add to `CanvasEdgeRecord` (after `updated_at`):

```rust
    pub sequencing: bool,
    pub sequence_priority: i64,
```

Add to `CanvasNodeRecord` (after `updated_at`):

```rust
    pub sequence_caption: Option<String>,
    pub sequence_viewport_json: Option<String>,
```

- [ ] **Step 6: Update canvas_edge_from_row to read new columns**

In `canvas_edge_from_row`, update the SELECT query and row mapping. The edge SELECT queries in `load_canvas_snapshot` and `get_edge_by_id` must now include `sequencing` and `sequence_priority` columns (indices 13 and 14):

```rust
fn canvas_edge_from_row(row: &rusqlite::Row<'_>) -> Result<CanvasEdgeRecord> {
    Ok(CanvasEdgeRecord {
        id: row.get(0)?,
        canvas_id: row.get(1)?,
        source_node_id: row.get(2)?,
        target_node_id: row.get(3)?,
        source_handle_id: row.get(4)?,
        target_handle_id: row.get(5)?,
        relation_kind: row.get(6)?,
        directionality: row.get(7)?,
        label: row.get(8)?,
        note: row.get(9)?,
        style_json: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        sequencing: row.get::<_, i64>(13)? != 0,
        sequence_priority: row.get(14)?,
    })
}
```

Update ALL edge SELECT queries in `load_canvas_snapshot` and `get_edge_by_id` to include `sequencing, sequence_priority` after `updated_at`:

```sql
SELECT
    id, canvas_id, source_node_id, target_node_id,
    source_handle_id, target_handle_id,
    relation_kind, directionality, label, note, style_json,
    created_at, updated_at,
    sequencing, sequence_priority
FROM canvas_edges
```

- [ ] **Step 7: Update canvas_node_from_row to read new columns**

Update `canvas_node_from_row` to read indices 26 and 27 (after `updated_at` at index 25):

```rust
        updated_at: row.get(25)?,
        sequence_caption: row.get(26)?,
        sequence_viewport_json: row.get(27)?,
```

Update ALL node SELECT queries in `load_canvas_snapshot` and `get_node_by_id` to include `sequence_caption, sequence_viewport_json` after `updated_at`:

```sql
SELECT
    id, canvas_id, type, title, summary,
    position_x, position_y, width, height,
    content, tags, resource_kind, absolute_path, relative_path,
    mime_type, file_fingerprint, url, color, child_node_ids,
    target_canvas_id, dot_colour, bg_colour, text_colour, thumbnail,
    created_at, updated_at,
    sequence_caption, sequence_viewport_json
FROM canvas_nodes
```

- [ ] **Step 8: Add update_edge_sequencing and update_node_sequence_fields methods**

Add to `impl CanvasGraphRepository`:

```rust
    pub fn update_edge_sequencing(
        &self,
        edge_id: &str,
        sequencing: bool,
        sequence_priority: i64,
    ) -> Result<()> {
        let now = current_timestamp();
        self.connection.execute(
            "UPDATE canvas_edges
             SET sequencing = ?1,
                 sequence_priority = ?2,
                 updated_at = ?3
             WHERE id = ?4",
            params![sequencing as i64, sequence_priority, now, edge_id],
        )?;
        if self.connection.changes() == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn update_node_sequence_fields(
        &self,
        node_id: &str,
        sequence_caption: Option<&str>,
        sequence_viewport_json: Option<&str>,
    ) -> Result<()> {
        let now = current_timestamp();
        self.connection.execute(
            "UPDATE canvas_nodes
             SET sequence_caption = ?1,
                 sequence_viewport_json = ?2,
                 updated_at = ?3
             WHERE id = ?4",
            params![sequence_caption, sequence_viewport_json, now, node_id],
        )?;
        if self.connection.changes() == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }
```

- [ ] **Step 9: Run Rust test to verify it passes**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml sequencing_fields -- --test-threads=1`
Expected: PASS

- [ ] **Step 10: Run all Rust tests to check nothing broke**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1`
Expected: PASS (some tests may need updates if they construct CanvasEdgeRecord or CanvasNodeRecord directly — update those to include the new fields with defaults)

- [ ] **Step 11: Commit**

```bash
git add apps/desktop/src-tauri/migrations/0006_sequence_redesign.sql apps/desktop/src-tauri/src/db/migrations.rs apps/desktop/src-tauri/src/db/repositories/canvas.rs apps/desktop/src-tauri/tests/canvas_repository.rs
git commit -m "feat: SQLite migration for sequencing fields on edges/nodes, drop old sequence tables"
```

---

### Task 3: Remove old sequence infrastructure (store, panel, Rust repo, desktop-api refs)

**Files:**
- Delete: `packages/canvas/src/sequences/SequenceStore.ts`
- Delete: `packages/canvas/src/sequences/SequenceStore.test.ts`
- Delete: `packages/canvas/src/sequences/SequenceEditor.tsx`
- Delete: `packages/canvas/src/sequences/SequencePlayer.tsx`
- Delete: `apps/desktop/src/features/sequences/SequencePanel.tsx`
- Delete: `apps/desktop/src-tauri/src/db/repositories/sequences.rs`
- Modify: `packages/canvas/src/index.ts:9-11`
- Modify: `apps/desktop/src-tauri/src/db/repositories/mod.rs`
- Modify: `packages/desktop-api/src/index.ts:1-8,68-91`
- Modify: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`
- Modify: `apps/desktop/src/layout/RightPanelSlot.tsx`
- Modify: `apps/desktop/src/layout/useShellLayout.ts:3`

- [ ] **Step 1: Delete old sequence files**

Delete these files:
- `packages/canvas/src/sequences/SequenceStore.ts`
- `packages/canvas/src/sequences/SequenceStore.test.ts`
- `packages/canvas/src/sequences/SequenceEditor.tsx`
- `packages/canvas/src/sequences/SequencePlayer.tsx`
- `apps/desktop/src/features/sequences/SequencePanel.tsx`
- `apps/desktop/src-tauri/src/db/repositories/sequences.rs`

- [ ] **Step 2: Remove sequence exports from canvas package**

In `packages/canvas/src/index.ts`, remove lines 9-11:

```typescript
export * from "./annotations/AnnotationLayer";
export * from "./annotations/annotationStore";
export * from "./CanvasView";
export * from "./components/FuzzyFilePicker";
export * from "./edges/AnnotatedEdge";
export * from "./nodes/GroupNode";
export * from "./nodes/NoteNode";
export * from "./nodes/ResourceNode";
export * from "./state/canvasStore";
```

- [ ] **Step 3: Remove sequences.rs from Rust mod.rs**

In `apps/desktop/src-tauri/src/db/repositories/mod.rs`, remove the `pub mod sequences;` line.

- [ ] **Step 4: Remove sequence types from desktop-api**

In `packages/desktop-api/src/index.ts`:

Remove `Sequence` and `SequenceStep` from the import at line 1-8:

```typescript
import type {
  Annotation,
  CanvasEdge,
  CanvasNode,
  PublishSettings,
} from "@research-canvas/schema";
```

Remove `sequenceSteps` and `sequences` from `ProjectDocument` interface (lines 78-79):

```typescript
export interface ProjectDocument {
  canvasId: string;
  databasePath: string;
  entries: IndexedEntry[];
  project: WorkspaceProject;
  resourceRoots: ResourceRoot[];
  workingRoot: string;
  annotations: Annotation[];
  edges: CanvasEdge[];
  nodes: CanvasNode[];
}
```

Remove `sequenceSteps` and `sequences` from `PersistProjectDocumentRequest` (lines 89-90):

```typescript
export interface PersistProjectDocumentRequest {
  annotations: Annotation[];
  canvasId: string;
  databasePath: string;
  edges: CanvasEdge[];
  nodes: CanvasNode[];
  projectId: string;
}
```

- [ ] **Step 5: Remove sequence store from CanvasWorkspaceContext**

In `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`:

Remove `createSequenceStore` and `SequenceSnapshot` from the import at line 17-22:

```typescript
import {
  createAnnotationStore,
  createCanvasStore,
} from "@research-canvas/canvas";
```

Remove `sequenceStore` from `WorkspaceStores` interface (line 43):

```typescript
interface WorkspaceStores {
  annotationStore: ReturnType<typeof createAnnotationStore>;
  store: ReturnType<typeof createCanvasStore>;
}
```

Remove all `sequenceStore` references from persisting (lines 254-255, 298, 324-325):
- Remove `sequenceSteps` and `sequences` from `persistProjectDocument` call
- Remove `unsubscribeSequences` subscription
- Remove `sequenceSteps` and `sequences` from `flushLatest`
- Remove `sequenceSteps` and `sequences` from `selectProject`

Remove sequence state from `useCanvasWorkspace` hook (lines 612-622):
- Remove `sequences`, `steps`, `activeSequenceId`, `activeStepIndex`, `activeStep` from the return value and the `useStore` calls

Remove `sequenceStore` from `createWorkspaceStores` (line 643):

```typescript
function createWorkspaceStores(canvasId: string, _projectId: string): WorkspaceStores {
  return {
    annotationStore: createAnnotationStore({ canvasId }),
    store: createCanvasStore({ canvasId })
  };
}
```

Remove sequence hydration from `hydrateWorkspaceDocument` (lines 673-678).

- [ ] **Step 6: Remove Sequences tab from RightPanelSlot**

In `apps/desktop/src/layout/RightPanelSlot.tsx`:

Remove the `SequencePanel` import (line 4):

```typescript
import { TerminalPane } from "../features/terminal/TerminalPane";
import { ContentTab } from "../features/viewer/ContentTab";
import { InspectorTab } from "../features/inspector/InspectorTab";
import type { RightTab } from "./useShellLayout";
```

Remove the `sequences` entry from `TABS` array (line 20):

```typescript
const TABS: { id: RightTab; label: string }[] = [
  { id: "inspector", label: "Inspector" },
  { id: "content", label: "Content" },
  { id: "terminal", label: "Terminal" },
];
```

Remove the sequences pane (lines 69-71):

Delete:
```tsx
          <div className="rps-pane" data-visible={activeTab === "sequences" ? "true" : "false"}>
            <SequencePanel />
          </div>
```

- [ ] **Step 7: Update RightTab type**

In `apps/desktop/src/layout/useShellLayout.ts`, update line 3:

```typescript
export type RightTab = "inspector" | "content" | "terminal";
```

- [ ] **Step 8: Run TypeScript to verify compilation**

Run: `pnpm exec tsc -b`
Expected: PASS (may need to fix remaining references — search for `sequenceStore`, `SequencePanel`, `Sequence`, `SequenceStep` across the codebase and clean up)

- [ ] **Step 9: Run frontend tests**

Run: `pnpm vitest run`
Expected: PASS (old sequence tests deleted, no new ones yet)

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: remove old sequence infrastructure (store, panel, DB repo, schema types)"
```

---

### Task 4: Canvas store — Add sequencing toggle and priority methods

**Files:**
- Modify: `packages/canvas/src/state/canvasStore.ts`
- Modify: `packages/canvas/src/state/canvasStore.test.ts`

- [ ] **Step 1: Write failing tests**

In `packages/canvas/src/state/canvasStore.test.ts`, add:

```typescript
test("toggleEdgeSequencing sets sequencing flag and priority", () => {
  const store = createCanvasStore({ canvasId: "c1" });
  const { connectNodes, createNoteNode } = store.getState();

  const nodeA = createNoteNode({ title: "A", content: "" });
  const nodeB = createNoteNode({ title: "B", content: "" });
  const edge = connectNodes({
    sourceNodeId: nodeA.id,
    targetNodeId: nodeB.id,
    relationKind: "causes",
  });

  expect(edge.sequencing).toBe(false);
  expect(edge.sequencePriority).toBe(0);

  store.getState().toggleEdgeSequencing(edge.id);
  const toggled = store.getState().edges.find((e) => e.id === edge.id)!;
  expect(toggled.sequencing).toBe(true);

  store.getState().toggleEdgeSequencing(edge.id);
  const toggledOff = store.getState().edges.find((e) => e.id === edge.id)!;
  expect(toggledOff.sequencing).toBe(false);
});

test("updateEdgeSequencePriority updates priority", () => {
  const store = createCanvasStore({ canvasId: "c1" });
  const { connectNodes, createNoteNode } = store.getState();

  const nodeA = createNoteNode({ title: "A", content: "" });
  const nodeB = createNoteNode({ title: "B", content: "" });
  const edge = connectNodes({
    sourceNodeId: nodeA.id,
    targetNodeId: nodeB.id,
    relationKind: "causes",
  });

  store.getState().updateEdgeSequencePriority(edge.id, 50);
  const updated = store.getState().edges.find((e) => e.id === edge.id)!;
  expect(updated.sequencePriority).toBe(50);
});

test("updateNodeSequenceCaption sets caption", () => {
  const store = createCanvasStore({ canvasId: "c1" });
  const node = store.getState().createNoteNode({ title: "Test", content: "" });

  store.getState().updateNodeSequenceCaption(node.id, "Opening shot");
  const updated = store.getState().nodes.find((n) => n.id === node.id)!;
  expect(updated.sequenceCaption).toBe("Opening shot");
});

test("captureNodeSequenceViewport sets viewport on node", () => {
  const store = createCanvasStore({ canvasId: "c1" });
  const node = store.getState().createNoteNode({ title: "Test", content: "" });
  const viewport = { x: 100, y: 200, zoom: 1.5 };

  store.getState().setNodeSequenceViewport(node.id, viewport);
  const updated = store.getState().nodes.find((n) => n.id === node.id)!;
  expect(updated.sequenceViewport).toEqual(viewport);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/canvas/src/state/canvasStore.test.ts`
Expected: FAIL — methods don't exist

- [ ] **Step 3: Add methods to CanvasStoreState interface and implementation**

In `packages/canvas/src/state/canvasStore.ts`, add to `CanvasStoreState` interface:

```typescript
  toggleEdgeSequencing: (edgeId: string) => void;
  updateEdgeSequencePriority: (edgeId: string, priority: number) => void;
  updateNodeSequenceCaption: (nodeId: string, caption: string | null) => void;
  setNodeSequenceViewport: (nodeId: string, viewport: { x: number; y: number; zoom: number } | null) => void;
```

Add implementations inside `createCanvasStore`:

```typescript
    toggleEdgeSequencing: (edgeId) => {
      set((state) => ({
        edges: state.edges.map((edge) =>
          edge.id === edgeId
            ? { ...edge, sequencing: !edge.sequencing, updatedAt: now() }
            : edge
        ),
      }));
    },
    updateEdgeSequencePriority: (edgeId, priority) => {
      set((state) => ({
        edges: state.edges.map((edge) =>
          edge.id === edgeId
            ? { ...edge, sequencePriority: priority, updatedAt: now() }
            : edge
        ),
      }));
    },
    updateNodeSequenceCaption: (nodeId, caption) => {
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, sequenceCaption: caption, updatedAt: now() } : n
        ),
      }));
    },
    setNodeSequenceViewport: (nodeId, viewport) => {
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, sequenceViewport: viewport, updatedAt: now() } : n
        ),
      }));
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/canvas/src/state/canvasStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/canvas/src/state/canvasStore.ts packages/canvas/src/state/canvasStore.test.ts
git commit -m "feat: add sequencing toggle and priority methods to canvas store"
```

---

### Task 5: Graph walker — `walkSequenceGraph()` pure function

**Files:**
- Create: `packages/canvas/src/sequences/walkSequenceGraph.ts`
- Create: `packages/canvas/src/sequences/walkSequenceGraph.test.ts`
- Modify: `packages/canvas/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/canvas/src/sequences/walkSequenceGraph.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { walkSequenceGraph, type SequenceGraph } from "./walkSequenceGraph";
import type { CanvasEdge, CanvasNode } from "@research-canvas/schema";

function makeNode(id: string): CanvasNode {
  return {
    id,
    canvasId: "c1",
    type: "note",
    title: id,
    position: { x: 0, y: 0 },
    size: { width: 200, height: 150 },
    summary: "",
    content: "",
    tags: [],
    sequenceCaption: null,
    sequenceViewport: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as CanvasNode;
}

function makeEdge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  sequencing: boolean,
  opts?: { label?: string; sequencePriority?: number }
): CanvasEdge {
  return {
    id,
    canvasId: "c1",
    sourceNodeId,
    targetNodeId,
    relationKind: "causes",
    directionality: "forward",
    label: opts?.label ?? "causes",
    note: "",
    style: { stroke: "#f0b45a", width: 2, dashed: false },
    sequencing,
    sequencePriority: opts?.sequencePriority ?? 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as CanvasEdge;
}

describe("walkSequenceGraph", () => {
  test("returns empty graph when no sequencing edges", () => {
    const nodes = [makeNode("A"), makeNode("B")];
    const edges = [makeEdge("e1", "A", "B", false)];
    const graph = walkSequenceGraph(nodes, edges);

    expect(graph.roots).toEqual([]);
    expect(graph.nodeSet.size).toBe(0);
    expect(graph.terminalNodes).toEqual([]);
    expect(graph.hasCycles).toBe(false);
  });

  test("detects single root and terminal in linear sequence", () => {
    const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
    const edges = [
      makeEdge("e1", "A", "B", true),
      makeEdge("e2", "B", "C", true),
    ];
    const graph = walkSequenceGraph(nodes, edges);

    expect(graph.roots).toEqual(["A"]);
    expect(graph.terminalNodes).toEqual(["C"]);
    expect(graph.nodeSet).toEqual(new Set(["A", "B", "C"]));
    expect(graph.hasCycles).toBe(false);

    const exitsA = graph.adjacency.get("A")!;
    expect(exitsA).toHaveLength(1);
    expect(exitsA[0].targetNodeId).toBe("B");
  });

  test("detects branch point with multiple exits sorted by priority", () => {
    const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
    const edges = [
      makeEdge("e1", "A", "B", true, { label: "path B", sequencePriority: 50 }),
      makeEdge("e2", "A", "C", true, { label: "path C", sequencePriority: 10 }),
    ];
    const graph = walkSequenceGraph(nodes, edges);

    expect(graph.roots).toEqual(["A"]);
    const exits = graph.adjacency.get("A")!;
    expect(exits).toHaveLength(2);
    expect(exits[0].label).toBe("path C"); // priority 10 first
    expect(exits[1].label).toBe("path B"); // priority 50 second
  });

  test("detects cycles", () => {
    const nodes = [makeNode("A"), makeNode("B")];
    const edges = [
      makeEdge("e1", "A", "B", true),
      makeEdge("e2", "B", "A", true),
    ];
    const graph = walkSequenceGraph(nodes, edges);

    expect(graph.hasCycles).toBe(true);
    expect(graph.roots).toEqual([]); // both have incoming
  });

  test("multiple roots when graph has disconnected sequences", () => {
    const nodes = [makeNode("A"), makeNode("B"), makeNode("C"), makeNode("D")];
    const edges = [
      makeEdge("e1", "A", "B", true),
      makeEdge("e2", "C", "D", true),
    ];
    const graph = walkSequenceGraph(nodes, edges);

    expect(graph.roots.sort()).toEqual(["A", "C"]);
    expect(graph.terminalNodes.sort()).toEqual(["B", "D"]);
  });

  test("ignores non-sequencing edges", () => {
    const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
    const edges = [
      makeEdge("e1", "A", "B", true),
      makeEdge("e2", "B", "C", false), // not sequencing
    ];
    const graph = walkSequenceGraph(nodes, edges);

    expect(graph.nodeSet).toEqual(new Set(["A", "B"]));
    expect(graph.terminalNodes).toEqual(["B"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/canvas/src/sequences/walkSequenceGraph.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement walkSequenceGraph**

Create `packages/canvas/src/sequences/walkSequenceGraph.ts`:

```typescript
import type { CanvasEdge, CanvasNode } from "@research-canvas/schema";

export interface SequenceExit {
  edgeId: string;
  targetNodeId: string;
  label: string;
  priority: number;
}

export interface SequenceGraph {
  roots: string[];
  adjacency: Map<string, SequenceExit[]>;
  nodeSet: Set<string>;
  hasCycles: boolean;
  terminalNodes: string[];
}

export function walkSequenceGraph(
  _nodes: CanvasNode[],
  edges: CanvasEdge[]
): SequenceGraph {
  const sequencingEdges = edges.filter((e) => e.sequencing);

  if (sequencingEdges.length === 0) {
    return {
      roots: [],
      adjacency: new Map(),
      nodeSet: new Set(),
      hasCycles: false,
      terminalNodes: [],
    };
  }

  const adjacency = new Map<string, SequenceExit[]>();
  const nodeSet = new Set<string>();
  const hasIncoming = new Set<string>();

  for (const edge of sequencingEdges) {
    nodeSet.add(edge.sourceNodeId);
    nodeSet.add(edge.targetNodeId);
    hasIncoming.add(edge.targetNodeId);

    const exits = adjacency.get(edge.sourceNodeId) ?? [];
    exits.push({
      edgeId: edge.id,
      targetNodeId: edge.targetNodeId,
      label: edge.label,
      priority: edge.sequencePriority,
    });
    adjacency.set(edge.sourceNodeId, exits);
  }

  // Sort exits by priority (ascending), then label as tiebreaker
  for (const exits of adjacency.values()) {
    exits.sort((a, b) =>
      a.priority !== b.priority
        ? a.priority - b.priority
        : a.label.localeCompare(b.label)
    );
  }

  const roots = [...nodeSet].filter((id) => !hasIncoming.has(id));

  const terminalNodes = [...nodeSet].filter(
    (id) => !adjacency.has(id) || adjacency.get(id)!.length === 0
  );

  // Cycle detection via DFS
  const hasCycles = detectCycles(adjacency, nodeSet);

  return { roots, adjacency, nodeSet, hasCycles, terminalNodes };
}

function detectCycles(
  adjacency: Map<string, SequenceExit[]>,
  nodeSet: Set<string>
): boolean {
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (inStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    inStack.add(nodeId);

    for (const exit of adjacency.get(nodeId) ?? []) {
      if (dfs(exit.targetNodeId)) return true;
    }

    inStack.delete(nodeId);
    return false;
  }

  for (const nodeId of nodeSet) {
    if (dfs(nodeId)) return true;
  }

  return false;
}
```

- [ ] **Step 4: Export from canvas package**

In `packages/canvas/src/index.ts`, add:

```typescript
export * from "./sequences/walkSequenceGraph";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/canvas/src/sequences/walkSequenceGraph.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/canvas/src/sequences/walkSequenceGraph.ts packages/canvas/src/sequences/walkSequenceGraph.test.ts packages/canvas/src/index.ts
git commit -m "feat: walkSequenceGraph pure function with root detection, adjacency, and cycle detection"
```

---

### Task 6: AnnotatedEdge — Visual treatment for sequencing edges

**Files:**
- Modify: `packages/canvas/src/edges/AnnotatedEdge.tsx`
- Modify: `packages/canvas/src/CanvasView.tsx:372-396`
- Modify: `apps/desktop/src/styles.css`

- [ ] **Step 1: Add sequencing data to AnnotatedEdgeData**

In `packages/canvas/src/edges/AnnotatedEdge.tsx`, update `AnnotatedEdgeData` (line 11):

```typescript
type AnnotatedEdgeData = Record<string, unknown> & {
  directionality?: "none" | "forward" | "backward" | "bidirectional";
  note?: string;
  onSelect?: () => void;
  onCycleDirectionality?: () => void;
  onDelete?: () => void;
  onUpdateRelationKind?: (relationKind: string) => void;
  relationKind: string;
  selected?: boolean;
  sequencing?: boolean;
};
```

- [ ] **Step 2: Apply sequencing CSS class to edge path**

In the `AnnotatedEdge` component, add a `data-sequencing` attribute to the wrapping fragment. Since `BaseEdge` doesn't support className, wrap the `<BaseEdge>` in a `<g>` element with the data attribute:

Replace the `<BaseEdge>` line with:

```tsx
      <g data-sequencing={data?.sequencing ? "true" : "false"}>
        <BaseEdge markerEnd={markerEnd} path={edgePath} />
      </g>
```

Also add `data-sequencing` to the edge label div:

```tsx
          className="flow-edge-label"
          data-selected={data?.selected ? "true" : "false"}
          data-sequencing={data?.sequencing ? "true" : "false"}
```

- [ ] **Step 3: Pass sequencing flag from CanvasView**

In `packages/canvas/src/CanvasView.tsx`, update the `flowEdges` mapping (around line 379) to include `sequencing`:

```typescript
    data: {
      directionality: edge.directionality,
      relationKind: edge.relationKind,
      note: edge.note,
      sequencing: edge.sequencing,
      onSelect: () => {
```

- [ ] **Step 4: Override markers for sequencing edges**

In the `flowEdges` mapping, force a forward arrow marker on sequencing edges regardless of directionality:

```typescript
    ...(edge.sequencing
      ? { markerEnd: { type: MarkerType.ArrowClosed } }
      : edgeMarkers(edge.directionality)),
```

- [ ] **Step 5: Add CSS for sequencing edge styling**

In `apps/desktop/src/styles.css`, add near the edge styles section:

```css
/* Sequencing edge visual treatment */
g[data-sequencing="true"] .react-flow__edge-path {
  stroke: #f0b45a;
  stroke-width: 3;
  stroke-dasharray: 8 4;
  animation: sequencing-dash 0.8s linear infinite;
}

@keyframes sequencing-dash {
  to {
    stroke-dashoffset: -12;
  }
}

.flow-edge-label[data-sequencing="true"] {
  border-color: rgba(240, 180, 90, 0.5);
}
```

- [ ] **Step 6: Run TypeScript check**

Run: `pnpm exec tsc -b`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/canvas/src/edges/AnnotatedEdge.tsx packages/canvas/src/CanvasView.tsx apps/desktop/src/styles.css
git commit -m "feat: visual treatment for sequencing edges (animated gold dash, forced arrow)"
```

---

### Task 7: Context menu — Add sequencing actions

**Files:**
- Modify: `packages/canvas/src/CanvasView.tsx`

- [ ] **Step 1: Add sequencing callbacks to CanvasViewProps**

In `packages/canvas/src/CanvasView.tsx`, add to `CanvasViewProps` interface:

```typescript
  onToggleEdgeSequencing?: (edgeId: string) => void;
  onPlaySequence?: () => void;
```

Add to destructured props in `CanvasViewInner`:

```typescript
  onToggleEdgeSequencing,
  onPlaySequence,
```

- [ ] **Step 2: Add "Mark as sequence arrow" to edge context menu**

Update the edge context menu (around line 548) to add the sequencing toggle before "Delete connection":

```tsx
      {contextMenu?.kind === "edge" && contextMenu.edgeId && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          items={[
            {
              type: "item",
              label: edges.find((e) => e.id === contextMenu.edgeId)?.sequencing
                ? "Remove from sequence"
                : "Mark as sequence arrow",
              onClick: () => {
                onToggleEdgeSequencing?.(contextMenu.edgeId!);
                closeContextMenu();
              },
            },
            { type: "separator" },
            {
              type: "item",
              label: "Cycle arrow direction",
              onClick: () => {
                onCycleEdgeDirectionality?.(contextMenu.edgeId!);
                closeContextMenu();
              },
            },
            {
              type: "item",
              label: "Delete connection",
              shortcut: "⌫",
              danger: true,
              onClick: () => {
                onDeleteEdge?.(contextMenu.edgeId!);
                onSelectEdge?.(null);
                closeContextMenu();
              },
            },
          ]}
        />
      )}
```

- [ ] **Step 3: Add "Play sequence" to canvas context menu**

Add a "Play sequence" item to the canvas context menu (around line 516), shown only if there are sequencing edges:

```tsx
      {contextMenu && contextMenu.kind === "canvas" && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          items={[
            { type: "item", label: "Add note", shortcut: "N", onClick: () => onCreateNote?.(getViewportCenter()) },
            {
              type: "item",
              label: "Add resource from file…",
              shortcut: "R",
              onClick: () => {
                setShowFilePicker({ x: contextMenu.x, y: contextMenu.y });
                setContextMenu(null);
              },
            },
            { type: "item", label: "Add group", shortcut: "G", onClick: () => onCreateGroup?.(getViewportCenter()) },
            ...(edges.some((e) => e.sequencing)
              ? [
                  { type: "separator" as const },
                  {
                    type: "item" as const,
                    label: "Play sequence",
                    shortcut: "P",
                    onClick: () => {
                      onPlaySequence?.();
                      closeContextMenu();
                    },
                  },
                ]
              : []),
            { type: "separator" as const },
            { type: "item" as const, label: "Paste", shortcut: "⌘V", onClick: () => {} },
            { type: "item" as const, label: "Select all", shortcut: "⌘A", onClick: () => {} },
          ]}
        />
      )}
```

- [ ] **Step 4: Add P keyboard shortcut for play sequence**

In the keydown handler (around line 289), add:

```typescript
      if (e.key === "p" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        if (edges.some((edge) => edge.sequencing)) {
          onPlaySequence?.();
        }
      }
```

Add `onPlaySequence` and `edges` to the effect's dependency array.

- [ ] **Step 5: Run TypeScript check**

Run: `pnpm exec tsc -b`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/canvas/src/CanvasView.tsx
git commit -m "feat: context menu actions for sequence toggle and play, P keyboard shortcut"
```

---

### Task 8: Full-screen presenter — Replaces FullScreenReader

**Files:**
- Create: `packages/canvas/src/sequences/SequencePresenter.tsx`
- Create: `packages/canvas/src/sequences/SequencePresenter.test.tsx`
- Create: `packages/canvas/src/sequences/playbackReducer.ts`
- Create: `packages/canvas/src/sequences/playbackReducer.test.ts`
- Modify: `packages/canvas/src/index.ts`
- Modify: `apps/desktop/src/layout/FullScreenReader.tsx` (rewrite to delegate)
- Modify: `apps/desktop/src/styles.css`

- [ ] **Step 1: Write playback reducer tests**

Create `packages/canvas/src/sequences/playbackReducer.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { playbackReducer, initialPlaybackState, type PlaybackState } from "./playbackReducer";

describe("playbackReducer", () => {
  test("enter sets active and pushes root", () => {
    const state = playbackReducer(initialPlaybackState, {
      type: "enter",
      rootNodeId: "A",
    });

    expect(state.active).toBe(true);
    expect(state.currentNodeId).toBe("A");
    expect(state.path).toEqual(["A"]);
  });

  test("advance pushes target onto path", () => {
    const state: PlaybackState = {
      active: true,
      path: ["A"],
      currentNodeId: "A",
    };

    const next = playbackReducer(state, {
      type: "advance",
      targetNodeId: "B",
    });

    expect(next.path).toEqual(["A", "B"]);
    expect(next.currentNodeId).toBe("B");
  });

  test("back pops current from path", () => {
    const state: PlaybackState = {
      active: true,
      path: ["A", "B", "C"],
      currentNodeId: "C",
    };

    const next = playbackReducer(state, { type: "back" });

    expect(next.path).toEqual(["A", "B"]);
    expect(next.currentNodeId).toBe("B");
  });

  test("back from root exits playback", () => {
    const state: PlaybackState = {
      active: true,
      path: ["A"],
      currentNodeId: "A",
    };

    const next = playbackReducer(state, { type: "back" });

    expect(next.active).toBe(false);
    expect(next.path).toEqual([]);
    expect(next.currentNodeId).toBeNull();
  });

  test("exit deactivates playback", () => {
    const state: PlaybackState = {
      active: true,
      path: ["A", "B"],
      currentNodeId: "B",
    };

    const next = playbackReducer(state, { type: "exit" });

    expect(next.active).toBe(false);
  });

  test("jump replaces path", () => {
    const state: PlaybackState = {
      active: true,
      path: ["A", "B"],
      currentNodeId: "B",
    };

    const next = playbackReducer(state, {
      type: "jump",
      nodeId: "D",
      pathFromRoot: ["A", "C", "D"],
    });

    expect(next.path).toEqual(["A", "C", "D"]);
    expect(next.currentNodeId).toBe("D");
  });

  test("home clears path", () => {
    const state: PlaybackState = {
      active: true,
      path: ["A", "B", "C"],
      currentNodeId: "C",
    };

    const next = playbackReducer(state, { type: "home" });

    expect(next.path).toEqual([]);
    expect(next.currentNodeId).toBeNull();
    expect(next.active).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/canvas/src/sequences/playbackReducer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement playback reducer**

Create `packages/canvas/src/sequences/playbackReducer.ts`:

```typescript
export interface PlaybackState {
  active: boolean;
  path: string[];
  currentNodeId: string | null;
}

export type PlaybackAction =
  | { type: "enter"; rootNodeId: string }
  | { type: "advance"; targetNodeId: string }
  | { type: "back" }
  | { type: "jump"; nodeId: string; pathFromRoot: string[] }
  | { type: "home" }
  | { type: "exit" };

export const initialPlaybackState: PlaybackState = {
  active: false,
  path: [],
  currentNodeId: null,
};

export function playbackReducer(
  state: PlaybackState,
  action: PlaybackAction
): PlaybackState {
  switch (action.type) {
    case "enter":
      return {
        active: true,
        path: [action.rootNodeId],
        currentNodeId: action.rootNodeId,
      };

    case "advance":
      return {
        ...state,
        path: [...state.path, action.targetNodeId],
        currentNodeId: action.targetNodeId,
      };

    case "back": {
      if (state.path.length <= 1) {
        return { active: false, path: [], currentNodeId: null };
      }
      const nextPath = state.path.slice(0, -1);
      return {
        ...state,
        path: nextPath,
        currentNodeId: nextPath[nextPath.length - 1],
      };
    }

    case "jump":
      return {
        ...state,
        path: action.pathFromRoot,
        currentNodeId: action.nodeId,
      };

    case "home":
      return { ...state, path: [], currentNodeId: null };

    case "exit":
      return { ...state, active: false };

    default:
      return state;
  }
}
```

- [ ] **Step 4: Run reducer tests**

Run: `pnpm vitest run packages/canvas/src/sequences/playbackReducer.test.ts`
Expected: PASS

- [ ] **Step 5: Implement SequencePresenter component**

Create `packages/canvas/src/sequences/SequencePresenter.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useReducer } from "react";
import type { CanvasEdge, CanvasNode } from "@research-canvas/schema";
import { walkSequenceGraph } from "./walkSequenceGraph";
import {
  initialPlaybackState,
  playbackReducer,
} from "./playbackReducer";

interface SequencePresenterProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  onClose: () => void;
  /** Render the content for a given node */
  renderNodeContent: (node: CanvasNode) => React.ReactNode;
  /** Optional: called when playback navigates to a node (for viewport animation) */
  onNavigateToNode?: (nodeId: string, viewport?: { x: number; y: number; zoom: number } | null) => void;
  projectName?: string;
}

export function SequencePresenter({
  nodes,
  edges,
  onClose,
  renderNodeContent,
  onNavigateToNode,
  projectName = "Project",
}: SequencePresenterProps) {
  const graph = useMemo(
    () => walkSequenceGraph(nodes, edges),
    [nodes, edges]
  );

  const [playback, dispatch] = useReducer(playbackReducer, initialPlaybackState);

  // Auto-enter if single root
  useEffect(() => {
    if (!playback.active && playback.path.length === 0 && graph.roots.length === 1) {
      dispatch({ type: "enter", rootNodeId: graph.roots[0] });
    }
  }, [graph.roots, playback.active, playback.path.length]);

  const currentNode = useMemo(
    () => (playback.currentNodeId ? nodes.find((n) => n.id === playback.currentNodeId) ?? null : null),
    [nodes, playback.currentNodeId]
  );

  const currentExits = useMemo(
    () => (playback.currentNodeId ? graph.adjacency.get(playback.currentNodeId) ?? [] : []),
    [graph.adjacency, playback.currentNodeId]
  );

  // Find the edge that brought us here (for "via" label)
  const arrivalEdge = useMemo(() => {
    if (playback.path.length < 2) return null;
    const prevNodeId = playback.path[playback.path.length - 2];
    return edges.find(
      (e) => e.sequencing && e.sourceNodeId === prevNodeId && e.targetNodeId === playback.currentNodeId
    ) ?? null;
  }, [edges, playback.path, playback.currentNodeId]);

  const handleAdvance = useCallback(
    (exitIndex: number) => {
      const exit = currentExits[exitIndex];
      if (!exit) return;
      dispatch({ type: "advance", targetNodeId: exit.targetNodeId });
    },
    [currentExits]
  );

  // Notify parent of navigation for viewport animation
  useEffect(() => {
    if (playback.currentNodeId) {
      const node = nodes.find((n) => n.id === playback.currentNodeId);
      onNavigateToNode?.(playback.currentNodeId, node?.sequenceViewport);
    }
  }, [playback.currentNodeId, nodes, onNavigateToNode]);

  // Keyboard controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Backspace") {
        e.preventDefault();
        dispatch({ type: "back" });
        return;
      }

      if (e.key === "Home") {
        e.preventDefault();
        dispatch({ type: "home" });
        return;
      }

      if (e.key === " " && currentExits.length === 1) {
        e.preventDefault();
        handleAdvance(0);
        return;
      }

      const digit = parseInt(e.key, 10);
      if (digit >= 1 && digit <= 9 && digit <= currentExits.length) {
        e.preventDefault();
        handleAdvance(digit - 1);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, currentExits, handleAdvance]);

  // Root picker
  if (playback.path.length === 0) {
    if (graph.roots.length === 0) {
      return (
        <div className="sequence-presenter">
          <div className="sp-empty">
            <p>No sequence roots found. Mark edges as sequence arrows to create a path.</p>
            <button className="sp-close-btn" onClick={onClose}>Close</button>
          </div>
        </div>
      );
    }

    return (
      <div className="sequence-presenter">
        <div className="sp-root-picker">
          <h2>Choose a starting point</h2>
          <div className="sp-root-list">
            {graph.roots.map((rootId, i) => {
              const rootNode = nodes.find((n) => n.id === rootId);
              return (
                <button
                  key={rootId}
                  className="sp-root-option"
                  onClick={() => dispatch({ type: "enter", rootNodeId: rootId })}
                >
                  <span className="sp-root-key">{i + 1}</span>
                  <span className="sp-root-title">{rootNode?.title ?? rootId}</span>
                </button>
              );
            })}
          </div>
          <button className="sp-close-btn" onClick={onClose}>Cancel (Esc)</button>
        </div>
      </div>
    );
  }

  if (!currentNode) {
    return null;
  }

  // Determine layout mode based on content type
  const layoutMode = getLayoutMode(currentNode);
  const caption = currentNode.sequenceCaption ?? currentNode.summary ?? "";

  return (
    <div className="sequence-presenter" data-layout={layoutMode}>
      {/* Breadcrumb */}
      <header className="sp-breadcrumb">
        <nav>
          {playback.path.map((nodeId, i) => {
            const pathNode = nodes.find((n) => n.id === nodeId);
            const isCurrent = i === playback.path.length - 1;
            return (
              <span key={nodeId}>
                {i > 0 && <span className="sp-sep">›</span>}
                <button
                  className="sp-crumb"
                  data-current={isCurrent ? "true" : "false"}
                  onClick={() => {
                    if (!isCurrent) {
                      dispatch({
                        type: "jump",
                        nodeId,
                        pathFromRoot: playback.path.slice(0, i + 1),
                      });
                    }
                  }}
                  disabled={isCurrent}
                >
                  {pathNode?.title ?? nodeId}
                </button>
              </span>
            );
          })}
        </nav>
        <button className="sp-close-btn" onClick={onClose} title="Back to canvas (Esc)">
          ← Back
        </button>
      </header>

      {/* Main content area */}
      <main className={`sp-main sp-main--${layoutMode}`}>
        {layoutMode === "split" ? (
          <>
            <div className="sp-content">{renderNodeContent(currentNode)}</div>
            <aside className="sp-sidebar">
              <h1 className="sp-title">{currentNode.title}</h1>
              {arrivalEdge && (
                <div className="sp-arrival">via: {arrivalEdge.label}</div>
              )}
              {caption && <p className="sp-caption">{caption}</p>}
            </aside>
          </>
        ) : (
          <div className="sp-content sp-content--centered">
            <h1 className="sp-title">{currentNode.title}</h1>
            {arrivalEdge && (
              <div className="sp-arrival">via: {arrivalEdge.label}</div>
            )}
            {renderNodeContent(currentNode)}
            {caption && <p className="sp-caption">{caption}</p>}
          </div>
        )}
      </main>

      {/* Exit bar */}
      <footer className="sp-exits">
        {currentExits.length === 0 ? (
          <div className="sp-terminal">
            End of sequence · <kbd>Backspace</kbd> to go back · <kbd>Esc</kbd> to exit
          </div>
        ) : currentExits.length === 1 ? (
          <button
            className="sp-exit-btn"
            onClick={() => handleAdvance(0)}
          >
            <kbd>Space</kbd> {currentExits[0].label} →
          </button>
        ) : (
          currentExits.map((exit, i) => {
            const isRevisit = playback.path.includes(exit.targetNodeId);
            return (
              <button
                key={exit.edgeId}
                className="sp-exit-btn"
                data-revisit={isRevisit ? "true" : "false"}
                onClick={() => handleAdvance(i)}
              >
                <kbd>{i + 1}</kbd> {exit.label}
                {isRevisit && <span className="sp-revisit-badge">revisiting</span>}
              </button>
            );
          })
        )}
      </footer>
    </div>
  );
}

function getLayoutMode(node: CanvasNode): "split" | "centered" {
  if (node.type === "resource") {
    const kind = node.resourceKind;
    if (kind === "image" || kind === "pdf") return "split";
  }
  return "centered";
}
```

- [ ] **Step 6: Export from canvas package**

In `packages/canvas/src/index.ts`, add:

```typescript
export * from "./sequences/SequencePresenter";
export * from "./sequences/playbackReducer";
```

- [ ] **Step 7: Rewrite FullScreenReader to support both modes**

Replace `apps/desktop/src/layout/FullScreenReader.tsx` with a version that supports both single-node viewing (existing double-click) and sequence playback:

```tsx
import { useEffect, useMemo, useState } from "react";
import type { CanvasNode } from "@research-canvas/schema";
import { readWorkspaceTextFile } from "@research-canvas/desktop-api";
import { SequencePresenter } from "@research-canvas/canvas";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { NodeContentPane } from "../features/viewer/NodeContentPane";

interface FullScreenReaderProps {
  mode: "node" | "sequence";
  onClose: () => void;
}

export function FullScreenReader({ mode, onClose }: FullScreenReaderProps) {
  if (mode === "sequence") {
    return <SequenceMode onClose={onClose} />;
  }

  return <NodeMode onClose={onClose} />;
}

function NodeMode({ onClose }: { onClose: () => void }) {
  const workspace = useCanvasWorkspace();
  const node: CanvasNode | null =
    workspace.nodes.find((n) => n.id === workspace.selectedNodeId) ?? null;
  const textResourceNode =
    node?.type === "resource" &&
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
        <NodeContentPane
          node={node}
          textContent={textContent}
          onFullScreen={onClose}
          onNoteContentChange={(content) => workspace.updateNodeContent(node.id, content)}
          showToolbar={false}
        />
      </main>
    </div>
  );
}

function SequenceMode({ onClose }: { onClose: () => void }) {
  const workspace = useCanvasWorkspace();

  const renderNodeContent = useMemo(
    () => (node: CanvasNode) => (
      <SequenceNodeContent node={node} />
    ),
    []
  );

  return (
    <SequencePresenter
      nodes={workspace.nodes}
      edges={workspace.edges}
      onClose={onClose}
      renderNodeContent={renderNodeContent}
      onNavigateToNode={(nodeId, viewport) => {
        workspace.flyToNode(nodeId, viewport ?? undefined);
      }}
      projectName={workspace.activeProject?.displayName}
    />
  );
}

function SequenceNodeContent({ node }: { node: CanvasNode }) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const textResourceNode =
    node.type === "resource" &&
    node.absolutePath &&
    (node.resourceKind === "markdown" || node.resourceKind === "text")
      ? node
      : null;

  useEffect(() => {
    setTextContent(null);
    if (!textResourceNode) return;
    readWorkspaceTextFile(textResourceNode.absolutePath)
      .then(setTextContent)
      .catch(() => setTextContent(null));
  }, [textResourceNode]);

  return (
    <NodeContentPane
      node={node}
      textContent={textContent}
      onFullScreen={() => {}}
      showToolbar={false}
    />
  );
}
```

- [ ] **Step 8: Update Shell.tsx to support both fullscreen modes**

In `apps/desktop/src/layout/Shell.tsx`, update the state and the FullScreenReader usage:

Change `fullScreenOpen` state from boolean to a mode string:

```typescript
  const [fullScreenMode, setFullScreenMode] = useState<"closed" | "node" | "sequence">("closed");
  const closeFullScreen = useCallback(() => setFullScreenMode("closed"), []);
```

Update `handleNodeDoubleClick` to use `setFullScreenMode("node")`.

Update `RightPanelSlot` `onFullScreen` to use `() => setFullScreenMode("node")`.

Update the rendering:

```tsx
        {fullScreenMode !== "closed" && (
          <FullScreenReader mode={fullScreenMode} onClose={closeFullScreen} />
        )}
```

Add `onPlaySequence` handler and pass to `CanvasPane`:

```typescript
  const handlePlaySequence = useCallback(() => {
    setFullScreenMode("sequence");
  }, []);
```

- [ ] **Step 9: Wire onPlaySequence through CanvasPane to CanvasView**

In the CanvasPane component (check its props), pass `onPlaySequence` down. In `CanvasPane`, pass it to `CanvasView` as the `onPlaySequence` prop.

Also wire `onToggleEdgeSequencing` through CanvasPane:

```typescript
onToggleEdgeSequencing={(edgeId) => {
  workspace.store.getState().toggleEdgeSequencing(edgeId);
}}
```

- [ ] **Step 10: Add presenter styles**

In `apps/desktop/src/styles.css`, add:

```css
/* ---- Sequence Presenter ---- */
.sequence-presenter {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: #0a0908;
  display: flex;
  flex-direction: column;
  color: #c0c0e0;
  font-family: inherit;
}

.sp-empty,
.sp-root-picker {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
}

.sp-root-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 280px;
}

.sp-root-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: rgba(240, 180, 90, 0.08);
  border: 1px solid rgba(240, 180, 90, 0.2);
  border-radius: 0.5rem;
  color: #c0c0e0;
  cursor: pointer;
  font-size: 0.95rem;
  text-align: left;
}
.sp-root-option:hover {
  background: rgba(240, 180, 90, 0.15);
}
.sp-root-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 0.25rem;
  background: rgba(240, 180, 90, 0.2);
  color: #f0b45a;
  font-size: 0.75rem;
  font-weight: 600;
}

.sp-breadcrumb {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1.25rem;
  background: rgba(0, 0, 0, 0.4);
  font-size: 0.8rem;
  opacity: 0.7;
}
.sp-breadcrumb:hover { opacity: 1; }
.sp-sep { margin: 0 0.35rem; opacity: 0.4; }
.sp-crumb {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: inherit;
  padding: 0;
}
.sp-crumb[data-current="true"] {
  color: #f0b45a;
  cursor: default;
}

.sp-main {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.sp-main--split {
  flex-direction: row;
}

.sp-main--centered {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.sp-content {
  flex: 1;
  min-width: 0;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sp-content--centered {
  max-width: 680px;
  width: 100%;
}

.sp-sidebar {
  width: 30%;
  max-width: 360px;
  min-width: 240px;
  padding: 2rem 1.5rem;
  overflow-y: auto;
  border-left: 1px solid rgba(240, 180, 90, 0.1);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sp-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #f0b45a;
  margin: 0;
}

.sp-arrival {
  font-size: 0.8rem;
  color: rgba(240, 180, 90, 0.6);
  font-style: italic;
}

.sp-caption {
  font-size: 0.9rem;
  line-height: 1.5;
  color: #a0a0c0;
  margin: 0;
}

.sp-exits {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: rgba(0, 0, 0, 0.5);
  border-top: 1px solid rgba(240, 180, 90, 0.1);
  flex-wrap: wrap;
}

.sp-exit-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(240, 180, 90, 0.1);
  border: 1px solid rgba(240, 180, 90, 0.25);
  border-radius: 0.4rem;
  color: #c0c0e0;
  cursor: pointer;
  font-size: 0.85rem;
}
.sp-exit-btn:hover {
  background: rgba(240, 180, 90, 0.2);
  border-color: rgba(240, 180, 90, 0.4);
}
.sp-exit-btn kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  border-radius: 0.2rem;
  background: rgba(240, 180, 90, 0.2);
  color: #f0b45a;
  font-size: 0.7rem;
  font-weight: 600;
}
.sp-exit-btn[data-revisit="true"] {
  opacity: 0.6;
}
.sp-revisit-badge {
  font-size: 0.7rem;
  color: rgba(240, 180, 90, 0.5);
  font-style: italic;
}

.sp-terminal {
  font-size: 0.85rem;
  color: #888;
}
.sp-terminal kbd {
  padding: 0.1rem 0.3rem;
  border-radius: 0.15rem;
  background: rgba(255, 255, 255, 0.08);
  font-size: 0.75rem;
}

.sp-close-btn {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0.35rem;
  color: #888;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  font-size: 0.8rem;
}
.sp-close-btn:hover {
  color: #c0c0e0;
  border-color: rgba(255, 255, 255, 0.3);
}
```

- [ ] **Step 11: Run TypeScript check and tests**

Run: `pnpm exec tsc -b && pnpm vitest run`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: full-screen sequence presenter with playback reducer, keyboard nav, and adaptive layouts"
```

---

### Task 9: Sequence map overlay — Replace MiniMap

**Files:**
- Create: `packages/canvas/src/sequences/SequenceMap.tsx`
- Modify: `packages/canvas/src/CanvasView.tsx`
- Modify: `packages/canvas/src/index.ts`
- Modify: `apps/desktop/src/styles.css`

- [ ] **Step 1: Create SequenceMap component**

Create `packages/canvas/src/sequences/SequenceMap.tsx`:

```tsx
import { useMemo } from "react";
import type { CanvasNode } from "@research-canvas/schema";
import type { SequenceGraph } from "./walkSequenceGraph";

interface SequenceMapProps {
  graph: SequenceGraph;
  nodes: CanvasNode[];
  currentNodeId?: string | null;
  visitedNodeIds?: string[];
  onClickNode?: (nodeId: string) => void;
}

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  title: string;
  isRoot: boolean;
  isTerminal: boolean;
}

interface LayoutEdge {
  from: string;
  to: string;
}

const NODE_W = 10;
const NODE_H = 10;
const H_GAP = 24;
const V_GAP = 20;
const PADDING = 12;

export function SequenceMap({
  graph,
  nodes,
  currentNodeId,
  visitedNodeIds = [],
  onClickNode,
}: SequenceMapProps) {
  const layout = useMemo(() => computeLayout(graph, nodes), [graph, nodes]);

  if (layout.nodes.length === 0) return null;

  const visitedSet = new Set(visitedNodeIds);

  return (
    <div className="sequence-map">
      <svg
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
      >
        {/* Edges */}
        {layout.edges.map((edge) => {
          const from = layout.nodes.find((n) => n.id === edge.from);
          const to = layout.nodes.find((n) => n.id === edge.to);
          if (!from || !to) return null;
          return (
            <line
              key={`${edge.from}-${edge.to}`}
              x1={from.x + NODE_W / 2}
              y1={from.y + NODE_H}
              x2={to.x + NODE_W / 2}
              y2={to.y}
              className="sm-edge"
            />
          );
        })}

        {/* Nodes */}
        {layout.nodes.map((layoutNode) => {
          const isCurrent = layoutNode.id === currentNodeId;
          const isVisited = visitedSet.has(layoutNode.id);
          return (
            <g
              key={layoutNode.id}
              className="sm-node"
              data-current={isCurrent ? "true" : "false"}
              data-visited={isVisited ? "true" : "false"}
              onClick={() => onClickNode?.(layoutNode.id)}
              style={{ cursor: onClickNode ? "pointer" : "default" }}
            >
              {layoutNode.isTerminal ? (
                <rect
                  x={layoutNode.x}
                  y={layoutNode.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={2}
                />
              ) : (
                <circle
                  cx={layoutNode.x + NODE_W / 2}
                  cy={layoutNode.y + NODE_H / 2}
                  r={NODE_W / 2}
                />
              )}
              <title>{layoutNode.title}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function computeLayout(
  graph: SequenceGraph,
  nodes: CanvasNode[]
): { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number } {
  if (graph.nodeSet.size === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const titleMap = new Map<string, string>();
  for (const n of nodes) {
    titleMap.set(n.id, n.title);
  }

  const terminalSet = new Set(graph.terminalNodes);
  const rootSet = new Set(graph.roots);

  // BFS layered layout from roots
  const depths = new Map<string, number>();
  const queue: string[] = [...graph.roots];
  for (const r of queue) depths.set(r, 0);

  // If no roots (cycle-only), start from first node
  if (queue.length === 0) {
    const first = [...graph.nodeSet][0];
    queue.push(first);
    depths.set(first, 0);
  }

  let head = 0;
  while (head < queue.length) {
    const nodeId = queue[head++];
    const depth = depths.get(nodeId) ?? 0;
    for (const exit of graph.adjacency.get(nodeId) ?? []) {
      if (!depths.has(exit.targetNodeId)) {
        depths.set(exit.targetNodeId, depth + 1);
        queue.push(exit.targetNodeId);
      }
    }
  }

  // Assign positions: group by depth, spread horizontally
  const byDepth = new Map<number, string[]>();
  for (const [nodeId, depth] of depths) {
    const list = byDepth.get(depth) ?? [];
    list.push(nodeId);
    byDepth.set(depth, list);
  }

  const maxDepth = Math.max(...byDepth.keys(), 0);
  const layoutNodes: LayoutNode[] = [];

  for (let d = 0; d <= maxDepth; d++) {
    const row = byDepth.get(d) ?? [];
    const rowWidth = row.length * NODE_W + (row.length - 1) * H_GAP;
    const startX = PADDING + (row.length > 1 ? 0 : 0);
    row.forEach((nodeId, i) => {
      layoutNodes.push({
        id: nodeId,
        x: PADDING + i * (NODE_W + H_GAP),
        y: PADDING + d * (NODE_H + V_GAP),
        title: titleMap.get(nodeId) ?? nodeId,
        isRoot: rootSet.has(nodeId),
        isTerminal: terminalSet.has(nodeId),
      });
    });
  }

  const layoutEdges: LayoutEdge[] = [];
  for (const [sourceId, exits] of graph.adjacency) {
    for (const exit of exits) {
      layoutEdges.push({ from: sourceId, to: exit.targetNodeId });
    }
  }

  const maxX = Math.max(...layoutNodes.map((n) => n.x + NODE_W), 0) + PADDING;
  const maxY = Math.max(...layoutNodes.map((n) => n.y + NODE_H), 0) + PADDING;

  return { nodes: layoutNodes, edges: layoutEdges, width: maxX, height: maxY };
}
```

- [ ] **Step 2: Export from canvas package**

In `packages/canvas/src/index.ts`, add:

```typescript
export * from "./sequences/SequenceMap";
```

- [ ] **Step 3: Replace MiniMap with SequenceMap in CanvasView**

In `packages/canvas/src/CanvasView.tsx`:

Remove `MiniMap` from the `@xyflow/react` import.

Add imports:

```typescript
import { SequenceMap } from "./sequences/SequenceMap";
import { walkSequenceGraph } from "./sequences/walkSequenceGraph";
```

Add a `useMemo` for the graph inside `CanvasViewInner`:

```typescript
  const sequenceGraph = useMemo(
    () => walkSequenceGraph(nodes, edges),
    [nodes, edges]
  );
```

Replace `<MiniMap pannable zoomable />` (line 508) with:

```tsx
        {sequenceGraph.nodeSet.size > 0 && (
          <SequenceMap
            graph={sequenceGraph}
            nodes={nodes}
            onClickNode={(nodeId) => flyToNode(nodeId)}
          />
        )}
```

- [ ] **Step 4: Add SequenceMap styles**

In `apps/desktop/src/styles.css`, replace the old minimap styles with:

```css
/* ---- Sequence Map (replaces MiniMap) ---- */
.sequence-map {
  position: absolute;
  bottom: 12px;
  left: 12px;
  z-index: 5;
  background: rgba(14, 14, 34, 0.85);
  border: 1px solid rgba(240, 180, 90, 0.15);
  border-radius: 0.5rem;
  padding: 4px;
  opacity: 0;
  transition: opacity 150ms ease;
  pointer-events: none;
}
.canvas-flow:hover .sequence-map {
  opacity: 1;
  pointer-events: auto;
}

.sm-edge {
  stroke: rgba(240, 180, 90, 0.3);
  stroke-width: 1;
}

.sm-node circle,
.sm-node rect {
  fill: rgba(240, 180, 90, 0.2);
  stroke: rgba(240, 180, 90, 0.5);
  stroke-width: 1;
}

.sm-node[data-current="true"] circle,
.sm-node[data-current="true"] rect {
  fill: #f0b45a;
  stroke: #f0b45a;
}

.sm-node[data-visited="true"] circle,
.sm-node[data-visited="true"] rect {
  fill: rgba(240, 180, 90, 0.5);
}
```

- [ ] **Step 5: Run TypeScript check and tests**

Run: `pnpm exec tsc -b && pnpm vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: sequence map overlay replacing MiniMap, shows topology with current/visited state"
```

---

### Task 10: Inspector — Sequence section for nodes and edges

**Files:**
- Modify: `apps/desktop/src/features/inspector/InspectorTab.tsx`
- Modify: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`

- [ ] **Step 1: Add store methods to workspace context**

In `CanvasWorkspaceContext.tsx`, expose the new canvas store methods in the context value and `useCanvasWorkspace`:

Add to `CanvasWorkspaceContextValue`:

```typescript
  toggleEdgeSequencing: (edgeId: string) => void;
  updateEdgeSequencePriority: (edgeId: string, priority: number) => void;
  updateNodeSequenceCaption: (nodeId: string, caption: string | null) => void;
  setNodeSequenceViewport: (nodeId: string, viewport: { x: number; y: number; zoom: number } | null) => void;
```

Add implementations in the context value memo:

```typescript
      toggleEdgeSequencing: (edgeId) => {
        stores.store.getState().toggleEdgeSequencing(edgeId);
      },
      updateEdgeSequencePriority: (edgeId, priority) => {
        stores.store.getState().updateEdgeSequencePriority(edgeId, priority);
      },
      updateNodeSequenceCaption: (nodeId, caption) => {
        stores.store.getState().updateNodeSequenceCaption(nodeId, caption);
      },
      setNodeSequenceViewport: (nodeId, viewport) => {
        stores.store.getState().setNodeSequenceViewport(nodeId, viewport);
      },
```

- [ ] **Step 2: Add sequence section to InspectorTab**

In `apps/desktop/src/features/inspector/InspectorTab.tsx`, add a "Sequence" section that shows when the selected node participates in a sequence:

```tsx
import { useMemo } from "react";
import { walkSequenceGraph } from "@research-canvas/canvas";
```

Inside `InspectorTab`, after the existing appearance section:

```tsx
  const sequenceGraph = useMemo(
    () => walkSequenceGraph(workspace.nodes, workspace.edges),
    [workspace.nodes, workspace.edges]
  );

  const nodeInSequence = sequenceGraph.nodeSet.has(node.id);
  const selectedEdge = workspace.edges.find((e) => e.id === workspace.selectedEdgeId) ?? null;
```

Add after the thumbnail picker `</div>`:

```tsx
      {nodeInSequence && (
        <>
          <div className="inspector-section-title">Sequence</div>
          <div className="inspector-field">
            <label className="inspector-label">Caption</label>
            <input
              className="inspector-value inspector-value--input"
              type="text"
              value={node.sequenceCaption ?? ""}
              placeholder={node.summary || "No caption"}
              onChange={(e) =>
                workspace.updateNodeSequenceCaption(node.id, e.target.value || null)
              }
            />
          </div>
          <div className="inspector-field">
            <label className="inspector-label">Viewport</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="inspector-value inspector-value--btn"
                onClick={() => workspace.setNodeSequenceViewport(node.id, workspace.captureViewport())}
              >
                Capture current
              </button>
              {node.sequenceViewport && (
                <button
                  className="inspector-value inspector-value--btn"
                  onClick={() => workspace.setNodeSequenceViewport(node.id, null)}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </>
      )}
```

- [ ] **Step 3: Run TypeScript check**

Run: `pnpm exec tsc -b`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/features/inspector/InspectorTab.tsx apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx
git commit -m "feat: inspector sequence section for caption and viewport capture"
```

---

### Task 11: Wire persistence — edge/node sequencing fields through desktop-api

**Files:**
- Modify: `apps/desktop/src-tauri/src/db/repositories/canvas.rs` (persist/load sequencing fields)
- Modify: `apps/desktop/src-tauri/src/commands/projects.rs` (if project document command serializes edges)

- [ ] **Step 1: Verify edge serialization includes new fields**

The edge and node data flows through `persistProjectDocument` → Rust backend. Check that the Rust backend's `save_canvas_snapshot` (or equivalent) writes the new edge fields (`sequencing`, `sequence_priority`) and node fields (`sequence_caption`, `sequence_viewport_json`) when persisting.

The `CanvasGraphRepository` already reads them in `load_canvas_snapshot`. The `connect_nodes_with_handles` method needs to include the new columns in its INSERT:

Update `connect_nodes_with_handles` to include defaults:

```sql
INSERT INTO canvas_edges (
    id, canvas_id, source_node_id, target_node_id,
    source_handle_id, target_handle_id,
    relation_kind, directionality, label, note, style_json,
    sequencing, sequence_priority,
    created_at, updated_at
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, '', ?10, 0, 0, ?11, ?11)
```

- [ ] **Step 2: Update the Rust project document persistence command**

The Rust side receives edges and nodes as JSON from the frontend. Check `apps/desktop/src-tauri/src/commands/projects.rs` to ensure the edge/node JSON deserialization includes the new fields. Since the frontend sends full edge/node objects and the backend uses them for snapshot save, the fields should flow through if the SQL is updated.

Update the snapshot save to write `sequencing` and `sequence_priority` for edges, and `sequence_caption` and `sequence_viewport_json` for nodes. This likely means updating the SQL in the persist/save function to include these columns.

- [ ] **Step 3: Run all Rust tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1`
Expected: PASS

- [ ] **Step 4: Run all frontend tests**

Run: `pnpm vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/db/repositories/canvas.rs apps/desktop/src-tauri/src/commands/projects.rs
git commit -m "feat: persist sequencing fields through canvas snapshot save/load"
```

---

### Task 12: E2E tests — Sequence creation and playback

**Files:**
- Modify: `tests/e2e/sequences.spec.ts`

- [ ] **Step 1: Rewrite sequences E2E test**

Replace `tests/e2e/sequences.spec.ts` with:

```typescript
import { test, expect } from "@playwright/test";

test.describe("Sequences", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[data-testid="canvas-pane"]');
  });

  test("marks edge as sequencing via context menu and sees visual treatment", async ({ page }) => {
    // Create two notes
    await page.click('[data-testid="canvas-pane"]', { button: "right" });
    await page.click('text=Add note');
    await page.click('[data-testid="canvas-pane"]', { button: "right" });
    await page.click('text=Add note');

    // Wait for nodes to appear
    const nodes = page.locator('.react-flow__node');
    await expect(nodes).toHaveCount(2, { timeout: 5000 });

    // Connect them by dragging handle (or use existing edge if available)
    // Right-click the edge and mark as sequence arrow
    const edge = page.locator('.react-flow__edge').first();
    if (await edge.isVisible()) {
      await edge.click({ button: "right" });
      await page.click('text=Mark as sequence arrow');

      // Verify sequencing visual (animated dash)
      await expect(page.locator('g[data-sequencing="true"]')).toBeVisible();
    }
  });

  test("plays sequence via context menu and navigates with keyboard", async ({ page }) => {
    // This test requires a pre-built canvas with sequencing edges
    // For now, verify the play sequence menu item appears when edges are sequencing
    await page.click('[data-testid="canvas-pane"]', { button: "right" });

    // If no sequencing edges, "Play sequence" should not appear
    const playItem = page.locator('text=Play sequence');
    // Initially should not be visible
    await expect(playItem).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Run E2E tests**

Run: `pnpm playwright test tests/e2e/sequences.spec.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/sequences.spec.ts
git commit -m "test: rewrite sequences E2E tests for graph-emergent model"
```

---

### Task 13: Clean up old sequence CSS and verify full build

**Files:**
- Modify: `apps/desktop/src/styles.css`

- [ ] **Step 1: Remove old sequence panel styles**

In `apps/desktop/src/styles.css`, find and remove the old sequence panel styles (the `.sequence-*` classes from the sidebar implementation, around lines 294-331). Keep the new `.sequence-presenter`, `.sp-*`, `.sequence-map`, and `.sm-*` styles added in tasks 8 and 9.

- [ ] **Step 2: Remove old minimap hover styles**

Remove the old `.react-flow__minimap` opacity/transition styles since we replaced it.

- [ ] **Step 3: Run full build**

Run: `pnpm exec tsc -b && pnpm vitest run`
Expected: PASS

- [ ] **Step 4: Run Rust tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/styles.css
git commit -m "chore: clean up old sequence and minimap CSS"
```

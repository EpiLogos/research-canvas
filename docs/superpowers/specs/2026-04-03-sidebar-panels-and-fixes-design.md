# Sidebar Panels, Folder Picker, and Canvas Fixes — Design Spec

**Date:** 2026-04-03
**Goal:** Wire up all placeholder sidebar icons into functional panels, replace the resource folder input with a fuzzy directory picker, fix file drag-to-canvas, and build a sequences manager.

---

## 1. Fuzzy Folder Picker (Resource Roots)

**Replaces:** The inline text input in the left overlay.

**Behaviour:** Clicking the "+" button next to "Resource Folders" opens a modal fuzzy finder populated with directories under `/Users/admin/`. The scan is capped at depth 4 to keep results manageable.

**Implementation:**
- New Tauri command `list_directories_command` — walks `/Users/admin/` recursively up to depth 4, returns `Vec<{path, name, depth}>` of directories only (no files). Filters out hidden directories (`.` prefix) and common noise (`node_modules`, `.git`, `__pycache__`, `target`, `.Trash`).
- Browser bridge equivalent: new GET endpoint `/workspace/directories`.
- Frontend reuses the existing `FuzzyFilePicker` component — pass directory entries as `FileEntry[]` with `kind: "directory"`. On select, call `workspace.attachResourceRoot(selectedPath)`.
- The `LeftOverlay` replaces the inline input with a button that opens the picker as a positioned modal (same pattern as the canvas file picker).

**No new component needed** — `FuzzyFilePicker` already handles fuzzy matching, keyboard nav, and positioned rendering.

---

## 2. Search Panel (Search Icon)

**What it does:** Opens the left panel in a "search" mode with a persistent search input and streaming results.

**Behaviour:**
- Click the search icon (or Cmd+K) → left panel opens showing a search input at top.
- Typing queries the existing `searchProject` transport method with debounce (200ms).
- Results show as a scrollable list: each hit shows title, entity type badge (node/edge/file), snippet, and source path.
- Clicking a result: if it's a node, fly to it on canvas and select it. If it's a file entry, select it in the file tree.
- Escape or clicking the icon again closes search mode.

**Implementation:**
- New component `SearchPanel` in `apps/desktop/src/features/search/SearchPanel.tsx`.
- The `IconStrip` search button sets a `leftMode` state to `"search"` (vs `"files"` for the default file tree view).
- `LeftOverlay` renders either the file tree or `SearchPanel` based on `leftMode`.
- `SearchPanel` uses `useCanvasWorkspace().searchProject()` which already exists and works.

---

## 3. Sequences Manager (Graph Icon)

**What it does:** Full-page overlay for managing named sequences. Each sequence is a saved configuration of which edges participate and which node is the root.

### Data Model

New SQLite table `saved_sequences`:
```sql
CREATE TABLE saved_sequences (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    root_node_id TEXT,
    edge_ids_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_saved_sequences_canvas ON saved_sequences(canvas_id);
```

`edge_ids_json` stores a JSON array of edge IDs that belong to this sequence. When a sequence is "activated" for playback, the system sets `edge.sequencing = true` on those edges (and clears it on others).

### Migration

New migration `0007_saved_sequences.sql` adds the table.

### Rust Repository

New `SavedSequenceRepository` with CRUD operations: `create`, `list_for_canvas`, `get_by_id`, `update`, `delete`.

### Frontend

**Overlay layout** (opened by clicking the graph icon in IconStrip):
- **Left sidebar** (240px): List of saved sequences for the current canvas. Each shows name, edge count, root node name. "New sequence" button at top.
- **Main area**: When a sequence is selected, shows:
  - Name (editable inline)
  - Root node selector (dropdown of all nodes)
  - Edge list — all edges on canvas, with checkboxes to include/exclude from this sequence
  - "Play" button — activates this sequence's edges and opens the presenter
  - "Delete" button
- **Empty state**: "No sequences saved. Create one to define a guided path through your canvas."

**Activation flow:** When the user clicks "Play":
1. Set `sequencing = true` on all edges in `edge_ids_json`, `sequencing = false` on all others
2. If `root_node_id` is set, use it; otherwise use the first root detected by `walkSequenceGraph`
3. Open the sequence presenter (full-screen)

**New component:** `SequencesManager` in `apps/desktop/src/features/sequences/SequencesManager.tsx`.

**Desktop-api additions:** New transport methods for saved sequence CRUD, new payload types.

**Tauri commands:** `list_saved_sequences_command`, `create_saved_sequence_command`, `update_saved_sequence_command`, `delete_saved_sequence_command`.

---

## 4. Annotations Panel (Pen Icon)

**What it does:** Opens the left panel in an "annotations" mode showing annotation management and drawing tools.

**Behaviour:**
- Click the pen icon → left panel opens in annotations mode.
- **Drawing tools section**: Buttons for stroke, highlight, arrow, callout. Clicking one enters that drawing mode on the canvas.
- **Style controls**: Colour picker (preset row), width slider (1-8px), opacity slider.
- **Annotation list**: All annotations on the current canvas, each showing type icon, a preview thumbnail (small SVG of the stroke), and creation time. Click to fly-to. "×" button to delete.
- **Visibility toggle**: "Show/Hide all" toggle at the top.

**Implementation:**
- New component `AnnotationsPanel` in `apps/desktop/src/features/annotations/AnnotationsPanel.tsx`.
- The `IconStrip` pen button sets `leftMode` to `"annotations"`.
- `LeftOverlay` renders the panel.
- Drawing mode state already exists in `CanvasScreen` — the panel needs to communicate drawing mode and tool selection up. Add `drawingTool` state alongside existing `annotationMode`.
- Annotation store already has `serialize()`, `deleteAnnotation()` — just needs UI.

---

## 5. File Drag-to-Canvas Fix

**Problem:** The `onDrop`/`onDragOver` handlers are on a wrapper div outside `<ReactFlow>`. ReactFlow captures pointer events internally, so the drop never reaches the wrapper.

**Fix:** Move `onDrop` and `onDragOver` onto the `<ReactFlow>` component directly. ReactFlow supports these as props — they fire on the internal pane. The `screenToFlowPosition` call already works inside the component.

This is a one-line move of existing handlers.

---

## 6. Settings Panel (Settings Icon)

**What it does:** Opens a modal overlay with project and app settings.

**Sections:**

**Project Settings:**
- Display name (editable)
- Slug (editable)
- Summary (textarea)
- Cover image (file picker from resource roots)
- Publish settings: includeResources toggle, mobileSequenceFirst toggle, theme selector

**App Settings:**
- Canvas grid: snap-to-grid toggle, grid size
- Default zoom level
- (Future: theme selection — dark only for now, shown as disabled)

**Implementation:**
- New component `SettingsOverlay` in `apps/desktop/src/features/settings/SettingsOverlay.tsx`.
- Opens as a centered modal (z-index above canvas, below presenter).
- Project settings save via existing `persistProjectDocument` flow.
- App settings stored in localStorage for now (no backend needed).

---

## 7. IconStrip Wiring

The `IconStrip` currently only handles the "files" icon click. All icons need wiring:

| Icon | ID | Action |
|------|-----|--------|
| Folder | `files` | Toggle left panel (file tree mode) — exists |
| Search | `search` | Open left panel in search mode |
| Graph | `sequences` | Open sequences manager overlay |
| Pen | `annotate` | Open left panel in annotations mode |
| Gear | settings | Open settings overlay |

**State changes:**
- `LeftOverlay` gains a `mode` prop: `"files" | "search" | "annotations"`.
- `Shell.tsx` manages `leftMode` state and `sequencesManagerOpen` / `settingsOpen` booleans.
- `IconStrip` receives callbacks for each icon.

---

## Architecture Summary

```
IconStrip
  ├─ files    → LeftOverlay mode="files" (existing file tree)
  ├─ search   → LeftOverlay mode="search" (new SearchPanel)
  ├─ sequences → SequencesManager overlay (new, full-page)
  ├─ annotate → LeftOverlay mode="annotations" (new AnnotationsPanel)
  └─ settings → SettingsOverlay modal (new)
```

**New files:**
- `apps/desktop/src/features/search/SearchPanel.tsx`
- `apps/desktop/src/features/sequences/SequencesManager.tsx`
- `apps/desktop/src/features/annotations/AnnotationsPanel.tsx`
- `apps/desktop/src/features/settings/SettingsOverlay.tsx`
- `apps/desktop/src-tauri/migrations/0007_saved_sequences.sql`
- `apps/desktop/src-tauri/src/db/repositories/saved_sequences.rs`

**Modified files:**
- `IconStrip.tsx` — wire all buttons
- `Shell.tsx` — manage overlay states, left mode
- `LeftOverlay.tsx` — render based on mode, replace folder input with picker
- `CanvasView.tsx` — move drag handlers onto ReactFlow, fix drop
- `apps/desktop/src-tauri/src/db/repositories/mod.rs` — add saved_sequences module
- `apps/desktop/src-tauri/src/db/migrations.rs` — register migration
- `apps/desktop/src-tauri/src/commands/projects.rs` — add sequence CRUD commands
- `apps/desktop/src-tauri/src/lib.rs` — register commands
- `apps/desktop/src-tauri/src/bin/terminal_bridge.rs` — add bridge endpoints
- `packages/desktop-api/src/index.ts` — add transport methods
- `apps/desktop/src/styles.css` — styles for new panels

**No schema package changes** — saved sequences are a desktop-only persistence concern, not part of the shared domain schema.

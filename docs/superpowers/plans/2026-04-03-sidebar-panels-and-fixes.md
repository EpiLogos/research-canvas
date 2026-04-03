# Sidebar Panels, Folder Picker, and Canvas Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire all placeholder sidebar icons into functional panels, replace resource folder input with a fuzzy directory picker, fix file drag-to-canvas, and build a sequences manager.

**Architecture:** The IconStrip drives a `leftMode` state in Shell.tsx that switches LeftOverlay between files/search/annotations views. The sequences manager and settings panel are independent full-page overlays. A new `list_directories` Rust command powers the folder picker. Saved sequences get their own SQLite table and CRUD commands.

**Tech Stack:** TypeScript, React 18, Zustand, Rust/SQLite (rusqlite), Tauri IPC

---

### Task 1: Fix file drag-to-canvas

**Files:**
- Modify: `packages/canvas/src/CanvasView.tsx:440-460`

- [ ] **Step 1: Move drag handlers from wrapper div onto ReactFlow**

In `packages/canvas/src/CanvasView.tsx`, the `onDragOver` and `onDrop` handlers are on the outer `<div className="canvas-flow">` (lines 441-458). ReactFlow captures pointer events internally, so the drop never reaches the wrapper.

Remove `onDragOver` and `onDrop` from the wrapper div (lines 441-458), leaving just `className="canvas-flow"` on the div. Then add them as props directly on the `<ReactFlow>` component (after line 468 `nodesFocusable`):

```typescript
        onDragOver={(e: React.DragEvent) => {
          if (e.dataTransfer.types.includes("application/x-canvas-entry")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(e: React.DragEvent) => {
          const raw = e.dataTransfer.getData("application/x-canvas-entry");
          if (!raw) return;
          e.preventDefault();
          try {
            const entry = JSON.parse(raw) as { id: string; name: string; relativePath: string; kind: string };
            const canvasPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            onCreateResourceFromFile?.({ id: entry.id, name: entry.name, path: entry.relativePath, kind: entry.kind }, canvasPos);
          } catch {
            // malformed drag data
          }
        }}
```

- [ ] **Step 2: Run TypeScript check**

Run: `pnpm exec tsc -b`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/canvas/src/CanvasView.tsx
git commit -m "fix: move drag-drop handlers onto ReactFlow component so file drops register"
```

---

### Task 2: IconStrip wiring and Shell state management

**Files:**
- Modify: `apps/desktop/src/layout/IconStrip.tsx`
- Modify: `apps/desktop/src/layout/Shell.tsx`
- Modify: `apps/desktop/src/layout/LeftOverlay.tsx`

- [ ] **Step 1: Update IconStrip to accept callbacks for all icons**

In `apps/desktop/src/layout/IconStrip.tsx`, update the `IconStripProps` interface:

```typescript
interface IconStripProps {
  leftOpen: boolean;
  activeLeftMode: string;
  onToggleLeft: () => void;
  onSetLeftMode: (mode: "files" | "search" | "annotations") => void;
  onOpenSequences: () => void;
  onOpenSettings: () => void;
}
```

Update the component to accept and use these props:

```typescript
export function IconStrip({ leftOpen, activeLeftMode, onToggleLeft, onSetLeftMode, onOpenSequences, onOpenSettings }: IconStripProps) {
```

Replace the render section with proper click handlers:

```tsx
  const handleNavClick = (id: string) => {
    if (id === "files" || id === "search" || id === "annotate") {
      const mode = id === "annotate" ? "annotations" : id as "files" | "search";
      if (leftOpen && activeLeftMode === mode) {
        onToggleLeft();
      } else {
        onSetLeftMode(mode);
      }
    } else if (id === "sequences") {
      onOpenSequences();
    }
  };

  return (
    <aside className="icon-strip" aria-label="Navigation" data-testid="left-rail">
      <div className="icon-strip__nav">
        {NAV_ICONS.map((icon) => (
          <button
            key={icon.id}
            className="icon-strip__btn"
            data-active={
              (icon.id === "files" && leftOpen && activeLeftMode === "files") ||
              (icon.id === "search" && leftOpen && activeLeftMode === "search") ||
              (icon.id === "annotate" && leftOpen && activeLeftMode === "annotations")
                ? "true"
                : undefined
            }
            title={icon.label}
            aria-label={icon.label}
            onClick={() => handleNavClick(icon.id)}
            dangerouslySetInnerHTML={{ __html: icon.svg }}
          />
        ))}
      </div>
      <div className="icon-strip__bottom">
        <button
          className="icon-strip__btn"
          title="Settings"
          aria-label="Settings"
          onClick={onOpenSettings}
          dangerouslySetInnerHTML={{
            __html: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4"/></svg>`,
          }}
        />
      </div>
    </aside>
  );
```

- [ ] **Step 2: Add left mode state to Shell.tsx**

In `apps/desktop/src/layout/Shell.tsx`, add state for left panel mode and overlay booleans:

```typescript
  const [leftMode, setLeftMode] = useState<"files" | "search" | "annotations">("files");
  const [sequencesOpen, setSequencesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleSetLeftMode = useCallback((mode: "files" | "search" | "annotations") => {
    setLeftMode(mode);
    layout.setLeftOpen(true);
  }, [layout]);
```

Update the `IconStrip` render to pass the new props:

```tsx
      <IconStrip
        leftOpen={layout.leftOpen}
        activeLeftMode={leftMode}
        onToggleLeft={layout.toggleLeft}
        onSetLeftMode={handleSetLeftMode}
        onOpenSequences={() => setSequencesOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
```

Also update the Cmd+K shortcut to open search mode:

```typescript
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setLeftMode("search");
        layout.setLeftOpen(true);
      }
```

Pass `leftMode` to LeftOverlay:

```tsx
        <LeftOverlay
          open={layout.leftOpen}
          mode={leftMode}
          onResizeStart={layout.beginLeftResize}
        />
```

- [ ] **Step 3: Update LeftOverlay to accept mode prop**

In `apps/desktop/src/layout/LeftOverlay.tsx`, update the interface:

```typescript
interface LeftOverlayProps {
  open: boolean;
  mode: "files" | "search" | "annotations";
  onResizeStart: (e: React.PointerEvent) => void;
}
```

Update the component signature:

```typescript
export function LeftOverlay({ open, mode, onResizeStart }: LeftOverlayProps) {
```

For now, conditionally render based on mode — wrap the existing content in a `{mode === "files" && (...)}` block, and add placeholders for search and annotations:

```tsx
        {mode === "files" && (
          <>
            {/* ... existing project selector, resource folders, file tree sections ... */}
          </>
        )}
        {mode === "search" && (
          <div className="lo-section lo-section--grow">
            <div className="lo-section__header">
              <span className="lo-label">Search</span>
            </div>
            <div className="lo-empty">Search panel — coming in Task 4</div>
          </div>
        )}
        {mode === "annotations" && (
          <div className="lo-section lo-section--grow">
            <div className="lo-section__header">
              <span className="lo-label">Annotations</span>
            </div>
            <div className="lo-empty">Annotations panel — coming in Task 8</div>
          </div>
        )}
```

- [ ] **Step 4: Run TypeScript check**

Run: `pnpm exec tsc -b`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/layout/IconStrip.tsx apps/desktop/src/layout/Shell.tsx apps/desktop/src/layout/LeftOverlay.tsx
git commit -m "feat: wire IconStrip to Shell state, left panel mode switching"
```

---

### Task 3: Fuzzy folder picker — Rust command and bridge endpoint

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/projects.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs:62`
- Modify: `apps/desktop/src-tauri/src/bin/terminal_bridge.rs`
- Modify: `packages/desktop-api/src/index.ts`

- [ ] **Step 1: Add `list_directories_command` to Rust**

In `apps/desktop/src-tauri/src/commands/projects.rs`, add at the end of the file:

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryEntry {
    pub path: String,
    pub name: String,
    pub depth: u32,
}

#[tauri::command]
pub fn list_directories_command() -> Result<Vec<DirectoryEntry>, String> {
    list_directories_at()
}

pub fn list_directories_at() -> Result<Vec<DirectoryEntry>, String> {
    let home = dirs::home_dir().ok_or_else(|| "cannot resolve home directory".to_string())?;
    let mut entries = Vec::new();
    let skip_names: std::collections::HashSet<&str> = [
        "node_modules", ".git", "__pycache__", "target", ".Trash",
        ".cache", ".npm", ".cargo", "Library", ".local",
    ].into_iter().collect();

    walk_directories(&home, 0, 4, &skip_names, &mut entries);
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(entries)
}

fn walk_directories(
    dir: &std::path::Path,
    depth: u32,
    max_depth: u32,
    skip: &std::collections::HashSet<&str>,
    out: &mut Vec<DirectoryEntry>,
) {
    if depth > max_depth {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if !file_type.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || skip.contains(name.as_str()) {
            continue;
        }
        let path = entry.path();
        out.push(DirectoryEntry {
            path: path.to_string_lossy().to_string(),
            name,
            depth,
        });
        walk_directories(&path, depth + 1, max_depth, skip, out);
    }
}
```

Note: Add `dirs` crate to Cargo.toml if not present. Check first:

```bash
grep 'dirs' apps/desktop/src-tauri/Cargo.toml
```

If not found, add to `[dependencies]`: `dirs = "5"`.

- [ ] **Step 2: Register the command in lib.rs**

In `apps/desktop/src-tauri/src/lib.rs`, add after line 62 (`read_workspace_text_file_command`):

```rust
            commands::projects::list_directories_command,
```

- [ ] **Step 3: Add bridge endpoint**

In `apps/desktop/src-tauri/src/bin/terminal_bridge.rs`, add the import `list_directories_at` to the projects import block (line 6-9). Then add a new route handler before the project-scoped routes (before the project ID extraction):

```rust
        // Non-project-scoped routes
        if method == Method::Get && path_segments.get(1) == Some(&"directories") {
            let dirs = list_directories_at()?;
            return respond_json(request, StatusCode(200), dirs);
        }
```

Also add to the import: `list_directories_at`.

- [ ] **Step 4: Add transport method in desktop-api**

In `packages/desktop-api/src/index.ts`, add a new interface after `ResourceRootMutationRequest`:

```typescript
export interface DirectoryEntry {
  path: string;
  name: string;
  depth: number;
}
```

Add to `WorkspaceTransport` interface (before closing brace):

```typescript
  listDirectories(): Promise<DirectoryEntry[]>;
```

Add to `createTauriWorkspaceTransport`:

```typescript
    async listDirectories() {
      return invokeTauri<DirectoryEntry[]>("list_directories_command");
    },
```

Add to `createBrowserBridgeTransport`:

```typescript
    async listDirectories() {
      return requestJsonWithRetry<DirectoryEntry[]>("/workspace/directories");
    },
```

- [ ] **Step 5: Run Rust tests and TypeScript check**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1` and `pnpm exec tsc -b`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: list_directories command for fuzzy folder picker"
```

---

### Task 4: Fuzzy folder picker — Frontend wiring

**Files:**
- Modify: `apps/desktop/src/layout/LeftOverlay.tsx`
- Modify: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`

- [ ] **Step 1: Add `listDirectories` to workspace context**

In `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`, add to the `CanvasWorkspaceContextValue` interface:

```typescript
  listDirectories: () => Promise<DirectoryEntry[]>;
```

Add the import at the top (with other desktop-api imports):

```typescript
  type DirectoryEntry,
```

Add the implementation in the context value memo:

```typescript
      async listDirectories() {
        return transport.listDirectories();
      },
```

- [ ] **Step 2: Replace folder input with fuzzy picker in LeftOverlay**

In `apps/desktop/src/layout/LeftOverlay.tsx`, replace the inline folder input section with a fuzzy picker approach. Import `FuzzyFilePicker` and add state:

```typescript
import { FuzzyFilePicker } from "@research-canvas/canvas";
```

Add state for the folder picker:

```typescript
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [folderEntries, setFolderEntries] = useState<{ name: string; path: string; kind: string }[]>([]);
  const [folderPickerAnchor, setFolderPickerAnchor] = useState<{ x: number; y: number } | null>(null);
```

Replace the `handleAddFolder` function:

```typescript
  const handleAddFolder = useCallback(async (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setFolderPickerAnchor({ x: rect.right + 4, y: rect.top });
    try {
      const dirs = await workspace.listDirectories();
      setFolderEntries(dirs.map((d) => ({ name: d.name, path: d.path, kind: "directory" })));
      setShowFolderPicker(true);
    } catch {
      setFolderError("Failed to scan directories");
    }
  }, [workspace]);
```

Replace the "+" button onClick:

```typescript
  onClick={(e) => { void handleAddFolder(e); }}
```

Replace the `showFolderInput` section with the picker:

```tsx
  {showFolderPicker && folderPickerAnchor && (
    <FuzzyFilePicker
      anchorX={folderPickerAnchor.x}
      anchorY={folderPickerAnchor.y}
      entries={folderEntries}
      onClose={() => setShowFolderPicker(false)}
      onSelect={async (entry) => {
        setShowFolderPicker(false);
        try {
          await workspace.attachResourceRoot(entry.path);
        } catch (err) {
          setFolderError(err instanceof Error ? err.message : String(err));
        }
      }}
    />
  )}
```

- [ ] **Step 3: Run TypeScript check and tests**

Run: `pnpm exec tsc -b && pnpm vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: fuzzy folder picker for resource root attachment"
```

---

### Task 5: Search panel

**Files:**
- Create: `apps/desktop/src/features/search/SearchPanel.tsx`
- Modify: `apps/desktop/src/layout/LeftOverlay.tsx`
- Modify: `apps/desktop/src/styles.css`

- [ ] **Step 1: Create SearchPanel component**

Create `apps/desktop/src/features/search/SearchPanel.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import type { SearchHit } from "@research-canvas/desktop-api";

export function SearchPanel() {
  const workspace = useCanvasWorkspace();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const hits = await workspace.searchProject(q.trim(), 20);
      setResults(hits);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [workspace]);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(value);
    }, 200);
  }, [runSearch]);

  const handleClickResult = useCallback((hit: SearchHit) => {
    if (hit.entityType === "node" || hit.entityType === "note" || hit.entityType === "resource") {
      workspace.selectNode(hit.entityId);
      workspace.flyToNode(hit.entityId);
    } else if (hit.entityType === "file") {
      workspace.selectEntry(hit.entityId);
    }
  }, [workspace]);

  return (
    <div className="search-panel">
      <div className="search-panel__input-row">
        <input
          ref={inputRef}
          className="search-panel__input"
          type="text"
          placeholder="Search nodes, files..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
        />
        {searching && <span className="search-panel__spinner" />}
      </div>
      <div className="search-panel__results">
        {results.length === 0 && query.trim() && !searching && (
          <div className="lo-empty">No results</div>
        )}
        {results.map((hit) => (
          <button
            key={hit.documentKey}
            className="search-panel__hit"
            onClick={() => handleClickResult(hit)}
            title={hit.sourcePath ?? hit.title}
          >
            <span className="search-panel__hit-type">{hit.entityType}</span>
            <span className="search-panel__hit-title">{hit.title}</span>
            {hit.snippet && <span className="search-panel__hit-snippet">{hit.snippet}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire SearchPanel into LeftOverlay**

In `apps/desktop/src/layout/LeftOverlay.tsx`, import and render:

```typescript
import { SearchPanel } from "../features/search/SearchPanel";
```

Replace the search placeholder:

```tsx
        {mode === "search" && <SearchPanel />}
```

- [ ] **Step 3: Add search panel styles**

In `apps/desktop/src/styles.css`, add after the folder input styles:

```css
/* ─── Search panel ──────────────────────────────────── */
.search-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.search-panel__input-row {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  gap: 6px;
}
.search-panel__input {
  flex: 1;
  padding: 5px 8px;
  font-size: 11px;
  background: #0a0a1a;
  border: 1px solid #252545;
  border-radius: 4px;
  color: #c0c0e0;
  outline: none;
}
.search-panel__input:focus { border-color: #7c6fff; }
.search-panel__spinner {
  width: 12px;
  height: 12px;
  border: 2px solid #252545;
  border-top-color: #7c6fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.search-panel__results {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.search-panel__hit {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 6px 10px;
  background: none;
  border: none;
  border-bottom: 1px solid #151530;
  color: #c0c0e0;
  text-align: left;
  cursor: pointer;
  font-size: 11px;
}
.search-panel__hit:hover { background: #151530; }
.search-panel__hit-type {
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #7c6fff;
}
.search-panel__hit-title { font-weight: 500; }
.search-panel__hit-snippet {
  font-size: 10px;
  color: #4a4a80;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

- [ ] **Step 4: Run TypeScript check and tests**

Run: `pnpm exec tsc -b && pnpm vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: search panel with debounced project search and fly-to-result"
```

---

### Task 6: Saved sequences — SQLite migration and Rust repository

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0007_saved_sequences.sql`
- Create: `apps/desktop/src-tauri/src/db/repositories/saved_sequences.rs`
- Modify: `apps/desktop/src-tauri/src/db/repositories/mod.rs`
- Modify: `apps/desktop/src-tauri/src/db/migrations.rs:36`
- Modify: `apps/desktop/src-tauri/tests/db_migrations.rs`

- [ ] **Step 1: Create migration SQL**

Create `apps/desktop/src-tauri/migrations/0007_saved_sequences.sql`:

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

- [ ] **Step 2: Register migration**

In `apps/desktop/src-tauri/src/db/migrations.rs`, add after the 0006 migration entry:

```rust
    Migration {
        version: "0007_saved_sequences",
        sql: include_str!("../../migrations/0007_saved_sequences.sql"),
    },
```

- [ ] **Step 3: Create SavedSequenceRepository**

Create `apps/desktop/src-tauri/src/db/repositories/saved_sequences.rs`:

```rust
use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Result};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq)]
pub struct SavedSequenceRecord {
    pub id: String,
    pub project_id: String,
    pub canvas_id: String,
    pub name: String,
    pub root_node_id: Option<String>,
    pub edge_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub struct SavedSequenceRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> SavedSequenceRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn create(
        &self,
        project_id: &str,
        canvas_id: &str,
        name: &str,
    ) -> Result<SavedSequenceRecord> {
        let id = Uuid::new_v4().to_string();
        let now = current_timestamp();
        self.connection.execute(
            "INSERT INTO saved_sequences (id, project_id, canvas_id, name, edge_ids_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, '[]', ?5, ?5)",
            params![id, project_id, canvas_id, name, now],
        )?;
        self.get_by_id(&id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn list_for_canvas(&self, canvas_id: &str) -> Result<Vec<SavedSequenceRecord>> {
        let mut stmt = self.connection.prepare(
            "SELECT id, project_id, canvas_id, name, root_node_id, edge_ids_json, created_at, updated_at
             FROM saved_sequences
             WHERE canvas_id = ?1
             ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map([canvas_id], record_from_row)?;
        rows.collect()
    }

    pub fn get_by_id(&self, id: &str) -> Result<Option<SavedSequenceRecord>> {
        self.connection
            .query_row(
                "SELECT id, project_id, canvas_id, name, root_node_id, edge_ids_json, created_at, updated_at
                 FROM saved_sequences
                 WHERE id = ?1",
                [id],
                record_from_row,
            )
            .optional()
    }

    pub fn update(
        &self,
        id: &str,
        name: &str,
        root_node_id: Option<&str>,
        edge_ids: &[String],
    ) -> Result<SavedSequenceRecord> {
        let now = current_timestamp();
        let edge_ids_json = serde_json::to_string(edge_ids).unwrap_or_else(|_| "[]".to_string());
        self.connection.execute(
            "UPDATE saved_sequences
             SET name = ?1, root_node_id = ?2, edge_ids_json = ?3, updated_at = ?4
             WHERE id = ?5",
            params![name, root_node_id, edge_ids_json, now, id],
        )?;
        self.get_by_id(id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn delete(&self, id: &str) -> Result<()> {
        self.connection
            .execute("DELETE FROM saved_sequences WHERE id = ?1", [id])?;
        Ok(())
    }
}

fn record_from_row(row: &rusqlite::Row<'_>) -> Result<SavedSequenceRecord> {
    let edge_ids_json: String = row.get(5)?;
    let edge_ids = match serde_json::from_str::<Value>(&edge_ids_json) {
        Ok(Value::Array(items)) => items
            .into_iter()
            .filter_map(|v| v.as_str().map(ToOwned::to_owned))
            .collect(),
        _ => Vec::new(),
    };

    Ok(SavedSequenceRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        canvas_id: row.get(2)?,
        name: row.get(3)?,
        root_node_id: row.get(4)?,
        edge_ids,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}
```

- [ ] **Step 4: Register module in mod.rs**

In `apps/desktop/src-tauri/src/db/repositories/mod.rs`, add:

```rust
pub mod saved_sequences;
```

And add to the pub use block:

```rust
pub use saved_sequences::{SavedSequenceRecord, SavedSequenceRepository};
```

- [ ] **Step 5: Update migration test**

In `apps/desktop/src-tauri/tests/db_migrations.rs`, update the migration count assertion from `6` to `7` in both tests. Add a table existence check:

```rust
    assert!(table_exists(connection, "saved_sequences"));
```

- [ ] **Step 6: Run Rust tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: saved_sequences SQLite table, migration, and Rust repository"
```

---

### Task 7: Saved sequences — Tauri commands, bridge, and desktop-api

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/projects.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/bin/terminal_bridge.rs`
- Modify: `packages/desktop-api/src/index.ts`

- [ ] **Step 1: Add Tauri commands for saved sequence CRUD**

In `apps/desktop/src-tauri/src/commands/projects.rs`, add payload types and commands:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSequencePayload {
    pub id: String,
    pub project_id: String,
    pub canvas_id: String,
    pub name: String,
    pub root_node_id: Option<String>,
    pub edge_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSavedSequenceRequest {
    pub database_path: String,
    pub project_id: String,
    pub canvas_id: String,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSavedSequenceRequest {
    pub database_path: String,
    pub id: String,
    pub name: String,
    pub root_node_id: Option<String>,
    pub edge_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSavedSequenceRequest {
    pub database_path: String,
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSavedSequencesRequest {
    pub database_path: String,
    pub canvas_id: String,
}

#[tauri::command]
pub fn list_saved_sequences_command(request: ListSavedSequencesRequest) -> Result<Vec<SavedSequencePayload>, String> {
    let db = Database::open(PathBuf::from(&request.database_path)).map_err(|e| e.to_string())?;
    let repo = SavedSequenceRepository::new(db.connection());
    repo.list_for_canvas(&request.canvas_id)
        .map(|recs| recs.into_iter().map(saved_sequence_payload).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_saved_sequence_command(request: CreateSavedSequenceRequest) -> Result<SavedSequencePayload, String> {
    let db = Database::open(PathBuf::from(&request.database_path)).map_err(|e| e.to_string())?;
    let repo = SavedSequenceRepository::new(db.connection());
    repo.create(&request.project_id, &request.canvas_id, &request.name)
        .map(saved_sequence_payload)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_saved_sequence_command(request: UpdateSavedSequenceRequest) -> Result<SavedSequencePayload, String> {
    let db = Database::open(PathBuf::from(&request.database_path)).map_err(|e| e.to_string())?;
    let repo = SavedSequenceRepository::new(db.connection());
    repo.update(&request.id, &request.name, request.root_node_id.as_deref(), &request.edge_ids)
        .map(saved_sequence_payload)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_saved_sequence_command(request: DeleteSavedSequenceRequest) -> Result<(), String> {
    let db = Database::open(PathBuf::from(&request.database_path)).map_err(|e| e.to_string())?;
    let repo = SavedSequenceRepository::new(db.connection());
    repo.delete(&request.id).map_err(|e| e.to_string())
}

fn saved_sequence_payload(record: SavedSequenceRecord) -> SavedSequencePayload {
    SavedSequencePayload {
        id: record.id,
        project_id: record.project_id,
        canvas_id: record.canvas_id,
        name: record.name,
        root_node_id: record.root_node_id,
        edge_ids: record.edge_ids,
        created_at: record.created_at,
        updated_at: record.updated_at,
    }
}
```

Add the necessary imports at the top of the file: `use crate::db::repositories::{SavedSequenceRecord, SavedSequenceRepository};`.

- [ ] **Step 2: Register commands in lib.rs**

Add after `list_directories_command`:

```rust
            commands::projects::list_saved_sequences_command,
            commands::projects::create_saved_sequence_command,
            commands::projects::update_saved_sequence_command,
            commands::projects::delete_saved_sequence_command,
```

- [ ] **Step 3: Add bridge endpoints**

In the terminal bridge, add route handlers for saved sequences (after the directories route). These are project-scoped, so they go inside the project ID block:

```rust
        if method == Method::Get && action == "sequences" {
            let database_path = session_database_path(&request).to_string_lossy().to_string();
            let payload = list_saved_sequences_command(ListSavedSequencesRequest {
                database_path,
                canvas_id: query_param(&request, "canvasId").unwrap_or_default(),
            }).map_err(|e| e.to_string())?;
            return respond_json(request, StatusCode(200), payload);
        }

        if method == Method::Post && action == "sequences" {
            let database_path = session_database_path(&request).to_string_lossy().to_string();
            let body = read_body(&mut request)?;
            let input: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
            let payload = create_saved_sequence_command(CreateSavedSequenceRequest {
                database_path,
                project_id: project_id.clone(),
                canvas_id: input["canvasId"].as_str().unwrap_or_default().to_string(),
                name: input["name"].as_str().unwrap_or("Untitled").to_string(),
            }).map_err(|e| e.to_string())?;
            return respond_json(request, StatusCode(201), payload);
        }
```

Add the necessary imports for the new request types.

- [ ] **Step 4: Add transport methods in desktop-api**

In `packages/desktop-api/src/index.ts`, add the SavedSequence type and transport methods:

```typescript
export interface SavedSequence {
  id: string;
  projectId: string;
  canvasId: string;
  name: string;
  rootNodeId: string | null;
  edgeIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

Add to `WorkspaceTransport`:

```typescript
  listSavedSequences(input: { databasePath: string; canvasId: string }): Promise<SavedSequence[]>;
  createSavedSequence(input: { databasePath: string; projectId: string; canvasId: string; name: string }): Promise<SavedSequence>;
  updateSavedSequence(input: { databasePath: string; id: string; name: string; rootNodeId: string | null; edgeIds: string[] }): Promise<SavedSequence>;
  deleteSavedSequence(input: { databasePath: string; id: string }): Promise<void>;
```

Add Tauri implementations:

```typescript
    async listSavedSequences(request) {
      return invokeTauri<SavedSequence[]>("list_saved_sequences_command", { request });
    },
    async createSavedSequence(request) {
      return invokeTauri<SavedSequence>("create_saved_sequence_command", { request });
    },
    async updateSavedSequence(request) {
      return invokeTauri<SavedSequence>("update_saved_sequence_command", { request });
    },
    async deleteSavedSequence(request) {
      await invokeTauri<void>("delete_saved_sequence_command", { request });
    },
```

Add browser bridge implementations using the `/workspace/project/{projectId}/sequences` endpoint pattern.

- [ ] **Step 5: Run all tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1 && pnpm exec tsc -b`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: saved sequence CRUD — Tauri commands, bridge endpoints, desktop-api transport"
```

---

### Task 8: Sequences Manager overlay

**Files:**
- Create: `apps/desktop/src/features/sequences/SequencesManager.tsx`
- Modify: `apps/desktop/src/layout/Shell.tsx`
- Modify: `apps/desktop/src/styles.css`

- [ ] **Step 1: Create SequencesManager component**

Create `apps/desktop/src/features/sequences/SequencesManager.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import type { SavedSequence } from "@research-canvas/desktop-api";

interface SequencesManagerProps {
  onClose: () => void;
  onPlaySequence: () => void;
}

export function SequencesManager({ onClose, onPlaySequence }: SequencesManagerProps) {
  const workspace = useCanvasWorkspace();
  const [sequences, setSequences] = useState<SavedSequence[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = sequences.find((s) => s.id === selectedId) ?? null;

  const refresh = useCallback(async () => {
    if (!workspace.databasePath || !workspace.canvasId) return;
    try {
      const list = await workspace.listSavedSequences({
        databasePath: workspace.databasePath,
        canvasId: workspace.canvasId,
      });
      setSequences(list);
    } catch { /* ignore */ }
  }, [workspace]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleCreate = useCallback(async () => {
    if (!workspace.databasePath || !workspace.activeProject) return;
    try {
      const seq = await workspace.createSavedSequence({
        databasePath: workspace.databasePath,
        projectId: workspace.activeProject.id,
        canvasId: workspace.canvasId,
        name: `Sequence ${sequences.length + 1}`,
      });
      setSequences((prev) => [...prev, seq]);
      setSelectedId(seq.id);
    } catch { /* ignore */ }
  }, [workspace, sequences.length]);

  const handleUpdate = useCallback(async (updates: Partial<Pick<SavedSequence, "name" | "rootNodeId" | "edgeIds">>) => {
    if (!workspace.databasePath || !selected) return;
    try {
      const updated = await workspace.updateSavedSequence({
        databasePath: workspace.databasePath,
        id: selected.id,
        name: updates.name ?? selected.name,
        rootNodeId: updates.rootNodeId !== undefined ? updates.rootNodeId : selected.rootNodeId,
        edgeIds: updates.edgeIds ?? selected.edgeIds,
      });
      setSequences((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch { /* ignore */ }
  }, [workspace, selected]);

  const handleDelete = useCallback(async () => {
    if (!workspace.databasePath || !selected) return;
    try {
      await workspace.deleteSavedSequence({ databasePath: workspace.databasePath, id: selected.id });
      setSequences((prev) => prev.filter((s) => s.id !== selected.id));
      setSelectedId(null);
    } catch { /* ignore */ }
  }, [workspace, selected]);

  const handlePlay = useCallback(() => {
    if (!selected) return;
    // Activate this sequence's edges on the canvas store
    const store = workspace.store.getState();
    for (const edge of store.edges) {
      const shouldBeSequencing = selected.edgeIds.includes(edge.id);
      if (edge.sequencing !== shouldBeSequencing) {
        workspace.store.getState().toggleEdgeSequencing(edge.id);
      }
    }
    onClose();
    onPlaySequence();
  }, [selected, workspace, onClose, onPlaySequence]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="sequences-manager">
      <aside className="sm-sidebar">
        <div className="sm-sidebar__header">
          <h2>Sequences</h2>
          <button className="sm-sidebar__add" onClick={() => { void handleCreate(); }}>+ New</button>
        </div>
        <div className="sm-sidebar__list">
          {sequences.map((seq) => (
            <button
              key={seq.id}
              className="sm-sidebar__item"
              data-active={seq.id === selectedId ? "true" : "false"}
              onClick={() => setSelectedId(seq.id)}
            >
              <span className="sm-sidebar__item-name">{seq.name}</span>
              <span className="sm-sidebar__item-count">{seq.edgeIds.length} edges</span>
            </button>
          ))}
          {sequences.length === 0 && (
            <div className="sm-sidebar__empty">No sequences saved. Create one to define a guided path.</div>
          )}
        </div>
      </aside>

      <main className="sm-main">
        {selected ? (
          <SequenceEditor
            sequence={selected}
            nodes={workspace.nodes}
            edges={workspace.edges}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onPlay={handlePlay}
          />
        ) : (
          <div className="sm-main__empty">Select a sequence or create a new one</div>
        )}
      </main>

      <button className="sm-close" onClick={onClose} title="Close (Esc)">&times;</button>
    </div>
  );
}

function SequenceEditor({
  sequence,
  nodes,
  edges,
  onUpdate,
  onDelete,
  onPlay,
}: {
  sequence: SavedSequence;
  nodes: { id: string; title: string }[];
  edges: { id: string; sourceNodeId: string; targetNodeId: string; label: string }[];
  onUpdate: (updates: Partial<Pick<SavedSequence, "name" | "rootNodeId" | "edgeIds">>) => Promise<void>;
  onDelete: () => Promise<void>;
  onPlay: () => void;
}) {
  const edgeSet = new Set(sequence.edgeIds);

  const toggleEdge = (edgeId: string) => {
    const next = edgeSet.has(edgeId)
      ? sequence.edgeIds.filter((id) => id !== edgeId)
      : [...sequence.edgeIds, edgeId];
    void onUpdate({ edgeIds: next });
  };

  const nodeName = (id: string) => nodes.find((n) => n.id === id)?.title ?? id.slice(0, 8);

  return (
    <div className="sm-editor">
      <div className="sm-editor__header">
        <input
          className="sm-editor__name"
          value={sequence.name}
          onChange={(e) => { void onUpdate({ name: e.target.value }); }}
        />
        <div className="sm-editor__actions">
          <button className="sm-editor__play" onClick={onPlay} disabled={sequence.edgeIds.length === 0}>
            Play
          </button>
          <button className="sm-editor__delete" onClick={() => { void onDelete(); }}>Delete</button>
        </div>
      </div>

      <div className="sm-editor__section">
        <label className="sm-editor__label">Root node</label>
        <select
          className="sm-editor__select"
          value={sequence.rootNodeId ?? ""}
          onChange={(e) => { void onUpdate({ rootNodeId: e.target.value || null }); }}
        >
          <option value="">Auto-detect</option>
          {nodes.map((node) => (
            <option key={node.id} value={node.id}>{node.title}</option>
          ))}
        </select>
      </div>

      <div className="sm-editor__section">
        <label className="sm-editor__label">Edges ({sequence.edgeIds.length} of {edges.length})</label>
        <div className="sm-editor__edge-list">
          {edges.map((edge) => (
            <label key={edge.id} className="sm-editor__edge-row">
              <input
                type="checkbox"
                checked={edgeSet.has(edge.id)}
                onChange={() => toggleEdge(edge.id)}
              />
              <span>{nodeName(edge.sourceNodeId)} → {nodeName(edge.targetNodeId)}</span>
              <span className="sm-editor__edge-label">{edge.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into Shell.tsx**

Import the component and render it when `sequencesOpen` is true:

```typescript
import { SequencesManager } from "../features/sequences/SequencesManager";
```

Add to the render, after the FullScreenReader block:

```tsx
        {sequencesOpen && (
          <SequencesManager
            onClose={() => setSequencesOpen(false)}
            onPlaySequence={() => {
              setSequencesOpen(false);
              setFullScreenMode("sequence");
            }}
          />
        )}
```

Also wire `listSavedSequences`, `createSavedSequence`, `updateSavedSequence`, `deleteSavedSequence` from the transport through `CanvasWorkspaceContext` — add them to the context value interface and implementation (same pattern as `searchProject`).

- [ ] **Step 3: Add sequences manager styles**

In `apps/desktop/src/styles.css`:

```css
/* ─── Sequences Manager ──────────────────────────────── */
.sequences-manager {
  position: fixed;
  inset: 0;
  z-index: 8000;
  background: #0a0a18;
  display: flex;
  color: #c0c0e0;
}
.sm-close {
  position: absolute;
  top: 12px;
  right: 16px;
  background: none;
  border: none;
  color: #888;
  font-size: 20px;
  cursor: pointer;
}
.sm-close:hover { color: #c0c0e0; }
.sm-sidebar {
  width: 240px;
  border-right: 1px solid #151530;
  display: flex;
  flex-direction: column;
}
.sm-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #151530;
}
.sm-sidebar__header h2 { font-size: 13px; margin: 0; font-weight: 600; }
.sm-sidebar__add {
  background: #7c6fff22;
  border: 1px solid #7c6fff44;
  border-radius: 4px;
  color: #7c6fff;
  padding: 3px 8px;
  font-size: 10px;
  cursor: pointer;
}
.sm-sidebar__list {
  flex: 1;
  overflow-y: auto;
}
.sm-sidebar__item {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 8px 14px;
  background: none;
  border: none;
  border-bottom: 1px solid #151530;
  color: #c0c0e0;
  text-align: left;
  cursor: pointer;
  gap: 2px;
}
.sm-sidebar__item:hover { background: #151530; }
.sm-sidebar__item[data-active="true"] { background: #1a1a3a; border-left: 2px solid #7c6fff; }
.sm-sidebar__item-name { font-size: 12px; font-weight: 500; }
.sm-sidebar__item-count { font-size: 9px; color: #4a4a80; }
.sm-sidebar__empty { padding: 20px 14px; font-size: 11px; color: #2e2e50; }
.sm-main {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}
.sm-main__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #2e2e50;
  font-size: 13px;
}
.sm-editor { display: flex; flex-direction: column; gap: 16px; }
.sm-editor__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.sm-editor__name {
  flex: 1;
  font-size: 18px;
  font-weight: 600;
  background: none;
  border: none;
  border-bottom: 1px solid #252545;
  color: #c0c0e0;
  padding: 4px 0;
  outline: none;
}
.sm-editor__name:focus { border-color: #7c6fff; }
.sm-editor__actions { display: flex; gap: 8px; }
.sm-editor__play {
  padding: 6px 16px;
  background: #f0b45a22;
  border: 1px solid #f0b45a44;
  border-radius: 4px;
  color: #f0b45a;
  font-size: 12px;
  cursor: pointer;
}
.sm-editor__play:disabled { opacity: 0.3; cursor: default; }
.sm-editor__delete {
  padding: 6px 12px;
  background: #e74c3c11;
  border: 1px solid #e74c3c33;
  border-radius: 4px;
  color: #e74c3c;
  font-size: 12px;
  cursor: pointer;
}
.sm-editor__section { display: flex; flex-direction: column; gap: 6px; }
.sm-editor__label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #4a4a80; }
.sm-editor__select {
  padding: 5px 8px;
  background: #0a0a1a;
  border: 1px solid #252545;
  border-radius: 4px;
  color: #c0c0e0;
  font-size: 12px;
}
.sm-editor__edge-list { display: flex; flex-direction: column; gap: 2px; max-height: 400px; overflow-y: auto; }
.sm-editor__edge-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  font-size: 11px;
  border-radius: 3px;
  cursor: pointer;
}
.sm-editor__edge-row:hover { background: #151530; }
.sm-editor__edge-label { color: #4a4a80; font-size: 10px; margin-left: auto; }
```

- [ ] **Step 4: Run TypeScript check and tests**

Run: `pnpm exec tsc -b && pnpm vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: sequences manager overlay with CRUD, edge selection, and playback activation"
```

---

### Task 9: Annotations panel

**Files:**
- Create: `apps/desktop/src/features/annotations/AnnotationsPanel.tsx`
- Modify: `apps/desktop/src/layout/LeftOverlay.tsx`
- Modify: `apps/desktop/src/features/canvas/CanvasScreen.tsx`
- Modify: `apps/desktop/src/layout/Shell.tsx`
- Modify: `apps/desktop/src/styles.css`

- [ ] **Step 1: Create AnnotationsPanel component**

Create `apps/desktop/src/features/annotations/AnnotationsPanel.tsx`:

```tsx
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";

const STROKE_COLOURS = ["#f97316", "#ef4444", "#3b82f6", "#22c55e", "#a855f7", "#ffffff"];

interface AnnotationsPanelProps {
  drawingMode: boolean;
  onToggleDrawing: () => void;
  strokeColour: string;
  onSetStrokeColour: (colour: string) => void;
}

export function AnnotationsPanel({
  drawingMode,
  onToggleDrawing,
  strokeColour,
  onSetStrokeColour,
}: AnnotationsPanelProps) {
  const workspace = useCanvasWorkspace();
  const annotations = workspace.annotations;

  const handleDelete = (id: string) => {
    const state = workspace.annotationStore.getState();
    const next = state.annotations.filter((a) => a.id !== id);
    state.hydrate(next);
  };

  return (
    <div className="annotations-panel">
      <div className="annotations-panel__tools">
        <div className="annotations-panel__section-title">Drawing</div>
        <button
          className="annotations-panel__draw-btn"
          data-active={drawingMode ? "true" : "false"}
          onClick={onToggleDrawing}
        >
          {drawingMode ? "Stop drawing" : "Start drawing"}
        </button>
        <div className="annotations-panel__colours">
          {STROKE_COLOURS.map((c) => (
            <button
              key={c}
              className="colour-swatch"
              data-active={strokeColour === c ? "true" : "false"}
              style={{ background: c }}
              onClick={() => onSetStrokeColour(c)}
              title={c}
            />
          ))}
        </div>
      </div>

      <div className="annotations-panel__list">
        <div className="annotations-panel__section-title">
          Annotations ({annotations.length})
        </div>
        {annotations.length === 0 && (
          <div className="lo-empty">No annotations yet. Use the draw tool to create strokes.</div>
        )}
        {annotations.map((ann) => (
          <div key={ann.id} className="annotations-panel__item">
            <span className="annotations-panel__item-type">{ann.annotationType}</span>
            <span className="annotations-panel__item-points">{ann.points.length} pts</span>
            <button
              className="annotations-panel__item-delete"
              onClick={() => handleDelete(ann.id)}
              title="Delete"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire AnnotationsPanel into LeftOverlay**

In `apps/desktop/src/layout/LeftOverlay.tsx`, import and render:

```typescript
import { AnnotationsPanel } from "../features/annotations/AnnotationsPanel";
```

Add props to `LeftOverlayProps`:

```typescript
  drawingMode?: boolean;
  onToggleDrawing?: () => void;
  strokeColour?: string;
  onSetStrokeColour?: (colour: string) => void;
```

Replace the annotations placeholder:

```tsx
        {mode === "annotations" && (
          <AnnotationsPanel
            drawingMode={drawingMode ?? false}
            onToggleDrawing={onToggleDrawing ?? (() => {})}
            strokeColour={strokeColour ?? "#f97316"}
            onSetStrokeColour={onSetStrokeColour ?? (() => {})}
          />
        )}
```

- [ ] **Step 3: Lift annotation drawing state to Shell**

In `apps/desktop/src/layout/Shell.tsx`, add drawing state:

```typescript
  const [drawingMode, setDrawingMode] = useState(false);
  const [strokeColour, setStrokeColour] = useState("#f97316");
```

Pass to LeftOverlay:

```tsx
        <LeftOverlay
          open={layout.leftOpen}
          mode={leftMode}
          onResizeStart={layout.beginLeftResize}
          drawingMode={drawingMode}
          onToggleDrawing={() => setDrawingMode((v) => !v)}
          strokeColour={strokeColour}
          onSetStrokeColour={setStrokeColour}
        />
```

Pass `drawingMode` down through CanvasPane to CanvasScreen (add prop to CanvasPane interface, forward it).

- [ ] **Step 4: Add annotations panel styles**

In `apps/desktop/src/styles.css`:

```css
/* ─── Annotations panel ──────────────────────────────── */
.annotations-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.annotations-panel__tools {
  padding: 8px 10px;
  border-bottom: 1px solid #151530;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.annotations-panel__section-title {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #4a4a80;
  padding: 4px 10px 0;
}
.annotations-panel__draw-btn {
  padding: 5px 10px;
  font-size: 11px;
  background: #151530;
  border: 1px solid #252545;
  border-radius: 4px;
  color: #c0c0e0;
  cursor: pointer;
}
.annotations-panel__draw-btn[data-active="true"] {
  background: #f9731622;
  border-color: #f9731644;
  color: #f97316;
}
.annotations-panel__colours {
  display: flex;
  gap: 4px;
}
.annotations-panel__list {
  flex: 1;
  overflow-y: auto;
}
.annotations-panel__item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 11px;
  border-bottom: 1px solid #151530;
}
.annotations-panel__item-type {
  font-size: 9px;
  text-transform: uppercase;
  color: #f97316;
}
.annotations-panel__item-points { color: #4a4a80; font-size: 10px; }
.annotations-panel__item-delete {
  margin-left: auto;
  background: none;
  border: none;
  color: #e74c3c;
  font-size: 14px;
  cursor: pointer;
  opacity: 0.5;
}
.annotations-panel__item-delete:hover { opacity: 1; }
```

- [ ] **Step 5: Run TypeScript check and tests**

Run: `pnpm exec tsc -b && pnpm vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: annotations panel with drawing toggle, colour picker, and annotation list"
```

---

### Task 10: Settings overlay

**Files:**
- Create: `apps/desktop/src/features/settings/SettingsOverlay.tsx`
- Modify: `apps/desktop/src/layout/Shell.tsx`
- Modify: `apps/desktop/src/styles.css`

- [ ] **Step 1: Create SettingsOverlay component**

Create `apps/desktop/src/features/settings/SettingsOverlay.tsx`:

```tsx
import { useEffect } from "react";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";

interface SettingsOverlayProps {
  onClose: () => void;
}

export function SettingsOverlay({ onClose }: SettingsOverlayProps) {
  const workspace = useCanvasWorkspace();
  const project = workspace.activeProject;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!project) {
    return (
      <div className="settings-overlay">
        <div className="settings-overlay__inner">
          <p>No project selected</p>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-overlay__inner" onClick={(e) => e.stopPropagation()}>
        <header className="settings-overlay__header">
          <h2>Settings</h2>
          <button className="settings-overlay__close" onClick={onClose}>&times;</button>
        </header>

        <section className="settings-overlay__section">
          <h3>Project</h3>
          <div className="settings-overlay__field">
            <label>Display name</label>
            <input type="text" value={project.displayName} readOnly />
          </div>
          <div className="settings-overlay__field">
            <label>Slug</label>
            <input type="text" value={project.slug} readOnly />
          </div>
          <div className="settings-overlay__field">
            <label>Summary</label>
            <textarea value={project.summary} readOnly rows={3} />
          </div>
          <div className="settings-overlay__field">
            <label>Root path</label>
            <input type="text" value={project.rootPath} readOnly />
          </div>
        </section>

        <section className="settings-overlay__section">
          <h3>Publish</h3>
          <div className="settings-overlay__field">
            <label>Include resources</label>
            <span>{project.publishSettings.includeResources ? "Yes" : "No"}</span>
          </div>
          <div className="settings-overlay__field">
            <label>Theme</label>
            <span>{project.publishSettings.theme}</span>
          </div>
        </section>

        <section className="settings-overlay__section">
          <h3>App</h3>
          <div className="settings-overlay__field">
            <label>Theme</label>
            <span>Dark (only option)</span>
          </div>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into Shell.tsx**

Import and render when `settingsOpen`:

```typescript
import { SettingsOverlay } from "../features/settings/SettingsOverlay";
```

Add to render:

```tsx
        {settingsOpen && (
          <SettingsOverlay onClose={() => setSettingsOpen(false)} />
        )}
```

- [ ] **Step 3: Add settings styles**

In `apps/desktop/src/styles.css`:

```css
/* ─── Settings overlay ──────────────────────────────── */
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 7000;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}
.settings-overlay__inner {
  width: 480px;
  max-height: 80vh;
  overflow-y: auto;
  background: #0e0e22;
  border: 1px solid #252545;
  border-radius: 8px;
  padding: 20px 24px;
}
.settings-overlay__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.settings-overlay__header h2 { font-size: 16px; margin: 0; color: #c0c0e0; }
.settings-overlay__close {
  background: none;
  border: none;
  color: #888;
  font-size: 20px;
  cursor: pointer;
}
.settings-overlay__section {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #151530;
}
.settings-overlay__section h3 {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #7c6fff;
  margin: 0 0 8px;
}
.settings-overlay__field {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 6px;
  font-size: 12px;
}
.settings-overlay__field label {
  min-width: 100px;
  color: #4a4a80;
  font-size: 11px;
}
.settings-overlay__field input,
.settings-overlay__field textarea {
  flex: 1;
  padding: 4px 8px;
  background: #0a0a1a;
  border: 1px solid #252545;
  border-radius: 3px;
  color: #c0c0e0;
  font-size: 12px;
  font-family: inherit;
}
.settings-overlay__field span { color: #c0c0e0; }
```

- [ ] **Step 4: Run TypeScript check and tests**

Run: `pnpm exec tsc -b && pnpm vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: settings overlay showing project metadata and publish configuration"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run full test suite**

```bash
pnpm exec tsc -b && pnpm vitest run && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1
```

Expected: All pass.

- [ ] **Step 2: Verify all icon strip buttons work**

Manual check: files icon toggles file tree, search opens search panel, sequences opens overlay, annotations opens panel, settings opens modal.

- [ ] **Step 3: Verify drag-to-canvas**

Manual check: drag a file from the left panel file tree onto the canvas. A resource node should appear at the drop position.

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final verification and cleanup"
```

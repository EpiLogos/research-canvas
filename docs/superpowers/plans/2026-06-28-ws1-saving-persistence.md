# Reliable Canvas Layout Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed canvas-saving bug in the SQLite layout store, in isolation, decoupled from the Neo4j migration. Replace the whole-canvas DELETE+INSERT replace with **incremental, transactional per-node/edge/app-state upserts** that roll back on failure; persist drag/resize/viewport reliably and automatically; and make the crash-safe flush **surface errors instead of swallowing them** (`catch { return false }` becomes a path that reports the real error).

**Architecture:** A new SQLite layout store — three tables (`node_layout`, `edge_layout`, `canvas_app_state`) keyed by `graph_node_id` (WS0 §3.1) — plus a sync Rust `LayoutRepository` (WS0 §4.3) doing single-row UPSERTs and a batch UPSERT inside the caller's transaction. A new Tauri command `flush_canvas_layout_command` wraps the batch + edge/app-state upserts in **one** `rusqlite` transaction and returns a typed result. The TypeScript `WorkspaceTransport` gains `upsertNodeLayout`, `upsertNodeLayouts`, `upsertEdgeLayout`, `upsertCanvasAppState`, and `flushCanvasLayout` (WS0 §5.2). The React `CanvasWorkspaceContext` debounced autosave switches from the legacy `persistProjectDocument` (full replace) to the incremental layout flush, and the `beforeunload`/`pagehide` flush stops swallowing errors. The legacy `canvas_nodes`/`canvas_edges`/`canvas_annotations` tables are **retained** (annotations stay as-is); WS1 only writes the new layout tables for node/edge/viewport layout.

**Tech Stack:** Tauri v2; React 19 + Vite 7 + TypeScript 5.9; pnpm monorepo; XYFlow @xyflow/react v12.8.5; Zustand v5 vanilla stores; Rust `rusqlite` 0.32 (bundled), `chrono`, `serde`/`serde_json`, `uuid` v4; tests with `tempfile` (Rust) and `vitest` (TS).

## Global Constraints

Tauri v2; React 19 + Vite 7 + TypeScript 5.9; pnpm monorepo; XYFlow @xyflow/react v12.8.5; Zustand v5 vanilla stores; test-first (TDD) for every backend repository, frontend state model, and export behavior; prefer REAL integration tests (real SQLite in temp dir, real Neo4j against an ephemeral/docker instance, real fixture filesystem) over mocks; ALWAYS run Rust tests with `--test-threads=1`; keep file/folder/package names per the repo's existing conventions.

---

## Conventions used by this plan (read once)

- **Rust test command** (always single-threaded): `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml <filter> -- --test-threads=1`.
- **TS test command**: `pnpm vitest run <path>`.
- **Migration registration**: every new `.sql` file under `apps/desktop/src-tauri/migrations/` MUST be added to the `MIGRATIONS` array in `apps/desktop/src-tauri/src/db/migrations.rs` (the runner does not auto-discover files).
- **Repository module wiring**: every new file under `apps/desktop/src-tauri/src/db/repositories/` MUST be declared in `apps/desktop/src-tauri/src/db/repositories/mod.rs`.
- **Tauri command wiring**: every new `#[tauri::command]` MUST be added to `tauri::generate_handler![ ... ]` in `apps/desktop/src-tauri/src/lib.rs`.
- The crate's test path to the library is `research_canvas_desktop_lib::...` (see `apps/desktop/src-tauri/tests/db_migrations.rs`).
- `Database::open` runs migrations on open (`apps/desktop/src-tauri/src/db/connection.rs`). `Database::connection()` returns `&Connection`; `Database::connection_mut()` returns `&mut Connection` (needed for `.transaction()`).
- Timestamps use `chrono::Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)` exactly as existing repositories do.

---

## Contract types this plan references (from WS0 §4.3 and §5)

These are defined by **this** plan (WS1 owns `node_layout`/`edge_layout`/`canvas_app_state` and `LayoutRepository`, WS0 §9 cross-reference table). They are reproduced here verbatim from the contracts doc so later tasks reference them exactly.

Rust (WS0 §4.3):

```rust
pub struct NodeLayoutRecord {
    pub graph_node_id: String,
    pub canvas_id: String,
    pub position_x: f64,
    pub position_y: f64,
    pub width: f64,
    pub height: f64,
    pub style_json: String,
    pub created_at: String,
    pub updated_at: String,
}
pub struct EdgeLayoutRecord {
    pub id: String,
    pub canvas_id: String,
    pub source_graph_node_id: String,
    pub target_graph_node_id: String,
    pub relation_kind: String,
    pub source_handle_id: Option<String>,
    pub target_handle_id: Option<String>,
    pub style_json: String,
    pub created_at: String,
    pub updated_at: String,
}
pub struct CanvasAppStateRecord {
    pub canvas_id: String,
    pub viewport_json: String,
    pub app_state_json: String,
    pub updated_at: String,
}
```

TypeScript (WS0 §5.1):

```ts
export interface NodeLayout {
  graphNodeId: string;
  canvasId: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  style: { dotColour?: string; bgColour?: string; textColour?: string; thumbnail?: string };
}
export interface EdgeLayout {
  id: string;
  canvasId: string;
  sourceGraphNodeId: string;
  targetGraphNodeId: string;
  relationKind: string;
  sourceHandleId?: string;
  targetHandleId?: string;
  style: { stroke?: string; width?: number; dashed?: boolean };
}
```

> **Cross-workstream note (WS0 §3.1):** the join key is `graph_node_id`. WS2 will migrate node/edge **substance** into Neo4j keyed by the same `graph_node_id`. For WS1, the frontend's existing canvas node `id` (a UUIDv4 minted in `canvasStore.ts` via `crypto.randomUUID()`) **is** the `graph_node_id` of the layout row — WS1 writes one layout row per current canvas node/edge, keyed by that id. This keeps WS1 shippable now and join-compatible later.

---

## Task 1 — Add the `0008_layout_store` migration (three layout tables)

**Files:**
- Create `apps/desktop/src-tauri/migrations/0008_layout_store.sql`
- Modify `apps/desktop/src-tauri/src/db/migrations.rs` (append one `Migration` entry to the `MIGRATIONS` array, after the `0007_saved_sequences` entry on lines 39–42)
- Modify `apps/desktop/src-tauri/tests/db_migrations.rs` (extend assertions; the file currently asserts 7 migrations and table presence on lines 28–65)

**Interfaces:**
- Consumes: `research_canvas_desktop_lib::db::connection::Database::open` (existing), `research_canvas_desktop_lib::db::migrations::MigrationRunner::migrate` (existing).
- Produces: SQLite tables `node_layout`, `edge_layout`, `canvas_app_state` (schema per WS0 §3.1), and index `idx_node_layout_graph_node_id`, `idx_edge_layout_canvas_id`. Migration version string `"0008_layout_store"`.

Steps:

- [ ] 1.1 Write the failing test. Edit `apps/desktop/src-tauri/tests/db_migrations.rs`. Replace the body of `db_migrations_applies_initial_migration_to_a_real_temp_database` (lines 27–50) with this exact function (it adds the three new table assertions and bumps the count to 8):

```rust
#[test]
fn db_migrations_applies_initial_migration_to_a_real_temp_database() {
    let (_dir, database) = open_temp_database();
    let connection = database.connection();

    assert!(table_exists(connection, "schema_migrations"));
    assert!(table_exists(connection, "projects"));
    assert!(table_exists(connection, "canvases"));
    assert!(table_exists(connection, "canvas_nodes"));
    assert!(table_exists(connection, "canvas_edges"));
    assert!(table_exists(connection, "canvas_annotations"));
    assert!(!table_exists(connection, "sequences"));
    assert!(!table_exists(connection, "sequence_steps"));
    assert!(table_exists(connection, "search_documents"));
    assert!(table_exists(connection, "project_resource_roots"));
    assert!(table_exists(connection, "saved_sequences"));
    assert!(table_exists(connection, "node_layout"));
    assert!(table_exists(connection, "edge_layout"));
    assert!(table_exists(connection, "canvas_app_state"));

    let applied_migrations: i64 = connection
        .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .expect("migration count");
    assert_eq!(applied_migrations, 8);
}
```

  Then update the idempotency test count on line 64 from `assert_eq!(applied_migrations, 7);` to `assert_eq!(applied_migrations, 8);`.

- [ ] 1.2 Run it, expect FAIL:
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml db_migrations -- --test-threads=1`
  Expected failure: the `table_exists(connection, "node_layout")` assertion panics with `assertion failed: table_exists(connection, "node_layout")`, and the count assertion would read `7`.

- [ ] 1.3 Create the migration file `apps/desktop/src-tauri/migrations/0008_layout_store.sql` with this exact content (WS0 §3.1 verbatim):

```sql
-- Per-node layout, joined to Neo4j by graph_node_id.
CREATE TABLE IF NOT EXISTS node_layout (
    graph_node_id  TEXT NOT NULL,
    canvas_id      TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    position_x     REAL NOT NULL,
    position_y     REAL NOT NULL,
    width          REAL NOT NULL,
    height         REAL NOT NULL,
    style_json     TEXT NOT NULL DEFAULT '{}',
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (canvas_id, graph_node_id)
);
CREATE INDEX IF NOT EXISTS idx_node_layout_graph_node_id ON node_layout(graph_node_id);

-- Per-canvas viewport + app-state (one row per canvas).
CREATE TABLE IF NOT EXISTS canvas_app_state (
    canvas_id      TEXT PRIMARY KEY NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    viewport_json  TEXT NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
    app_state_json TEXT NOT NULL DEFAULT '{}',
    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Edge layout/relation-mirror rows keyed by graph relation.
CREATE TABLE IF NOT EXISTS edge_layout (
    id                   TEXT PRIMARY KEY NOT NULL,
    canvas_id            TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    source_graph_node_id TEXT NOT NULL,
    target_graph_node_id TEXT NOT NULL,
    relation_kind        TEXT NOT NULL,
    source_handle_id     TEXT,
    target_handle_id     TEXT,
    style_json           TEXT NOT NULL DEFAULT '{}',
    created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_edge_layout_canvas_id ON edge_layout(canvas_id);
```

- [ ] 1.4 Register the migration. In `apps/desktop/src-tauri/src/db/migrations.rs`, add this entry to the `MIGRATIONS` array immediately after the `0007_saved_sequences` entry (which ends on line 42 with `},`):

```rust
    Migration {
        version: "0008_layout_store",
        sql: include_str!("../../migrations/0008_layout_store.sql"),
    },
```

- [ ] 1.5 Run it, expect PASS:
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml db_migrations -- --test-threads=1`
  Expected: `test result: ok. 2 passed`.

- [ ] 1.6 Commit:
  `git add apps/desktop/src-tauri/migrations/0008_layout_store.sql apps/desktop/src-tauri/src/db/migrations.rs apps/desktop/src-tauri/tests/db_migrations.rs && git commit -m "feat(ws1): add 0008_layout_store migration (node_layout, edge_layout, canvas_app_state)"`

---

## Task 2 — `LayoutRepository`: records + reads + `upsert_node_layout`

**Files:**
- Create `apps/desktop/src-tauri/src/db/repositories/layout.rs`
- Modify `apps/desktop/src-tauri/src/db/repositories/mod.rs` (add `pub mod layout;` and a `pub use`)
- Create `apps/desktop/src-tauri/tests/layout_repository.rs`

**Interfaces:**
- Consumes: `Database::open` (existing), `ProjectRepository::new(...).create(...)` (existing — returns `Project` with `primary_canvas_id: Option<String>`, used to get a valid `canvas_id` that satisfies the FK).
- Produces:
  - `pub struct NodeLayoutRecord { graph_node_id, canvas_id, position_x, position_y, width, height, style_json, created_at, updated_at }` (types per WS0 §4.3).
  - `pub struct LayoutRepository<'conn> { connection: &'conn rusqlite::Connection }`
  - `pub fn LayoutRepository::new(connection: &'conn rusqlite::Connection) -> Self`
  - `pub fn list_node_layout(&self, canvas_id: &str) -> rusqlite::Result<Vec<NodeLayoutRecord>>`
  - `pub fn upsert_node_layout(&self, record: &NodeLayoutRecord) -> rusqlite::Result<()>`

Steps:

- [ ] 2.1 Write the failing test. Create `apps/desktop/src-tauri/tests/layout_repository.rs` with this exact content:

```rust
use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{LayoutRepository, NodeLayoutRecord, ProjectRepository},
};
use tempfile::{tempdir, TempDir};

fn open_temp_database() -> (TempDir, Database) {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("research-canvas.sqlite");
    let database = Database::open(&path).expect("database open");
    (dir, database)
}

fn make_canvas(database: &Database) -> String {
    let projects = ProjectRepository::new(database.connection());
    let project = projects
        .create(
            "WS1".to_string(),
            "ws1".to_string(),
            None,
            "/tmp/ws1".to_string(),
            None,
            None,
            serde_json::json!({}),
        )
        .expect("create project");
    project.primary_canvas_id.expect("primary canvas")
}

fn record(graph_node_id: &str, canvas_id: &str, x: f64, y: f64) -> NodeLayoutRecord {
    NodeLayoutRecord {
        graph_node_id: graph_node_id.to_string(),
        canvas_id: canvas_id.to_string(),
        position_x: x,
        position_y: y,
        width: 240.0,
        height: 160.0,
        style_json: "{}".to_string(),
        created_at: "2026-06-28T00:00:00Z".to_string(),
        updated_at: "2026-06-28T00:00:00Z".to_string(),
    }
}

#[test]
fn upsert_node_layout_inserts_then_updates_in_place() {
    let (_dir, database) = open_temp_database();
    let canvas_id = make_canvas(&database);
    let repo = LayoutRepository::new(database.connection());

    repo.upsert_node_layout(&record("n1", &canvas_id, 10.0, 20.0))
        .expect("first upsert");

    let after_insert = repo.list_node_layout(&canvas_id).expect("list");
    assert_eq!(after_insert.len(), 1);
    assert_eq!(after_insert[0].graph_node_id, "n1");
    assert_eq!(after_insert[0].position_x, 10.0);
    assert_eq!(after_insert[0].position_y, 20.0);

    // Same (canvas_id, graph_node_id) → update, not a second row.
    repo.upsert_node_layout(&record("n1", &canvas_id, 99.0, 88.0))
        .expect("second upsert");

    let after_update = repo.list_node_layout(&canvas_id).expect("list again");
    assert_eq!(after_update.len(), 1);
    assert_eq!(after_update[0].position_x, 99.0);
    assert_eq!(after_update[0].position_y, 88.0);
}
```

- [ ] 2.2 Run it, expect FAIL (compile error — the module does not exist yet):
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml layout_repository -- --test-threads=1`
  Expected failure: `unresolved import` / `cannot find ... LayoutRepository` from `research_canvas_desktop_lib::db::repositories`.

- [ ] 2.3 Create `apps/desktop/src-tauri/src/db/repositories/layout.rs` with this exact content (records + `new` + `list_node_layout` + `upsert_node_layout`):

```rust
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeLayoutRecord {
    pub graph_node_id: String,
    pub canvas_id: String,
    pub position_x: f64,
    pub position_y: f64,
    pub width: f64,
    pub height: f64,
    pub style_json: String,
    pub created_at: String,
    pub updated_at: String,
}

pub struct LayoutRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> LayoutRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn list_node_layout(&self, canvas_id: &str) -> Result<Vec<NodeLayoutRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT graph_node_id, canvas_id, position_x, position_y, width, height,
                    style_json, created_at, updated_at
             FROM node_layout
             WHERE canvas_id = ?1
             ORDER BY created_at ASC, graph_node_id ASC",
        )?;
        let rows = statement.query_map([canvas_id], node_layout_from_row)?;
        rows.collect()
    }

    pub fn upsert_node_layout(&self, record: &NodeLayoutRecord) -> Result<()> {
        self.connection.execute(
            "INSERT INTO node_layout (
                graph_node_id, canvas_id, position_x, position_y, width, height,
                style_json, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(canvas_id, graph_node_id) DO UPDATE SET
                position_x = excluded.position_x,
                position_y = excluded.position_y,
                width      = excluded.width,
                height     = excluded.height,
                style_json = excluded.style_json,
                updated_at = excluded.updated_at",
            params![
                record.graph_node_id,
                record.canvas_id,
                record.position_x,
                record.position_y,
                record.width,
                record.height,
                record.style_json,
                record.created_at,
                record.updated_at,
            ],
        )?;
        Ok(())
    }
}

fn node_layout_from_row(row: &rusqlite::Row<'_>) -> Result<NodeLayoutRecord> {
    Ok(NodeLayoutRecord {
        graph_node_id: row.get(0)?,
        canvas_id: row.get(1)?,
        position_x: row.get(2)?,
        position_y: row.get(3)?,
        width: row.get(4)?,
        height: row.get(5)?,
        style_json: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}
```

- [ ] 2.4 Wire the module. In `apps/desktop/src-tauri/src/db/repositories/mod.rs`, add `pub mod layout;` after the `pub mod canvas;` line (line 2), and add this `pub use` after the `canvas` re-export block (after line 12):

```rust
pub use layout::{LayoutRepository, NodeLayoutRecord};
```

- [ ] 2.5 Run it, expect PASS:
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml layout_repository -- --test-threads=1`
  Expected: `test result: ok. 1 passed`.

- [ ] 2.6 Commit:
  `git add apps/desktop/src-tauri/src/db/repositories/layout.rs apps/desktop/src-tauri/src/db/repositories/mod.rs apps/desktop/src-tauri/tests/layout_repository.rs && git commit -m "feat(ws1): LayoutRepository with upsert_node_layout + list_node_layout"`

---

## Task 3 — `delete_node_layout` (incremental delete, no whole-canvas wipe)

**Files:**
- Modify `apps/desktop/src-tauri/src/db/repositories/layout.rs` (add one method)
- Modify `apps/desktop/src-tauri/tests/layout_repository.rs` (add one test)

**Interfaces:**
- Consumes: `LayoutRepository::new`, `upsert_node_layout`, `list_node_layout` (Task 2).
- Produces: `pub fn delete_node_layout(&self, canvas_id: &str, graph_node_id: &str) -> rusqlite::Result<()>`.

Steps:

- [ ] 3.1 Write the failing test. Append to `apps/desktop/src-tauri/tests/layout_repository.rs`:

```rust
#[test]
fn delete_node_layout_removes_only_the_targeted_row() {
    let (_dir, database) = open_temp_database();
    let canvas_id = make_canvas(&database);
    let repo = LayoutRepository::new(database.connection());

    repo.upsert_node_layout(&record("keep", &canvas_id, 1.0, 1.0))
        .expect("upsert keep");
    repo.upsert_node_layout(&record("drop", &canvas_id, 2.0, 2.0))
        .expect("upsert drop");

    repo.delete_node_layout(&canvas_id, "drop")
        .expect("delete drop");

    let remaining = repo.list_node_layout(&canvas_id).expect("list");
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].graph_node_id, "keep");
}
```

- [ ] 3.2 Run it, expect FAIL:
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml layout_repository -- --test-threads=1`
  Expected failure: `no method named `delete_node_layout` found`.

- [ ] 3.3 Add the method. In `apps/desktop/src-tauri/src/db/repositories/layout.rs`, inside `impl<'conn> LayoutRepository<'conn>`, immediately after `upsert_node_layout`:

```rust
    pub fn delete_node_layout(&self, canvas_id: &str, graph_node_id: &str) -> Result<()> {
        self.connection.execute(
            "DELETE FROM node_layout WHERE canvas_id = ?1 AND graph_node_id = ?2",
            params![canvas_id, graph_node_id],
        )?;
        Ok(())
    }
```

- [ ] 3.4 Run it, expect PASS:
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml layout_repository -- --test-threads=1`
  Expected: `test result: ok. 2 passed`.

- [ ] 3.5 Commit:
  `git add apps/desktop/src-tauri/src/db/repositories/layout.rs apps/desktop/src-tauri/tests/layout_repository.rs && git commit -m "feat(ws1): LayoutRepository::delete_node_layout"`

---

## Task 4 — `EdgeLayoutRecord` + `list_edge_layout` + `upsert_edge_layout` + `delete_edge_layout`

**Files:**
- Modify `apps/desktop/src-tauri/src/db/repositories/layout.rs`
- Modify `apps/desktop/src-tauri/src/db/repositories/mod.rs` (extend the `pub use`)
- Modify `apps/desktop/src-tauri/tests/layout_repository.rs`

**Interfaces:**
- Consumes: `LayoutRepository::new`, `make_canvas` test helper (Task 2).
- Produces:
  - `pub struct EdgeLayoutRecord { id, canvas_id, source_graph_node_id, target_graph_node_id, relation_kind, source_handle_id: Option<String>, target_handle_id: Option<String>, style_json, created_at, updated_at }` (WS0 §4.3).
  - `pub fn list_edge_layout(&self, canvas_id: &str) -> rusqlite::Result<Vec<EdgeLayoutRecord>>`
  - `pub fn upsert_edge_layout(&self, record: &EdgeLayoutRecord) -> rusqlite::Result<()>`
  - `pub fn delete_edge_layout(&self, id: &str) -> rusqlite::Result<()>`

Steps:

- [ ] 4.1 Write the failing test. Append to `apps/desktop/src-tauri/tests/layout_repository.rs`:

```rust
fn edge(id: &str, canvas_id: &str, relation: &str) -> research_canvas_desktop_lib::db::repositories::EdgeLayoutRecord {
    research_canvas_desktop_lib::db::repositories::EdgeLayoutRecord {
        id: id.to_string(),
        canvas_id: canvas_id.to_string(),
        source_graph_node_id: "a".to_string(),
        target_graph_node_id: "b".to_string(),
        relation_kind: relation.to_string(),
        source_handle_id: Some("a-right".to_string()),
        target_handle_id: Some("b-left".to_string()),
        style_json: "{}".to_string(),
        created_at: "2026-06-28T00:00:00Z".to_string(),
        updated_at: "2026-06-28T00:00:00Z".to_string(),
    }
}

#[test]
fn edge_layout_upserts_updates_in_place_and_deletes() {
    let (_dir, database) = open_temp_database();
    let canvas_id = make_canvas(&database);
    let repo = LayoutRepository::new(database.connection());

    repo.upsert_edge_layout(&edge("e1", &canvas_id, "supports"))
        .expect("insert edge");

    let after_insert = repo.list_edge_layout(&canvas_id).expect("list edges");
    assert_eq!(after_insert.len(), 1);
    assert_eq!(after_insert[0].relation_kind, "supports");
    assert_eq!(after_insert[0].source_handle_id.as_deref(), Some("a-right"));

    repo.upsert_edge_layout(&edge("e1", &canvas_id, "opposes"))
        .expect("update edge");
    let after_update = repo.list_edge_layout(&canvas_id).expect("list edges again");
    assert_eq!(after_update.len(), 1);
    assert_eq!(after_update[0].relation_kind, "opposes");

    repo.delete_edge_layout("e1").expect("delete edge");
    assert!(repo.list_edge_layout(&canvas_id).expect("list empty").is_empty());
}
```

- [ ] 4.2 Run it, expect FAIL:
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml layout_repository -- --test-threads=1`
  Expected failure: `cannot find ... EdgeLayoutRecord` / `no method named `upsert_edge_layout``.

- [ ] 4.3 Add the record and methods. In `apps/desktop/src-tauri/src/db/repositories/layout.rs`, add this struct immediately after the `NodeLayoutRecord` definition:

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeLayoutRecord {
    pub id: String,
    pub canvas_id: String,
    pub source_graph_node_id: String,
    pub target_graph_node_id: String,
    pub relation_kind: String,
    pub source_handle_id: Option<String>,
    pub target_handle_id: Option<String>,
    pub style_json: String,
    pub created_at: String,
    pub updated_at: String,
}
```

  And add these three methods inside `impl<'conn> LayoutRepository<'conn>`, after `delete_node_layout`:

```rust
    pub fn list_edge_layout(&self, canvas_id: &str) -> Result<Vec<EdgeLayoutRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT id, canvas_id, source_graph_node_id, target_graph_node_id, relation_kind,
                    source_handle_id, target_handle_id, style_json, created_at, updated_at
             FROM edge_layout
             WHERE canvas_id = ?1
             ORDER BY created_at ASC, id ASC",
        )?;
        let rows = statement.query_map([canvas_id], edge_layout_from_row)?;
        rows.collect()
    }

    pub fn upsert_edge_layout(&self, record: &EdgeLayoutRecord) -> Result<()> {
        self.connection.execute(
            "INSERT INTO edge_layout (
                id, canvas_id, source_graph_node_id, target_graph_node_id, relation_kind,
                source_handle_id, target_handle_id, style_json, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
                canvas_id            = excluded.canvas_id,
                source_graph_node_id = excluded.source_graph_node_id,
                target_graph_node_id = excluded.target_graph_node_id,
                relation_kind        = excluded.relation_kind,
                source_handle_id     = excluded.source_handle_id,
                target_handle_id     = excluded.target_handle_id,
                style_json           = excluded.style_json,
                updated_at           = excluded.updated_at",
            params![
                record.id,
                record.canvas_id,
                record.source_graph_node_id,
                record.target_graph_node_id,
                record.relation_kind,
                record.source_handle_id,
                record.target_handle_id,
                record.style_json,
                record.created_at,
                record.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_edge_layout(&self, id: &str) -> Result<()> {
        self.connection
            .execute("DELETE FROM edge_layout WHERE id = ?1", params![id])?;
        Ok(())
    }
```

  And add this row mapper at the bottom of the file, after `node_layout_from_row`:

```rust
fn edge_layout_from_row(row: &rusqlite::Row<'_>) -> Result<EdgeLayoutRecord> {
    Ok(EdgeLayoutRecord {
        id: row.get(0)?,
        canvas_id: row.get(1)?,
        source_graph_node_id: row.get(2)?,
        target_graph_node_id: row.get(3)?,
        relation_kind: row.get(4)?,
        source_handle_id: row.get(5)?,
        target_handle_id: row.get(6)?,
        style_json: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}
```

- [ ] 4.4 Extend the re-export. In `apps/desktop/src-tauri/src/db/repositories/mod.rs`, change the layout `pub use` line to:

```rust
pub use layout::{EdgeLayoutRecord, LayoutRepository, NodeLayoutRecord};
```

- [ ] 4.5 Run it, expect PASS:
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml layout_repository -- --test-threads=1`
  Expected: `test result: ok. 3 passed`.

- [ ] 4.6 Commit:
  `git add apps/desktop/src-tauri/src/db/repositories/layout.rs apps/desktop/src-tauri/src/db/repositories/mod.rs apps/desktop/src-tauri/tests/layout_repository.rs && git commit -m "feat(ws1): edge_layout CRUD on LayoutRepository"`

---

## Task 5 — `CanvasAppStateRecord` + `get_app_state` + `upsert_app_state` (viewport persistence)

**Files:**
- Modify `apps/desktop/src-tauri/src/db/repositories/layout.rs`
- Modify `apps/desktop/src-tauri/src/db/repositories/mod.rs` (extend the `pub use`)
- Modify `apps/desktop/src-tauri/tests/layout_repository.rs`

**Interfaces:**
- Consumes: `LayoutRepository::new`, `make_canvas` (Task 2).
- Produces:
  - `pub struct CanvasAppStateRecord { canvas_id, viewport_json, app_state_json, updated_at }` (WS0 §4.3).
  - `pub fn get_app_state(&self, canvas_id: &str) -> rusqlite::Result<Option<CanvasAppStateRecord>>`
  - `pub fn upsert_app_state(&self, record: &CanvasAppStateRecord) -> rusqlite::Result<()>`

Steps:

- [ ] 5.1 Write the failing test. Append to `apps/desktop/src-tauri/tests/layout_repository.rs`:

```rust
#[test]
fn app_state_upsert_persists_viewport_and_is_readable() {
    let (_dir, database) = open_temp_database();
    let canvas_id = make_canvas(&database);
    let repo = LayoutRepository::new(database.connection());

    assert!(repo.get_app_state(&canvas_id).expect("get none").is_none());

    repo.upsert_app_state(&research_canvas_desktop_lib::db::repositories::CanvasAppStateRecord {
        canvas_id: canvas_id.clone(),
        viewport_json: r#"{"x":12,"y":34,"zoom":1.5}"#.to_string(),
        app_state_json: r#"{"panel":"open"}"#.to_string(),
        updated_at: "2026-06-28T00:00:00Z".to_string(),
    })
    .expect("first upsert");

    let loaded = repo.get_app_state(&canvas_id).expect("get some").expect("row");
    assert_eq!(loaded.viewport_json, r#"{"x":12,"y":34,"zoom":1.5}"#);
    assert_eq!(loaded.app_state_json, r#"{"panel":"open"}"#);

    repo.upsert_app_state(&research_canvas_desktop_lib::db::repositories::CanvasAppStateRecord {
        canvas_id: canvas_id.clone(),
        viewport_json: r#"{"x":0,"y":0,"zoom":2}"#.to_string(),
        app_state_json: "{}".to_string(),
        updated_at: "2026-06-28T01:00:00Z".to_string(),
    })
    .expect("second upsert");

    let updated = repo.get_app_state(&canvas_id).expect("get some 2").expect("row 2");
    assert_eq!(updated.viewport_json, r#"{"x":0,"y":0,"zoom":2}"#);

    // Still exactly one row per canvas.
    let count: i64 = database
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM canvas_app_state WHERE canvas_id = ?1",
            [&canvas_id],
            |row| row.get(0),
        )
        .expect("count");
    assert_eq!(count, 1);
}
```

- [ ] 5.2 Run it, expect FAIL:
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml layout_repository -- --test-threads=1`
  Expected failure: `cannot find ... CanvasAppStateRecord` / `no method named `get_app_state``.

- [ ] 5.3 Add the record and methods. In `apps/desktop/src-tauri/src/db/repositories/layout.rs`, add this struct after `EdgeLayoutRecord`:

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasAppStateRecord {
    pub canvas_id: String,
    pub viewport_json: String,
    pub app_state_json: String,
    pub updated_at: String,
}
```

  Add these methods inside `impl<'conn> LayoutRepository<'conn>`, after `delete_edge_layout`:

```rust
    pub fn get_app_state(&self, canvas_id: &str) -> Result<Option<CanvasAppStateRecord>> {
        use rusqlite::OptionalExtension;
        self.connection
            .query_row(
                "SELECT canvas_id, viewport_json, app_state_json, updated_at
                 FROM canvas_app_state
                 WHERE canvas_id = ?1",
                [canvas_id],
                app_state_from_row,
            )
            .optional()
    }

    pub fn upsert_app_state(&self, record: &CanvasAppStateRecord) -> Result<()> {
        self.connection.execute(
            "INSERT INTO canvas_app_state (canvas_id, viewport_json, app_state_json, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(canvas_id) DO UPDATE SET
                viewport_json  = excluded.viewport_json,
                app_state_json = excluded.app_state_json,
                updated_at     = excluded.updated_at",
            params![
                record.canvas_id,
                record.viewport_json,
                record.app_state_json,
                record.updated_at,
            ],
        )?;
        Ok(())
    }
```

  Add this row mapper at the bottom of the file, after `edge_layout_from_row`:

```rust
fn app_state_from_row(row: &rusqlite::Row<'_>) -> Result<CanvasAppStateRecord> {
    Ok(CanvasAppStateRecord {
        canvas_id: row.get(0)?,
        viewport_json: row.get(1)?,
        app_state_json: row.get(2)?,
        updated_at: row.get(3)?,
    })
}
```

- [ ] 5.4 Extend the re-export. In `apps/desktop/src-tauri/src/db/repositories/mod.rs`, change the layout `pub use` line to:

```rust
pub use layout::{CanvasAppStateRecord, EdgeLayoutRecord, LayoutRepository, NodeLayoutRecord};
```

- [ ] 5.5 Run it, expect PASS:
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml layout_repository -- --test-threads=1`
  Expected: `test result: ok. 4 passed`.

- [ ] 5.6 Commit:
  `git add apps/desktop/src-tauri/src/db/repositories/layout.rs apps/desktop/src-tauri/src/db/repositories/mod.rs apps/desktop/src-tauri/tests/layout_repository.rs && git commit -m "feat(ws1): canvas_app_state upsert/get for viewport persistence"`

---

## Task 6 — `upsert_node_layouts` (batch) returns count written

**Files:**
- Modify `apps/desktop/src-tauri/src/db/repositories/layout.rs`
- Modify `apps/desktop/src-tauri/tests/layout_repository.rs`

**Interfaces:**
- Consumes: `LayoutRepository::new`, `upsert_node_layout` (Task 2), `list_node_layout` (Task 2), `record` helper (Task 2).
- Produces: `pub fn upsert_node_layouts(&self, records: &[NodeLayoutRecord]) -> rusqlite::Result<usize>` — returns the number of records written (WS0 §4.3: "returns the count written so the frontend flush can surface real success/failure"). Runs inside the caller's transaction (caller responsibility).

Steps:

- [ ] 6.1 Write the failing test. Append to `apps/desktop/src-tauri/tests/layout_repository.rs`:

```rust
#[test]
fn upsert_node_layouts_writes_all_records_and_returns_count() {
    let (_dir, database) = open_temp_database();
    let canvas_id = make_canvas(&database);
    let repo = LayoutRepository::new(database.connection());

    let batch = vec![
        record("n1", &canvas_id, 1.0, 1.0),
        record("n2", &canvas_id, 2.0, 2.0),
        record("n3", &canvas_id, 3.0, 3.0),
    ];

    let written = repo.upsert_node_layouts(&batch).expect("batch upsert");
    assert_eq!(written, 3);

    let listed = repo.list_node_layout(&canvas_id).expect("list");
    assert_eq!(listed.len(), 3);

    // Re-running with updated positions overwrites, count unchanged.
    let batch2 = vec![record("n1", &canvas_id, 50.0, 60.0)];
    let written2 = repo.upsert_node_layouts(&batch2).expect("batch upsert 2");
    assert_eq!(written2, 1);
    let listed2 = repo.list_node_layout(&canvas_id).expect("list 2");
    assert_eq!(listed2.len(), 3);
    let n1 = listed2.iter().find(|r| r.graph_node_id == "n1").expect("n1");
    assert_eq!(n1.position_x, 50.0);
}
```

- [ ] 6.2 Run it, expect FAIL:
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml layout_repository -- --test-threads=1`
  Expected failure: `no method named `upsert_node_layouts``.

- [ ] 6.3 Add the method. In `apps/desktop/src-tauri/src/db/repositories/layout.rs`, inside `impl<'conn> LayoutRepository<'conn>`, after `upsert_node_layout`:

```rust
    pub fn upsert_node_layouts(&self, records: &[NodeLayoutRecord]) -> Result<usize> {
        for record in records {
            self.upsert_node_layout(record)?;
        }
        Ok(records.len())
    }
```

- [ ] 6.4 Run it, expect PASS:
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml layout_repository -- --test-threads=1`
  Expected: `test result: ok. 5 passed`.

- [ ] 6.5 Commit:
  `git add apps/desktop/src-tauri/src/db/repositories/layout.rs apps/desktop/src-tauri/tests/layout_repository.rs && git commit -m "feat(ws1): LayoutRepository::upsert_node_layouts batch returns count"`

---

## Task 7 — Layout command payloads + `flush_canvas_layout_at` (one transaction, rollback, surfaced errors)

This is the heart of WS1: a transactional flush that writes the whole layout snapshot atomically and **returns the error** rather than swallowing it.

**Files:**
- Create `apps/desktop/src-tauri/src/commands/layout.rs`
- Modify `apps/desktop/src-tauri/src/lib.rs` (declare `pub mod layout;` inside the `pub mod commands { ... }` block — currently lines 2–7)
- Create `apps/desktop/src-tauri/tests/layout_flush.rs`

**Interfaces:**
- Consumes:
  - `Database::open`, `Database::connection_mut() -> &mut Connection`, `Connection::transaction()` (existing, used identically in `commands/projects.rs::persist_project_document_at`).
  - `LayoutRepository::{new, upsert_node_layouts, upsert_edge_layout, upsert_app_state, list_node_layout}` (Tasks 2–6).
  - `NodeLayoutRecord`, `EdgeLayoutRecord`, `CanvasAppStateRecord` (Tasks 2,4,5).
  - `ProjectRepository::new(...).create(...)` for the test (existing).
- Produces (public, so integration tests and the Tauri command can call them):
  - `pub struct NodeLayoutPayload { graph_node_id, canvas_id, position_x, position_y, width, height, style_json }`
  - `pub struct EdgeLayoutPayload { id, canvas_id, source_graph_node_id, target_graph_node_id, relation_kind, source_handle_id: Option<String>, target_handle_id: Option<String>, style_json }`
  - `pub struct FlushCanvasLayoutRequest { database_path, canvas_id, layouts: Vec<NodeLayoutPayload>, edges: Vec<EdgeLayoutPayload>, viewport_json, app_state_json }`
  - `pub struct FlushCanvasLayoutResponse { written_nodes: usize, written_edges: usize }`
  - `pub fn flush_canvas_layout_at(request: FlushCanvasLayoutRequest) -> Result<FlushCanvasLayoutResponse, String>`

Steps:

- [ ] 7.1 Write the failing test. Create `apps/desktop/src-tauri/tests/layout_flush.rs`:

```rust
use research_canvas_desktop_lib::commands::layout::{
    flush_canvas_layout_at, EdgeLayoutPayload, FlushCanvasLayoutRequest, NodeLayoutPayload,
};
use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{LayoutRepository, ProjectRepository},
};
use tempfile::tempdir;

fn node(graph_node_id: &str, canvas_id: &str, x: f64, y: f64) -> NodeLayoutPayload {
    NodeLayoutPayload {
        graph_node_id: graph_node_id.to_string(),
        canvas_id: canvas_id.to_string(),
        position_x: x,
        position_y: y,
        width: 240.0,
        height: 160.0,
        style_json: "{}".to_string(),
    }
}

#[test]
fn flush_canvas_layout_persists_nodes_edges_and_viewport_in_one_transaction() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("flush.sqlite");
    let canvas_id = {
        let database = Database::open(&db_path).expect("open");
        let projects = ProjectRepository::new(database.connection());
        let project = projects
            .create(
                "WS1".to_string(),
                "ws1".to_string(),
                None,
                "/tmp/ws1".to_string(),
                None,
                None,
                serde_json::json!({}),
            )
            .expect("create project");
        project.primary_canvas_id.expect("canvas")
    };

    let response = flush_canvas_layout_at(FlushCanvasLayoutRequest {
        database_path: db_path.to_string_lossy().to_string(),
        canvas_id: canvas_id.clone(),
        layouts: vec![node("n1", &canvas_id, 10.0, 20.0), node("n2", &canvas_id, 30.0, 40.0)],
        edges: vec![EdgeLayoutPayload {
            id: "e1".to_string(),
            canvas_id: canvas_id.clone(),
            source_graph_node_id: "n1".to_string(),
            target_graph_node_id: "n2".to_string(),
            relation_kind: "supports".to_string(),
            source_handle_id: None,
            target_handle_id: None,
            style_json: "{}".to_string(),
        }],
        viewport_json: r#"{"x":5,"y":6,"zoom":1.25}"#.to_string(),
        app_state_json: "{}".to_string(),
    })
    .expect("flush ok");

    assert_eq!(response.written_nodes, 2);
    assert_eq!(response.written_edges, 1);

    let database = Database::open(&db_path).expect("reopen");
    let repo = LayoutRepository::new(database.connection());
    assert_eq!(repo.list_node_layout(&canvas_id).expect("nodes").len(), 2);
    assert_eq!(repo.list_edge_layout(&canvas_id).expect("edges").len(), 1);
    let state = repo.get_app_state(&canvas_id).expect("state").expect("row");
    assert_eq!(state.viewport_json, r#"{"x":5,"y":6,"zoom":1.25}"#);
}

#[test]
fn flush_canvas_layout_rolls_back_when_a_node_violates_the_canvas_foreign_key() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("rollback.sqlite");
    let canvas_id = {
        let database = Database::open(&db_path).expect("open");
        let projects = ProjectRepository::new(database.connection());
        let project = projects
            .create(
                "WS1".to_string(),
                "ws1".to_string(),
                None,
                "/tmp/ws1".to_string(),
                None,
                None,
                serde_json::json!({}),
            )
            .expect("create project");
        project.primary_canvas_id.expect("canvas")
    };

    // First good node uses the real canvas_id; second node references a canvas
    // that does not exist, so its FK fails and the whole flush must roll back.
    let result = flush_canvas_layout_at(FlushCanvasLayoutRequest {
        database_path: db_path.to_string_lossy().to_string(),
        canvas_id: canvas_id.clone(),
        layouts: vec![
            node("good", &canvas_id, 1.0, 1.0),
            node("bad", "canvas-that-does-not-exist", 2.0, 2.0),
        ],
        edges: vec![],
        viewport_json: r#"{"x":0,"y":0,"zoom":1}"#.to_string(),
        app_state_json: "{}".to_string(),
    });

    assert!(result.is_err(), "flush must surface the error, not swallow it");

    // Nothing was committed: zero rows for this canvas.
    let database = Database::open(&db_path).expect("reopen");
    let repo = LayoutRepository::new(database.connection());
    assert!(
        repo.list_node_layout(&canvas_id).expect("nodes").is_empty(),
        "transaction must roll back the 'good' node too"
    );
    assert!(repo.get_app_state(&canvas_id).expect("state").is_none());
}
```

- [ ] 7.2 Run it, expect FAIL (compile error):
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml layout_flush -- --test-threads=1`
  Expected failure: `unresolved import research_canvas_desktop_lib::commands::layout`.

- [ ] 7.3 Create `apps/desktop/src-tauri/src/commands/layout.rs`:

```rust
use std::path::PathBuf;

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};

use crate::db::{
    connection::Database,
    repositories::{
        CanvasAppStateRecord, EdgeLayoutRecord, LayoutRepository, NodeLayoutRecord,
    },
    SharedApiState,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeLayoutPayload {
    pub graph_node_id: String,
    pub canvas_id: String,
    pub position_x: f64,
    pub position_y: f64,
    pub width: f64,
    pub height: f64,
    pub style_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeLayoutPayload {
    pub id: String,
    pub canvas_id: String,
    pub source_graph_node_id: String,
    pub target_graph_node_id: String,
    pub relation_kind: String,
    pub source_handle_id: Option<String>,
    pub target_handle_id: Option<String>,
    pub style_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlushCanvasLayoutRequest {
    pub database_path: String,
    pub canvas_id: String,
    pub layouts: Vec<NodeLayoutPayload>,
    pub edges: Vec<EdgeLayoutPayload>,
    pub viewport_json: String,
    pub app_state_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlushCanvasLayoutResponse {
    pub written_nodes: usize,
    pub written_edges: usize,
}

pub fn flush_canvas_layout_at(
    request: FlushCanvasLayoutRequest,
) -> Result<FlushCanvasLayoutResponse, String> {
    let mut database =
        Database::open(PathBuf::from(&request.database_path)).map_err(|error| error.to_string())?;

    let now = current_timestamp();

    let node_records: Vec<NodeLayoutRecord> = request
        .layouts
        .iter()
        .map(|payload| NodeLayoutRecord {
            graph_node_id: payload.graph_node_id.clone(),
            canvas_id: payload.canvas_id.clone(),
            position_x: payload.position_x,
            position_y: payload.position_y,
            width: payload.width,
            height: payload.height,
            style_json: payload.style_json.clone(),
            created_at: now.clone(),
            updated_at: now.clone(),
        })
        .collect();

    let edge_records: Vec<EdgeLayoutRecord> = request
        .edges
        .iter()
        .map(|payload| EdgeLayoutRecord {
            id: payload.id.clone(),
            canvas_id: payload.canvas_id.clone(),
            source_graph_node_id: payload.source_graph_node_id.clone(),
            target_graph_node_id: payload.target_graph_node_id.clone(),
            relation_kind: payload.relation_kind.clone(),
            source_handle_id: payload.source_handle_id.clone(),
            target_handle_id: payload.target_handle_id.clone(),
            style_json: payload.style_json.clone(),
            created_at: now.clone(),
            updated_at: now.clone(),
        })
        .collect();

    let app_state = CanvasAppStateRecord {
        canvas_id: request.canvas_id.clone(),
        viewport_json: request.viewport_json.clone(),
        app_state_json: request.app_state_json.clone(),
        updated_at: now.clone(),
    };

    let written_nodes = node_records.len();
    let written_edges = edge_records.len();

    {
        let transaction = database
            .connection_mut()
            .transaction()
            .map_err(|error| error.to_string())?;
        {
            let repo = LayoutRepository::new(&transaction);
            repo.upsert_node_layouts(&node_records)
                .map_err(|error| error.to_string())?;
            for edge in &edge_records {
                repo.upsert_edge_layout(edge)
                    .map_err(|error| error.to_string())?;
            }
            repo.upsert_app_state(&app_state)
                .map_err(|error| error.to_string())?;
        }
        transaction.commit().map_err(|error| error.to_string())?;
    }

    Ok(FlushCanvasLayoutResponse {
        written_nodes,
        written_edges,
    })
}

#[tauri::command]
pub fn flush_canvas_layout_command(
    request: FlushCanvasLayoutRequest,
    _api_state: tauri::State<SharedApiState>,
) -> Result<FlushCanvasLayoutResponse, String> {
    flush_canvas_layout_at(request)
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}
```

  > Note on the rollback test: SQLite enforces the `node_layout.canvas_id REFERENCES canvases(id)` foreign key because `Database::open` runs `PRAGMA foreign_keys = ON;` (`connection.rs` line 13). `rusqlite::Connection::transaction()` rolls back automatically when the `Transaction` is dropped without `commit()`; returning `Err` before `commit()` drops it, so the "good" node is not persisted.

- [ ] 7.4 Wire the module. In `apps/desktop/src-tauri/src/lib.rs`, inside the `pub mod commands { ... }` block (currently lines 2–7), add `pub mod layout;` after `pub mod export;`:

```rust
pub mod commands {
    pub mod export;
    pub mod layout;
    pub mod projects;
    pub mod search;
    pub mod terminal;
}
```

- [ ] 7.5 Run it, expect PASS:
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml layout_flush -- --test-threads=1`
  Expected: `test result: ok. 2 passed`.

- [ ] 7.6 Commit:
  `git add apps/desktop/src-tauri/src/commands/layout.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tests/layout_flush.rs && git commit -m "feat(ws1): flush_canvas_layout_at — transactional layout flush with rollback and surfaced errors"`

---

## Task 8 — Register `flush_canvas_layout_command` in the Tauri handler

**Files:**
- Modify `apps/desktop/src-tauri/src/lib.rs` (add to `tauri::generate_handler![ ... ]`)
- Create `apps/desktop/src-tauri/tests/layout_command_registration.rs`

**Interfaces:**
- Consumes: `flush_canvas_layout_at`, `FlushCanvasLayoutRequest`, `NodeLayoutPayload`, `EdgeLayoutPayload`, `FlushCanvasLayoutResponse` (Task 7).
- Produces: a registered Tauri command `flush_canvas_layout_command` callable from the frontend via `invoke("flush_canvas_layout_command", { request })`.

> The Tauri command itself cannot be invoked from a plain integration test without a running app, so this task's test asserts the **public callable path** (`flush_canvas_layout_at`) is reachable through the `commands::layout` module surface that the command delegates to, and a manual checklist item confirms handler registration compiles.

Steps:

- [ ] 8.1 Write the failing test. Create `apps/desktop/src-tauri/tests/layout_command_registration.rs`:

```rust
use research_canvas_desktop_lib::commands::layout::{
    flush_canvas_layout_at, FlushCanvasLayoutRequest, FlushCanvasLayoutResponse,
};
use research_canvas_desktop_lib::db::{connection::Database, repositories::ProjectRepository};
use tempfile::tempdir;

#[test]
fn flush_canvas_layout_at_is_callable_and_returns_a_typed_response() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("reg.sqlite");
    let canvas_id = {
        let database = Database::open(&db_path).expect("open");
        let projects = ProjectRepository::new(database.connection());
        let project = projects
            .create(
                "WS1".to_string(),
                "ws1".to_string(),
                None,
                "/tmp/ws1".to_string(),
                None,
                None,
                serde_json::json!({}),
            )
            .expect("create project");
        project.primary_canvas_id.expect("canvas")
    };

    let response: FlushCanvasLayoutResponse = flush_canvas_layout_at(FlushCanvasLayoutRequest {
        database_path: db_path.to_string_lossy().to_string(),
        canvas_id,
        layouts: vec![],
        edges: vec![],
        viewport_json: r#"{"x":0,"y":0,"zoom":1}"#.to_string(),
        app_state_json: "{}".to_string(),
    })
    .expect("flush empty ok");

    assert_eq!(response.written_nodes, 0);
    assert_eq!(response.written_edges, 0);
}
```

- [ ] 8.2 Run it, expect PASS already at the library level (the function exists from Task 7), then confirm handler registration:
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml layout_command_registration -- --test-threads=1`
  Expected: `test result: ok. 1 passed`. (This guards the public surface; the next step adds the handler entry and we re-run the full build.)

- [ ] 8.3 Register the command. In `apps/desktop/src-tauri/src/lib.rs`, add this line to the `tauri::generate_handler![ ... ]` macro list, immediately after `commands::projects::persist_project_document_command,`:

```rust
            commands::layout::flush_canvas_layout_command,
```

- [ ] 8.4 Verify the whole crate (incl. the macro expansion) compiles and all Rust tests pass:
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1`
  Expected: build succeeds; `db_migrations`, `layout_repository`, `layout_flush`, `layout_command_registration`, and all pre-existing suites report `ok`.

- [ ] 8.5 Commit:
  `git add apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tests/layout_command_registration.rs && git commit -m "feat(ws1): register flush_canvas_layout_command in Tauri handler"`

---

## Task 9 — TypeScript contract types: `NodeLayout`, `EdgeLayout`

**Files:**
- Modify `packages/desktop-api/src/index.ts` (add exported interfaces near the existing interface block, before `interface WorkspaceTransport` on line 137)
- Create `packages/desktop-api/src/layout.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure TS types).
- Produces (WS0 §5.1 verbatim):
  - `export interface NodeLayout { graphNodeId; canvasId; positionX; positionY; width; height; style: { dotColour?; bgColour?; textColour?; thumbnail? } }`
  - `export interface EdgeLayout { id; canvasId; sourceGraphNodeId; targetGraphNodeId; relationKind; sourceHandleId?; targetHandleId?; style: { stroke?; width?; dashed? } }`
  - `export function nodeLayoutFromCanvasNode(node: CanvasNode): NodeLayout` — maps a current canvas store node to a layout row (uses `node.id` as `graphNodeId`, per the cross-workstream note above).
  - `export function edgeLayoutFromCanvasEdge(edge: CanvasEdge): EdgeLayout`

Steps:

- [ ] 9.1 Write the failing test. Create `packages/desktop-api/src/layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { nodeLayoutFromCanvasNode, edgeLayoutFromCanvasEdge } from "./index";
import type { CanvasEdge, CanvasNode } from "@research-canvas/schema";

const baseNode: CanvasNode = {
  id: "node-1",
  canvasId: "canvas-1",
  type: "note",
  title: "Hello",
  position: { x: 12, y: 34 },
  size: { width: 240, height: 160 },
  summary: "",
  content: "",
  tags: ["note"],
  dotColour: "#abc",
  createdAt: "2026-06-28T00:00:00Z",
  updatedAt: "2026-06-28T00:00:00Z",
} as unknown as CanvasNode;

const baseEdge: CanvasEdge = {
  id: "edge-1",
  canvasId: "canvas-1",
  sourceNodeId: "node-1",
  targetNodeId: "node-2",
  sourceHandleId: "node-1-right",
  targetHandleId: "node-2-left",
  relationKind: "supports",
  directionality: "forward",
  label: "supports",
  note: "",
  style: { stroke: "#f0b45a", width: 2, dashed: false },
  createdAt: "2026-06-28T00:00:00Z",
  updatedAt: "2026-06-28T00:00:00Z",
} as unknown as CanvasEdge;

describe("layout mappers", () => {
  it("maps a canvas node to a NodeLayout using node.id as graphNodeId", () => {
    const layout = nodeLayoutFromCanvasNode(baseNode);
    expect(layout.graphNodeId).toBe("node-1");
    expect(layout.canvasId).toBe("canvas-1");
    expect(layout.positionX).toBe(12);
    expect(layout.positionY).toBe(34);
    expect(layout.width).toBe(240);
    expect(layout.height).toBe(160);
    expect(layout.style.dotColour).toBe("#abc");
  });

  it("maps a canvas edge to an EdgeLayout", () => {
    const layout = edgeLayoutFromCanvasEdge(baseEdge);
    expect(layout.id).toBe("edge-1");
    expect(layout.sourceGraphNodeId).toBe("node-1");
    expect(layout.targetGraphNodeId).toBe("node-2");
    expect(layout.relationKind).toBe("supports");
    expect(layout.sourceHandleId).toBe("node-1-right");
    expect(layout.style.stroke).toBe("#f0b45a");
  });
});
```

- [ ] 9.2 Run it, expect FAIL:
  `pnpm vitest run packages/desktop-api/src/layout.test.ts`
  Expected failure: `nodeLayoutFromCanvasNode is not a function` / import has no exported member.

- [ ] 9.3 Add types and mappers. In `packages/desktop-api/src/index.ts`, ensure the import on lines 1–6 includes the node/edge types — it already imports `CanvasEdge` and `CanvasNode`. Add this block immediately before `interface WorkspaceTransport {` (line 137):

```ts
export interface NodeLayout {
  graphNodeId: string;
  canvasId: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  style: {
    dotColour?: string;
    bgColour?: string;
    textColour?: string;
    thumbnail?: string;
  };
}

export interface EdgeLayout {
  id: string;
  canvasId: string;
  sourceGraphNodeId: string;
  targetGraphNodeId: string;
  relationKind: string;
  sourceHandleId?: string;
  targetHandleId?: string;
  style: { stroke?: string; width?: number; dashed?: boolean };
}

export function nodeLayoutFromCanvasNode(node: CanvasNode): NodeLayout {
  return {
    graphNodeId: node.id,
    canvasId: node.canvasId,
    positionX: node.position.x,
    positionY: node.position.y,
    width: node.size.width,
    height: node.size.height,
    style: {
      dotColour: node.dotColour ?? undefined,
      bgColour: node.bgColour ?? undefined,
      textColour: node.textColour ?? undefined,
      thumbnail: node.thumbnail ?? undefined,
    },
  };
}

export function edgeLayoutFromCanvasEdge(edge: CanvasEdge): EdgeLayout {
  return {
    id: edge.id,
    canvasId: edge.canvasId,
    sourceGraphNodeId: edge.sourceNodeId,
    targetGraphNodeId: edge.targetNodeId,
    relationKind: edge.relationKind,
    sourceHandleId: edge.sourceHandleId ?? undefined,
    targetHandleId: edge.targetHandleId ?? undefined,
    style: {
      stroke: edge.style.stroke,
      width: edge.style.width,
      dashed: edge.style.dashed,
    },
  };
}
```

- [ ] 9.4 Run it, expect PASS:
  `pnpm vitest run packages/desktop-api/src/layout.test.ts`
  Expected: `1 passed (2 tests)`.

- [ ] 9.5 Commit:
  `git add packages/desktop-api/src/index.ts packages/desktop-api/src/layout.test.ts && git commit -m "feat(ws1): NodeLayout/EdgeLayout types + canvas-node/edge mappers"`

---

## Task 10 — `flushCanvasLayout` on `WorkspaceTransport` (Tauri + browser-bridge)

**Files:**
- Modify `packages/desktop-api/src/index.ts` (extend the `WorkspaceTransport` interface ~line 137–165, and both transport factories `createTauriWorkspaceTransport` ~line 195 and `createBrowserBridgeTransport` ~line 261)
- Modify `packages/desktop-api/src/layout.test.ts` (add a test for the request shape builder)

**Interfaces:**
- Consumes: `NodeLayout`, `EdgeLayout` (Task 9); the Tauri command name `flush_canvas_layout_command` (Task 8); `invokeTauri<T>` (existing, line 374).
- Produces (WS0 §5.2):
  - `WorkspaceTransport.flushCanvasLayout(input: { canvasId; layouts: NodeLayout[]; edges: EdgeLayout[]; viewport: { x; y; zoom }; appState: Record<string, unknown> }): boolean | Promise<boolean>`
  - `export function buildFlushRequest(input: { databasePath; canvasId; layouts; edges; viewport; appState }): FlushCanvasLayoutRequestPayload` — pure helper that serializes to the Rust command's `request` shape (snake-cased fields handled by serde `rename_all = "camelCase"`, so the helper outputs camelCase fields matching the Rust struct).
  - `export interface FlushCanvasLayoutRequestPayload` — the camelCase wire shape.

> The Rust struct (`FlushCanvasLayoutRequest`, Task 7) uses `#[serde(rename_all = "camelCase")]`, so the JS request object must use camelCase keys: `databasePath`, `canvasId`, `layouts`, `edges`, `viewportJson`, `appStateJson`. Each `NodeLayoutPayload` field is camelCased too (`graphNodeId`, `positionX`, ..., `styleJson`). The helper stringifies viewport+appState and each node's `style` into the `*_json` string fields the Rust side expects.

Steps:

- [ ] 10.1 Write the failing test. Append to `packages/desktop-api/src/layout.test.ts`:

```ts
import { buildFlushRequest } from "./index";

describe("buildFlushRequest", () => {
  it("serializes layouts, edges, viewport, and app-state into the Rust command shape", () => {
    const request = buildFlushRequest({
      databasePath: "/tmp/db.sqlite",
      canvasId: "canvas-1",
      layouts: [nodeLayoutFromCanvasNode(baseNode)],
      edges: [edgeLayoutFromCanvasEdge(baseEdge)],
      viewport: { x: 5, y: 6, zoom: 1.25 },
      appState: { panel: "open" },
    });

    expect(request.databasePath).toBe("/tmp/db.sqlite");
    expect(request.canvasId).toBe("canvas-1");
    expect(request.layouts).toHaveLength(1);
    expect(request.layouts[0].graphNodeId).toBe("node-1");
    expect(request.layouts[0].positionX).toBe(12);
    expect(request.layouts[0].styleJson).toBe(JSON.stringify({ dotColour: "#abc" }));
    expect(request.edges[0].id).toBe("edge-1");
    expect(request.edges[0].sourceGraphNodeId).toBe("node-1");
    expect(request.edges[0].styleJson).toBe(
      JSON.stringify({ stroke: "#f0b45a", width: 2, dashed: false }),
    );
    expect(request.viewportJson).toBe(JSON.stringify({ x: 5, y: 6, zoom: 1.25 }));
    expect(request.appStateJson).toBe(JSON.stringify({ panel: "open" }));
  });
});
```

  Note: `request.layouts[0].styleJson` expects `{ dotColour: "#abc" }` because the mapper (Task 9) drops `undefined` style fields; `JSON.stringify` omits `undefined` values, leaving only the set ones.

- [ ] 10.2 Run it, expect FAIL:
  `pnpm vitest run packages/desktop-api/src/layout.test.ts`
  Expected failure: `buildFlushRequest is not a function`.

- [ ] 10.3 Add the wire payload types, the builder, and the interface method. In `packages/desktop-api/src/index.ts`, add this block immediately after the `edgeLayoutFromCanvasEdge` function added in Task 9:

```ts
export interface NodeLayoutPayloadWire {
  graphNodeId: string;
  canvasId: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  styleJson: string;
}

export interface EdgeLayoutPayloadWire {
  id: string;
  canvasId: string;
  sourceGraphNodeId: string;
  targetGraphNodeId: string;
  relationKind: string;
  sourceHandleId: string | null;
  targetHandleId: string | null;
  styleJson: string;
}

export interface FlushCanvasLayoutRequestPayload {
  databasePath: string;
  canvasId: string;
  layouts: NodeLayoutPayloadWire[];
  edges: EdgeLayoutPayloadWire[];
  viewportJson: string;
  appStateJson: string;
}

export interface FlushCanvasLayoutInput {
  databasePath: string;
  canvasId: string;
  layouts: NodeLayout[];
  edges: EdgeLayout[];
  viewport: { x: number; y: number; zoom: number };
  appState: Record<string, unknown>;
}

export function buildFlushRequest(
  input: FlushCanvasLayoutInput
): FlushCanvasLayoutRequestPayload {
  return {
    databasePath: input.databasePath,
    canvasId: input.canvasId,
    layouts: input.layouts.map((layout) => ({
      graphNodeId: layout.graphNodeId,
      canvasId: layout.canvasId,
      positionX: layout.positionX,
      positionY: layout.positionY,
      width: layout.width,
      height: layout.height,
      styleJson: JSON.stringify(layout.style),
    })),
    edges: input.edges.map((edge) => ({
      id: edge.id,
      canvasId: edge.canvasId,
      sourceGraphNodeId: edge.sourceGraphNodeId,
      targetGraphNodeId: edge.targetGraphNodeId,
      relationKind: edge.relationKind,
      sourceHandleId: edge.sourceHandleId ?? null,
      targetHandleId: edge.targetHandleId ?? null,
      styleJson: JSON.stringify(edge.style),
    })),
    viewportJson: JSON.stringify(input.viewport),
    appStateJson: JSON.stringify(input.appState),
  };
}
```

  Then add this method to the `WorkspaceTransport` interface (inside the interface body, after `flushProjectDocument(...)` on line 155):

```ts
  flushCanvasLayout(input: {
    databasePath?: string;
    canvasId: string;
    layouts: NodeLayout[];
    edges: EdgeLayout[];
    viewport: { x: number; y: number; zoom: number };
    appState: Record<string, unknown>;
  }): boolean | Promise<boolean>;
```

> **Transport signature consistency (all layout methods).** Every layout-bearing method on `WorkspaceTransport` declares `databasePath?: string` (optional) in its TypeScript input type — `flushCanvasLayout`, and the WS2 layout methods (`upsertNodeLayout`, `upsertNodeLayouts`, `upsertEdgeLayout`, `upsertCanvasAppState`, `loadCanvasView`). The path is optional at the interface boundary because the active database path lives in the workspace context (the Tauri transport injects it from the bootstrapped project); callers do not have to thread it through. WS0 §5.2 lists `flushCanvasLayout` without a `databasePath` member at all; treating it as `databasePath?: string` is the reconciled form WS0, WS1, WS2, and WS7 all adopt so the interface is identical across plans.
>
> **CROSS-WORKSTREAM PIN (WS1 ⇄ WS2 ⇄ WS7).** This `flushCanvasLayout` input signature is pinned byte-for-byte:
>
> ```ts
> flushCanvasLayout(input: {
>   databasePath?: string;
>   canvasId: string;
>   layouts: NodeLayout[];
>   edges: EdgeLayout[];
>   viewport: { x: number; y: number; zoom: number };
>   appState: Record<string, unknown>;
> }): boolean | Promise<boolean>;
> ```
>
> WS2 (data layer / transport implementations) and WS7 (web/repo, read-only browser-bridge throw) MUST declare it character-for-character identically — same `databasePath?: string` optionality, same member order, same return type `boolean | Promise<boolean>`. Any change here is a contract change and must land in WS0 §5.2 first, then propagate to WS1/WS2/WS7 together.

- [ ] 10.4 Implement it in the Tauri transport. In `createTauriWorkspaceTransport` (object returned starting line 196), add this method after `flushProjectDocument` (which ends line 232). It surfaces errors via a flag: it returns `true` on success and re-throws via a rejected promise on failure (WS0 §5.3: WS1 changes flush to surface errors via a non-flush path; this transport awaits and the caller — Task 12 — reports the error to the UI):

```ts
    async flushCanvasLayout(input) {
      const databasePath = input.databasePath ?? activeDatabasePath;
      if (!databasePath) {
        throw new Error("flushCanvasLayout: no database path in input or context");
      }
      await invokeTauri<{ writtenNodes: number; writtenEdges: number }>(
        "flush_canvas_layout_command",
        {
          request: buildFlushRequest({
            databasePath,
            canvasId: input.canvasId,
            layouts: input.layouts,
            edges: input.edges,
            viewport: input.viewport,
            appState: input.appState,
          }),
        }
      );
      return true;
    },
```

> `activeDatabasePath` is the closed-over path the Tauri transport factory already tracks from the bootstrapped workspace (set in `bootstrapWorkspace`). It is referenced via closure, **not** `this` — `createTauriWorkspaceTransport` returns a plain object literal, so `this` does not reliably bind to the transport; the established factory pattern in this file resolves per-transport state through closure variables instead. If the factory does not yet keep such a variable, store the path the same way the existing methods obtain it (the bootstrapped project's `databasePath`) so this method has a closure-scoped fallback.

> **Required `database_path` on the Rust side — keep `databasePath` populated in the JS request object.** The interface member is now `databasePath?: string` (optional at the TypeScript boundary, see the pin above), but the Rust command `flush_canvas_layout_command` still takes a **required** `database_path` (it opens the SQLite connection from it; there is no default). `FlushCanvasLayoutInput` and `FlushCanvasLayoutRequestPayload` therefore keep `databasePath: string` **required** (non-optional) — `buildFlushRequest` always emits a non-empty `databasePath` in the wire payload. The Tauri transport resolves the value before building the request: it uses `input.databasePath` when the caller supplied it, otherwise the closure-tracked path from the bootstrapped workspace context, which is always present once a project is open. Net effect: the optional interface field never causes a missing `database_path` at the Rust boundary — the context always has the path, and the request object that crosses IPC always carries it.

- [ ] 10.5 Implement it in the browser-bridge transport (read-only web build, WS0 §5.3). In `createBrowserBridgeTransport` (object returned starting line 262), add this method after `flushProjectDocument` (which ends line 302). The web build does not edit theory/layout; this method throws synchronously per WS0 §5.3:

```ts
    flushCanvasLayout() {
      throw new Error("read-only web build");
    },
```

- [ ] 10.6 Run it, expect PASS:
  `pnpm vitest run packages/desktop-api/src/layout.test.ts`
  Expected: `1 passed (3 tests)`.

- [ ] 10.7 Type-check the package surface (no `tsc` errors from the new interface members):
  `pnpm exec tsc -b packages/desktop-api`
  Expected: exit code 0, no diagnostics.

- [ ] 10.8 Commit:
  `git add packages/desktop-api/src/index.ts packages/desktop-api/src/layout.test.ts && git commit -m "feat(ws1): flushCanvasLayout transport method (Tauri surfaces errors, web throws read-only)"`

---

## Task 11 — `serializeLayoutSnapshot` helper on the canvas package (one place that produces the flush input)

This isolates "turn the live store into a layout flush input" so the React context (Task 12) stays thin and the logic is unit-tested.

**Files:**
- Create `packages/canvas/src/state/layoutSnapshot.ts`
- Create `packages/canvas/src/state/layoutSnapshot.test.ts`

**Interfaces:**
- Consumes: `CanvasSnapshot` (from `canvasStore.ts`, line 5 — `{ edges: CanvasEdge[]; nodes: CanvasNode[] }`), `NodeLayout`, `EdgeLayout`, `nodeLayoutFromCanvasNode`, `edgeLayoutFromCanvasEdge` (Task 9, from `@research-canvas/desktop-api`).
- Produces:
  - `export interface LayoutSnapshot { layouts: NodeLayout[]; edges: EdgeLayout[] }`
  - `export function serializeLayoutSnapshot(snapshot: CanvasSnapshot): LayoutSnapshot`

> Dependency direction check: `packages/canvas` may import from `@research-canvas/desktop-api` only if that does not create a cycle. `desktop-api` imports from `@research-canvas/schema` (not from `canvas`), so `canvas → desktop-api → schema` is acyclic. This is allowed.

Steps:

- [ ] 11.1 Write the failing test. Create `packages/canvas/src/state/layoutSnapshot.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { serializeLayoutSnapshot } from "./layoutSnapshot";
import type { CanvasSnapshot } from "./canvasStore";
import type { CanvasEdge, CanvasNode } from "@research-canvas/schema";

const node: CanvasNode = {
  id: "n1",
  canvasId: "c1",
  type: "note",
  title: "T",
  position: { x: 1, y: 2 },
  size: { width: 240, height: 160 },
  summary: "",
  content: "",
  tags: ["note"],
  createdAt: "2026-06-28T00:00:00Z",
  updatedAt: "2026-06-28T00:00:00Z",
} as unknown as CanvasNode;

const edge: CanvasEdge = {
  id: "e1",
  canvasId: "c1",
  sourceNodeId: "n1",
  targetNodeId: "n2",
  relationKind: "supports",
  directionality: "forward",
  label: "supports",
  note: "",
  style: { stroke: "#f0b45a", width: 2, dashed: false },
  createdAt: "2026-06-28T00:00:00Z",
  updatedAt: "2026-06-28T00:00:00Z",
} as unknown as CanvasEdge;

describe("serializeLayoutSnapshot", () => {
  it("maps a canvas snapshot into layouts and edges", () => {
    const snapshot: CanvasSnapshot = { nodes: [node], edges: [edge] };
    const result = serializeLayoutSnapshot(snapshot);

    expect(result.layouts).toHaveLength(1);
    expect(result.layouts[0].graphNodeId).toBe("n1");
    expect(result.layouts[0].positionX).toBe(1);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].sourceGraphNodeId).toBe("n1");
    expect(result.edges[0].targetGraphNodeId).toBe("n2");
  });

  it("returns empty arrays for an empty snapshot", () => {
    const result = serializeLayoutSnapshot({ nodes: [], edges: [] });
    expect(result.layouts).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});
```

- [ ] 11.2 Run it, expect FAIL:
  `pnpm vitest run packages/canvas/src/state/layoutSnapshot.test.ts`
  Expected failure: cannot find module `./layoutSnapshot` / `serializeLayoutSnapshot is not a function`.

- [ ] 11.3 Create `packages/canvas/src/state/layoutSnapshot.ts`:

```ts
import {
  edgeLayoutFromCanvasEdge,
  nodeLayoutFromCanvasNode,
  type EdgeLayout,
  type NodeLayout,
} from "@research-canvas/desktop-api";

import type { CanvasSnapshot } from "./canvasStore";

export interface LayoutSnapshot {
  layouts: NodeLayout[];
  edges: EdgeLayout[];
}

export function serializeLayoutSnapshot(snapshot: CanvasSnapshot): LayoutSnapshot {
  return {
    layouts: snapshot.nodes.map(nodeLayoutFromCanvasNode),
    edges: snapshot.edges.map(edgeLayoutFromCanvasEdge),
  };
}
```

- [ ] 11.4 Run it, expect PASS:
  `pnpm vitest run packages/canvas/src/state/layoutSnapshot.test.ts`
  Expected: `1 passed (2 tests)`.

- [ ] 11.5 Commit:
  `git add packages/canvas/src/state/layoutSnapshot.ts packages/canvas/src/state/layoutSnapshot.test.ts && git commit -m "feat(ws1): serializeLayoutSnapshot helper (store → layout flush input)"`

---

## Task 12 — Switch `CanvasWorkspaceContext` autosave + unload flush to the incremental layout flush

This replaces the swallowing behavior. The debounced autosave and the `beforeunload`/`pagehide` flush now call `flushCanvasLayout`, and failures set `errorMessage` (surfaced) instead of being dropped.

**Files:**
- Modify `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`:
  - the debounced persist effect (lines 229–309)
  - the unload flush effect (lines 311–338)
  - add `serializeLayoutSnapshot` import and `captureViewportRef` usage

**Interfaces:**
- Consumes:
  - `transport.flushCanvasLayout(...)` (Task 10).
  - `serializeLayoutSnapshot(snapshot)` (Task 11) — imported from `@research-canvas/canvas`.
  - existing context internals: `stores.store.getState().serialize()` (returns `CanvasSnapshot`), `captureViewportRef.current()` (returns `Viewport = { x; y; zoom }`, line 130), `activeProject.primaryCanvasId`, `databasePath`, `setErrorMessage`.
- Produces: no new exported symbol; the behavioral contract is "drag/resize/viewport autosave via incremental flush; unload flush surfaces errors."

> `serializeLayoutSnapshot` must be re-exported from the canvas package barrel. Confirm/Add the export in step 12.1.

Steps:

- [ ] 12.1 Ensure the canvas barrel re-exports the helper. Open `packages/canvas/src/index.ts` and confirm there is a line exporting state helpers. If `serializeLayoutSnapshot` is not exported, add this line:

```ts
export { serializeLayoutSnapshot, type LayoutSnapshot } from "./state/layoutSnapshot";
```

  Run the canvas package tests to confirm the barrel still compiles:
  `pnpm vitest run packages/canvas/src/state/layoutSnapshot.test.ts`
  Expected: still `1 passed (2 tests)`.

- [ ] 12.2 Add the import in the context file. In `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`, change the canvas package import (lines 17–20) from:

```ts
import {
  createAnnotationStore,
  createCanvasStore,
} from "@research-canvas/canvas";
```

  to:

```ts
import {
  createAnnotationStore,
  createCanvasStore,
  serializeLayoutSnapshot,
} from "@research-canvas/canvas";
```

- [ ] 12.3 Replace the body of `persistLatest` inside the debounced effect. In the effect at lines 229–309, replace the entire `persistLatest` async function (lines 239–285) with this version, which flushes layout incrementally and surfaces failures (it keeps the queue/coalesce loop intact):

```ts
    const persistLatest = async () => {
      if (persistRunning) {
        persistQueued = true;
        return;
      }

      persistRunning = true;

      do {
        persistQueued = false;

        try {
          const snapshot = serializeLayoutSnapshot(stores.store.getState().serialize());
          const viewport = captureViewportRef.current();
          const result = await transport.flushCanvasLayout({
            databasePath,
            canvasId: activeProject.primaryCanvasId,
            layouts: snapshot.layouts,
            edges: snapshot.edges,
            viewport,
            appState: {},
          });

          if (cancelled) {
            return;
          }

          if (result === false) {
            setErrorMessage("failed to persist canvas layout");
          } else {
            setErrorMessage(null);
          }
        } catch (error) {
          if (cancelled) {
            return;
          }

          setErrorMessage(
            error instanceof Error
              ? error.message
              : typeof error === "string"
                ? error
                : "failed to persist canvas layout"
          );
        }
      } while (persistQueued && !cancelled);

      persistRunning = false;
    };
```

  > Annotations: this effect previously also persisted annotations via `persistProjectDocument`. Annotations remain persisted by the legacy path; keep the `unsubscribeAnnotations` subscription (line 299) so annotation edits still schedule a flush — but the flush now writes layout. Annotation persistence is explicitly out of WS1 scope (WS0 §3.2: annotations stay as-is) and is handled by WS2's data-layer cutover. To avoid losing annotation writes in the interim, ALSO keep a call to the legacy persist for annotations: add, immediately after the `setErrorMessage(null);` success branch above (inside the `try`, after the `if (result === false) ... else` block), this line:

```ts
          await transport.persistProjectDocument({
            annotations: stores.annotationStore.getState().serialize(),
            canvasId: activeProject.primaryCanvasId,
            databasePath,
            edges: [],
            nodes: [],
            projectId: activeProject.id,
          });
```

  > Rationale: passing empty `nodes`/`edges` to the legacy replace path would wipe `canvas_nodes`/`canvas_edges`. That is acceptable and intended for WS1 ONLY IF those tables are no longer the layout source — but in WS1 they still are (WS2 hasn't run). Therefore DO NOT pass empty arrays to the legacy path. Instead, for the interim, persist annotations through the legacy path WITH the real nodes/edges so nothing is wiped:

```ts
          await transport.persistProjectDocument({
            annotations: stores.annotationStore.getState().serialize(),
            canvasId: activeProject.primaryCanvasId,
            databasePath,
            edges: stores.store.getState().serialize().edges,
            nodes: stores.store.getState().serialize().nodes,
            projectId: activeProject.id,
          });
```

  Use this last form. (The new `node_layout`/`edge_layout` tables are written by `flushCanvasLayout`; the legacy tables continue to be written by `persistProjectDocument` until WS2 removes that call. This double-write is the safe interim state and is the explicit WS1↔WS2 seam.)

- [ ] 12.4 Replace the unload flush effect. Replace the effect at lines 311–338 with this version, which uses `flushCanvasLayout` and no longer silently drops errors (it logs them, since `beforeunload` cannot show UI):

```ts
  useEffect(() => {
    if (!isHydrated || !databasePath || !activeProject) {
      return;
    }

    const flushLatest = () => {
      const snapshot = serializeLayoutSnapshot(stores.store.getState().serialize());
      const viewport = captureViewportRef.current();
      const result = transport.flushCanvasLayout({
        databasePath,
        canvasId: activeProject.primaryCanvasId,
        layouts: snapshot.layouts,
        edges: snapshot.edges,
        viewport,
        appState: {},
      });
      if (result instanceof Promise) {
        result.catch((error: unknown) => {
          console.error("canvas layout flush failed on unload", error);
        });
      } else if (result === false) {
        console.error("canvas layout flush returned false on unload");
      }
    };

    window.addEventListener("beforeunload", flushLatest);
    window.addEventListener("pagehide", flushLatest);

    return () => {
      window.removeEventListener("beforeunload", flushLatest);
      window.removeEventListener("pagehide", flushLatest);
    };
  }, [activeProject, databasePath, isHydrated, stores, transport]);
```

- [ ] 12.5 Type-check the desktop app:
  `pnpm exec tsc -b apps/desktop`
  Expected: exit code 0. If `tsc -b apps/desktop` is not a configured project reference, run the workspace build instead: `pnpm exec tsc -b`. Expected: no diagnostics in `CanvasWorkspaceContext.tsx`.

- [ ] 12.6 Run the full frontend test suite to confirm no regressions:
  `pnpm vitest run`
  Expected: all suites pass, including `packages/desktop-api/src/layout.test.ts` and `packages/canvas/src/state/layoutSnapshot.test.ts`.

- [ ] 12.7 Commit:
  `git add apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx packages/canvas/src/index.ts && git commit -m "feat(ws1): autosave + unload flush use incremental layout flush; errors surfaced"`

---

## Task 13 — Integration test: round-trip via the layout flush + read-back path

A real end-to-end check at the Rust boundary: flush a layout, re-open the database, and confirm node positions, edges, and viewport survive — and that a second flush updates rather than duplicates (the bug class the original DELETE+INSERT papered over).

**Files:**
- Create `apps/desktop/src-tauri/tests/layout_roundtrip.rs`

**Interfaces:**
- Consumes: `flush_canvas_layout_at`, `FlushCanvasLayoutRequest`, `NodeLayoutPayload`, `EdgeLayoutPayload` (Task 7); `Database::open`, `LayoutRepository::{new, list_node_layout, list_edge_layout, get_app_state}` (Tasks 2,4,5); `ProjectRepository` (existing).
- Produces: no new symbol; an acceptance test tying WS1 to spec §5.1.

Steps:

- [ ] 13.1 Write the failing test. Create `apps/desktop/src-tauri/tests/layout_roundtrip.rs`:

```rust
use research_canvas_desktop_lib::commands::layout::{
    flush_canvas_layout_at, EdgeLayoutPayload, FlushCanvasLayoutRequest, NodeLayoutPayload,
};
use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{LayoutRepository, ProjectRepository},
};
use tempfile::tempdir;

fn node(id: &str, canvas_id: &str, x: f64, y: f64) -> NodeLayoutPayload {
    NodeLayoutPayload {
        graph_node_id: id.to_string(),
        canvas_id: canvas_id.to_string(),
        position_x: x,
        position_y: y,
        width: 240.0,
        height: 160.0,
        style_json: "{}".to_string(),
    }
}

#[test]
fn second_flush_updates_in_place_and_survives_reopen() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("roundtrip.sqlite");
    let canvas_id = {
        let database = Database::open(&db_path).expect("open");
        let projects = ProjectRepository::new(database.connection());
        projects
            .create(
                "WS1".to_string(),
                "ws1".to_string(),
                None,
                "/tmp/ws1".to_string(),
                None,
                None,
                serde_json::json!({}),
            )
            .expect("create project")
            .primary_canvas_id
            .expect("canvas")
    };

    // First flush: two nodes, one edge, viewport A.
    flush_canvas_layout_at(FlushCanvasLayoutRequest {
        database_path: db_path.to_string_lossy().to_string(),
        canvas_id: canvas_id.clone(),
        layouts: vec![node("n1", &canvas_id, 0.0, 0.0), node("n2", &canvas_id, 100.0, 0.0)],
        edges: vec![EdgeLayoutPayload {
            id: "e1".to_string(),
            canvas_id: canvas_id.clone(),
            source_graph_node_id: "n1".to_string(),
            target_graph_node_id: "n2".to_string(),
            relation_kind: "supports".to_string(),
            source_handle_id: None,
            target_handle_id: None,
            style_json: "{}".to_string(),
        }],
        viewport_json: r#"{"x":1,"y":1,"zoom":1}"#.to_string(),
        app_state_json: "{}".to_string(),
    })
    .expect("first flush");

    // Second flush: n1 dragged, viewport B, same edge (no duplication).
    flush_canvas_layout_at(FlushCanvasLayoutRequest {
        database_path: db_path.to_string_lossy().to_string(),
        canvas_id: canvas_id.clone(),
        layouts: vec![node("n1", &canvas_id, 500.0, 600.0), node("n2", &canvas_id, 100.0, 0.0)],
        edges: vec![EdgeLayoutPayload {
            id: "e1".to_string(),
            canvas_id: canvas_id.clone(),
            source_graph_node_id: "n1".to_string(),
            target_graph_node_id: "n2".to_string(),
            relation_kind: "supports".to_string(),
            source_handle_id: None,
            target_handle_id: None,
            style_json: "{}".to_string(),
        }],
        viewport_json: r#"{"x":9,"y":9,"zoom":2}"#.to_string(),
        app_state_json: "{}".to_string(),
    })
    .expect("second flush");

    // Reopen a fresh connection and verify durable state.
    let database = Database::open(&db_path).expect("reopen");
    let repo = LayoutRepository::new(database.connection());

    let nodes = repo.list_node_layout(&canvas_id).expect("nodes");
    assert_eq!(nodes.len(), 2, "no duplicate rows after second flush");
    let n1 = nodes.iter().find(|r| r.graph_node_id == "n1").expect("n1");
    assert_eq!(n1.position_x, 500.0);
    assert_eq!(n1.position_y, 600.0);

    let edges = repo.list_edge_layout(&canvas_id).expect("edges");
    assert_eq!(edges.len(), 1, "edge updated in place, not duplicated");

    let state = repo.get_app_state(&canvas_id).expect("state").expect("row");
    assert_eq!(state.viewport_json, r#"{"x":9,"y":9,"zoom":2}"#);
}
```

- [ ] 13.2 Run it, expect PASS (all building blocks exist from Tasks 1–7):
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml layout_roundtrip -- --test-threads=1`
  Expected: `test result: ok. 1 passed`.

- [ ] 13.3 Run the entire Rust suite once more to confirm nothing regressed:
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1`
  Expected: every suite `ok`.

- [ ] 13.4 Commit:
  `git add apps/desktop/src-tauri/tests/layout_roundtrip.rs && git commit -m "test(ws1): layout flush round-trip — update-in-place, no duplication, viewport durable"`

---

## Done When

- [ ] `apps/desktop/src-tauri/migrations/0008_layout_store.sql` exists, is registered in `MIGRATIONS`, and `cargo test ... db_migrations -- --test-threads=1` confirms `node_layout`, `edge_layout`, `canvas_app_state` exist and the migration count is 8.
- [ ] `LayoutRepository` provides `new`, `list_node_layout`, `upsert_node_layout`, `delete_node_layout`, `list_edge_layout`, `upsert_edge_layout`, `delete_edge_layout`, `get_app_state`, `upsert_app_state`, `upsert_node_layouts` (returns count), matching WS0 §4.3 signatures; `layout_repository` tests pass single-threaded.
- [ ] `flush_canvas_layout_at` writes nodes + edges + viewport in **one** `rusqlite` transaction; an FK violation mid-flush **rolls back everything** and returns `Err` (proved by `layout_flush::flush_canvas_layout_rolls_back_when_a_node_violates_the_canvas_foreign_key`).
- [ ] `flush_canvas_layout_command` is registered in `lib.rs` `generate_handler!` and the full crate compiles (`cargo test ... -- --test-threads=1` builds and passes).
- [ ] `WorkspaceTransport.flushCanvasLayout` exists; the Tauri implementation awaits the command and **surfaces errors** (rejects rather than returning `false` silently); the browser-bridge implementation **throws `read-only web build`** (WS0 §5.3).
- [ ] `CanvasWorkspaceContext.tsx` debounced autosave and the `beforeunload`/`pagehide` handler call `flushCanvasLayout`; persist failures set `errorMessage` (autosave) or are logged (unload) — the old `catch { return false }` swallow is gone.
- [ ] `serializeLayoutSnapshot`, `nodeLayoutFromCanvasNode`, `edgeLayoutFromCanvasEdge`, and `buildFlushRequest` are unit-tested; `pnpm vitest run` is green across `packages/desktop-api` and `packages/canvas`.
- [ ] Round-trip test proves a second flush **updates in place** (no duplicate rows) and that node positions, edges, and viewport survive a database reopen — i.e. the saving bug from spec §5.1 is fixed.
- [ ] No Neo4j code was added; WS1 touched only the SQLite layout store, the layout command, the transport, and the canvas context (decoupled from the migration, per spec §5.1 and decision §8.8).

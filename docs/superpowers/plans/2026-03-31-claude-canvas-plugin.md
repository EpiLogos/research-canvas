# Claude Canvas Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Claude Code control the Research Canvas app's canvas via MCP tools — creating nodes and edges live while the user watches — so Claude can build out episode movements from spec files.

**Architecture:** A `tiny_http` HTTP server (port 9876) runs inside the Tauri Rust process, exposing a REST API backed by the existing `CanvasGraphRepository`. A Node.js MCP server (`.claude/mcp-servers/research-canvas/`) wraps this API. After each write the Rust handler emits a Tauri `canvas:updated` event; the React frontend re-fetches and the canvas re-renders live. Two skills teach Claude the workflow.

**Tech Stack:** Rust (tiny_http already in Cargo.toml, rusqlite), TypeScript (MCP SDK `@modelcontextprotocol/sdk`, tsx), Tauri 2 events

---

## File Map

**Created:**
- `apps/desktop/src-tauri/migrations/0004_node_style_fields.sql`
- `apps/desktop/src-tauri/src/api/mod.rs`
- `apps/desktop/src-tauri/src/api/types.rs`
- `apps/desktop/src-tauri/src/api/handlers.rs`
- `.claude/mcp-servers/research-canvas/package.json`
- `.claude/mcp-servers/research-canvas/tsconfig.json`
- `.claude/mcp-servers/research-canvas/src/index.ts`
- `.claude/mcp-servers/research-canvas/src/client.ts`
- `.claude/mcp-servers/research-canvas/src/tools/canvas.ts`
- `.claude/mcp-servers/research-canvas/src/tools/edges.ts`
- `.claude/mcp-servers/research-canvas/src/tools/batch.ts`
- `.claude/skills/build-movement.md`
- `.claude/skills/canvas-api.md`
- `.claude/settings.json`

**Modified:**
- `apps/desktop/src-tauri/src/db/repositories/canvas.rs` — extend CanvasNodeRecord with style fields; add update_node, delete_node, delete_edge, create_group_node methods
- `apps/desktop/src-tauri/src/db/migrations.rs` — register migration 0004
- `apps/desktop/src-tauri/src/commands/projects.rs` — update bootstrap and load commands to set shared API state
- `apps/desktop/src-tauri/src/lib.rs` — add api module, ApiState, start HTTP server thread, register activate_canvas_command
- `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx` — listen for canvas:updated event + call activate_canvas on canvas load

---

## Task 1: DB migration + CanvasNodeRecord style fields

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0004_node_style_fields.sql`
- Modify: `apps/desktop/src-tauri/src/db/repositories/canvas.rs`
- Modify: `apps/desktop/src-tauri/src/db/migrations.rs`

The TypeScript schema already has `dotColour`, `bgColour`, `textColour`, `thumbnail` on nodes (added in the UI redesign) but they are not in the DB schema or the Rust `CanvasNodeRecord` struct. This task adds them.

- [ ] **Step 1: Write the failing Rust test**

Add to `apps/desktop/src-tauri/tests/canvas_repository.rs` (file already exists — append this test):

```rust
#[test]
fn style_fields_round_trip() {
    let dir = tempfile::tempdir().unwrap();
    let db = Database::open(dir.path().join("test.db")).unwrap();
    let conn = db.connection();

    // Seed a canvas
    let project_repo = ProjectRepository::new(conn);
    let project = project_repo
        .create("Test", "test", dir.path().to_str().unwrap())
        .unwrap();
    let canvas_repo = CanvasRepository::new(conn);
    let canvas = canvas_repo
        .create_for_project(&project.id, "Main", "graph", None, true)
        .unwrap();

    let graph_repo = CanvasGraphRepository::new(conn);
    let node = graph_repo
        .create_note_node(&canvas.id, "Title", "Content", 0.0, 0.0)
        .unwrap();

    // Initially style fields are None
    assert_eq!(node.dot_colour, None);
    assert_eq!(node.bg_colour, None);
    assert_eq!(node.text_colour, None);
    assert_eq!(node.thumbnail, None);

    // Update style
    graph_repo
        .update_node_style(&node.id, Some("#4a4aff"), Some("#0e0e22"), None, None)
        .unwrap();

    let updated = graph_repo.get_node_by_id_public(&node.id).unwrap().unwrap();
    assert_eq!(updated.dot_colour.as_deref(), Some("#4a4aff"));
    assert_eq!(updated.bg_colour.as_deref(), Some("#0e0e22"));
    assert_eq!(updated.text_colour, None);
}
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml style_fields_round_trip -- --test-threads=1
```

Expected: compile error — `dot_colour` field not found on `CanvasNodeRecord`.

- [ ] **Step 3: Create migration SQL**

Create `apps/desktop/src-tauri/migrations/0004_node_style_fields.sql`:

```sql
ALTER TABLE canvas_nodes ADD COLUMN dot_colour TEXT;
ALTER TABLE canvas_nodes ADD COLUMN bg_colour  TEXT;
ALTER TABLE canvas_nodes ADD COLUMN text_colour TEXT;
ALTER TABLE canvas_nodes ADD COLUMN thumbnail   TEXT;
```

- [ ] **Step 4: Register migration in migrations.rs**

In `apps/desktop/src-tauri/src/db/migrations.rs`, add to the `MIGRATIONS` array after the existing entries:

```rust
Migration {
    version: "0004_node_style_fields",
    sql: include_str!("../../migrations/0004_node_style_fields.sql"),
},
```

- [ ] **Step 5: Extend CanvasNodeRecord**

In `canvas.rs`, add four fields to `CanvasNodeRecord` after `target_canvas_id`:

```rust
pub dot_colour: Option<String>,
pub bg_colour: Option<String>,
pub text_colour: Option<String>,
pub thumbnail: Option<String>,
pub created_at: String,
pub updated_at: String,
```

- [ ] **Step 6: Update canvas_node_from_row and all SELECT queries**

Update the SELECT in `load_canvas_snapshot` and `get_node_by_id` to include the four new columns (append after `target_canvas_id`):

```sql
dot_colour,
bg_colour,
text_colour,
thumbnail,
```

Update `canvas_node_from_row` to read them (indices 22-25, after `target_canvas_id` at 21):

```rust
dot_colour: row.get(22)?,
bg_colour: row.get(23)?,
text_colour: row.get(24)?,
thumbnail: row.get(25)?,
created_at: row.get(26)?,
updated_at: row.get(27)?,
```

- [ ] **Step 7: Add update_node_style and make get_node_by_id pub**

Add to `impl<'conn> CanvasGraphRepository<'conn>`:

```rust
pub fn get_node_by_id_public(&self, node_id: &str) -> Result<Option<CanvasNodeRecord>> {
    self.get_node_by_id(node_id)
}

pub fn update_node_style(
    &self,
    node_id: &str,
    dot_colour: Option<&str>,
    bg_colour: Option<&str>,
    text_colour: Option<&str>,
    thumbnail: Option<&str>,
) -> Result<()> {
    let now = current_timestamp();
    self.connection.execute(
        "UPDATE canvas_nodes
         SET dot_colour  = COALESCE(?1, dot_colour),
             bg_colour   = COALESCE(?2, bg_colour),
             text_colour = COALESCE(?3, text_colour),
             thumbnail   = COALESCE(?4, thumbnail),
             updated_at  = ?5
         WHERE id = ?6",
        params![dot_colour, bg_colour, text_colour, thumbnail, now, node_id],
    )?;
    Ok(())
}
```

- [ ] **Step 8: Run test — expect PASS**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml style_fields_round_trip -- --test-threads=1
```

Expected: `test style_fields_round_trip ... ok`

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src-tauri/migrations/0004_node_style_fields.sql \
        apps/desktop/src-tauri/src/db/migrations.rs \
        apps/desktop/src-tauri/src/db/repositories/canvas.rs \
        apps/desktop/src-tauri/tests/canvas_repository.rs
git commit -m "feat(db): node style fields migration + CanvasNodeRecord style columns"
```

---

## Task 2: Repository additions — update, delete, group node

**Files:**
- Modify: `apps/desktop/src-tauri/src/db/repositories/canvas.rs`
- Test: `apps/desktop/src-tauri/tests/canvas_repository.rs`

The existing `CanvasGraphRepository` has `create_note_node`, `create_resource_node`, `connect_nodes`, `load_canvas_snapshot`. The HTTP API needs `update_node`, `delete_node`, `create_group_node`, `delete_edge`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/desktop/src-tauri/tests/canvas_repository.rs`:

```rust
fn make_test_canvas(dir: &tempfile::TempDir) -> (Database, String, String) {
    let db = Database::open(dir.path().join("test.db")).unwrap();
    {
        let conn = db.connection();
        let project_repo = ProjectRepository::new(conn);
        let project = project_repo
            .create("Test", "test", dir.path().to_str().unwrap())
            .unwrap();
        let canvas_repo = CanvasRepository::new(conn);
        let canvas = canvas_repo
            .create_for_project(&project.id, "Main", "graph", None, true)
            .unwrap();
        (db, project.id, canvas.id)
    }
}

#[test]
fn update_node_title_and_position() {
    let dir = tempfile::tempdir().unwrap();
    let (db, _pid, canvas_id) = make_test_canvas(&dir);
    let conn = db.connection();
    let graph = CanvasGraphRepository::new(conn);

    let node = graph.create_note_node(&canvas_id, "Old", "body", 0.0, 0.0).unwrap();
    graph.update_node(&node.id, Some("New Title"), None, Some(100.0), Some(200.0)).unwrap();

    let updated = graph.get_node_by_id_public(&node.id).unwrap().unwrap();
    assert_eq!(updated.title, "New Title");
    assert_eq!(updated.position_x, 100.0);
    assert_eq!(updated.position_y, 200.0);
}

#[test]
fn delete_node_removes_edges() {
    let dir = tempfile::tempdir().unwrap();
    let (db, _pid, canvas_id) = make_test_canvas(&dir);
    let conn = db.connection();
    let graph = CanvasGraphRepository::new(conn);

    let a = graph.create_note_node(&canvas_id, "A", "", 0.0, 0.0).unwrap();
    let b = graph.create_note_node(&canvas_id, "B", "", 100.0, 0.0).unwrap();
    let edge = graph.connect_nodes(&canvas_id, &a.id, &b.id, "reference").unwrap();

    graph.delete_node(&a.id).unwrap();

    let snap = graph.load_canvas_snapshot(&canvas_id).unwrap();
    assert!(!snap.nodes.iter().any(|n| n.id == a.id));
    assert!(!snap.edges.iter().any(|e| e.id == edge.id));
}

#[test]
fn delete_edge_by_id() {
    let dir = tempfile::tempdir().unwrap();
    let (db, _pid, canvas_id) = make_test_canvas(&dir);
    let conn = db.connection();
    let graph = CanvasGraphRepository::new(conn);

    let a = graph.create_note_node(&canvas_id, "A", "", 0.0, 0.0).unwrap();
    let b = graph.create_note_node(&canvas_id, "B", "", 100.0, 0.0).unwrap();
    let edge = graph.connect_nodes(&canvas_id, &a.id, &b.id, "reference").unwrap();

    graph.delete_edge(&edge.id).unwrap();

    let snap = graph.load_canvas_snapshot(&canvas_id).unwrap();
    assert!(snap.edges.is_empty());
}

#[test]
fn create_group_node() {
    let dir = tempfile::tempdir().unwrap();
    let (db, _pid, canvas_id) = make_test_canvas(&dir);
    let conn = db.connection();
    let graph = CanvasGraphRepository::new(conn);

    let node = graph.create_group_node(&canvas_id, "Movement 2", "#e67e22", 0.0, 0.0).unwrap();
    assert_eq!(node.node_type, "group");
    assert_eq!(node.color.as_deref(), Some("#e67e22"));
}
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
  update_node_title_and_position delete_node_removes_edges delete_edge_by_id create_group_node \
  -- --test-threads=1
```

Expected: compile error — `update_node`, `delete_node`, `delete_edge`, `create_group_node` not found.

- [ ] **Step 3: Add the methods to CanvasGraphRepository**

Add to `impl<'conn> CanvasGraphRepository<'conn>` in `canvas.rs`:

```rust
pub fn update_node(
    &self,
    node_id: &str,
    title: Option<&str>,
    content: Option<&str>,
    position_x: Option<f64>,
    position_y: Option<f64>,
) -> Result<()> {
    let now = current_timestamp();
    self.connection.execute(
        "UPDATE canvas_nodes
         SET title      = COALESCE(?1, title),
             content    = COALESCE(?2, content),
             position_x = COALESCE(?3, position_x),
             position_y = COALESCE(?4, position_y),
             updated_at = ?5
         WHERE id = ?6",
        params![title, content, position_x, position_y, now, node_id],
    )?;
    Ok(())
}

pub fn delete_node(&self, node_id: &str) -> Result<()> {
    // Delete attached edges first (foreign key cascade may not be set)
    self.connection.execute(
        "DELETE FROM canvas_edges WHERE source_node_id = ?1 OR target_node_id = ?1",
        [node_id],
    )?;
    self.connection
        .execute("DELETE FROM canvas_nodes WHERE id = ?1", [node_id])?;
    Ok(())
}

pub fn delete_edge(&self, edge_id: &str) -> Result<()> {
    self.connection
        .execute("DELETE FROM canvas_edges WHERE id = ?1", [edge_id])?;
    Ok(())
}

pub fn create_group_node(
    &self,
    canvas_id: &str,
    title: &str,
    color: &str,
    position_x: f64,
    position_y: f64,
) -> Result<CanvasNodeRecord> {
    let id = Uuid::new_v4().to_string();
    let now = current_timestamp();
    self.connection.execute(
        "INSERT INTO canvas_nodes (
            id, canvas_id, type, title, summary,
            position_x, position_y, width, height,
            color, child_node_ids, tags,
            created_at, updated_at
        ) VALUES (?1, ?2, 'group', ?3, ?4, ?5, ?6, ?7, ?8, ?9, '[]', '[]', ?10, ?10)",
        params![
            id, canvas_id, title, title,
            position_x, position_y, 300.0_f64, 200.0_f64,
            color, now
        ],
    )?;
    self.get_node_by_id(&id)?
        .ok_or(rusqlite::Error::QueryReturnedNoRows)
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
  update_node_title_and_position delete_node_removes_edges delete_edge_by_id create_group_node \
  -- --test-threads=1
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/db/repositories/canvas.rs \
        apps/desktop/src-tauri/tests/canvas_repository.rs
git commit -m "feat(db): add update_node, delete_node, delete_edge, create_group_node to CanvasGraphRepository"
```

---

## Task 3: API shared state + activate_canvas command

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/commands/projects.rs`

The HTTP server needs to know: (a) where the SQLite file is, (b) which canvas is active. We track this in `Arc<Mutex<ApiState>>` shared between the HTTP thread and the Tauri command handlers.

- [ ] **Step 1: Add ApiState to lib.rs**

In `apps/desktop/src-tauri/src/lib.rs`, add at the top:

```rust
pub mod api;
pub mod commands {
    pub mod export;
    pub mod projects;
    pub mod search;
    pub mod terminal;
}
pub mod db;
pub mod export;
pub mod fs;
pub mod pty;

use std::sync::{Arc, Mutex};

#[derive(Debug, Default, Clone)]
pub struct ApiState {
    pub db_path: Option<String>,
    pub active_project_id: Option<String>,
    pub active_canvas_id: Option<String>,
}

pub type SharedApiState = Arc<Mutex<ApiState>>;
```

- [ ] **Step 2: Add activate_canvas_command to projects.rs**

In `apps/desktop/src-tauri/src/commands/projects.rs`, add this import and command at the end of the file:

```rust
use crate::SharedApiState;

#[tauri::command]
pub fn activate_canvas_command(
    canvas_id: String,
    api_state: tauri::State<SharedApiState>,
) {
    let mut state = api_state.lock().unwrap();
    state.active_canvas_id = Some(canvas_id);
}
```

Also update `bootstrap_workspace_command` to record the `db_path` and `active_project_id`. Find where `bootstrap_workspace_command` is defined and add near the end of the function body, just before the return:

```rust
// Record db path and active project in shared API state
{
    let mut api = api_state.lock().unwrap();
    api.db_path = Some(db_path_str.clone());
    api.active_project_id = Some(active_project_id.clone());
}
```

You will need to add `api_state: tauri::State<SharedApiState>` to `bootstrap_workspace_command`'s parameters.

- [ ] **Step 3: Wire SharedApiState into lib.rs run()**

Replace the `pub fn run()` body in `lib.rs`:

```rust
pub fn run() {
    let api_state: SharedApiState = Arc::new(Mutex::new(ApiState::default()));
    let api_state_for_server = Arc::clone(&api_state);

    // Start HTTP API server on a background thread
    std::thread::spawn(move || {
        api::start_server(api_state_for_server);
    });

    tauri::Builder::default()
        .manage(pty::TerminalManager::new())
        .manage(api_state)
        .invoke_handler(tauri::generate_handler![
            commands::projects::bootstrap_workspace_command,
            commands::projects::attach_project_resource_root_command,
            commands::projects::detach_project_resource_root_command,
            commands::export::export_project_bundle_command,
            commands::export::resolve_publish_profile_command,
            commands::projects::load_project_document_command,
            commands::projects::list_project_resource_roots_command,
            commands::projects::persist_project_document_command,
            commands::search::rebuild_project_search_index_command,
            commands::search::search_project_command,
            commands::terminal::close_terminal_session,
            commands::terminal::create_terminal_session,
            commands::terminal::resize_terminal_session,
            commands::terminal::send_terminal_input,
            commands::projects::activate_canvas_command,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Research Canvas");
}
```

- [ ] **Step 4: Compile check (api module stub needed first)**

Create a stub `apps/desktop/src-tauri/src/api/mod.rs` so the project compiles:

```rust
use crate::SharedApiState;

pub fn start_server(_state: SharedApiState) {
    // TODO: implemented in Task 5
}
```

Then check:

```bash
cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml 2>&1 | grep "^error" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/lib.rs \
        apps/desktop/src-tauri/src/api/mod.rs \
        apps/desktop/src-tauri/src/commands/projects.rs
git commit -m "feat(api): SharedApiState, activate_canvas_command, HTTP server thread stub"
```

---

## Task 4: HTTP API types and handlers

**Files:**
- Create: `apps/desktop/src-tauri/src/api/types.rs`
- Create: `apps/desktop/src-tauri/src/api/handlers.rs`
- Modify: `apps/desktop/src-tauri/src/api/mod.rs`

- [ ] **Step 1: Create api/types.rs**

```rust
use serde::{Deserialize, Serialize};

// ─── Request types ────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateNodeRequest {
    pub node_type: String, // "note" | "group" | "resource"
    pub title: String,
    pub content: Option<String>,
    pub x: f64,
    pub y: f64,
    pub dot_colour: Option<String>,
    pub bg_colour: Option<String>,
    pub text_colour: Option<String>,
    // resource-specific (optional for note/group)
    pub absolute_path: Option<String>,
    pub relative_path: Option<String>,
    pub resource_kind: Option<String>,
    // group-specific
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateNodeRequest {
    pub title: Option<String>,
    pub content: Option<String>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub dot_colour: Option<String>,
    pub bg_colour: Option<String>,
    pub text_colour: Option<String>,
    pub thumbnail: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateEdgeRequest {
    pub source_id: String,
    pub target_id: String,
    pub label: Option<String>,
    pub directed: Option<bool>,  // default true
    pub style: Option<String>,   // "solid" | "dashed" | "dotted"
}

#[derive(Debug, Deserialize)]
pub struct BatchNodeItem {
    pub node_type: String,
    pub title: String,
    pub content: Option<String>,
    pub x: f64,
    pub y: f64,
    pub dot_colour: Option<String>,
    pub bg_colour: Option<String>,
    pub text_colour: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BatchEdgeItem {
    pub source_index: usize,
    pub target_index: usize,
    pub label: Option<String>,
    pub directed: Option<bool>,
    pub style: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BatchCreateRequest {
    pub nodes: Vec<BatchNodeItem>,
    pub edges: Vec<BatchEdgeItem>,
}

// ─── Response types ───────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct NodeResponse {
    pub id: String,
    pub canvas_id: String,
    pub node_type: String,
    pub title: String,
    pub content: Option<String>,
    pub x: f64,
    pub y: f64,
    pub dot_colour: Option<String>,
    pub bg_colour: Option<String>,
    pub text_colour: Option<String>,
    pub thumbnail: Option<String>,
    pub summary: String,
    pub resource_kind: Option<String>,
    pub absolute_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct EdgeResponse {
    pub id: String,
    pub canvas_id: String,
    pub source_id: String,
    pub target_id: String,
    pub label: String,
    pub relation_kind: String,
    pub directionality: String,
}

#[derive(Debug, Serialize)]
pub struct CanvasStateResponse {
    pub canvas_id: String,
    pub nodes: Vec<NodeResponse>,
    pub edges: Vec<EdgeResponse>,
}

#[derive(Debug, Serialize)]
pub struct BatchCreatedItem {
    pub index: usize,
    pub id: String,
}

#[derive(Debug, Serialize)]
pub struct BatchCreateResponse {
    pub nodes: Vec<BatchCreatedItem>,
    pub edges: Vec<BatchCreatedItem>,
}

#[derive(Debug, Serialize)]
pub struct OkResponse {
    pub ok: bool,
}

#[derive(Debug, Serialize)]
pub struct ApiError {
    pub ok: bool,
    pub error: String,
}

// ─── Conversion helpers ───────────────────────────────────

use crate::db::repositories::{CanvasEdgeRecord, CanvasNodeRecord};

impl From<CanvasNodeRecord> for NodeResponse {
    fn from(r: CanvasNodeRecord) -> Self {
        NodeResponse {
            id: r.id,
            canvas_id: r.canvas_id,
            node_type: r.node_type,
            title: r.title,
            content: r.content,
            x: r.position_x,
            y: r.position_y,
            dot_colour: r.dot_colour,
            bg_colour: r.bg_colour,
            text_colour: r.text_colour,
            thumbnail: r.thumbnail,
            summary: r.summary,
            resource_kind: r.resource_kind,
            absolute_path: r.absolute_path,
        }
    }
}

impl From<CanvasEdgeRecord> for EdgeResponse {
    fn from(r: CanvasEdgeRecord) -> Self {
        EdgeResponse {
            id: r.id,
            canvas_id: r.canvas_id,
            source_id: r.source_node_id,
            target_id: r.target_node_id,
            label: r.label,
            relation_kind: r.relation_kind,
            directionality: r.directionality,
        }
    }
}
```

- [ ] **Step 2: Create api/handlers.rs**

```rust
use crate::{
    api::types::*,
    db::{connection::Database, repositories::{CanvasGraphRepository, CanvasRepository}},
    SharedApiState,
};

fn open_db(state: &SharedApiState) -> Result<Database, String> {
    let db_path = state
        .lock()
        .unwrap()
        .db_path
        .clone()
        .ok_or_else(|| "App not bootstrapped yet".to_string())?;
    Database::open(&db_path).map_err(|e| e.to_string())
}

fn active_canvas_id(state: &SharedApiState) -> Result<String, String> {
    state
        .lock()
        .unwrap()
        .active_canvas_id
        .clone()
        .ok_or_else(|| "No active canvas — open a canvas in the app first".to_string())
}

/// GET /api/canvas
pub fn get_canvas(state: &SharedApiState) -> Result<CanvasStateResponse, String> {
    let canvas_id = active_canvas_id(state)?;
    let db = open_db(state)?;
    let conn = db.connection();
    let graph = CanvasGraphRepository::new(conn);
    let snapshot = graph.load_canvas_snapshot(&canvas_id).map_err(|e| e.to_string())?;
    Ok(CanvasStateResponse {
        canvas_id: canvas_id.clone(),
        nodes: snapshot.nodes.into_iter().map(NodeResponse::from).collect(),
        edges: snapshot.edges.into_iter().map(EdgeResponse::from).collect(),
    })
}

/// POST /api/nodes
pub fn create_node(req: CreateNodeRequest, state: &SharedApiState) -> Result<NodeResponse, String> {
    let canvas_id = active_canvas_id(state)?;
    let db = open_db(state)?;
    let conn = db.connection();
    let graph = CanvasGraphRepository::new(conn);

    let node = match req.node_type.as_str() {
        "note" => graph.create_note_node(
            &canvas_id,
            &req.title,
            req.content.as_deref().unwrap_or(""),
            req.x,
            req.y,
        ),
        "group" => graph.create_group_node(
            &canvas_id,
            &req.title,
            req.color.as_deref().unwrap_or("#e67e22"),
            req.x,
            req.y,
        ),
        "resource" => graph.create_resource_node(
            &canvas_id,
            &req.title,
            req.absolute_path.as_deref().unwrap_or(""),
            req.relative_path.as_deref().unwrap_or(""),
            req.resource_kind.as_deref().unwrap_or("binary"),
            "application/octet-stream",
            "",
            req.x,
            req.y,
        ),
        other => return Err(format!("Unknown node_type: {}", other)),
    }
    .map_err(|e| e.to_string())?;

    // Apply style fields if provided
    if req.dot_colour.is_some() || req.bg_colour.is_some() || req.text_colour.is_some() {
        graph
            .update_node_style(
                &node.id,
                req.dot_colour.as_deref(),
                req.bg_colour.as_deref(),
                req.text_colour.as_deref(),
                None,
            )
            .map_err(|e| e.to_string())?;
    }

    let final_node = graph
        .get_node_by_id_public(&node.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Node disappeared after create".to_string())?;

    Ok(NodeResponse::from(final_node))
}

/// PATCH /api/nodes/:id
pub fn update_node(
    node_id: String,
    req: UpdateNodeRequest,
    state: &SharedApiState,
) -> Result<OkResponse, String> {
    let db = open_db(state)?;
    let conn = db.connection();
    let graph = CanvasGraphRepository::new(conn);

    if req.title.is_some() || req.content.is_some() || req.x.is_some() || req.y.is_some() {
        graph
            .update_node(&node_id, req.title.as_deref(), req.content.as_deref(), req.x, req.y)
            .map_err(|e| e.to_string())?;
    }

    if req.dot_colour.is_some() || req.bg_colour.is_some() || req.text_colour.is_some() || req.thumbnail.is_some() {
        graph
            .update_node_style(
                &node_id,
                req.dot_colour.as_deref(),
                req.bg_colour.as_deref(),
                req.text_colour.as_deref(),
                req.thumbnail.as_deref(),
            )
            .map_err(|e| e.to_string())?;
    }

    Ok(OkResponse { ok: true })
}

/// DELETE /api/nodes/:id
pub fn delete_node(node_id: String, state: &SharedApiState) -> Result<OkResponse, String> {
    let db = open_db(state)?;
    let conn = db.connection();
    CanvasGraphRepository::new(conn)
        .delete_node(&node_id)
        .map_err(|e| e.to_string())?;
    Ok(OkResponse { ok: true })
}

/// POST /api/edges
pub fn create_edge(req: CreateEdgeRequest, state: &SharedApiState) -> Result<EdgeResponse, String> {
    let canvas_id = active_canvas_id(state)?;
    let db = open_db(state)?;
    let conn = db.connection();
    let label = req.label.as_deref().unwrap_or("reference");
    let edge = CanvasGraphRepository::new(conn)
        .connect_nodes(&canvas_id, &req.source_id, &req.target_id, label)
        .map_err(|e| e.to_string())?;
    Ok(EdgeResponse::from(edge))
}

/// DELETE /api/edges/:id
pub fn delete_edge(edge_id: String, state: &SharedApiState) -> Result<OkResponse, String> {
    let db = open_db(state)?;
    let conn = db.connection();
    CanvasGraphRepository::new(conn)
        .delete_edge(&edge_id)
        .map_err(|e| e.to_string())?;
    Ok(OkResponse { ok: true })
}

/// POST /api/batch
pub fn batch_create(
    req: BatchCreateRequest,
    state: &SharedApiState,
) -> Result<BatchCreateResponse, String> {
    let canvas_id = active_canvas_id(state)?;
    let db = open_db(state)?;
    let conn = db.connection();
    let graph = CanvasGraphRepository::new(conn);

    let mut created_node_ids: Vec<String> = Vec::new();
    let mut node_results: Vec<BatchCreatedItem> = Vec::new();

    for (i, node_req) in req.nodes.iter().enumerate() {
        let node = match node_req.node_type.as_str() {
            "note" => graph.create_note_node(
                &canvas_id,
                &node_req.title,
                node_req.content.as_deref().unwrap_or(""),
                node_req.x,
                node_req.y,
            ),
            "group" => graph.create_group_node(
                &canvas_id,
                &node_req.title,
                node_req.color.as_deref().unwrap_or("#e67e22"),
                node_req.x,
                node_req.y,
            ),
            other => return Err(format!("node[{}]: unknown node_type '{}'", i, other)),
        }
        .map_err(|e| format!("node[{}]: {}", i, e))?;

        if node_req.dot_colour.is_some() || node_req.bg_colour.is_some() || node_req.text_colour.is_some() {
            graph
                .update_node_style(
                    &node.id,
                    node_req.dot_colour.as_deref(),
                    node_req.bg_colour.as_deref(),
                    node_req.text_colour.as_deref(),
                    None,
                )
                .map_err(|e| format!("node[{}] style: {}", i, e))?;
        }

        created_node_ids.push(node.id.clone());
        node_results.push(BatchCreatedItem { index: i, id: node.id });
    }

    let mut edge_results: Vec<BatchCreatedItem> = Vec::new();
    for (i, edge_req) in req.edges.iter().enumerate() {
        let src = created_node_ids
            .get(edge_req.source_index)
            .ok_or_else(|| format!("edge[{}]: source_index {} out of range", i, edge_req.source_index))?;
        let tgt = created_node_ids
            .get(edge_req.target_index)
            .ok_or_else(|| format!("edge[{}]: target_index {} out of range", i, edge_req.target_index))?;
        let label = edge_req.label.as_deref().unwrap_or("reference");
        let edge = graph
            .connect_nodes(&canvas_id, src, tgt, label)
            .map_err(|e| format!("edge[{}]: {}", i, e))?;
        edge_results.push(BatchCreatedItem { index: i, id: edge.id });
    }

    Ok(BatchCreateResponse {
        nodes: node_results,
        edges: edge_results,
    })
}
```

- [ ] **Step 3: Update api/mod.rs to declare sub-modules**

```rust
pub mod handlers;
pub mod types;

use crate::SharedApiState;

pub fn start_server(_state: SharedApiState) {
    // TODO: implemented in Task 5
}
```

- [ ] **Step 4: Compile check**

```bash
cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml 2>&1 | grep "^error" | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/api/
git commit -m "feat(api): HTTP API types and handlers (get_canvas, node/edge CRUD, batch)"
```

---

## Task 5: HTTP server (tiny_http routing + Tauri event emit)

**Files:**
- Modify: `apps/desktop/src-tauri/src/api/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

`tiny_http` is already in `Cargo.toml`. The server listens on `127.0.0.1:9876`, parses method + path, dispatches to handlers, and emits `canvas:updated` after writes.

The server cannot emit Tauri events directly without an `AppHandle`. We pass the `AppHandle` to `start_server` via a channel — Tauri provides the handle in `setup()`.

- [ ] **Step 1: Update lib.rs to pass AppHandle to the HTTP server**

Replace `pub fn run()` in `lib.rs`:

```rust
pub fn run() {
    let api_state: SharedApiState = Arc::new(Mutex::new(ApiState::default()));
    let api_state_for_server = Arc::clone(&api_state);

    // Channel to pass AppHandle from Tauri setup into the HTTP server thread
    let (handle_tx, handle_rx) = std::sync::mpsc::channel::<tauri::AppHandle>();

    std::thread::spawn(move || {
        // Wait until Tauri is ready and we have the AppHandle
        let app_handle = handle_rx.recv().expect("app handle channel closed");
        api::start_server(api_state_for_server, app_handle);
    });

    tauri::Builder::default()
        .manage(pty::TerminalManager::new())
        .manage(api_state)
        .setup(move |app| {
            // Send the AppHandle to the HTTP server thread
            handle_tx.send(app.handle().clone()).ok();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::projects::bootstrap_workspace_command,
            commands::projects::attach_project_resource_root_command,
            commands::projects::detach_project_resource_root_command,
            commands::export::export_project_bundle_command,
            commands::export::resolve_publish_profile_command,
            commands::projects::load_project_document_command,
            commands::projects::list_project_resource_roots_command,
            commands::projects::persist_project_document_command,
            commands::search::rebuild_project_search_index_command,
            commands::search::search_project_command,
            commands::terminal::close_terminal_session,
            commands::terminal::create_terminal_session,
            commands::terminal::resize_terminal_session,
            commands::terminal::send_terminal_input,
            commands::projects::activate_canvas_command,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Research Canvas");
}
```

- [ ] **Step 2: Implement start_server in api/mod.rs**

Replace the stub in `apps/desktop/src-tauri/src/api/mod.rs`:

```rust
pub mod handlers;
pub mod types;

use crate::SharedApiState;
use serde_json::json;
use tauri::Emitter;
use tiny_http::{Method, Response, Server};

pub fn start_server(state: SharedApiState, app_handle: tauri::AppHandle) {
    let server = Server::http("127.0.0.1:9876")
        .expect("Failed to bind HTTP server on port 9876");

    for mut request in server.incoming_requests() {
        let method = request.method().clone();
        let url = request.url().to_string();

        // Read body for POST/PATCH
        let body: Option<String> = match method {
            Method::Post | Method::Patch => {
                let mut body = String::new();
                request.as_reader().read_to_string(&mut body).ok();
                Some(body)
            }
            _ => None,
        };

        let (status, json_body, mutates) = dispatch(&method, &url, body, &state);

        // Emit canvas:updated after mutations so the frontend re-fetches
        if mutates {
            let _ = app_handle.emit("canvas:updated", ());
        }

        let response = Response::from_string(json_body)
            .with_status_code(status)
            .with_header(
                tiny_http::Header::from_bytes(
                    &b"Content-Type"[..],
                    &b"application/json"[..],
                )
                .unwrap(),
            )
            .with_header(
                tiny_http::Header::from_bytes(
                    &b"Access-Control-Allow-Origin"[..],
                    &b"*"[..],
                )
                .unwrap(),
            );
        let _ = request.respond(response);
    }
}

fn dispatch(
    method: &Method,
    url: &str,
    body: Option<String>,
    state: &SharedApiState,
) -> (u32, String, bool) {
    // Strip query string
    let path = url.split('?').next().unwrap_or(url);

    // OPTIONS preflight
    if *method == Method::Other("OPTIONS".into()) {
        return (200, "{}".into(), false);
    }

    match (method, path) {
        // GET /api/canvas
        (Method::Get, "/api/canvas") => match handlers::get_canvas(state) {
            Ok(data) => (200, serde_json::to_string(&data).unwrap(), false),
            Err(e) => err(500, &e),
        },

        // POST /api/nodes
        (Method::Post, "/api/nodes") => {
            let Some(raw) = body else { return err(400, "missing body") };
            match serde_json::from_str(&raw) {
                Ok(req) => match handlers::create_node(req, state) {
                    Ok(data) => (201, serde_json::to_string(&data).unwrap(), true),
                    Err(e) => err(500, &e),
                },
                Err(e) => err(400, &e.to_string()),
            }
        }

        // PATCH /api/nodes/:id
        (Method::Patch, path) if path.starts_with("/api/nodes/") => {
            let node_id = path.trim_start_matches("/api/nodes/").to_string();
            if node_id.is_empty() { return err(400, "missing node id") }
            let Some(raw) = body else { return err(400, "missing body") };
            match serde_json::from_str(&raw) {
                Ok(req) => match handlers::update_node(node_id, req, state) {
                    Ok(data) => (200, serde_json::to_string(&data).unwrap(), true),
                    Err(e) => err(500, &e),
                },
                Err(e) => err(400, &e.to_string()),
            }
        }

        // DELETE /api/nodes/:id
        (Method::Delete, path) if path.starts_with("/api/nodes/") => {
            let node_id = path.trim_start_matches("/api/nodes/").to_string();
            if node_id.is_empty() { return err(400, "missing node id") }
            match handlers::delete_node(node_id, state) {
                Ok(data) => (200, serde_json::to_string(&data).unwrap(), true),
                Err(e) => err(500, &e),
            }
        }

        // POST /api/edges
        (Method::Post, "/api/edges") => {
            let Some(raw) = body else { return err(400, "missing body") };
            match serde_json::from_str(&raw) {
                Ok(req) => match handlers::create_edge(req, state) {
                    Ok(data) => (201, serde_json::to_string(&data).unwrap(), true),
                    Err(e) => err(500, &e),
                },
                Err(e) => err(400, &e.to_string()),
            }
        }

        // DELETE /api/edges/:id
        (Method::Delete, path) if path.starts_with("/api/edges/") => {
            let edge_id = path.trim_start_matches("/api/edges/").to_string();
            if edge_id.is_empty() { return err(400, "missing edge id") }
            match handlers::delete_edge(edge_id, state) {
                Ok(data) => (200, serde_json::to_string(&data).unwrap(), true),
                Err(e) => err(500, &e),
            }
        }

        // POST /api/batch
        (Method::Post, "/api/batch") => {
            let Some(raw) = body else { return err(400, "missing body") };
            match serde_json::from_str(&raw) {
                Ok(req) => match handlers::batch_create(req, state) {
                    Ok(data) => (201, serde_json::to_string(&data).unwrap(), true),
                    Err(e) => err(500, &e),
                },
                Err(e) => err(400, &e.to_string()),
            }
        }

        _ => err(404, "not found"),
    }
}

fn err(status: u32, msg: &str) -> (u32, String, bool) {
    (
        status,
        serde_json::json!({ "ok": false, "error": msg }).to_string(),
        false,
    )
}
```

- [ ] **Step 3: Add read_to_string import**

Add at the top of `api/mod.rs`:

```rust
use std::io::Read;
```

- [ ] **Step 4: Compile check**

```bash
cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml 2>&1 | grep "^error" | head -30
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test**

Build and run the app:
```bash
cd apps/desktop && pnpm tauri dev &
sleep 5
# Bootstrap (the app will do this on startup), then:
curl -s http://127.0.0.1:9876/api/canvas
```

Expected before activating a canvas: `{"ok":false,"error":"No active canvas — open a canvas in the app first"}`
Expected after opening the app and clicking a canvas: `{"canvas_id":"...","nodes":[...],"edges":[...]}`

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/api/ apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(api): tiny_http server on :9876 with canvas CRUD routes + Tauri event emit"
```

---

## Task 6: Frontend canvas:updated listener + activate_canvas wiring

**Files:**
- Modify: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`

When the Rust backend writes a node, it emits `canvas:updated`. The frontend must re-fetch the canvas snapshot. Also, whenever the user switches to a canvas the frontend must call `activate_canvas_command` so the Rust HTTP server knows which canvas to write to.

- [ ] **Step 1: Read CanvasWorkspaceContext.tsx**

Read the full file before editing. Focus on: where `load_project_document_command` is called (the canvas fetch logic), and the imports section.

- [ ] **Step 2: Add the canvas:updated listener**

In `CanvasWorkspaceContext.tsx`, find the `useEffect` that handles workspace initialisation. Add a Tauri event listener for `canvas:updated`:

Add import at top of file:
```ts
import { listen } from "@tauri-apps/api/event";
```

Inside `CanvasWorkspaceProvider`, find the place where `stores.store.getState().hydrate(snapshot)` is called (or wherever the canvas data is loaded into the store). Extract that canvas-loading logic into a `refreshCanvas` callback, then add:

```ts
// Re-fetch canvas when the Rust API server mutates it
useEffect(() => {
  let unlisten: (() => void) | undefined;
  listen("canvas:updated", () => {
    refreshCanvas();
  }).then((fn) => { unlisten = fn; });
  return () => { unlisten?.(); };
}, [refreshCanvas]);
```

Where `refreshCanvas` is a `useCallback` that loads the current canvas snapshot into the store:
```ts
const refreshCanvas = useCallback(async () => {
  if (!canvasId || canvasId === EMPTY_CANVAS_ID) return;
  try {
    const doc = await transport.loadProjectDocument(projectId);
    const canvas = doc.canvases.find((c: any) => c.id === canvasId);
    if (!canvas) return;
    stores.store.getState().hydrate({
      nodes: canvas.nodes ?? [],
      edges: canvas.edges ?? [],
    });
  } catch {
    // ignore refresh errors silently
  }
}, [canvasId, projectId, stores.store, transport]);
```

Adapt the variable names to match the actual code in the file.

- [ ] **Step 3: Call activate_canvas_command when canvas loads**

Find where the active canvas ID is set in the context (the `useState` setter for canvas ID, or wherever `hydrate` is called with a specific canvas). After setting the canvas, call:

```ts
import { invoke } from "@tauri-apps/api/core";

// After canvas is loaded:
invoke("activate_canvas_command", { canvasId: theCanvasId }).catch(() => {});
```

Add this wherever the active canvas changes — both on initial load and on canvas switches.

- [ ] **Step 4: Compile check**

```bash
pnpm exec tsc -b --noEmit 2>&1 | grep "CanvasWorkspaceContext" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx
git commit -m "feat(frontend): canvas:updated event listener + activate_canvas IPC call"
```

---

## Task 7: MCP server — scaffold, client, and all tools

**Files:**
- Create: `.claude/mcp-servers/research-canvas/package.json`
- Create: `.claude/mcp-servers/research-canvas/tsconfig.json`
- Create: `.claude/mcp-servers/research-canvas/src/client.ts`
- Create: `.claude/mcp-servers/research-canvas/src/tools/canvas.ts`
- Create: `.claude/mcp-servers/research-canvas/src/tools/edges.ts`
- Create: `.claude/mcp-servers/research-canvas/src/tools/batch.ts`
- Create: `.claude/mcp-servers/research-canvas/src/index.ts`

- [ ] **Step 1: Create package.json**

`.claude/mcp-servers/research-canvas/package.json`:
```json
{
  "name": "research-canvas-mcp",
  "version": "1.0.0",
  "type": "module",
  "description": "MCP server for Research Canvas app",
  "scripts": {
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

`.claude/mcp-servers/research-canvas/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Install dependencies**

```bash
cd ".claude/mcp-servers/research-canvas" && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 4: Create client.ts**

`.claude/mcp-servers/research-canvas/src/client.ts`:
```ts
const BASE = "http://127.0.0.1:9876";

export class CanvasApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "CanvasApiError";
  }
}

export async function apiCall<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new CanvasApiError(
      0,
      "Canvas app is not running. Start the app and open a canvas first.",
    );
  }

  const json = (await response.json()) as { ok?: boolean; error?: string } & T;

  if (!response.ok) {
    throw new CanvasApiError(
      response.status,
      (json as { error?: string }).error ?? `HTTP ${response.status}`,
    );
  }

  return json;
}
```

- [ ] **Step 5: Create tools/canvas.ts**

`.claude/mcp-servers/research-canvas/src/tools/canvas.ts`:
```ts
import { apiCall } from "../client.js";

export const canvasTools = [
  {
    name: "canvas_get_state",
    description:
      "Get the current canvas state: all nodes (id, type, title, content, position, style) and all edges. Call this first to understand what's already on the canvas.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
    async handler(_input: Record<string, never>) {
      return apiCall("GET", "/api/canvas");
    },
  },
  {
    name: "canvas_create_node",
    description:
      'Create a single node. nodeType: "note" (authored text), "group" (named container, amber), "resource" (file reference). For groups supply color (hex). For resources supply absolutePath and resourceKind.',
    inputSchema: {
      type: "object" as const,
      properties: {
        nodeType: {
          type: "string",
          enum: ["note", "group", "resource"],
          description: 'Node type: "note", "group", or "resource"',
        },
        title: { type: "string", description: "Node title (required)" },
        content: {
          type: "string",
          description: "Text content (note nodes only)",
        },
        x: { type: "number", description: "Canvas X position" },
        y: { type: "number", description: "Canvas Y position" },
        dotColour: {
          type: "string",
          description: "Hex colour for the node dot, e.g. #4a4aff",
        },
        bgColour: { type: "string", description: "Background hex colour" },
        textColour: { type: "string", description: "Text hex colour" },
        color: {
          type: "string",
          description: "Group node accent colour (group only)",
        },
        absolutePath: {
          type: "string",
          description: "Absolute file path (resource only)",
        },
        relativePath: {
          type: "string",
          description: "Relative file path (resource only)",
        },
        resourceKind: {
          type: "string",
          description:
            'Resource kind: "markdown", "image", "pdf", "text" (resource only)',
        },
      },
      required: ["nodeType", "title", "x", "y"],
    },
    async handler(input: {
      nodeType: string;
      title: string;
      content?: string;
      x: number;
      y: number;
      dotColour?: string;
      bgColour?: string;
      textColour?: string;
      color?: string;
      absolutePath?: string;
      relativePath?: string;
      resourceKind?: string;
    }) {
      return apiCall("POST", "/api/nodes", {
        node_type: input.nodeType,
        title: input.title,
        content: input.content,
        x: input.x,
        y: input.y,
        dot_colour: input.dotColour,
        bg_colour: input.bgColour,
        text_colour: input.textColour,
        color: input.color,
        absolute_path: input.absolutePath,
        relative_path: input.relativePath,
        resource_kind: input.resourceKind,
      });
    },
  },
  {
    name: "canvas_update_node",
    description:
      "Update a node's title, content, position, or style. Only provided fields are changed.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Node ID (from canvas_get_state)" },
        title: { type: "string" },
        content: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        dotColour: { type: "string" },
        bgColour: { type: "string" },
        textColour: { type: "string" },
        thumbnail: { type: "string" },
      },
      required: ["id"],
    },
    async handler(input: {
      id: string;
      title?: string;
      content?: string;
      x?: number;
      y?: number;
      dotColour?: string;
      bgColour?: string;
      textColour?: string;
      thumbnail?: string;
    }) {
      return apiCall("PATCH", `/api/nodes/${input.id}`, {
        title: input.title,
        content: input.content,
        x: input.x,
        y: input.y,
        dot_colour: input.dotColour,
        bg_colour: input.bgColour,
        text_colour: input.textColour,
        thumbnail: input.thumbnail,
      });
    },
  },
  {
    name: "canvas_delete_node",
    description: "Delete a node and all its connected edges.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Node ID to delete" },
      },
      required: ["id"],
    },
    async handler(input: { id: string }) {
      return apiCall("DELETE", `/api/nodes/${input.id}`);
    },
  },
];
```

- [ ] **Step 6: Create tools/edges.ts**

`.claude/mcp-servers/research-canvas/src/tools/edges.ts`:
```ts
import { apiCall } from "../client.js";

export const edgeTools = [
  {
    name: "canvas_create_edge",
    description:
      "Draw a connection between two nodes. label is also the relation_kind stored in the DB (e.g. \"reference\", \"supports\", \"source\"). directed defaults to true (arrow). style: \"solid\", \"dashed\", or \"dotted\".",
    inputSchema: {
      type: "object" as const,
      properties: {
        sourceId: {
          type: "string",
          description: "Source node ID (from canvas_get_state or canvas_create_node)",
        },
        targetId: { type: "string", description: "Target node ID" },
        label: {
          type: "string",
          description: 'Relation label, e.g. "reference", "source", "supports"',
        },
        directed: {
          type: "boolean",
          description: "True for arrow (default), false for undirected line",
        },
        style: {
          type: "string",
          enum: ["solid", "dashed", "dotted"],
          description: "Line style (default: solid)",
        },
      },
      required: ["sourceId", "targetId"],
    },
    async handler(input: {
      sourceId: string;
      targetId: string;
      label?: string;
      directed?: boolean;
      style?: string;
    }) {
      return apiCall("POST", "/api/edges", {
        source_id: input.sourceId,
        target_id: input.targetId,
        label: input.label,
        directed: input.directed,
        style: input.style,
      });
    },
  },
  {
    name: "canvas_delete_edge",
    description: "Remove a connection between nodes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Edge ID (from canvas_get_state)" },
      },
      required: ["id"],
    },
    async handler(input: { id: string }) {
      return apiCall("DELETE", `/api/edges/${input.id}`);
    },
  },
];
```

- [ ] **Step 7: Create tools/batch.ts**

`.claude/mcp-servers/research-canvas/src/tools/batch.ts`:
```ts
import { apiCall } from "../client.js";

export const batchTools = [
  {
    name: "canvas_batch_create",
    description:
      "Create many nodes and edges in a single call. Use this when building a full movement — it is much faster than individual calls. Nodes are created in order; edges reference them by index in the nodes array (0-based), so you do not need to know IDs upfront. Returns the created IDs mapped to their indices.",
    inputSchema: {
      type: "object" as const,
      properties: {
        nodes: {
          type: "array",
          description: "Ordered list of nodes to create",
          items: {
            type: "object",
            properties: {
              nodeType: {
                type: "string",
                enum: ["note", "group"],
                description: '"note" or "group"',
              },
              title: { type: "string" },
              content: {
                type: "string",
                description: "Text body (note only)",
              },
              x: { type: "number" },
              y: { type: "number" },
              dotColour: { type: "string" },
              bgColour: { type: "string" },
              textColour: { type: "string" },
              color: {
                type: "string",
                description: "Group accent colour (group only)",
              },
            },
            required: ["nodeType", "title", "x", "y"],
          },
        },
        edges: {
          type: "array",
          description:
            "Edges referencing nodes by their index in the nodes array above",
          items: {
            type: "object",
            properties: {
              sourceIndex: {
                type: "number",
                description: "Index of source node in the nodes array",
              },
              targetIndex: {
                type: "number",
                description: "Index of target node in the nodes array",
              },
              label: { type: "string" },
              directed: { type: "boolean" },
              style: {
                type: "string",
                enum: ["solid", "dashed", "dotted"],
              },
            },
            required: ["sourceIndex", "targetIndex"],
          },
        },
      },
      required: ["nodes", "edges"],
    },
    async handler(input: {
      nodes: Array<{
        nodeType: string;
        title: string;
        content?: string;
        x: number;
        y: number;
        dotColour?: string;
        bgColour?: string;
        textColour?: string;
        color?: string;
      }>;
      edges: Array<{
        sourceIndex: number;
        targetIndex: number;
        label?: string;
        directed?: boolean;
        style?: string;
      }>;
    }) {
      return apiCall("POST", "/api/batch", {
        nodes: input.nodes.map((n) => ({
          node_type: n.nodeType,
          title: n.title,
          content: n.content,
          x: n.x,
          y: n.y,
          dot_colour: n.dotColour,
          bg_colour: n.bgColour,
          text_colour: n.textColour,
          color: n.color,
        })),
        edges: input.edges.map((e) => ({
          source_index: e.sourceIndex,
          target_index: e.targetIndex,
          label: e.label,
          directed: e.directed,
          style: e.style,
        })),
      });
    },
  },
];
```

- [ ] **Step 8: Create index.ts**

`.claude/mcp-servers/research-canvas/src/index.ts`:
```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { canvasTools } from "./tools/canvas.js";
import { edgeTools } from "./tools/edges.js";
import { batchTools } from "./tools/batch.js";

const allTools = [...canvasTools, ...edgeTools, ...batchTools];

const server = new Server(
  { name: "research-canvas", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: allTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = allTools.find((t) => t.name === request.params.name);
  if (!tool) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
      isError: true,
    };
  }

  try {
    const result = await tool.handler(request.params.arguments as never);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 9: Type check**

```bash
cd ".claude/mcp-servers/research-canvas" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add .claude/mcp-servers/
git commit -m "feat(mcp): research-canvas MCP server with 7 tools (canvas CRUD + batch)"
```

---

## Task 8: Skills + Claude Code settings

**Files:**
- Create: `.claude/skills/build-movement.md`
- Create: `.claude/skills/canvas-api.md`
- Create: `.claude/settings.json`

- [ ] **Step 1: Create build-movement.md**

`.claude/skills/build-movement.md`:

```markdown
---
name: build-movement
description: Build a canvas representation of one episode movement from its spec markdown. Read the movement, plan the nodes, call canvas_batch_create to materialise it.
---

# Build Movement Skill

Use this skill when asked to "build movement N" from an episode spec file.

## Procedure

### 1. Read the movement spec

Use the Read tool to open the episode file (e.g. `episodes/ep-0.1/Episode_0_1_The_Naked_Face_v7.md`).

Find the target movement by its heading: `## MOVEMENT N:`. Extract all content until the next `##` heading.

### 2. Parse into node types

Map the movement content to nodes as follows:

| Source in markdown | Node type | Default dotColour |
|---|---|---|
| `## MOVEMENT N: TITLE` | `group` | `#e67e22` (amber) |
| `### Subsection heading` | `note` | `#4a4aff` (blue) |
| `- Bullet point` under a subsection | `note` | `#4a4aff` (blue) |
| `> Blockquote` (reading / quote) | `note` (purple) | `#9b59b6` |
| `### READ — "Title"` | `note` | `#9b59b6` |
| Image file referenced in content | `resource` | `#27ae60` (green) |

### 3. Plan positions (left-to-right flow)

Use this layout grid. All coordinates in canvas units (pixels).

- **Movement group node**: `x=0, y=0` — always index 0 in the batch
- **Subsection anchor nodes**: `x = 320 * subsectionIndex, y = 120`
- **Bullet children** of a subsection: `x = subsectionAnchor.x, y = 120 + (bulletIndex + 1) * 180`
- **Reading / quote nodes**: `x = subsectionAnchor.x, y = subsectionAnchor.y - 200` (above the anchor)

Keep X spacing at 320px between subsections, Y spacing at 180px between children.

### 4. Build the batch payload

Construct the `canvas_batch_create` call:

- `nodes[0]` is always the movement group node (`nodeType: "group"`, `color: "#e67e22"`)
- Subsection nodes follow
- Bullet/reading nodes follow their parent subsection
- Edges:
  - Group → each subsection anchor: `{ sourceIndex: 0, targetIndex: subsectionIdx, label: "contains" }`
  - Subsection → its bullets: `{ sourceIndex: subsectionIdx, targetIndex: bulletIdx, label: "detail" }`
  - Reading → its parent subsection: `{ sourceIndex: readingIdx, targetIndex: subsectionIdx, label: "source", style: "dashed" }`

### 5. Call canvas_batch_create

Call the tool once with the complete payload. Do not call canvas_create_node in a loop — use the batch.

### 6. Verify

Call `canvas_get_state` and confirm: `"Movement N built: X nodes, Y edges."`

Report: node count, edge count, list of subsection titles created.

## Example invocation

> "Build movement 2 from episodes/ep-0.1/Episode_0_1_The_Naked_Face_v7.md"

1. Read the file, extract Movement 2 content
2. Parse: 1 group node, N subsection anchors, M bullet notes, K reading quotes
3. Build positions
4. Call `canvas_batch_create` with all nodes + edges in one shot
5. Report result

## Node colour reference

| Role | Colour |
|---|---|
| Movement group | `#e67e22` |
| Concept / subsection | `#4a4aff` |
| Bullet detail | `#4a4aff` |
| Quote / reading | `#9b59b6` |
| Resource / image | `#27ae60` |
```

- [ ] **Step 2: Create canvas-api.md**

`.claude/skills/canvas-api.md`:

```markdown
---
name: canvas-api
description: Quick reference for all canvas MCP tools. Use when you need to look up an exact field name or understand what a tool returns.
---

# Canvas API Reference

All tools communicate with the Research Canvas app over `http://127.0.0.1:9876`. The app must be running and a canvas must be open.

## Tools

### canvas_get_state
Returns the full active canvas.
```json
{ "canvas_id": "uuid", "nodes": [...], "edges": [...] }
```
Node fields: `id, canvas_id, node_type, title, content, x, y, dot_colour, bg_colour, text_colour, thumbnail, summary, resource_kind, absolute_path`
Edge fields: `id, canvas_id, source_id, target_id, label, relation_kind, directionality`

### canvas_create_node
Required: `nodeType` ("note" | "group" | "resource"), `title`, `x`, `y`
Optional: `content`, `dotColour`, `bgColour`, `textColour`, `color` (group), `absolutePath`, `relativePath`, `resourceKind`
Returns: created node object.

### canvas_update_node
Required: `id`
Optional: `title`, `content`, `x`, `y`, `dotColour`, `bgColour`, `textColour`, `thumbnail`
Returns: `{ "ok": true }`

### canvas_delete_node
Required: `id`
Also deletes all connected edges.
Returns: `{ "ok": true }`

### canvas_create_edge
Required: `sourceId`, `targetId`
Optional: `label` (also used as relation_kind, default "reference"), `directed` (bool, default true), `style` ("solid" | "dashed" | "dotted")
Returns: created edge object.

### canvas_delete_edge
Required: `id`
Returns: `{ "ok": true }`

### canvas_batch_create
Required: `nodes` (array), `edges` (array — reference nodes by `sourceIndex`/`targetIndex`)
Returns: `{ "nodes": [{ "index": N, "id": "uuid" }...], "edges": [...] }`

## Node colours (convention)
| Role | Hex |
|---|---|
| Movement group | `#e67e22` |
| Concept / subsection | `#4a4aff` |
| Quote / reading | `#9b59b6` |
| Resource / image | `#27ae60` |

## Error format
```json
{ "ok": false, "error": "message" }
```
If you get "Canvas app is not running", start the app and open a canvas.
If you get "No active canvas", click on a canvas in the app.
```

- [ ] **Step 3: Create .claude/settings.json**

`.claude/settings.json`:
```json
{
  "mcpServers": {
    "research-canvas": {
      "command": "npx",
      "args": [
        "--yes",
        "tsx",
        ".claude/mcp-servers/research-canvas/src/index.ts"
      ],
      "cwd": "."
    }
  }
}
```

- [ ] **Step 4: Verify MCP server starts**

```bash
cd "/Users/admin/Documents/Antichrist Project"
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  npx tsx .claude/mcp-servers/research-canvas/src/index.ts 2>/dev/null
```

Expected: JSON response containing `canvas_get_state`, `canvas_create_node`, `canvas_update_node`, `canvas_delete_node`, `canvas_create_edge`, `canvas_delete_edge`, `canvas_batch_create`.

- [ ] **Step 5: End-to-end test with app running**

Start the app (`pnpm tauri dev`), open a canvas, then from a separate terminal:

```bash
curl -s http://127.0.0.1:9876/api/canvas | python3 -m json.tool | head -20
```

Expected: JSON with `canvas_id`, `nodes`, `edges` matching whatever is on the open canvas.

```bash
curl -s -X POST http://127.0.0.1:9876/api/nodes \
  -H "Content-Type: application/json" \
  -d '{"node_type":"note","title":"Test from curl","content":"hello","x":200,"y":200}'
```

Expected: node appears on the canvas in the app immediately (no refresh needed).

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/ .claude/settings.json
git commit -m "feat(plugin): build-movement + canvas-api skills, Claude Code MCP settings"
```

---

## Self-Review

**Spec coverage:**
- ✅ HTTP API server (port 9876, tiny_http) — Tasks 3-5
- ✅ GET /api/canvas, POST /api/nodes, PATCH /api/nodes/:id, DELETE /api/nodes/:id — Task 4-5
- ✅ POST /api/edges, DELETE /api/edges/:id — Task 4-5
- ✅ POST /api/batch — Task 4-5
- ✅ canvas:updated event → frontend re-renders — Task 5, 6
- ✅ activate_canvas_command — Task 3, 6
- ✅ MCP server with 7 tools — Task 7
- ✅ build-movement skill — Task 8
- ✅ canvas-api reference skill — Task 8
- ✅ .claude/settings.json registration — Task 8
- ✅ Style fields (dotColour etc.) in DB — Task 1

**Type consistency check:**
- `snake_case` is used in all Rust/HTTP request bodies (`dot_colour`, `bg_colour`, `source_id`)
- `camelCase` is used in all MCP tool inputs (`dotColour`, `bgColour`, `sourceId`)
- The MCP tools map camelCase → snake_case before calling `apiCall` ✓
- `create_note_node` parameters match Task 2 repository signatures ✓
- `BatchEdgeItem.source_index` / `target_index` match the Rust `dispatch` handler ✓

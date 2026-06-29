# Neo4j + Graphiti Data Layer (WS2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the theory substance over to a local Docker Neo4j (authored by Graphiti, read/written directly by the Rust app via bolt) while keeping SQLite for layout only, joined by `graph_node_id`. Stand up the Docker Neo4j service + env config, configure the Graphiti MCP for `gemini-2.5-flash` + `gemini-embedding-001`, define and enforce the graph entity/relationship schema and constraints, define the seed-target shape for psychoid/MEF/Archetype operators (leaving the import *script* as a clean deferred seam), build the async `GraphRepository` (Neo4j) and sync `LayoutRepository` (SQLite) repositories, add Tauri commands + the `:9876` internal HTTP layout routes, and extend the TypeScript `WorkspaceTransport` so the frontend reads graph substance and SQLite layout separately and joined. Neo4j is the source of truth for substance from the start (clean cutover).

**Architecture:** Two writers / one local Neo4j database over bolt. The Tauri desktop app (Rust) uses the `neo4rs` crate directly for fast CRUD + projection of theory nodes/relationships, and `rusqlite` for layout. The terminal agent authors theory through the external Graphiti MCP server (Python → `graphiti-core` → official Neo4j driver), which writes the *same* labels/properties/relationships the app reads. SQLite holds presentation only (position/size/style/viewport/app-state), each row keyed by the Neo4j node's app-minted `graph_node_id` (UUIDv4). The Rust repository layer performs the cross-store join (never SQL across the boundary) and re-exposes already-joined `JoinedCanvasNode`/`CanvasView` shapes to the frontend through `WorkspaceTransport`. A single shared `neo4rs::Graph` connection pool lives in Tauri managed state alongside `SharedApiState`. Tauri graph commands become `async fn`.

**Tech Stack:** Tauri v2; React 19 + Vite 7 + TypeScript 5.9; pnpm monorepo; XYFlow @xyflow/react v12.8.5; Zustand v5 vanilla stores; Rust with `rusqlite` 0.32 (bundled), `neo4rs` 0.8 (bolt driver), `tokio` 1 (rt-multi-thread, macros), `serde`/`serde_json`, `uuid` v4, `chrono`; Neo4j 5.26-community (Docker) with APOC; Graphiti (`graphiti-core`, external Python MCP) configured for Gemini Flash + Gemini embeddings.

## Global Constraints

- Tauri v2; React 19 + Vite 7 + TypeScript 5.9; pnpm monorepo; XYFlow @xyflow/react v12.8.5; Zustand v5 vanilla stores.
- Test-first (TDD) for every backend repository, frontend state model, and export behavior.
- Prefer REAL integration tests (real SQLite in temp dir, real Neo4j against an ephemeral/docker instance, real fixture filesystem) over mocks.
- ALWAYS run Rust tests with `--test-threads=1`.
- Keep file/folder/package names per the repo's existing conventions.

---

## Conventions & preconditions for this plan

- **Repo root** is the directory containing `apps/`, `packages/`, `docs/`, `CLAUDE.md`. All paths below are absolute-from-repo-root unless noted.
- **Rust crate root** is `apps/desktop/src-tauri/`. Its package name is `research-canvas-desktop`; its lib target is `research_canvas_desktop_lib` (used in integration tests as `use research_canvas_desktop_lib::...`).
- **Rust integration tests** live in `apps/desktop/src-tauri/tests/<name>.rs` and are run individually by name, e.g. `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml graph_repository -- --test-threads=1`.
- **Neo4j-backed tests** require a running Neo4j. They read connection config from env (`NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`). When `NEO4J_TEST_URI` is **unset**, every Neo4j-backed test **returns early (skips)** so the suite stays green on machines without Docker; CI/dev that wants real coverage sets `NEO4J_TEST_URI` (and the test uses an isolated label-prefix + cleanup). This satisfies "real Neo4j against an ephemeral instance" while keeping the default suite runnable.
- **Each test creates and tears down its own data** in Neo4j using a unique run id (UUID) baked into `graph_node_id`s, deleting them in a teardown so concurrent/serial runs do not collide. Rust tests still run `--test-threads=1`.
- **Dependency on WS1:** WS1 (saving) owns migration `0008_layout_store.sql` and the SQLite `LayoutRepository`. This plan **also requires** those artifacts. To keep WS2 standalone-buildable, WS2 creates `0008_layout_store.sql` and `LayoutRepository` **if WS1 has not yet landed them**; if WS1 already created identical files, WS2's tasks are no-ops (the files match the WS0 contract verbatim). Tasks 6–9 below note this explicitly.

---

## Task 1 — Docker Neo4j service + env config files (no code, infra seam)

**Files:**
- Create `docker-compose.yml` (repo root)
- Create `.env.example` (repo root)
- Modify `.gitignore` (repo root) — append `.env` ignore (append-only; if `.gitignore` does not exist, create it)

**Interfaces:**
- Consumes (WS0 §1.3, §1.4): env var names `NEO4J_URI` (default `bolt://127.0.0.1:7687`), `NEO4J_USER` (`neo4j`), `NEO4J_PASSWORD` (required), `NEO4J_DATABASE` (`neo4j`), `GOOGLE_API_KEY`, `GRAPHITI_LLM_MODEL` (`gemini-2.5-flash`), `GRAPHITI_EMBEDDER_MODEL` (`gemini-embedding-001`), `GRAPHITI_RERANKER_MODEL` (`gemini-2.5-flash-lite`); docker service `neo4j` on ports 7474/7687, image `neo4j:5.26-community`, APOC enabled.
- Produces: a runnable `docker compose up -d neo4j` Neo4j on `bolt://127.0.0.1:7687`; `.env.example` template consumed by Tasks 3, 14, and the Graphiti MCP (Task 15).

Steps:

1. - [ ] Create `docker-compose.yml` at repo root with exactly this content:

```yaml
services:
  neo4j:
    image: neo4j:5.26-community
    container_name: antichrist-neo4j
    ports:
      - "7474:7474"   # browser UI
      - "7687:7687"   # bolt
    environment:
      NEO4J_AUTH: "neo4j/${NEO4J_PASSWORD}"
      NEO4J_PLUGINS: '["apoc"]'
      NEO4J_dbms_security_procedures_unrestricted: "apoc.*"
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
volumes:
  neo4j_data:
  neo4j_logs:
```

2. - [ ] Create `.env.example` at repo root with exactly this content:

```dotenv
# Neo4j connection (used by the Tauri app via neo4rs and by the Graphiti MCP)
NEO4J_URI=bolt://127.0.0.1:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=
NEO4J_DATABASE=neo4j

# Graphiti MCP only (theory authoring agent)
GOOGLE_API_KEY=
GRAPHITI_LLM_MODEL=gemini-2.5-flash
GRAPHITI_EMBEDDER_MODEL=gemini-embedding-001
GRAPHITI_RERANKER_MODEL=gemini-2.5-flash-lite
```

3. - [ ] Append `.env` to `.gitignore` (create the file if absent). Run, expecting the line to appear:

```bash
grep -qxF '.env' "/Users/admin/Documents/Antichrist Project/.gitignore" || printf '\n.env\n' >> "/Users/admin/Documents/Antichrist Project/.gitignore"; grep -n '.env' "/Users/admin/Documents/Antichrist Project/.gitignore"
```

Expected output includes a line ending in `.env`.

4. - [ ] Create a working `.env` for local dev (NOT committed) so subsequent tasks can connect. Run:

```bash
cp "/Users/admin/Documents/Antichrist Project/.env.example" "/Users/admin/Documents/Antichrist Project/.env" && sed -i '' 's/^NEO4J_PASSWORD=$/NEO4J_PASSWORD=antichrist-dev-pw/' "/Users/admin/Documents/Antichrist Project/.env" && grep NEO4J_PASSWORD "/Users/admin/Documents/Antichrist Project/.env"
```

Expected output: `NEO4J_PASSWORD=antichrist-dev-pw`

5. - [ ] Start Neo4j and wait for it to accept bolt. Run:

```bash
cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && docker compose up -d neo4j && for i in $(seq 1 60); do if docker exec antichrist-neo4j cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "RETURN 1 AS ok;" >/dev/null 2>&1; then echo "neo4j-ready"; break; fi; sleep 2; done
```

Expected output ends with: `neo4j-ready`

6. - [ ] Commit:

```bash
cd "/Users/admin/Documents/Antichrist Project" && git add docker-compose.yml .env.example .gitignore && git commit -m "WS2: docker-compose Neo4j 5.26 + env config template

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2 — Add `neo4rs` + `tokio` Rust dependencies

**Files:**
- Modify `apps/desktop/src-tauri/Cargo.toml` (`[dependencies]` block, lines 17–27 today — append two deps)

**Interfaces:**
- Consumes (WS0 §1.2): `neo4rs = "0.8"`; `tokio = { version = "1", features = ["rt-multi-thread", "macros"] }`.
- Produces: `neo4rs` and `tokio` available to all later Rust tasks.

Steps:

1. - [ ] Write a failing compile check: create `apps/desktop/src-tauri/tests/neo4j_deps.rs` proving the crates are linkable:

```rust
// apps/desktop/src-tauri/tests/neo4j_deps.rs
#[test]
fn neo4rs_and_tokio_are_available() {
    // Compile-time proof the crates are linked; constructing a config does not connect.
    let _q = neo4rs::query("RETURN 1");
    let rt = tokio::runtime::Builder::new_current_thread()
        .build()
        .expect("tokio runtime");
    let two = rt.block_on(async { 1 + 1 });
    assert_eq!(two, 2);
}
```

2. - [ ] Run it, expect FAIL (crates not yet declared):

```bash
cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" neo4j_deps -- --test-threads=1
```

Expected: compilation error mentioning unresolved crate, e.g. `error[E0433]: failed to resolve: use of undeclared crate or module 'neo4rs'`.

3. - [ ] Add the dependencies. In `apps/desktop/src-tauri/Cargo.toml`, after the `chrono` line in `[dependencies]` (currently line 18), insert the two crates so the block reads (showing the surrounding context):

```toml
[dependencies]
chrono = { version = "0.4", default-features = false, features = ["clock"] }
neo4rs = "0.8"
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
dirs = "5"
```

4. - [ ] Run the test again, expect PASS:

```bash
cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" neo4j_deps -- --test-threads=1
```

Expected: `test neo4rs_and_tokio_are_available ... ok` and `test result: ok. 1 passed`.

5. - [ ] Commit:

```bash
cd "/Users/admin/Documents/Antichrist Project" && git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/tests/neo4j_deps.rs && git commit -m "WS2: add neo4rs + tokio deps

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3 — `Neo4jConfig::from_env` (connection config struct)

**Files:**
- Create `apps/desktop/src-tauri/src/db/neo4j/config.rs`
- Create `apps/desktop/src-tauri/src/db/neo4j/mod.rs` (config submodule only for now; `connect` added in Task 4)
- Modify `apps/desktop/src-tauri/src/db/mod.rs` (add `pub mod neo4j;`)
- Create `apps/desktop/src-tauri/tests/neo4j_config.rs`

**Interfaces:**
- Consumes (WS0 §1.3): env vars `NEO4J_URI` (default `bolt://127.0.0.1:7687`), `NEO4J_USER` (default `neo4j`), `NEO4J_PASSWORD` (required), `NEO4J_DATABASE` (default `neo4j`).
- Produces:
  ```rust
  // apps/desktop/src-tauri/src/db/neo4j/config.rs
  pub struct Neo4jConfig { pub uri: String, pub user: String, pub password: String, pub database: String }
  impl Neo4jConfig { pub fn from_env() -> Result<Self, String>; }
  ```

Steps:

1. - [ ] Write the failing test `apps/desktop/src-tauri/tests/neo4j_config.rs`:

```rust
// apps/desktop/src-tauri/tests/neo4j_config.rs
use research_canvas_desktop_lib::db::neo4j::config::Neo4jConfig;

#[test]
fn from_env_uses_defaults_and_requires_password() {
    std::env::set_var("NEO4J_PASSWORD", "pw-123");
    std::env::remove_var("NEO4J_URI");
    std::env::remove_var("NEO4J_USER");
    std::env::remove_var("NEO4J_DATABASE");

    let cfg = Neo4jConfig::from_env().expect("config from env");
    assert_eq!(cfg.uri, "bolt://127.0.0.1:7687");
    assert_eq!(cfg.user, "neo4j");
    assert_eq!(cfg.password, "pw-123");
    assert_eq!(cfg.database, "neo4j");
}

#[test]
fn from_env_errors_when_password_missing() {
    std::env::remove_var("NEO4J_PASSWORD");
    let err = Neo4jConfig::from_env().expect_err("missing password is an error");
    assert!(err.contains("NEO4J_PASSWORD"), "error mentions the missing var: {err}");
}
```

2. - [ ] Run it, expect FAIL (module does not exist):

```bash
cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" neo4j_config -- --test-threads=1
```

Expected: `error[E0432]: unresolved import 'research_canvas_desktop_lib::db::neo4j'`.

3. - [ ] Create `apps/desktop/src-tauri/src/db/neo4j/config.rs`:

```rust
// apps/desktop/src-tauri/src/db/neo4j/config.rs
pub struct Neo4jConfig {
    pub uri: String,
    pub user: String,
    pub password: String,
    pub database: String,
}

impl Neo4jConfig {
    pub fn from_env() -> Result<Self, String> {
        let uri = std::env::var("NEO4J_URI")
            .unwrap_or_else(|_| "bolt://127.0.0.1:7687".to_string());
        let user = std::env::var("NEO4J_USER").unwrap_or_else(|_| "neo4j".to_string());
        let password = std::env::var("NEO4J_PASSWORD")
            .map_err(|_| "NEO4J_PASSWORD is required (set it in .env)".to_string())?;
        let database = std::env::var("NEO4J_DATABASE").unwrap_or_else(|_| "neo4j".to_string());
        Ok(Self { uri, user, password, database })
    }
}
```

4. - [ ] Create `apps/desktop/src-tauri/src/db/neo4j/mod.rs`:

```rust
// apps/desktop/src-tauri/src/db/neo4j/mod.rs
pub mod config;
```

5. - [ ] Register the module. In `apps/desktop/src-tauri/src/db/mod.rs`, add `pub mod neo4j;` so the file reads:

```rust
pub mod connection;
pub mod migrations;
pub mod neo4j;
pub mod repositories;
mod transaction;
```

6. - [ ] Run the test, expect PASS:

```bash
cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" neo4j_config -- --test-threads=1
```

Expected: `test result: ok. 2 passed`.

7. - [ ] Commit:

```bash
cd "/Users/admin/Documents/Antichrist Project" && git add apps/desktop/src-tauri/src/db/neo4j/config.rs apps/desktop/src-tauri/src/db/neo4j/mod.rs apps/desktop/src-tauri/src/db/mod.rs apps/desktop/src-tauri/tests/neo4j_config.rs && git commit -m "WS2: Neo4jConfig::from_env with defaults + required password

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4 — `connect()` + `SharedGraph` (live bolt connection)

**Files:**
- Modify `apps/desktop/src-tauri/src/db/neo4j/mod.rs` (add `SharedGraph` + `connect`)
- Create `apps/desktop/src-tauri/tests/neo4j_connect.rs`
- Create `apps/desktop/src-tauri/tests/support/mod.rs` (shared test helper: env-gated skip + run-id)

**Interfaces:**
- Consumes: `Neo4jConfig` (Task 3); WS0 §1.3 type aliases.
- Produces:
  ```rust
  // apps/desktop/src-tauri/src/db/neo4j/mod.rs
  pub type SharedGraph = std::sync::Arc<neo4rs::Graph>;
  pub async fn connect(config: &Neo4jConfig) -> Result<SharedGraph, String>;
  ```
  and a reusable test helper `support::neo4j_test_graph()` returning `Option<(SharedGraph, String /*run_id*/, String /*database*/)>` used by Tasks 4,5,7,8,10,11,12.

Steps:

1. - [ ] Create the shared test support module `apps/desktop/src-tauri/tests/support/mod.rs`:

```rust
// apps/desktop/src-tauri/tests/support/mod.rs
use research_canvas_desktop_lib::db::neo4j::{self, config::Neo4jConfig, SharedGraph};

/// Returns a live graph + a unique run id (used to namespace test graph_node_ids)
/// + the database name, or None when NEO4J_TEST_URI is unset (test should skip).
pub fn neo4j_test_graph() -> Option<(SharedGraph, String, String)> {
    let uri = std::env::var("NEO4J_TEST_URI").ok()?;
    std::env::set_var("NEO4J_URI", &uri);
    if std::env::var("NEO4J_PASSWORD").is_err() {
        std::env::set_var("NEO4J_PASSWORD", "antichrist-dev-pw");
    }
    let config = Neo4jConfig::from_env().expect("config");
    let database = config.database.clone();
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio rt");
    let graph = rt.block_on(neo4j::connect(&config)).expect("connect to test neo4j");
    let run_id = uuid::Uuid::new_v4().to_string();
    Some((graph, run_id, database))
}

/// Block on a future using a fresh current-thread runtime (enable_all for bolt I/O).
pub fn block_on<F: std::future::Future>(fut: F) -> F::Output {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio rt")
        .block_on(fut)
}
```

2. - [ ] Write the failing test `apps/desktop/src-tauri/tests/neo4j_connect.rs`:

```rust
// apps/desktop/src-tauri/tests/neo4j_connect.rs
mod support;
use neo4rs::query;

#[test]
fn connect_runs_a_trivial_query() {
    let Some((graph, _run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let value: i64 = support::block_on(async {
        let mut rows = graph
            .execute_on(&database, query("RETURN 7 AS v"))
            .await
            .expect("execute");
        let row = rows.next().await.expect("row").expect("some row");
        row.get::<i64>("v").expect("v")
    });
    assert_eq!(value, 7);
}
```

3. - [ ] Run it, expect FAIL (`connect`/`SharedGraph` not defined):

```bash
cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" neo4j_connect -- --test-threads=1
```

Expected: `error[E0425]`/`E0432` referencing `connect` or `SharedGraph`.

4. - [ ] Implement `connect` + `SharedGraph` in `apps/desktop/src-tauri/src/db/neo4j/mod.rs`:

```rust
// apps/desktop/src-tauri/src/db/neo4j/mod.rs
pub mod config;

use config::Neo4jConfig;

pub type SharedGraph = std::sync::Arc<neo4rs::Graph>;

pub async fn connect(config: &Neo4jConfig) -> Result<SharedGraph, String> {
    let neo_config = neo4rs::ConfigBuilder::default()
        .uri(config.uri.clone())
        .user(config.user.clone())
        .password(config.password.clone())
        .db(config.database.clone())
        .build()
        .map_err(|e| format!("neo4j config build failed: {e}"))?;
    let graph = neo4rs::Graph::connect(neo_config)
        .await
        .map_err(|e| format!("neo4j connect failed: {e}"))?;
    Ok(std::sync::Arc::new(graph))
}
```

5. - [ ] Run the test, expect PASS (or a clean skip if `NEO4J_TEST_URI` unset). With Neo4j up from Task 1, run with the env set:

```bash
cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml neo4j_connect -- --test-threads=1 --nocapture
```

Expected: `test connect_runs_a_trivial_query ... ok`, `test result: ok. 1 passed`.

6. - [ ] Confirm the skip path also passes (no env):

```bash
cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" neo4j_connect -- --test-threads=1 --nocapture
```

Expected: prints `skipping: NEO4J_TEST_URI unset`, `test result: ok. 1 passed`.

7. - [ ] Commit:

```bash
cd "/Users/admin/Documents/Antichrist Project" && git add apps/desktop/src-tauri/src/db/neo4j/mod.rs apps/desktop/src-tauri/tests/neo4j_connect.rs apps/desktop/src-tauri/tests/support/mod.rs && git commit -m "WS2: neo4j connect() + SharedGraph + env-gated test support

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5 — Graph schema constraints + indexes (`ensure_schema`) skeleton repo

**Files:**
- Create `apps/desktop/src-tauri/src/db/repositories/graph.rs` (struct + `new` + `ensure_schema` only; CRUD added later tasks)
- Modify `apps/desktop/src-tauri/src/db/repositories/mod.rs` (export `graph` items)
- Create `apps/desktop/src-tauri/tests/graph_schema.rs`

**Interfaces:**
- Consumes: `SharedGraph` (Task 4); WS0 §2.4 constraint/index Cypher; WS0 §4.2 `GraphRepository::new(graph, database)` + `ensure_schema`.
- Produces:
  ```rust
  pub struct GraphRepository { /* graph, database */ }
  impl GraphRepository {
      pub fn new(graph: crate::db::neo4j::SharedGraph, database: String) -> Self;
      pub async fn ensure_schema(&self) -> Result<(), String>;
  }
  ```

Steps:

1. - [ ] Write the failing test `apps/desktop/src-tauri/tests/graph_schema.rs`:

```rust
// apps/desktop/src-tauri/tests/graph_schema.rs
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::repositories::graph::GraphRepository;

#[test]
fn ensure_schema_creates_unique_constraint_on_graph_node_id() {
    let Some((graph, _run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("ensure_schema");
    // ensure_schema is idempotent: a second pass must also succeed.
    support::block_on(repo.ensure_schema()).expect("ensure_schema twice");

    let has_constraint: bool = support::block_on(async {
        let mut rows = graph
            .execute_on(&database, query(
                "SHOW CONSTRAINTS YIELD name WHERE name = 'theory_node_id' RETURN count(*) AS c",
            ))
            .await
            .expect("show constraints");
        let row = rows.next().await.expect("row").expect("some");
        row.get::<i64>("c").expect("c") == 1
    });
    assert!(has_constraint, "theory_node_id constraint should exist");
}
```

2. - [ ] Run it, expect FAIL (`graph` module missing):

```bash
cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" graph_schema -- --test-threads=1
```

Expected: `error[E0432]: unresolved import 'research_canvas_desktop_lib::db::repositories::graph'`.

3. - [ ] Create `apps/desktop/src-tauri/src/db/repositories/graph.rs` with the struct + `ensure_schema`:

```rust
// apps/desktop/src-tauri/src/db/repositories/graph.rs
use neo4rs::query;

pub struct GraphRepository {
    graph: crate::db::neo4j::SharedGraph,
    database: String,
}

const SCHEMA_STATEMENTS: &[&str] = &[
    "CREATE CONSTRAINT theory_node_id IF NOT EXISTS \
     FOR (n:TheoryNode) REQUIRE n.graph_node_id IS UNIQUE",
    "CREATE CONSTRAINT operator_node_id IF NOT EXISTS \
     FOR (n:Operator) REQUIRE n.graph_node_id IS UNIQUE",
    "CREATE CONSTRAINT operator_coordinate IF NOT EXISTS \
     FOR (n:Operator) REQUIRE n.coordinate IS UNIQUE",
    "CREATE INDEX theory_node_title IF NOT EXISTS FOR (n:TheoryNode) ON (n.title)",
    "CREATE INDEX theory_node_is_temporal IF NOT EXISTS FOR (n:TheoryNode) ON (n.is_temporal)",
    "CREATE INDEX theory_node_valid_from IF NOT EXISTS FOR (n:TheoryNode) ON (n.valid_from)",
    "CREATE INDEX theory_node_coordinate IF NOT EXISTS FOR (n:TheoryNode) ON (n.coordinate)",
    "CREATE FULLTEXT INDEX theory_node_fulltext IF NOT EXISTS \
     FOR (n:TheoryNode) ON EACH [n.title, n.summary, n.archetypal_resonance]",
];

impl GraphRepository {
    pub fn new(graph: crate::db::neo4j::SharedGraph, database: String) -> Self {
        Self { graph, database }
    }

    pub async fn ensure_schema(&self) -> Result<(), String> {
        for stmt in SCHEMA_STATEMENTS {
            self.graph
                .run_on(&self.database, query(stmt))
                .await
                .map_err(|e| format!("ensure_schema failed on `{stmt}`: {e}"))?;
        }
        Ok(())
    }
}
```

4. - [ ] Export the module. In `apps/desktop/src-tauri/src/db/repositories/mod.rs`, add `pub mod graph;` after `pub mod canvas;`, and add the re-export line after the `canvas::{...}` block:

```rust
pub mod annotations;
pub mod canvas;
pub mod graph;
pub mod projects;
pub mod resource_roots;
pub mod saved_sequences;
pub mod search;
```
And after the existing `pub use canvas::{...};` block add:
```rust
pub use graph::GraphRepository;
```

5. - [ ] Run the test, expect PASS against live Neo4j:

```bash
cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml graph_schema -- --test-threads=1 --nocapture
```

Expected: `test ensure_schema_creates_unique_constraint_on_graph_node_id ... ok`.

6. - [ ] Commit:

```bash
cd "/Users/admin/Documents/Antichrist Project" && git add apps/desktop/src-tauri/src/db/repositories/graph.rs apps/desktop/src-tauri/src/db/repositories/mod.rs apps/desktop/src-tauri/tests/graph_schema.rs && git commit -m "WS2: GraphRepository::ensure_schema (constraints + indexes)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6 — Shared Rust graph types (`GraphNode`, `NewGraphNode`, `GraphNodePatch`, relationship + lighting types)

**Files:**
- Modify `apps/desktop/src-tauri/src/db/repositories/graph.rs` (add the type definitions at the top, above `GraphRepository`)
- Modify `apps/desktop/src-tauri/src/db/repositories/mod.rs` (re-export the new types)
- Create `apps/desktop/src-tauri/tests/graph_types.rs`

**Interfaces:**
- Consumes (WS0 §4.1): exact field sets for `GraphNode`, `GraphRelationship`, `NewGraphNode`, `GraphNodePatch`, `ArchetypalLightingResult`, `LitInstance`.
- Produces these structs (consumed by Tasks 7–13 and by the Tauri/HTTP/TS layers). All derive `serde(rename_all = "camelCase")` so JSON matches the WS0 §5.1 TypeScript shapes.

Steps:

1. - [ ] Write the failing test `apps/desktop/src-tauri/tests/graph_types.rs` (serde round-trip + camelCase keys):

```rust
// apps/desktop/src-tauri/tests/graph_types.rs
use research_canvas_desktop_lib::db::repositories::graph::{GraphNode, GraphNodePatch, NewGraphNode};

#[test]
fn graph_node_serializes_camel_case() {
    let node = GraphNode {
        graph_node_id: "id-1".into(),
        entity_type: "Figure".into(),
        title: "Cosimo".into(),
        body: "[]".into(),
        summary: "".into(),
        archetypal_resonance: None,
        coordinate: Some("#2".into()),
        source_coordinates: vec!["#2".into(), "L2".into()],
        is_temporal: true,
        valid_from: Some("1389".into()),
        valid_to: Some("1464".into()),
        temporal_precision: Some("year".into()),
        created_at: "2026-06-28T00:00:00Z".into(),
        updated_at: "2026-06-28T00:00:00Z".into(),
    };
    let json = serde_json::to_value(&node).expect("serialize");
    assert_eq!(json["graphNodeId"], "id-1");
    assert_eq!(json["entityType"], "Figure");
    assert_eq!(json["sourceCoordinates"][1], "L2");
    assert_eq!(json["isTemporal"], true);
    let back: GraphNode = serde_json::from_value(json).expect("deserialize");
    assert_eq!(back.graph_node_id, "id-1");
}

#[test]
fn new_graph_node_and_patch_defaults() {
    let new = NewGraphNode {
        entity_type: "Event".into(),
        title: "Banda genocide".into(),
        body: "[]".into(),
        coordinate: None,
        source_coordinates: vec![],
        is_temporal: true,
        valid_from: Some("1621".into()),
        valid_to: Some("1621".into()),
        temporal_precision: Some("year".into()),
    };
    assert_eq!(new.entity_type, "Event");
    let patch = GraphNodePatch::default();
    assert!(patch.title.is_none());
    // Some(None) clears coordinate; None leaves it unchanged.
    let clearing = GraphNodePatch { coordinate: Some(None), ..Default::default() };
    assert_eq!(clearing.coordinate, Some(None));
}
```

2. - [ ] Run it, expect FAIL (types missing):

```bash
cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" graph_types -- --test-threads=1
```

Expected: `error[E0432]` / `cannot find struct 'GraphNode'`.

3. - [ ] Add the type definitions to the **top** of `apps/desktop/src-tauri/src/db/repositories/graph.rs`, before `use neo4rs::query;` add the serde import, then the structs. Insert at the very top of the file:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub graph_node_id: String,
    pub entity_type: String,
    pub title: String,
    pub body: String,
    pub summary: String,
    pub archetypal_resonance: Option<String>,
    pub coordinate: Option<String>,
    pub source_coordinates: Vec<String>,
    pub is_temporal: bool,
    pub valid_from: Option<String>,
    pub valid_to: Option<String>,
    pub temporal_precision: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRelationship {
    pub id: String,
    pub rel_type: String,
    pub source_graph_node_id: String,
    pub target_graph_node_id: String,
    pub properties: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewGraphNode {
    pub entity_type: String,
    pub title: String,
    pub body: String,
    pub coordinate: Option<String>,
    pub source_coordinates: Vec<String>,
    pub is_temporal: bool,
    pub valid_from: Option<String>,
    pub valid_to: Option<String>,
    pub temporal_precision: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNodePatch {
    pub title: Option<String>,
    pub body: Option<String>,
    pub summary: Option<String>,
    pub archetypal_resonance: Option<String>,
    pub coordinate: Option<Option<String>>,
    pub source_coordinates: Option<Vec<String>>,
    pub is_temporal: Option<bool>,
    pub valid_from: Option<Option<String>>,
    pub valid_to: Option<Option<String>>,
    pub temporal_precision: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchetypalLightingResult {
    pub operator: GraphNode,
    pub instances: Vec<LitInstance>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LitInstance {
    pub node: GraphNode,
    pub rel_type: String,
    pub dominance: Option<String>,
}
```

4. - [ ] Re-export the types. In `apps/desktop/src-tauri/src/db/repositories/mod.rs`, replace `pub use graph::GraphRepository;` with:

```rust
pub use graph::{
    ArchetypalLightingResult, GraphNode, GraphNodePatch, GraphRelationship, GraphRepository,
    LitInstance, NewGraphNode,
};
```

5. - [ ] Run the test, expect PASS:

```bash
cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" graph_types -- --test-threads=1
```

Expected: `test result: ok. 2 passed`.

6. - [ ] Commit:

```bash
cd "/Users/admin/Documents/Antichrist Project" && git add apps/desktop/src-tauri/src/db/repositories/graph.rs apps/desktop/src-tauri/src/db/repositories/mod.rs apps/desktop/src-tauri/tests/graph_types.rs && git commit -m "WS2: shared Rust graph types (GraphNode/relationship/patch/lighting)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7 — `GraphRepository::create_node` + `get_node` (node write/read round-trip)

**Files:**
- Modify `apps/desktop/src-tauri/src/db/repositories/graph.rs` (add a private row-mapper + `create_node`, `get_node`)
- Create `apps/desktop/src-tauri/tests/graph_node_crud.rs`

**Interfaces:**
- Consumes (WS0 §2.2 properties, §4.2): `NewGraphNode`, `GraphNode`; node label rule (`:TheoryNode` + entity-type label); app-minted UUIDv4 `graph_node_id`; `created_at`/`updated_at` RFC3339.
- Produces:
  ```rust
  pub async fn create_node(&self, input: NewGraphNode) -> Result<GraphNode, String>;
  pub async fn get_node(&self, graph_node_id: &str) -> Result<Option<GraphNode>, String>;
  ```

Steps:

1. - [ ] Write the failing test `apps/desktop/src-tauri/tests/graph_node_crud.rs`:

```rust
// apps/desktop/src-tauri/tests/graph_node_crud.rs
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::repositories::graph::{GraphRepository, NewGraphNode};

#[test]
fn create_then_get_node_round_trips_substance_and_labels() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    let created = support::block_on(repo.create_node(NewGraphNode {
        entity_type: "Figure".into(),
        title: format!("Cosimo {run_id}"),
        body: "[]".into(),
        coordinate: Some("#2".into()),
        source_coordinates: vec!["#2".into(), "L2".into()],
        is_temporal: true,
        valid_from: Some("1389".into()),
        valid_to: Some("1464".into()),
        temporal_precision: Some("year".into()),
    }))
    .expect("create_node");

    assert!(!created.graph_node_id.is_empty());
    assert_eq!(created.entity_type, "Figure");
    assert_eq!(created.source_coordinates, vec!["#2".to_string(), "L2".to_string()]);
    assert_eq!(created.body, "[]");

    let fetched = support::block_on(repo.get_node(&created.graph_node_id))
        .expect("get_node")
        .expect("present");
    assert_eq!(fetched.title, format!("Cosimo {run_id}"));
    assert_eq!(fetched.is_temporal, true);

    // The node must carry BOTH :TheoryNode and the entity-type label.
    let label_count: i64 = support::block_on(async {
        let mut rows = graph
            .execute_on(&database, query(
                "MATCH (n:TheoryNode:Figure {graph_node_id: $id}) RETURN count(n) AS c",
            ).param("id", created.graph_node_id.clone()))
            .await
            .expect("labels query");
        rows.next().await.expect("row").expect("some").get::<i64>("c").expect("c")
    });
    assert_eq!(label_count, 1, "node carries :TheoryNode and :Figure");

    let missing = support::block_on(repo.get_node("does-not-exist")).expect("get missing");
    assert!(missing.is_none());

    // Teardown
    support::block_on(async {
        graph.run_on(&database, query(
            "MATCH (n {graph_node_id: $id}) DETACH DELETE n",
        ).param("id", created.graph_node_id.clone())).await.expect("cleanup");
    });
}
```

2. - [ ] Run it, expect FAIL (`create_node` missing):

```bash
cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml graph_node_crud -- --test-threads=1
```

Expected: `error[E0599]: no method named 'create_node'`.

3. - [ ] Add a row-mapper and the two methods to the `impl GraphRepository` block in `apps/desktop/src-tauri/src/db/repositories/graph.rs`. First add these free helpers just below the `SCHEMA_STATEMENTS` const:

```rust
fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

/// Build a GraphNode from a returned `n` node value plus its entity-type label.
fn node_from_neo(node: neo4rs::Node) -> Result<GraphNode, String> {
    let labels: Vec<String> = node.labels().iter().map(|s| s.to_string()).collect();
    let entity_type = labels
        .iter()
        .find(|l| l.as_str() != "TheoryNode" && l.as_str() != "Operator")
        .cloned()
        .unwrap_or_default();
    let source_coordinates: Vec<String> = node.get("source_coordinates").unwrap_or_default();
    Ok(GraphNode {
        graph_node_id: node.get("graph_node_id").map_err(|e| e.to_string())?,
        entity_type,
        title: node.get("title").unwrap_or_default(),
        body: node.get("body").unwrap_or_else(|_| "[]".to_string()),
        summary: node.get("summary").unwrap_or_default(),
        archetypal_resonance: node.get("archetypal_resonance").ok(),
        coordinate: node.get("coordinate").ok(),
        source_coordinates,
        is_temporal: node.get("is_temporal").unwrap_or(false),
        valid_from: node.get("valid_from").ok(),
        valid_to: node.get("valid_to").ok(),
        temporal_precision: node.get("temporal_precision").ok(),
        created_at: node.get("created_at").unwrap_or_default(),
        updated_at: node.get("updated_at").unwrap_or_default(),
    })
}
```

Then add the methods inside `impl GraphRepository`:

```rust
    pub async fn create_node(&self, input: NewGraphNode) -> Result<GraphNode, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_rfc3339();
        // Entity-type label is interpolated (validated against a known set) because
        // Cypher labels cannot be parameterized.
        let label = validate_entity_label(&input.entity_type)?;
        let cypher = format!(
            "CREATE (n:TheoryNode:{label} {{
                graph_node_id: $id, title: $title, body: $body, summary: '',
                coordinate: $coordinate, source_coordinates: $source_coordinates,
                is_temporal: $is_temporal, valid_from: $valid_from, valid_to: $valid_to,
                temporal_precision: $temporal_precision,
                created_at: $now, updated_at: $now
            }}) RETURN n"
        );
        let q = query(&cypher)
            .param("id", id.clone())
            .param("title", input.title)
            .param("body", input.body)
            .param("coordinate", input.coordinate)
            .param("source_coordinates", input.source_coordinates)
            .param("is_temporal", input.is_temporal)
            .param("valid_from", input.valid_from)
            .param("valid_to", input.valid_to)
            .param("temporal_precision", input.temporal_precision)
            .param("now", now);
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("create_node failed: {e}"))?;
        let row = rows
            .next()
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "create_node returned no row".to_string())?;
        let node: neo4rs::Node = row.get("n").map_err(|e| e.to_string())?;
        node_from_neo(node)
    }

    pub async fn get_node(&self, graph_node_id: &str) -> Result<Option<GraphNode>, String> {
        let q = query("MATCH (n:TheoryNode {graph_node_id: $id}) RETURN n")
            .param("id", graph_node_id.to_string());
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("get_node failed: {e}"))?;
        match rows.next().await.map_err(|e| e.to_string())? {
            Some(row) => {
                let node: neo4rs::Node = row.get("n").map_err(|e| e.to_string())?;
                Ok(Some(node_from_neo(node)?))
            }
            None => Ok(None),
        }
    }
```

And add the label validator as a free function below `node_from_neo`:

```rust
const ENTITY_LABELS: &[&str] = &[
    "Figure", "People", "Event", "Institution", "Source",
    "Place", "Work", "Archetype", "Dynamic", "PsychoidOperator",
];

fn validate_entity_label(entity_type: &str) -> Result<&str, String> {
    ENTITY_LABELS
        .iter()
        .find(|l| **l == entity_type)
        .copied()
        .ok_or_else(|| format!("unknown entity_type: {entity_type}"))
}
```

4. - [ ] Run the test, expect PASS:

```bash
cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml graph_node_crud -- --test-threads=1 --nocapture
```

Expected: `test create_then_get_node_round_trips_substance_and_labels ... ok`.

5. - [ ] Commit:

```bash
cd "/Users/admin/Documents/Antichrist Project" && git add apps/desktop/src-tauri/src/db/repositories/graph.rs apps/desktop/src-tauri/tests/graph_node_crud.rs && git commit -m "WS2: GraphRepository create_node + get_node

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8 — `GraphRepository::update_node` + `delete_node`

**Files:**
- Modify `apps/desktop/src-tauri/src/db/repositories/graph.rs` (add `update_node`, `delete_node`)
- Create `apps/desktop/src-tauri/tests/graph_node_update_delete.rs`

**Interfaces:**
- Consumes: `GraphNodePatch` (Task 6, WS0 §4.1) with `Option<Option<String>>` clear-semantics; `GraphNode`; `get_node` (Task 7).
- Produces:
  ```rust
  pub async fn update_node(&self, graph_node_id: &str, patch: GraphNodePatch) -> Result<GraphNode, String>;
  pub async fn delete_node(&self, graph_node_id: &str) -> Result<(), String>;
  ```

Steps:

1. - [ ] Write the failing test `apps/desktop/src-tauri/tests/graph_node_update_delete.rs`:

```rust
// apps/desktop/src-tauri/tests/graph_node_update_delete.rs
mod support;
use research_canvas_desktop_lib::db::repositories::graph::{
    GraphNodePatch, GraphRepository, NewGraphNode,
};

#[test]
fn update_node_applies_patch_and_clears_with_some_none() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph, database);
    support::block_on(repo.ensure_schema()).expect("schema");

    let created = support::block_on(repo.create_node(NewGraphNode {
        entity_type: "Dynamic".into(),
        title: format!("Monopoly {run_id}"),
        body: "[]".into(),
        coordinate: Some("#3".into()),
        source_coordinates: vec!["#3".into()],
        is_temporal: false,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
    }))
    .expect("create");

    let patched = support::block_on(repo.update_node(
        &created.graph_node_id,
        GraphNodePatch {
            title: Some(format!("Mono-poly {run_id}")),
            summary: Some("the spread of the one over the many".into()),
            coordinate: Some(None), // clear
            ..Default::default()
        },
    ))
    .expect("update");
    assert_eq!(patched.title, format!("Mono-poly {run_id}"));
    assert_eq!(patched.summary, "the spread of the one over the many");
    assert_eq!(patched.coordinate, None);

    support::block_on(repo.delete_node(&created.graph_node_id)).expect("delete");
    let after = support::block_on(repo.get_node(&created.graph_node_id)).expect("get");
    assert!(after.is_none(), "node deleted");
}
```

2. - [ ] Run it, expect FAIL:

```bash
cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml graph_node_update_delete -- --test-threads=1
```

Expected: `error[E0599]: no method named 'update_node'`.

3. - [ ] Add the methods to `impl GraphRepository` in `apps/desktop/src-tauri/src/db/repositories/graph.rs`. The patch builds a `SET` clause dynamically; `Option<Option<String>>` distinguishes "unchanged" (`None`) from "clear to null" (`Some(None)`):

```rust
    pub async fn update_node(
        &self,
        graph_node_id: &str,
        patch: GraphNodePatch,
    ) -> Result<GraphNode, String> {
        let mut sets: Vec<String> = vec!["n.updated_at = $now".to_string()];
        let mut q = query("") // placeholder, rebuilt below
            .param("id", graph_node_id.to_string())
            .param("now", now_rfc3339());

        if let Some(title) = patch.title {
            sets.push("n.title = $title".into());
            q = q.param("title", title);
        }
        if let Some(body) = patch.body {
            sets.push("n.body = $body".into());
            q = q.param("body", body);
        }
        if let Some(summary) = patch.summary {
            sets.push("n.summary = $summary".into());
            q = q.param("summary", summary);
        }
        if let Some(ar) = patch.archetypal_resonance {
            sets.push("n.archetypal_resonance = $archetypal_resonance".into());
            q = q.param("archetypal_resonance", ar);
        }
        if let Some(coordinate) = patch.coordinate {
            sets.push("n.coordinate = $coordinate".into());
            q = q.param("coordinate", coordinate); // Option<String> -> null when None
        }
        if let Some(sc) = patch.source_coordinates {
            sets.push("n.source_coordinates = $source_coordinates".into());
            q = q.param("source_coordinates", sc);
        }
        if let Some(is_temporal) = patch.is_temporal {
            sets.push("n.is_temporal = $is_temporal".into());
            q = q.param("is_temporal", is_temporal);
        }
        if let Some(valid_from) = patch.valid_from {
            sets.push("n.valid_from = $valid_from".into());
            q = q.param("valid_from", valid_from);
        }
        if let Some(valid_to) = patch.valid_to {
            sets.push("n.valid_to = $valid_to".into());
            q = q.param("valid_to", valid_to);
        }
        if let Some(tp) = patch.temporal_precision {
            sets.push("n.temporal_precision = $temporal_precision".into());
            q = q.param("temporal_precision", tp);
        }

        let cypher = format!(
            "MATCH (n:TheoryNode {{graph_node_id: $id}}) SET {} RETURN n",
            sets.join(", ")
        );
        let q = q.with_query(&cypher);
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("update_node failed: {e}"))?;
        let row = rows
            .next()
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("update_node: no node with id {graph_node_id}"))?;
        let node: neo4rs::Node = row.get("n").map_err(|e| e.to_string())?;
        node_from_neo(node)
    }

    pub async fn delete_node(&self, graph_node_id: &str) -> Result<(), String> {
        let q = query("MATCH (n:TheoryNode {graph_node_id: $id}) DETACH DELETE n")
            .param("id", graph_node_id.to_string());
        self.graph
            .run_on(&self.database, q)
            .await
            .map_err(|e| format!("delete_node failed: {e}"))?;
        Ok(())
    }
```

> Note: `neo4rs::Query` is built by `query(cypher)`. To support the dynamic-cypher pattern above, add this tiny helper extension at the bottom of the file (outside any `impl`), which rebuilds a query string while preserving params is **not** supported by `neo4rs`; instead replace the placeholder approach by constructing the query once with the final cypher. Implement `with_query` as a thin re-build that re-applies collected params. To keep this dependency-free, **replace** the placeholder approach: collect params into a `Vec` and build at the end. Use this concrete form instead of `with_query` — rewrite `update_node` to accumulate `(name, BoltType)` is verbose; the simplest correct approach is the two-pass below.

   Replace the body of `update_node` you just wrote with this final, compiling version that builds the cypher first, then the query:

```rust
    pub async fn update_node(
        &self,
        graph_node_id: &str,
        patch: GraphNodePatch,
    ) -> Result<GraphNode, String> {
        let mut sets: Vec<String> = vec!["n.updated_at = $now".to_string()];
        if patch.title.is_some() { sets.push("n.title = $title".into()); }
        if patch.body.is_some() { sets.push("n.body = $body".into()); }
        if patch.summary.is_some() { sets.push("n.summary = $summary".into()); }
        if patch.archetypal_resonance.is_some() { sets.push("n.archetypal_resonance = $archetypal_resonance".into()); }
        if patch.coordinate.is_some() { sets.push("n.coordinate = $coordinate".into()); }
        if patch.source_coordinates.is_some() { sets.push("n.source_coordinates = $source_coordinates".into()); }
        if patch.is_temporal.is_some() { sets.push("n.is_temporal = $is_temporal".into()); }
        if patch.valid_from.is_some() { sets.push("n.valid_from = $valid_from".into()); }
        if patch.valid_to.is_some() { sets.push("n.valid_to = $valid_to".into()); }
        if patch.temporal_precision.is_some() { sets.push("n.temporal_precision = $temporal_precision".into()); }

        let cypher = format!(
            "MATCH (n:TheoryNode {{graph_node_id: $id}}) SET {} RETURN n",
            sets.join(", ")
        );
        let mut q = query(&cypher)
            .param("id", graph_node_id.to_string())
            .param("now", now_rfc3339());
        if let Some(v) = patch.title { q = q.param("title", v); }
        if let Some(v) = patch.body { q = q.param("body", v); }
        if let Some(v) = patch.summary { q = q.param("summary", v); }
        if let Some(v) = patch.archetypal_resonance { q = q.param("archetypal_resonance", v); }
        if let Some(v) = patch.coordinate { q = q.param("coordinate", v); }
        if let Some(v) = patch.source_coordinates { q = q.param("source_coordinates", v); }
        if let Some(v) = patch.is_temporal { q = q.param("is_temporal", v); }
        if let Some(v) = patch.valid_from { q = q.param("valid_from", v); }
        if let Some(v) = patch.valid_to { q = q.param("valid_to", v); }
        if let Some(v) = patch.temporal_precision { q = q.param("temporal_precision", v); }

        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("update_node failed: {e}"))?;
        let row = rows
            .next()
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("update_node: no node with id {graph_node_id}"))?;
        let node: neo4rs::Node = row.get("n").map_err(|e| e.to_string())?;
        node_from_neo(node)
    }
```

   (Delete the first draft of `update_node` so only this final version remains; keep `delete_node` as written.)

4. - [ ] Run the test, expect PASS:

```bash
cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml graph_node_update_delete -- --test-threads=1 --nocapture
```

Expected: `test update_node_applies_patch_and_clears_with_some_none ... ok`.

5. - [ ] Commit:

```bash
cd "/Users/admin/Documents/Antichrist Project" && git add apps/desktop/src-tauri/src/db/repositories/graph.rs apps/desktop/src-tauri/tests/graph_node_update_delete.rs && git commit -m "WS2: GraphRepository update_node (patch clear-semantics) + delete_node

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9 — `list_nodes_for_lens` + `get_nodes` (lens filter + batch fetch for the join)

**Files:**
- Modify `apps/desktop/src-tauri/src/db/repositories/graph.rs` (add `list_nodes_for_lens`, `get_nodes`)
- Create `apps/desktop/src-tauri/tests/graph_list_nodes.rs`

**Interfaces:**
- Consumes (WS0 §4.2, §8.1): lens discriminator `"canvas"` (all) | `"timeline"` (`is_temporal == true`); `GraphNode`.
- Produces:
  ```rust
  pub async fn list_nodes_for_lens(&self, lens: &str) -> Result<Vec<GraphNode>, String>;
  pub async fn get_nodes(&self, ids: &[String]) -> Result<Vec<GraphNode>, String>;
  ```
- Consumed by: Task 13 (`load_canvas_view` join), WS5 (timeline), WS7 (export).

Steps:

1. - [ ] Write the failing test `apps/desktop/src-tauri/tests/graph_list_nodes.rs`:

```rust
// apps/desktop/src-tauri/tests/graph_list_nodes.rs
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::repositories::graph::{GraphRepository, NewGraphNode};

#[test]
fn timeline_lens_returns_only_temporal_nodes() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    let event = support::block_on(repo.create_node(NewGraphNode {
        entity_type: "Event".into(),
        title: format!("Banda {run_id}"),
        body: "[]".into(),
        coordinate: None,
        source_coordinates: vec![],
        is_temporal: true,
        valid_from: Some("1621".into()),
        valid_to: Some("1621".into()),
        temporal_precision: Some("year".into()),
    })).expect("event");
    let archetype = support::block_on(repo.create_node(NewGraphNode {
        entity_type: "Archetype".into(),
        title: format!("Antichrist {run_id}"),
        body: "[]".into(),
        coordinate: None,
        source_coordinates: vec![],
        is_temporal: false,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
    })).expect("archetype");

    let timeline = support::block_on(repo.list_nodes_for_lens("timeline")).expect("timeline");
    assert!(timeline.iter().any(|n| n.graph_node_id == event.graph_node_id));
    assert!(!timeline.iter().any(|n| n.graph_node_id == archetype.graph_node_id),
        "trans-temporal archetype excluded from timeline lens");

    let canvas = support::block_on(repo.list_nodes_for_lens("canvas")).expect("canvas");
    assert!(canvas.iter().any(|n| n.graph_node_id == event.graph_node_id));
    assert!(canvas.iter().any(|n| n.graph_node_id == archetype.graph_node_id),
        "canvas lens includes all nodes");

    let batch = support::block_on(
        repo.get_nodes(&[event.graph_node_id.clone(), archetype.graph_node_id.clone()]),
    ).expect("get_nodes");
    assert_eq!(batch.len(), 2);

    // Teardown
    for id in [event.graph_node_id, archetype.graph_node_id] {
        support::block_on(async {
            graph.run_on(&database, query("MATCH (n {graph_node_id: $id}) DETACH DELETE n")
                .param("id", id)).await.expect("cleanup");
        });
    }
}
```

2. - [ ] Run it, expect FAIL:

```bash
cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml graph_list_nodes -- --test-threads=1
```

Expected: `error[E0599]: no method named 'list_nodes_for_lens'`.

3. - [ ] Add the methods to `impl GraphRepository`:

```rust
    pub async fn list_nodes_for_lens(&self, lens: &str) -> Result<Vec<GraphNode>, String> {
        let cypher = match lens {
            "timeline" => "MATCH (n:TheoryNode) WHERE n.is_temporal = true RETURN n",
            "canvas" => "MATCH (n:TheoryNode) RETURN n",
            other => return Err(format!("unknown lens: {other}")),
        };
        let mut rows = self
            .graph
            .execute_on(&self.database, query(cypher))
            .await
            .map_err(|e| format!("list_nodes_for_lens failed: {e}"))?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            let node: neo4rs::Node = row.get("n").map_err(|e| e.to_string())?;
            out.push(node_from_neo(node)?);
        }
        Ok(out)
    }

    pub async fn get_nodes(&self, ids: &[String]) -> Result<Vec<GraphNode>, String> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let q = query("MATCH (n:TheoryNode) WHERE n.graph_node_id IN $ids RETURN n")
            .param("ids", ids.to_vec());
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("get_nodes failed: {e}"))?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            let node: neo4rs::Node = row.get("n").map_err(|e| e.to_string())?;
            out.push(node_from_neo(node)?);
        }
        Ok(out)
    }
```

4. - [ ] Run the test, expect PASS:

```bash
cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml graph_list_nodes -- --test-threads=1 --nocapture
```

Expected: `test timeline_lens_returns_only_temporal_nodes ... ok`.

5. - [ ] Commit:

```bash
cd "/Users/admin/Documents/Antichrist Project" && git add apps/desktop/src-tauri/src/db/repositories/graph.rs apps/desktop/src-tauri/tests/graph_list_nodes.rs && git commit -m "WS2: GraphRepository list_nodes_for_lens + get_nodes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10 — Relationship CRUD (`connect_nodes`, `disconnect`, `list_relationships`, `relationships_for_node`)

**Files:**
- Modify `apps/desktop/src-tauri/src/db/repositories/graph.rs` (add relationship methods + a relationship row-mapper)
- Create `apps/desktop/src-tauri/tests/graph_relationships.rs`

**Interfaces:**
- Consumes (WS0 §2.3, §4.2): relationship types (`INSTANTIATES`, `ECHOES`, `CAUSES`, `INFLUENCES`, `OPPOSES`, `INHERITS`, `TRANSFORMS_INTO`, `LOCATED_AT`, `SOURCED_FROM`, `RESONATES_WITH`); `GraphRelationship` (Task 6) with `properties: serde_json::Value`; neo4j element id as `id` string.
- Produces:
  ```rust
  pub async fn connect_nodes(&self, source_graph_node_id: &str, target_graph_node_id: &str, rel_type: &str, properties: serde_json::Value) -> Result<GraphRelationship, String>;
  pub async fn disconnect(&self, relationship_id: &str) -> Result<(), String>;
  pub async fn list_relationships(&self) -> Result<Vec<GraphRelationship>, String>;
  pub async fn relationships_for_node(&self, graph_node_id: &str) -> Result<Vec<GraphRelationship>, String>;
  ```
- Consumed by: Task 13 (`CanvasView.relationships`), WS4 (linking), WS5 (timeline lighting).

Steps:

1. - [ ] Write the failing test `apps/desktop/src-tauri/tests/graph_relationships.rs`:

```rust
// apps/desktop/src-tauri/tests/graph_relationships.rs
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::repositories::graph::{GraphRepository, NewGraphNode};

fn mk(repo: &GraphRepository, run_id: &str, title: &str, et: &str, temporal: bool) -> String {
    support::block_on(repo.create_node(NewGraphNode {
        entity_type: et.into(),
        title: format!("{title} {run_id}"),
        body: "[]".into(),
        coordinate: None,
        source_coordinates: vec![],
        is_temporal: temporal,
        valid_from: None,
        valid_to: None,
        temporal_precision: None,
    })).expect("create").graph_node_id
}

#[test]
fn connect_list_and_disconnect_relationship() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    let event = mk(&repo, &run_id, "MK-ULTRA", "Event", true);
    let dynamic = mk(&repo, &run_id, "Monopoly", "Dynamic", false);

    let rel = support::block_on(repo.connect_nodes(
        &event, &dynamic, "INSTANTIATES",
        serde_json::json!({ "dominance": "dominant" }),
    )).expect("connect");
    assert_eq!(rel.rel_type, "INSTANTIATES");
    assert_eq!(rel.source_graph_node_id, event);
    assert_eq!(rel.target_graph_node_id, dynamic);
    assert_eq!(rel.properties["dominance"], "dominant");

    let for_node = support::block_on(repo.relationships_for_node(&event)).expect("for_node");
    assert!(for_node.iter().any(|r| r.id == rel.id));

    support::block_on(repo.disconnect(&rel.id)).expect("disconnect");
    let after = support::block_on(repo.relationships_for_node(&event)).expect("after");
    assert!(!after.iter().any(|r| r.id == rel.id), "relationship removed");

    for id in [event, dynamic] {
        support::block_on(async {
            graph.run_on(&database, query("MATCH (n {graph_node_id: $id}) DETACH DELETE n")
                .param("id", id)).await.expect("cleanup");
        });
    }
}
```

2. - [ ] Run it, expect FAIL:

```bash
cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml graph_relationships -- --test-threads=1
```

Expected: `error[E0599]: no method named 'connect_nodes'`.

3. - [ ] Add a validated relationship-type set, a relationship mapper, and the four methods. Add below `validate_entity_label`:

```rust
const REL_TYPES: &[&str] = &[
    "INSTANTIATES", "ECHOES", "CAUSES", "INFLUENCES", "OPPOSES",
    "INHERITS", "TRANSFORMS_INTO", "LOCATED_AT", "SOURCED_FROM", "RESONATES_WITH",
];

fn validate_rel_type(rel_type: &str) -> Result<&str, String> {
    REL_TYPES
        .iter()
        .find(|r| **r == rel_type)
        .copied()
        .ok_or_else(|| format!("unknown rel_type: {rel_type}"))
}
```

Then add the methods inside `impl GraphRepository`:

```rust
    pub async fn connect_nodes(
        &self,
        source_graph_node_id: &str,
        target_graph_node_id: &str,
        rel_type: &str,
        properties: serde_json::Value,
    ) -> Result<GraphRelationship, String> {
        let rel = validate_rel_type(rel_type)?;
        // Properties is a flat JSON object; serialize to a JSON string and set via apoc-free map.
        let props_str = serde_json::to_string(&properties).map_err(|e| e.to_string())?;
        let cypher = format!(
            "MATCH (s:TheoryNode {{graph_node_id: $src}}), (t {{graph_node_id: $tgt}}) \
             CREATE (s)-[r:{rel}]->(t) \
             SET r += apoc.convert.fromJsonMap($props) \
             RETURN elementId(r) AS id, type(r) AS rel_type, \
                    s.graph_node_id AS src, t.graph_node_id AS tgt, $props AS props"
        );
        let q = query(&cypher)
            .param("src", source_graph_node_id.to_string())
            .param("tgt", target_graph_node_id.to_string())
            .param("props", props_str);
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("connect_nodes failed: {e}"))?;
        let row = rows
            .next()
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "connect_nodes: endpoints not found".to_string())?;
        relationship_from_row(&row, properties)
    }

    pub async fn disconnect(&self, relationship_id: &str) -> Result<(), String> {
        let q = query("MATCH ()-[r]-() WHERE elementId(r) = $id DELETE r")
            .param("id", relationship_id.to_string());
        self.graph
            .run_on(&self.database, q)
            .await
            .map_err(|e| format!("disconnect failed: {e}"))?;
        Ok(())
    }

    pub async fn list_relationships(&self) -> Result<Vec<GraphRelationship>, String> {
        let q = query(
            "MATCH (s:TheoryNode)-[r]->(t) \
             RETURN elementId(r) AS id, type(r) AS rel_type, \
                    s.graph_node_id AS src, t.graph_node_id AS tgt, \
                    apoc.convert.toJson(properties(r)) AS props",
        );
        self.collect_relationships(q).await
    }

    pub async fn relationships_for_node(
        &self,
        graph_node_id: &str,
    ) -> Result<Vec<GraphRelationship>, String> {
        let q = query(
            "MATCH (s)-[r]-(t) WHERE s.graph_node_id = $id \
             RETURN elementId(r) AS id, type(r) AS rel_type, \
                    startNode(r).graph_node_id AS src, endNode(r).graph_node_id AS tgt, \
                    apoc.convert.toJson(properties(r)) AS props",
        )
        .param("id", graph_node_id.to_string());
        self.collect_relationships(q).await
    }

    async fn collect_relationships(
        &self,
        q: neo4rs::Query,
    ) -> Result<Vec<GraphRelationship>, String> {
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("relationship query failed: {e}"))?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            let props_json: String = row.get("props").unwrap_or_else(|_| "{}".to_string());
            let props: serde_json::Value =
                serde_json::from_str(&props_json).unwrap_or(serde_json::json!({}));
            out.push(relationship_from_row(&row, props)?);
        }
        Ok(out)
    }
```

And add the row mapper as a free function near `node_from_neo`:

```rust
fn relationship_from_row(
    row: &neo4rs::Row,
    properties: serde_json::Value,
) -> Result<GraphRelationship, String> {
    Ok(GraphRelationship {
        id: row.get::<String>("id").map_err(|e| e.to_string())?,
        rel_type: row.get::<String>("rel_type").map_err(|e| e.to_string())?,
        source_graph_node_id: row.get::<String>("src").map_err(|e| e.to_string())?,
        target_graph_node_id: row.get::<String>("tgt").map_err(|e| e.to_string())?,
        properties,
    })
}
```

4. - [ ] Run the test, expect PASS:

```bash
cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml graph_relationships -- --test-threads=1 --nocapture
```

Expected: `test connect_list_and_disconnect_relationship ... ok`.

5. - [ ] Commit:

```bash
cd "/Users/admin/Documents/Antichrist Project" && git add apps/desktop/src-tauri/src/db/repositories/graph.rs apps/desktop/src-tauri/tests/graph_relationships.rs && git commit -m "WS2: GraphRepository relationship CRUD (connect/disconnect/list/for_node)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11 — Archetypal lighting + resonances + full-text search

**Files:**
- Modify `apps/desktop/src-tauri/src/db/repositories/graph.rs` (add `archetypal_lighting`, `resonances_for_instance`, `search`)
- Create `apps/desktop/src-tauri/tests/graph_lighting.rs`

**Interfaces:**
- Consumes (WS0 §4.2, §8.2): `ArchetypalLightingResult`, `LitInstance`, `GraphNode`; the two-lens Cypher contract (INSTANTIATES|ECHOES from datable instances to an operator; inverse with RESONATES_WITH); full-text index `theory_node_fulltext` (Task 5).
- Produces:
  ```rust
  pub async fn archetypal_lighting(&self, operator_graph_node_id: &str) -> Result<ArchetypalLightingResult, String>;
  pub async fn resonances_for_instance(&self, graph_node_id: &str) -> Result<Vec<LitInstance>, String>;
  pub async fn search(&self, query: &str, limit: i64) -> Result<Vec<GraphNode>, String>;
  ```
- Consumed by: WS5 (timeline lighting), WS7 (export search index / read layer).

Steps:

1. - [ ] Write the failing test `apps/desktop/src-tauri/tests/graph_lighting.rs`:

```rust
// apps/desktop/src-tauri/tests/graph_lighting.rs
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::repositories::graph::{GraphRepository, NewGraphNode};

#[test]
fn archetypal_lighting_returns_datable_instances() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    let operator = support::block_on(repo.create_node(NewGraphNode {
        entity_type: "Dynamic".into(),
        title: format!("Monopoly mechanism {run_id}"),
        body: "[]".into(), coordinate: None, source_coordinates: vec![],
        is_temporal: false, valid_from: None, valid_to: None, temporal_precision: None,
    })).expect("operator");
    let event = support::block_on(repo.create_node(NewGraphNode {
        entity_type: "Event".into(),
        title: format!("VOC charter {run_id}"),
        body: "[]".into(), coordinate: None, source_coordinates: vec![],
        is_temporal: true, valid_from: Some("1602".into()), valid_to: Some("1602".into()),
        temporal_precision: Some("year".into()),
    })).expect("event");

    support::block_on(repo.connect_nodes(
        &event.graph_node_id, &operator.graph_node_id, "INSTANTIATES",
        serde_json::json!({ "dominance": "dominant" }),
    )).expect("connect");

    let lit = support::block_on(repo.archetypal_lighting(&operator.graph_node_id)).expect("lighting");
    assert_eq!(lit.operator.graph_node_id, operator.graph_node_id);
    assert_eq!(lit.instances.len(), 1);
    assert_eq!(lit.instances[0].node.graph_node_id, event.graph_node_id);
    assert_eq!(lit.instances[0].rel_type, "INSTANTIATES");
    assert_eq!(lit.instances[0].dominance.as_deref(), Some("dominant"));

    let inverse = support::block_on(repo.resonances_for_instance(&event.graph_node_id)).expect("inverse");
    assert!(inverse.iter().any(|li| li.node.graph_node_id == operator.graph_node_id));

    let hits = support::block_on(repo.search(&format!("VOC {run_id}"), 10)).expect("search");
    assert!(hits.iter().any(|n| n.graph_node_id == event.graph_node_id));

    for id in [operator.graph_node_id, event.graph_node_id] {
        support::block_on(async {
            graph.run_on(&database, query("MATCH (n {graph_node_id: $id}) DETACH DELETE n")
                .param("id", id)).await.expect("cleanup");
        });
    }
}
```

2. - [ ] Run it, expect FAIL:

```bash
cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml graph_lighting -- --test-threads=1
```

Expected: `error[E0599]: no method named 'archetypal_lighting'`.

3. - [ ] Add the three methods to `impl GraphRepository`:

```rust
    pub async fn archetypal_lighting(
        &self,
        operator_graph_node_id: &str,
    ) -> Result<ArchetypalLightingResult, String> {
        let operator = self
            .get_node(operator_graph_node_id)
            .await?
            .ok_or_else(|| format!("operator not found: {operator_graph_node_id}"))?;
        let q = query(
            "MATCH (op {graph_node_id: $id}) \
             WHERE op:Archetype OR op:Dynamic OR op:PsychoidOperator \
             MATCH (inst:TheoryNode)-[r:INSTANTIATES|ECHOES]->(op) \
             WHERE inst.is_temporal = true \
             RETURN inst, type(r) AS relType, r.dominance AS dominance \
             ORDER BY inst.valid_from",
        )
        .param("id", operator_graph_node_id.to_string());
        let instances = self.collect_lit_instances(q, "inst").await?;
        Ok(ArchetypalLightingResult { operator, instances })
    }

    pub async fn resonances_for_instance(
        &self,
        graph_node_id: &str,
    ) -> Result<Vec<LitInstance>, String> {
        let q = query(
            "MATCH (inst {graph_node_id: $id})-[r:INSTANTIATES|ECHOES|RESONATES_WITH]->(op) \
             WHERE op:Archetype OR op:Dynamic OR op:PsychoidOperator \
             RETURN op AS node, type(r) AS relType, r.dominance AS dominance",
        )
        .param("id", graph_node_id.to_string());
        self.collect_lit_instances(q, "node").await
    }

    pub async fn search(&self, query_text: &str, limit: i64) -> Result<Vec<GraphNode>, String> {
        let q = query(
            "CALL db.index.fulltext.queryNodes('theory_node_fulltext', $q) \
             YIELD node, score RETURN node ORDER BY score DESC LIMIT $limit",
        )
        .param("q", query_text.to_string())
        .param("limit", limit);
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("search failed: {e}"))?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            let node: neo4rs::Node = row.get("node").map_err(|e| e.to_string())?;
            out.push(node_from_neo(node)?);
        }
        Ok(out)
    }

    async fn collect_lit_instances(
        &self,
        q: neo4rs::Query,
        node_key: &str,
    ) -> Result<Vec<LitInstance>, String> {
        let mut rows = self
            .graph
            .execute_on(&self.database, q)
            .await
            .map_err(|e| format!("lighting query failed: {e}"))?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
            let node: neo4rs::Node = row.get(node_key).map_err(|e| e.to_string())?;
            let rel_type: String = row.get("relType").map_err(|e| e.to_string())?;
            let dominance: Option<String> = row.get("dominance").ok();
            out.push(LitInstance {
                node: node_from_neo(node)?,
                rel_type,
                dominance,
            });
        }
        Ok(out)
    }
```

4. - [ ] Run the test, expect PASS:

```bash
cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml graph_lighting -- --test-threads=1 --nocapture
```

Expected: `test archetypal_lighting_returns_datable_instances ... ok`.

5. - [ ] Commit:

```bash
cd "/Users/admin/Documents/Antichrist Project" && git add apps/desktop/src-tauri/src/db/repositories/graph.rs apps/desktop/src-tauri/tests/graph_lighting.rs && git commit -m "WS2: GraphRepository archetypal_lighting + resonances_for_instance + search

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12 — SQLite layout store: migration `0008_layout_store` + `LayoutRepository`

> **WS1 coordination:** WS1 (saving) also owns these two artifacts. If WS1 has already landed an identical `migrations/0008_layout_store.sql` (registered in `migrations.rs`) and `repositories/layout.rs` matching the WS0 contract, **skip steps 3–6 and only confirm the test passes** (step 7). The content below is the WS0 §3.1 / §4.3 contract verbatim, so the files are byte-compatible.

**Files:**
- Create `apps/desktop/src-tauri/migrations/0008_layout_store.sql`
- Modify `apps/desktop/src-tauri/src/db/migrations.rs` (append `0008_layout_store` to `MIGRATIONS`)
- Create `apps/desktop/src-tauri/src/db/repositories/layout.rs`
- Modify `apps/desktop/src-tauri/src/db/repositories/mod.rs` (export `layout` items)
- Create `apps/desktop/src-tauri/tests/layout_repository.rs`
- Modify `apps/desktop/src-tauri/tests/db_migrations.rs` (bump expected migration count 7 → 8, assert new tables)

**Interfaces:**
- Consumes (WS0 §3.1, §4.3): SQLite tables `node_layout`, `canvas_app_state`, `edge_layout`; types `NodeLayoutRecord`, `EdgeLayoutRecord`, `CanvasAppStateRecord`; the existing `Database::open` / migration-runner pattern.
- Produces:
  ```rust
  pub struct LayoutRepository<'conn> { /* &Connection */ }
  impl<'conn> LayoutRepository<'conn> {
      pub fn new(connection: &'conn rusqlite::Connection) -> Self;
      pub fn list_node_layout(&self, canvas_id: &str) -> rusqlite::Result<Vec<NodeLayoutRecord>>;
      pub fn list_edge_layout(&self, canvas_id: &str) -> rusqlite::Result<Vec<EdgeLayoutRecord>>;
      pub fn get_app_state(&self, canvas_id: &str) -> rusqlite::Result<Option<CanvasAppStateRecord>>;
      pub fn upsert_node_layout(&self, record: &NodeLayoutRecord) -> rusqlite::Result<()>;
      pub fn delete_node_layout(&self, canvas_id: &str, graph_node_id: &str) -> rusqlite::Result<()>;
      pub fn upsert_edge_layout(&self, record: &EdgeLayoutRecord) -> rusqlite::Result<()>;
      pub fn delete_edge_layout(&self, id: &str) -> rusqlite::Result<()>;
      pub fn upsert_app_state(&self, record: &CanvasAppStateRecord) -> rusqlite::Result<()>;
      pub fn upsert_node_layouts(&self, records: &[NodeLayoutRecord]) -> rusqlite::Result<usize>;
  }
  ```
- Consumed by: Task 13 (join), WS1 (transactional flush wraps `upsert_node_layouts`).

Steps:

1. - [ ] Write the failing test `apps/desktop/src-tauri/tests/layout_repository.rs`:

```rust
// apps/desktop/src-tauri/tests/layout_repository.rs
use research_canvas_desktop_lib::db::{
    connection::Database,
    repositories::{
        layout::{CanvasAppStateRecord, EdgeLayoutRecord, LayoutRepository, NodeLayoutRecord},
        ProjectRepository,
    },
};
use tempfile::tempdir;

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

#[test]
fn node_layout_upsert_list_and_delete() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("t.db")).unwrap();
    let conn = db.connection();
    let project = ProjectRepository::new(conn)
        .create("P".into(), "p".into(), None, dir.path().to_str().unwrap().into(),
                None, None, serde_json::json!({}))
        .unwrap();
    let canvas_id = project.primary_canvas_id.unwrap();

    let repo = LayoutRepository::new(conn);
    let rec = NodeLayoutRecord {
        graph_node_id: "gnid-1".into(),
        canvas_id: canvas_id.clone(),
        position_x: 10.0, position_y: 20.0, width: 240.0, height: 160.0,
        style_json: "{}".into(), created_at: now(), updated_at: now(),
    };
    repo.upsert_node_layout(&rec).unwrap();

    let listed = repo.list_node_layout(&canvas_id).unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].graph_node_id, "gnid-1");
    assert_eq!(listed[0].position_x, 10.0);

    // Upsert again with a new position (same PK = canvas_id + graph_node_id) -> still one row.
    let moved = NodeLayoutRecord { position_x: 99.0, ..rec.clone() };
    repo.upsert_node_layout(&moved).unwrap();
    let listed2 = repo.list_node_layout(&canvas_id).unwrap();
    assert_eq!(listed2.len(), 1);
    assert_eq!(listed2[0].position_x, 99.0);

    let n = repo.upsert_node_layouts(&[
        NodeLayoutRecord { graph_node_id: "gnid-2".into(), ..rec.clone() },
        NodeLayoutRecord { graph_node_id: "gnid-3".into(), ..rec.clone() },
    ]).unwrap();
    assert_eq!(n, 2);
    assert_eq!(repo.list_node_layout(&canvas_id).unwrap().len(), 3);

    repo.delete_node_layout(&canvas_id, "gnid-1").unwrap();
    assert_eq!(repo.list_node_layout(&canvas_id).unwrap().len(), 2);
}

#[test]
fn edge_layout_and_app_state_round_trip() {
    let dir = tempdir().unwrap();
    let db = Database::open(dir.path().join("t.db")).unwrap();
    let conn = db.connection();
    let project = ProjectRepository::new(conn)
        .create("P".into(), "p".into(), None, dir.path().to_str().unwrap().into(),
                None, None, serde_json::json!({}))
        .unwrap();
    let canvas_id = project.primary_canvas_id.unwrap();
    let repo = LayoutRepository::new(conn);

    let edge = EdgeLayoutRecord {
        id: "edge-1".into(), canvas_id: canvas_id.clone(),
        source_graph_node_id: "a".into(), target_graph_node_id: "b".into(),
        relation_kind: "INSTANTIATES".into(),
        source_handle_id: Some("a-right".into()), target_handle_id: None,
        style_json: "{}".into(), created_at: now(), updated_at: now(),
    };
    repo.upsert_edge_layout(&edge).unwrap();
    assert_eq!(repo.list_edge_layout(&canvas_id).unwrap().len(), 1);
    repo.delete_edge_layout("edge-1").unwrap();
    assert_eq!(repo.list_edge_layout(&canvas_id).unwrap().len(), 0);

    assert!(repo.get_app_state(&canvas_id).unwrap().is_none());
    repo.upsert_app_state(&CanvasAppStateRecord {
        canvas_id: canvas_id.clone(),
        viewport_json: r#"{"x":1,"y":2,"zoom":1.5}"#.into(),
        app_state_json: r#"{"panel":"open"}"#.into(),
        updated_at: now(),
    }).unwrap();
    let st = repo.get_app_state(&canvas_id).unwrap().unwrap();
    assert_eq!(st.viewport_json, r#"{"x":1,"y":2,"zoom":1.5}"#);
}
```

2. - [ ] Run it, expect FAIL (no `layout` module/tables):

```bash
cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" layout_repository -- --test-threads=1
```

Expected: `error[E0432]: unresolved import 'research_canvas_desktop_lib::db::repositories::layout'`.

3. - [ ] Create the migration `apps/desktop/src-tauri/migrations/0008_layout_store.sql` (WS0 §3.1 verbatim):

```sql
-- migrations/0008_layout_store.sql

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

-- Edges become pure layout/relation-mirror rows keyed by graph relation, optional in v1.
CREATE TABLE IF NOT EXISTS edge_layout (
    id                TEXT PRIMARY KEY NOT NULL,
    canvas_id         TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    source_graph_node_id TEXT NOT NULL,
    target_graph_node_id TEXT NOT NULL,
    relation_kind     TEXT NOT NULL,
    source_handle_id  TEXT,
    target_handle_id  TEXT,
    style_json        TEXT NOT NULL DEFAULT '{}',
    created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_edge_layout_canvas_id ON edge_layout(canvas_id);
```

4. - [ ] Register the migration. In `apps/desktop/src-tauri/src/db/migrations.rs`, append to the `MIGRATIONS` array (after the `0007_saved_sequences` entry, before the closing `];`):

```rust
    Migration {
        version: "0008_layout_store",
        sql: include_str!("../../migrations/0008_layout_store.sql"),
    },
```

5. - [ ] Create `apps/desktop/src-tauri/src/db/repositories/layout.rs`:

```rust
// apps/desktop/src-tauri/src/db/repositories/layout.rs
use rusqlite::{params, Connection, OptionalExtension, Result};
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasAppStateRecord {
    pub canvas_id: String,
    pub viewport_json: String,
    pub app_state_json: String,
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
        let mut stmt = self.connection.prepare(
            "SELECT graph_node_id, canvas_id, position_x, position_y, width, height,
                    style_json, created_at, updated_at
             FROM node_layout WHERE canvas_id = ?1
             ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map([canvas_id], node_layout_from_row)?;
        rows.collect()
    }

    pub fn list_edge_layout(&self, canvas_id: &str) -> Result<Vec<EdgeLayoutRecord>> {
        let mut stmt = self.connection.prepare(
            "SELECT id, canvas_id, source_graph_node_id, target_graph_node_id, relation_kind,
                    source_handle_id, target_handle_id, style_json, created_at, updated_at
             FROM edge_layout WHERE canvas_id = ?1
             ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map([canvas_id], edge_layout_from_row)?;
        rows.collect()
    }

    pub fn get_app_state(&self, canvas_id: &str) -> Result<Option<CanvasAppStateRecord>> {
        self.connection
            .query_row(
                "SELECT canvas_id, viewport_json, app_state_json, updated_at
                 FROM canvas_app_state WHERE canvas_id = ?1",
                [canvas_id],
                app_state_from_row,
            )
            .optional()
    }

    pub fn upsert_node_layout(&self, record: &NodeLayoutRecord) -> Result<()> {
        self.connection.execute(
            "INSERT INTO node_layout
                (graph_node_id, canvas_id, position_x, position_y, width, height,
                 style_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(canvas_id, graph_node_id) DO UPDATE SET
                position_x = excluded.position_x,
                position_y = excluded.position_y,
                width      = excluded.width,
                height     = excluded.height,
                style_json = excluded.style_json,
                updated_at = excluded.updated_at",
            params![
                record.graph_node_id, record.canvas_id, record.position_x, record.position_y,
                record.width, record.height, record.style_json, record.created_at, record.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_node_layout(&self, canvas_id: &str, graph_node_id: &str) -> Result<()> {
        self.connection.execute(
            "DELETE FROM node_layout WHERE canvas_id = ?1 AND graph_node_id = ?2",
            params![canvas_id, graph_node_id],
        )?;
        Ok(())
    }

    pub fn upsert_edge_layout(&self, record: &EdgeLayoutRecord) -> Result<()> {
        self.connection.execute(
            "INSERT INTO edge_layout
                (id, canvas_id, source_graph_node_id, target_graph_node_id, relation_kind,
                 source_handle_id, target_handle_id, style_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
                source_graph_node_id = excluded.source_graph_node_id,
                target_graph_node_id = excluded.target_graph_node_id,
                relation_kind        = excluded.relation_kind,
                source_handle_id     = excluded.source_handle_id,
                target_handle_id     = excluded.target_handle_id,
                style_json           = excluded.style_json,
                updated_at           = excluded.updated_at",
            params![
                record.id, record.canvas_id, record.source_graph_node_id, record.target_graph_node_id,
                record.relation_kind, record.source_handle_id, record.target_handle_id,
                record.style_json, record.created_at, record.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_edge_layout(&self, id: &str) -> Result<()> {
        self.connection
            .execute("DELETE FROM edge_layout WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn upsert_app_state(&self, record: &CanvasAppStateRecord) -> Result<()> {
        self.connection.execute(
            "INSERT INTO canvas_app_state (canvas_id, viewport_json, app_state_json, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(canvas_id) DO UPDATE SET
                viewport_json  = excluded.viewport_json,
                app_state_json = excluded.app_state_json,
                updated_at     = excluded.updated_at",
            params![record.canvas_id, record.viewport_json, record.app_state_json, record.updated_at],
        )?;
        Ok(())
    }

    pub fn upsert_node_layouts(&self, records: &[NodeLayoutRecord]) -> Result<usize> {
        for record in records {
            self.upsert_node_layout(record)?;
        }
        Ok(records.len())
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

fn app_state_from_row(row: &rusqlite::Row<'_>) -> Result<CanvasAppStateRecord> {
    Ok(CanvasAppStateRecord {
        canvas_id: row.get(0)?,
        viewport_json: row.get(1)?,
        app_state_json: row.get(2)?,
        updated_at: row.get(3)?,
    })
}
```

6. - [ ] Export it. In `apps/desktop/src-tauri/src/db/repositories/mod.rs`, add `pub mod layout;` (after `pub mod graph;`) and the re-export:

```rust
pub use layout::{
    CanvasAppStateRecord, EdgeLayoutRecord, LayoutRepository, NodeLayoutRecord,
};
```

7. - [ ] Update the migrations test. In `apps/desktop/src-tauri/tests/db_migrations.rs`, change both `assert_eq!(applied_migrations, 7);` to `8`, and add three table assertions in the first test after the `saved_sequences` assertion:

```rust
    assert!(table_exists(connection, "node_layout"));
    assert!(table_exists(connection, "canvas_app_state"));
    assert!(table_exists(connection, "edge_layout"));
```

8. - [ ] Run both test files, expect PASS:

```bash
cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" layout_repository -- --test-threads=1 && cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" db_migrations -- --test-threads=1
```

Expected: `layout_repository` → `2 passed`; `db_migrations` → `2 passed`.

9. - [ ] Commit:

```bash
cd "/Users/admin/Documents/Antichrist Project" && git add apps/desktop/src-tauri/migrations/0008_layout_store.sql apps/desktop/src-tauri/src/db/migrations.rs apps/desktop/src-tauri/src/db/repositories/layout.rs apps/desktop/src-tauri/src/db/repositories/mod.rs apps/desktop/src-tauri/tests/layout_repository.rs apps/desktop/src-tauri/tests/db_migrations.rs && git commit -m "WS2: SQLite layout store (0008 migration + LayoutRepository)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13 — The cross-store join: `CanvasService::load_canvas_view` (`JoinedCanvasNode` / `CanvasView`)

**Files:**
- Create `apps/desktop/src-tauri/src/db/canvas_service.rs` (the join layer; zips Neo4j substance with SQLite layout in Rust)
- Modify `apps/desktop/src-tauri/src/db/mod.rs` (add `pub mod canvas_service;`)
- Create `apps/desktop/src-tauri/tests/canvas_view_join.rs`

**Interfaces:**
- Consumes (WS0 §3.2, §5.1): `GraphRepository::{list_nodes_for_lens, list_relationships}` (Tasks 9, 10), `LayoutRepository::{list_node_layout, list_edge_layout, get_app_state}` (Task 12); `GraphNode`, `GraphRelationship`, `NodeLayoutRecord`, `EdgeLayoutRecord`, `CanvasAppStateRecord`. Join rule: nodes with substance but no layout row get a deterministic auto-placed default; layout rows with no substance are dropped (orphan).
- Produces:
  ```rust
  // apps/desktop/src-tauri/src/db/canvas_service.rs
  #[derive(Serialize, Deserialize)] pub struct NodeLayoutDto { pub graph_node_id: String, pub canvas_id: String, pub position_x: f64, pub position_y: f64, pub width: f64, pub height: f64, pub style: serde_json::Value }
  #[derive(Serialize, Deserialize)] pub struct JoinedCanvasNode { pub node: GraphNode, pub layout: NodeLayoutDto }
  #[derive(Serialize, Deserialize)] pub struct CanvasView { pub canvas_id: String, pub nodes: Vec<JoinedCanvasNode>, pub edges: Vec<EdgeLayoutDto>, pub relationships: Vec<GraphRelationship>, pub viewport: serde_json::Value, pub app_state: serde_json::Value }
  pub struct CanvasService { /* graph: GraphRepository, db_path: String */ }
  impl CanvasService {
      pub fn new(graph: GraphRepository, db_path: String) -> Self;
      pub async fn load_canvas_view(&self, canvas_id: &str, lens: &str) -> Result<CanvasView, String>;
  }
  ```
  All structs `serde(rename_all = "camelCase")` to match WS0 §5.1 (`graphNodeId`, `positionX`, etc.).
- Consumed by: Task 14 (Tauri command `load_canvas_view_command`), Task 16/17 (TS transport `loadCanvasView`), WS5/WS7.

Steps:

1. - [ ] Write the failing test `apps/desktop/src-tauri/tests/canvas_view_join.rs`:

```rust
// apps/desktop/src-tauri/tests/canvas_view_join.rs
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::{
    canvas_service::CanvasService,
    connection::Database,
    repositories::{
        graph::{GraphRepository, NewGraphNode},
        layout::{LayoutRepository, NodeLayoutRecord},
        ProjectRepository,
    },
};
use tempfile::tempdir;

fn now() -> String { chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true) }

#[test]
fn load_canvas_view_joins_substance_with_layout_and_autoplaces_missing() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    // SQLite layout in a temp dir + a real canvas row.
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("t.db");
    let db = Database::open(&db_path).unwrap();
    let project = ProjectRepository::new(db.connection())
        .create("P".into(), "p".into(), None, dir.path().to_str().unwrap().into(),
                None, None, serde_json::json!({})).unwrap();
    let canvas_id = project.primary_canvas_id.unwrap();

    // Two graph nodes; only one has a layout row.
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");
    let placed = support::block_on(repo.create_node(NewGraphNode {
        entity_type: "Event".into(), title: format!("Placed {run_id}"), body: "[]".into(),
        coordinate: None, source_coordinates: vec![], is_temporal: true,
        valid_from: Some("1602".into()), valid_to: Some("1602".into()), temporal_precision: Some("year".into()),
    })).expect("placed");
    let floating = support::block_on(repo.create_node(NewGraphNode {
        entity_type: "Archetype".into(), title: format!("Floating {run_id}"), body: "[]".into(),
        coordinate: None, source_coordinates: vec![], is_temporal: false,
        valid_from: None, valid_to: None, temporal_precision: None,
    })).expect("floating");

    LayoutRepository::new(db.connection()).upsert_node_layout(&NodeLayoutRecord {
        graph_node_id: placed.graph_node_id.clone(), canvas_id: canvas_id.clone(),
        position_x: 50.0, position_y: 60.0, width: 240.0, height: 160.0,
        style_json: "{}".into(), created_at: now(), updated_at: now(),
    }).unwrap();

    let service = CanvasService::new(
        GraphRepository::new(graph.clone(), database.clone()),
        db_path.to_string_lossy().to_string(),
    );
    let view = support::block_on(service.load_canvas_view(&canvas_id, "canvas")).expect("view");
    assert_eq!(view.canvas_id, canvas_id);
    assert_eq!(view.nodes.len(), 2, "both nodes appear (one auto-placed)");

    let placed_join = view.nodes.iter().find(|j| j.node.graph_node_id == placed.graph_node_id).unwrap();
    assert_eq!(placed_join.layout.position_x, 50.0);
    let floating_join = view.nodes.iter().find(|j| j.node.graph_node_id == floating.graph_node_id).unwrap();
    // Auto-placed default has a finite position and non-zero default size.
    assert!(floating_join.layout.width > 0.0);

    // Timeline lens excludes the trans-temporal archetype.
    let tl = support::block_on(service.load_canvas_view(&canvas_id, "timeline")).expect("tl");
    assert!(tl.nodes.iter().any(|j| j.node.graph_node_id == placed.graph_node_id));
    assert!(!tl.nodes.iter().any(|j| j.node.graph_node_id == floating.graph_node_id));

    for id in [placed.graph_node_id, floating.graph_node_id] {
        support::block_on(async {
            graph.run_on(&database, query("MATCH (n {graph_node_id: $id}) DETACH DELETE n")
                .param("id", id)).await.expect("cleanup");
        });
    }
}
```

2. - [ ] Run it, expect FAIL:

```bash
cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml canvas_view_join -- --test-threads=1
```

Expected: `error[E0432]: unresolved import 'research_canvas_desktop_lib::db::canvas_service'`.

3. - [ ] Create `apps/desktop/src-tauri/src/db/canvas_service.rs`:

```rust
// apps/desktop/src-tauri/src/db/canvas_service.rs
use serde::{Deserialize, Serialize};

use crate::db::{
    connection::Database,
    repositories::{
        graph::{GraphNode, GraphRelationship, GraphRepository},
        layout::{EdgeLayoutRecord, LayoutRepository, NodeLayoutRecord},
    },
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeLayoutDto {
    pub graph_node_id: String,
    pub canvas_id: String,
    pub position_x: f64,
    pub position_y: f64,
    pub width: f64,
    pub height: f64,
    pub style: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeLayoutDto {
    pub id: String,
    pub canvas_id: String,
    pub source_graph_node_id: String,
    pub target_graph_node_id: String,
    pub relation_kind: String,
    pub source_handle_id: Option<String>,
    pub target_handle_id: Option<String>,
    pub style: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinedCanvasNode {
    pub node: GraphNode,
    pub layout: NodeLayoutDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasView {
    pub canvas_id: String,
    pub nodes: Vec<JoinedCanvasNode>,
    pub edges: Vec<EdgeLayoutDto>,
    pub relationships: Vec<GraphRelationship>,
    pub viewport: serde_json::Value,
    pub app_state: serde_json::Value,
}

pub struct CanvasService {
    graph: GraphRepository,
    db_path: String,
}

const DEFAULT_NODE_WIDTH: f64 = 240.0;
const DEFAULT_NODE_HEIGHT: f64 = 160.0;
const AUTO_PLACE_STEP: f64 = 64.0;
const AUTO_PLACE_PER_ROW: usize = 8;

impl CanvasService {
    pub fn new(graph: GraphRepository, db_path: String) -> Self {
        Self { graph, db_path }
    }

    pub async fn load_canvas_view(
        &self,
        canvas_id: &str,
        lens: &str,
    ) -> Result<CanvasView, String> {
        // 1. Substance from Neo4j (lens-filtered).
        let nodes = self.graph.list_nodes_for_lens(lens).await?;
        let relationships = self.graph.list_relationships().await?;

        // 2. Layout from SQLite.
        let db = Database::open(&self.db_path).map_err(|e| e.to_string())?;
        let conn = db.connection();
        let layout_repo = LayoutRepository::new(conn);
        let layout_rows = layout_repo
            .list_node_layout(canvas_id)
            .map_err(|e| e.to_string())?;
        let edge_rows = layout_repo
            .list_edge_layout(canvas_id)
            .map_err(|e| e.to_string())?;
        let app_state = layout_repo
            .get_app_state(canvas_id)
            .map_err(|e| e.to_string())?;

        // 3. Zip on graph_node_id; auto-place nodes without a layout row.
        let mut layout_by_id: std::collections::HashMap<String, NodeLayoutRecord> =
            std::collections::HashMap::new();
        for row in layout_rows {
            layout_by_id.insert(row.graph_node_id.clone(), row);
        }

        let mut joined = Vec::with_capacity(nodes.len());
        let mut auto_index = 0usize;
        for node in nodes {
            let layout = match layout_by_id.get(&node.graph_node_id) {
                Some(row) => NodeLayoutDto {
                    graph_node_id: row.graph_node_id.clone(),
                    canvas_id: row.canvas_id.clone(),
                    position_x: row.position_x,
                    position_y: row.position_y,
                    width: row.width,
                    height: row.height,
                    style: serde_json::from_str(&row.style_json)
                        .unwrap_or_else(|_| serde_json::json!({})),
                },
                None => {
                    let col = (auto_index % AUTO_PLACE_PER_ROW) as f64;
                    let row_idx = (auto_index / AUTO_PLACE_PER_ROW) as f64;
                    auto_index += 1;
                    NodeLayoutDto {
                        graph_node_id: node.graph_node_id.clone(),
                        canvas_id: canvas_id.to_string(),
                        position_x: col * (DEFAULT_NODE_WIDTH + AUTO_PLACE_STEP),
                        position_y: row_idx * (DEFAULT_NODE_HEIGHT + AUTO_PLACE_STEP),
                        width: DEFAULT_NODE_WIDTH,
                        height: DEFAULT_NODE_HEIGHT,
                        style: serde_json::json!({}),
                    }
                }
            };
            joined.push(JoinedCanvasNode { node, layout });
        }
        // Orphan layout rows (no substance) are simply not emitted.

        let edges = edge_rows
            .into_iter()
            .map(edge_dto_from_record)
            .collect::<Vec<_>>();

        let (viewport, app_state_json) = match app_state {
            Some(state) => (
                serde_json::from_str(&state.viewport_json)
                    .unwrap_or_else(|_| serde_json::json!({ "x": 0, "y": 0, "zoom": 1 })),
                serde_json::from_str(&state.app_state_json)
                    .unwrap_or_else(|_| serde_json::json!({})),
            ),
            None => (serde_json::json!({ "x": 0, "y": 0, "zoom": 1 }), serde_json::json!({})),
        };

        Ok(CanvasView {
            canvas_id: canvas_id.to_string(),
            nodes: joined,
            edges,
            relationships,
            viewport,
            app_state: app_state_json,
        })
    }
}

fn edge_dto_from_record(r: EdgeLayoutRecord) -> EdgeLayoutDto {
    EdgeLayoutDto {
        id: r.id,
        canvas_id: r.canvas_id,
        source_graph_node_id: r.source_graph_node_id,
        target_graph_node_id: r.target_graph_node_id,
        relation_kind: r.relation_kind,
        source_handle_id: r.source_handle_id,
        target_handle_id: r.target_handle_id,
        style: serde_json::from_str(&r.style_json).unwrap_or_else(|_| serde_json::json!({})),
    }
}
```

4. - [ ] Register the module. In `apps/desktop/src-tauri/src/db/mod.rs` add `pub mod canvas_service;`:

```rust
pub mod canvas_service;
pub mod connection;
pub mod migrations;
pub mod neo4j;
pub mod repositories;
mod transaction;
```

5. - [ ] Run the test, expect PASS:

```bash
cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml canvas_view_join -- --test-threads=1 --nocapture
```

Expected: `test load_canvas_view_joins_substance_with_layout_and_autoplaces_missing ... ok`.

6. - [ ] Commit:

```bash
cd "/Users/admin/Documents/Antichrist Project" && git add apps/desktop/src-tauri/src/db/canvas_service.rs apps/desktop/src-tauri/src/db/mod.rs apps/desktop/src-tauri/tests/canvas_view_join.rs && git commit -m "WS2: CanvasService.load_canvas_view (substance join layout, auto-place)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14 — Managed `SharedGraph` state + async Tauri graph/layout commands

**Files:**
- Create `apps/desktop/src-tauri/src/commands/graph.rs` (new command module + payload types)
- Modify `apps/desktop/src-tauri/src/lib.rs` (declare `commands::graph`; build + manage `SharedGraph` and `Neo4jConfig.database` at startup; register the new async commands in `generate_handler!`)
- Create `apps/desktop/src-tauri/tests/graph_commands.rs` (unit test of the payload/serde shapes — command bodies are exercised via the repo tests above)

**Interfaces:**
- Consumes (WS0 §5.3): command names `read_graph_node_command`, `create_graph_node_command`, `update_graph_node_command`, `delete_graph_node_command`, `connect_graph_nodes_command`, `disconnect_graph_nodes_command`, `search_graph_command`, `upsert_node_layout_command`, `upsert_node_layouts_command`, `upsert_edge_layout_command`, `upsert_canvas_app_state_command`, `load_canvas_view_command`, `archetypal_lighting_command`, `resonances_for_instance_command`. Consumes `GraphRepository` (Tasks 5–11), `CanvasService` (Task 13), `LayoutRepository` (Task 12), `neo4j::{connect, SharedGraph}` + `Neo4jConfig` (Tasks 3–4), `SharedApiState` (`apps/desktop/src-tauri/src/lib.rs` lines 15–22).
- Produces: a `SharedGraphState` (the `SharedGraph` + active database name + a long-lived `tokio::runtime::Handle`) and a managed `Arc<tokio::runtime::Runtime>` that keeps the bolt pool alive for the whole app, both in Tauri managed state; 14 `async fn` Tauri commands. The five layout/joined commands (`upsert_node_layout_command`, `upsert_node_layouts_command`, `upsert_edge_layout_command`, `upsert_canvas_app_state_command`, `load_canvas_view_command`) take `databasePath` as an **optional** field (`#[serde(default)] Option<String>`) and fall back to `SharedApiState.db_path` when it is absent, so WS3/WS4/WS5/WS6 callers may omit it without a runtime deserialize failure. The exposed `SharedGraphState.runtime` `Handle` is what Task 15 / WS6 `block_on` graph reads from the `:9876` server thread. The desktop transport (Task 16) invokes these.

Steps:

1. - [ ] Write the failing test `apps/desktop/src-tauri/tests/graph_commands.rs` (serde shapes for request/response payloads, no Tauri runtime needed):

```rust
// apps/desktop/src-tauri/tests/graph_commands.rs
use research_canvas_desktop_lib::commands::graph::{
    ConnectGraphNodesRequest, CreateGraphNodeRequest, LoadCanvasViewRequest,
    UpsertNodeLayoutRequest,
};

#[test]
fn create_graph_node_request_deserializes_camel_case() {
    let raw = r#"{
        "entityType": "Event",
        "title": "Banda genocide",
        "body": "[]",
        "isTemporal": true,
        "validFrom": "1621",
        "validTo": "1621",
        "temporalPrecision": "year",
        "sourceCoordinates": ["#2"]
    }"#;
    let req: CreateGraphNodeRequest = serde_json::from_str(raw).expect("deserialize");
    assert_eq!(req.entity_type, "Event");
    assert_eq!(req.is_temporal, true);
    assert_eq!(req.source_coordinates, vec!["#2".to_string()]);
}

#[test]
fn load_canvas_view_request_and_layout_request_deserialize() {
    // databasePath is OPTIONAL: WS3/WS4/WS5/WS6 callers omit it and the command
    // falls back to SharedApiState.db_path. Deserialize must not fail when absent.
    let lcv: LoadCanvasViewRequest =
        serde_json::from_str(r#"{"canvasId":"c1","lens":"timeline"}"#).expect("lcv");
    assert_eq!(lcv.lens, "timeline");
    assert_eq!(lcv.database_path, None);

    let layout: UpsertNodeLayoutRequest = serde_json::from_str(
        r#"{"layout":{"graphNodeId":"g1","canvasId":"c1","positionX":1.0,"positionY":2.0,"width":240.0,"height":160.0,"style":{}}}"#,
    ).expect("layout");
    assert_eq!(layout.layout.graph_node_id, "g1");
    assert_eq!(layout.database_path, None);

    // …and an explicit databasePath is still honoured when present.
    let layout_with_path: UpsertNodeLayoutRequest = serde_json::from_str(
        r#"{"databasePath":"/tmp/x.db","layout":{"graphNodeId":"g1","canvasId":"c1","positionX":1.0,"positionY":2.0,"width":240.0,"height":160.0,"style":{}}}"#,
    ).expect("layout with path");
    assert_eq!(layout_with_path.database_path.as_deref(), Some("/tmp/x.db"));

    let conn: ConnectGraphNodesRequest = serde_json::from_str(
        r#"{"sourceGraphNodeId":"a","targetGraphNodeId":"b","relType":"INSTANTIATES","properties":{"dominance":"dominant"}}"#,
    ).expect("conn");
    assert_eq!(conn.rel_type, "INSTANTIATES");
}
```

2. - [ ] Run it, expect FAIL (`commands::graph` missing):

```bash
cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" graph_commands -- --test-threads=1
```

Expected: `error[E0432]: unresolved import 'research_canvas_desktop_lib::commands::graph'`.

3. - [ ] Create `apps/desktop/src-tauri/src/commands/graph.rs`. It defines a `SharedGraphState` managed-state newtype (graph + database name), request payloads, and the 14 async commands:

```rust
// apps/desktop/src-tauri/src/commands/graph.rs
use serde::{Deserialize, Serialize};

use crate::db::{
    canvas_service::{CanvasService, CanvasView, NodeLayoutDto},
    connection::Database,
    neo4j::SharedGraph,
    repositories::{
        graph::{
            ArchetypalLightingResult, GraphNode, GraphNodePatch, GraphRelationship,
            GraphRepository, LitInstance, NewGraphNode,
        },
        layout::{CanvasAppStateRecord, EdgeLayoutRecord, LayoutRepository, NodeLayoutRecord},
    },
};
use crate::SharedApiState;

/// Tauri managed state: the shared bolt pool, active database name, and a
/// long-lived tokio runtime handle. The `Handle` is exposed so the `:9876`
/// server thread (Task 15 / WS6) can `block_on` async graph reads off the
/// shared pool without spinning up — and dropping — a throwaway runtime.
#[derive(Clone)]
pub struct SharedGraphState {
    pub graph: SharedGraph,
    pub database: String,
    pub runtime: tokio::runtime::Handle,
}

fn repo(state: &tauri::State<SharedGraphState>) -> GraphRepository {
    GraphRepository::new(state.graph.clone(), state.database.clone())
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

// ---- Request payloads (camelCase to match the TS transport) ----

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadGraphNodeRequest {
    pub graph_node_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGraphNodeRequest {
    pub entity_type: String,
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub coordinate: Option<String>,
    #[serde(default)]
    pub source_coordinates: Vec<String>,
    pub is_temporal: bool,
    #[serde(default)]
    pub valid_from: Option<String>,
    #[serde(default)]
    pub valid_to: Option<String>,
    #[serde(default)]
    pub temporal_precision: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateGraphNodeRequest {
    pub graph_node_id: String,
    pub patch: GraphNodePatch,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectGraphNodesRequest {
    pub source_graph_node_id: String,
    pub target_graph_node_id: String,
    pub rel_type: String,
    #[serde(default)]
    pub properties: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisconnectGraphNodesRequest {
    pub relationship_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchGraphRequest {
    pub query: String,
    #[serde(default)]
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutPayload {
    pub graph_node_id: String,
    pub canvas_id: String,
    pub position_x: f64,
    pub position_y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub style: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertNodeLayoutRequest {
    /// Optional: WS3/WS4/WS5/WS6 callers may omit this; the command falls back to
    /// `SharedApiState.db_path`. `#[serde(default)]` keeps deserialize from failing
    /// when the key is absent.
    #[serde(default)]
    pub database_path: Option<String>,
    pub layout: LayoutPayload,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertNodeLayoutsRequest {
    #[serde(default)]
    pub database_path: Option<String>,
    pub canvas_id: String,
    pub layouts: Vec<LayoutPayload>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeLayoutPayload {
    pub id: String,
    pub canvas_id: String,
    pub source_graph_node_id: String,
    pub target_graph_node_id: String,
    pub relation_kind: String,
    #[serde(default)]
    pub source_handle_id: Option<String>,
    #[serde(default)]
    pub target_handle_id: Option<String>,
    #[serde(default)]
    pub style: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertEdgeLayoutRequest {
    #[serde(default)]
    pub database_path: Option<String>,
    pub layout: EdgeLayoutPayload,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertCanvasAppStateRequest {
    #[serde(default)]
    pub database_path: Option<String>,
    pub canvas_id: String,
    pub viewport: serde_json::Value,
    pub app_state: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadCanvasViewRequest {
    #[serde(default)]
    pub database_path: Option<String>,
    pub canvas_id: String,
    pub lens: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchetypalLightingRequest {
    pub operator_graph_node_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResonancesForInstanceRequest {
    pub graph_node_id: String,
}

fn style_to_string(value: &serde_json::Value) -> String {
    if value.is_null() {
        "{}".to_string()
    } else {
        value.to_string()
    }
}

fn layout_record(payload: &LayoutPayload) -> NodeLayoutRecord {
    NodeLayoutRecord {
        graph_node_id: payload.graph_node_id.clone(),
        canvas_id: payload.canvas_id.clone(),
        position_x: payload.position_x,
        position_y: payload.position_y,
        width: payload.width,
        height: payload.height,
        style_json: style_to_string(&payload.style),
        created_at: now(),
        updated_at: now(),
    }
}

/// Resolve the SQLite database path: prefer an explicit `databasePath` from the
/// request, otherwise fall back to the bootstrapped `SharedApiState.db_path`.
/// This lets WS3/WS4/WS5/WS6 callers omit `databasePath` (the `#[serde(default)]`
/// Option keeps deserialize from failing) and still hit the active project DB.
fn resolve_db_path(
    explicit: &Option<String>,
    api_state: &tauri::State<SharedApiState>,
) -> Result<String, String> {
    if let Some(path) = explicit {
        return Ok(path.clone());
    }
    api_state
        .lock()
        .unwrap()
        .db_path
        .clone()
        .ok_or_else(|| "no databasePath provided and app not bootstrapped yet".to_string())
}

// ---- Substance commands (Neo4j) ----

#[tauri::command]
pub async fn read_graph_node_command(
    request: ReadGraphNodeRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<GraphNode, String> {
    repo(&graph_state)
        .get_node(&request.graph_node_id)
        .await?
        .ok_or_else(|| format!("node not found: {}", request.graph_node_id))
}

#[tauri::command]
pub async fn create_graph_node_command(
    request: CreateGraphNodeRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<GraphNode, String> {
    repo(&graph_state)
        .create_node(NewGraphNode {
            entity_type: request.entity_type,
            title: request.title,
            body: request.body,
            coordinate: request.coordinate,
            source_coordinates: request.source_coordinates,
            is_temporal: request.is_temporal,
            valid_from: request.valid_from,
            valid_to: request.valid_to,
            temporal_precision: request.temporal_precision,
        })
        .await
}

#[tauri::command]
pub async fn update_graph_node_command(
    request: UpdateGraphNodeRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<GraphNode, String> {
    repo(&graph_state)
        .update_node(&request.graph_node_id, request.patch)
        .await
}

#[tauri::command]
pub async fn delete_graph_node_command(
    request: ReadGraphNodeRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<(), String> {
    repo(&graph_state).delete_node(&request.graph_node_id).await
}

#[tauri::command]
pub async fn connect_graph_nodes_command(
    request: ConnectGraphNodesRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<GraphRelationship, String> {
    let props = if request.properties.is_null() {
        serde_json::json!({})
    } else {
        request.properties
    };
    repo(&graph_state)
        .connect_nodes(
            &request.source_graph_node_id,
            &request.target_graph_node_id,
            &request.rel_type,
            props,
        )
        .await
}

#[tauri::command]
pub async fn disconnect_graph_nodes_command(
    request: DisconnectGraphNodesRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<(), String> {
    repo(&graph_state).disconnect(&request.relationship_id).await
}

#[tauri::command]
pub async fn search_graph_command(
    request: SearchGraphRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<Vec<GraphNode>, String> {
    repo(&graph_state)
        .search(&request.query, request.limit.unwrap_or(25))
        .await
}

#[tauri::command]
pub async fn archetypal_lighting_command(
    request: ArchetypalLightingRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<ArchetypalLightingResult, String> {
    repo(&graph_state)
        .archetypal_lighting(&request.operator_graph_node_id)
        .await
}

#[tauri::command]
pub async fn resonances_for_instance_command(
    request: ResonancesForInstanceRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
) -> Result<Vec<LitInstance>, String> {
    repo(&graph_state)
        .resonances_for_instance(&request.graph_node_id)
        .await
}

// ---- Joined read (both stores) ----

#[tauri::command]
pub async fn load_canvas_view_command(
    request: LoadCanvasViewRequest,
    graph_state: tauri::State<'_, SharedGraphState>,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<CanvasView, String> {
    let db_path = resolve_db_path(&request.database_path, &api_state)?;
    let service = CanvasService::new(repo(&graph_state), db_path);
    service
        .load_canvas_view(&request.canvas_id, &request.lens)
        .await
}

// ---- Layout commands (SQLite) ----

#[tauri::command]
pub async fn upsert_node_layout_command(
    request: UpsertNodeLayoutRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<(), String> {
    let path = resolve_db_path(&request.database_path, &api_state)?;
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    LayoutRepository::new(db.connection())
        .upsert_node_layout(&layout_record(&request.layout))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_node_layouts_command(
    request: UpsertNodeLayoutsRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<usize, String> {
    let path = resolve_db_path(&request.database_path, &api_state)?;
    let records: Vec<NodeLayoutRecord> =
        request.layouts.iter().map(layout_record).collect();
    let mut db = Database::open(&path).map_err(|e| e.to_string())?;
    let tx = db
        .connection_mut()
        .transaction()
        .map_err(|e| e.to_string())?;
    let written = LayoutRepository::new(&tx)
        .upsert_node_layouts(&records)
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(written)
}

#[tauri::command]
pub async fn upsert_edge_layout_command(
    request: UpsertEdgeLayoutRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<(), String> {
    let path = resolve_db_path(&request.database_path, &api_state)?;
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    let l = &request.layout;
    LayoutRepository::new(db.connection())
        .upsert_edge_layout(&EdgeLayoutRecord {
            id: l.id.clone(),
            canvas_id: l.canvas_id.clone(),
            source_graph_node_id: l.source_graph_node_id.clone(),
            target_graph_node_id: l.target_graph_node_id.clone(),
            relation_kind: l.relation_kind.clone(),
            source_handle_id: l.source_handle_id.clone(),
            target_handle_id: l.target_handle_id.clone(),
            style_json: style_to_string(&l.style),
            created_at: now(),
            updated_at: now(),
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_canvas_app_state_command(
    request: UpsertCanvasAppStateRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<(), String> {
    let path = resolve_db_path(&request.database_path, &api_state)?;
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    LayoutRepository::new(db.connection())
        .upsert_app_state(&CanvasAppStateRecord {
            canvas_id: request.canvas_id,
            viewport_json: style_to_string(&request.viewport),
            app_state_json: style_to_string(&request.app_state),
            updated_at: now(),
        })
        .map_err(|e| e.to_string())
}

// Re-export DTO so external callers can name the return type.
pub use crate::db::canvas_service::JoinedCanvasNode as _JoinedCanvasNode;
pub type LayoutDto = NodeLayoutDto;
```

4. - [ ] Wire the module + managed state + handlers into `apps/desktop/src-tauri/src/lib.rs`. First add `graph` to the `commands` module block (currently lines 2–7):

```rust
pub mod commands {
    pub mod export;
    pub mod graph;
    pub mod projects;
    pub mod search;
    pub mod terminal;
}
```

   Then, inside `run()`, after `let api_state: SharedApiState = ...` and before the `tauri::Builder::default()` call, build a **long-lived** multi-thread tokio runtime and the graph state off it (it must not panic if Neo4j is down at startup — log and skip managing if connect fails). The runtime is built once and kept alive for the whole app: its `Handle` goes into `SharedGraphState` (so the `:9876` server thread can `block_on` graph reads against the shared pool), and the `Arc<Runtime>` itself is managed so it is never dropped while the app runs. Crucially this is **not** a throwaway `new_current_thread` runtime — dropping the runtime would tear down the bolt connection pool. Add:

```rust
    // Long-lived multi-thread runtime that owns the bolt I/O. Kept alive for the
    // whole app via managed state; its Handle is shared into SharedGraphState so
    // the plain :9876 server thread (Task 15) can block_on graph reads.
    let runtime = std::sync::Arc::new(
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("build tokio runtime"),
    );

    // Build the shared Neo4j connection on that runtime (best-effort at startup).
    let graph_state: Option<commands::graph::SharedGraphState> = {
        let rt = runtime.clone();
        (|| {
            let config = crate::db::neo4j::config::Neo4jConfig::from_env().ok()?;
            let database = config.database.clone();
            let graph = rt.block_on(crate::db::neo4j::connect(&config)).ok()?;
            // Ensure schema once on startup.
            let repo = crate::db::repositories::graph::GraphRepository::new(
                graph.clone(),
                database.clone(),
            );
            let _ = rt.block_on(repo.ensure_schema());
            Some(commands::graph::SharedGraphState {
                graph,
                database,
                runtime: rt.handle().clone(),
            })
        })()
    };
```

   Change the builder chain so the runtime and graph state are managed (the runtime is always managed so its `Handle` outlives the server thread; graph state only when the connection succeeded). Replace the `.manage(api_state)` line region with:

```rust
    let mut builder = tauri::Builder::default()
        .manage(pty::TerminalManager::new())
        .manage(api_state)
        .manage(runtime); // Arc<tokio::runtime::Runtime> — keeps the bolt pool alive
    if let Some(gs) = graph_state {
        builder = builder.manage(gs);
    }
    builder
        .setup(move |app| {
            handle_tx.send(app.handle().clone()).ok();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
```

   Then append the 14 new commands to the existing `generate_handler!` list (after `commands::projects::delete_saved_sequence_command,`):

```rust
            commands::graph::read_graph_node_command,
            commands::graph::create_graph_node_command,
            commands::graph::update_graph_node_command,
            commands::graph::delete_graph_node_command,
            commands::graph::connect_graph_nodes_command,
            commands::graph::disconnect_graph_nodes_command,
            commands::graph::search_graph_command,
            commands::graph::archetypal_lighting_command,
            commands::graph::resonances_for_instance_command,
            commands::graph::load_canvas_view_command,
            commands::graph::upsert_node_layout_command,
            commands::graph::upsert_node_layouts_command,
            commands::graph::upsert_edge_layout_command,
            commands::graph::upsert_canvas_app_state_command,
```

5. - [ ] Run the payload test, expect PASS:

```bash
cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" graph_commands -- --test-threads=1
```

Expected: `test result: ok. 2 passed`.

6. - [ ] Verify the whole crate still compiles (commands wired correctly):

```bash
cargo build --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml"
```

Expected: `Finished` with no errors.

7. - [ ] Commit:

```bash
cd "/Users/admin/Documents/Antichrist Project" && git add apps/desktop/src-tauri/src/commands/graph.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tests/graph_commands.rs && git commit -m "WS2: async Tauri graph + layout commands, managed SharedGraph state

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 15 — Internal HTTP API (`:9876`) re-pointed to layout/place routes

The agent's theory-write path moves to the Graphiti MCP (Task 17 doc). The internal `:9876` API drops its theory-mutation routes (`POST /api/nodes`, `PATCH /api/nodes/:id`, `DELETE /api/nodes/:id`, `POST /api/edges`, `DELETE /api/edges/:id`, `POST /api/batch`) and gains layout/placement routes keyed by `graphNodeId`.

**File & type ownership (this task is the sole author of these):** WS2 Task 15 **owns** `apps/desktop/src-tauri/src/api/mod.rs`, `apps/desktop/src-tauri/src/api/handlers.rs`, and `apps/desktop/src-tauri/src/api/types.rs`, and it owns the canonical layout request/response type names exported from `api::types`: **`PlaceNodeRequest`**, **`BatchPlaceItem`**, **`BatchPlaceRequest`**, **`PlacedNodeResponse`**, **`RemoveNodeResponse`**, **`BatchPlaceResponse`**. Downstream workstreams reference these names; they do not redefine them.

**`GET /api/canvas` is SQLite-layout-only (decided).** The `:9876` server runs on a plain `std::thread`, not the Tauri async executor. Rather than thread a `SharedGraph` + database + `tokio::runtime::Handle` into `start_server` purely to graph-join this one read, `GET /api/canvas` returns **SQLite layout rows only** (`canvasId` + `nodes` (layout) + `edges` (layout)). This is all the place-on-canvas agent needs (it learns *what is placed and where*); the substance-joined `CanvasView` is served to the frontend by the async `load_canvas_view_command` (Task 14), which already runs on the Tauri executor with the shared pool. (Should a future task require graph-joined substance over `:9876`, it can `block_on` via the `SharedGraphState.runtime` `Handle` from Task 14 — that handle exists precisely so the server thread can drive async graph reads without a throwaway runtime. We deliberately do **not** do that here.)

**Cross-note to WS6 (do not re-author these files):** WS6 (terminal/agent) MUST NOT rewrite `api/mod.rs`, `api/handlers.rs`, or `api/types.rs`, and MUST NOT redefine `PlaceNodeRequest`/`BatchPlaceItem`/`BatchPlaceRequest`/`RemoveNodeResponse` (or the response types). WS6's only change to this layer is to **add `agent_activity` recording inside the existing handlers** (`upsert_node_layout`, `remove_node_layout`, `batch_place`) — an additive call within each handler body — reusing the routes and types defined here verbatim.

**Files:**
- Modify `apps/desktop/src-tauri/src/api/mod.rs` (replace the dispatch arms)
- Rewrite `apps/desktop/src-tauri/src/api/handlers.rs` (replace theory handlers with layout handlers)
- Rewrite `apps/desktop/src-tauri/src/api/types.rs` (replace request/response types)
- Create `apps/desktop/src-tauri/tests/api_layout_dispatch.rs` (route-shape unit test using the dispatch-visible handlers)

**Interfaces:**
- Consumes (WS0 §6.3): routes `GET /api/canvas` (read-only **layout-only** view: `canvasId` + layout `nodes` + layout `edges`), `PUT /api/layout/node` (place/move/restyle one node), `DELETE /api/layout/node/:graphNodeId` (remove placement), `POST /api/layout/batch` (batch place). Consumes `LayoutRepository` (Task 12) and `SharedApiState` (`db_path`, `active_canvas_id`). **`start_server`'s signature is unchanged** — it still takes `(SharedApiState, tauri::AppHandle)`; no `SharedGraph`/database/`Handle` is threaded in, because `GET /api/canvas` is layout-only by decision above. (Substance joins go through `load_canvas_view_command`, Task 14.)
- Produces: layout handler functions `get_canvas`, `upsert_node_layout`, `remove_node_layout`, `batch_place`, plus the canonical `api::types` names listed under *File & type ownership* above; the `canvas:updated` event still fires after any mutation.
- Consumed by: WS6 (slimmed `research-canvas` MCP `canvas_place_node` / `canvas_update_layout` / `canvas_remove_node` / `canvas_batch_place` call these routes), which only *adds* `agent_activity` recording into the existing handlers per the WS6 cross-note above.

Steps:

1. - [ ] Write the failing test `apps/desktop/src-tauri/tests/api_layout_dispatch.rs` (exercise the pure handler against a temp SQLite + an in-process state, no HTTP socket needed):

```rust
// apps/desktop/src-tauri/tests/api_layout_dispatch.rs
use research_canvas_desktop_lib::api::handlers::{remove_node_layout, upsert_node_layout};
use research_canvas_desktop_lib::api::types::{PlaceNodeRequest, RemoveNodeResponse};
use research_canvas_desktop_lib::db::{connection::Database, repositories::{layout::LayoutRepository, ProjectRepository}};
use research_canvas_desktop_lib::{ApiState, SharedApiState};
use std::sync::{Arc, Mutex};
use tempfile::tempdir;

fn state_with_canvas() -> (tempfile::TempDir, SharedApiState, String) {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("t.db");
    let db = Database::open(&db_path).unwrap();
    let project = ProjectRepository::new(db.connection())
        .create("P".into(), "p".into(), None, dir.path().to_str().unwrap().into(),
                None, None, serde_json::json!({})).unwrap();
    let canvas_id = project.primary_canvas_id.unwrap();
    let state: SharedApiState = Arc::new(Mutex::new(ApiState {
        db_path: Some(db_path.to_string_lossy().to_string()),
        active_project_id: Some(project.id),
        active_canvas_id: Some(canvas_id.clone()),
    }));
    (dir, state, canvas_id)
}

#[test]
fn place_then_remove_node_layout_via_handlers() {
    let (_dir, state, canvas_id) = state_with_canvas();
    upsert_node_layout(
        PlaceNodeRequest {
            graph_node_id: "g1".into(),
            x: 12.0, y: 34.0,
            width: Some(240.0), height: Some(160.0),
            dot_colour: None, bg_colour: None, text_colour: None, thumbnail: None,
        },
        &state,
    ).expect("place");

    let db_path = state.lock().unwrap().db_path.clone().unwrap();
    let db = Database::open(&db_path).unwrap();
    let rows = LayoutRepository::new(db.connection()).list_node_layout(&canvas_id).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].position_x, 12.0);

    let resp: RemoveNodeResponse = remove_node_layout("g1".into(), &state).expect("remove");
    assert!(resp.ok);
    let rows2 = LayoutRepository::new(Database::open(&db_path).unwrap().connection())
        .list_node_layout(&canvas_id).unwrap();
    assert_eq!(rows2.len(), 0);
}
```

2. - [ ] Run it, expect FAIL (handlers/types not yet defined):

```bash
cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" api_layout_dispatch -- --test-threads=1
```

Expected: `error[E0432]` referencing `PlaceNodeRequest` / `upsert_node_layout`.

3. - [ ] Rewrite `apps/desktop/src-tauri/src/api/types.rs` to the layout shapes (replace the whole file):

```rust
// apps/desktop/src-tauri/src/api/types.rs
use serde::{Deserialize, Serialize};

// ─── Request types ────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaceNodeRequest {
    pub graph_node_id: String,
    pub x: f64,
    pub y: f64,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub dot_colour: Option<String>,
    pub bg_colour: Option<String>,
    pub text_colour: Option<String>,
    pub thumbnail: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchPlaceItem {
    pub graph_node_id: String,
    pub x: f64,
    pub y: f64,
    pub width: Option<f64>,
    pub height: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchPlaceRequest {
    pub placements: Vec<BatchPlaceItem>,
}

// ─── Response types ───────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlacedNodeResponse {
    pub ok: bool,
    pub graph_node_id: String,
}

#[derive(Debug, Serialize)]
pub struct RemoveNodeResponse {
    pub ok: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchPlaceResponse {
    pub ok: bool,
    pub placed: usize,
}
```

4. - [ ] Rewrite `apps/desktop/src-tauri/src/api/handlers.rs`. All four handlers are **synchronous SQLite-only** (the `:9876` server runs on a plain thread, not the Tauri async executor). Per the *`GET /api/canvas` is SQLite-layout-only* decision above, `get_canvas` returns layout rows only (`canvasId` + layout `nodes` + layout `edges`) — it does **not** join Neo4j substance and does **not** need a `SharedGraph`, a runtime, or any change to `start_server`. (The substance-joined `CanvasView` is served by `load_canvas_view_command` in Task 14.) Replace the whole file:

```rust
// apps/desktop/src-tauri/src/api/handlers.rs
use crate::{
    api::types::*,
    db::{
        connection::Database,
        repositories::layout::{LayoutRepository, NodeLayoutRecord},
    },
    SharedApiState,
};

fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

fn db_path(state: &SharedApiState) -> Result<String, String> {
    state
        .lock()
        .unwrap()
        .db_path
        .clone()
        .ok_or_else(|| "App not bootstrapped yet".to_string())
}

fn active_canvas_id(state: &SharedApiState) -> Result<String, String> {
    state
        .lock()
        .unwrap()
        .active_canvas_id
        .clone()
        .ok_or_else(|| "No active canvas — open a canvas in the app first".to_string())
}

fn style_json(
    dot: &Option<String>,
    bg: &Option<String>,
    text: &Option<String>,
    thumb: &Option<String>,
) -> String {
    let mut map = serde_json::Map::new();
    if let Some(v) = dot { map.insert("dotColour".into(), serde_json::Value::String(v.clone())); }
    if let Some(v) = bg { map.insert("bgColour".into(), serde_json::Value::String(v.clone())); }
    if let Some(v) = text { map.insert("textColour".into(), serde_json::Value::String(v.clone())); }
    if let Some(v) = thumb { map.insert("thumbnail".into(), serde_json::Value::String(v.clone())); }
    serde_json::Value::Object(map).to_string()
}

/// GET /api/canvas — joined read-only view (graph substance ⨝ SQLite layout).
/// Returns the raw layout rows + canvas id; the agent uses this to know what
/// exists and where it sits. (Substance fields come from Neo4j through the app's
/// own load_canvas_view command; the :9876 read returns layout placement only,
/// which is all the place-on-canvas agent needs.)
pub fn get_canvas(state: &SharedApiState) -> Result<serde_json::Value, String> {
    let canvas_id = active_canvas_id(state)?;
    let path = db_path(state)?;
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    let repo = LayoutRepository::new(db.connection());
    let nodes = repo.list_node_layout(&canvas_id).map_err(|e| e.to_string())?;
    let edges = repo.list_edge_layout(&canvas_id).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "canvasId": canvas_id,
        "nodes": nodes,
        "edges": edges,
    }))
}

/// PUT /api/layout/node — place/move/restyle one node (upsert layout only).
pub fn upsert_node_layout(
    req: PlaceNodeRequest,
    state: &SharedApiState,
) -> Result<PlacedNodeResponse, String> {
    let canvas_id = active_canvas_id(state)?;
    let path = db_path(state)?;
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    let repo = LayoutRepository::new(db.connection());
    // Preserve existing position/size when only restyling: read, then merge.
    let existing = repo
        .list_node_layout(&canvas_id)
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|r| r.graph_node_id == req.graph_node_id);
    let (created_at, base_w, base_h) = match &existing {
        Some(r) => (r.created_at.clone(), r.width, r.height),
        None => (now(), 240.0, 160.0),
    };
    repo.upsert_node_layout(&NodeLayoutRecord {
        graph_node_id: req.graph_node_id.clone(),
        canvas_id,
        position_x: req.x,
        position_y: req.y,
        width: req.width.unwrap_or(base_w),
        height: req.height.unwrap_or(base_h),
        style_json: style_json(&req.dot_colour, &req.bg_colour, &req.text_colour, &req.thumbnail),
        created_at,
        updated_at: now(),
    })
    .map_err(|e| e.to_string())?;
    Ok(PlacedNodeResponse { ok: true, graph_node_id: req.graph_node_id })
}

/// DELETE /api/layout/node/:graphNodeId — remove placement (theory NOT deleted).
pub fn remove_node_layout(
    graph_node_id: String,
    state: &SharedApiState,
) -> Result<RemoveNodeResponse, String> {
    let canvas_id = active_canvas_id(state)?;
    let path = db_path(state)?;
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    LayoutRepository::new(db.connection())
        .delete_node_layout(&canvas_id, &graph_node_id)
        .map_err(|e| e.to_string())?;
    Ok(RemoveNodeResponse { ok: true })
}

/// POST /api/layout/batch — place many existing graph nodes at once.
pub fn batch_place(
    req: BatchPlaceRequest,
    state: &SharedApiState,
) -> Result<BatchPlaceResponse, String> {
    let canvas_id = active_canvas_id(state)?;
    let path = db_path(state)?;
    let mut db = Database::open(&path).map_err(|e| e.to_string())?;
    let tx = db.connection_mut().transaction().map_err(|e| e.to_string())?;
    {
        let repo = LayoutRepository::new(&tx);
        for item in &req.placements {
            repo.upsert_node_layout(&NodeLayoutRecord {
                graph_node_id: item.graph_node_id.clone(),
                canvas_id: canvas_id.clone(),
                position_x: item.x,
                position_y: item.y,
                width: item.width.unwrap_or(240.0),
                height: item.height.unwrap_or(160.0),
                style_json: "{}".into(),
                created_at: now(),
                updated_at: now(),
            })
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(BatchPlaceResponse { ok: true, placed: req.placements.len() })
}
```

5. - [ ] Replace the `dispatch` match arms in `apps/desktop/src-tauri/src/api/mod.rs`. Replace the whole `match (method, path) { ... }` block (lines 68–146 today) with:

```rust
    match (method, path) {
        // GET /api/canvas — joined read-only view
        (Method::Get, "/api/canvas") => match handlers::get_canvas(state) {
            Ok(data) => (200, data.to_string(), false),
            Err(e) => err(500, &e),
        },

        // PUT /api/layout/node — place/move/restyle one node
        (Method::Put, "/api/layout/node") => {
            let Some(raw) = body else { return err(400, "missing body") };
            match serde_json::from_str(&raw) {
                Ok(req) => match handlers::upsert_node_layout(req, state) {
                    Ok(data) => (200, serde_json::to_string(&data).unwrap(), true),
                    Err(e) => err(500, &e),
                },
                Err(e) => err(400, &e.to_string()),
            }
        }

        // DELETE /api/layout/node/:graphNodeId — remove placement
        (Method::Delete, p) if p.starts_with("/api/layout/node/") => {
            let graph_node_id = p.trim_start_matches("/api/layout/node/").to_string();
            if graph_node_id.is_empty() { return err(400, "missing graph node id") }
            match handlers::remove_node_layout(graph_node_id, state) {
                Ok(data) => (200, serde_json::to_string(&data).unwrap(), true),
                Err(e) => err(500, &e),
            }
        }

        // POST /api/layout/batch — batch place
        (Method::Post, "/api/layout/batch") => {
            let Some(raw) = body else { return err(400, "missing body") };
            match serde_json::from_str(&raw) {
                Ok(req) => match handlers::batch_place(req, state) {
                    Ok(data) => (201, serde_json::to_string(&data).unwrap(), true),
                    Err(e) => err(500, &e),
                },
                Err(e) => err(400, &e.to_string()),
            }
        }

        _ => err(404, "not found"),
    }
```

   Also extend the body-reading match (lines 17–24) to read the body for `Method::Put` as well:

```rust
        let body: Option<String> = match method {
            Method::Post | Method::Patch | Method::Put => {
                let mut body = String::new();
                request.as_reader().read_to_string(&mut body).ok();
                Some(body)
            }
            _ => None,
        };
```

6. - [ ] Run the test, expect PASS:

```bash
cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" api_layout_dispatch -- --test-threads=1
```

Expected: `test place_then_remove_node_layout_via_handlers ... ok`.

7. - [ ] Confirm the crate compiles (old theory handlers fully removed):

```bash
cargo build --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml"
```

Expected: `Finished` with no errors.

8. - [ ] Commit:

```bash
cd "/Users/admin/Documents/Antichrist Project" && git add apps/desktop/src-tauri/src/api/mod.rs apps/desktop/src-tauri/src/api/handlers.rs apps/desktop/src-tauri/src/api/types.rs apps/desktop/src-tauri/tests/api_layout_dispatch.rs && git commit -m "WS2: slim :9876 API to layout/place routes (drop theory mutations)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 16 — TypeScript graph types + `WorkspaceTransport` additions (Tauri + browser-bridge)

**Files:**
- Create `packages/desktop-api/src/graph.ts` (new shared graph/layout TS types per WS0 §5.1)
- Modify `packages/desktop-api/src/index.ts` (re-export `graph.ts`; extend the `WorkspaceTransport` interface; implement the new methods in `createTauriWorkspaceTransport` and `createBrowserBridgeTransport`)
- Create `packages/desktop-api/src/graph.test.ts` (vitest: read-only web build throws on mutations; type-level export presence)

**Interfaces:**
- Consumes (WS0 §5.1, §5.2, §5.3): TS types `EntityType`, `GraphNode`, `GraphRelationship`, `NodeLayout`, `EdgeLayout`, `JoinedCanvasNode`, `CanvasView`, `LitInstance`, `ArchetypalLighting`, `NewGraphNodeInput`, `GraphNodePatch`; transport methods `readGraphNode`, `createGraphNode`, `updateGraphNode`, `deleteGraphNode`, `connectGraphNodes`, `disconnectGraphNodes`, `searchGraph`, `upsertNodeLayout`, `upsertNodeLayouts`, `upsertEdgeLayout`, `upsertCanvasAppState`, `loadCanvasView`, `archetypalLighting`, `resonancesForInstance`. Consumes Tauri command names from Task 14 and the existing `invokeTauri<T>` / `requestJsonWithRetry<T>` helpers in `index.ts`.
- Produces: the extended `WorkspaceTransport` consumed by ALL UI workstreams (WS3 document view, WS4 linking, WS5 timeline, WS7 web) — they call only these methods, never Tauri/neo4rs directly (WS0 §3.2). Browser-bridge mutations throw `new Error("read-only web build")` (structural enforcement of design §6).

**`databasePath?:` convention (settled here, reused downstream):** the four layout mutation methods (`upsertNodeLayout`, `upsertNodeLayouts`, `upsertEdgeLayout`, `upsertCanvasAppState`) and the joined read `loadCanvasView` take an **optional** `databasePath?: string`. When the caller omits it, the Tauri command falls back to `SharedApiState.db_path` (Task 14, fix #1); when present, it is honoured verbatim. All other (substance) methods take no `databasePath`. This is the canonical signature shape — these `databasePath?:` parameters are part of the public `WorkspaceTransport` contract and must be carried through verbatim by every consumer.

**Cross-note to WS7 (reuse, do not redefine):** WS7 Task 3 and Task 4 MUST reuse these **exact** method signatures (including the optional `databasePath?:` on the five layout/joined methods) and the `packages/desktop-api/src/graph.ts` re-export from `index.ts` defined in step 4 below. WS7's grep guard detects the contract by matching these method names and the `from "./graph"` re-export line, so the names and the re-export string must remain stable: do not rename methods, do not change `databasePath?:` to required, and do not inline the `graph.ts` types into `index.ts` (keep them in `graph.ts`, re-exported).

Steps:

1. - [ ] Write the failing test `packages/desktop-api/src/graph.test.ts`:

```ts
// packages/desktop-api/src/graph.test.ts
import { describe, expect, it } from "vitest";
import { createBrowserBridgeTransport } from "./index";
import type { CanvasView, GraphNode } from "./graph";

describe("graph transport", () => {
  it("exports CanvasView/GraphNode types usable at runtime via a value check", () => {
    // Type-only import compiles; assert a representative object satisfies GraphNode shape.
    const node: GraphNode = {
      graphNodeId: "g1",
      entityType: "Event",
      title: "t",
      body: "[]",
      summary: "",
      archetypalResonance: null,
      coordinate: null,
      sourceCoordinates: [],
      isTemporal: true,
      validFrom: null,
      validTo: null,
      temporalPrecision: null,
      createdAt: "",
      updatedAt: "",
    };
    expect(node.graphNodeId).toBe("g1");
  });

  it("read-only web build rejects theory mutations", async () => {
    const transport = createBrowserBridgeTransport();
    await expect(
      transport.createGraphNode({ entityType: "Event", title: "x", body: "[]", isTemporal: true }),
    ).rejects.toThrow("read-only web build");
    await expect(
      transport.upsertNodeLayout({ layout: {
        graphNodeId: "g", canvasId: "c", positionX: 0, positionY: 0, width: 1, height: 1, style: {},
      } }),
    ).rejects.toThrow("read-only web build");
  });
});
```

2. - [ ] Run it, expect FAIL (graph module + methods missing):

```bash
pnpm vitest run packages/desktop-api/src/graph.test.ts
```

Expected: failure resolving `./graph` and/or `createGraphNode is not a function`.

3. - [ ] Create `packages/desktop-api/src/graph.ts` (WS0 §5.1 verbatim):

```ts
// packages/desktop-api/src/graph.ts

export type EntityType =
  | "Figure" | "People" | "Event" | "Institution" | "Source"
  | "Place" | "Work" | "Archetype" | "Dynamic" | "PsychoidOperator";

export interface GraphNode {
  graphNodeId: string;
  entityType: EntityType;
  title: string;
  body: string;
  summary: string;
  archetypalResonance: string | null;
  coordinate: string | null;
  sourceCoordinates: string[];
  isTemporal: boolean;
  validFrom: string | null;
  validTo: string | null;
  temporalPrecision:
    | "year" | "month" | "day" | "decade" | "century" | "millennium" | null;
  createdAt: string;
  updatedAt: string;
}

export interface GraphRelationship {
  id: string;
  relType: string;
  sourceGraphNodeId: string;
  targetGraphNodeId: string;
  properties: Record<string, unknown>;
}

export interface NodeLayout {
  graphNodeId: string;
  canvasId: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  style: {
    dotColour?: string; bgColour?: string; textColour?: string; thumbnail?: string;
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

export interface JoinedCanvasNode {
  node: GraphNode;
  layout: NodeLayout;
}

export interface CanvasView {
  canvasId: string;
  nodes: JoinedCanvasNode[];
  edges: EdgeLayout[];
  relationships: GraphRelationship[];
  viewport: { x: number; y: number; zoom: number };
  appState: Record<string, unknown>;
}

export interface LitInstance {
  node: GraphNode;
  relType: "INSTANTIATES" | "ECHOES";
  dominance: "dominant" | "secondary" | null;
}

export interface ArchetypalLighting {
  operator: GraphNode;
  instances: LitInstance[];
}

export interface NewGraphNodeInput {
  entityType: EntityType;
  title: string;
  body: string;
  coordinate?: string | null;
  sourceCoordinates?: string[];
  isTemporal: boolean;
  validFrom?: string | null;
  validTo?: string | null;
  temporalPrecision?: GraphNode["temporalPrecision"];
}

export type GraphNodePatch = Partial<
  Pick<GraphNode,
    "title" | "body" | "summary" | "archetypalResonance" |
    "coordinate" | "sourceCoordinates" | "isTemporal" |
    "validFrom" | "validTo" | "temporalPrecision">
>;
```

4. - [ ] Re-export the graph types from `packages/desktop-api/src/index.ts`. Add at the very top (after the existing `import type { ... } from "@research-canvas/schema";` block):

```ts
export type {
  ArchetypalLighting,
  CanvasView,
  EdgeLayout,
  EntityType,
  GraphNode,
  GraphNodePatch,
  GraphRelationship,
  JoinedCanvasNode,
  LitInstance,
  NewGraphNodeInput,
  NodeLayout,
} from "./graph";
import type {
  ArchetypalLighting,
  CanvasView,
  GraphNode,
  GraphNodePatch,
  GraphRelationship,
  LitInstance,
  NewGraphNodeInput,
  NodeLayout,
  EdgeLayout,
} from "./graph";
```

5. - [ ] Extend the `WorkspaceTransport` interface in `packages/desktop-api/src/index.ts`. Inside `interface WorkspaceTransport { ... }` (before the closing `}` at line 165 today), add:

```ts
  // ---- Substance (Neo4j) ----
  readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>;
  createGraphNode(input: NewGraphNodeInput): Promise<GraphNode>;
  updateGraphNode(input: { graphNodeId: string; patch: GraphNodePatch }): Promise<GraphNode>;
  deleteGraphNode(input: { graphNodeId: string }): Promise<void>;
  connectGraphNodes(input: {
    sourceGraphNodeId: string; targetGraphNodeId: string;
    relType: string; properties?: Record<string, unknown>;
  }): Promise<GraphRelationship>;
  disconnectGraphNodes(input: { relationshipId: string }): Promise<void>;
  searchGraph(input: { query: string; limit?: number }): Promise<GraphNode[]>;

  // ---- Layout (SQLite) ----
  // `databasePath?` is OPTIONAL on every layout/joined method: omit it and the
  // Tauri command falls back to SharedApiState.db_path (Task 14). WS7 Task 3/4
  // reuse these exact signatures — keep `databasePath?:` optional, do not rename.
  upsertNodeLayout(input: { databasePath?: string; layout: NodeLayout }): Promise<void>;
  upsertNodeLayouts(input: { databasePath?: string; canvasId: string; layouts: NodeLayout[] }): Promise<number>;
  upsertEdgeLayout(input: { databasePath?: string; layout: EdgeLayout }): Promise<void>;
  upsertCanvasAppState(input: {
    databasePath?: string; canvasId: string;
    viewport: { x: number; y: number; zoom: number };
    appState: Record<string, unknown>;
  }): Promise<void>;

  // ---- Joined reads (both targets) ----
  loadCanvasView(input: { databasePath?: string; canvasId: string; lens: "canvas" | "timeline" }): Promise<CanvasView>;

  // ---- Two-lens / archetypal lighting ----
  archetypalLighting(input: { operatorGraphNodeId: string }): Promise<ArchetypalLighting>;
  resonancesForInstance(input: { graphNodeId: string }): Promise<LitInstance[]>;
```

6. - [ ] Implement the methods in `createTauriWorkspaceTransport` (before its closing `};`). Each maps to a Task 14 command name:

```ts
    async readGraphNode(input) {
      return invokeTauri<GraphNode>("read_graph_node_command", { request: input });
    },
    async createGraphNode(input) {
      return invokeTauri<GraphNode>("create_graph_node_command", { request: input });
    },
    async updateGraphNode(input) {
      return invokeTauri<GraphNode>("update_graph_node_command", { request: input });
    },
    async deleteGraphNode(input) {
      await invokeTauri<void>("delete_graph_node_command", { request: input });
    },
    async connectGraphNodes(input) {
      return invokeTauri<GraphRelationship>("connect_graph_nodes_command", { request: input });
    },
    async disconnectGraphNodes(input) {
      await invokeTauri<void>("disconnect_graph_nodes_command", { request: input });
    },
    async searchGraph(input) {
      return invokeTauri<GraphNode[]>("search_graph_command", { request: input });
    },
    async upsertNodeLayout(input) {
      await invokeTauri<void>("upsert_node_layout_command", { request: input });
    },
    async upsertNodeLayouts(input) {
      return invokeTauri<number>("upsert_node_layouts_command", { request: input });
    },
    async upsertEdgeLayout(input) {
      await invokeTauri<void>("upsert_edge_layout_command", { request: input });
    },
    async upsertCanvasAppState(input) {
      await invokeTauri<void>("upsert_canvas_app_state_command", { request: input });
    },
    async loadCanvasView(input) {
      return invokeTauri<CanvasView>("load_canvas_view_command", { request: input });
    },
    async archetypalLighting(input) {
      return invokeTauri<ArchetypalLighting>("archetypal_lighting_command", { request: input });
    },
    async resonancesForInstance(input) {
      return invokeTauri<LitInstance[]>("resonances_for_instance_command", { request: input });
    },
```

7. - [ ] Implement the methods in `createBrowserBridgeTransport` (before its closing `};`). Reads hit the bridge; mutations throw:

```ts
    async readGraphNode(input) {
      return requestJsonWithRetry<GraphNode>(
        `/graph/node/${encodeURIComponent(input.graphNodeId)}`,
      );
    },
    async searchGraph(input) {
      const params = new URLSearchParams({ query: input.query });
      if (input.limit != null) params.set("limit", String(input.limit));
      return requestJsonWithRetry<GraphNode[]>(`/graph/search?${params.toString()}`);
    },
    async loadCanvasView(input) {
      const params = new URLSearchParams({ canvasId: input.canvasId, lens: input.lens });
      return requestJsonWithRetry<CanvasView>(`/graph/canvas-view?${params.toString()}`);
    },
    async archetypalLighting(input) {
      return requestJsonWithRetry<ArchetypalLighting>(
        `/graph/lighting/${encodeURIComponent(input.operatorGraphNodeId)}`,
      );
    },
    async resonancesForInstance(input) {
      return requestJsonWithRetry<LitInstance[]>(
        `/graph/resonances/${encodeURIComponent(input.graphNodeId)}`,
      );
    },
    async createGraphNode() { throw new Error("read-only web build"); },
    async updateGraphNode() { throw new Error("read-only web build"); },
    async deleteGraphNode() { throw new Error("read-only web build"); },
    async connectGraphNodes() { throw new Error("read-only web build"); },
    async disconnectGraphNodes() { throw new Error("read-only web build"); },
    async upsertNodeLayout() { throw new Error("read-only web build"); },
    async upsertNodeLayouts() { throw new Error("read-only web build"); },
    async upsertEdgeLayout() { throw new Error("read-only web build"); },
    async upsertCanvasAppState() { throw new Error("read-only web build"); },
```

8. - [ ] Run the test + type-check, expect PASS:

```bash
pnpm vitest run packages/desktop-api/src/graph.test.ts && pnpm exec tsc -b packages/desktop-api
```

Expected: `graph.test.ts` → `2 passed`; tsc → no errors.

9. - [ ] Commit:

```bash
cd "/Users/admin/Documents/Antichrist Project" && git add packages/desktop-api/src/graph.ts packages/desktop-api/src/index.ts packages/desktop-api/src/graph.test.ts && git commit -m "WS2: TS graph types + WorkspaceTransport substance/layout methods (read-only web throws)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 17 — Seed-target shape for `:Operator` nodes + idempotent `seed_operators` (import script deferred)

This defines the **target shape** of seeded psychoid/MEF/Archetype operator nodes and an idempotent loader that ingests a checked-in JSON manifest. Per design OQ-1, the *mechanism that mirrors the canonical Epi-Logos source* (export script vs. thin sync) is **deferred**; this task provides the clean seam: a small committed `operators.seed.json` with a handful of canonical operators and a `seed_operators(manifest)` method that upserts them as `:Operator` nodes. The deferred import script's only job later is to produce a richer `operators.seed.json` — no code here changes.

**Files:**
- Create `apps/desktop/src-tauri/seeds/operators.seed.json` (committed seed manifest, minimal canonical set)
- Modify `apps/desktop/src-tauri/src/db/repositories/graph.rs` (add `OperatorSeed` type + `seed_operators`)
- Modify `apps/desktop/src-tauri/src/db/repositories/mod.rs` (re-export `OperatorSeed`)
- Create `apps/desktop/src-tauri/tests/graph_seed_operators.rs`

**Interfaces:**
- Consumes (WS0 §2.1, §2.2, §2.4, design §4.1): `:Operator` label rule (operators are NOT `:TheoryNode`); `PsychoidOperator` extra props `operator_kind` (`"psychoid"|"mef_lens"|"coordinate_anchor"`), `position` (`"#0".."#5"`); unique `coordinate` constraint (`operator_coordinate`, Task 5); `coordinate` + `source_coordinates[]` grammar. Consumes `SharedGraph` (Task 4).
- Produces:
  ```rust
  #[derive(Serialize, Deserialize)] pub struct OperatorSeed {
      pub coordinate: String, pub title: String,
      pub operator_kind: String, pub position: Option<String>,
      pub source_coordinates: Vec<String>,
  }
  impl GraphRepository {
      pub async fn seed_operators(&self, operators: &[OperatorSeed]) -> Result<usize, String>;
  }
  ```
- Consumed by: WS4/WS5 (relating theory nodes to operators); the deferred import script (replaces the manifest only).

Steps:

1. - [ ] Create the committed seed manifest `apps/desktop/src-tauri/seeds/operators.seed.json` (minimal canonical set: psychoids #0–#5 + one MEF lens anchor). This is the deferred-import seam — the script later regenerates this file:

```json
[
  { "coordinate": "#0", "title": "Psychoid #0 — Anuttara (void ground)", "operatorKind": "psychoid", "position": "#0", "sourceCoordinates": ["#0"] },
  { "coordinate": "#1", "title": "Psychoid #1 — Paramasiva (one)", "operatorKind": "psychoid", "position": "#1", "sourceCoordinates": ["#1"] },
  { "coordinate": "#2", "title": "Psychoid #2 — Parashakti (two/polarity)", "operatorKind": "psychoid", "position": "#2", "sourceCoordinates": ["#2"] },
  { "coordinate": "#3", "title": "Psychoid #3 — Mahamaya (three/mediation)", "operatorKind": "psychoid", "position": "#3", "sourceCoordinates": ["#3"] },
  { "coordinate": "#4", "title": "Psychoid #4 — Nara (context/four)", "operatorKind": "psychoid", "position": "#4", "sourceCoordinates": ["#4"] },
  { "coordinate": "#5", "title": "Psychoid #5 — Epii (synthesis/quintessence)", "operatorKind": "psychoid", "position": "#5", "sourceCoordinates": ["#5"] },
  { "coordinate": "L2", "title": "MEF Lens L2 — logical lens", "operatorKind": "mef_lens", "position": null, "sourceCoordinates": ["L2", "#2"] }
]
```

2. - [ ] Write the failing test `apps/desktop/src-tauri/tests/graph_seed_operators.rs`:

```rust
// apps/desktop/src-tauri/tests/graph_seed_operators.rs
mod support;
use neo4rs::query;
use research_canvas_desktop_lib::db::repositories::graph::{GraphRepository, OperatorSeed};

#[test]
fn seed_operators_is_idempotent_and_writes_operator_label() {
    let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
        eprintln!("skipping: NEO4J_TEST_URI unset");
        return;
    };
    let repo = GraphRepository::new(graph.clone(), database.clone());
    support::block_on(repo.ensure_schema()).expect("schema");

    let coord = format!("#0-{run_id}");
    let seeds = vec![OperatorSeed {
        coordinate: coord.clone(),
        title: "Psychoid #0".into(),
        operator_kind: "psychoid".into(),
        position: Some("#0".into()),
        source_coordinates: vec![coord.clone()],
    }];

    let n1 = support::block_on(repo.seed_operators(&seeds)).expect("seed once");
    assert_eq!(n1, 1);
    // Idempotent: re-seeding the same coordinate does not duplicate.
    let n2 = support::block_on(repo.seed_operators(&seeds)).expect("seed twice");
    assert_eq!(n2, 1);

    let (count, is_operator, not_theory): (i64, bool, bool) = support::block_on(async {
        let mut rows = graph.execute_on(&database, query(
            "MATCH (n {coordinate: $c}) \
             RETURN count(n) AS c, any(l IN labels(n) WHERE l = 'Operator') AS isOp, \
                    none(l IN labels(n) WHERE l = 'TheoryNode') AS notTheory",
        ).param("c", coord.clone())).await.expect("q");
        let row = rows.next().await.expect("row").expect("some");
        (row.get("c").unwrap(), row.get("isOp").unwrap(), row.get("notTheory").unwrap())
    });
    assert_eq!(count, 1, "exactly one operator node for the coordinate");
    assert!(is_operator, "carries :Operator");
    assert!(not_theory, "operators are NOT :TheoryNode");

    support::block_on(async {
        graph.run_on(&database, query("MATCH (n {coordinate: $c}) DETACH DELETE n")
            .param("c", coord)).await.expect("cleanup");
    });
}
```

3. - [ ] Run it, expect FAIL:

```bash
cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml graph_seed_operators -- --test-threads=1
```

Expected: `error[E0432]` / `cannot find type 'OperatorSeed'`.

4. - [ ] Add the `OperatorSeed` type (near the other structs at the top of `graph.rs`) and `seed_operators` (in `impl GraphRepository`). The type:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperatorSeed {
    pub coordinate: String,
    pub title: String,
    pub operator_kind: String,
    pub position: Option<String>,
    pub source_coordinates: Vec<String>,
}
```

   The method (MERGE on `coordinate` so re-seeding is idempotent; operators carry `:Operator` + `:PsychoidOperator`, never `:TheoryNode`):

```rust
    pub async fn seed_operators(&self, operators: &[OperatorSeed]) -> Result<usize, String> {
        for op in operators {
            let now = now_rfc3339();
            let q = query(
                "MERGE (n:Operator {coordinate: $coordinate}) \
                 SET n:PsychoidOperator, \
                     n.graph_node_id = coalesce(n.graph_node_id, $id), \
                     n.title = $title, \
                     n.operator_kind = $operator_kind, \
                     n.position = $position, \
                     n.source_coordinates = $source_coordinates, \
                     n.is_temporal = false, \
                     n.created_at = coalesce(n.created_at, $now), \
                     n.updated_at = $now",
            )
            .param("coordinate", op.coordinate.clone())
            .param("id", uuid::Uuid::new_v4().to_string())
            .param("title", op.title.clone())
            .param("operator_kind", op.operator_kind.clone())
            .param("position", op.position.clone())
            .param("source_coordinates", op.source_coordinates.clone())
            .param("now", now);
            self.graph
                .run_on(&self.database, q)
                .await
                .map_err(|e| format!("seed_operators failed for {}: {e}", op.coordinate))?;
        }
        Ok(operators.len())
    }
```

5. - [ ] Re-export `OperatorSeed`. In `apps/desktop/src-tauri/src/db/repositories/mod.rs`, extend the `pub use graph::{...}` block to include `OperatorSeed`:

```rust
pub use graph::{
    ArchetypalLightingResult, GraphNode, GraphNodePatch, GraphRelationship, GraphRepository,
    LitInstance, NewGraphNode, OperatorSeed,
};
```

6. - [ ] Run the test, expect PASS:

```bash
cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml graph_seed_operators -- --test-threads=1 --nocapture
```

Expected: `test seed_operators_is_idempotent_and_writes_operator_label ... ok`.

7. - [ ] Commit:

```bash
cd "/Users/admin/Documents/Antichrist Project" && git add apps/desktop/src-tauri/seeds/operators.seed.json apps/desktop/src-tauri/src/db/repositories/graph.rs apps/desktop/src-tauri/src/db/repositories/mod.rs apps/desktop/src-tauri/tests/graph_seed_operators.rs && git commit -m "WS2: operator seed-target shape + idempotent seed_operators (import script deferred)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 18 — Graphiti MCP config doc + full suite verification

**Files:**
- Create `docs/setup/graphiti-mcp.md` (how to run the external Graphiti MCP against the same Neo4j + Gemini models — the authoring path)
- No code changes; this task verifies the whole workstream.

**Interfaces:**
- Consumes (WS0 §1.1, §1.3, design §5.2, OQ-2): env vars `GOOGLE_API_KEY`, `GRAPHITI_LLM_MODEL=gemini-2.5-flash`, `GRAPHITI_EMBEDDER_MODEL=gemini-embedding-001`, `GRAPHITI_RERANKER_MODEL=gemini-2.5-flash-lite`, and `NEO4J_*` from `.env`. The MCP writes the SAME labels/properties/relationships defined in WS0 §2 that `GraphRepository` reads.
- Produces: documentation only. No interfaces other plans consume.

Steps:

1. - [ ] Create `docs/setup/graphiti-mcp.md` with exactly this content:

```markdown
# Graphiti MCP — theory authoring path

The terminal coding agent (Claude Code / Codex) authors theory **substance** into the
same local Neo4j the desktop app reads. It does this through the **external official
Graphiti MCP server** (Python), not through this repo's `research-canvas` MCP (which is
slimmed to a place-on-canvas / layout role — see WS6).

## What writes what

- **Graphiti MCP** → `graphiti-core` → official Neo4j Python driver → bolt → Neo4j.
  Owns entity extraction, dedup, bi-temporal bookkeeping, embeddings.
- **Desktop app (Rust)** → `neo4rs` → bolt → same Neo4j. Owns fast CRUD + projection.

Both write the labels/properties/relationships in
`docs/superpowers/plans/2026-06-28-ws0-contracts-and-architecture.md` §2, so a node
authored by Graphiti is readable by the app and vice-versa. The single join key is
`graph_node_id` (app-minted UUIDv4); the app stores layout for it in SQLite.

## Prerequisites

1. Neo4j running: `docker compose up -d neo4j` (see repo-root `docker-compose.yml`).
2. A `.env` at repo root (copy `.env.example`) with `NEO4J_PASSWORD` and `GOOGLE_API_KEY` set.

## Models (resolved, OQ-2)

| Role | Model id | Env var |
|---|---|---|
| LLM | `gemini-2.5-flash` | `GRAPHITI_LLM_MODEL` |
| Embedder | `gemini-embedding-001` | `GRAPHITI_EMBEDDER_MODEL` |
| Reranker (optional) | `gemini-2.5-flash-lite` | `GRAPHITI_RERANKER_MODEL` |

Never use `-preview-*` model ids (deprecated upstream). A local-embedder fallback is
conceptually available for a no-metered-API mode.

## Running the MCP

The Graphiti MCP server is an external package; install and run it per its upstream
README, pointing it at this repo's `.env`:

```bash
set -a && . ./.env && set +a
# Graphiti reads NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD / NEO4J_DATABASE and
# GOOGLE_API_KEY / GRAPHITI_LLM_MODEL / GRAPHITI_EMBEDDER_MODEL from the environment.
# Start the official Graphiti MCP server (uvx / pipx / docker per upstream docs).
```

Register it with the terminal agent as an MCP server. Custom entity types (Figure,
People, Event, Institution, Source, Place, Work, Archetype, Dynamic) and relationship
types (INSTANTIATES, ECHOES, CAUSES, INFLUENCES, OPPOSES, INHERITS, TRANSFORMS_INTO,
LOCATED_AT, SOURCED_FROM, RESONATES_WITH) match WS0 §2.

## Seeded operators

Canonical psychoid/MEF/Archetype operator nodes are loaded by the app's
`GraphRepository::seed_operators` from `apps/desktop/src-tauri/seeds/operators.seed.json`
as `:Operator` nodes (NOT `:TheoryNode`). The mechanism that mirrors the canonical
Epi-Logos source into that manifest is deferred (design OQ-1); only the JSON is
regenerated when that lands — no app code changes.
```

2. - [ ] Run the full Rust suite **without** Neo4j (skip-path green) to confirm no regressions and that all non-Neo4j tests pass:

```bash
cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" -- --test-threads=1
```

Expected: all test binaries report `ok`; Neo4j-backed tests print `skipping: NEO4J_TEST_URI unset` and still count as passed.

3. - [ ] Run the full Rust suite **with** Neo4j to confirm real integration coverage:

```bash
cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1
```

Expected: all test binaries `ok`, including `graph_node_crud`, `graph_relationships`, `graph_lighting`, `canvas_view_join`, `graph_seed_operators`.

4. - [ ] Run the TS suite + type-check for the touched package:

```bash
pnpm vitest run packages/desktop-api/src/graph.test.ts && pnpm exec tsc -b packages/desktop-api
```

Expected: `2 passed`; tsc no errors.

5. - [ ] Commit:

```bash
cd "/Users/admin/Documents/Antichrist Project" && git add docs/setup/graphiti-mcp.md && git commit -m "WS2: Graphiti MCP setup doc + workstream verification

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done When

- [ ] `docker compose up -d neo4j` brings up Neo4j 5.26 with APOC on `bolt://127.0.0.1:7687`; `.env.example` is committed and `.env` is git-ignored (Task 1).
- [ ] `neo4rs` + `tokio` are dependencies and `Neo4jConfig::from_env()` + `neo4j::connect()` produce a working `SharedGraph` (Tasks 2–4).
- [ ] `GraphRepository::ensure_schema()` creates the WS0 §2.4 constraints + indexes idempotently (`theory_node_id`, `operator_node_id`, `operator_coordinate`, lookup indexes, `theory_node_fulltext`) (Task 5).
- [ ] `GraphRepository` supports full node CRUD (`create_node`/`get_node`/`update_node` with `Some(None)` clear-semantics/`delete_node`), lens listing (`list_nodes_for_lens` filters timeline to `is_temporal == true`), batch fetch (`get_nodes`), relationship CRUD (`connect_nodes`/`disconnect`/`list_relationships`/`relationships_for_node`), and `archetypal_lighting`/`resonances_for_instance`/`search` matching the WS0 §8.2 Cypher contract — each proven by a real-Neo4j integration test (Tasks 6–11).
- [ ] SQLite migration `0008_layout_store` creates `node_layout`/`canvas_app_state`/`edge_layout`; the migrations test expects 8 migrations; `LayoutRepository` upserts/lists/deletes layout incrementally with `upsert_node_layouts` returning a count (Task 12).
- [ ] `CanvasService::load_canvas_view(canvas_id, lens)` joins Neo4j substance with SQLite layout in Rust on `graph_node_id`, auto-places substance nodes lacking a layout row, drops orphan layout rows, and serves both `"canvas"` and `"timeline"` lenses (Task 13).
- [ ] Fourteen `async` Tauri commands are registered in `lib.rs` `generate_handler!` and a `SharedGraphState` (graph + database) is managed at startup with `ensure_schema` run once; the crate builds (Task 14).
- [ ] The internal `:9876` HTTP API no longer exposes theory mutations; it serves `GET /api/canvas` (read-only joined/layout view), `PUT /api/layout/node`, `DELETE /api/layout/node/:graphNodeId`, `POST /api/layout/batch`, and still emits `canvas:updated` after mutations (Task 15).
- [ ] `WorkspaceTransport` exposes the substance + layout + joined-read + lighting methods; the Tauri transport invokes the Task 14 commands; the browser-bridge transport implements reads and **throws `read-only web build`** on every mutation (Task 16).
- [ ] Operator seed-target shape is defined: `seed_operators` upserts `:Operator` (+ `:PsychoidOperator`) nodes from the committed `operators.seed.json`, idempotent on `coordinate`, never `:TheoryNode`; the actual Epi-Logos import script remains a clean deferred seam (Task 17).
- [ ] `docs/setup/graphiti-mcp.md` documents the Gemini models (`gemini-2.5-flash` / `gemini-embedding-001` / `gemini-2.5-flash-lite`) and the shared-Neo4j authoring path; the full Rust suite passes both with and without `NEO4J_TEST_URI`, and `packages/desktop-api` tests + tsc pass (Task 18).
- [ ] Clean cutover holds: Neo4j is the source of truth for substance and SQLite holds layout only, joined exclusively by `graph_node_id` in the Rust layer (never across the DB boundary in SQL).

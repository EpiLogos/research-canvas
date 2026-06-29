# WS0 — Shared Contracts & Architecture

**Status:** Authoritative reference (single source of truth)
**Date:** 2026-06-28
**Reads with:** `docs/superpowers/specs/2026-06-28-antichrist-theory-tool-design.md` (the design); this doc makes the design's decisions *concrete* (real names + signatures).

## 0. Purpose & how the 7 workstreams use this

This document is the contract layer. Every per-workstream plan (WS1 saving, WS2 data layer, WS3 node-as-document, WS4 content/linking, WS5 timeline, WS6 terminal/agent, WS7 web/repo) **references the names and signatures here** instead of inventing its own, so interfaces line up across plans.

Naming convention used throughout: a Neo4j theory node's stable id is **`graph_node_id`** (string, app-minted UUIDv4). SQLite layout rows are keyed by that same `graph_node_id`. The two stores are joined *only* by `graph_node_id`. There is no foreign key across the database boundary; the join is performed in the Rust repository layer and re-exposed to the frontend already joined.

Decision recorded once, applies everywhere: **Neo4j = theory substance** (node bodies, relationships, temporal validity, provenance, archetypal relations). **SQLite = presentation only** (position, size, style, viewport, app-state), each row carrying a `graph_node_id`.

---

## 1. Neo4j access pattern (DECIDED)

### 1.1 Topology

Two writers, one database. Both processes connect to the **same local Neo4j** over the bolt protocol.

| Process | Language | Path to Neo4j | Role |
|---|---|---|---|
| Tauri desktop app | Rust | **`neo4rs` crate (bolt driver), direct** | Reads + writes theory nodes/relationships for the UI; reads layout from SQLite; performs the join |
| Terminal agent (Claude Code / Codex) | — | **Graphiti MCP server** (Python) → Graphiti pipeline → bolt | Authors nodes/episodes/relationships with provenance, dedup, embeddings |
| Graphiti MCP server | Python | `graphiti-core` → official Neo4j Python driver → bolt | Runs Graphiti's ingestion pipeline (Gemini LLM + embeddings) |

The Rust app does **not** go through Graphiti for reads/writes — it talks bolt directly via `neo4rs`. Graphiti owns the *authoring intelligence* (entity extraction, dedup, bi-temporal bookkeeping); the app owns *fast direct CRUD + projection*. Both write the same labels/properties/relationships defined in §2, so a node authored by Graphiti is readable by the app and vice-versa.

### 1.2 `neo4rs` crate (evaluated → ADOPT)

- Crate: `neo4rs = "0.8"` — pure-Rust async bolt driver, Bolt 4.x/5.x, supports Neo4j 5.x. Maintained, no native deps (works with the existing `rusqlite` bundled build). Add to `apps/desktop/src-tauri/Cargo.toml`.
- Requires an async runtime. Add `tokio = { version = "1", features = ["rt-multi-thread", "macros"] }`. The Rust repository layer (§4) is `async`; Tauri commands already run on Tauri's async executor, so commands become `async fn` and `.await` the repo. A single shared `neo4rs::Graph` (connection pool) is created at startup and stored in Tauri managed state alongside `SharedApiState`.

```toml
# apps/desktop/src-tauri/Cargo.toml  [dependencies] additions
neo4rs = "0.8"
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
```

### 1.3 Connection config & credentials

Single source of connection config, read at app startup and by the Graphiti MCP. Lives in **env vars** (no secrets committed). Defaults target the docker-compose service below.

| Env var | Default | Used by |
|---|---|---|
| `NEO4J_URI` | `bolt://127.0.0.1:7687` | Rust (`neo4rs`), Graphiti MCP |
| `NEO4J_USER` | `neo4j` | both |
| `NEO4J_PASSWORD` | (required, no default) | both |
| `NEO4J_DATABASE` | `neo4j` | both |
| `GOOGLE_API_KEY` | (required for Graphiti) | Graphiti MCP only |
| `GRAPHITI_LLM_MODEL` | `gemini-2.5-flash` | Graphiti MCP only |
| `GRAPHITI_EMBEDDER_MODEL` | `gemini-embedding-001` | Graphiti MCP only |
| `GRAPHITI_RERANKER_MODEL` | `gemini-2.5-flash-lite` | Graphiti MCP only |

Rust config struct (constructed from env, used to build the `neo4rs::Graph`):

```rust
// apps/desktop/src-tauri/src/db/neo4j/config.rs
pub struct Neo4jConfig {
    pub uri: String,       // NEO4J_URI
    pub user: String,      // NEO4J_USER
    pub password: String,  // NEO4J_PASSWORD
    pub database: String,  // NEO4J_DATABASE
}

impl Neo4jConfig {
    pub fn from_env() -> Result<Self, String>;
}

// apps/desktop/src-tauri/src/db/neo4j/mod.rs
pub type SharedGraph = std::sync::Arc<neo4rs::Graph>;
pub async fn connect(config: &Neo4jConfig) -> Result<SharedGraph, String>;
```

Env file convention: `.env` at repo root (git-ignored), `.env.example` committed with the table above (password/key blank). The Tauri app loads it at startup; the Graphiti MCP loads the same file.

### 1.4 docker-compose service shape

`docker-compose.yml` at repo root, single service:

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

Graphiti requires Neo4j 5.26+ (or compatible). APOC is enabled because Graphiti uses it. The app and the MCP both connect to `bolt://127.0.0.1:7687`.

---

## 2. Graph data model (Neo4j schema)

### 2.1 Node labels

Every theory node carries the label **`:TheoryNode`** plus exactly one **entity-type** label from the set below (so generic queries hit `:TheoryNode`, typed queries hit the specific label). Seeded operator nodes carry **`:Operator`** + their type label and are *not* `:TheoryNode` (they are canonical references, not authored theory).

| Entity-type label | Carries `:TheoryNode` | Temporal character | Lens |
|---|---|---|---|
| `Figure` | yes | temporal (lifespan) | timeline + canvas |
| `People` | yes | temporal (span) | timeline + canvas |
| `Event` | yes | temporal (point/span) | timeline + canvas |
| `Institution` | yes | temporal (founded→) | timeline + canvas |
| `Source` | yes | temporal + provenance | timeline + canvas |
| `Place` | yes | mostly atemporal | canvas (timeline if dated) |
| `Work` | yes | trans-temporal | canvas |
| `Archetype` | yes | trans-temporal | canvas (lighting source) |
| `Dynamic` | yes | trans-temporal | canvas (lighting source) |
| `PsychoidOperator` | no (`:Operator`) | atemporal (seeded) | canvas (lighting source) |

`People` = the spec's "People / Civilization". `Dynamic` = the spec's "Dynamic / Concept". `PsychoidOperator` covers QL positions #0–#5 and MEF/L-lenses (seeded). `Archetype` and `Dynamic` are first-class authored types; `PsychoidOperator` is seeded.

### 2.2 Property keys

Common properties on **every** `:TheoryNode` (and, where noted, on `:Operator`):

| Property | Type | On | Notes |
|---|---|---|---|
| `graph_node_id` | string (UUIDv4) | all | **PK for the SQLite join.** App-minted. Unique. |
| `title` | string | all | display title |
| `body` | string (JSON) | TheoryNode | BlockNote/ProseMirror doc JSON (§7). Empty doc default. |
| `summary` | string | TheoryNode | plain-text digest of body (search/compact view) |
| `archetypal_resonance` | string | TheoryNode | the **one** allowed archetypal *summary* property (§4 of design); regenerable caption, NOT the data store |
| `coordinate` | string \| null | all | standalone Bimba ground reference, no family prefix (e.g. `"#2"`) |
| `source_coordinates` | string[] | all | multi-form links to canonical operator/coordinate nodes, e.g. `["#2","L2","C3"]`. Always an array (may be empty). |
| `created_at` | string (RFC3339) | all | |
| `updated_at` | string (RFC3339) | all | |

Temporal-validity properties (present on temporally-located nodes; **absent/null on trans-temporal nodes** — that absence is the two-lens signal, §8):

| Property | Type | Meaning |
|---|---|---|
| `valid_from` | string (ISO-8601 date/datetime) \| null | start of the node's own temporal extent (e.g. birth, founding, event start) |
| `valid_to` | string (ISO-8601) \| null | end (death, dissolution, event end); null = ongoing/open |
| `temporal_precision` | string \| null | `"year" \| "month" \| "day" \| "decade" \| "century" \| "millennium"` — drives timeline semantic zoom |
| `is_temporal` | boolean | **derived/explicit flag** the frontend keys on (true ⇒ project onto timeline). Defaults: true for Figure/People/Event/Institution/Source, false for Work/Archetype/Dynamic/Place/PsychoidOperator. Authorable per-node (a dated Place sets it true). |

Type-specific optional properties:

| Label | Extra properties |
|---|---|
| `Source` | `source_kind` (string: `"text"\|"document"\|"artwork"\|"film"\|...`), `citation` (string) |
| `Place` | `latitude` (float\|null), `longitude` (float\|null) |
| `PsychoidOperator` | `operator_kind` (string: `"psychoid"\|"mef_lens"\|"coordinate_anchor"`), `position` (string: e.g. `"#0".."#5"`) |

`body` is stored as a **JSON string** (not a Neo4j map) because ProseMirror docs are arbitrary nested structures; Neo4j property values cannot be nested maps. Embedded images live inside `body` as block attrs referencing asset paths (§7).

### 2.3 Relationship types

All relationships are stored **directed** in Neo4j; the design's "polarity"/"resonates-with" are conceptually symmetric but persisted with a canonical direction and read both ways by queries. Relationship type names are SCREAMING_SNAKE (Neo4j convention).

| Type | Direction (from)→(to) | Key properties | Meaning |
|---|---|---|---|
| `INSTANTIATES` | (datable TheoryNode)→(Archetype\|Dynamic\|PsychoidOperator) | `dominance` (string `"dominant"\|"secondary"`), `valid_from?`, `valid_to?` | **the spine.** A datable instance realizes a trans-temporal pattern. Powers archetypal lighting (§8). |
| `ECHOES` | (TheoryNode)→(Archetype\|Dynamic\|Work) | `dominance?`, `note?` | weaker recurrence than INSTANTIATES; same lighting query treats both. |
| `CAUSES` | (Event\|Figure\|Institution)→(Event\|...) | `valid_from?`, `confidence?` | direct historical consequence |
| `INFLUENCES` | (TheoryNode)→(TheoryNode) | `channel?` (string), `valid_from?` | ideological/textual transmission (design "influences/transmits") |
| `OPPOSES` | (TheoryNode)→(TheoryNode) | `axis?` (string) | polarity (Christ↔Antichrist); read symmetrically |
| `INHERITS` | (TheoryNode)→(TheoryNode) | `via?` (string) | lineage / dynastic / institutional succession (design "inherits/descends") |
| `TRANSFORMS_INTO` | (TheoryNode)→(TheoryNode) | `valid_from?` | metamorphosis (visible empire → invisible governance) |
| `LOCATED_AT` | (TheoryNode)→(Place) | `valid_from?`, `valid_to?` | placement |
| `SOURCED_FROM` | (TheoryNode)→(Source) | `episode_id?` (Graphiti episode), `quote?` | provenance |
| `RESONATES_WITH` | (TheoryNode)→(Archetype\|PsychoidOperator) | `strength?` (float 0..1) | archetypal-field link complementing `source_coordinates[]`; read symmetrically |

Graphiti also writes its own internal episodic structure (`:Episodic`, `MENTIONS`, etc.); the app **does not** depend on Graphiti's internal labels except `SOURCED_FROM.episode_id` for provenance display. The app's queries are written against the labels/relationships in this section only.

### 2.4 Constraints & indexes (Cypher, run on startup / migration)

```cypher
-- Uniqueness: the SQLite join key must be unique and present
CREATE CONSTRAINT theory_node_id IF NOT EXISTS
  FOR (n:TheoryNode) REQUIRE n.graph_node_id IS UNIQUE;
CREATE CONSTRAINT operator_node_id IF NOT EXISTS
  FOR (n:Operator) REQUIRE n.graph_node_id IS UNIQUE;
CREATE CONSTRAINT operator_coordinate IF NOT EXISTS
  FOR (n:Operator) REQUIRE n.coordinate IS UNIQUE;

-- Lookup indexes
CREATE INDEX theory_node_title IF NOT EXISTS FOR (n:TheoryNode) ON (n.title);
CREATE INDEX theory_node_is_temporal IF NOT EXISTS FOR (n:TheoryNode) ON (n.is_temporal);
CREATE INDEX theory_node_valid_from IF NOT EXISTS FOR (n:TheoryNode) ON (n.valid_from);
CREATE INDEX theory_node_coordinate IF NOT EXISTS FOR (n:TheoryNode) ON (n.coordinate);

-- Full-text over title + summary (timeline/canvas search)
CREATE FULLTEXT INDEX theory_node_fulltext IF NOT EXISTS
  FOR (n:TheoryNode) ON EACH [n.title, n.summary, n.archetypal_resonance];
```

`graph_node_id` uniqueness is the load-bearing constraint: it guarantees the SQLite layout join is 1:1.

---

## 3. SQLite layout store (repurposed)

The existing `canvas_nodes`/`canvas_edges` tables held *theory + layout fused*. After WS2 they hold **layout only**, keyed by `graph_node_id`. WS1 (saving) and WS2 (data layer) own this migration. New migration file: `apps/desktop/src-tauri/migrations/0008_layout_store.sql` (registered in `migrations.rs` MIGRATIONS array as `0008_layout_store`).

### 3.1 Tables

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
    style_json     TEXT NOT NULL DEFAULT '{}',  -- { dotColour?, bgColour?, textColour?, thumbnail? }
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (canvas_id, graph_node_id)
);
CREATE INDEX IF NOT EXISTS idx_node_layout_graph_node_id ON node_layout(graph_node_id);

-- Per-canvas viewport + app-state (one row per canvas).
CREATE TABLE IF NOT EXISTS canvas_app_state (
    canvas_id      TEXT PRIMARY KEY NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    viewport_json  TEXT NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
    app_state_json TEXT NOT NULL DEFAULT '{}',  -- panel open/closed, active lens, etc.
    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Edges become pure layout/relation-mirror rows keyed by graph relation, optional in v1.
-- Edge SUBSTANCE (typed relationships) lives in Neo4j (§2.3). This table only caches
-- per-canvas visual routing/handles for edges the user has hand-placed.
CREATE TABLE IF NOT EXISTS edge_layout (
    id                TEXT PRIMARY KEY NOT NULL,
    canvas_id         TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    source_graph_node_id TEXT NOT NULL,
    target_graph_node_id TEXT NOT NULL,
    relation_kind     TEXT NOT NULL,           -- mirrors the Neo4j relationship type
    source_handle_id  TEXT,
    target_handle_id  TEXT,
    style_json        TEXT NOT NULL DEFAULT '{}',
    created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_edge_layout_canvas_id ON edge_layout(canvas_id);
```

### 3.2 The join

The app never joins across the DB boundary in SQL. The Rust layer fetches:
1. `GraphRepository::list_nodes_for_lens(...)` → Neo4j substance keyed by `graph_node_id`.
2. `LayoutRepository::list_node_layout(canvas_id)` → SQLite layout keyed by `graph_node_id`.
3. Zips them in Rust on `graph_node_id` into `JoinedCanvasNode` (§5.1 mirrors the TS shape). Nodes with substance but no layout row get a deterministic auto-placed default (so an agent-authored node still surfaces); layout rows with no substance are dropped (orphan).

The legacy `canvas_nodes`, `canvas_edges`, `canvas_annotations` tables are retained by the migration (not dropped) for annotations; annotations stay as-is. WS1's incremental-save work targets `node_layout` / `edge_layout` / `canvas_app_state` (and annotations) going forward.

---

## 4. Rust repository interfaces

Two repositories, mirroring the two stores. Both live under `apps/desktop/src-tauri/src/db/repositories/`. `GraphRepository` is async (`neo4rs`); `LayoutRepository` is sync (`rusqlite`, matching existing repos).

### 4.1 Shared Rust types

```rust
// apps/desktop/src-tauri/src/db/repositories/graph.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub graph_node_id: String,
    pub entity_type: String,        // "Figure" | "Event" | ... | "PsychoidOperator"
    pub title: String,
    pub body: String,               // ProseMirror/BlockNote JSON (string)
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
    pub id: String,                 // neo4j element id, as string
    pub rel_type: String,           // "INSTANTIATES" | "CAUSES" | ...
    pub source_graph_node_id: String,
    pub target_graph_node_id: String,
    pub properties: serde_json::Value,  // { dominance?, valid_from?, ... }
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
    pub coordinate: Option<Option<String>>,        // Some(None) clears
    pub source_coordinates: Option<Vec<String>>,
    pub is_temporal: Option<bool>,
    pub valid_from: Option<Option<String>>,
    pub valid_to: Option<Option<String>>,
    pub temporal_precision: Option<Option<String>>,
}

/// Lighting result: an Archetype/Dynamic/Operator and the datable instances it lights.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchetypalLightingResult {
    pub operator: GraphNode,            // the trans-temporal node selected
    pub instances: Vec<LitInstance>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LitInstance {
    pub node: GraphNode,                // the datable instance (is_temporal == true)
    pub rel_type: String,               // "INSTANTIATES" | "ECHOES"
    pub dominance: Option<String>,      // "dominant" | "secondary"
}
```

### 4.2 `GraphRepository` (Neo4j theory CRUD)

```rust
pub struct GraphRepository {
    graph: crate::db::neo4j::SharedGraph,
    database: String,
}

impl GraphRepository {
    pub fn new(graph: crate::db::neo4j::SharedGraph, database: String) -> Self;

    /// One-time idempotent constraint/index setup (§2.4).
    pub async fn ensure_schema(&self) -> Result<(), String>;

    // ---- Node CRUD ----
    pub async fn create_node(&self, input: NewGraphNode) -> Result<GraphNode, String>;
    pub async fn get_node(&self, graph_node_id: &str) -> Result<Option<GraphNode>, String>;
    pub async fn update_node(&self, graph_node_id: &str, patch: GraphNodePatch) -> Result<GraphNode, String>;
    pub async fn delete_node(&self, graph_node_id: &str) -> Result<(), String>;

    /// All nodes for a lens. lens = "canvas" (all) | "timeline" (is_temporal == true).
    pub async fn list_nodes_for_lens(&self, lens: &str) -> Result<Vec<GraphNode>, String>;

    /// Fetch a set by id (used by the join after a layout query).
    pub async fn get_nodes(&self, ids: &[String]) -> Result<Vec<GraphNode>, String>;

    // ---- Relationship CRUD ----
    pub async fn list_relationships(&self) -> Result<Vec<GraphRelationship>, String>;
    pub async fn relationships_for_node(&self, graph_node_id: &str) -> Result<Vec<GraphRelationship>, String>;
    pub async fn connect_nodes(
        &self,
        source_graph_node_id: &str,
        target_graph_node_id: &str,
        rel_type: &str,
        properties: serde_json::Value,
    ) -> Result<GraphRelationship, String>;
    pub async fn disconnect(&self, relationship_id: &str) -> Result<(), String>;

    // ---- Two-lens / archetypal lighting (§8) ----
    /// Given an Archetype/Dynamic/Operator graph_node_id, return every datable
    /// instance reached by INSTANTIATES|ECHOES (the spectral recurrence view).
    pub async fn archetypal_lighting(&self, operator_graph_node_id: &str)
        -> Result<ArchetypalLightingResult, String>;

    /// Inverse: given an event/instance, which archetypes/operators resonate in it.
    pub async fn resonances_for_instance(&self, graph_node_id: &str)
        -> Result<Vec<LitInstance>, String>;

    // ---- Search ----
    pub async fn search(&self, query: &str, limit: i64) -> Result<Vec<GraphNode>, String>;
}
```

### 4.3 `LayoutRepository` (SQLite layout CRUD)

```rust
// apps/desktop/src-tauri/src/db/repositories/layout.rs

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
    connection: &'conn rusqlite::Connection,
}

impl<'conn> LayoutRepository<'conn> {
    pub fn new(connection: &'conn rusqlite::Connection) -> Self;

    // ---- Reads ----
    pub fn list_node_layout(&self, canvas_id: &str) -> rusqlite::Result<Vec<NodeLayoutRecord>>;
    pub fn list_edge_layout(&self, canvas_id: &str) -> rusqlite::Result<Vec<EdgeLayoutRecord>>;
    pub fn get_app_state(&self, canvas_id: &str) -> rusqlite::Result<Option<CanvasAppStateRecord>>;

    // ---- Incremental, transactional writes (WS1 saving fix) ----
    /// Upsert ONE node layout row (drag/resize). Caller wraps batches in a transaction.
    pub fn upsert_node_layout(&self, record: &NodeLayoutRecord) -> rusqlite::Result<()>;
    pub fn delete_node_layout(&self, canvas_id: &str, graph_node_id: &str) -> rusqlite::Result<()>;
    pub fn upsert_edge_layout(&self, record: &EdgeLayoutRecord) -> rusqlite::Result<()>;
    pub fn delete_edge_layout(&self, id: &str) -> rusqlite::Result<()>;
    pub fn upsert_app_state(&self, record: &CanvasAppStateRecord) -> rusqlite::Result<()>;

    /// Batch upsert used by the debounced flush; runs inside the caller's transaction,
    /// returns the count written (so the frontend flush can surface real success/failure
    /// instead of swallowing errors).
    pub fn upsert_node_layouts(&self, records: &[NodeLayoutRecord]) -> rusqlite::Result<usize>;
}
```

WS1's transactional flush wraps `upsert_node_layouts` + edge/app-state upserts in one `rusqlite` transaction and **returns the error** (no `catch { return false }`).

---

## 5. WorkspaceTransport additions (TypeScript)

Defined in `packages/desktop-api/src/index.ts`, extending the existing `WorkspaceTransport` interface. Substance (graph) and layout are read/written **separately** and joined by `graphNodeId`. The frontend (canvas + timeline) calls only these methods — never `neo4rs`/Tauri directly.

### 5.1 New shared TS types

```ts
// packages/desktop-api/src/index.ts (or a new graph.ts re-exported)

export type EntityType =
  | "Figure" | "People" | "Event" | "Institution" | "Source"
  | "Place" | "Work" | "Archetype" | "Dynamic" | "PsychoidOperator";

export interface GraphNode {
  graphNodeId: string;
  entityType: EntityType;
  title: string;
  body: string;                 // ProseMirror/BlockNote JSON string (§7)
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
  relType: string;              // "INSTANTIATES" | "CAUSES" | ...
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

/** Substance ⨝ layout, already joined in Rust. */
export interface JoinedCanvasNode {
  node: GraphNode;
  layout: NodeLayout;           // synthesised default if no row existed
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

### 5.2 New `WorkspaceTransport` methods

```ts
interface WorkspaceTransport {
  // ... existing methods unchanged ...

  // ---- Substance (Neo4j) ----
  readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>;
  createGraphNode(input: NewGraphNodeInput): Promise<GraphNode>;             // desktop only
  updateGraphNode(input: { graphNodeId: string; patch: GraphNodePatch }): Promise<GraphNode>;  // desktop only
  deleteGraphNode(input: { graphNodeId: string }): Promise<void>;            // desktop only
  connectGraphNodes(input: {
    sourceGraphNodeId: string; targetGraphNodeId: string;
    relType: string; properties?: Record<string, unknown>;
  }): Promise<GraphRelationship>;                                            // desktop only
  disconnectGraphNodes(input: { relationshipId: string }): Promise<void>;    // desktop only
  searchGraph(input: { query: string; limit?: number }): Promise<GraphNode[]>;

  // ---- Layout (SQLite) ----
  upsertNodeLayout(input: { layout: NodeLayout }): Promise<void>;            // desktop only
  upsertNodeLayouts(input: { canvasId: string; layouts: NodeLayout[] }): Promise<number>; // desktop only (debounced flush)
  upsertEdgeLayout(input: { layout: EdgeLayout }): Promise<void>;            // desktop only
  upsertCanvasAppState(input: {
    canvasId: string; viewport: { x: number; y: number; zoom: number };
    appState: Record<string, unknown>;
  }): Promise<void>;                                                         // desktop only
  flushCanvasLayout(input: {                                                 // crash-safe flush; returns boolean
    canvasId: string; layouts: NodeLayout[]; edges: EdgeLayout[];
    viewport: { x: number; y: number; zoom: number };
    appState: Record<string, unknown>;
  }): boolean | Promise<boolean>;

  // ---- Joined reads (both targets) ----
  /** lens: "canvas" (all nodes) | "timeline" (isTemporal === true). */
  loadCanvasView(input: { canvasId: string; lens: "canvas" | "timeline" }): Promise<CanvasView>;

  // ---- Two-lens / archetypal lighting (§8) ----
  archetypalLighting(input: { operatorGraphNodeId: string }): Promise<ArchetypalLighting>;
  resonancesForInstance(input: { graphNodeId: string }): Promise<LitInstance[]>;
}
```

### 5.3 Tauri vs browser-bridge (read-only web)

- **Tauri transport** (`createTauriWorkspaceTransport`): implements every method via `invokeTauri<T>("<command>_command", { input })`. New Tauri commands (registered in `lib.rs` `generate_handler!`) mirror the names: `read_graph_node_command`, `create_graph_node_command`, `update_graph_node_command`, `delete_graph_node_command`, `connect_graph_nodes_command`, `disconnect_graph_nodes_command`, `search_graph_command`, `upsert_node_layout_command`, `upsert_node_layouts_command`, `upsert_edge_layout_command`, `upsert_canvas_app_state_command`, `load_canvas_view_command`, `archetypal_lighting_command`, `resonances_for_instance_command`. These are `async fn` (await `GraphRepository`). `flushCanvasLayout` keeps the existing `try { await persist } catch { false }` shape **but** WS1 changes it to surface errors via a non-flush path; the beacon flush remains best-effort.
- **Browser-bridge transport** (`createBrowserBridgeTransport`, the **read-only web build**): implements **only** the read methods — `readGraphNode`, `searchGraph`, `loadCanvasView`, `archetypalLighting`, `resonancesForInstance`. All **write/mutation** methods (`createGraphNode`, `updateGraphNode`, `deleteGraphNode`, `connect*`, `disconnect*`, all `upsert*`, `flushCanvasLayout`) **throw** `new Error("read-only web build")` synchronously (or reject). This is the structural enforcement of design §6 ("web build does not edit the theory"). For the **static-export** web target, `loadCanvasView` / `archetypalLighting` / `searchGraph` read from the exported JSON dataset (no backend) rather than HTTP; for the **hosted read-only Neo4j** option they hit a read-only bridge endpoint. Both are selected behind the same interface.

The existing methods (`bootstrapWorkspace`, `loadProjectDocument`, `persistProjectDocument`, sequences, resource roots, search) remain for project/file/annotation concerns. `loadProjectDocument` keeps returning `entries`, `annotations`, `resourceRoots`, `project`; its `nodes`/`edges` become **deprecated** in favor of `loadCanvasView` (WS2 migrates callers; WS3+ use `loadCanvasView`).

---

## 6. MCP topology (slimmed `research-canvas`)

Authoring theory moves to the **Graphiti MCP server** (external, Python, official). The repo's `research-canvas` MCP is slimmed to a **place-on-canvas / layout** role only, operating against `graph_node_id`.

### 6.1 Removed from `research-canvas` MCP

These theory-write tools are **deleted** (Graphiti now owns theory authoring):

- `canvas_create_node` (substance creation — removed; Graphiti `add_episode` / entity creation replaces it)
- `canvas_update_node` (title/content edits — removed; theory edits go through Graphiti or the app UI)
- `canvas_delete_node` (removed)
- `canvas_create_edge` (typed relationships — removed; Graphiti writes relationships)
- `canvas_delete_edge` (removed)
- `canvas_batch_create` (removed)

Correspondingly, the internal HTTP API on `:9876` loses its theory-mutation routes. Its `POST /api/nodes`, `PATCH /api/nodes/:id`, `DELETE /api/nodes/:id`, `POST /api/edges`, `DELETE /api/edges/:id`, `POST /api/batch` are **replaced** by layout/placement routes (§6.3).

### 6.2 Kept / added tools (place-on-canvas / layout)

Remaining `research-canvas` MCP tools — all keyed by `graphNodeId`:

```ts
// .claude/mcp-servers/research-canvas/src/tools/canvas.ts (slimmed)

// READ: list graph nodes + their current placement so the agent knows what exists
{
  name: "canvas_get_state",
  description: "List graph nodes on the active canvas with their layout (graphNodeId, entityType, title, position, style) and edges. Read-only.",
  inputSchema: { type: "object", properties: {}, required: [] },
  // -> GET /api/canvas  (now returns graph-joined view, read-only)
}

// PLACE: put an existing graph node (by graphNodeId) onto the canvas/timeline
{
  name: "canvas_place_node",
  description: "Place an existing graph node on the active canvas at (x, y). Creates/updates its layout row only; does NOT create theory. Use after the Graphiti MCP has authored the node.",
  inputSchema: {
    type: "object",
    properties: {
      graphNodeId: { type: "string", description: "Neo4j node id to place" },
      x: { type: "number" }, y: { type: "number" },
      width: { type: "number" }, height: { type: "number" },
      dotColour: { type: "string" }, bgColour: { type: "string" },
      textColour: { type: "string" }, thumbnail: { type: "string" },
    },
    required: ["graphNodeId", "x", "y"],
  },
  // -> PUT /api/layout/node
}

// MOVE / RESTYLE existing placement
{
  name: "canvas_update_layout",
  description: "Update an existing node's position, size, or style on the active canvas. Layout only.",
  inputSchema: {
    type: "object",
    properties: {
      graphNodeId: { type: "string" },
      x: { type: "number" }, y: { type: "number" },
      width: { type: "number" }, height: { type: "number" },
      dotColour: { type: "string" }, bgColour: { type: "string" },
      textColour: { type: "string" }, thumbnail: { type: "string" },
    },
    required: ["graphNodeId"],
  },
  // -> PUT /api/layout/node
}

// REMOVE from canvas (does NOT delete theory)
{
  name: "canvas_remove_node",
  description: "Remove a node's placement from the active canvas. The graph node (theory) is NOT deleted.",
  inputSchema: { type: "object", properties: { graphNodeId: { type: "string" } }, required: ["graphNodeId"] },
  // -> DELETE /api/layout/node/:graphNodeId
}

// BATCH PLACE: lay out many newly-authored nodes at once
{
  name: "canvas_batch_place",
  description: "Place multiple existing graph nodes (by graphNodeId) on the active canvas in one call. Layout only.",
  inputSchema: {
    type: "object",
    properties: {
      placements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            graphNodeId: { type: "string" },
            x: { type: "number" }, y: { type: "number" },
            width: { type: "number" }, height: { type: "number" },
          },
          required: ["graphNodeId", "x", "y"],
        },
      },
    },
    required: ["placements"],
  },
  // -> POST /api/layout/batch
}
```

`src/tools/edges.ts` and `src/tools/batch.ts` (theory writers) are **removed**; `index.ts` `allTools` becomes `[...canvasTools]` only. The client base URL (`http://127.0.0.1:9876`) is unchanged.

### 6.3 Internal HTTP API (`:9876`) after slimming

| Route | Purpose | Handler |
|---|---|---|
| `GET /api/canvas` | Read joined canvas view (graph ⨝ layout), read-only | `handlers::get_canvas` → `loadCanvasView` equivalent |
| `PUT /api/layout/node` | Place/move/restyle one node (upsert layout) | new `handlers::upsert_node_layout` |
| `DELETE /api/layout/node/:graphNodeId` | Remove placement | new `handlers::remove_node_layout` |
| `POST /api/layout/batch` | Batch place | new `handlers::batch_place` |

The `canvas:updated` Tauri event still fires after any `:9876` mutation so the frontend re-fetches.

---

## 7. Node body format (BlockNote/ProseMirror JSON)

- Canonical body is **BlockNote document JSON** (BlockNote serializes to/from a ProseMirror document; we store BlockNote's block-array JSON form). Persisted as the `body` **string** property on the Neo4j node and surfaced through `GraphNode.body` (TS) / `GraphNode.body` (Rust) verbatim. The app neither parses nor rewrites it except through the editor (WS3).
- Embedded images: BlockNote image blocks store a `props.url` pointing at a workspace-relative asset path (e.g. `assets/<graphNodeId>/<file>`). The static exporter (WS7) copies those assets and rewrites paths, reusing the existing `packages/exporter` `copyAssets` machinery.
- Empty body sentinel: a new node's `body` is BlockNote's empty doc — the literal string `"[]"` (empty block array). Frontend treats `""` and `"[]"` as empty.

### Markdown export function (for linked-resource interop + static web layer)

```ts
// packages/exporter/src/renderMarkdown.ts  (new export alongside existing renderMarkdown)

/** Convert a stored BlockNote/ProseMirror body JSON string to Markdown.
 *  Used by the static web layer and "export node to .md" linking. */
export function blockNoteJsonToMarkdown(bodyJson: string): string;

/** Inverse, for importing a linked .md file into a node body (WS4). */
export function markdownToBlockNoteJson(markdown: string): string;
```

`blockNoteJsonToMarkdown` is the load-bearing one for §6 web read-layer: the static export serializes each node's `body` to Markdown (and/or rendered HTML) so the backend-less web viewer can display the theory without a BlockNote editor runtime.

---

## 8. The two-lens contract

### 8.1 Temporally-located vs trans-temporal

The single discriminator the frontend keys on is **`GraphNode.isTemporal`** (Neo4j `is_temporal`, §2.2):

- `isTemporal === true` ⇒ the node **projects onto the timeline**. It carries `validFrom`/`validTo`/`temporalPrecision` driving its placement and the timeline's semantic zoom. Defaults true for `Figure`, `People`, `Event`, `Institution`, `Source`; authorable per-node (a dated `Place` flips to true).
- `isTemporal === false` ⇒ **trans-temporal**; never forced onto the time axis. Defaults false for `Work`, `Archetype`, `Dynamic`, `Place`, `PsychoidOperator`. These are the **lighting sources**.
- The canvas lens shows **all** nodes (`loadCanvasView({ lens: "canvas" })`). The timeline lens shows **only** `isTemporal === true` nodes (`loadCanvasView({ lens: "timeline" })`, server-filtered via `GraphRepository::list_nodes_for_lens("timeline")`).

The frontend therefore never inspects entity-type to decide timeline projection — it reads `isTemporal`. (Entity-type drives *styling/icons*, not projection.)

### 8.2 Archetypal lighting query (data shape)

Selecting a trans-temporal node lights up every datable instance it `INSTANTIATES`/`ECHOES`.

- Transport call: `archetypalLighting({ operatorGraphNodeId })` → `ArchetypalLighting`.
- Rust: `GraphRepository::archetypal_lighting(operator_graph_node_id) -> ArchetypalLightingResult`.
- Underlying Cypher (the contract the Rust method satisfies):

```cypher
MATCH (op {graph_node_id: $id})
WHERE op:Archetype OR op:Dynamic OR op:PsychoidOperator
MATCH (inst:TheoryNode)-[r:INSTANTIATES|ECHOES]->(op)
WHERE inst.is_temporal = true
RETURN op,
       inst,
       type(r)            AS relType,
       r.dominance        AS dominance,
       inst.valid_from    AS validFrom,
       inst.valid_to      AS validTo
ORDER BY inst.valid_from
```

Result → `ArchetypalLighting.instances: LitInstance[]`, each `{ node, relType, dominance }`. The timeline highlights exactly these instances at their `validFrom` positions; `dominance` ("dominant"/"secondary") drives the "frequency"/intensity of the lighting (the corpus's holographic principle).

- Inverse (an event surfaces which archetypes/operators resonate in it): `resonancesForInstance({ graphNodeId })` →
```cypher
MATCH (inst {graph_node_id: $id})-[r:INSTANTIATES|ECHOES|RESONATES_WITH]->(op)
WHERE op:Archetype OR op:Dynamic OR op:PsychoidOperator
RETURN op AS node, type(r) AS relType, r.dominance AS dominance
```
returning `LitInstance[]` (here `node` is the operator) — the dominant/secondary archetypal "frequencies" present in that event.

A timeline node and a canvas node are the **same** `GraphNode` (same `graphNodeId`, same `body`); opening either calls `readGraphNode`/the WS3 document view identically.

---

## 9. Cross-workstream reference index

| Concern | Authoritative section | Consuming workstreams |
|---|---|---|
| `graph_node_id` join key | §0, §3.2 | all |
| Neo4j connection/config | §1 | WS2, WS6, WS7 |
| Node labels + properties | §2 | WS2, WS3, WS5 |
| Relationship types | §2.3 | WS2, WS4, WS5 |
| SQLite layout schema | §3 | WS1, WS2 |
| `GraphRepository` / `LayoutRepository` | §4 | WS1, WS2, WS5, WS6 |
| `WorkspaceTransport` additions | §5 | WS2, WS3, WS4, WS5, WS7 |
| Read-only web variant | §5.3, §7 (markdown) | WS7 |
| MCP slimming | §6 | WS6 |
| Body format / markdown export | §7 | WS3, WS4, WS7 |
| Two-lens / archetypal lighting | §8 | WS5 |

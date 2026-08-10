# Data-layer audit

Status: locked at refinement-2 (Task 11, ticket #26)
Applies to: `codex/surfaces-slices`

This audit records schema ownership, store boundaries, and the dead-code
inventory across the three layers — **substrate**, **profile**, and
**presentation** — and is enforced by the boundary tests in
`apps/desktop/src-tauri/tests/data_layer_boundaries.rs` and
`packages/desktop-api/src/dataLayerBoundary.test.ts`.

## 1. The two-store split

The theory tool keeps two stores, joined only by `graph_node_id`:

- **Neo4j + Graphiti** owns graph *substance* (node bodies, relationships,
  temporal validity, provenance). It is the authority for substrate content.
- **SQLite** owns *presentation only* (position, size, style, viewport,
  app-state), keyed by `graph_node_id`, plus a local read/offline projection
  of substrate rows so the desktop app works without a graph connection.

The join is performed **only in the Rust repository layer**. The frontend
communicates exclusively through `WorkspaceTransport`
(`packages/desktop-api`); the web build swaps in a read-only static-bundle
transport. Never reach a database directly from frontend code.

## 2. Layers and schema ownership

Three layers, each with its own stores. Every SQLite table has exactly one
owning repository file (the enforcement target for refinement-2 stores; the
legacy presentation tables are listed for completeness).

### Substrate — graph substance

Neo4j-backed; SQLite holds the local projection and the offline document body.

| Table | Owning repository | Created by |
|---|---|---|
| `graph_node_metadata` | `db/repositories/graph_metadata.rs` | `0003_graph_metadata.sql` |
| `node_document` | `db/repositories/node_document.rs` | `0019_node_document.sql` |
| `graph_relationship` | `db/repositories/node_relationship.rs` | `0008_graph_relationship.sql`, rebuilt `0016`/`0033` |
| `constellations` | `db/repositories/constellation_meta.rs` | `0033_constellation_encapsulation.sql` |
| `agent_activity` | `db/repositories/agent_activity.rs` | `0021_agent_activity.sql` |

`graph_relationship` is the one deliberate substrate relation vocabulary; its
`rel_type` CHECK is rebuilt by `0016` and `0033` from the canonical
`db/repositories/relationship_vocabulary.rs` at migration time so the three
boundaries (root seeding, remote writes, SQLite checks) cannot drift.

### Profile — per-profile substance

Profile-scoped content: scenes, their sequences, and surface movement streams.

| Table | Owning repository | Created by |
|---|---|---|
| `scenes` | `db/repositories/scene_repository.rs` | `0026_scenes.sql` |
| `scene_sequences` | `db/repositories/scene_repository.rs` | `0026_scenes.sql` |
| `geography_edges` | `db/repositories/geography_edge_repository.rs` | `0031_geography_edges.sql` |
| `saved_sequences` | `db/repositories/saved_sequences.rs` | `0007_saved_sequences.sql` |

Legacy `sequences` / `sequence_steps` were dropped by `0006_sequence_redesign`.

### Presentation — layout, curation, media

SQLite-only. All `graph_node_id`-keyed layout rows join at the repository layer.

| Table | Owning repository | Created by |
|---|---|---|
| `projects` | `db/repositories/constellations.rs` | `0001_initial.sql` |
| `canvases` | `db/repositories/canvas.rs` | `0001_initial.sql` |
| `canvas_nodes` | `db/repositories/canvas.rs` | `0001_initial.sql` |
| `canvas_edges` | `db/repositories/canvas.rs` | `0001_initial.sql` |
| `canvas_annotations` | `db/repositories/annotations.rs` | `0002_annotations.sql` |
| `node_layout` | `db/repositories/layout.rs` | `0004_canvas_layout.sql` |
| `edge_layout` | `db/repositories/layout.rs` | `0004_canvas_layout.sql` |
| `canvas_app_state` | `db/repositories/layout.rs` | `0005_app_state.sql` |
| `timeline_layout` | `db/repositories/timeline_layout.rs` | `0013_timeline_layout.sql` |
| `node_attachment` / `node_attachment_usage` / `node_attachment_presentation` | `db/repositories/node_attachment.rs` | `0022`–`0024` |
| `project_resource_roots` | `db/repositories/resource_roots.rs` | `0009_resource_roots.sql` |
| `search_documents` | `db/repositories/search.rs` | `0001_initial.sql` |

### Refinement-2 stores (hardening target)

The five new stores landed by refinement-2 each have exactly one repository:

| Store | Table(s) | Repository | Migration |
|---|---|---|---|
| Scenes | `scenes`, `scene_sequences` | `scene_repository.rs` | `0026`, `0027` |
| Street view | `street_view_images` | `street_view.rs` | `0028` |
| Palace curation | `palace_curations` | `palace.rs` | `0029` |
| Geography edges | `geography_edges` | `geography_edge_repository.rs` | `0031` |
| Fetch records | `fetch_records` | `fetch_record.rs` | `0032` |

Each is enforced by `every_refinement2_store_has_exactly_one_repository_owner`
and `every_refinement2_table_is_created_by_exactly_one_migration`.

## 3. Store boundaries

- **Frontend → data layer**: the only allowed Tauri IPC entry points are the
  `WorkspaceTransport` methods in `packages/desktop-api`. Two OS-chrome seams
  are explicitly allowlisted: `CanvasWorkspaceContext.tsx`
  (`activate_canvas_command`) and `terminalTransport.ts` (PTY session control).
  Enforced by `packages/desktop-api/src/dataLayerBoundary.test.ts`.
- **Command/bridge/API → data layer**: refinement-2 store tables are never
  named in raw SQL outside their owning repository. Enforced by
  `no_command_bridge_or_api_layer_issues_raw_sql_against_refinement2_tables`.
- **Known legacy exceptions**: `commands/constellations.rs` and
  `commands/assets.rs` contain pre-existing direct SQL against *legacy
  presentation* tables (`canvas_*`, `node_attachment_*`). These predate the
  repository discipline and are out of scope for this hardening pass; the
  refinement-2 stores are clean.

## 4. Dead-code inventory

### Removed in this pass

- **`get_geography_edge_command`** — orphaned Tauri command (no TS/transport
  usage) and its registration in the `lib.rs` invoke handler.
- **`get_geography_edge_at`** — dead helper (only referenced by its own
  definition). `delete_geography_edge_at`, `upsert_geography_edge_at`,
  `list_geography_edges_at` remain, and `GeographyEdgeIdRequest` is retained
  because `delete_geography_edge_command` still uses it.
- **`parse_keepsake_manifest`** — dead helper in `commands/keepsake.rs` (only
  referenced by its own definition; the bundle writer parses the manifest
  inline).

### Already removed (prior tasks)

- **Old palace card-list lens** (Task 7): `PalaceCard` / `CardList` /
  `card-list` have zero references in `apps/` and `packages/`. The stale
  `packages/canvas/dist/palace/PalaceLens.d.ts` is a gitignored build artifact.

### Investigated and intentionally kept

- **`seedMigrationStory.ts`** — *not* dead. It is the live story seed. The
  internal `profileScope: "migration"` key is retained for data compatibility
  (Task 5); `storyWordingSweep.test.tsx` guarantees no visible "migration"
  wording reaches the UI.
- **`KeepsakeManifestWire.scenes`** — a JSON contract field, not the SQLite
  `scenes` table; not a boundary violation.

## 5. Migration hygiene

- Full chain `0001`–`0033`; `schema_migrations` rows never re-run.
- `db_migrations_re_migrating_a_real_workspace_never_replays_or_drops_data`
  migrates a full workspace, writes a live row, re-migrates, and asserts the
  row survives and the migration count is unchanged.
- `db_migrations_0033_upgrades_a_real_0032_projection_preserving_tombstones_and_gains_encapsulates`
  locks the `0033` rebuild: existing active and tombstone `graph_relationship`
  rows survive byte-for-byte, the upgraded schema accepts `ENCAPSULATES`, and
  `constellations` is added atomically.
- Seed idempotency is covered by `root_archetypal_seed` tests:
  `metadata_mutation_survives_reprojection_without_clobbering_or_rejecting`
  and the existing re-hydration tests.

## 6. Seed projection-integrity guarantee

The root seed guard rejects genuinely corrupted projections loudly. A metadata
revision that is legitimately **ahead** of its document (the pipeline dates an
atemporal seed via `update_node_metadata_at_path` without touching the body) is
tolerated and preserved; content fields diverged, or metadata **behind** the
document, still rejects. The same tolerance is applied to the pending-sync
coherence check in `node_document.rs` (`pending_sync_from_row`), so a
legitimately-advanced seed surfaces correctly in the offline timeline sync
instead of being misread as corruption.

# Domain Contracts and Local Graph Projection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Establish one lossless TypeScript/Rust contract, authoritative local graph metadata, safe content revisions, a trustworthy build, and a Neo4j integration suite that cannot silently pass without Neo4j.

**Architecture:** SQLite stores the offline projection needed by canvas, timeline, search, and reading. Neo4j remains the relationship/query sync engine. Shared serialized names and controlled vocabularies are verified by golden fixtures. Content ownership determines merge behaviour.

**Tech Stack:** TypeScript, Rust/Serde, SQLite migrations/repositories, Neo4j, Vitest, Cargo integration tests.

---

## Task 1: Repair clean-worktree build determinism

**Files:** `packages/exporter/tsconfig.json`, `packages/canvas/tsconfig.json`, root `tsconfig.json`, package build tests/documentation as required.

1. Add a regression test or scripted assertion that builds exporter and then typechecks canvas from a clean declaration directory.
2. Run the assertion and capture the current TS6305 failure.
3. Correct project references, `rootDir`, `outDir`, declaration paths, or imports without committing generated files.
4. Run `pnpm build`, `pnpm typecheck`, and `pnpm test`.
5. Commit: `build: make workspace declarations deterministic`.

## Task 2: Make required Neo4j tests fail closed and isolated

**Files:** `apps/desktop/src-tauri/tests/support/mod.rs`, all `apps/desktop/src-tauri/tests/graph_*.rs`, `root_archetypal_field_seed.rs`, `canvas_view_join.rs`, `ws4a_cutover_roundtrip.rs`, `docker-compose.yml` or a dedicated test compose file, package scripts/setup docs.

1. Write tests for configuration rejection when URI targets the development port/database and for failure when required test configuration is absent.
2. Replace `Option`/early-return fixtures with a required fixture for integration targets; keep genuinely pure unit tests independent.
3. Allocate a per-run namespace in a dedicated Neo4j container, prove teardown removes only that namespace, and refuse the development URI.
4. Add one command that starts the test dependency, waits for health, runs the real graph suite, and tears it down even on failure.
5. Run a deliberate missing-dependency failure, then the real integration suite twice to prove isolation/idempotency.
6. Commit: `test: isolate and require real graph integration`.

## Task 3: Define shared controlled vocabularies and contract parity

**Files:** `packages/schema/src/node.ts`, `packages/schema/src/index.ts`, `packages/desktop-api/src/graph.ts`, `apps/desktop/src-tauri/src/db/repositories/graph.rs`, `apps/desktop/src-tauri/src/commands/graph.rs`, `apps/desktop/src-tauri/tests/graph_types.rs`, new golden JSON fixture under `tests/fixtures/contracts/`.

1. Add failing TypeScript and Rust tests for identical camelCase serialization of all existing fields plus `contentOrigin`, `contentRevision`, `seedSchemaVersion`, `bodySourceCoordinates`, `historicity`, `claimKind`, `evidenceStatus`, `temporalRole`, `placeCoverage`, and typed QL fields.
2. Centralize allowed values in schema types and Rust enums/string validation; preserve forward-compatible unknown values only at an explicit boundary.
3. Add a golden-fixture parity test consumed by both languages.
4. Run schema, desktop-api, and Rust graph type tests.
5. Commit: `feat: align graph metadata contracts across runtimes`.

## Task 4: Add local graph metadata and timeline-layout migrations

**Files:** `apps/desktop/src-tauri/src/db/migrations.rs`, new repositories under `db/repositories/`, `db/repositories/mod.rs`, tests `db_migrations.rs`, `graph_metadata_repository.rs`, `timeline_layout_repository.rs`.

1. Write real temporary-SQLite tests for migration from the current schema, idempotency, foreign keys, and round trips.
2. Add `graph_node_metadata` with schema/sync/content ownership fields and `timeline_layout` keyed by workspace and graph node.
3. Preserve existing `node_document` bodies and layout rows during migration.
4. Add repositories with explicit create/update/preserve/conflict results, not silent last-write-wins.
5. Run repository and migration tests twice against reopened databases.
6. Commit: `feat: persist local graph metadata and timeline layout`.

## Task 5: Implement revision-aware content reconciliation

**Files:** `apps/desktop/src-tauri/src/db/repositories/node_document.rs`, `db/root_archetypal_seed.rs`, graph repository/commands, `apps/desktop/src/features/canvas/nodeCreation.ts`, related Rust and Vitest tests.

1. Write failing tests for seed create, same-revision no-op, explicit seed migration, preservation of corpus/editorial/user bodies, and surfaced conflict.
2. Replace `body_for()` overwrite semantics with ownership/revision-aware merge results.
3. Make local document and graph sync compare ownership and revision.
4. Add dry-run result structures listing create/update/preserve/conflict.
5. Run seed twice, edit a real body between runs, and prove the edit survives.
6. Commit: `feat: protect authored node content during reconciliation`.

## Task 6: Wire production bootstrap to the authoritative local projection

**Files:** `apps/desktop/src-tauri/src/lib.rs`, `db/root_archetypal_seed.rs`, bootstrap/workspace commands, `tests/workspace_persistence.rs`, `tests/root_archetypal_field_seed.rs`.

1. Add a failing clean-workspace test showing the declared root graph, constellations, documents, and temporal metadata are absent today.
2. Invoke the idempotent seed/compiler boundary during production bootstrap.
3. Treat Neo4j failure as observable pending sync while retaining complete local metadata; never synthesize downgraded QL/portal nodes.
4. Verify first and second bootstrap produce identical IDs/counts and preserve layouts/bodies.
5. Commit: `feat: bootstrap the complete local graph field`.


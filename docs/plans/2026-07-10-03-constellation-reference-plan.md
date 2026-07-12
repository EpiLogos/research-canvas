# First-Class Constellation Reference Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Replace canvas-as-constellation nesting with reusable semantic constellations, memberships, and stable cross-constellation references while preserving layouts.

**Architecture:** Constellation owns identity and primary canvas; memberships compose graph nodes or child constellations; reference placements point to `target_constellation_id`; canvases remain presentation surfaces.

**Tech Stack:** SQLite migrations/repositories, Rust commands, TypeScript transport, React navigation, static exporter.

---

## Task 1: Extend first-class constellation persistence

**Files:** `db/migrations.rs`, `db/repositories/constellations.rs`, `tests/constellation_repository.rs`, shared schema/API types.

1. Add failing migration/repository tests for kind, graph node identity, schema version, membership rows, and reference placements.
2. Enforce exactly one member target type and valid foreign keys.
3. Support one target constellation referenced from multiple hosts.
4. Commit: `feat: persist constellation membership and references`.

## Task 2: Define deletion and cycle semantics

**Files:** constellation repository/commands and tests.

1. Test placement deletion versus target deletion, dangling-reference prevention, self-reference, and multi-hop cycle detection.
2. Implement an actionable cycle path diagnostic.
3. Preserve unrelated host references when one placement is deleted.
4. Commit: `feat: enforce safe constellation reference semantics`.

## Task 3: Migrate portal sidecars without layout loss

**Files:** migrations, `commands/constellations.rs`, `db/root_archetypal_seed.rs`, `workspace_persistence.rs`, migration fixtures.

1. Build a fixture with legacy `targetCanvasId` portals and non-default geometry/styles.
2. Dry-run deterministic mapping from target canvas to target constellation; report unresolved/ambiguous targets.
3. Apply `targetConstellationId` while retaining a derived canvas ID for compatibility.
4. Reopen and prove every node, edge, viewport, size, colour, and target survived.
5. Commit: `feat: migrate portals to stable constellation identity`.

## Task 4: Use constellation references in UI navigation

**Files:** `CanvasWorkspaceContext.tsx`, `CanvasScreen.tsx`, `ConstellationTree.tsx`, `Shell.tsx`, related tests.

1. Add a rendered test where constellation B is opened from A and C and each host layout remains intact.
2. Resolve navigation through constellation identity and primary canvas; maintain breadcrumb/history state.
3. Make deleting a reference card delete only that placement.
4. Commit: `feat: navigate reusable constellation references`.

## Task 5: Compile the declared root and higher-order structures

**Files:** `db/root_archetypal_seed.rs` initially, then compiler inputs from Plan 05; persisted graph tests.

1. Test at least the 18 declared appropriate structures as first-class constellation records.
2. Materialize root archetypal and QL unit references as memberships/reference placements.
3. Prove higher-order constellations can reuse the same child without duplicating it.
4. Assert no timeline constellation is created.
5. Commit: `feat: compile the root constellation ecology`.

## Task 6: Export/import constellation composition

**Files:** `apps/desktop/src-tauri/src/export/graph_bundle.rs`, `packages/schema/src/export.ts`, `packages/exporter`, public viewer, tests.

1. Add failing round-trip tests for membership, reference identity, QL metadata, and layouts.
2. Extend bundle schema and public-viewer navigation.
3. Export/import twice and compare canonicalized bundles.
4. Commit: `feat: round-trip constellation composition`.


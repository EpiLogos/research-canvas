# QL, Evidence, Geography, Wikilink, and Compiler Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development and epi-logos:epi-logos-argument-cartography to implement this plan task-by-task.

**Goal:** Build a deterministic source compiler and health system that preserves QL structure, historical confidence, myth/claim distinctions, place, wikilinks, and provenance.

**Architecture:** Versioned YAML/JSON/Markdown-derived manifests compile through one dry-run/apply pipeline into local graph substance and Neo4j relations. Generated metadata is reviewed as data; runtime code does not infer historical or QL categories from prose tags.

**Tech Stack:** TypeScript compiler/linter, Markdown parsing, shared schema, Rust apply boundary, SQLite/Neo4j, Vitest/Cargo.

---

## Task 1: Create canonical corpus inventory and precedence manifest

**Files:** new `corpus/manifest.*`, compiler package/scripts, tests; canonical paths listed in the scope specification.

1. Inventory current editorial canon, Book/quotes, QL units, ledgers, Reports 1–9, chats/handovers, framework snapshot, and archives with hashes/status.
2. Add failing tests for missing files, duplicate canonical IDs, undeclared copies, and the 14 incorrect QL paths.
3. Declare repo-local versus installed Epi-Logos precedence and version/hash without silently merging them.
4. Commit: `feat: inventory the canonical corpus`.

## Task 2: Implement deterministic wikilink resolver and backlinks

**Files:** new compiler resolver modules/tests, shared reference relation schema, exporter/index integration.

1. Test `[[target]]`, aliases, headings, blocks, escaped table aliases, paths, missing, unmanaged, and ambiguous basenames.
2. Resolve by canonical ID/path/alias with explicit states; ambiguity must never pick the first file.
3. Materialize neutral `REFERENCES` relations and backlinks while preserving curated semantic edges.
4. Gate every canonical link and reader-body link.
5. Commit: `feat: resolve corpus wikilinks and backlinks`.

## Task 3: Compile typed QL constellation and membership metadata

**Files:** QL manifest/compiler, shared contracts, constellation repository/apply path, invariant tests.

1. Encode `qlForm`, unit, arc, topology, schema version, source coordinates, and completeness for every QL-shaped constellation.
2. Encode membership position index/coordinate, role, order, complement, orientation, and source coordinates.
3. Test complete sixfold exactly once at 0–5 and closure 5→0; reject quaternities/partial maps mislabeled as complete.
4. Keep P, P', raw `#`, L/L', and Square coordinates distinct.
5. Commit: `feat: compile typed QL structures`.

## Task 4: Replace derived historical categories with controlled evidence fields

**Files:** `packages/canvas/src/timeline/categories.ts`, shared schema/compiler inputs, timeline filters/reader chips, tests.

1. Add fixtures for documented fact with archetypal resonance, actual myth temporally located, allegation, disputed claim, interpretation, and unknown.
2. Remove `Event + archetypalResonance => myth-in-time` and conflated speculation logic.
3. Derive display lanes only from orthogonal historicity/claim/evidence/temporal-role fields.
4. Produce a per-node migration disposition; no unreviewed bulk rewrite.
5. Commit: `fix: separate historical fact myth and claim metadata`.

## Task 5: Add Place nodes, aliases, and historical geography

**Files:** place schema/compiler inputs, graph repositories, timeline/search/read UI, export schema, tests.

1. Test canonical Place identity, raw alias, historical polity, modern country, coordinates where justified, and unknown/not-applicable coverage.
2. Compile `OCCURRED_AT`, `LOCATED_IN`, `OPERATED_IN`, `TRAVELLED_TO`, and `MYTH_LOCATED_AT` without treating them as interchangeable.
3. Normalize all 78 current raw place strings with a review manifest.
4. Add geographic chips and filters alongside time.
5. Commit: `feat: add historical place graph and filters`.

## Task 6: Build dry-run/apply corpus compiler

**Files:** compiler package/scripts, Rust import/apply boundary, workspace bootstrap, tests.

1. Test deterministic IDs, create/update/preserve/conflict reports, source anchors, BlockNote body validation, and transaction rollback.
2. Apply through content ownership and repository APIs; never write directly around revision rules.
3. Make production bootstrap call the same compiler artifact rather than hand-maintained alternative seeds.
4. Run twice and compare zero-diff second dry run.
5. Commit: `feat: compile canonical corpus idempotently`.

## Task 7: Add corpus health command and CI gate

**Files:** package scripts/CI config, compiler lints, setup/governance docs.

1. Fail on broken/ambiguous canonical links, absent anchors, bad QL invariants, invalid body documents, uncontrolled tags, temporal historical nodes without place disposition, or count drift.
2. Emit machine-readable and human-readable reports.
3. Add the command to the full verification path.
4. Commit: `test: gate corpus metadata and links`.


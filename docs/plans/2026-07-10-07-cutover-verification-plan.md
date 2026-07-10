# Migration, Export, Cleanup, and Cutover Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:verification-before-completion and superpowers:finishing-a-development-branch to execute this plan.

**Goal:** Prove the complete system on clean and migrated workspaces, safely remove test pollution and compatibility paths, and leave production documentation matching reality.

**Architecture:** Back up first; dry-run every live migration; apply only namespace-bounded cleanup; compare canonical pre/post manifests; exercise the real UI and export/import paths; remove legacy code only after equivalent coverage passes.

**Tech Stack:** SQLite/Neo4j backups, compiler reports, Cargo/Vitest/Playwright, static bundle export/import, architecture documentation.

---

## Task 1: Snapshot and back up live state

1. Export SQLite, Neo4j, and static bundle without mutation.
2. Record node/relationship/constellation/layout/document counts, IDs, revisions, hashes, tags, source paths, and known `test-root-field-*` pollution.
3. Verify backups can be read in a disposable environment.
4. Commit only manifests/scripts, never private database contents: `ops: add auditable migration snapshot tooling`.

## Task 2: Dry-run and apply production migration

1. Run schema/content/portal/tag/place/link migrations in dry-run mode against a copy of live data.
2. Review every conflict, unresolved target, ambiguous link, tag disposition, and content preservation decision.
3. Apply transactionally to the copy; compare pre/post layouts and authored body hashes.
4. Only after the copy passes, repeat backup and apply to live state with explicit user authorization if external mutation is required.
5. Commit: `ops: finalize safe corpus migration`.

## Task 3: Remove test pollution by namespace only

1. Test cleanup against a fixture containing both real and namespaced test data.
2. Require exact namespace/run manifest; reject broad label/date deletion.
3. Dry-run `test-root-field-*` cleanup and compare expected IDs.
4. Apply only after backup and review; prove real counts/hashes unchanged.
5. Commit: `ops: remove namespaced graph test pollution safely`.

## Task 4: Verify static export/import parity

1. Export graph substance, bodies, constellation membership/references, timeline layout, QL/evidence/place metadata, and wikilink relations.
2. Import into a clean workspace and compare canonicalized graphs.
3. Navigate reused constellations, open timeline nodes, and read bodies in the public viewer.
4. Commit: `test: prove complete static bundle parity`.

## Task 5: Remove obsolete compatibility paths

**Files:** old manual seed scripts, `targetCanvasId` canonical writes, timeline-as-canvas calls, legacy mixed `project` names, stale 49-node seed paths.

1. Add tests that fail if obsolete entry points are invoked or produce graph data.
2. Remove only paths fully superseded by the compiler and stable contracts.
3. Keep explicit import compatibility at a named boundary where old bundles still require it.
4. Commit: `refactor: remove superseded graph bootstrap paths`.

## Task 6: Run the complete acceptance matrix

Run and retain evidence for:

```text
pnpm typecheck
pnpm test
pnpm build
cargo test --offline --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1
required isolated Neo4j + SQLite integration command
pnpm test:e2e
corpus/link/metadata health command
static export/import verification
```

Additionally verify clean bootstrap, migrated bootstrap, second-run idempotency, offline timeline, multi-host constellation references, card geometry, all 80 Episode 2 dispositions, QL invariants, and authored-body/layout preservation.

## Task 7: Update production documentation and final review

**Files:** architecture, data model, setup, testing, corpus governance, and migration docs referenced by existing doc tests.

1. Update vocabulary and diagrams to distinguish workspace, constellation, graph node, canvas, portal/reference, and timeline.
2. Document controlled vocabularies, source precedence, content ownership, test isolation, and compiler workflow.
3. Run documentation tests and a final independent code/content review over the full branch diff.
4. Commit: `docs: document the verified constellation corpus system`.


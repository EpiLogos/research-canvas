# Constellation, Timeline, and Corpus Integrity Execution Index

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute each plan task-by-task, then superpowers:verification-before-completion and superpowers:finishing-a-development-branch at cutover.

**Goal:** Execute the approved repository-wide scope without letting runtime repair, data migration, or content enrichment overwrite one another.

**Architecture:** Contract-first, local-first graph substance; workspace-level timeline; first-class reusable constellations; a single visible card surface; source-compiled content with explicit ownership, evidence, QL, link, and geography metadata.

**Tech Stack:** TypeScript, React, React Flow, Vitest, Playwright, Rust, Tauri, SQLite, Neo4j, Markdown/BlockNote corpus sources.

---

## Execution order

1. [Domain contracts, local graph projection, and real integration harness](./2026-07-10-01-domain-contracts-local-graph-plan.md)
2. [First-class timeline recovery](./2026-07-10-02-timeline-recovery-plan.md)
3. [First-class constellation and reference architecture](./2026-07-10-03-constellation-reference-plan.md)
4. [Single-surface card rendering](./2026-07-10-04-single-surface-card-plan.md)
5. [QL, evidence, geography, wikilinks, and compiler](./2026-07-10-05-metadata-link-geography-compiler-plan.md)
6. [Canonical corpus enrichment](./2026-07-10-06-corpus-enrichment-plan.md)
7. [Migration, export, cleanup, and cutover](./2026-07-10-07-cutover-verification-plan.md)

Every implementation task uses a fresh implementer agent. The coordinating agent then dispatches a specification reviewer and, only after specification approval, a code-quality reviewer. Findings return to the same implementer until both reviewers approve. Shared migrations, graph contracts, and compiler core are edited sequentially.

## Baseline recorded 2026-07-10

- `cargo build --offline --manifest-path apps/desktop/src-tauri/Cargo.toml`: pass.
- `cargo test --offline --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1`: reports pass, but Neo4j tests silently skip when `NEO4J_TEST_URI` is absent. This is not an acceptable final gate.
- `pnpm test`: 417 pass; the socket test fails only inside the sandbox and passes when rerun with loopback permission.
- `pnpm build`: fails because `@research-canvas/exporter` emits declarations at a path inconsistent with `@research-canvas/canvas` project references.
- `pnpm typecheck`: fails for the same declaration-output defect in a clean worktree.

## Safety and ownership rules

- Never run cleanup against the development Neo4j graph.
- No bulk content apply before the dry-run manifest is human-readable and backed up.
- Seeds may create missing content; normal reseeding may not overwrite editorial or user-authored content.
- Timeline membership comes from temporal graph metadata, never canvas placement.
- Constellation identity is `constellation_id`; a canvas ID is presentation data only.
- QL position belongs primarily to constellation membership, because the same node can occupy different positions in different units.
- Fact, claim, interpretation, myth, and evidence confidence are independent fields.
- Generated wikilinks create neutral reference relations, never invented causal/archetypal relations.
- Content workstreams own disjoint manifest rows; shared compiler/runtime code remains coordinator-owned.

## Completion ledger

Update each checkbox only after specification and code-quality review.

- [ ] Plan 01 complete
- [ ] Plan 02 complete
- [ ] Plan 03 complete
- [ ] Plan 04 complete
- [ ] Plan 05 complete
- [ ] Plan 06 complete
- [ ] Plan 07 complete


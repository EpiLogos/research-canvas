# Timeline Relation Field Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep every canonical mythic and archetypal relation available for visible historical events without globally loading or rendering the corpus relationship graph.

**Architecture:** Replace the global timeline snapshot with a buffered, time-window field. The query returns temporally placed event previews, every canonical edge incident to those events, and deduplicated contextual endpoint previews. The timeline only renders historical events on the time axis; an event’s complete contextual relations appear on explicit focus in a lightweight relation field, never as fabricated temporal companion cards.

**Tech Stack:** Rust/Tauri, SQLite, Neo4j enrichment, TypeScript transport contracts, React/Zustand, Vitest, Cargo integration tests.

---

## Implemented vertical slice

The first production slice is intentionally event-local rather than a silent
classification rule: the initial snapshot now contains temporal historical
nodes only and no relationships; selecting an event loads every non-tombstoned
local relation incident to that event, enriches that same single-event field
from Neo4j when available, and exposes its archetypal/mythic endpoints in a
contextual list. Contextual nodes are not assigned fabricated dates.

The lens also mounts cards only inside a 320px viewport overscan band and
delegates pointer handling to each rendered timeline node, avoiding global
pointer listeners for every card. The remaining tasks below describe the next
phase: replacing the still-global temporal-event snapshot with a cached,
indexed time-window query. They are not represented as complete by this slice.

---

### Task 1: Specify the local relation-field contract

**Files:**

- Modify: `packages/desktop-api/src/graph.ts`
- Modify: `packages/canvas/src/timeline/contracts.ts`
- Test: `packages/desktop-api/src/graphTypes.test.ts`

**Step 1: Write the failing test**

Add a contract test for a time-window request and a response that declares complete canonical relations for explicitly returned historical event IDs, with contextual endpoint previews that have no temporal anchor.

**Step 2: Run the test and confirm it fails for the missing types**

Run: `pnpm vitest run packages/desktop-api/src/graphTypes.test.ts`

**Step 3: Implement the minimal contract**

Add `TimelineFieldRequest`, `TimelineField`, contextual entity previews, and an explicit completeness declaration. Keep the old view during transition only where required by callers.

**Step 4: Run the test and confirm it passes**

Run: `pnpm vitest run packages/desktop-api/src/graphTypes.test.ts`

### Task 2: Bound the SQLite query to a temporal window

**Files:**

- Modify: `apps/desktop/src-tauri/src/db/repositories/graph_metadata.rs`
- Modify: `apps/desktop/src-tauri/src/db/repositories/node_relationship.rs`
- Modify: `apps/desktop/src-tauri/src/commands/timeline.rs`
- Test: `apps/desktop/src-tauri/src/commands/timeline.rs`

**Step 1: Write the real SQLite failing test**

Seed in-range and out-of-range historical events, archetypal/mythic endpoints, and unrelated relationships. Assert only in-range events are returned, while every relation incident to those events and every needed contextual endpoint preview is retained.

**Step 2: Run the focused Cargo test and confirm it fails**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml timeline_field --lib`

**Step 3: Implement range and batch projection**

Use normalized temporal range predicates and indexed endpoint reads. Batch-fetch summaries/layouts and contextual previews. A timeline field must not fetch full node bodies.

**Step 4: Run the focused Cargo test and confirm it passes**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml timeline_field --lib`

### Task 3: Keep remote enrichment bounded and complete

**Files:**

- Modify: `apps/desktop/src-tauri/src/db/repositories/graph.rs`
- Modify: `apps/desktop/src-tauri/src/commands/timeline.rs`
- Test: `apps/desktop/src-tauri/src/commands/timeline.rs`

**Step 1: Write the failing enrichment test**

Assert enrichment receives IDs only for the locally windowed historical events, merges all non-tombstoned incident remote relations, and fetches only missing contextual previews.

**Step 2: Run the focused Cargo test and confirm it fails**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml remote_timeline_field --lib`

**Step 3: Implement bounded enrichment**

Reuse the field event IDs as the only remote relation neighbourhood. Declare completeness only for that event set, never for the global graph.

**Step 4: Run the focused Cargo test and confirm it passes**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml remote_timeline_field --lib`

### Task 4: Cache and virtualize the historical timeline window

**Files:**

- Modify: `apps/desktop/src/features/timeline/createTimelineDataSource.ts`
- Modify: `packages/canvas/src/timeline/timelineStore.ts`
- Modify: `packages/canvas/src/timeline/TimelineLens.tsx`
- Test: `packages/canvas/src/timeline/TimelineLens.test.tsx`

**Step 1: Write the failing UI test**

Assert a padded time range is requested, only cards within the smaller render band mount, and a small pan inside the loaded range does not issue another request.

**Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run packages/canvas/src/timeline/TimelineLens.test.tsx`

**Step 3: Implement the field cache and render band**

Load buffered intervals, reject stale responses, and render only viewport overscan. Calculate placement only for the render band plus the minimal lane look-behind needed for stable collision placement.

**Step 4: Run the test and confirm it passes**

Run: `pnpm vitest run packages/canvas/src/timeline/TimelineLens.test.tsx`

### Task 5: Materialize contextual relations only on focus

**Files:**

- Modify: `packages/canvas/src/timeline/TimelineNode.tsx`
- Modify: `packages/canvas/src/timeline/TimelineRelationshipLayer.tsx`
- Create: `packages/canvas/src/timeline/TimelineRelationField.tsx`
- Modify: `packages/canvas/src/timeline/TimelineLens.tsx`
- Test: `packages/canvas/src/timeline/TimelineRelationField.test.tsx`
- Test: `packages/canvas/src/timeline/TimelineRelationshipLayer.test.tsx`

**Step 1: Write the failing focused-field test**

With an event linked to archetypal and mythic entities, assert the event’s density control exposes every canonical incident relation and contextual endpoint. Assert contextual endpoints are absent from the historical axis and default rendering has no event-to-context SVG path.

**Step 2: Run the tests and confirm they fail**

Run: `pnpm vitest run packages/canvas/src/timeline/TimelineRelationField.test.tsx packages/canvas/src/timeline/TimelineRelationshipLayer.test.tsx`

**Step 3: Implement the focused relation field**

Use accessible event density controls. On focus, display the complete contextual relation list. Keep event-to-event paths only when both historical endpoints are in the render band; draw labels only for focused or pinned relations. Replace per-card global pointer listeners with delegated interaction.

**Step 4: Run the tests and confirm they pass**

Run: `pnpm vitest run packages/canvas/src/timeline/TimelineRelationField.test.tsx packages/canvas/src/timeline/TimelineRelationshipLayer.test.tsx`

### Task 6: Verify the semantic and performance boundary

**Files:**

- Test: `apps/desktop/src-tauri/src/commands/timeline.rs`
- Test: `packages/canvas/src/timeline/TimelineLens.test.tsx`
- Test: `packages/canvas/src/timeline/TimelineRelationField.test.tsx`

**Step 1: Add a production-shaped regression fixture**

Seed many out-of-range events and dense archetypal relations. Assert they do not enter the query result or mounted DOM, while every relation of a selected in-range event remains available.

**Step 2: Run targeted verification**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml timeline --lib && pnpm vitest run packages/canvas/src/timeline`

**Step 3: Run workspace verification**

Run: `pnpm typecheck && pnpm test`

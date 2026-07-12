# Single-Surface Canvas Card Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development and redesign-existing-projects to implement this plan task-by-task.

**Goal:** Make each canvas card a single clean visible object with accurate hitbox, persistent colour, and manipulable size.

**Architecture:** React Flow host wrappers are transparent and geometry-only. One shared visible card frame owns background, border, handles, selection, resize affordance, and dot/pill/card variants. Group/container nodes and constellation portals use distinct render types.

**Tech Stack:** React, React Flow, CSS, Vitest/Testing Library, Playwright computed-style and pointer tests.

---

## Task 1: Capture the current double-surface failure

**Files:** `packages/canvas/src/CanvasView.test.tsx`, node component tests, new Playwright card geometry test.

1. Render a root portal, note, group/container, and resource node at representative zooms.
2. Assert the current portal has more than one visible bordered/background surface; preserve a screenshot as test output.
3. Record host and visible-card bounding rectangles.
4. Commit test only: `test: expose nested canvas card surfaces`.

## Task 2: Separate host, group, and portal render types

**Files:** `CanvasView.tsx`, `AdaptiveNode.tsx`, `GroupNode.tsx`, `NoteNode.tsx`, `ResourceNode.tsx`, `apps/desktop/src/features/canvas/canvasViewToNodes.ts`.

1. Add mapping tests preventing semantic `group`/portal nodes from colliding with React Flow container behaviour.
2. Introduce explicit render types and transparent, padding-free host wrappers.
3. Verify parent/child grouping behaviour remains correct.
4. Commit: `refactor: separate canvas host and semantic node types`.

## Task 3: Introduce one shared visible card frame

**Files:** new `packages/canvas/src/nodes/NodeFrame.tsx`, node components, `apps/desktop/src/styles.css`/canvas styles.

1. Add component tests for exactly one visible surface and one resize frame.
2. Move surface styling, selection, handles, and resize controls into `NodeFrame`.
3. Keep content components semantic and free of duplicate full-size wrappers.
4. Preserve the existing visual language while removing the grey exterior box.
5. Commit: `fix: render canvas nodes as one visible surface`.

## Task 4: Persist real size and colour manipulation

**Files:** canvas store/layout snapshot, desktop persistence mapping, Rust layout repository if needed, tests.

1. Write pointer-level resize and colour-change tests that flush through real persistence and reload.
2. Support all intended corners with minimum/maximum constraints and dot/pill/card mode transitions.
3. Make hitbox equal the visible surface at multiple zooms.
4. Commit: `feat: persist canvas card geometry and colour`.

## Task 5: Rendered visual acceptance

**Files:** Playwright workflow and snapshots.

1. Capture root portal field and one nested child constellation.
2. Assert computed host transparency, zero host padding/border, one visible surface, accurate rectangles, and usable resize handles.
3. Verify keyboard selection and double-click reading remain intact.
4. Commit: `test: verify single-surface canvas cards`.


# Timeline Lens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the **Timeline Lens** (design spec §5.5): a greenfield, multi-scale time axis with semantic zoom (millennia → century → era → event → moment) that projects **only** temporally-located graph nodes (`GraphNode.isTemporal === true`), never forces trans-temporal nodes onto the axis, supports smooth pan/zoom, lights up every datable instance a selected trans-temporal node `INSTANTIATES`/`ECHOES` ("archetypal lighting"), surfaces an event's resonant archetypes with dominant/secondary frequency, and opens the **same** full document a timeline node shares with the canvas. v1 bar: navigable core (multi-scale pan/zoom + lighting + click-to-open). Lanes/clustering/animation are explicitly out of v1 scope.

**Architecture:** Pure-function core (scale math, projection, lighting reduction) lives in `packages/canvas/src/timeline/` as framework-agnostic, fully unit-tested modules. A thin Zustand vanilla store (`timelineStore`) holds view state (focused instant, pixels-per-year zoom, active scale tier, lit instance set, selection). React components (`TimelineLens`, `TimelineAxis`, `TimelineTrack`, `TimelineNode`, `ResonancePopover`) render the store and are wired into `apps/desktop/src/layout/Shell.tsx` behind a lens switch. All data is fetched **only** through the `WorkspaceTransport` seam defined in WS0 §5 — `loadCanvasView({ lens: "timeline" })`, `archetypalLighting`, `resonancesForInstance` — never via Tauri/Neo4j directly. Opening a timeline node reuses the existing `workspace.selectNode` + full-screen reader path so canvas and timeline open identical documents.

**Tech Stack:** Tauri v2; React 19 + Vite 7 + TypeScript 5.9; pnpm monorepo (`@research-canvas/canvas`, `@research-canvas/desktop`, `@research-canvas/desktop-api`); XYFlow `@xyflow/react` v12.8.5 (canvas only — the timeline is hand-rolled SVG/DOM, not XYFlow); Zustand v5 vanilla stores; Vitest 3 + jsdom + Testing Library; test-first (TDD).

## Global Constraints

- Tauri v2; React 19 + Vite 7 + TypeScript 5.9; pnpm monorepo; XYFlow `@xyflow/react` v12.8.5; Zustand v5 vanilla stores.
- Test-first (TDD) for every backend repository, frontend state model, and export behavior.
- Prefer **REAL integration tests** (real SQLite in temp dir, real Neo4j against an ephemeral/docker instance, real fixture filesystem) over mocks.
- ALWAYS run Rust tests with `--test-threads=1`.
- Keep file/folder/package names per the repo's existing conventions.

---

## Workstream dependencies (read before starting)

WS5 is **frontend-only** and greenfield. It depends on the following contracts already existing (delivered by WS0 contracts and implemented by WS2 data layer). If WS2 is not yet merged, every Task in this plan still proceeds because **all transport calls are injected behind an interface** and tests use an in-memory fake transport — production wiring (Task 12) is the only step that touches the real transport, and it consumes the WS0 signatures verbatim.

Consumed contract types (WS0 §5.1, TypeScript, in `@research-canvas/desktop-api`):

```ts
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

export interface NodeLayout {
  graphNodeId: string;
  canvasId: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  style: { dotColour?: string; bgColour?: string; textColour?: string; thumbnail?: string };
}

export interface JoinedCanvasNode { node: GraphNode; layout: NodeLayout; }

export interface GraphRelationship {
  id: string; relType: string;
  sourceGraphNodeId: string; targetGraphNodeId: string;
  properties: Record<string, unknown>;
}

export interface EdgeLayout {
  id: string; canvasId: string;
  sourceGraphNodeId: string; targetGraphNodeId: string;
  relationKind: string; sourceHandleId?: string; targetHandleId?: string;
  style: { stroke?: string; width?: number; dashed?: boolean };
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
```

Consumed transport methods (WS0 §5.2, `WorkspaceTransport`):

```ts
loadCanvasView(input: { canvasId: string; lens: "canvas" | "timeline" }): Promise<CanvasView>;
archetypalLighting(input: { operatorGraphNodeId: string }): Promise<ArchetypalLighting>;
resonancesForInstance(input: { graphNodeId: string }): Promise<LitInstance[]>;
```

Consumed Rust contracts (WS0 §4.2, used by WS2 to serve the above — WS5 does not call them directly; listed so the timeline lens's server-filter expectation is explicit): `GraphRepository::list_nodes_for_lens("timeline")` returns only `is_temporal == true` nodes; `GraphRepository::archetypal_lighting(...) -> ArchetypalLightingResult`; `GraphRepository::resonances_for_instance(...) -> Vec<LitInstance>`.

Consumed existing app code: `apps/desktop/src/layout/Shell.tsx` (lens host), `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx` `useCanvasWorkspace()` hook exposing `selectNode(nodeId)` and `canvasId` (Shell already calls `workspace.selectNode`).

### Bootstrapping note (no WS2 yet?)

If `@research-canvas/desktop-api` does not yet export `loadCanvasView`/`archetypalLighting`/`resonancesForInstance`/`CanvasView`/`ArchetypalLighting`/`LitInstance`/`GraphNode` when you start Task 12, **do not** invent them — they are WS2's deliverable. Instead, gate Task 12 behind WS2 and ship Tasks 1–11 (the pure core + store + components + a fake-transport-driven integration test), which is fully working, testable software on its own. Tasks 1–11 import the contract types via a **local type-only mirror** (`packages/canvas/src/timeline/contracts.ts`, Task 1) that re-declares the consumed shapes verbatim from WS0 §5.1 so the package compiles standalone; Task 12 swaps the mirror for the real `@research-canvas/desktop-api` import.

---

## Task 1 — Local contract mirror for the timeline package

**Files:**
- Create `packages/canvas/src/timeline/contracts.ts`
- Create `packages/canvas/src/timeline/contracts.test.ts`

**Interfaces:**
- Consumes (from WS0 §5.1, mirrored verbatim): `GraphNode`, `LitInstance`, `ArchetypalLighting`, `CanvasView`, `EntityType`, `JoinedCanvasNode`.
- Produces: type-only re-exports `GraphNode`, `LitInstance`, `ArchetypalLighting`, `CanvasView`, `EntityType`, `JoinedCanvasNode`, `TemporalPrecision`, plus the runtime constant `TEMPORAL_PRECISIONS: readonly TemporalPrecision[]`.

Steps:

1. - [ ] Write failing test. Create `packages/canvas/src/timeline/contracts.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { TEMPORAL_PRECISIONS } from "./contracts";
import type { GraphNode } from "./contracts";

describe("timeline contracts mirror", () => {
  test("TEMPORAL_PRECISIONS lists every precision tier coarse-to-fine", () => {
    expect(TEMPORAL_PRECISIONS).toEqual([
      "millennium",
      "century",
      "decade",
      "year",
      "month",
      "day",
    ]);
  });

  test("GraphNode shape carries the timeline discriminator", () => {
    const node: GraphNode = {
      graphNodeId: "n1",
      entityType: "Event",
      title: "Banda genocide",
      body: "[]",
      summary: "",
      archetypalResonance: null,
      coordinate: null,
      sourceCoordinates: [],
      isTemporal: true,
      validFrom: "1621-01-01",
      validTo: "1621-12-31",
      temporalPrecision: "year",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(node.isTemporal).toBe(true);
  });
});
```

2. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/contracts.test.ts`. Expect FAIL: `Failed to resolve import "./contracts"` (file does not exist).

3. - [ ] Create `packages/canvas/src/timeline/contracts.ts` with the verbatim WS0 §5.1 mirror:

```ts
// Local type-only mirror of the WS0 §5.1 shared contracts so the canvas
// package compiles and tests standalone before WS2 ships the real
// @research-canvas/desktop-api exports. Task 12 swaps these imports for the
// real package. Keep this file byte-identical in shape to WS0 §5.1.

export type EntityType =
  | "Figure" | "People" | "Event" | "Institution" | "Source"
  | "Place" | "Work" | "Archetype" | "Dynamic" | "PsychoidOperator";

export type TemporalPrecision =
  | "millennium" | "century" | "decade" | "year" | "month" | "day";

export const TEMPORAL_PRECISIONS: readonly TemporalPrecision[] = [
  "millennium",
  "century",
  "decade",
  "year",
  "month",
  "day",
] as const;

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
  temporalPrecision: TemporalPrecision | null;
  createdAt: string;
  updatedAt: string;
}

export interface NodeLayout {
  graphNodeId: string;
  canvasId: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  style: { dotColour?: string; bgColour?: string; textColour?: string; thumbnail?: string };
}

export interface JoinedCanvasNode {
  node: GraphNode;
  layout: NodeLayout;
}

export interface GraphRelationship {
  id: string;
  relType: string;
  sourceGraphNodeId: string;
  targetGraphNodeId: string;
  properties: Record<string, unknown>;
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
```

4. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/contracts.test.ts`. Expect PASS (2 passed).

5. - [ ] Commit:

```bash
git add packages/canvas/src/timeline/contracts.ts packages/canvas/src/timeline/contracts.test.ts
git commit -m "feat(timeline): local contract mirror for timeline package"
```

---

## Task 2 — `parseTemporalInstant`: ISO date → numeric fractional year

**Files:**
- Create `packages/canvas/src/timeline/instant.ts`
- Create `packages/canvas/src/timeline/instant.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export function parseTemporalInstant(iso: string | null): number | null;` — returns a fractional Gregorian year (e.g. `1621` for `"1621-01-01"`, `-43.5` for mid-43-BCE `"-0043-07-02"`), or `null` for null/empty/unparseable input. Negative years are BCE (ISO-8601 astronomical: year `0` exists).
  - `export const MS_PER_DAY = 86_400_000;`

Steps:

1. - [ ] Write failing test. Create `packages/canvas/src/timeline/instant.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { parseTemporalInstant } from "./instant";

describe("parseTemporalInstant", () => {
  test("returns null for null, empty, and garbage", () => {
    expect(parseTemporalInstant(null)).toBeNull();
    expect(parseTemporalInstant("")).toBeNull();
    expect(parseTemporalInstant("not-a-date")).toBeNull();
  });

  test("parses a plain year start to the integer year", () => {
    expect(parseTemporalInstant("1621-01-01")).toBeCloseTo(1621, 5);
  });

  test("mid-year date is a fractional year above the integer", () => {
    const y = parseTemporalInstant("1621-07-02")!;
    expect(y).toBeGreaterThan(1621.49);
    expect(y).toBeLessThan(1621.51);
  });

  test("parses a bare year string", () => {
    expect(parseTemporalInstant("1917")).toBeCloseTo(1917, 5);
  });

  test("parses an ISO datetime", () => {
    expect(parseTemporalInstant("1953-01-01T00:00:00Z")).toBeCloseTo(1953, 3);
  });

  test("parses BCE astronomical years as negative", () => {
    expect(parseTemporalInstant("-0043-01-01")).toBeCloseTo(-43, 3);
  });
});
```

2. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/instant.test.ts`. Expect FAIL: `Failed to resolve import "./instant"`.

3. - [ ] Create `packages/canvas/src/timeline/instant.ts`:

```ts
export const MS_PER_DAY = 86_400_000;

/**
 * Convert an ISO-8601 date / datetime / bare-year string into a fractional
 * Gregorian year. Returns null when the input is null, empty, or unparseable.
 * Astronomical year numbering: "-0043-01-01" => -43 (43 BCE), year 0 exists.
 */
export function parseTemporalInstant(iso: string | null): number | null {
  if (iso === null) return null;
  const trimmed = iso.trim();
  if (trimmed === "") return null;

  // Bare year, optionally signed: "1917", "-0043".
  const bareYear = /^(-?\d{1,6})$/u.exec(trimmed);
  if (bareYear) {
    const year = Number.parseInt(bareYear[1], 10);
    return Number.isNaN(year) ? null : year;
  }

  // Signed full date/datetime: capture the leading (possibly negative) year,
  // then let Date parse the absolute calendar value for the fractional part.
  const dateMatch = /^(-?)(\d{1,6})-(\d{2})-(\d{2})/u.exec(trimmed);
  if (!dateMatch) return null;
  const sign = dateMatch[1] === "-" ? -1 : 1;
  const year = Number.parseInt(dateMatch[2], 10);

  // Build a UTC date for the absolute year to measure the day-of-year fraction.
  const yearStart = Date.UTC(year, 0, 1);
  const nextYearStart = Date.UTC(year + 1, 0, 1);
  const month = Number.parseInt(dateMatch[3], 10) - 1;
  const day = Number.parseInt(dateMatch[4], 10);
  const at = Date.UTC(year, month, day);
  if (Number.isNaN(at)) return null;
  const fractionOfYear = (at - yearStart) / (nextYearStart - yearStart);

  return sign * year + (sign < 0 ? -fractionOfYear : fractionOfYear);
}
```

4. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/instant.test.ts`. Expect PASS (6 passed).

5. - [ ] Commit:

```bash
git add packages/canvas/src/timeline/instant.ts packages/canvas/src/timeline/instant.test.ts
git commit -m "feat(timeline): parseTemporalInstant ISO date to fractional year"
```

---

## Task 3 — Scale tiers: pixels-per-year → semantic zoom tier

**Files:**
- Create `packages/canvas/src/timeline/scale.ts`
- Create `packages/canvas/src/timeline/scale.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export type ScaleTier = "millennium" | "century" | "era" | "event" | "moment";`
  - `export interface ScaleTierSpec { tier: ScaleTier; minPixelsPerYear: number; tickYears: number; }`
  - `export const SCALE_TIERS: readonly ScaleTierSpec[];` (coarse→fine, the five tiers from spec §5.5)
  - `export function tierForPixelsPerYear(pixelsPerYear: number): ScaleTier;`
  - `export function tickIntervalYears(tier: ScaleTier): number;`
  - `export const MIN_PIXELS_PER_YEAR = 0.02;` `export const MAX_PIXELS_PER_YEAR = 4000;`

Steps:

1. - [ ] Write failing test. Create `packages/canvas/src/timeline/scale.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  MAX_PIXELS_PER_YEAR,
  MIN_PIXELS_PER_YEAR,
  SCALE_TIERS,
  tickIntervalYears,
  tierForPixelsPerYear,
} from "./scale";

describe("scale tiers", () => {
  test("five tiers, coarse to fine", () => {
    expect(SCALE_TIERS.map((t) => t.tier)).toEqual([
      "millennium",
      "century",
      "era",
      "event",
      "moment",
    ]);
  });

  test("tiers are sorted by ascending minPixelsPerYear", () => {
    for (let i = 1; i < SCALE_TIERS.length; i += 1) {
      expect(SCALE_TIERS[i].minPixelsPerYear).toBeGreaterThan(
        SCALE_TIERS[i - 1].minPixelsPerYear,
      );
    }
  });

  test("extreme zoom-out is the millennium tier", () => {
    expect(tierForPixelsPerYear(MIN_PIXELS_PER_YEAR)).toBe("millennium");
    expect(tierForPixelsPerYear(0.05)).toBe("millennium");
  });

  test("extreme zoom-in is the moment tier", () => {
    expect(tierForPixelsPerYear(MAX_PIXELS_PER_YEAR)).toBe("moment");
    expect(tierForPixelsPerYear(3000)).toBe("moment");
  });

  test("mid zoom lands on a middle tier", () => {
    expect(tierForPixelsPerYear(2)).toBe("century");
    expect(tierForPixelsPerYear(40)).toBe("era");
  });

  test("tick interval shrinks as the tier sharpens", () => {
    expect(tickIntervalYears("millennium")).toBe(1000);
    expect(tickIntervalYears("century")).toBe(100);
    expect(tickIntervalYears("era")).toBe(10);
    expect(tickIntervalYears("event")).toBe(1);
    expect(tickIntervalYears("moment")).toBe(1);
  });
});
```

2. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/scale.test.ts`. Expect FAIL: `Failed to resolve import "./scale"`.

3. - [ ] Create `packages/canvas/src/timeline/scale.ts`:

```ts
export type ScaleTier = "millennium" | "century" | "era" | "event" | "moment";

export interface ScaleTierSpec {
  tier: ScaleTier;
  /** Minimum pixels-per-year at which this tier becomes the active tier. */
  minPixelsPerYear: number;
  /** Spacing (in years) between major axis ticks at this tier. */
  tickYears: number;
}

export const MIN_PIXELS_PER_YEAR = 0.02;
export const MAX_PIXELS_PER_YEAR = 4000;

export const SCALE_TIERS: readonly ScaleTierSpec[] = [
  { tier: "millennium", minPixelsPerYear: 0.02, tickYears: 1000 },
  { tier: "century", minPixelsPerYear: 0.4, tickYears: 100 },
  { tier: "era", minPixelsPerYear: 8, tickYears: 10 },
  { tier: "event", minPixelsPerYear: 120, tickYears: 1 },
  { tier: "moment", minPixelsPerYear: 1500, tickYears: 1 },
] as const;

/** Pick the finest tier whose minPixelsPerYear threshold is met. */
export function tierForPixelsPerYear(pixelsPerYear: number): ScaleTier {
  let chosen: ScaleTier = SCALE_TIERS[0].tier;
  for (const spec of SCALE_TIERS) {
    if (pixelsPerYear >= spec.minPixelsPerYear) {
      chosen = spec.tier;
    }
  }
  return chosen;
}

export function tickIntervalYears(tier: ScaleTier): number {
  const spec = SCALE_TIERS.find((s) => s.tier === tier);
  return spec ? spec.tickYears : 1;
}
```

4. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/scale.test.ts`. Expect PASS (6 passed).

5. - [ ] Commit:

```bash
git add packages/canvas/src/timeline/scale.ts packages/canvas/src/timeline/scale.test.ts
git commit -m "feat(timeline): semantic-zoom scale tiers and tick intervals"
```

---

## Task 4 — Viewport math: year↔pixel projection, pan, zoom-at-cursor, clamp

**Files:**
- Create `packages/canvas/src/timeline/viewport.ts`
- Create `packages/canvas/src/timeline/viewport.test.ts`

**Interfaces:**
- Consumes (from Task 3): `MIN_PIXELS_PER_YEAR`, `MAX_PIXELS_PER_YEAR`.
- Produces:
  - `export interface TimelineViewport { centerYear: number; pixelsPerYear: number; widthPx: number; }`
  - `export function yearToPixel(viewport: TimelineViewport, year: number): number;`
  - `export function pixelToYear(viewport: TimelineViewport, px: number): number;`
  - `export function panByPixels(viewport: TimelineViewport, deltaPx: number): TimelineViewport;`
  - `export function zoomAt(viewport: TimelineViewport, factor: number, anchorPx: number): TimelineViewport;`
  - `export function clampPixelsPerYear(value: number): number;`

Steps:

1. - [ ] Write failing test. Create `packages/canvas/src/timeline/viewport.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  clampPixelsPerYear,
  panByPixels,
  pixelToYear,
  yearToPixel,
  zoomAt,
  type TimelineViewport,
} from "./viewport";
import { MAX_PIXELS_PER_YEAR, MIN_PIXELS_PER_YEAR } from "./scale";

const base: TimelineViewport = {
  centerYear: 1600,
  pixelsPerYear: 2,
  widthPx: 1000,
};

describe("timeline viewport math", () => {
  test("centerYear maps to the horizontal centre", () => {
    expect(yearToPixel(base, 1600)).toBeCloseTo(500, 5);
  });

  test("a year one unit later sits pixelsPerYear to the right of centre", () => {
    expect(yearToPixel(base, 1601)).toBeCloseTo(502, 5);
  });

  test("yearToPixel and pixelToYear are inverses", () => {
    const px = yearToPixel(base, 1583.25);
    expect(pixelToYear(base, px)).toBeCloseTo(1583.25, 5);
  });

  test("pan right by N pixels moves the centre earlier in time", () => {
    const panned = panByPixels(base, 200); // drag content right => see earlier
    expect(panned.centerYear).toBeCloseTo(1600 - 200 / 2, 5);
    expect(panned.pixelsPerYear).toBe(2);
    expect(panned.widthPx).toBe(1000);
  });

  test("clamp keeps pixelsPerYear inside the allowed band", () => {
    expect(clampPixelsPerYear(MIN_PIXELS_PER_YEAR / 10)).toBe(MIN_PIXELS_PER_YEAR);
    expect(clampPixelsPerYear(MAX_PIXELS_PER_YEAR * 10)).toBe(MAX_PIXELS_PER_YEAR);
    expect(clampPixelsPerYear(2)).toBe(2);
  });

  test("zoomAt keeps the year under the anchor pixel fixed", () => {
    const anchorPx = 750;
    const yearUnderAnchorBefore = pixelToYear(base, anchorPx);
    const zoomed = zoomAt(base, 2, anchorPx); // zoom in 2x
    expect(zoomed.pixelsPerYear).toBeCloseTo(4, 5);
    expect(yearToPixel(zoomed, yearUnderAnchorBefore)).toBeCloseTo(anchorPx, 4);
  });

  test("zoomAt respects clamp at the ceiling", () => {
    const zoomed = zoomAt(
      { ...base, pixelsPerYear: MAX_PIXELS_PER_YEAR },
      4,
      500,
    );
    expect(zoomed.pixelsPerYear).toBe(MAX_PIXELS_PER_YEAR);
  });
});
```

2. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/viewport.test.ts`. Expect FAIL: `Failed to resolve import "./viewport"`.

3. - [ ] Create `packages/canvas/src/timeline/viewport.ts`:

```ts
import { MAX_PIXELS_PER_YEAR, MIN_PIXELS_PER_YEAR } from "./scale";

export interface TimelineViewport {
  /** Fractional year shown at the horizontal centre of the track. */
  centerYear: number;
  /** Horizontal scale. Larger = zoomed in. */
  pixelsPerYear: number;
  /** Pixel width of the track viewport. */
  widthPx: number;
}

export function clampPixelsPerYear(value: number): number {
  if (value < MIN_PIXELS_PER_YEAR) return MIN_PIXELS_PER_YEAR;
  if (value > MAX_PIXELS_PER_YEAR) return MAX_PIXELS_PER_YEAR;
  return value;
}

export function yearToPixel(viewport: TimelineViewport, year: number): number {
  return viewport.widthPx / 2 + (year - viewport.centerYear) * viewport.pixelsPerYear;
}

export function pixelToYear(viewport: TimelineViewport, px: number): number {
  return viewport.centerYear + (px - viewport.widthPx / 2) / viewport.pixelsPerYear;
}

/**
 * Drag the content by deltaPx. Positive delta = content moves right under the
 * cursor (the classic grab-and-drag), so the visible centre shifts to an
 * EARLIER year.
 */
export function panByPixels(
  viewport: TimelineViewport,
  deltaPx: number,
): TimelineViewport {
  return {
    ...viewport,
    centerYear: viewport.centerYear - deltaPx / viewport.pixelsPerYear,
  };
}

/**
 * Multiply zoom by `factor` while keeping the year currently under `anchorPx`
 * pinned to that same pixel.
 */
export function zoomAt(
  viewport: TimelineViewport,
  factor: number,
  anchorPx: number,
): TimelineViewport {
  const anchorYear = pixelToYear(viewport, anchorPx);
  const nextPixelsPerYear = clampPixelsPerYear(viewport.pixelsPerYear * factor);
  // Solve centerYear so yearToPixel(next, anchorYear) === anchorPx.
  const nextCenterYear =
    anchorYear - (anchorPx - viewport.widthPx / 2) / nextPixelsPerYear;
  return {
    ...viewport,
    pixelsPerYear: nextPixelsPerYear,
    centerYear: nextCenterYear,
  };
}
```

4. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/viewport.test.ts`. Expect PASS (7 passed).

5. - [ ] Commit:

```bash
git add packages/canvas/src/timeline/viewport.ts packages/canvas/src/timeline/viewport.test.ts
git commit -m "feat(timeline): viewport projection, pan, and zoom-at-cursor math"
```

---

## Task 5 — Projection: temporally-located GraphNodes → placed timeline items

**Files:**
- Create `packages/canvas/src/timeline/projection.ts`
- Create `packages/canvas/src/timeline/projection.test.ts`

**Interfaces:**
- Consumes (Task 1): `GraphNode`, `TemporalPrecision`. (Task 2): `parseTemporalInstant`. (Task 4): `TimelineViewport`, `yearToPixel`.
- Produces:
  - `export interface TimelineItem { graphNodeId: string; node: GraphNode; startYear: number; endYear: number | null; precision: TemporalPrecision; }`
  - `export function projectNodes(nodes: GraphNode[]): TimelineItem[];` — keeps only `isTemporal === true` nodes that have a parseable `validFrom`; sorted ascending by `startYear`; `endYear` is parsed from `validTo` (null when absent/unparseable = ongoing); precision falls back to `"year"`.
  - `export interface PlacedItem { item: TimelineItem; startPx: number; endPx: number; }`
  - `export function placeItems(items: TimelineItem[], viewport: TimelineViewport): PlacedItem[];` — for ongoing items (`endYear === null`) `endPx === startPx`.

Steps:

1. - [ ] Write failing test. Create `packages/canvas/src/timeline/projection.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { placeItems, projectNodes } from "./projection";
import type { GraphNode } from "./contracts";
import type { TimelineViewport } from "./viewport";

function node(over: Partial<GraphNode>): GraphNode {
  return {
    graphNodeId: over.graphNodeId ?? "n",
    entityType: over.entityType ?? "Event",
    title: over.title ?? "t",
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    isTemporal: over.isTemporal ?? true,
    validFrom: over.validFrom ?? null,
    validTo: over.validTo ?? null,
    temporalPrecision: over.temporalPrecision ?? null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("projectNodes", () => {
  test("drops trans-temporal nodes (isTemporal === false)", () => {
    const out = projectNodes([
      node({ graphNodeId: "arch", isTemporal: false, validFrom: "1600-01-01" }),
    ]);
    expect(out).toEqual([]);
  });

  test("drops temporal nodes with no parseable validFrom", () => {
    const out = projectNodes([
      node({ graphNodeId: "x", isTemporal: true, validFrom: null }),
      node({ graphNodeId: "y", isTemporal: true, validFrom: "garbage" }),
    ]);
    expect(out).toEqual([]);
  });

  test("projects an event with start and end, sorted ascending", () => {
    const out = projectNodes([
      node({ graphNodeId: "b", validFrom: "1917-01-01", temporalPrecision: "year" }),
      node({
        graphNodeId: "a",
        validFrom: "1621-01-01",
        validTo: "1621-12-31",
        temporalPrecision: "year",
      }),
    ]);
    expect(out.map((i) => i.graphNodeId)).toEqual(["a", "b"]);
    expect(out[0].startYear).toBeCloseTo(1621, 5);
    expect(out[0].endYear).toBeCloseTo(1621.99, 1);
    expect(out[1].endYear).toBeNull(); // ongoing / no validTo
  });

  test("precision defaults to year when absent", () => {
    const out = projectNodes([node({ validFrom: "1953-01-01", temporalPrecision: null })]);
    expect(out[0].precision).toBe("year");
  });
});

describe("placeItems", () => {
  const viewport: TimelineViewport = { centerYear: 1700, pixelsPerYear: 1, widthPx: 1000 };

  test("places start/end at projected pixels; ongoing has endPx === startPx", () => {
    const items = projectNodes([
      node({
        graphNodeId: "a",
        validFrom: "1700-01-01",
        validTo: "1710-01-01",
        temporalPrecision: "year",
      }),
      node({ graphNodeId: "b", validFrom: "1700-01-01", temporalPrecision: "year" }),
    ]);
    const placed = placeItems(items, viewport);
    const a = placed.find((p) => p.item.graphNodeId === "a")!;
    const b = placed.find((p) => p.item.graphNodeId === "b")!;
    expect(a.startPx).toBeCloseTo(500, 3);
    expect(a.endPx).toBeCloseTo(510, 3);
    expect(b.startPx).toBeCloseTo(500, 3);
    expect(b.endPx).toBeCloseTo(500, 3); // ongoing
  });
});
```

2. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/projection.test.ts`. Expect FAIL: `Failed to resolve import "./projection"`.

3. - [ ] Create `packages/canvas/src/timeline/projection.ts`:

```ts
import type { GraphNode, TemporalPrecision } from "./contracts";
import { parseTemporalInstant } from "./instant";
import { yearToPixel, type TimelineViewport } from "./viewport";

export interface TimelineItem {
  graphNodeId: string;
  node: GraphNode;
  startYear: number;
  /** null = ongoing / open-ended (no validTo). */
  endYear: number | null;
  precision: TemporalPrecision;
}

export interface PlacedItem {
  item: TimelineItem;
  startPx: number;
  endPx: number;
}

/**
 * Keep only temporally-located nodes with a parseable validFrom and project
 * them onto a numeric year axis. Trans-temporal nodes (isTemporal === false)
 * are never projected (WS0 §8.1). Sorted ascending by startYear.
 */
export function projectNodes(nodes: GraphNode[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const node of nodes) {
    if (!node.isTemporal) continue;
    const startYear = parseTemporalInstant(node.validFrom);
    if (startYear === null) continue;
    const endYear = parseTemporalInstant(node.validTo);
    items.push({
      graphNodeId: node.graphNodeId,
      node,
      startYear,
      endYear,
      precision: node.temporalPrecision ?? "year",
    });
  }
  items.sort((a, b) => a.startYear - b.startYear);
  return items;
}

export function placeItems(
  items: TimelineItem[],
  viewport: TimelineViewport,
): PlacedItem[] {
  return items.map((item) => {
    const startPx = yearToPixel(viewport, item.startYear);
    const endPx =
      item.endYear === null ? startPx : yearToPixel(viewport, item.endYear);
    return { item, startPx, endPx };
  });
}
```

4. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/projection.test.ts`. Expect PASS (6 passed).

5. - [ ] Commit:

```bash
git add packages/canvas/src/timeline/projection.ts packages/canvas/src/timeline/projection.test.ts
git commit -m "feat(timeline): project temporal GraphNodes onto the year axis"
```

---

## Task 6 — Axis ticks: generate labelled ticks for the visible range

**Files:**
- Create `packages/canvas/src/timeline/ticks.ts`
- Create `packages/canvas/src/timeline/ticks.test.ts`

**Interfaces:**
- Consumes (Task 3): `ScaleTier`, `tickIntervalYears`. (Task 4): `TimelineViewport`, `pixelToYear`, `yearToPixel`.
- Produces:
  - `export interface AxisTick { year: number; px: number; label: string; }`
  - `export function generateTicks(viewport: TimelineViewport, tier: ScaleTier): AxisTick[];`
  - `export function formatYearLabel(year: number, tier: ScaleTier): string;` — millennium/century/era tiers label the rounded year with BCE/CE suffix (`"1000 CE"`, `"43 BCE"`); event/moment tiers label the integer year.

Steps:

1. - [ ] Write failing test. Create `packages/canvas/src/timeline/ticks.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { formatYearLabel, generateTicks } from "./ticks";
import type { TimelineViewport } from "./viewport";

describe("formatYearLabel", () => {
  test("CE years carry a CE suffix", () => {
    expect(formatYearLabel(1000, "millennium")).toBe("1000 CE");
  });
  test("negative years are BCE with positive magnitude", () => {
    expect(formatYearLabel(-43, "century")).toBe("43 BCE");
  });
  test("event tier labels the integer year", () => {
    expect(formatYearLabel(1621, "event")).toBe("1621 CE");
  });
});

describe("generateTicks", () => {
  test("century tier emits ticks at 100-year boundaries across the view", () => {
    const viewport: TimelineViewport = {
      centerYear: 1650,
      pixelsPerYear: 1,
      widthPx: 600, // visible ~1350..1950
    };
    const ticks = generateTicks(viewport, "century");
    const years = ticks.map((t) => t.year);
    expect(years).toContain(1400);
    expect(years).toContain(1700);
    expect(years).toContain(1900);
    // all multiples of 100
    expect(years.every((y) => y % 100 === 0)).toBe(true);
  });

  test("tick px positions are monotonically increasing with year", () => {
    const viewport: TimelineViewport = {
      centerYear: 1650,
      pixelsPerYear: 1,
      widthPx: 600,
    };
    const ticks = generateTicks(viewport, "century");
    for (let i = 1; i < ticks.length; i += 1) {
      expect(ticks[i].px).toBeGreaterThan(ticks[i - 1].px);
      expect(ticks[i].year).toBeGreaterThan(ticks[i - 1].year);
    }
  });

  test("the first visible tick is at or before the left edge year", () => {
    const viewport: TimelineViewport = {
      centerYear: 1650,
      pixelsPerYear: 1,
      widthPx: 600,
    };
    const ticks = generateTicks(viewport, "century");
    expect(ticks[0].year).toBeLessThanOrEqual(1350);
  });
});
```

2. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/ticks.test.ts`. Expect FAIL: `Failed to resolve import "./ticks"`.

3. - [ ] Create `packages/canvas/src/timeline/ticks.ts`:

```ts
import { tickIntervalYears, type ScaleTier } from "./scale";
import { pixelToYear, yearToPixel, type TimelineViewport } from "./viewport";

export interface AxisTick {
  year: number;
  px: number;
  label: string;
}

export function formatYearLabel(year: number, _tier: ScaleTier): string {
  const rounded = Math.round(year);
  if (rounded < 0) return `${Math.abs(rounded)} BCE`;
  return `${rounded} CE`;
}

/**
 * Emit one tick per `tickIntervalYears(tier)` boundary across the visible
 * range, padded by one interval on each side so partial ticks render at the
 * edges. Ascending by year/px.
 */
export function generateTicks(
  viewport: TimelineViewport,
  tier: ScaleTier,
): AxisTick[] {
  const interval = tickIntervalYears(tier);
  const leftYear = pixelToYear(viewport, 0);
  const rightYear = pixelToYear(viewport, viewport.widthPx);

  const firstTick = Math.floor(leftYear / interval) * interval - interval;
  const lastTick = Math.ceil(rightYear / interval) * interval + interval;

  const ticks: AxisTick[] = [];
  for (let year = firstTick; year <= lastTick; year += interval) {
    ticks.push({
      year,
      px: yearToPixel(viewport, year),
      label: formatYearLabel(year, tier),
    });
  }
  return ticks;
}
```

4. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/ticks.test.ts`. Expect PASS (6 passed).

5. - [ ] Commit:

```bash
git add packages/canvas/src/timeline/ticks.ts packages/canvas/src/timeline/ticks.test.ts
git commit -m "feat(timeline): axis tick generation and year labels"
```

---

## Task 7 — Lighting reduction: fold ArchetypalLighting / resonances into render state

**Files:**
- Create `packages/canvas/src/timeline/lighting.ts`
- Create `packages/canvas/src/timeline/lighting.test.ts`

**Interfaces:**
- Consumes (Task 1): `ArchetypalLighting`, `LitInstance`.
- Produces:
  - `export type Dominance = "dominant" | "secondary";`
  - `export interface LitNodeState { dominance: Dominance; relType: "INSTANTIATES" | "ECHOES"; }`
  - `export type LitMap = Map<string, LitNodeState>;` keyed by `graphNodeId`.
  - `export function buildLitMap(lighting: ArchetypalLighting | null): LitMap;` — null lighting → empty map. When the same instance appears twice, `INSTANTIATES` beats `ECHOES`, and `dominant` beats `secondary`; missing `dominance` defaults to `"secondary"`.
  - `export function dominantResonance(instances: LitInstance[]): LitInstance | null;` — the strongest resonance for an event (dominant before secondary; `INSTANTIATES` before `ECHOES`; null on empty).

Steps:

1. - [ ] Write failing test. Create `packages/canvas/src/timeline/lighting.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { buildLitMap, dominantResonance } from "./lighting";
import type { ArchetypalLighting, GraphNode, LitInstance } from "./contracts";

function gnode(id: string): GraphNode {
  return {
    graphNodeId: id,
    entityType: "Event",
    title: id,
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    isTemporal: true,
    validFrom: "1600-01-01",
    validTo: null,
    temporalPrecision: "year",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("buildLitMap", () => {
  test("null lighting yields an empty map", () => {
    expect(buildLitMap(null).size).toBe(0);
  });

  test("maps each lit instance by graphNodeId with dominance + relType", () => {
    const lighting: ArchetypalLighting = {
      operator: gnode("op"),
      instances: [
        { node: gnode("a"), relType: "INSTANTIATES", dominance: "dominant" },
        { node: gnode("b"), relType: "ECHOES", dominance: "secondary" },
      ],
    };
    const map = buildLitMap(lighting);
    expect(map.get("a")).toEqual({ dominance: "dominant", relType: "INSTANTIATES" });
    expect(map.get("b")).toEqual({ dominance: "secondary", relType: "ECHOES" });
  });

  test("missing dominance defaults to secondary", () => {
    const lighting: ArchetypalLighting = {
      operator: gnode("op"),
      instances: [{ node: gnode("a"), relType: "ECHOES", dominance: null }],
    };
    expect(buildLitMap(lighting).get("a")).toEqual({
      dominance: "secondary",
      relType: "ECHOES",
    });
  });

  test("duplicate instance: INSTANTIATES/dominant wins over ECHOES/secondary", () => {
    const lighting: ArchetypalLighting = {
      operator: gnode("op"),
      instances: [
        { node: gnode("a"), relType: "ECHOES", dominance: "secondary" },
        { node: gnode("a"), relType: "INSTANTIATES", dominance: "dominant" },
      ],
    };
    expect(buildLitMap(lighting).get("a")).toEqual({
      dominance: "dominant",
      relType: "INSTANTIATES",
    });
  });
});

describe("dominantResonance", () => {
  test("returns null for no resonances", () => {
    expect(dominantResonance([])).toBeNull();
  });

  test("dominant INSTANTIATES beats secondary ECHOES", () => {
    const instances: LitInstance[] = [
      { node: gnode("x"), relType: "ECHOES", dominance: "secondary" },
      { node: gnode("y"), relType: "INSTANTIATES", dominance: "dominant" },
    ];
    expect(dominantResonance(instances)!.node.graphNodeId).toBe("y");
  });
});
```

2. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/lighting.test.ts`. Expect FAIL: `Failed to resolve import "./lighting"`.

3. - [ ] Create `packages/canvas/src/timeline/lighting.ts`:

```ts
import type { ArchetypalLighting, LitInstance } from "./contracts";

export type Dominance = "dominant" | "secondary";

export interface LitNodeState {
  dominance: Dominance;
  relType: "INSTANTIATES" | "ECHOES";
}

export type LitMap = Map<string, LitNodeState>;

function rank(instance: { relType: "INSTANTIATES" | "ECHOES"; dominance: Dominance }): number {
  // Higher rank = stronger lighting. INSTANTIATES(2) > ECHOES(0);
  // dominant(+1) > secondary(+0). Range 0..3.
  const relScore = instance.relType === "INSTANTIATES" ? 2 : 0;
  const domScore = instance.dominance === "dominant" ? 1 : 0;
  return relScore + domScore;
}

function normalizeDominance(value: LitInstance["dominance"]): Dominance {
  return value === "dominant" ? "dominant" : "secondary";
}

/** Fold an ArchetypalLighting result into a graphNodeId -> strongest-state map. */
export function buildLitMap(lighting: ArchetypalLighting | null): LitMap {
  const map: LitMap = new Map();
  if (!lighting) return map;
  for (const instance of lighting.instances) {
    const candidate: LitNodeState = {
      dominance: normalizeDominance(instance.dominance),
      relType: instance.relType,
    };
    const existing = map.get(instance.node.graphNodeId);
    if (!existing || rank(candidate) > rank(existing)) {
      map.set(instance.node.graphNodeId, candidate);
    }
  }
  return map;
}

/** The single strongest resonance for an event (for the resonance popover). */
export function dominantResonance(instances: LitInstance[]): LitInstance | null {
  let best: LitInstance | null = null;
  let bestRank = -1;
  for (const instance of instances) {
    const r = rank({
      relType: instance.relType,
      dominance: normalizeDominance(instance.dominance),
    });
    if (r > bestRank) {
      best = instance;
      bestRank = r;
    }
  }
  return best;
}
```

4. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/lighting.test.ts`. Expect PASS (6 passed).

5. - [ ] Commit:

```bash
git add packages/canvas/src/timeline/lighting.ts packages/canvas/src/timeline/lighting.test.ts
git commit -m "feat(timeline): fold archetypal lighting + resonances into render state"
```

---

## Task 8 — `timelineStore` (Zustand vanilla): view state + actions

**Files:**
- Create `packages/canvas/src/timeline/timelineStore.ts`
- Create `packages/canvas/src/timeline/timelineStore.test.ts`

**Interfaces:**
- Consumes (Task 1): `GraphNode`, `ArchetypalLighting`. (Task 3): `ScaleTier`, `tierForPixelsPerYear`. (Task 4): `TimelineViewport`, `panByPixels`, `zoomAt`, `clampPixelsPerYear`. (Task 5): `TimelineItem`, `projectNodes`. (Task 7): `LitMap`, `buildLitMap`.
- Produces:
  - `export interface TimelineStoreState { centerYear; pixelsPerYear; widthPx; items; litMap; selectedNodeId; lightingOperatorId; viewport(): TimelineViewport; tier(): ScaleTier; setWidth(px); hydrate(nodes); pan(deltaPx); zoom(factor, anchorPx); setView(centerYear, pixelsPerYear); setLighting(lighting); clearLighting(); setSelected(nodeId); }` (full signatures in impl).
  - `export function createTimelineStore(options?: { initialCenterYear?: number; initialPixelsPerYear?: number }): StoreApi<TimelineStoreState>;`

Steps:

1. - [ ] Write failing test. Create `packages/canvas/src/timeline/timelineStore.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { createTimelineStore } from "./timelineStore";
import type { ArchetypalLighting, GraphNode } from "./contracts";

function node(over: Partial<GraphNode>): GraphNode {
  return {
    graphNodeId: over.graphNodeId ?? "n",
    entityType: over.entityType ?? "Event",
    title: over.title ?? "t",
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    isTemporal: over.isTemporal ?? true,
    validFrom: over.validFrom ?? "1600-01-01",
    validTo: over.validTo ?? null,
    temporalPrecision: over.temporalPrecision ?? "year",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("timelineStore", () => {
  test("hydrate keeps only temporal nodes, sorted ascending", () => {
    const store = createTimelineStore();
    store.getState().hydrate([
      node({ graphNodeId: "late", validFrom: "1900-01-01" }),
      node({ graphNodeId: "early", validFrom: "1600-01-01" }),
      node({ graphNodeId: "trans", isTemporal: false, validFrom: "1700-01-01" }),
    ]);
    expect(store.getState().items.map((i) => i.graphNodeId)).toEqual(["early", "late"]);
  });

  test("setWidth updates the derived viewport width", () => {
    const store = createTimelineStore();
    store.getState().setWidth(1234);
    expect(store.getState().viewport().widthPx).toBe(1234);
  });

  test("tier() derives from current pixelsPerYear", () => {
    const store = createTimelineStore({ initialPixelsPerYear: 0.05 });
    expect(store.getState().tier()).toBe("millennium");
    store.getState().setView(1700, 200);
    expect(store.getState().tier()).toBe("event");
  });

  test("pan shifts centerYear, zoom changes pixelsPerYear", () => {
    const store = createTimelineStore({ initialCenterYear: 1600, initialPixelsPerYear: 2 });
    store.getState().setWidth(1000);
    store.getState().pan(200);
    expect(store.getState().centerYear).toBeCloseTo(1500, 5);
    store.getState().zoom(2, 500);
    expect(store.getState().pixelsPerYear).toBeCloseTo(4, 5);
  });

  test("setLighting builds the lit map; clearLighting empties it", () => {
    const store = createTimelineStore();
    const lighting: ArchetypalLighting = {
      operator: node({ graphNodeId: "op", isTemporal: false }),
      instances: [{ node: node({ graphNodeId: "a" }), relType: "INSTANTIATES", dominance: "dominant" }],
    };
    store.getState().setLighting(lighting);
    expect(store.getState().litMap.get("a")?.dominance).toBe("dominant");
    expect(store.getState().lightingOperatorId).toBe("op");
    store.getState().clearLighting();
    expect(store.getState().litMap.size).toBe(0);
    expect(store.getState().lightingOperatorId).toBeNull();
  });

  test("setSelected records the selected node id", () => {
    const store = createTimelineStore();
    store.getState().setSelected("x");
    expect(store.getState().selectedNodeId).toBe("x");
  });
});
```

2. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/timelineStore.test.ts`. Expect FAIL: `Failed to resolve import "./timelineStore"`.

3. - [ ] Create `packages/canvas/src/timeline/timelineStore.ts`:

```ts
import { createStore, type StoreApi } from "zustand/vanilla";

import type { ArchetypalLighting, GraphNode } from "./contracts";
import { tierForPixelsPerYear, type ScaleTier } from "./scale";
import { projectNodes, type TimelineItem } from "./projection";
import { buildLitMap, type LitMap } from "./lighting";
import {
  clampPixelsPerYear,
  panByPixels,
  zoomAt,
  type TimelineViewport,
} from "./viewport";

export interface TimelineStoreState {
  centerYear: number;
  pixelsPerYear: number;
  widthPx: number;
  items: TimelineItem[];
  litMap: LitMap;
  selectedNodeId: string | null;
  lightingOperatorId: string | null;

  viewport: () => TimelineViewport;
  tier: () => ScaleTier;

  setWidth: (px: number) => void;
  hydrate: (nodes: GraphNode[]) => void;
  pan: (deltaPx: number) => void;
  zoom: (factor: number, anchorPx: number) => void;
  setView: (centerYear: number, pixelsPerYear: number) => void;
  setLighting: (lighting: ArchetypalLighting) => void;
  clearLighting: () => void;
  setSelected: (nodeId: string | null) => void;
}

interface CreateTimelineStoreOptions {
  initialCenterYear?: number;
  initialPixelsPerYear?: number;
}

export function createTimelineStore(
  options: CreateTimelineStoreOptions = {},
): StoreApi<TimelineStoreState> {
  return createStore<TimelineStoreState>((set, get) => ({
    centerYear: options.initialCenterYear ?? 1700,
    pixelsPerYear: clampPixelsPerYear(options.initialPixelsPerYear ?? 2),
    widthPx: 1000,
    items: [],
    litMap: new Map(),
    selectedNodeId: null,
    lightingOperatorId: null,

    viewport: () => {
      const s = get();
      return {
        centerYear: s.centerYear,
        pixelsPerYear: s.pixelsPerYear,
        widthPx: s.widthPx,
      };
    },
    tier: () => tierForPixelsPerYear(get().pixelsPerYear),

    setWidth: (px) => set({ widthPx: px }),
    hydrate: (nodes) => set({ items: projectNodes(nodes) }),
    pan: (deltaPx) => {
      const next = panByPixels(get().viewport(), deltaPx);
      set({ centerYear: next.centerYear });
    },
    zoom: (factor, anchorPx) => {
      const next = zoomAt(get().viewport(), factor, anchorPx);
      set({ centerYear: next.centerYear, pixelsPerYear: next.pixelsPerYear });
    },
    setView: (centerYear, pixelsPerYear) =>
      set({ centerYear, pixelsPerYear: clampPixelsPerYear(pixelsPerYear) }),
    setLighting: (lighting) =>
      set({
        litMap: buildLitMap(lighting),
        lightingOperatorId: lighting.operator.graphNodeId,
      }),
    clearLighting: () => set({ litMap: new Map(), lightingOperatorId: null }),
    setSelected: (nodeId) => set({ selectedNodeId: nodeId }),
  }));
}
```

4. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/timelineStore.test.ts`. Expect PASS (6 passed).

5. - [ ] Commit:

```bash
git add packages/canvas/src/timeline/timelineStore.ts packages/canvas/src/timeline/timelineStore.test.ts
git commit -m "feat(timeline): vanilla zustand timelineStore for view state"
```

---

## Task 9 — `TimelineNode` + `TimelineAxis` presentational components

**Files:**
- Create `packages/canvas/src/timeline/TimelineNode.tsx`
- Create `packages/canvas/src/timeline/TimelineNode.test.tsx`
- Create `packages/canvas/src/timeline/TimelineAxis.tsx`
- Create `packages/canvas/src/timeline/TimelineAxis.test.tsx`

**Interfaces:**
- Consumes (Task 5): `PlacedItem`. (Task 6): `AxisTick`. (Task 7): `LitNodeState`.
- Produces:
  - `export interface TimelineNodeProps { placed: PlacedItem; lit: LitNodeState | null; selected: boolean; dimmed: boolean; onSelect: (nodeId: string) => void; onOpen: (nodeId: string) => void; }`
  - `export function TimelineNode(props: TimelineNodeProps): JSX.Element;`
  - `export interface TimelineAxisProps { ticks: AxisTick[]; height: number; }`
  - `export function TimelineAxis(props: TimelineAxisProps): JSX.Element;`

Steps:

1. - [ ] Write failing test. Create `packages/canvas/src/timeline/TimelineNode.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TimelineNode } from "./TimelineNode";
import type { PlacedItem } from "./projection";
import type { GraphNode } from "./contracts";

function placed(over: Partial<GraphNode> & { startPx?: number; endPx?: number }): PlacedItem {
  const node: GraphNode = {
    graphNodeId: over.graphNodeId ?? "n1",
    entityType: over.entityType ?? "Event",
    title: over.title ?? "Banda genocide",
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    isTemporal: true,
    validFrom: "1621-01-01",
    validTo: null,
    temporalPrecision: "year",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  return {
    item: { graphNodeId: node.graphNodeId, node, startYear: 1621, endYear: null, precision: "year" },
    startPx: over.startPx ?? 120,
    endPx: over.endPx ?? 120,
  };
}

describe("TimelineNode", () => {
  test("renders the title and positions at startPx", () => {
    render(
      <TimelineNode
        placed={placed({ startPx: 200 })}
        lit={null}
        selected={false}
        dimmed={false}
        onSelect={() => {}}
        onOpen={() => {}}
      />,
    );
    const el = screen.getByTestId("timeline-node-n1");
    expect(el).toHaveTextContent("Banda genocide");
    expect(el.style.left).toBe("200px");
  });

  test("single click selects, double click opens", () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    render(
      <TimelineNode
        placed={placed({})}
        lit={null}
        selected={false}
        dimmed={false}
        onSelect={onSelect}
        onOpen={onOpen}
      />,
    );
    const el = screen.getByTestId("timeline-node-n1");
    fireEvent.click(el);
    expect(onSelect).toHaveBeenCalledWith("n1");
    fireEvent.doubleClick(el);
    expect(onOpen).toHaveBeenCalledWith("n1");
  });

  test("lit dominant node carries the lit-dominant data attribute", () => {
    render(
      <TimelineNode
        placed={placed({})}
        lit={{ dominance: "dominant", relType: "INSTANTIATES" }}
        selected={false}
        dimmed={false}
        onSelect={() => {}}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByTestId("timeline-node-n1").dataset.lit).toBe("dominant");
  });

  test("dimmed node carries the dimmed data attribute", () => {
    render(
      <TimelineNode
        placed={placed({})}
        lit={null}
        selected={false}
        dimmed={true}
        onSelect={() => {}}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByTestId("timeline-node-n1").dataset.dimmed).toBe("true");
  });
});
```

2. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/TimelineNode.test.tsx`. Expect FAIL: `Failed to resolve import "./TimelineNode"`.

3. - [ ] Create `packages/canvas/src/timeline/TimelineNode.tsx`:

```tsx
import type { PlacedItem } from "./projection";
import type { LitNodeState } from "./lighting";

export interface TimelineNodeProps {
  placed: PlacedItem;
  lit: LitNodeState | null;
  selected: boolean;
  dimmed: boolean;
  onSelect: (nodeId: string) => void;
  onOpen: (nodeId: string) => void;
}

export function TimelineNode({
  placed,
  lit,
  selected,
  dimmed,
  onSelect,
  onOpen,
}: TimelineNodeProps): JSX.Element {
  const { item, startPx, endPx } = placed;
  const spanWidth = Math.max(endPx - startPx, 0);
  return (
    <div
      data-testid={`timeline-node-${item.graphNodeId}`}
      data-entity-type={item.node.entityType}
      data-lit={lit ? lit.dominance : undefined}
      data-rel-type={lit ? lit.relType : undefined}
      data-selected={selected ? "true" : undefined}
      data-dimmed={dimmed ? "true" : undefined}
      className="timeline-node"
      style={{
        position: "absolute",
        left: `${startPx}px`,
        top: "0px",
        opacity: dimmed ? 0.25 : 1,
      }}
      onClick={() => onSelect(item.graphNodeId)}
      onDoubleClick={() => onOpen(item.graphNodeId)}
    >
      {spanWidth > 1 && (
        <div
          className="timeline-node-span"
          data-testid={`timeline-node-span-${item.graphNodeId}`}
          style={{ width: `${spanWidth}px` }}
        />
      )}
      <span className="timeline-node-dot" />
      <span className="timeline-node-title">{item.node.title}</span>
    </div>
  );
}
```

4. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/TimelineNode.test.tsx`. Expect PASS (4 passed).

5. - [ ] Write failing test. Create `packages/canvas/src/timeline/TimelineAxis.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimelineAxis } from "./TimelineAxis";
import type { AxisTick } from "./ticks";

describe("TimelineAxis", () => {
  test("renders one labelled tick per AxisTick at its px", () => {
    const ticks: AxisTick[] = [
      { year: 1600, px: 100, label: "1600 CE" },
      { year: 1700, px: 300, label: "1700 CE" },
    ];
    render(<TimelineAxis ticks={ticks} height={48} />);
    const t1 = screen.getByTestId("axis-tick-1600");
    const t2 = screen.getByTestId("axis-tick-1700");
    expect(t1).toHaveTextContent("1600 CE");
    expect(t1.style.left).toBe("100px");
    expect(t2.style.left).toBe("300px");
  });
});
```

6. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/TimelineAxis.test.tsx`. Expect FAIL: `Failed to resolve import "./TimelineAxis"`.

7. - [ ] Create `packages/canvas/src/timeline/TimelineAxis.tsx`:

```tsx
import type { AxisTick } from "./ticks";

export interface TimelineAxisProps {
  ticks: AxisTick[];
  height: number;
}

export function TimelineAxis({ ticks, height }: TimelineAxisProps): JSX.Element {
  return (
    <div
      className="timeline-axis"
      data-testid="timeline-axis"
      style={{ position: "relative", height: `${height}px` }}
    >
      {ticks.map((tick) => (
        <div
          key={tick.year}
          data-testid={`axis-tick-${tick.year}`}
          className="timeline-axis-tick"
          style={{ position: "absolute", left: `${tick.px}px`, top: "0px" }}
        >
          <span className="timeline-axis-tick-line" />
          <span className="timeline-axis-tick-label">{tick.label}</span>
        </div>
      ))}
    </div>
  );
}
```

8. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/TimelineAxis.test.tsx`. Expect PASS (1 passed).

9. - [ ] Commit:

```bash
git add packages/canvas/src/timeline/TimelineNode.tsx packages/canvas/src/timeline/TimelineNode.test.tsx packages/canvas/src/timeline/TimelineAxis.tsx packages/canvas/src/timeline/TimelineAxis.test.tsx
git commit -m "feat(timeline): TimelineNode and TimelineAxis presentational components"
```

---

## Task 10 — `ResonancePopover`: show an event's resonant archetypes

**Files:**
- Create `packages/canvas/src/timeline/ResonancePopover.tsx`
- Create `packages/canvas/src/timeline/ResonancePopover.test.tsx`

**Interfaces:**
- Consumes (Task 1): `LitInstance`. (Task 7): `dominantResonance`.
- Produces:
  - `export interface ResonancePopoverProps { resonances: LitInstance[]; onLightOperator: (operatorGraphNodeId: string) => void; }`
  - `export function ResonancePopover(props: ResonancePopoverProps): JSX.Element;` — lists each resonant operator with its dominance badge; marks the strongest with `data-dominant="true"`; clicking one calls `onLightOperator(node.graphNodeId)` (the inverse → forward lighting flip described in WS0 §8.2).

Steps:

1. - [ ] Write failing test. Create `packages/canvas/src/timeline/ResonancePopover.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ResonancePopover } from "./ResonancePopover";
import type { GraphNode, LitInstance } from "./contracts";

function op(id: string, title: string): GraphNode {
  return {
    graphNodeId: id,
    entityType: "Archetype",
    title,
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    isTemporal: false,
    validFrom: null,
    validTo: null,
    temporalPrecision: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("ResonancePopover", () => {
  test("empty state when no resonances", () => {
    render(<ResonancePopover resonances={[]} onLightOperator={() => {}} />);
    expect(screen.getByTestId("resonance-empty")).toBeInTheDocument();
  });

  test("lists operators and flags the dominant one", () => {
    const resonances: LitInstance[] = [
      { node: op("monopoly", "Monopoly mechanism"), relType: "INSTANTIATES", dominance: "dominant" },
      { node: op("wolf", "Dog/Wolf"), relType: "ECHOES", dominance: "secondary" },
    ];
    render(<ResonancePopover resonances={resonances} onLightOperator={() => {}} />);
    expect(screen.getByText("Monopoly mechanism")).toBeInTheDocument();
    expect(screen.getByText("Dog/Wolf")).toBeInTheDocument();
    expect(screen.getByTestId("resonance-row-monopoly").dataset.dominant).toBe("true");
    expect(screen.getByTestId("resonance-row-wolf").dataset.dominant).toBeUndefined();
  });

  test("clicking a row lights that operator", () => {
    const onLightOperator = vi.fn();
    const resonances: LitInstance[] = [
      { node: op("monopoly", "Monopoly mechanism"), relType: "INSTANTIATES", dominance: "dominant" },
    ];
    render(<ResonancePopover resonances={resonances} onLightOperator={onLightOperator} />);
    fireEvent.click(screen.getByTestId("resonance-row-monopoly"));
    expect(onLightOperator).toHaveBeenCalledWith("monopoly");
  });
});
```

2. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/ResonancePopover.test.tsx`. Expect FAIL: `Failed to resolve import "./ResonancePopover"`.

3. - [ ] Create `packages/canvas/src/timeline/ResonancePopover.tsx`:

```tsx
import type { LitInstance } from "./contracts";
import { dominantResonance } from "./lighting";

export interface ResonancePopoverProps {
  resonances: LitInstance[];
  onLightOperator: (operatorGraphNodeId: string) => void;
}

export function ResonancePopover({
  resonances,
  onLightOperator,
}: ResonancePopoverProps): JSX.Element {
  if (resonances.length === 0) {
    return (
      <div className="resonance-popover" data-testid="resonance-empty">
        No resonant archetypes recorded for this event.
      </div>
    );
  }
  const strongest = dominantResonance(resonances);
  return (
    <div className="resonance-popover" data-testid="resonance-popover">
      <div className="resonance-popover-title">Resonant archetypes</div>
      <ul className="resonance-list">
        {resonances.map((r) => {
          const isDominant =
            strongest !== null &&
            strongest.node.graphNodeId === r.node.graphNodeId;
          return (
            <li
              key={r.node.graphNodeId}
              data-testid={`resonance-row-${r.node.graphNodeId}`}
              data-dominant={isDominant ? "true" : undefined}
              data-rel-type={r.relType}
              className="resonance-row"
              onClick={() => onLightOperator(r.node.graphNodeId)}
            >
              <span className="resonance-row-title">{r.node.title}</span>
              <span className="resonance-row-badge">
                {r.dominance ?? "secondary"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

4. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/ResonancePopover.test.tsx`. Expect PASS (3 passed).

5. - [ ] Commit:

```bash
git add packages/canvas/src/timeline/ResonancePopover.tsx packages/canvas/src/timeline/ResonancePopover.test.tsx
git commit -m "feat(timeline): ResonancePopover surfacing an event's archetypes"
```

---

## Task 11 — `TimelineLens` container: wire store + components + transport, with fake transport

**Files:**
- Create `packages/canvas/src/timeline/TimelineLens.tsx`
- Create `packages/canvas/src/timeline/TimelineLens.test.tsx`
- Modify `packages/canvas/src/index.ts` (add timeline exports; current last export line is `export * from "./state/canvasStore";`)

**Interfaces:**
- Consumes (Task 1): `GraphNode`, `ArchetypalLighting`, `LitInstance`. (Task 8): `createTimelineStore`. (Task 4): `pixelToYear`. (Tasks 5,6,7,9,10): `placeItems`, `generateTicks`, `TimelineNode`, `TimelineAxis`, `ResonancePopover`.
- Produces:
  - `export interface TimelineDataSource { loadTimelineNodes(): Promise<GraphNode[]>; archetypalLighting(operatorGraphNodeId: string): Promise<ArchetypalLighting>; resonancesForInstance(graphNodeId: string): Promise<LitInstance[]>; }`
  - `export interface TimelineLensProps { dataSource: TimelineDataSource; onOpenNode: (graphNodeId: string) => void; }`
  - `export function TimelineLens(props: TimelineLensProps): JSX.Element;`
  - Re-exports from `index.ts`: the whole `./timeline/*` public surface.

This is the integration seam: `TimelineDataSource` is the narrow port the lens needs. Task 12 adapts the real `WorkspaceTransport` to it; tests here use an in-memory fake.

Steps:

1. - [ ] Write failing test. Create `packages/canvas/src/timeline/TimelineLens.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TimelineLens, type TimelineDataSource } from "./TimelineLens";
import type { ArchetypalLighting, GraphNode, LitInstance } from "./contracts";

function event(id: string, title: string, validFrom: string): GraphNode {
  return {
    graphNodeId: id,
    entityType: "Event",
    title,
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    isTemporal: true,
    validFrom,
    validTo: null,
    temporalPrecision: "year",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function archetype(id: string, title: string): GraphNode {
  return { ...event(id, title, "1600-01-01"), entityType: "Archetype", isTemporal: false, validFrom: null };
}

function makeDataSource(over: Partial<TimelineDataSource> = {}): TimelineDataSource {
  return {
    loadTimelineNodes: async () => [
      event("banda", "Banda genocide", "1621-01-01"),
      event("balfour", "Balfour Declaration", "1917-01-01"),
    ],
    archetypalLighting: async (operatorGraphNodeId: string): Promise<ArchetypalLighting> => ({
      operator: archetype(operatorGraphNodeId, "Monopoly mechanism"),
      instances: [
        { node: event("banda", "Banda genocide", "1621-01-01"), relType: "INSTANTIATES", dominance: "dominant" },
      ],
    }),
    resonancesForInstance: async (): Promise<LitInstance[]> => [
      { node: archetype("monopoly", "Monopoly mechanism"), relType: "INSTANTIATES", dominance: "dominant" },
    ],
    ...over,
  };
}

describe("TimelineLens", () => {
  test("loads and renders temporal nodes on mount", async () => {
    render(<TimelineLens dataSource={makeDataSource()} onOpenNode={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("timeline-node-banda")).toBeInTheDocument();
    });
    expect(screen.getByTestId("timeline-node-balfour")).toBeInTheDocument();
  });

  test("double-clicking a node opens the same document via onOpenNode", async () => {
    const onOpenNode = vi.fn();
    render(<TimelineLens dataSource={makeDataSource()} onOpenNode={onOpenNode} />);
    const node = await screen.findByTestId("timeline-node-banda");
    fireEvent.doubleClick(node);
    expect(onOpenNode).toHaveBeenCalledWith("banda");
  });

  test("selecting an event fetches and shows its resonant archetypes", async () => {
    render(<TimelineLens dataSource={makeDataSource()} onOpenNode={() => {}} />);
    const node = await screen.findByTestId("timeline-node-banda");
    fireEvent.click(node);
    await waitFor(() => {
      expect(screen.getByTestId("resonance-row-monopoly")).toBeInTheDocument();
    });
  });

  test("lighting an operator dims unlit nodes and marks lit ones", async () => {
    render(<TimelineLens dataSource={makeDataSource()} onOpenNode={() => {}} />);
    const node = await screen.findByTestId("timeline-node-banda");
    fireEvent.click(node); // loads resonances
    const row = await screen.findByTestId("resonance-row-monopoly");
    fireEvent.click(row); // light the operator
    await waitFor(() => {
      expect(screen.getByTestId("timeline-node-banda").dataset.lit).toBe("dominant");
    });
    // balfour is not in the lighting result => dimmed
    expect(screen.getByTestId("timeline-node-balfour").dataset.dimmed).toBe("true");
  });

  test("clear-lighting control removes the lit state", async () => {
    render(<TimelineLens dataSource={makeDataSource()} onOpenNode={() => {}} />);
    const node = await screen.findByTestId("timeline-node-banda");
    fireEvent.click(node);
    const row = await screen.findByTestId("resonance-row-monopoly");
    fireEvent.click(row);
    await waitFor(() => {
      expect(screen.getByTestId("timeline-node-banda").dataset.lit).toBe("dominant");
    });
    fireEvent.click(screen.getByTestId("timeline-clear-lighting"));
    await waitFor(() => {
      expect(screen.getByTestId("timeline-node-banda").dataset.lit).toBeUndefined();
    });
  });

  test("wheel over the track zooms in (more, sharper ticks appear)", async () => {
    render(<TimelineLens dataSource={makeDataSource()} onOpenNode={() => {}} />);
    await screen.findByTestId("timeline-node-banda");
    const track = screen.getByTestId("timeline-track");
    const before = screen.getByTestId("timeline-tier").textContent;
    fireEvent.wheel(track, { deltaY: -600, clientX: 400 });
    await waitFor(() => {
      expect(screen.getByTestId("timeline-tier").textContent).not.toBe(before);
    });
  });
});
```

2. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/TimelineLens.test.tsx`. Expect FAIL: `Failed to resolve import "./TimelineLens"`.

3. - [ ] Create `packages/canvas/src/timeline/TimelineLens.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";

import type { ArchetypalLighting, GraphNode, LitInstance } from "./contracts";
import { createTimelineStore } from "./timelineStore";
import { placeItems } from "./projection";
import { generateTicks } from "./ticks";
import { TimelineAxis } from "./TimelineAxis";
import { TimelineNode } from "./TimelineNode";
import { ResonancePopover } from "./ResonancePopover";

export interface TimelineDataSource {
  loadTimelineNodes(): Promise<GraphNode[]>;
  archetypalLighting(operatorGraphNodeId: string): Promise<ArchetypalLighting>;
  resonancesForInstance(graphNodeId: string): Promise<LitInstance[]>;
}

export interface TimelineLensProps {
  dataSource: TimelineDataSource;
  onOpenNode: (graphNodeId: string) => void;
}

const AXIS_HEIGHT = 48;
const ZOOM_STEP = 1.2;

export function TimelineLens({ dataSource, onOpenNode }: TimelineLensProps): JSX.Element {
  const store = useMemo(() => createTimelineStore(), []);
  const state = useStore(store);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [resonances, setResonances] = useState<LitInstance[]>([]);

  // Load timeline nodes once on mount.
  useEffect(() => {
    let cancelled = false;
    void dataSource.loadTimelineNodes().then((nodes) => {
      if (!cancelled) store.getState().hydrate(nodes);
    });
    return () => {
      cancelled = true;
    };
  }, [dataSource, store]);

  // Track width measurement (ResizeObserver is mocked in tests; fall back to a
  // sensible default so layout math runs even before the observer fires).
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      store.getState().setWidth(w > 0 ? w : 1000);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [store]);

  const viewport = state.viewport();
  const tier = state.tier();
  const placed = placeItems(state.items, viewport);
  const ticks = generateTicks(viewport, tier);
  const lighting = state.litMap;
  const lightingActive = state.lightingOperatorId !== null;

  const handleSelect = (graphNodeId: string) => {
    store.getState().setSelected(graphNodeId);
    void dataSource.resonancesForInstance(graphNodeId).then(setResonances);
  };

  const handleLightOperator = (operatorGraphNodeId: string) => {
    void dataSource.archetypalLighting(operatorGraphNodeId).then((result) => {
      store.getState().setLighting(result);
    });
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = trackRef.current?.getBoundingClientRect();
    const anchorPx = rect ? event.clientX - rect.left : viewport.widthPx / 2;
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    store.getState().zoom(factor, anchorPx);
  };

  // Drag-to-pan.
  const dragState = useRef<{ lastX: number } | null>(null);
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = { lastX: event.clientX };
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const deltaPx = event.clientX - dragState.current.lastX;
    dragState.current.lastX = event.clientX;
    store.getState().pan(deltaPx);
  };
  const handlePointerUp = () => {
    dragState.current = null;
  };

  return (
    <div className="timeline-lens" data-testid="timeline-lens">
      <div className="timeline-toolbar" data-testid="timeline-toolbar">
        <span className="timeline-tier" data-testid="timeline-tier">{tier}</span>
        {lightingActive && (
          <button
            type="button"
            data-testid="timeline-clear-lighting"
            onClick={() => store.getState().clearLighting()}
          >
            Clear lighting
          </button>
        )}
      </div>
      <div
        className="timeline-track"
        data-testid="timeline-track"
        ref={trackRef}
        style={{ position: "relative", overflow: "hidden" }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <TimelineAxis ticks={ticks} height={AXIS_HEIGHT} />
        <div className="timeline-nodes" style={{ position: "relative" }}>
          {placed.map((p) => {
            const lit = lighting.get(p.item.graphNodeId) ?? null;
            const dimmed = lightingActive && lit === null;
            return (
              <TimelineNode
                key={p.item.graphNodeId}
                placed={p}
                lit={lit}
                selected={state.selectedNodeId === p.item.graphNodeId}
                dimmed={dimmed}
                onSelect={handleSelect}
                onOpen={onOpenNode}
              />
            );
          })}
        </div>
      </div>
      {state.selectedNodeId !== null && (
        <ResonancePopover
          resonances={resonances}
          onLightOperator={handleLightOperator}
        />
      )}
    </div>
  );
}
```

4. - [ ] Run `pnpm vitest run packages/canvas/src/timeline/TimelineLens.test.tsx`. Expect PASS (6 passed).

5. - [ ] Add the timeline public surface to the package barrel. In `packages/canvas/src/index.ts`, after the final line `export * from "./state/canvasStore";`, append:

```ts
export * from "./timeline/TimelineLens";
export * from "./timeline/TimelineNode";
export * from "./timeline/TimelineAxis";
export * from "./timeline/ResonancePopover";
export * from "./timeline/timelineStore";
export * from "./timeline/projection";
export * from "./timeline/lighting";
export * from "./timeline/scale";
export * from "./timeline/ticks";
export * from "./timeline/viewport";
export * from "./timeline/instant";
```

6. - [ ] Run `pnpm exec tsc -b`. Expect exit code 0 (no type errors from the new barrel exports).

7. - [ ] Commit:

```bash
git add packages/canvas/src/timeline/TimelineLens.tsx packages/canvas/src/timeline/TimelineLens.test.tsx packages/canvas/src/index.ts
git commit -m "feat(timeline): TimelineLens container wiring store, components, data port"
```

---

## Task 12 — Adapter: real `WorkspaceTransport` → `TimelineDataSource`

**Files:**
- Create `apps/desktop/src/features/timeline/createTimelineDataSource.ts`
- Create `apps/desktop/src/features/timeline/createTimelineDataSource.test.ts`

**Interfaces:**
- Consumes (WS0 §5.2, from `@research-canvas/desktop-api`): `WorkspaceTransport.loadCanvasView({ canvasId, lens: "timeline" }) -> CanvasView`, `WorkspaceTransport.archetypalLighting({ operatorGraphNodeId }) -> ArchetypalLighting`, `WorkspaceTransport.resonancesForInstance({ graphNodeId }) -> LitInstance[]`. Contract types `CanvasView`, `ArchetypalLighting`, `LitInstance`, `GraphNode` from `@research-canvas/desktop-api`. (Task 11): `TimelineDataSource`.
- Produces:
  - `export function createTimelineDataSource(input: { transport: Pick<WorkspaceTransport, "loadCanvasView" | "archetypalLighting" | "resonancesForInstance">; canvasId: string }): TimelineDataSource;`

> Precondition: WS2 has merged so `@research-canvas/desktop-api` exports `loadCanvasView`, `archetypalLighting`, `resonancesForInstance`, `CanvasView`, `ArchetypalLighting`, `LitInstance`, `GraphNode`. If not, hold this Task (see bootstrapping note). The fake-transport test below is a real exercise of the adapter regardless.
>
> **`databasePath` precondition (WS2 fix):** This adapter calls `loadCanvasView({ canvasId, lens })`, `archetypalLighting({ operatorGraphNodeId })`, and `resonancesForInstance({ graphNodeId })` with the **exact** WS0 §5.2 input shapes — it deliberately does **not** pass a `databasePath`. This depends on the WS2 fix that makes the Tauri commands' `database_path` argument **optional**, falling back to the workspace's active database via `SharedApiState` when omitted. Until that WS2 fix lands, these three commands require a `database_path` and the adapter's calls will fail at runtime. Do not work around this by threading a `databasePath` into the timeline calls (the timeline lens has no business owning the DB path); gate Task 12 on the WS2 `SharedApiState`-fallback change exactly as it gates on the WS2 transport exports above. (If WS2 instead keeps `database_path` required, the adapter must accept a `databasePath` through its `input` and forward it on all three calls — but the agreed contract is the optional/`SharedApiState`-fallback path.)

Steps:

1. - [ ] Write failing test. Create `apps/desktop/src/features/timeline/createTimelineDataSource.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import { createTimelineDataSource } from "./createTimelineDataSource";
import type {
  ArchetypalLighting,
  CanvasView,
  GraphNode,
  LitInstance,
} from "@research-canvas/desktop-api";

function gnode(id: string, isTemporal: boolean): GraphNode {
  return {
    graphNodeId: id,
    entityType: isTemporal ? "Event" : "Archetype",
    title: id,
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    isTemporal,
    validFrom: isTemporal ? "1621-01-01" : null,
    validTo: null,
    temporalPrecision: isTemporal ? "year" : null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("createTimelineDataSource", () => {
  test("loadTimelineNodes requests the timeline lens and unwraps node bodies", async () => {
    const view: CanvasView = {
      canvasId: "c1",
      nodes: [
        {
          node: gnode("banda", true),
          layout: {
            graphNodeId: "banda",
            canvasId: "c1",
            positionX: 0,
            positionY: 0,
            width: 100,
            height: 50,
            style: {},
          },
        },
      ],
      edges: [],
      relationships: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      appState: {},
    };
    const loadCanvasView = vi.fn(async () => view);
    const ds = createTimelineDataSource({
      transport: {
        loadCanvasView,
        archetypalLighting: vi.fn(),
        resonancesForInstance: vi.fn(),
      },
      canvasId: "c1",
    });
    const nodes = await ds.loadTimelineNodes();
    expect(loadCanvasView).toHaveBeenCalledWith({ canvasId: "c1", lens: "timeline" });
    expect(nodes.map((n) => n.graphNodeId)).toEqual(["banda"]);
  });

  test("archetypalLighting forwards the operator id", async () => {
    const lighting: ArchetypalLighting = {
      operator: gnode("op", false),
      instances: [
        { node: gnode("banda", true), relType: "INSTANTIATES", dominance: "dominant" },
      ],
    };
    const archetypalLighting = vi.fn(async () => lighting);
    const ds = createTimelineDataSource({
      transport: {
        loadCanvasView: vi.fn(),
        archetypalLighting,
        resonancesForInstance: vi.fn(),
      },
      canvasId: "c1",
    });
    const out = await ds.archetypalLighting("op");
    expect(archetypalLighting).toHaveBeenCalledWith({ operatorGraphNodeId: "op" });
    expect(out.instances).toHaveLength(1);
  });

  test("resonancesForInstance forwards the node id", async () => {
    const resonances: LitInstance[] = [
      { node: gnode("op", false), relType: "ECHOES", dominance: "secondary" },
    ];
    const resonancesForInstance = vi.fn(async () => resonances);
    const ds = createTimelineDataSource({
      transport: {
        loadCanvasView: vi.fn(),
        archetypalLighting: vi.fn(),
        resonancesForInstance,
      },
      canvasId: "c1",
    });
    const out = await ds.resonancesForInstance("banda");
    expect(resonancesForInstance).toHaveBeenCalledWith({ graphNodeId: "banda" });
    expect(out).toHaveLength(1);
  });
});
```

2. - [ ] Run `pnpm vitest run apps/desktop/src/features/timeline/createTimelineDataSource.test.ts`. Expect FAIL: `Failed to resolve import "./createTimelineDataSource"`.

3. - [ ] Create `apps/desktop/src/features/timeline/createTimelineDataSource.ts`:

```ts
import type { TimelineDataSource } from "@research-canvas/canvas";
import type {
  ArchetypalLighting,
  GraphNode,
  LitInstance,
  WorkspaceTransport,
} from "@research-canvas/desktop-api";

type TimelineTransport = Pick<
  WorkspaceTransport,
  "loadCanvasView" | "archetypalLighting" | "resonancesForInstance"
>;

/**
 * Adapt the WS0 §5.2 WorkspaceTransport to the narrow TimelineDataSource port
 * the TimelineLens needs. loadTimelineNodes asks for the server-filtered
 * "timeline" lens (only isTemporal === true nodes per WS0 §8.1) and returns the
 * GraphNode substance from each JoinedCanvasNode.
 */
export function createTimelineDataSource(input: {
  transport: TimelineTransport;
  canvasId: string;
}): TimelineDataSource {
  const { transport, canvasId } = input;
  return {
    async loadTimelineNodes(): Promise<GraphNode[]> {
      const view = await transport.loadCanvasView({ canvasId, lens: "timeline" });
      return view.nodes.map((joined) => joined.node);
    },
    async archetypalLighting(operatorGraphNodeId: string): Promise<ArchetypalLighting> {
      return transport.archetypalLighting({ operatorGraphNodeId });
    },
    async resonancesForInstance(graphNodeId: string): Promise<LitInstance[]> {
      return transport.resonancesForInstance({ graphNodeId });
    },
  };
}
```

4. - [ ] Run `pnpm vitest run apps/desktop/src/features/timeline/createTimelineDataSource.test.ts`. Expect PASS (3 passed).

5. - [ ] Commit:

```bash
git add apps/desktop/src/features/timeline/createTimelineDataSource.ts apps/desktop/src/features/timeline/createTimelineDataSource.test.ts
git commit -m "feat(timeline): adapt WorkspaceTransport to TimelineDataSource port"
```

---

## Task 13 — Lens switch in the Shell: toggle Canvas ↔ Timeline

**Files:**
- Create `apps/desktop/src/layout/useLensMode.ts`
- Create `apps/desktop/src/layout/useLensMode.test.ts`

**Interfaces:**
- Consumes: nothing (self-contained React hook).
- Produces:
  - `export type LensMode = "canvas" | "timeline";`
  - `export function useLensMode(initial?: LensMode): { lens: LensMode; setLens: (lens: LensMode) => void; toggleLens: () => void };`

This isolates the lens-mode state machine so it is unit-testable before touching `Shell.tsx`.

Steps:

1. - [ ] Write failing test. Create `apps/desktop/src/layout/useLensMode.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLensMode } from "./useLensMode";

describe("useLensMode", () => {
  test("defaults to canvas", () => {
    const { result } = renderHook(() => useLensMode());
    expect(result.current.lens).toBe("canvas");
  });

  test("honours an explicit initial lens", () => {
    const { result } = renderHook(() => useLensMode("timeline"));
    expect(result.current.lens).toBe("timeline");
  });

  test("setLens switches to a chosen lens", () => {
    const { result } = renderHook(() => useLensMode());
    act(() => result.current.setLens("timeline"));
    expect(result.current.lens).toBe("timeline");
  });

  test("toggleLens flips between the two lenses", () => {
    const { result } = renderHook(() => useLensMode());
    act(() => result.current.toggleLens());
    expect(result.current.lens).toBe("timeline");
    act(() => result.current.toggleLens());
    expect(result.current.lens).toBe("canvas");
  });
});
```

2. - [ ] Run `pnpm vitest run apps/desktop/src/layout/useLensMode.test.ts`. Expect FAIL: `Failed to resolve import "./useLensMode"`.

3. - [ ] Create `apps/desktop/src/layout/useLensMode.ts`:

```ts
import { useCallback, useState } from "react";

export type LensMode = "canvas" | "timeline";

export function useLensMode(initial: LensMode = "canvas"): {
  lens: LensMode;
  setLens: (lens: LensMode) => void;
  toggleLens: () => void;
} {
  const [lens, setLens] = useState<LensMode>(initial);
  const toggleLens = useCallback(() => {
    setLens((current) => (current === "canvas" ? "timeline" : "canvas"));
  }, []);
  return { lens, setLens, toggleLens };
}
```

4. - [ ] Run `pnpm vitest run apps/desktop/src/layout/useLensMode.test.ts`. Expect PASS (4 passed).

5. - [ ] Commit:

```bash
git add apps/desktop/src/layout/useLensMode.ts apps/desktop/src/layout/useLensMode.test.ts
git commit -m "feat(timeline): useLensMode hook for canvas/timeline switching"
```

---

## Task 14 — Mount the TimelineLens in the Shell behind the lens switch

**Files:**
- Modify `apps/desktop/src/layout/Shell.tsx` (imports block lines 1–11; component body — add lens state near line 21; render the lens switcher button in the `shell-canvas-area` and conditionally render `TimelineLens` instead of `CanvasPane` when `lens === "timeline"`, around lines 92–125)
- Create `apps/desktop/src/layout/Shell.timeline.test.tsx`

**Interfaces:**
- Consumes (Task 11): `TimelineLens`. (Task 12): `createTimelineDataSource`. (Task 13): `useLensMode`. Existing: `useCanvasWorkspace()` exposing `selectNode(nodeId)` and `canvasId` (from `CanvasWorkspaceContext`), `createWorkspaceTransport()` from `@research-canvas/desktop-api`.
- Produces: a Shell that renders the timeline lens; opening a timeline node routes through the **same** `workspace.selectNode` + full-screen-reader path the canvas uses.

> Precondition: Task 12 merged (real transport adapter available) **and** `useCanvasWorkspace()` exposes `canvasId`. If `canvasId` is not yet on the workspace context, read it from the workspace's active project the same way `CanvasScreen` does; the contract here is "a canvas id string is in hand." The test below stubs the workspace + transport, so it does not depend on the live backend.
>
> **`setFullScreenMode` is Shell-local, not on the workspace context.** The full-screen reader is driven by `Shell.tsx`'s own `useState` (`const [fullScreenMode, setFullScreenMode] = useState(...)`), **not** by `CanvasWorkspaceContext`. So the lens's "open node" callback **must be defined inside the `Shell` component body**, where both `workspace.selectNode` and Shell's local `setFullScreenMode` are in scope — it calls `workspace.selectNode(graphNodeId)` and then Shell's `setFullScreenMode("node")`. Do **not** assume `setFullScreenMode` (or any `openNodeDocument`) lives on `useCanvasWorkspace()`; only `selectNode` and `canvasId` come from the context. The canvas's existing `handleNodeDoubleClick` already follows this exact `selectNode` + `setFullScreenMode("node")` shape inside Shell — the timeline `onOpenNode` callback mirrors it so canvas and timeline open the identical document the same way.

Steps:

1. - [ ] Write failing test. Create `apps/desktop/src/layout/Shell.timeline.test.tsx`:

```tsx
import { describe, expect, test, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Stub the workspace context so the Shell mounts without a live backend.
const selectNode = vi.fn();
vi.mock("../features/canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => ({
    selectNode,
    canvasId: "c1",
    activeProjectId: "p1",
  }),
}));

// Stub the transport so loadCanvasView returns one temporal node.
vi.mock("@research-canvas/desktop-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@research-canvas/desktop-api")>();
  return {
    ...actual,
    createWorkspaceTransport: () => ({
      loadCanvasView: async () => ({
        canvasId: "c1",
        nodes: [
          {
            node: {
              graphNodeId: "banda",
              entityType: "Event",
              title: "Banda genocide",
              body: "[]",
              summary: "",
              archetypalResonance: null,
              coordinate: null,
              sourceCoordinates: [],
              isTemporal: true,
              validFrom: "1621-01-01",
              validTo: null,
              temporalPrecision: "year",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            },
            layout: {
              graphNodeId: "banda",
              canvasId: "c1",
              positionX: 0,
              positionY: 0,
              width: 100,
              height: 50,
              style: {},
            },
          },
        ],
        edges: [],
        relationships: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        appState: {},
      }),
      archetypalLighting: async () => ({ operator: {}, instances: [] }),
      resonancesForInstance: async () => [],
    }),
  };
});

import { Shell } from "./Shell";

describe("Shell timeline lens", () => {
  beforeEach(() => {
    selectNode.mockClear();
  });

  test("switching to the timeline lens renders the timeline and its nodes", async () => {
    render(<Shell />);
    fireEvent.click(screen.getByTestId("lens-switch-timeline"));
    await waitFor(() => {
      expect(screen.getByTestId("timeline-lens")).toBeInTheDocument();
      expect(screen.getByTestId("timeline-node-banda")).toBeInTheDocument();
    });
  });

  test("opening a timeline node routes through workspace.selectNode (same document)", async () => {
    render(<Shell />);
    fireEvent.click(screen.getByTestId("lens-switch-timeline"));
    const node = await screen.findByTestId("timeline-node-banda");
    fireEvent.doubleClick(node);
    expect(selectNode).toHaveBeenCalledWith("banda");
  });
});
```

2. - [ ] Run `pnpm vitest run apps/desktop/src/layout/Shell.timeline.test.tsx`. Expect FAIL: `Unable to find an element by: [data-testid="lens-switch-timeline"]` (the Shell has no lens switch yet).

3. - [ ] Modify the imports in `apps/desktop/src/layout/Shell.tsx`. The current import block is:

```tsx
import { useCallback, useEffect, useState } from "react";
import { CanvasPane } from "./CanvasPane";
import { FullScreenReader } from "./FullScreenReader";
import { IconStrip } from "./IconStrip";
import { LeftOverlay } from "./LeftOverlay";
import { RightPanelSlot } from "./RightPanelSlot";
import { StatusBar } from "./StatusBar";
import { useShellLayout } from "./useShellLayout";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { SequencesManager } from "../features/sequences/SequencesManager";
import { SettingsOverlay } from "../features/settings/SettingsOverlay";
```

Replace it with (adds the timeline imports and `useMemo`):

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { CanvasPane } from "./CanvasPane";
import { FullScreenReader } from "./FullScreenReader";
import { IconStrip } from "./IconStrip";
import { LeftOverlay } from "./LeftOverlay";
import { RightPanelSlot } from "./RightPanelSlot";
import { StatusBar } from "./StatusBar";
import { useShellLayout } from "./useShellLayout";
import { useLensMode } from "./useLensMode";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { SequencesManager } from "../features/sequences/SequencesManager";
import { SettingsOverlay } from "../features/settings/SettingsOverlay";
import { TimelineLens } from "@research-canvas/canvas";
import { createWorkspaceTransport } from "@research-canvas/desktop-api";
import { createTimelineDataSource } from "../features/timeline/createTimelineDataSource";
```

4. - [ ] In `apps/desktop/src/layout/Shell.tsx`, add lens state and the timeline data source. After the existing line `const [strokeColour, setStrokeColour] = useState("#f97316");` (line 22), insert the block below. `setFullScreenMode` here is the **Shell's own existing local state setter** (declared earlier in the component as `const [fullScreenMode, setFullScreenMode] = useState(...)`) — it is **not** imported and **not** read off `workspace`/`useCanvasWorkspace()`. The `openNodeDocument` callback closes over both `workspace` and `setFullScreenMode`, so **both** appear in the dependency array:

```tsx
  const { lens, setLens } = useLensMode();
  const timelineDataSource = useMemo(
    () =>
      createTimelineDataSource({
        transport: createWorkspaceTransport(),
        canvasId: workspace.canvasId,
      }),
    [workspace.canvasId],
  );
  // Open a timeline node through the SAME path the canvas uses: select the node
  // on the workspace, then flip the Shell's local full-screen reader to "node".
  // setFullScreenMode is Shell-local state (not on the workspace context), so
  // this callback lives in the Shell body where setFullScreenMode is in scope.
  const openNodeDocument = useCallback(
    (graphNodeId: string) => {
      workspace.selectNode(graphNodeId);
      setFullScreenMode("node");
    },
    [workspace, setFullScreenMode],
  );
```

5. - [ ] In `apps/desktop/src/layout/Shell.tsx`, replace the `CanvasPane` render block. The current block (lines 103–111) is:

```tsx
        <CanvasPane
          onNodeSelect={handleNodeSelect}
          onNodeDoubleClick={handleNodeDoubleClick}
          onPlaySequence={useCallback(() => setFullScreenMode("sequence"), [])}
          leftPanelOpen={layout.leftOpen}
          rightPanelOpen={layout.rightOpen}
          drawingMode={drawingMode}
          strokeColour={strokeColour}
        />
```

Replace it with a lens switcher plus a conditional render:

```tsx
        <div className="lens-switch" data-testid="lens-switch">
          <button
            type="button"
            data-testid="lens-switch-canvas"
            data-active={lens === "canvas" ? "true" : undefined}
            onClick={() => setLens("canvas")}
          >
            Canvas
          </button>
          <button
            type="button"
            data-testid="lens-switch-timeline"
            data-active={lens === "timeline" ? "true" : undefined}
            onClick={() => setLens("timeline")}
          >
            Timeline
          </button>
        </div>

        {lens === "canvas" ? (
          <CanvasPane
            onNodeSelect={handleNodeSelect}
            onNodeDoubleClick={handleNodeDoubleClick}
            onPlaySequence={useCallback(() => setFullScreenMode("sequence"), [])}
            leftPanelOpen={layout.leftOpen}
            rightPanelOpen={layout.rightOpen}
            drawingMode={drawingMode}
            strokeColour={strokeColour}
          />
        ) : (
          <section
            className="canvas-pane"
            data-testid="timeline-pane"
            style={{ position: "absolute", inset: 0, left: 26 }}
          >
            <TimelineLens
              dataSource={timelineDataSource}
              onOpenNode={openNodeDocument}
            />
          </section>
        )}
```

6. - [ ] Run `pnpm vitest run apps/desktop/src/layout/Shell.timeline.test.tsx`. Expect PASS (2 passed).

7. - [ ] Run `pnpm exec tsc -b`. Expect exit code 0.

8. - [ ] Commit:

```bash
git add apps/desktop/src/layout/Shell.tsx apps/desktop/src/layout/Shell.timeline.test.tsx
git commit -m "feat(timeline): mount TimelineLens in the Shell behind a lens switch"
```

---

## Task 15 — Timeline styles + barrel/typecheck verification

**Files:**
- Create `apps/desktop/src/layout/timeline.css`
- Modify `apps/desktop/src/main.tsx` (add the css import next to the other global css imports at the top of the file)

**Interfaces:**
- Consumes: the `className`/`data-*` hooks emitted by Tasks 9–11 and 14 (`timeline-lens`, `timeline-track`, `timeline-axis`, `timeline-axis-tick`, `timeline-node`, `timeline-node-dot`, `timeline-node-title`, `timeline-node-span`, `resonance-popover`, `resonance-row`, `lens-switch`, `[data-lit]`, `[data-dimmed]`, `[data-selected]`, `[data-dominant]`).
- Produces: nothing importable; purely visual. The acceptance gate is "styles load and the full suite + typecheck stay green."

Steps:

1. - [ ] Create `apps/desktop/src/layout/timeline.css`:

```css
.lens-switch {
  position: absolute;
  top: 8px;
  right: 12px;
  z-index: 5;
  display: flex;
  gap: 4px;
}

.lens-switch button {
  padding: 4px 10px;
  font-size: 12px;
  border: 1px solid #2a2a32;
  background: #15151b;
  color: #b9b9c6;
  border-radius: 6px;
  cursor: pointer;
}

.lens-switch button[data-active="true"] {
  background: #f0b45a;
  color: #15151b;
  border-color: #f0b45a;
}

.timeline-lens {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #0d0d11;
  color: #e6e6ee;
}

.timeline-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid #1d1d24;
  font-size: 12px;
  text-transform: capitalize;
  color: #9a9aa8;
}

.timeline-track {
  position: relative;
  flex: 1;
  cursor: grab;
  touch-action: none;
}

.timeline-track:active {
  cursor: grabbing;
}

.timeline-axis {
  border-bottom: 1px solid #1d1d24;
}

.timeline-axis-tick {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.timeline-axis-tick-line {
  width: 1px;
  height: 12px;
  background: #2a2a32;
}

.timeline-axis-tick-label {
  font-size: 10px;
  color: #6f6f7d;
  white-space: nowrap;
  transform: translateX(4px);
}

.timeline-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  transition: opacity 120ms ease;
  cursor: pointer;
  white-space: nowrap;
}

.timeline-node-span {
  position: absolute;
  top: 50%;
  left: 0;
  height: 2px;
  background: #3a3a46;
}

.timeline-node-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6f6f7d;
}

.timeline-node-title {
  font-size: 12px;
  color: #c9c9d4;
}

.timeline-node[data-selected="true"] .timeline-node-title {
  color: #f0b45a;
  font-weight: 600;
}

.timeline-node[data-lit="dominant"] .timeline-node-dot {
  background: #f0b45a;
  box-shadow: 0 0 8px 2px rgba(240, 180, 90, 0.7);
}

.timeline-node[data-lit="secondary"] .timeline-node-dot {
  background: #b98a3e;
  box-shadow: 0 0 5px 1px rgba(185, 138, 62, 0.5);
}

.resonance-popover {
  position: absolute;
  bottom: 12px;
  left: 12px;
  width: 260px;
  padding: 10px 12px;
  background: #15151b;
  border: 1px solid #2a2a32;
  border-radius: 8px;
  font-size: 12px;
}

.resonance-popover-title {
  font-weight: 600;
  margin-bottom: 6px;
  color: #9a9aa8;
}

.resonance-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.resonance-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
}

.resonance-row:hover {
  background: #1d1d24;
}

.resonance-row[data-dominant="true"] .resonance-row-title {
  color: #f0b45a;
  font-weight: 600;
}

.resonance-row-badge {
  font-size: 10px;
  color: #6f6f7d;
  text-transform: uppercase;
}
```

2. - [ ] Add the stylesheet import to `apps/desktop/src/main.tsx`. Open the file, locate the block of global `import "./.../*.css";` lines at the top, and add alongside them:

```tsx
import "./layout/timeline.css";
```

3. - [ ] Run the full frontend suite to confirm nothing regressed: `pnpm vitest run`. Expect all test files passing, including every `packages/canvas/src/timeline/*.test.ts(x)`, `apps/desktop/src/features/timeline/createTimelineDataSource.test.ts`, `apps/desktop/src/layout/useLensMode.test.ts`, and `apps/desktop/src/layout/Shell.timeline.test.tsx`.

4. - [ ] Run `pnpm exec tsc -b`. Expect exit code 0.

5. - [ ] Commit:

```bash
git add apps/desktop/src/layout/timeline.css apps/desktop/src/main.tsx
git commit -m "feat(timeline): timeline + lens-switch styles, wired into app entry"
```

---

## Done When

- [ ] `pnpm vitest run` passes for every new file: `packages/canvas/src/timeline/{contracts,instant,scale,viewport,projection,ticks,lighting,timelineStore,TimelineNode,TimelineAxis,ResonancePopover,TimelineLens}.test.*`, `apps/desktop/src/features/timeline/createTimelineDataSource.test.ts`, `apps/desktop/src/layout/useLensMode.test.ts`, `apps/desktop/src/layout/Shell.timeline.test.tsx`.
- [ ] `pnpm exec tsc -b` exits 0 with the new barrel exports and Shell wiring.
- [ ] **Multi-scale semantic zoom (spec §5.5):** `tierForPixelsPerYear` returns `millennium → century → era → event → moment` across the zoom band, and `generateTicks` emits the matching tick granularity (1000/100/10/1 years). Verified by `scale.test.ts` and `ticks.test.ts`.
- [ ] **Smooth pan/zoom:** `panByPixels` shifts `centerYear`, `zoomAt` pins the year under the cursor while clamping to `[MIN_PIXELS_PER_YEAR, MAX_PIXELS_PER_YEAR]`; the `TimelineLens` wheel/drag handlers drive these. Verified by `viewport.test.ts` and the wheel test in `TimelineLens.test.tsx`.
- [ ] **Only temporally-located nodes project (WS0 §8.1):** `projectNodes` drops every `isTemporal === false` node and every node without a parseable `validFrom`; trans-temporal nodes are never on the axis. Verified by `projection.test.ts` and the `hydrate` test in `timelineStore.test.ts`.
- [ ] **Archetypal lighting (spec §5.5, WS0 §8.2):** selecting a trans-temporal operator (via a resonance row) calls `archetypalLighting`, lights every `INSTANTIATES`/`ECHOES` instance with dominant/secondary intensity, and dims the rest; "Clear lighting" restores. Verified by `lighting.test.ts` and the lighting/clear tests in `TimelineLens.test.tsx`.
- [ ] **Event → resonant archetypes with dominant/secondary frequency:** clicking an event calls `resonancesForInstance` and renders the `ResonancePopover` with the strongest resonance flagged. Verified by `ResonancePopover.test.tsx` and the select test in `TimelineLens.test.tsx`.
- [ ] **Same document as the canvas:** opening a timeline node routes through `workspace.selectNode(graphNodeId)` + the existing `FullScreenReader` path. Verified by the open test in `Shell.timeline.test.tsx`.
- [ ] **Data only via the contract seam:** the lens reaches the backend exclusively through `WorkspaceTransport.loadCanvasView({ lens: "timeline" })`, `archetypalLighting`, and `resonancesForInstance` (WS0 §5.2), adapted by `createTimelineDataSource`. Verified by `createTimelineDataSource.test.ts`.
- [ ] **v1 scope respected:** no lanes, clustering, or animation are implemented (explicitly out of v1 per spec §5.5); the shipped surface is navigable pan/zoom + lighting + click-to-open.

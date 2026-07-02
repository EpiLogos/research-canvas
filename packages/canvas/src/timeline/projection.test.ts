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

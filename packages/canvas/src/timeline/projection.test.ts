import { describe, expect, test } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import { computeCardViewportFade, placeItems, projectNodes } from "./projection";
import type { GraphNode, TimelineNodeRecord } from "./contracts";
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
    ...EMPTY_GRAPH_NODE_METADATA,
    isTemporal: over.isTemporal ?? true,
    validFrom: over.validFrom ?? null,
    validTo: over.validTo ?? null,
    temporalPrecision: over.temporalPrecision ?? null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function record(over: Partial<GraphNode> & { width?: number; height?: number }): TimelineNodeRecord {
  const graphNode = node(over);
  return {
    node: graphNode,
    layout: {
      graphNodeId: graphNode.graphNodeId,
      canvasId: "c1",
      positionX: 0,
      positionY: 0,
      width: over.width ?? 240,
      height: over.height ?? 72,
      style: {},
    },
  };
}

describe("projectNodes", () => {
  test("drops trans-temporal nodes (isTemporal === false)", () => {
    const out = projectNodes([
      record({ graphNodeId: "arch", isTemporal: false, validFrom: "1600-01-01" }),
    ]);
    expect(out).toEqual([]);
  });

  test("drops temporal nodes with no parseable validFrom", () => {
    const out = projectNodes([
      record({ graphNodeId: "x", isTemporal: true, validFrom: null }),
      record({ graphNodeId: "y", isTemporal: true, validFrom: "garbage" }),
    ]);
    expect(out).toEqual([]);
  });

  test("projects an event with start and end, sorted ascending", () => {
    const out = projectNodes([
      record({ graphNodeId: "b", validFrom: "1917-01-01", temporalPrecision: "year" }),
      record({
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
    const out = projectNodes([record({ validFrom: "1953-01-01", temporalPrecision: null })]);
    expect(out[0].precision).toBe("year");
  });
});

describe("placeItems", () => {
  const viewport: TimelineViewport = { centerYear: 1700, pixelsPerYear: 1, widthPx: 1000 };

  test("places start/end at projected pixels; ongoing has endPx === startPx", () => {
    const items = projectNodes([
      record({
        graphNodeId: "a",
        validFrom: "1700-01-01",
        validTo: "1710-01-01",
        temporalPrecision: "year",
      }),
      record({ graphNodeId: "b", validFrom: "1700-01-01", temporalPrecision: "year" }),
    ]);
    const placed = placeItems(items, viewport);
    const a = placed.find((p) => p.item.graphNodeId === "a")!;
    const b = placed.find((p) => p.item.graphNodeId === "b")!;
    expect(a.startPx).toBeCloseTo(500, 3);
    expect(a.endPx).toBeCloseTo(510, 3);
    expect(b.startPx).toBeCloseTo(500, 3);
    expect(b.endPx).toBeCloseTo(500, 3); // ongoing
  });

  test("assigns nearby events to alternating above/below lanes", () => {
    const items = projectNodes([
      record({ graphNodeId: "a", validFrom: "1953-01-01" }),
      record({ graphNodeId: "b", validFrom: "1954-01-01" }),
      record({ graphNodeId: "c", validFrom: "1955-01-01" }),
    ]);
    const placed = placeItems(items, { centerYear: 1954, pixelsPerYear: 10, widthPx: 1000 });

    expect(placed.map((p) => `${p.laneSide}:${p.laneIndex}`)).toEqual([
      "above:0",
      "below:0",
      "above:1",
    ]);
  });
});

describe("computeCardViewportFade", () => {
  test("uses rendered card position to fade cards near the left or right viewport edge", () => {
    expect(
      computeCardViewportFade({
        startPx: 500,
        positionX: 0,
        width: 240,
        viewportWidth: 1000,
      }),
    ).toEqual({ left: 0, right: 0, edge: "none" });

    const left = computeCardViewportFade({
      startPx: 32,
      positionX: 0,
      width: 240,
      viewportWidth: 1000,
    });
    expect(left.edge).toBe("left");
    expect(left.left).toBeGreaterThan(0);
    expect(left.right).toBe(0);

    const right = computeCardViewportFade({
      startPx: 968,
      positionX: 0,
      width: 240,
      viewportWidth: 1000,
    });
    expect(right.edge).toBe("right");
    expect(right.right).toBeGreaterThan(0);
    expect(right.left).toBe(0);
  });
});

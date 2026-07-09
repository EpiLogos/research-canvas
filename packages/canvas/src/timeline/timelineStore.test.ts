import { describe, expect, it, test } from "vitest";
import { createTimelineStore } from "./timelineStore";
import type { ArchetypalLighting, GraphNode, TimelineNodeRecord } from "./contracts";
import { pixelToYear } from "./viewport";

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

function record(over: Partial<GraphNode>): TimelineNodeRecord {
  const graphNode = node(over);
  return {
    node: graphNode,
    layout: {
      graphNodeId: graphNode.graphNodeId,
      canvasId: "c1",
      positionX: 0,
      positionY: 0,
      width: 240,
      height: 72,
      style: {},
    },
  };
}

describe("timelineStore", () => {
  test("hydrate keeps only temporal nodes, sorted ascending", () => {
    const store = createTimelineStore();
    store.getState().hydrate([
      record({ graphNodeId: "late", validFrom: "1900-01-01" }),
      record({ graphNodeId: "early", validFrom: "1600-01-01" }),
      record({ graphNodeId: "trans", isTemporal: false, validFrom: "1700-01-01" }),
    ]);
    expect(store.getState().items.map((i) => i.graphNodeId)).toEqual(["early", "late"]);
  });

  test("hydrate frames the visible years around the loaded historical nodes", () => {
    const store = createTimelineStore();
    store.getState().setWidth(1800);
    store.getState().hydrate([
      record({ graphNodeId: "medici", validFrom: "1460-01-01", validTo: "1600-12-31" }),
      record({ graphNodeId: "nygard", validFrom: "2020-01-01", validTo: "2025-12-31" }),
    ]);

    const viewport = store.getState().viewport();
    expect(pixelToYear(viewport, 0)).toBeGreaterThan(1300);
    expect(pixelToYear(viewport, viewport.widthPx)).toBeLessThan(2200);
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

  test("updateCardSize persists timeline-only card geometry without moving canvas layout", () => {
    const store = createTimelineStore();
    store.getState().hydrate([record({ graphNodeId: "a", validFrom: "1600-01-01" })]);

    store.getState().updateCardSize("a", {
      positionX: -14,
      positionY: 42,
      width: 310,
      height: 118,
    });

    expect(store.getState().items[0].layout).toMatchObject({
      positionX: 0,
      positionY: 0,
      width: 310,
      height: 118,
      style: {
        __timelineCard: {
          offsetY: 42,
          width: 310,
          height: 118,
        },
      },
    });
  });
});

describe("timeline transport state", () => {
  it("defaults cursorYear to null and playing to false", () => {
    const store = createTimelineStore();
    expect(store.getState().cursorYear).toBeNull();
    expect(store.getState().playing).toBe(false);
  });

  it("sets the cursor year", () => {
    const store = createTimelineStore();
    store.getState().setCursorYear(1789);
    expect(store.getState().cursorYear).toBe(1789);
    store.getState().setCursorYear(null);
    expect(store.getState().cursorYear).toBeNull();
  });

  it("toggles playing", () => {
    const store = createTimelineStore();
    store.getState().setPlaying(true);
    expect(store.getState().playing).toBe(true);
    store.getState().setPlaying(false);
    expect(store.getState().playing).toBe(false);
  });
});

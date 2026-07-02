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

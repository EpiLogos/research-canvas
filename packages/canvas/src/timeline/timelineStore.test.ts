import { describe, expect, it, test } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import { createTimelineStore } from "./timelineStore";
import type { ArchetypalLighting, GraphNode, TimelineViewNode } from "./contracts";
import { pixelToYear } from "./viewport";

test("persisted timeline override updates presentation without changing date-derived time", () => {
  const store = createTimelineStore();
  store.getState().hydrate(view([record({ graphNodeId: "persisted", validFrom: "1900" })]));
  const before = store.getState().items[0].startYear;
  store.getState().applyPersistedLayout("persisted", {
    lane: "events", offsetY: 31, width: 318, height: 110,
    style: { dotColour: "#123456" }, layoutRevision: 4,
  });
  const item = store.getState().items[0];
  expect(item.startYear).toBe(before);
  expect(item.presentation).toMatchObject({ lane: "events", offsetY: 31, width: 318, height: 110, layoutRevision: 4 });
});

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
    validFrom: over.validFrom ?? "1600-01-01",
    validTo: over.validTo ?? null,
    temporalPrecision: over.temporalPrecision ?? "year",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function record(over: Partial<GraphNode>): TimelineViewNode {
  const graphNode = node(over);
  return {
    node: graphNode,
    anchor: {
      validFrom: graphNode.validFrom ?? "invalid",
      validTo: graphNode.validTo,
      precision: graphNode.temporalPrecision ?? "year",
    },
    layoutOverride: {
      lane: "events",
      offsetY: 0,
      width: 240,
      height: 72,
      style: {},
      layoutRevision: 1,
    },
  };
}

function view(nodes: TimelineViewNode[]) {
  return { workspaceId: "sqlite:/test", nodes, relationships: [], lanes: [{ id: "events" }], diagnostics: [] };
}

describe("timelineStore", () => {
  test("hydrate keeps only temporal nodes, sorted ascending", () => {
    const store = createTimelineStore();
    store.getState().hydrate(view([
      record({ graphNodeId: "late", validFrom: "1900-01-01" }),
      record({ graphNodeId: "early", validFrom: "1600-01-01" }),
      record({ graphNodeId: "trans", isTemporal: false, validFrom: "1700-01-01" }),
    ]));
    expect(store.getState().items.map((i) => i.graphNodeId)).toEqual(["early", "late"]);
  });

  test("hydrate frames the visible years around the loaded historical nodes", () => {
    const store = createTimelineStore();
    store.getState().setWidth(1800);
    store.getState().hydrate(view([
      record({ graphNodeId: "medici", validFrom: "1460-01-01", validTo: "1600-12-31" }),
      record({ graphNodeId: "nygard", validFrom: "2020-01-01", validTo: "2025-12-31" }),
    ]));

    const viewport = store.getState().viewport();
    expect(pixelToYear(viewport, 0)).toBeGreaterThan(1300);
    expect(pixelToYear(viewport, viewport.widthPx)).toBeLessThan(2200);
  });

  test("setWidth updates the derived viewport width", () => {
    const store = createTimelineStore();
    store.getState().setWidth(1234);
    expect(store.getState().viewport().widthPx).toBe(1234);
  });

  test("hydrating a reopened timeline preserves its remembered camera instead of refitting the full history", () => {
    const store = createTimelineStore({ initialCenterYear: 1917, initialPixelsPerYear: 24 });
    store.getState().hydrate(view([
      record({ graphNodeId: "early", validFrom: "1500-01-01" }),
      record({ graphNodeId: "late", validFrom: "2000-01-01" }),
    ]));

    const viewport = store.getState().viewport();
    expect(viewport.centerYear).toBe(1917);
    expect(viewport.pixelsPerYear).toBe(24);
  });

  test("hydrates a usable timeline when a remembered camera belongs to an unrelated historical domain", () => {
    const store = createTimelineStore({ initialCenterYear: -150, initialPixelsPerYear: 4 });
    store.getState().setWidth(1200);
    store.getState().hydrate(view([
      record({ graphNodeId: "medici", validFrom: "1460-01-01", validTo: "1600-12-31" }),
      record({ graphNodeId: "nygard", validFrom: "2020-01-01", validTo: "2025-12-31" }),
    ]));

    const viewport = store.getState().viewport();
    expect(viewport.centerYear).toBeGreaterThan(1400);
    expect(viewport.centerYear).toBeLessThan(2100);
    expect(viewport.pixelsPerYear).toBeLessThan(2);
  });

  test("tier() derives from current pixelsPerYear", () => {
    const store = createTimelineStore({ initialPixelsPerYear: 0.05 });
    expect(store.getState().tier()).toBe("millennium");
    store.getState().setView(1700, 200);
    expect(store.getState().tier()).toBe("event");
  });

  test("setFrameForNode opens a window-bounded sub-timeline with hovering trans-temporal nodes", () => {
    const store = createTimelineStore();
    store.getState().hydrate({
      workspaceId: "sqlite:/test",
      nodes: [
        record({ graphNodeId: "florence", entityType: "Place", title: "Florence", validFrom: "1400-01-01", validTo: "1500-12-31" }),
        record({ graphNodeId: "council", title: "Council of Florence", validFrom: "1438-04-09", validTo: "1445-08-07" }),
        record({ graphNodeId: "balfour", title: "Balfour Declaration", validFrom: "1917-01-01" }),
        record({ graphNodeId: "monopoly", entityType: "Archetype", title: "Monopoly mechanism", isTemporal: false, validFrom: null }),
      ],
      relationships: [
        { id: "r1", relType: "LOCATED_AT", sourceGraphNodeId: "council", targetGraphNodeId: "florence", properties: {} },
        { id: "r2", relType: "INSTANTIATES", sourceGraphNodeId: "council", targetGraphNodeId: "monopoly", properties: {} },
      ],
      lanes: [{ id: "events" }],
      diagnostics: [],
    });

    store.getState().setFrameForNode("council");
    expect(store.getState().frame?.title).toBe("Council of Florence");
    expect(store.getState().items.map((item) => item.graphNodeId)).toEqual([
      "florence",
      "council",
    ]);
    expect(store.getState().hovering.map((hover) => hover.graphNodeId)).toEqual([
      "monopoly",
    ]);

    store.getState().setFrameForNode(null);
    expect(store.getState().frame).toBeNull();
    expect(store.getState().items.map((item) => item.graphNodeId).sort()).toEqual([
      "balfour",
      "council",
      "florence",
    ]);
    expect(store.getState().hovering).toEqual([]);
  });

  test("hydrate preserves an active frame and refreshes its window", () => {
    const store = createTimelineStore();
    store.getState().hydrate({
      workspaceId: "sqlite:/test",
      nodes: [record({ graphNodeId: "florence", entityType: "Place", title: "Florence", validFrom: "1400-01-01", validTo: "1500-12-31" })],
      relationships: [],
      lanes: [{ id: "events" }],
      diagnostics: [],
    });
    store.getState().setFrameForNode("florence");

    store.getState().hydrate({
      workspaceId: "sqlite:/test",
      nodes: [
        record({ graphNodeId: "florence", entityType: "Place", title: "Florence", validFrom: "1400-01-01", validTo: "1500-12-31" }),
        record({ graphNodeId: "council", title: "Council of Florence", validFrom: "1438-04-09", validTo: "1445-08-07" }),
      ],
      relationships: [
        { id: "r1", relType: "LOCATED_AT", sourceGraphNodeId: "council", targetGraphNodeId: "florence", properties: {} },
      ],
      lanes: [{ id: "events" }],
      diagnostics: [],
    });

    expect(store.getState().frame?.frameNodeId).toBe("florence");
    expect(store.getState().items.map((item) => item.graphNodeId)).toEqual([
      "florence",
      "council",
    ]);
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

  test("updateCardSize changes only native timeline presentation", () => {
    const store = createTimelineStore();
    store.getState().hydrate(view([record({ graphNodeId: "a", validFrom: "1600-01-01" })]));

    store.getState().updateCardSize("a", {
      positionX: -14,
      positionY: 42,
      width: 310,
      height: 118,
    });

    expect(store.getState().items[0].presentation).toMatchObject({
      lane: "events",
      offsetY: 42,
      width: 310,
      height: 118,
      style: {},
    });
  });
});

describe("timeline vertical navigation", () => {
  it("starts centred and clamps vertical panning without changing the time camera", () => {
    const store = createTimelineStore();
    const centerYear = store.getState().centerYear;

    expect(store.getState().verticalOffset).toBe(0);
    store.getState().panVertical(480, { min: -220, max: 220 });
    expect(store.getState().verticalOffset).toBe(220);
    store.getState().panVertical(-1000, { min: -220, max: 220 });
    expect(store.getState().verticalOffset).toBe(-220);
    expect(store.getState().centerYear).toBe(centerYear);
  });
});

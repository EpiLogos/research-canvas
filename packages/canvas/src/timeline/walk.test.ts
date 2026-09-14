import { describe, expect, test } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import type { GraphNode, TimelineViewNode } from "./contracts";
import {
  assembleTimelineWalk,
  timelineWalkNodeIds,
  timelineWalkStopYear,
} from "./walk";

/**
 * Global/temporal walk (ticket #28, D13 §4.5): the timeline composes into a
 * traversable sequence of located, dated events — the spine connecting
 * timeline → places → stories. Sub-timelines map in place (nested inside the
 * walk), never as a separate lens; Earth is the spatial zero-case.
 */

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

const fixture = () => ({
  nodes: [
    record({ graphNodeId: "florence", entityType: "Place", title: "Florence", validFrom: "1400-01-01", validTo: "1500-12-31" }),
    record({ graphNodeId: "council", title: "Council of Florence", validFrom: "1438-04-09", validTo: "1445-08-07" }),
    record({ graphNodeId: "crimes", title: "Crimes against peace", validFrom: "1870-01-01" }),
    record({ graphNodeId: "imperial", entityType: "Place", title: "Imperial Germany", validFrom: "1871-01-01", validTo: "1918-12-31" }),
    record({ graphNodeId: "balfour", title: "Balfour Declaration", validFrom: "1917-01-01" }),
    record({ graphNodeId: "monopoly", entityType: "Archetype", title: "Monopoly mechanism", isTemporal: false, validFrom: null }),
  ],
  relationships: [
    { id: "r1", relType: "LOCATED_AT", sourceGraphNodeId: "council", targetGraphNodeId: "florence", properties: {} },
    { id: "r2", relType: "INSTANTIATES", sourceGraphNodeId: "council", targetGraphNodeId: "monopoly", properties: {} },
    { id: "r3", relType: "LOCATED_AT", sourceGraphNodeId: "crimes", targetGraphNodeId: "imperial", properties: {} },
  ],
});

describe("assembleTimelineWalk", () => {
  test("traverses dated nodes in ascending temporal order, including unlocated (Earth zero-case)", () => {
    const { nodes, relationships } = fixture();
    const walk = assembleTimelineWalk(nodes, relationships);

    expect(walk.stops.map((stop) => stop.graphNodeId)).toEqual([
      "florence",
      "council",
      "crimes",
      "imperial",
      "balfour",
    ]);
    expect(walk.stops.map((stop) => stop.validFrom)).toEqual([
      "1400-01-01",
      "1438-04-09",
      "1870-01-01",
      "1871-01-01",
      "1917-01-01",
    ]);
  });

  test("resolves LOCATED_AT places onto stops; unlocated stops still appear", () => {
    const { nodes, relationships } = fixture();
    const walk = assembleTimelineWalk(nodes, relationships);

    // council + crimes are located through LOCATED_AT; florence + imperial are
    // themselves Place nodes (self-located); balfour is the unlocated zero-case.
    expect(walk.locatedCount).toBe(4);
    const council = walk.stops[1];
    expect(council.located).toBe(true);
    expect(council.placeGraphNodeId).toBe("florence");
    expect(council.placeTitle).toBe("Florence");

    const crimes = walk.stops[2];
    expect(crimes.located).toBe(true);
    expect(crimes.placeTitle).toBe("Imperial Germany");

    const florence = walk.stops[0];
    expect(florence.located).toBe(true);
    expect(florence.placeTitle).toBe("Florence");

    const balfour = walk.stops[4];
    expect(balfour.located).toBe(false);
    expect(balfour.placeGraphNodeId).toBeNull();
    expect(balfour.placeTitle).toBeNull();
  });

  test("non-temporal nodes are never walk stops", () => {
    const { nodes, relationships } = fixture();
    const walk = assembleTimelineWalk(nodes, relationships);
    expect(walk.stops.some((stop) => stop.graphNodeId === "monopoly")).toBe(false);
  });

  test("frameNodeIds map sub-timelines in place, nested inside the stop", () => {
    const { nodes, relationships } = fixture();
    const walk = assembleTimelineWalk(nodes, relationships, ["council"]);

    const council = walk.stops[1];
    expect(council.frame).not.toBeNull();
    expect(council.frame?.frameNodeId).toBe("council");
    expect(council.frame?.title).toBe("Council of Florence");
    // The frame node + its directly related temporal member (the place), clamped
    // to the frame window; the archetype hovers rather than nests.
    expect(council.frameMembers).toEqual(["florence", "council"]);

    expect(walk.subtimelineCount).toBe(1);
    // Other stops are not framed.
    expect(walk.stops[0].frame).toBeNull();
    expect(walk.stops[2].frame).toBeNull();
    expect(walk.stops[3].frame).toBeNull();
    expect(walk.stops[4].frame).toBeNull();
  });

  test("an unlocated stop can still frame its own sub-timeline (figure life, event causes)", () => {
    const { nodes, relationships } = fixture();
    const walk = assembleTimelineWalk(nodes, relationships, ["balfour"]);

    const balfour = walk.stops[4];
    expect(balfour.located).toBe(false);
    expect(balfour.frame).not.toBeNull();
    expect(balfour.frameMembers).toEqual(["balfour"]);
    expect(walk.subtimelineCount).toBe(1);
  });

  test("a Place stop frames its own history in place", () => {
    const { nodes, relationships } = fixture();
    const walk = assembleTimelineWalk(nodes, relationships, ["florence"]);

    const florence = walk.stops[0];
    expect(florence.located).toBe(true);
    expect(florence.frame).not.toBeNull();
    expect(florence.frame?.spatialFrame).toBe("place");
    expect(florence.frameMembers).toEqual(["florence", "council"]);
    expect(walk.subtimelineCount).toBe(1);
  });

  test("timelineWalkNodeIds collects stops plus nested frame members", () => {
    const { nodes, relationships } = fixture();
    const walk = assembleTimelineWalk(nodes, relationships, ["council"]);
    const ids = timelineWalkNodeIds(walk);
    expect(ids.has("council")).toBe(true);
    expect(ids.has("crimes")).toBe(true);
    expect(ids.has("balfour")).toBe(true);
    expect(ids.has("florence")).toBe(true);
    expect(ids.has("monopoly")).toBe(false);
  });

  test("timelineWalkStopYear parses the stop's temporal anchor", () => {
    const { nodes, relationships } = fixture();
    const walk = assembleTimelineWalk(nodes, relationships);
    expect(timelineWalkStopYear(walk.stops[0])).toBeCloseTo(1400, 0);
    expect(timelineWalkStopYear(walk.stops[1])).toBeCloseTo(1438, 0);
    expect(timelineWalkStopYear(walk.stops[2])).toBeCloseTo(1870, 0);
    expect(timelineWalkStopYear(walk.stops[4])).toBeCloseTo(1917, 0);
  });
});

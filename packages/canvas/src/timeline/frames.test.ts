import { describe, expect, test } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";

import type { GraphNode, GraphRelationship, TimelineViewNode } from "./contracts";
import {
  frameStateForNode,
  projectSubTimeline,
  relatedNodeIds,
  transTemporalHover,
} from "./frames";
import { projectNodes } from "./projection";

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

const relationships: GraphRelationship[] = [
  {
    id: "council-located",
    relType: "LOCATED_AT",
    sourceGraphNodeId: "council",
    targetGraphNodeId: "florence",
    properties: {},
  },
  {
    id: "council-instantiates",
    relType: "INSTANTIATES",
    sourceGraphNodeId: "council",
    targetGraphNodeId: "monopoly",
    properties: {},
  },
];

const records: TimelineViewNode[] = [
  record({
    graphNodeId: "florence",
    entityType: "Place",
    title: "Florence",
    validFrom: "1400-01-01",
    validTo: "1500-12-31",
  }),
  record({
    graphNodeId: "council",
    title: "Council of Florence",
    validFrom: "1438-04-09",
    validTo: "1445-08-07",
  }),
  record({
    graphNodeId: "balfour",
    title: "Balfour Declaration",
    validFrom: "1917-01-01",
  }),
  record({
    graphNodeId: "monopoly",
    entityType: "Archetype",
    title: "Monopoly mechanism",
    isTemporal: false,
    validFrom: null,
  }),
  record({
    graphNodeId: "unrelated",
    title: "Unrelated event",
    validFrom: "1450-01-01",
  }),
];

describe("relatedNodeIds", () => {
  test("returns the frame plus its direct graph neighbours", () => {
    expect(relatedNodeIds("council", relationships)).toEqual(
      new Set(["council", "florence", "monopoly"]),
    );
  });
});

describe("frameStateForNode", () => {
  test("a temporal Place frames a spatial sub-timeline with its own window", () => {
    const frame = frameStateForNode(records, "florence");
    expect(frame?.frameNodeId).toBe("florence");
    expect(frame?.spatialFrame).toBe("place");
    expect(frame?.window?.startYear).toBe(1400);
    expect(frame?.window?.endYear).toBeGreaterThan(1500);
    expect(frame?.window?.endYear).toBeLessThan(1501);
  });

  test("non-temporal nodes cannot frame a sub-timeline", () => {
    expect(frameStateForNode(records, "monopoly")).toBeNull();
    expect(frameStateForNode(records, "missing")).toBeNull();
  });
});

describe("projectSubTimeline", () => {
  test("keeps the frame and related nodes, clamps to the frame window", () => {
    const items = projectNodes(records);
    const frame = frameStateForNode(records, "florence")!;
    const members = projectSubTimeline(items, relationships, frame).map(
      (item) => item.graphNodeId,
    );
    // Council (1438–1445) sits inside Florence's 1400–1500 window and is
    // related; the unrelated 1450 event is related to nothing and excluded.
    expect(members).toEqual(["florence", "council"]);
  });

  test("an event frame bounds membership to its own window", () => {
    const items = projectNodes(records);
    const frame = frameStateForNode(records, "council")!;
    expect(frame?.spatialFrame).toBe("none");
    const members = projectSubTimeline(items, relationships, frame).map(
      (item) => item.graphNodeId,
    );
    expect(members).toEqual(["florence", "council"]);
  });
});

describe("transTemporalHover", () => {
  test("only related non-temporal Archetype/Dynamic/Work nodes hover", () => {
    const hovering = transTemporalHover(records, relationships, "council");
    expect(hovering.map((hover) => hover.graphNodeId)).toEqual(["monopoly"]);
    expect(hovering[0].node.title).toBe("Monopoly mechanism");
  });
});

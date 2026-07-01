import { describe, it, expect } from "vitest";
import type { CanvasView } from "@research-canvas/desktop-api";
import { canvasViewToCanvasNodes } from "./canvasViewToNodes";

const GRAPH_NODE_ID = "33333333-3333-4333-8333-333333333333";
const CANVAS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EDGE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SOURCE_NODE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TARGET_NODE_ID = GRAPH_NODE_ID;

const NOW = "2026-07-01T00:00:00.000Z";

function buildFixtureView(): CanvasView {
  return {
    canvasId: CANVAS_ID,
    nodes: [
      {
        node: {
          graphNodeId: GRAPH_NODE_ID,
          entityType: "Figure",
          title: "N",
          body: "[]",
          summary: "a summary",
          archetypalResonance: null,
          coordinate: null,
          sourceCoordinates: [],
          isTemporal: true,
          validFrom: null,
          validTo: null,
          temporalPrecision: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
        layout: {
          graphNodeId: GRAPH_NODE_ID,
          canvasId: CANVAS_ID,
          positionX: 12,
          positionY: 34,
          width: 240,
          height: 160,
          style: {},
        },
      },
    ],
    edges: [
      {
        id: EDGE_ID,
        canvasId: CANVAS_ID,
        sourceGraphNodeId: SOURCE_NODE_ID,
        targetGraphNodeId: TARGET_NODE_ID,
        relationKind: "CAUSES",
        style: { stroke: "#aabbcc", width: 1, dashed: false },
      },
    ],
    relationships: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    appState: {},
  };
}

describe("canvasViewToCanvasNodes", () => {
  it("maps the first JoinedCanvasNode to a note-typed CanvasNode with graphNodeId as id", () => {
    const view = buildFixtureView();
    const { nodes } = canvasViewToCanvasNodes(view);

    expect(nodes).toHaveLength(1);
    const node = nodes[0]!;
    expect(node.id).toBe(GRAPH_NODE_ID);
    expect(node.graphNodeId).toBe(GRAPH_NODE_ID);
    expect(node.type).toBe("note");
    expect(node.canvasId).toBe(CANVAS_ID);
    expect(node.title).toBe("N");
    expect(node.position.x).toBe(12);
    expect(node.position.y).toBe(34);
    expect(node.size.width).toBe(240);
    expect(node.size.height).toBe(160);
  });

  it("carries summary from the graph node", () => {
    const view = buildFixtureView();
    const { nodes } = canvasViewToCanvasNodes(view);
    expect(nodes[0]!.summary).toBe("a summary");
  });

  it("maps edges so that sourceNodeId === view.edges[0].sourceGraphNodeId", () => {
    const view = buildFixtureView();
    const { edges } = canvasViewToCanvasNodes(view);

    expect(edges).toHaveLength(1);
    const edge = edges[0]!;
    expect(edge.sourceNodeId).toBe(SOURCE_NODE_ID);
    expect(edge.targetNodeId).toBe(TARGET_NODE_ID);
    expect(edge.relationKind).toBe("CAUSES");
    expect(edge.id).toBe(EDGE_ID);
    expect(edge.canvasId).toBe(CANVAS_ID);
  });

  it("applies style fields from layout", () => {
    const view = buildFixtureView();
    view.nodes[0]!.layout.style = {
      dotColour: "#ff0000",
      bgColour: "#ffffff",
    };
    const { nodes } = canvasViewToCanvasNodes(view);
    expect(nodes[0]!.dotColour).toBe("#ff0000");
    expect(nodes[0]!.bgColour).toBe("#ffffff");
  });
});

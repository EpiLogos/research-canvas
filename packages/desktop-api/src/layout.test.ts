import { describe, expect, it } from "vitest";

import { nodeLayoutFromCanvasNode, edgeLayoutFromCanvasEdge } from "./index";
import type { CanvasEdge, CanvasNode } from "@research-canvas/schema";

const baseNode: CanvasNode = {
  id: "node-1",
  canvasId: "canvas-1",
  type: "note",
  title: "Hello",
  position: { x: 12, y: 34 },
  size: { width: 240, height: 160 },
  summary: "",
  content: "",
  tags: ["note"],
  dotColour: "#abc",
  createdAt: "2026-06-28T00:00:00Z",
  updatedAt: "2026-06-28T00:00:00Z",
} as unknown as CanvasNode;

const baseEdge: CanvasEdge = {
  id: "edge-1",
  canvasId: "canvas-1",
  sourceNodeId: "node-1",
  targetNodeId: "node-2",
  sourceHandleId: "node-1-right",
  targetHandleId: "node-2-left",
  relationKind: "supports",
  directionality: "forward",
  label: "supports",
  note: "",
  style: { stroke: "#f0b45a", width: 2, dashed: false },
  createdAt: "2026-06-28T00:00:00Z",
  updatedAt: "2026-06-28T00:00:00Z",
} as unknown as CanvasEdge;

describe("layout mappers", () => {
  it("maps a canvas node to a NodeLayout using node.id as graphNodeId", () => {
    const layout = nodeLayoutFromCanvasNode(baseNode);
    expect(layout.graphNodeId).toBe("node-1");
    expect(layout.canvasId).toBe("canvas-1");
    expect(layout.positionX).toBe(12);
    expect(layout.positionY).toBe(34);
    expect(layout.width).toBe(240);
    expect(layout.height).toBe(160);
    expect(layout.style.dotColour).toBe("#abc");
  });

  it("maps a canvas edge to an EdgeLayout", () => {
    const layout = edgeLayoutFromCanvasEdge(baseEdge);
    expect(layout.id).toBe("edge-1");
    expect(layout.sourceGraphNodeId).toBe("node-1");
    expect(layout.targetGraphNodeId).toBe("node-2");
    expect(layout.relationKind).toBe("supports");
    expect(layout.sourceHandleId).toBe("node-1-right");
    expect(layout.style.stroke).toBe("#f0b45a");
  });
});

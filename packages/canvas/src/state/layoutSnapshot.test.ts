import { describe, expect, it } from "vitest";

import { serializeLayoutSnapshot } from "./layoutSnapshot";
import type { CanvasSnapshot } from "./canvasStore";
import type { CanvasEdge, CanvasNode } from "@research-canvas/schema";

const node: CanvasNode = {
  id: "n1",
  canvasId: "c1",
  type: "note",
  title: "T",
  position: { x: 1, y: 2 },
  size: { width: 240, height: 160 },
  summary: "",
  content: "",
  tags: ["note"],
  createdAt: "2026-06-28T00:00:00Z",
  updatedAt: "2026-06-28T00:00:00Z",
} as unknown as CanvasNode;

const edge: CanvasEdge = {
  id: "e1",
  canvasId: "c1",
  sourceNodeId: "n1",
  targetNodeId: "n2",
  relationKind: "supports",
  directionality: "forward",
  label: "supports",
  note: "",
  style: { stroke: "#f0b45a", width: 2, dashed: false },
  createdAt: "2026-06-28T00:00:00Z",
  updatedAt: "2026-06-28T00:00:00Z",
} as unknown as CanvasEdge;

describe("serializeLayoutSnapshot", () => {
  it("maps a canvas snapshot into layouts and edges", () => {
    const snapshot: CanvasSnapshot = { nodes: [node], edges: [edge] };
    const result = serializeLayoutSnapshot(snapshot);

    expect(result.layouts).toHaveLength(1);
    expect(result.layouts[0].graphNodeId).toBe("n1");
    expect(result.layouts[0].positionX).toBe(1);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].sourceGraphNodeId).toBe("n1");
    expect(result.edges[0].targetGraphNodeId).toBe("n2");
  });

  it("returns empty arrays for an empty snapshot", () => {
    const result = serializeLayoutSnapshot({ nodes: [], edges: [] });
    expect(result.layouts).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});

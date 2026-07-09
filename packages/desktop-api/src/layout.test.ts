import { describe, expect, it } from "vitest";

import { nodeLayoutFromCanvasNode, edgeLayoutFromCanvasEdge, buildFlushRequest } from "./index";
import type { CanvasNodeSidecar } from "./graph";
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
  timelineCard: { offsetY: 42, width: 310, height: 118 },
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

describe("buildFlushRequest", () => {
  it("serializes layouts, edges, viewport, and app-state into the Rust command shape", () => {
    const request = buildFlushRequest({
      databasePath: "/tmp/db.sqlite",
      canvasId: "canvas-1",
      layouts: [nodeLayoutFromCanvasNode(baseNode)],
      edges: [edgeLayoutFromCanvasEdge(baseEdge)],
      viewport: { x: 5, y: 6, zoom: 1.25 },
      appState: { panel: "open" },
    });

    expect(request.databasePath).toBe("/tmp/db.sqlite");
    expect(request.canvasId).toBe("canvas-1");
    expect(request.layouts).toHaveLength(1);
    expect(request.layouts[0].graphNodeId).toBe("node-1");
    expect(request.layouts[0].positionX).toBe(12);
    // styleJson now includes the __canvasNode sidecar — parse and check dotColour
    const style = JSON.parse(request.layouts[0].styleJson) as Record<string, unknown>;
    expect(style.dotColour).toBe("#abc");
    expect((style.__canvasNode as Record<string, unknown>).type).toBe("note");
    expect(style.__timelineCard).toEqual({ offsetY: 42, width: 310, height: 118 });
    expect(request.edges[0].id).toBe("edge-1");
    expect(request.edges[0].sourceGraphNodeId).toBe("node-1");
    expect(request.edges[0].styleJson).toBe(
      JSON.stringify({ stroke: "#f0b45a", width: 2, dashed: false }),
    );
    expect(request.viewportJson).toBe(JSON.stringify({ x: 5, y: 6, zoom: 1.25 }));
    expect(request.appStateJson).toBe(JSON.stringify({ panel: "open" }));
  });
});

describe("layout mappers", () => {
  it("maps a canvas node to a NodeLayout using the real graphNodeId", () => {
    const layout = nodeLayoutFromCanvasNode(baseNode);
    expect(layout.graphNodeId).toBe("node-1");
    expect(layout.canvasId).toBe("canvas-1");
    expect(layout.positionX).toBe(12);
    expect(layout.positionY).toBe(34);
    expect(layout.width).toBe(240);
    expect(layout.height).toBe(160);
    expect(layout.style.dotColour).toBe("#abc");
    expect(layout.style.__timelineCard).toEqual({ offsetY: 42, width: 310, height: 118 });
  });

  it("prefers node.graphNodeId over UI id when they differ", () => {
    const node = {
      ...baseNode,
      id: "canvas-node-1",
      graphNodeId: "graph-node-1",
    } as unknown as CanvasNode;

    const layout = nodeLayoutFromCanvasNode(node);
    expect(layout.graphNodeId).toBe("graph-node-1");
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

describe("nodeLayoutFromCanvasNode — sidecar carries title (lf-task-1)", () => {
  it("round-trips a note node's title into layout.style.__canvasNode.title", () => {
    const noteNode: CanvasNode = {
      ...baseNode,
      type: "note",
      title: "My Note Title",
      content: "body text",
      tags: ["a"],
    } as unknown as CanvasNode;

    const layout = nodeLayoutFromCanvasNode(noteNode);
    const sidecar = layout.style.__canvasNode as CanvasNodeSidecar;
    expect(sidecar.type).toBe("note");
    expect(sidecar.title).toBe("My Note Title");
  });

  it("round-trips a group node's title into layout.style.__canvasNode.title", () => {
    const groupNode: CanvasNode = {
      id: "node-2",
      canvasId: "canvas-1",
      type: "group",
      title: "My Group Title",
      position: { x: 0, y: 0 },
      size: { width: 320, height: 240 },
      summary: "",
      color: "#334155",
      childNodeIds: [],
      createdAt: "2026-06-28T00:00:00Z",
      updatedAt: "2026-06-28T00:00:00Z",
    } as unknown as CanvasNode;

    const layout = nodeLayoutFromCanvasNode(groupNode);
    const sidecar = layout.style.__canvasNode as CanvasNodeSidecar;
    expect(sidecar.type).toBe("group");
    expect(sidecar.title).toBe("My Group Title");
  });

  it("round-trips a resource node's title into layout.style.__canvasNode.title", () => {
    const resourceNode: CanvasNode = {
      id: "node-3",
      canvasId: "canvas-1",
      type: "resource",
      title: "My Resource Title",
      position: { x: 0, y: 0 },
      size: { width: 260, height: 180 },
      summary: "",
      resourceKind: "markdown",
      absolutePath: "/workspace/report.md",
      relativePath: "report.md",
      mimeType: "text/markdown",
      fileFingerprint: "markdown:report.md",
      createdAt: "2026-06-28T00:00:00Z",
      updatedAt: "2026-06-28T00:00:00Z",
    } as unknown as CanvasNode;

    const layout = nodeLayoutFromCanvasNode(resourceNode);
    const sidecar = layout.style.__canvasNode as CanvasNodeSidecar;
    expect(sidecar.type).toBe("resource");
    expect(sidecar.title).toBe("My Resource Title");
  });

  it("round-trips constellation portal metadata into layout.style.__canvasNode", () => {
    const portalNode: CanvasNode = {
      id: "node-4",
      canvasId: "canvas-1",
      type: "portal",
      title: "QL Unit",
      position: { x: 0, y: 0 },
      size: { width: 300, height: 180 },
      summary: "Nested interpretive unit",
      targetCanvasId: "22222222-2222-4222-8222-222222222222",
      constellationKind: "ql-unit",
      createdAt: "2026-06-28T00:00:00Z",
      updatedAt: "2026-06-28T00:00:00Z",
    } as unknown as CanvasNode;

    const layout = nodeLayoutFromCanvasNode(portalNode);
    const sidecar = layout.style.__canvasNode as CanvasNodeSidecar;
    expect(sidecar).toMatchObject({
      type: "portal",
      title: "QL Unit",
      targetCanvasId: "22222222-2222-4222-8222-222222222222",
      constellationKind: "ql-unit",
    });
  });
});

// packages/desktop-api/src/graph.test.ts
import { describe, expect, it } from "vitest";
import { createBrowserBridgeTransport } from "./index";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import type { CanvasView, GraphNode } from "./graph";

describe("graph transport", () => {
  it("exports CanvasView/GraphNode types usable at runtime via a value check", () => {
    // Type-only import compiles; assert a representative object satisfies GraphNode shape.
    // Also verify CanvasView is exported by using it as a type annotation on a partial stub.
    const _cv: Partial<CanvasView> = { canvasId: "test" };
    expect(_cv.canvasId).toBe("test");
    const node: GraphNode = {
      graphNodeId: "g1",
      entityType: "Event",
      title: "t",
      body: "[]",
      summary: "",
      archetypalResonance: null,
      coordinate: null,
      sourceCoordinates: [],
      ...EMPTY_GRAPH_NODE_METADATA,
      isTemporal: true,
      validFrom: null,
      validTo: null,
      temporalPrecision: null,
      createdAt: "",
      updatedAt: "",
    };
    expect(node.graphNodeId).toBe("g1");
  });

  it("read-only web build rejects theory mutations", async () => {
    const transport = createBrowserBridgeTransport();
    await expect(
      transport.createGraphNode({ entityType: "Event", title: "x", body: "[]", isTemporal: true }),
    ).rejects.toThrow("read-only web build");
    await expect(
      transport.upsertNodeLayout({ layout: {
        graphNodeId: "g", canvasId: "c", positionX: 0, positionY: 0, width: 1, height: 1, style: {},
      } }),
    ).rejects.toThrow("read-only web build");
  });
});

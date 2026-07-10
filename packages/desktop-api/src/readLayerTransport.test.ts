import { describe, expect, it } from "vitest";

import { createReadLayerTransport, type GraphExportBundle } from "./index";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";

function bundle(): GraphExportBundle {
  return {
    generatedAt: "2026-06-28T12:00:00Z",
    project: {
      coverAssetPath: null,
      createdAt: "t",
      displayName: "Antichrist",
      id: "11111111-1111-4111-8111-111111111111",
      parentConstellationId: null,
      primaryCanvasId: "c1",
      publishSettings: { includeResources: true, mobileSequenceFirst: true, theme: "paper" },
      rootPath: "/tmp/antichrist",
      slug: "antichrist",
      summary: "Theory graph",
      updatedAt: "t"
    },
    canvasId: "c1",
    nodes: [
      {
        graphNodeId: "n1",
        entityType: "Event",
        title: "Banda genocide",
        body: "[]",
        summary: "1621",
        archetypalResonance: null,
        coordinate: null,
        sourceCoordinates: [],
        ...EMPTY_GRAPH_NODE_METADATA,
        isTemporal: true,
        validFrom: "1621-01-01",
        validTo: null,
        temporalPrecision: "year",
        createdAt: "t",
        updatedAt: "t"
      }
    ],
    relationships: [],
    nodeLayout: [],
    edgeLayout: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    appState: {},
    lightingIndex: {},
    assets: []
  };
}

describe("createReadLayerTransport", () => {
  it("returns a read-only static-bundle transport when a bundle is provided", async () => {
    const transport = createReadLayerTransport(bundle());
    const node = await transport.readGraphNode({ graphNodeId: "n1" });
    expect(node.title).toBe("Banda genocide");
    await expect(
      transport.createGraphNode({ entityType: "Event", title: "x", body: "[]", isTemporal: true })
    ).rejects.toThrow("read-only web build");
  });

  it("falls back to the runtime transport when no bundle is provided", () => {
    const transport = createReadLayerTransport(null);
    // In jsdom there is no Tauri runtime, so the browser-bridge transport is returned.
    // We only assert it exposes the read-graph method (interface conformance), not network behavior.
    expect(typeof transport.readGraphNode).toBe("function");
  });
});

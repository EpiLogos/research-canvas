import { describe, expect, it } from "vitest";

import type { GraphExportBundle } from "@research-canvas/exporter";

import { createStaticBundleTransport } from "./index";

function fixtureBundle(): GraphExportBundle {
  const monopoly: GraphExportBundle["nodes"][number] = {
    graphNodeId: "node-monopoly",
    entityType: "Dynamic",
    title: "Monopoly mechanism",
    body: "[]",
    summary: "trans-temporal pattern",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    evidenceTags: [],
    sourceKind: null,
    isTemporal: false,
    validFrom: null,
    validTo: null,
    temporalPrecision: null,
    createdAt: "2026-06-28T12:00:00Z",
    updatedAt: "2026-06-28T12:00:00Z"
  };
  const banda: GraphExportBundle["nodes"][number] = {
    graphNodeId: "node-banda",
    entityType: "Event",
    title: "Banda genocide",
    body: "[]",
    summary: "1621",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    evidenceTags: ["archive"],
    sourceKind: "archive",
    isTemporal: true,
    validFrom: "1621-01-01",
    validTo: "1621-12-31",
    temporalPrecision: "year",
    createdAt: "2026-06-28T12:00:00Z",
    updatedAt: "2026-06-28T12:00:00Z"
  };
  return {
    generatedAt: "2026-06-28T12:00:00Z",
    project: {
      coverAssetPath: null,
      createdAt: "2026-06-28T12:00:00Z",
      displayName: "Antichrist",
      id: "11111111-1111-4111-8111-111111111111",
      parentProjectId: null,
      primaryCanvasId: "c1",
      publishSettings: {
        includeResources: true,
        mobileSequenceFirst: true,
        theme: "paper"
      },
      rootPath: "/tmp/antichrist",
      slug: "antichrist",
      summary: "Theory graph",
      updatedAt: "2026-06-28T12:00:00Z"
    },
    canvasId: "c1",
    nodes: [monopoly, banda],
    relationships: [
      {
        id: "rel-1",
        relType: "INSTANTIATES",
        sourceGraphNodeId: "node-banda",
        targetGraphNodeId: "node-monopoly",
        properties: { dominance: "dominant" }
      }
    ],
    nodeLayout: [
      {
        graphNodeId: "node-banda",
        canvasId: "c1",
        positionX: 100,
        positionY: 200,
        width: 240,
        height: 160,
        style: {}
      }
    ],
    edgeLayout: [],
    viewport: { x: 5, y: 6, zoom: 2 },
    appState: { activeLens: "canvas" },
    lightingIndex: {
      "node-monopoly": [
        { node: banda, relType: "INSTANTIATES", dominance: "dominant" }
      ]
    },
    assets: []
  };
}

describe("createStaticBundleTransport", () => {
  it("reads a single graph node by id", async () => {
    const transport = createStaticBundleTransport(fixtureBundle());
    const node = await transport.readGraphNode({ graphNodeId: "node-banda" });
    expect(node.title).toBe("Banda genocide");
  });

  it("loadCanvasView('canvas') returns all nodes, synthesising default layout for unplaced ones", async () => {
    const transport = createStaticBundleTransport(fixtureBundle());
    const view = await transport.loadCanvasView({ canvasId: "c1", lens: "canvas" });
    expect(view.nodes).toHaveLength(2);
    const monopoly = view.nodes.find((n) => n.node.graphNodeId === "node-monopoly");
    // monopoly had no layout row -> synthesised default
    expect(monopoly?.layout.width).toBeGreaterThan(0);
    const banda = view.nodes.find((n) => n.node.graphNodeId === "node-banda");
    expect(banda?.layout.positionX).toBe(100);
    expect(view.viewport).toEqual({ x: 5, y: 6, zoom: 2 });
    expect(view.relationships).toHaveLength(1);
  });

  it("loadCanvasView('timeline') returns only isTemporal nodes", async () => {
    const transport = createStaticBundleTransport(fixtureBundle());
    const view = await transport.loadCanvasView({ canvasId: "c1", lens: "timeline" });
    expect(view.nodes).toHaveLength(1);
    expect(view.nodes[0].node.graphNodeId).toBe("node-banda");
  });

  it("archetypalLighting reads the precomputed lighting index", async () => {
    const transport = createStaticBundleTransport(fixtureBundle());
    const lighting = await transport.archetypalLighting({
      operatorGraphNodeId: "node-monopoly"
    });
    expect(lighting.operator.graphNodeId).toBe("node-monopoly");
    expect(lighting.instances).toHaveLength(1);
    expect(lighting.instances[0].node.graphNodeId).toBe("node-banda");
    expect(lighting.instances[0].dominance).toBe("dominant");
  });

  it("resonancesForInstance returns operators that light a given instance", async () => {
    const transport = createStaticBundleTransport(fixtureBundle());
    const resonances = await transport.resonancesForInstance({
      graphNodeId: "node-banda"
    });
    expect(resonances).toHaveLength(1);
    expect(resonances[0].node.graphNodeId).toBe("node-monopoly");
    expect(resonances[0].relType).toBe("INSTANTIATES");
  });

  it("searchGraph matches title and summary case-insensitively", async () => {
    const transport = createStaticBundleTransport(fixtureBundle());
    const hits = await transport.searchGraph({ query: "banda" });
    expect(hits.map((h) => h.graphNodeId)).toContain("node-banda");
  });

  it("every mutation method throws 'read-only web build'", async () => {
    const transport = createStaticBundleTransport(fixtureBundle());
    await expect(
      transport.createGraphNode({ entityType: "Event", title: "x", body: "[]", isTemporal: true })
    ).rejects.toThrow("read-only web build");
    await expect(
      transport.updateGraphNode({ graphNodeId: "node-banda", patch: { title: "y" } })
    ).rejects.toThrow("read-only web build");
    await expect(transport.deleteGraphNode({ graphNodeId: "node-banda" })).rejects.toThrow(
      "read-only web build"
    );
    await expect(
      transport.connectGraphNodes({
        sourceGraphNodeId: "node-banda",
        targetGraphNodeId: "node-monopoly",
        relType: "INSTANTIATES"
      })
    ).rejects.toThrow("read-only web build");
    await expect(
      transport.disconnectGraphNodes({ relationshipId: "rel-1" })
    ).rejects.toThrow("read-only web build");
    await expect(
      transport.upsertNodeLayout({
        layout: {
          graphNodeId: "node-banda",
          canvasId: "c1",
          positionX: 0,
          positionY: 0,
          width: 1,
          height: 1,
          style: {}
        }
      })
    ).rejects.toThrow("read-only web build");
    expect(() =>
      transport.flushCanvasLayout({
        canvasId: "c1",
        layouts: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        appState: {}
      })
    ).toThrow("read-only web build");
  });
});

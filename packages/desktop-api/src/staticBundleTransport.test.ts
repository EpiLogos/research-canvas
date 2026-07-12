import { describe, expect, it } from "vitest";

import { createStaticBundleTransport, type GraphExportBundle } from "./index";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";

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
    ...EMPTY_GRAPH_NODE_METADATA,
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
    ...EMPTY_GRAPH_NODE_METADATA,
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
      parentConstellationId: null,
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

  it("loads a first-class workspace timeline without a canvas membership scope", async () => {
    const transport = createStaticBundleTransport(fixtureBundle());
    const view = await transport.loadTimelineView({ workspaceId: "static:11111111-1111-4111-8111-111111111111" });
    expect(view.workspaceId).toBe("static:11111111-1111-4111-8111-111111111111");
    expect(view.nodes.map((record) => record.node.graphNodeId)).toEqual(["node-banda"]);
    expect(view.nodes[0].anchor).toEqual({
      validFrom: "1621-01-01",
      validTo: "1621-12-31",
      precision: "year",
    });
    expect(view.diagnostics).toEqual([]);
  });

  it("uses the canonical temporal grammar, interval ordering, workspace identity and filters", async () => {
    const bundle = fixtureBundle();
    const base = bundle.nodes[1];
    const cases = [
      ["bce", "-0043", null, "year", true],
      ["month", "1945-05", null, "month", true],
      ["leap", "2000-02-29", null, "day", true],
      ["datetime", "2024-01-02T03:04:05Z", null, "day", true],
      ["offset-crossing", "2024-01-01T00:30:00+01:00", "2023-12-31T23:45:00Z", "day", true],
      ["submillisecond", "2024-01-01T00:00:00.0009Z", "2024-01-01T00:00:00.0001Z", "day", true],
      ["nonleap", "2023-02-29", null, "day", false],
      ["suffix", "1945-05-08garbage", null, "day", false],
      ["plus", "+1945", null, "year", false],
      ["overlong", "1000000", null, "year", false],
      ["whitespace", " 1945 ", null, "year", false],
      ["inverted", "1946", "1945", "year", false],
      ["missing-precision", "1945", null, null, false],
    ] as const;
    bundle.nodes = cases.map(([id, validFrom, validTo, precision]) => ({
      ...base,
      graphNodeId: id,
      validFrom,
      validTo,
      temporalPrecision: precision,
      historicity: "historical",
      temporalRole: "occurred_at",
    }));
    const transport = createStaticBundleTransport(bundle);
    const workspaceId = "static:11111111-1111-4111-8111-111111111111";
    const view = await transport.loadTimelineView({ workspaceId });
    expect(view.nodes.map((row) => row.node.graphNodeId)).toEqual(["bce", "month", "leap", "datetime", "offset-crossing", "submillisecond"]);
    expect(view.diagnostics).toHaveLength(7);
    const filtered = await transport.loadTimelineView({
      workspaceId,
      filters: {
        entityTypes: { include: ["Event"], exclude: ["Claim"] },
        historicities: { include: ["historical"] },
        temporalRoles: { include: ["occurred_at"] },
      },
    });
    expect(filtered.nodes).toHaveLength(6);
    await expect(transport.loadTimelineView({ workspaceId: "wrong" })).rejects.toThrow(/does not match/);
  });

  it("scopes layouts by canvas so reused constellation portals keep per-canvas placement", async () => {
    const bundle = fixtureBundle();
    bundle.nodes.push({
      graphNodeId: "constellation-devil",
      entityType: "Constellation",
      title: "Devil Sixfold Spectral Lineage",
      body: "[]",
      summary: "Nested QL unit",
      archetypalResonance: null,
      coordinate: null,
      sourceCoordinates: ["#0", "antichrist-vault/episodes/1/ql-units/unit-spectral-devils-chain.md"],
      ...EMPTY_GRAPH_NODE_METADATA,
      evidenceTags: ["ql_unit", "ql_positioned"],
      sourceKind: "ql-unit",
      isTemporal: false,
      validFrom: null,
      validTo: null,
      temporalPrecision: null,
      createdAt: "2026-06-28T12:00:00Z",
      updatedAt: "2026-06-28T12:00:00Z"
    });
    bundle.nodeLayout.push(
      {
        graphNodeId: "constellation-devil",
        canvasId: "c1",
        positionX: 10,
        positionY: 20,
        width: 300,
        height: 180,
        style: {
          __canvasNode: {
            type: "portal",
            title: "Devil Sixfold Spectral Lineage",
            targetCanvasId: "22222222-2222-4222-8222-222222222222",
            constellationKind: "ql-unit"
          }
        }
      },
      {
        graphNodeId: "constellation-devil",
        canvasId: "22222222-2222-4222-8222-222222222222",
        positionX: 640,
        positionY: 90,
        width: 260,
        height: 150,
        style: {
          __canvasNode: {
            type: "portal",
            title: "Nested Devil Lineage",
            targetCanvasId: "33333333-3333-4333-8333-333333333333",
            constellationKind: "ql-unit"
          }
        }
      }
    );

    const transport = createStaticBundleTransport(bundle);
    const root = await transport.loadCanvasView({ canvasId: "c1", lens: "canvas" });
    const child = await transport.loadCanvasView({
      canvasId: "22222222-2222-4222-8222-222222222222",
      lens: "canvas"
    });

    const rootPortal = root.nodes.find((joined) => joined.node.graphNodeId === "constellation-devil");
    expect(rootPortal?.layout.positionX).toBe(10);
    expect(rootPortal?.layout.style.__canvasNode).toMatchObject({
      title: "Devil Sixfold Spectral Lineage",
      targetCanvasId: "22222222-2222-4222-8222-222222222222",
      constellationKind: "ql-unit"
    });

    expect(child.nodes).toHaveLength(1);
    expect(child.nodes[0].node.graphNodeId).toBe("constellation-devil");
    expect(child.nodes[0].layout.positionX).toBe(640);
    expect(child.nodes[0].layout.style.__canvasNode).toMatchObject({
      title: "Nested Devil Lineage",
      targetCanvasId: "33333333-3333-4333-8333-333333333333",
      constellationKind: "ql-unit"
    });
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

import { describe, expect, it } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";

import { graphExportBundleSchema, parseGraphExportBundle, parseLegacyGraphExportBundle } from "./graphBundle";
import type { GraphExportBundle } from "./graphBundle";

function makeBundle(): GraphExportBundle {
  return {
    generatedAt: "2026-06-28T12:00:00Z",
    project: {
      coverAssetPath: null,
      createdAt: "2026-06-28T12:00:00Z",
      displayName: "Antichrist",
      id: "11111111-1111-4111-8111-111111111111",
      parentConstellationId: null,
      primaryCanvasId: "22222222-2222-4222-8222-222222222222",
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
    canvasId: "22222222-2222-4222-8222-222222222222",
    nodes: [
      {
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
      },
      {
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
      }
    ],
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
        graphNodeId: "node-monopoly",
        canvasId: "22222222-2222-4222-8222-222222222222",
        positionX: 10,
        positionY: 20,
        width: 240,
        height: 160,
        style: {}
      }
    ],
    edgeLayout: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    appState: {},
    lightingIndex: {
      "node-monopoly": [
        {
          node: {
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
          },
          relType: "INSTANTIATES",
          dominance: "dominant"
        }
      ]
    },
    assets: []
  };
}

describe("graphExportBundle", () => {
  it("round-trips timeline card presentation exactly", () => {
    const bundle = makeBundle();
    bundle.nodeLayout[0].style.__timelineCard = { offsetY: 37, width: 311, height: 177 };
    expect(parseGraphExportBundle(bundle).nodeLayout[0].style.__timelineCard).toEqual({
      offsetY: 37, width: 311, height: 177,
    });
  });

  it("separates strict current bundles from explicit legacy normalization", () => {
    const legacy = makeBundle();
    delete (legacy.nodes[0] as Partial<(typeof legacy.nodes)[number]>).contentOrigin;
    expect(graphExportBundleSchema.safeParse(legacy).success).toBe(false);
    expect(parseLegacyGraphExportBundle(legacy).nodes[0].contentOrigin).toBeNull();
  });
  it("accepts a well-formed bundle and round-trips through parse", () => {
    const bundle = makeBundle();
    const parsed = parseGraphExportBundle(bundle);
    expect(parsed.canvasId).toBe("22222222-2222-4222-8222-222222222222");
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.lightingIndex["node-monopoly"]?.[0]?.relType).toBe("INSTANTIATES");
  });

  it("accepts constellation nodes and QL portal sidecars in exported bundles", () => {
    const bundle = makeBundle();
    bundle.nodes.push({
      graphNodeId: "constellation-ql-unit",
      entityType: "Constellation",
      title: "QL Reading Unit",
      body: "A nested constellation surface.",
      summary: "QL aligned grouping",
      archetypalResonance: null,
      coordinate: "#2:L3/P4",
      sourceCoordinates: ["#2", "L3", "P4"],
      ...EMPTY_GRAPH_NODE_METADATA,
      evidenceTags: ["ql-unit"],
      sourceKind: "constellation",
      isTemporal: true,
      validFrom: "1621-01-01",
      validTo: null,
      temporalPrecision: "year",
      createdAt: "2026-06-28T12:00:00Z",
      updatedAt: "2026-06-28T12:00:00Z",
    });
    bundle.nodeLayout.push({
      graphNodeId: "constellation-ql-unit",
      canvasId: "22222222-2222-4222-8222-222222222222",
      positionX: 40,
      positionY: 60,
      width: 300,
      height: 180,
      style: {
        __canvasNode: {
          type: "portal",
          title: "QL Reading Unit",
          targetCanvasId: "33333333-3333-4333-8333-333333333333",
          constellationKind: "ql-unit",
        },
      },
    });

    const parsed = parseGraphExportBundle(bundle);
    expect(parsed.nodes.find((node) => node.graphNodeId === "constellation-ql-unit")?.entityType).toBe("Constellation");
    expect(parsed.nodeLayout.at(-1)?.style.__canvasNode).toMatchObject({
      type: "portal",
      constellationKind: "ql-unit",
    });
  });

  it("rejects a bundle whose node is missing graphNodeId", () => {
    const broken = makeBundle();
    // @ts-expect-error intentionally remove a required field for the test
    delete broken.nodes[0].graphNodeId;
    expect(() => parseGraphExportBundle(broken)).toThrow();
    expect(graphExportBundleSchema.safeParse(broken).success).toBe(false);
  });
});

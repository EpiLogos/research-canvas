import { describe, expect, it } from "vitest";

import { graphExportBundleSchema, parseGraphExportBundle } from "./graphBundle";
import type { GraphExportBundle } from "./graphBundle";

function makeBundle(): GraphExportBundle {
  return {
    generatedAt: "2026-06-28T12:00:00Z",
    project: {
      coverAssetPath: null,
      createdAt: "2026-06-28T12:00:00Z",
      displayName: "Antichrist",
      id: "11111111-1111-4111-8111-111111111111",
      parentProjectId: null,
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
        evidenceTags: [],
        sourceKind: null,
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
        evidenceTags: ["archive"],
        sourceKind: "archive",
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
            evidenceTags: ["archive"],
            sourceKind: "archive",
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
  it("accepts a well-formed bundle and round-trips through parse", () => {
    const bundle = makeBundle();
    const parsed = parseGraphExportBundle(bundle);
    expect(parsed.canvasId).toBe("22222222-2222-4222-8222-222222222222");
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.nodes[1].evidenceTags).toEqual(["archive"]);
    expect(parsed.nodes[1].sourceKind).toBe("archive");
    expect(parsed.lightingIndex["node-monopoly"]?.[0]?.relType).toBe("INSTANTIATES");
  });

  it("normalizes legacy bundle nodes missing evidence fields", () => {
    const legacy = makeBundle();
    for (const node of legacy.nodes) {
      // @ts-expect-error intentionally remove Task 6 fields from a legacy bundle
      delete node.evidenceTags;
      // @ts-expect-error intentionally remove Task 6 fields from a legacy bundle
      delete node.sourceKind;
    }
    const litNode = legacy.lightingIndex["node-monopoly"]?.[0]?.node;
    if (!litNode) {
      throw new Error("missing lighting fixture node");
    }
    // @ts-expect-error intentionally remove Task 6 fields from a legacy bundle
    delete litNode.evidenceTags;
    // @ts-expect-error intentionally remove Task 6 fields from a legacy bundle
    delete litNode.sourceKind;

    const parsed = parseGraphExportBundle(legacy);

    expect(parsed.nodes[0].evidenceTags).toEqual([]);
    expect(parsed.nodes[0].sourceKind).toBeNull();
    expect(parsed.lightingIndex["node-monopoly"]?.[0]?.node.evidenceTags).toEqual([]);
    expect(parsed.lightingIndex["node-monopoly"]?.[0]?.node.sourceKind).toBeNull();
  });

  it("rejects a bundle whose node is missing graphNodeId", () => {
    const broken = makeBundle();
    // @ts-expect-error intentionally remove a required field for the test
    delete broken.nodes[0].graphNodeId;
    expect(() => parseGraphExportBundle(broken)).toThrow();
    expect(graphExportBundleSchema.safeParse(broken).success).toBe(false);
  });
});

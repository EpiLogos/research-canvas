import { describe, expect, test, vi } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import { createTimelineDataSource } from "./createTimelineDataSource";
import type {
  ArchetypalLighting,
  CanvasView,
  GraphNode,
  LitInstance,
} from "@research-canvas/desktop-api";

function gnode(id: string, isTemporal: boolean): GraphNode {
  return {
    graphNodeId: id,
    entityType: isTemporal ? "Event" : "Archetype",
    title: id,
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    ...EMPTY_GRAPH_NODE_METADATA,
    isTemporal,
    validFrom: isTemporal ? "1621-01-01" : null,
    validTo: null,
    temporalPrecision: isTemporal ? "year" : null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("createTimelineDataSource", () => {
  test("loadTimelineNodes requests the timeline lens and preserves joined layout metadata", async () => {
    const view: CanvasView = {
      canvasId: "c1",
      nodes: [
        {
          node: gnode("banda", true),
          layout: {
            graphNodeId: "banda",
            canvasId: "c1",
            positionX: 0,
            positionY: 0,
            width: 100,
            height: 50,
            style: {},
          },
        },
      ],
      edges: [],
      relationships: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      appState: {},
    };
    const loadCanvasView = vi.fn(async () => view);
    const ds = createTimelineDataSource({
      transport: {
        loadCanvasView,
        archetypalLighting: vi.fn(),
        resonancesForInstance: vi.fn(),
      },
      canvasId: "c1",
    });
    const nodes = await ds.loadTimelineNodes();
    expect(loadCanvasView).toHaveBeenCalledWith({ canvasId: "c1", lens: "timeline" });
    expect(nodes.map((record) => record.node.graphNodeId)).toEqual(["banda"]);
    expect(nodes[0]?.layout).toEqual(
      expect.objectContaining({
        graphNodeId: "banda",
        width: 100,
        height: 50,
      }),
    );
  });

  test("archetypalLighting forwards the operator id", async () => {
    const lighting: ArchetypalLighting = {
      operator: gnode("op", false),
      instances: [
        { node: gnode("banda", true), relType: "INSTANTIATES", dominance: "dominant" },
      ],
    };
    const archetypalLighting = vi.fn(async () => lighting);
    const ds = createTimelineDataSource({
      transport: {
        loadCanvasView: vi.fn(),
        archetypalLighting,
        resonancesForInstance: vi.fn(),
      },
      canvasId: "c1",
    });
    const out = await ds.archetypalLighting("op");
    expect(archetypalLighting).toHaveBeenCalledWith({ operatorGraphNodeId: "op" });
    expect(out.instances).toHaveLength(1);
  });

  test("resonancesForInstance forwards the node id", async () => {
    const resonances: LitInstance[] = [
      { node: gnode("op", false), relType: "ECHOES", dominance: "secondary" },
    ];
    const resonancesForInstance = vi.fn(async () => resonances);
    const ds = createTimelineDataSource({
      transport: {
        loadCanvasView: vi.fn(),
        archetypalLighting: vi.fn(),
        resonancesForInstance,
      },
      canvasId: "c1",
    });
    const out = await ds.resonancesForInstance("banda");
    expect(resonancesForInstance).toHaveBeenCalledWith({ graphNodeId: "banda" });
    expect(out).toHaveLength(1);
  });
});

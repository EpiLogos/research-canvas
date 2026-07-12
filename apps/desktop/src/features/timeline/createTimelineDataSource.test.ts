import { describe, expect, test, vi } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import { createTimelineDataSource } from "./createTimelineDataSource";
import type {
  ArchetypalLighting,
  GraphNode,
  LitInstance,
  TimelineView,
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
  test("loads the workspace timeline independently of canvas membership", async () => {
    const view: TimelineView = {
      workspaceId: "sqlite:/canonical/workspace.sqlite",
      nodes: [
        {
          node: gnode("banda", true),
          anchor: { validFrom: "1621-01-01", validTo: null, precision: "year" },
          layoutOverride: {
            lane: "events",
            offsetY: 12,
            width: 100,
            height: 50,
            style: {},
            layoutRevision: 3,
          },
        },
      ],
      lanes: [{ id: "events" }],
      diagnostics: [],
    };
    const loadTimelineView = vi.fn(async () => view);
    const ds = createTimelineDataSource({
      transport: {
        loadTimelineView,
        archetypalLighting: vi.fn(),
        resonancesForInstance: vi.fn(),
      },
      workspaceId: "sqlite:/canonical/workspace.sqlite",
    });
    const loaded = await ds.loadTimelineView();
    expect(loadTimelineView).toHaveBeenCalledWith({ workspaceId: "sqlite:/canonical/workspace.sqlite" });
    expect(loaded.nodes.map((record) => record.node.graphNodeId)).toEqual(["banda"]);
    expect(loaded.nodes[0]?.layoutOverride).toEqual(expect.objectContaining({ lane: "events", width: 100 }));
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
        loadTimelineView: vi.fn(),
        archetypalLighting,
        resonancesForInstance: vi.fn(),
      },
      workspaceId: "sqlite:/canonical/workspace.sqlite",
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
        loadTimelineView: vi.fn(),
        archetypalLighting: vi.fn(),
        resonancesForInstance,
      },
      workspaceId: "sqlite:/canonical/workspace.sqlite",
    });
    const out = await ds.resonancesForInstance("banda");
    expect(resonancesForInstance).toHaveBeenCalledWith({ graphNodeId: "banda" });
    expect(out).toHaveLength(1);
  });
});

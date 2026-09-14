import { describe, expect, test, vi } from "vitest";

import type { PalaceLayout } from "@research-canvas/domain";
import type {
  GraphNode,
  GraphRelationship,
  PalaceGraphView,
  WorkspaceServices,
} from "@research-canvas/desktop-api";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";

import { DesktopPalaceRepository } from "./DesktopPalaceRepository";

function node(id: string, title: string): GraphNode {
  return {
    graphNodeId: id,
    entityType: "Event",
    title,
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    ...EMPTY_GRAPH_NODE_METADATA,
    isTemporal: true,
    validFrom: "1600-01-01",
    validTo: null,
    temporalPrecision: "year",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function graphView(): PalaceGraphView {
  const a = node("node:a", "A");
  const b = node("node:b", "B");
  const outside = node("node:outside", "Outside");
  const relationship = (
    id: string,
    sourceGraphNodeId: string,
    targetGraphNodeId: string,
  ): GraphRelationship => ({
    id,
    relType: "RELATES_TO",
    sourceGraphNodeId,
    targetGraphNodeId,
    properties: {},
  });
  return {
    workspaceId: "sqlite:/tmp/ws",
    nodes: [a, b, outside].map((graphNode) => ({
      node: graphNode,
      anchor: { validFrom: "1600-01-01", validTo: null, precision: "year" },
      layoutOverride: null,
    })),
    relationships: [
      relationship("inside", a.graphNodeId, b.graphNodeId),
      relationship("outside", b.graphNodeId, outside.graphNodeId),
    ],
    encapsulationEdges: [],
  };
}

function harness() {
  const store = new Map<string, unknown>();
  const savePalaceCuration = vi.fn(async ({ profileScope, curation }: {
    profileScope: string;
    curation: unknown;
  }) => {
    store.set(profileScope, curation);
    return { profileScope, curation };
  });
  const transport = {
    loadConstellationDocument: vi.fn(async () => ({
      nodes: [{ id: "canvas:a", graphNodeId: "node:a" }, { id: "canvas:b", graphNodeId: "node:b" }],
    })),
    loadPalaceGraph: vi.fn(async () => graphView()),
    loadPalaceCuration: vi.fn(async ({ profileScope }: { profileScope: string }) => ({
      profileScope,
      curation: store.get(profileScope) ?? null,
    })),
    savePalaceCuration,
  } as unknown as WorkspaceServices;
  return { transport, store, savePalaceCuration };
}

describe("DesktopPalaceRepository", () => {
  test("filters the palace graph to the active constellation and creates a scoped local layout", async () => {
    const { transport, savePalaceCuration } = harness();
    const repository = new DesktopPalaceRepository(
      transport,
      "/tmp/ws.sqlite",
      "sqlite:/tmp/ws",
      "bootstrapping",
    );

    const layout = await repository.getOrCreatePalace("constellation:one");
    const projection = await repository.getProjection("constellation:one");

    expect(projection.nodes.map((item) => item.graphNodeId).sort()).toEqual(["node:a", "node:b"]);
    expect(projection.relationships.map((edge) => edge.id)).toEqual(["inside"]);
    expect(layout.constellationId).toBe("constellation:one");
    expect(layout.rooms.length).toBeGreaterThan(0);
    expect(savePalaceCuration).toHaveBeenCalledWith(expect.objectContaining({
      profileScope: "bootstrapping:palace:constellation%3Aone",
    }));
  });

  test("uses the materialised workspace graph when hosted constellation ids cannot resolve", async () => {
    const { transport } = harness();
    vi.mocked(transport.loadConstellationDocument).mockResolvedValue({
      nodes: [
        { id: "browser:canvas:a" },
        { id: "browser:canvas:b" },
      ],
    } as Awaited<ReturnType<WorkspaceServices["loadConstellationDocument"]>>);
    const repository = new DesktopPalaceRepository(
      transport,
      "/tmp/ws.sqlite",
      "sqlite:/tmp/ws",
      "bootstrapping",
    );

    const projection = await repository.getProjection("constellation:hosted");

    expect(projection.nodes.map((item) => item.graphNodeId).sort()).toEqual([
      "node:a",
      "node:b",
      "node:outside",
    ]);
    expect(projection.relationships.map((edge) => edge.id).sort()).toEqual(["inside", "outside"]);
    expect(projection.layout.rooms.length).toBeGreaterThan(0);
  });

  test("persists an edited layout and reconstructs it from the scoped SQLite row", async () => {
    const { transport } = harness();
    const repository = new DesktopPalaceRepository(
      transport,
      "/tmp/ws.sqlite",
      "sqlite:/tmp/ws",
      "bootstrapping",
    );
    const base = await repository.getOrCreatePalace("constellation:one");
    const manualRoom = {
      id: "manual:room:test",
      graphNodeId: null,
      title: "Manual room",
      position: { x: 10, y: 0, z: 4 },
      size: { width: 6, height: 4, depth: 6 },
      form: "cube",
    };
    const edited: PalaceLayout = { ...base, rooms: [...base.rooms, manualRoom] };

    await repository.updatePalace("constellation:one", edited);
    const reloaded = await repository.getOrCreatePalace("constellation:one");

    expect(reloaded.rooms).toContainEqual(manualRoom);
  });
});

import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type {
  GraphNode,
  GraphRelationship,
  PalaceGraphView,
  TimelineViewNode,
  WorkspaceServices,
} from "@research-canvas/desktop-api";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import type { Scene, SceneSequence } from "@research-canvas/schema";

import { PalaceLensHost } from "./PalaceLensHost";

function graphNode(
  id: string,
  title: string,
  entityType: string,
  over: Partial<GraphNode> = {},
): GraphNode {
  return {
    graphNodeId: id,
    entityType: entityType as GraphNode["entityType"],
    title,
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    ...EMPTY_GRAPH_NODE_METADATA,
    isTemporal: over.isTemporal ?? true,
    validFrom: over.validFrom ?? "1600-01-01",
    validTo: over.validTo ?? null,
    temporalPrecision: over.temporalPrecision ?? "year",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function palaceGraphView(
  over: Partial<PalaceGraphView> = {},
): PalaceGraphView {
  return {
    workspaceId: "sqlite:/tmp/ws",
    relationships: [
      {
        id: "r1",
        relType: "LOCATED_AT",
        sourceGraphNodeId: "council",
        targetGraphNodeId: "florence",
        properties: {},
      },
      {
        id: "r2",
        relType: "INSTANTIATES",
        sourceGraphNodeId: "council",
        targetGraphNodeId: "monopoly",
        properties: {},
      },
    ],
    encapsulationEdges: [],
    nodes: [
      {
        node: graphNode("council", "Council of Florence", "Event", {
          validFrom: "1438-01-01",
          validTo: "1445-12-31",
        }),
        anchor: { validFrom: "1438-01-01", validTo: "1445-12-31", precision: "year" },
        layoutOverride: {
          lane: "events",
          offsetY: 0,
          width: 240,
          height: 72,
          style: {},
          layoutRevision: 1,
        },
      },
      {
        node: graphNode("florence", "Florence", "Place", {
          isTemporal: false,
          validFrom: null,
          validTo: null,
          temporalPrecision: null,
        }),
        anchor: { validFrom: "invalid", validTo: null, precision: "year" },
        layoutOverride: {
          lane: "events",
          offsetY: 0,
          width: 240,
          height: 72,
          style: {},
          layoutRevision: 1,
        },
      },
      {
        node: graphNode("monopoly", "Monopoly mechanism", "Archetype", {
          isTemporal: false,
          validFrom: null,
          validTo: null,
          temporalPrecision: null,
        }),
        anchor: { validFrom: "invalid", validTo: null, precision: "year" },
        layoutOverride: {
          lane: "events",
          offsetY: 0,
          width: 240,
          height: 72,
          style: {},
          layoutRevision: 1,
        },
      },
      {
        node: graphNode("banda", "Banda genocide", "Event", {
          validFrom: "1621-01-01",
          validTo: "1621-12-31",
        }),
        anchor: { validFrom: "1621-01-01", validTo: "1621-12-31", precision: "year" },
        layoutOverride: {
          lane: "events",
          offsetY: 0,
          width: 240,
          height: 72,
          style: {},
          layoutRevision: 1,
        },
      },
    ],
    ...over,
  };
}

/** A full 4+2 constellation container with six member nodes, delivered as
 * real ENCAPSULATES edges through the palace subgraph surface. */
function encapsulatedPalaceGraphView(): PalaceGraphView {
  const container = "constellation-council";
  const memberIds = ["m1", "m2", "m3", "m4", "m5", "m6"];
  const edges: GraphRelationship[] = memberIds.map((memberId) => ({
    id: `enc:${container}:${memberId}`,
    relType: "ENCAPSULATES",
    sourceGraphNodeId: container,
    targetGraphNodeId: memberId,
    properties: { mode: "outgoing" },
  }));
  const base = palaceGraphView();
  const memberNodes: TimelineViewNode[] = memberIds.map((memberId) => ({
    node: graphNode(memberId, `Member ${memberId}`, "Event", {
      validFrom: "1400-01-01",
      validTo: null,
    }),
    anchor: { validFrom: "1400-01-01", validTo: null, precision: "year" },
    layoutOverride: null,
  }));
  return {
    ...base,
    nodes: [
      ...base.nodes,
      {
        node: graphNode(container, "Council constellation", "Constellation", {
          isTemporal: false,
          validFrom: null,
          validTo: null,
          temporalPrecision: null,
        }),
        anchor: { validFrom: "invalid", validTo: null, precision: "year" },
        layoutOverride: null,
      },
      ...memberNodes,
    ],
    encapsulationEdges: edges,
  };
}

function makeTransport(): {
  transport: WorkspaceServices;
  store: { curation: unknown };
  savedScenes: Scene[];
  savedSequences: SceneSequence[];
} {
  const store: { curation: unknown } = { curation: null };
  const savedScenes: Scene[] = [];
  const savedSequences: SceneSequence[] = [];
  const transport = {
    async loadPalaceGraph() {
      return palaceGraphView();
    },
    async loadPalaceCuration() {
      return { profileScope: "bootstrapping", curation: store.curation };
    },
    async savePalaceCuration({ curation }: { curation: unknown }) {
      store.curation = curation;
      return { profileScope: "bootstrapping", curation };
    },
    async upsertScene({ scene }: { scene: Scene }) {
      savedScenes.push(scene);
      return scene;
    },
    async upsertSceneSequence({ sequence }: { sequence: SceneSequence }) {
      savedSequences.push(sequence);
      return sequence;
    },
  } as unknown as WorkspaceServices;
  return { transport, store, savedScenes, savedSequences };
}

describe("PalaceLensHost", () => {
  test("generates the palace from the real graph and persists curation", async () => {
    const { transport } = makeTransport();
    const saveSpy = vi.fn<
      (input: {
        databasePath: string;
        profileScope: string;
        curation: unknown;
      }) => Promise<{ profileScope: string; curation: unknown }>
    >(async () => ({ profileScope: "bootstrapping", curation: null }));
    const hostTransport = {
      ...transport,
      loadPalaceGraph: async () => palaceGraphView(),
      savePalaceCuration: saveSpy,
    } as unknown as WorkspaceServices;

    render(
      <PalaceLensHost
        transport={hostTransport}
        databasePath="/tmp/ws.sqlite"
        workspaceId="sqlite:/tmp/ws"
        profileScope="bootstrapping"
        workingRoot="/tmp/ws"
      />,
    );

    await screen.findByTestId("palace-surface");
    expect(screen.getAllByTestId(/palace-chamber-/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByTestId(/palace-pin-/)[0]);
    await waitFor(() => expect(saveSpy).toHaveBeenCalled());
    const saved = saveSpy.mock.calls[0]?.[0] as {
      curation: { chambers: Array<{ pinned: boolean }> };
    } | undefined;
    expect(saved).toBeTruthy();
    if (!saved) return;
    expect(saved.curation.chambers.some((chamber) => chamber.pinned)).toBe(true);
  });

  test("reads real ENCAPSULATES edges through loadPalaceGraph and shapes a room", async () => {
    const { transport } = makeTransport();
    const loadSpy = vi.fn<typeof transport.loadPalaceGraph>(async () =>
      encapsulatedPalaceGraphView(),
    );
    const hostTransport = {
      ...transport,
      loadPalaceGraph: loadSpy,
    } as unknown as WorkspaceServices;

    render(
      <PalaceLensHost
        transport={hostTransport}
        databasePath="/tmp/ws.sqlite"
        workspaceId="sqlite:/tmp/ws"
        profileScope="bootstrapping"
        workingRoot="/tmp/ws"
      />,
    );

    await screen.findByTestId("palace-surface");
    // The host consumes the palace subgraph surface (not a timeline filter).
    expect(loadSpy).toHaveBeenCalledWith({ workspaceId: "sqlite:/tmp/ws" });
    // The host exposes the real ENCAPSULATES edge count for verification.
    expect(
      screen.getByTestId("palace-host").getAttribute("data-encapsulation-edges"),
    ).toBe("6");
    // The full 4+2 container chamber is shaped as a room.
    await waitFor(() => {
      const chambers = screen
        .getAllByTestId(/palace-chamber-/)
        .map((element) => element.getAttribute("data-form"));
      expect(chambers).toContain("room");
    });
  });

  test("persisting the walk writes scenes and the sequence to the profile store", async () => {
    const { transport, savedScenes, savedSequences } = makeTransport();
    const viewTransport = {
      ...transport,
      loadPalaceGraph: async () => palaceGraphView(),
    } as unknown as WorkspaceServices;
    render(
      <PalaceLensHost
        transport={viewTransport}
        databasePath="/tmp/ws.sqlite"
        workspaceId="sqlite:/tmp/ws"
        profileScope="bootstrapping"
        workingRoot="/tmp/ws"
      />,
    );

    await screen.findByTestId("palace-surface");
    fireEvent.click(screen.getByTestId("palace-persist-walk"));

    await waitFor(() => {
      expect(savedSequences).toHaveLength(1);
    });
    expect(savedScenes.length).toBeGreaterThan(0);
    expect(savedSequences[0].sceneIds).toEqual(
      savedScenes.map((scene) => scene.id),
    );
  });

  test("empty graphs show the empty state instead of failing", async () => {
    const emptyView: PalaceGraphView = {
      workspaceId: "sqlite:/tmp/ws",
      relationships: [],
      encapsulationEdges: [],
      nodes: [],
    };
    const transport = {
      async loadPalaceGraph() {
        return emptyView;
      },
      async loadPalaceCuration() {
        return { profileScope: "bootstrapping", curation: null };
      },
    } as unknown as WorkspaceServices;
    render(
      <PalaceLensHost
        transport={transport}
        databasePath="/tmp/ws.sqlite"
        workspaceId="sqlite:/tmp/ws"
        profileScope="bootstrapping"
        workingRoot="/tmp/ws"
      />,
    );
    expect(await screen.findByTestId("palace-host-empty")).toBeInTheDocument();
  });

  test("export palace bundle writes palace-bundle.json through the transport", async () => {
    const { transport } = makeTransport();
    const writeSpy = vi.fn<typeof transport.writePalaceBundle>(async () => ({
      bundlePath: "palace-bundle.json",
    }));
    const exportTransport = {
      ...transport,
      loadPalaceGraph: async () => palaceGraphView(),
      writePalaceBundle: writeSpy,
    } as unknown as WorkspaceServices;

    render(
      <PalaceLensHost
        transport={exportTransport}
        databasePath="/tmp/ws.sqlite"
        workspaceId="sqlite:/tmp/ws"
        profileScope="bootstrapping"
        workingRoot="/tmp/ws"
      />,
    );

    await screen.findByTestId("palace-surface");
    fireEvent.click(screen.getByTestId("palace-export-bundle"));

    await waitFor(() => expect(writeSpy).toHaveBeenCalled());
    const call = writeSpy.mock.calls[0]?.[0];
    expect(call).toBeTruthy();
    if (!call) return;
    expect(call.outputDir).toBe("/tmp/ws/palace");
    const bundle = JSON.parse(call.bundleJson) as {
      formatVersion: number;
      scene: { rooms: unknown[] };
    };
    expect(bundle.formatVersion).toBe(1);
    expect(Array.isArray(bundle.scene.rooms)).toBe(true);
    expect(await screen.findByTestId("palace-export-state")).toHaveTextContent(
      "Palace bundle written",
    );
  });
});

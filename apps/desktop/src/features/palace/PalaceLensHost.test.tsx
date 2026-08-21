import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { GraphNode, PalaceGraphView, WorkspaceServices } from "@research-canvas/desktop-api";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";

import { PalaceLensHost } from "./PalaceLensHost";

function graphNode(id: string, title: string): GraphNode {
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

function palaceGraphView(): PalaceGraphView {
  const a = graphNode("node:a", "Room anchor A");
  const b = graphNode("node:b", "Room anchor B");
  return {
    workspaceId: "sqlite:/tmp/ws",
    nodes: [a, b].map((node) => ({
      node,
      anchor: { validFrom: "1600-01-01", validTo: null, precision: "year" },
      layoutOverride: null,
    })),
    relationships: [{
      id: "edge:a-b",
      relType: "RELATES_TO",
      sourceGraphNodeId: a.graphNodeId,
      targetGraphNodeId: b.graphNodeId,
      properties: {},
    }],
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
      nodes: [
        { id: "canvas:a", graphNodeId: "node:a" },
        { id: "canvas:b", graphNodeId: "node:b" },
      ],
    })),
    loadPalaceGraph: vi.fn(async () => palaceGraphView()),
    loadPalaceCuration: vi.fn(async ({ profileScope }: { profileScope: string }) => ({
      profileScope,
      curation: store.get(profileScope) ?? null,
    })),
    savePalaceCuration,
    upsertScene: vi.fn(async ({ scene }) => scene),
    upsertSceneSequence: vi.fn(async ({ sequence }) => sequence),
    writePalaceBundle: vi.fn(async () => ({ bundlePath: "palace-bundle.json" })),
  } as unknown as WorkspaceServices;
  return { transport, savePalaceCuration };
}

function renderHost(transport: WorkspaceServices) {
  return render(
    <PalaceLensHost
      transport={transport}
      constellationId="constellation:one"
      databasePath="/tmp/ws.sqlite"
      workspaceId="sqlite:/tmp/ws"
      profileScope="bootstrapping"
      workingRoot="/tmp/ws"
    />,
  );
}

describe("PalaceLensHost", () => {
  test("mounts the mature 3D palace inside the constellation-scoped editor", async () => {
    const { transport, savePalaceCuration } = harness();
    renderHost(transport);

    const host = await screen.findByTestId("palace-host");
    expect(host).toHaveAttribute("data-constellation-id", "constellation:one");
    expect(screen.getByTestId("palace-surface")).toBeInTheDocument();
    expect(screen.getByTestId("palace-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("palace-toolbar")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^palace-room-/).length).toBeGreaterThan(0);
    await waitFor(() => expect(savePalaceCuration).toHaveBeenCalledWith(expect.objectContaining({
      profileScope: "bootstrapping:palace:constellation%3Aone",
    })));
  });

  test("adds a manual room, persists it, and regenerates back to graph-derived layout", async () => {
    const { transport, savePalaceCuration } = harness();
    renderHost(transport);
    await screen.findByTestId("palace-surface");
    const generatedCount = screen.getAllByTestId(/^palace-room-/).length;

    fireEvent.click(screen.getByTestId("palace-add-room"));
    expect(screen.getAllByTestId(/^palace-room-/)).toHaveLength(generatedCount + 1);
    await waitFor(() => expect(savePalaceCuration.mock.calls.length).toBeGreaterThan(1));

    fireEvent.click(screen.getByTestId("palace-generate"));
    await waitFor(() => expect(screen.getAllByTestId(/^palace-room-/)).toHaveLength(generatedCount));
  });
});

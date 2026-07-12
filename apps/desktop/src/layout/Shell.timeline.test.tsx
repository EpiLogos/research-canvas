import { describe, expect, test, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Stub the workspace context so the Shell mounts without a live backend.
// The brief's baseline mock only supplies {selectNode, canvasId, activeConstellationId};
// Shell's descendants (LeftOverlay, CanvasScreen, StatusStrip, FullScreenReader) read
// additional workspace fields on every render, so those are filled in here with
// empty/neutral defaults to let the Shell mount without a live backend.
const selectNode = vi.fn();
const resizeNode = vi.fn();
const updateNodeTimelineCard = vi.fn();
let workspaceId: string | null = "sqlite:/server-canonical/workspace.sqlite";
vi.mock("../features/canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => ({
    selectNode,
    resizeNode,
    updateNodeTimelineCard,
    updateNodeStyle: vi.fn(),
    canvasId: "c1",
    databasePath: "/canonical/workspace.sqlite",
    workspaceId,
    activeConstellationId: "p1",
    activeConstellation: null,
    isHydrated: false,
    errorMessage: null,
    constellations: [],
    resourceRoots: [],
    entries: [],
    selectedEntryId: null,
    selectedEdgeId: null,
    selectedNodeId: null,
    nodes: [{
      id: "root-portal", graphNodeId: "root-portal", type: "portal", title: "QL Portal",
      content: "", tags: [], position: { x: 0, y: 0 }, size: { width: 240, height: 120 },
      style: {}, targetConstellationId: "nested-ql",
    }],
    edges: [],
  }),
}));

const loadTimelineView = vi.fn(async () => ({
  workspaceId: "sqlite:/server-canonical/workspace.sqlite",
  nodes: [{
    node: {
      graphNodeId: "banda", entityType: "Event", title: "Banda genocide", body: "[]", summary: "",
      archetypalResonance: null, coordinate: null, sourceCoordinates: [], isTemporal: true,
      validFrom: "1621-01-01", validTo: null, temporalPrecision: "year",
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    },
    anchor: { validFrom: "1621-01-01", validTo: null, precision: "year" },
    layoutOverride: null,
  }],
  lanes: [], diagnostics: [],
}));
const upsertTimelineLayout = vi.fn(async (input) => ({ status: "created" as const, layout: {
  lane: input.lane, offsetY: input.offsetY, width: input.width, height: input.height,
  style: input.style, layoutRevision: 0,
} }));
vi.mock("@research-canvas/desktop-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@research-canvas/desktop-api")>();
  return {
    ...actual,
    createWorkspaceTransport: () => ({
      loadTimelineView,
      upsertTimelineLayout,
      readLocalNodeDocument: async () => ({
        body: "[]",
        summary: "",
        neo4jSynced: true,
        contentRevision: 1,
        contentOrigin: "seed",
        bodySourceCoordinates: [],
      }),
      archetypalLighting: async () => ({ operator: {}, instances: [] }),
      resonancesForInstance: async () => [],
    }),
  };
});

import { Shell } from "./Shell";

describe("Shell timeline lens", () => {
  beforeEach(() => {
    loadTimelineView.mockClear();
    selectNode.mockClear();
    resizeNode.mockClear();
    updateNodeTimelineCard.mockClear();
    upsertTimelineLayout.mockClear();
    workspaceId = "sqlite:/server-canonical/workspace.sqlite";
  });

  test("switching to the timeline lens renders the timeline and its nodes", async () => {
    render(<Shell />);
    fireEvent.click(screen.getByTestId("lens-timeline"));
    await waitFor(() => {
      expect(screen.getByTestId("timeline-lens")).toBeInTheDocument();
      expect(screen.getByTestId("timeline-node-banda")).toBeInTheDocument();
    });
    expect(loadTimelineView).toHaveBeenCalledWith({ workspaceId: "sqlite:/server-canonical/workspace.sqlite" });
    expect(screen.queryByTestId("timeline-node-root-portal")).not.toBeInTheDocument();
  });

  test("does not load before bootstrap identity and then uses the exact server identity", async () => {
    workspaceId = null;
    const rendered = render(<Shell />);
    fireEvent.click(screen.getByTestId("lens-timeline"));
    expect(screen.getByTestId("timeline-workspace-loading")).toBeInTheDocument();
    expect(loadTimelineView).not.toHaveBeenCalled();

    workspaceId = "sqlite:/private/var/server-canonical.sqlite";
    rendered.rerender(<Shell />);
    await waitFor(() => expect(loadTimelineView).toHaveBeenCalledWith({
      workspaceId: "sqlite:/private/var/server-canonical.sqlite",
    }));
  });

  test("opening a timeline node presents its deep reader even when it is not on the active canvas", async () => {
    render(<Shell />);
    fireEvent.click(screen.getByTestId("lens-timeline"));
    const node = await screen.findByTestId("timeline-node-banda");
    fireEvent.doubleClick(node);
    expect(selectNode).toHaveBeenCalledWith("banda");
    expect(await screen.findByTestId("reading-overlay")).toHaveTextContent("Banda genocide");
    fireEvent.click(screen.getByRole("button", { name: "Close reading" }));
    expect(screen.queryByTestId("reading-overlay")).not.toBeInTheDocument();
  });

  test("timeline card geometry persists through timeline storage and never mutates canvas state", async () => {
    render(<Shell />);
    fireEvent.click(screen.getByTestId("lens-timeline"));
    const handle = await screen.findByTestId("timeline-node-resize-banda-se");

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 124, clientY: 118 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(resizeNode).not.toHaveBeenCalled();
    expect(updateNodeTimelineCard).not.toHaveBeenCalled();
    expect(screen.getByTestId("timeline-node-card-banda")).toHaveStyle({ width: "264px", height: "90px" });
    await waitFor(() => expect(upsertTimelineLayout).toHaveBeenCalledWith(expect.objectContaining({
      graphNodeId: "banda", width: 264, height: 90, expectedRevision: null,
    })));
  });
});

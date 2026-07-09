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
vi.mock("../features/canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => ({
    selectNode,
    resizeNode,
    updateNodeTimelineCard,
    updateNodeStyle: vi.fn(),
    canvasId: "c1",
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
    nodes: [],
    edges: [],
  }),
}));

// Stub the transport so loadCanvasView returns one temporal node.
vi.mock("@research-canvas/desktop-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@research-canvas/desktop-api")>();
  return {
    ...actual,
    createWorkspaceTransport: () => ({
      loadCanvasView: async () => ({
        canvasId: "c1",
        nodes: [
          {
            node: {
              graphNodeId: "banda",
              entityType: "Event",
              title: "Banda genocide",
              body: "[]",
              summary: "",
              archetypalResonance: null,
              coordinate: null,
              sourceCoordinates: [],
              isTemporal: true,
              validFrom: "1621-01-01",
              validTo: null,
              temporalPrecision: "year",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            },
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
      }),
      archetypalLighting: async () => ({ operator: {}, instances: [] }),
      resonancesForInstance: async () => [],
    }),
  };
});

import { Shell } from "./Shell";

describe("Shell timeline lens", () => {
  beforeEach(() => {
    selectNode.mockClear();
    resizeNode.mockClear();
    updateNodeTimelineCard.mockClear();
  });

  test("switching to the timeline lens renders the timeline and its nodes", async () => {
    render(<Shell />);
    fireEvent.click(screen.getByTestId("lens-timeline"));
    await waitFor(() => {
      expect(screen.getByTestId("timeline-lens")).toBeInTheDocument();
      expect(screen.getByTestId("timeline-node-banda")).toBeInTheDocument();
    });
  });

  test("opening a timeline node routes through workspace.selectNode (same document)", async () => {
    render(<Shell />);
    fireEvent.click(screen.getByTestId("lens-timeline"));
    const node = await screen.findByTestId("timeline-node-banda");
    fireEvent.doubleClick(node);
    expect(selectNode).toHaveBeenCalledWith("banda");
  });

  test("timeline card geometry persists as timeline metadata without moving canvas nodes", async () => {
    render(<Shell />);
    fireEvent.click(screen.getByTestId("lens-timeline"));
    const handle = await screen.findByTestId("timeline-node-resize-banda-se");

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 124, clientY: 118 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(resizeNode).not.toHaveBeenCalled();
    expect(updateNodeTimelineCard).toHaveBeenCalledWith("banda", {
      offsetY: 18,
      width: 264,
      height: 90,
    });
  });
});

import { describe, expect, test, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { createTabManagerStore } from "@research-canvas/canvas";
import type { AppTab, SurfaceTabState } from "@research-canvas/schema";

vi.mock("../features/terminal/useTerminal", () => ({
  useTerminal: vi.fn().mockReturnValue({
    terminalContainerRef: { current: null },
    status: "connected",
    session: { id: "session-1", workdir: "/workspace" },
  }),
}));

// Stub the workspace context so the Shell mounts without a live backend.
// The brief's baseline mock only supplies {selectNode, canvasId, activeConstellationId};
// Shell's descendants (LeftOverlay, CanvasScreen, StatusStrip, FullScreenReader) read
// additional workspace fields on every render, so those are filled in here with
// empty/neutral defaults to let the Shell mount without a live backend.
const selectNode = vi.fn();
const resizeNode = vi.fn();
const updateNodeTimelineCard = vi.fn();
const selectProject = vi.fn(async (_projectId: string) => undefined);
const resolveOrCreateHome = vi.fn(async () => ({ homePath: "/home", projects: [] }));
const createProject = vi.fn(async () => ({
  id: "new-project",
  displayName: "New Project",
  slug: "new-project",
  parentConstellationId: null,
  rootPath: "/home/new-project",
  rootType: "directory",
  profileScope: "project:new-project",
  summary: "",
  primaryCanvasId: "canvas-new",
  coverAssetPath: null,
  publishSettings: {},
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
}));

let timelineTransport: Record<string, unknown> = {};
const tabManager = createTabManagerStore({ tabs: [], activeTabId: null });
let workspaceId: string | null = "sqlite:/server-canonical/workspace.sqlite";
vi.mock("../features/canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => {
    const state = tabManager.getState();
    const activeTab = state.getActiveTab();
    return {
      tabManager,
      activeSurfaceId: activeTab?.surfaceId ?? "canvas",
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      activeTab,
      openTab: (tab: AppTab) => tabManager.getState().open(tab),
      activateTab: (tabId: string) => tabManager.getState().activate(tabId),
      closeTab: (tabId: string) => tabManager.getState().close(tabId),
      updateTabState: (state: SurfaceTabState) => {
        const activeId = tabManager.getState().activeTabId;
        if (activeId) tabManager.getState().updateState(activeId, state);
      },
      selectNode,
      resizeNode,
      updateNodeTimelineCard,
      updateNodeStyle: vi.fn(),
      canvasId: "c1",
      databasePath: "/canonical/workspace.sqlite",
      workingRoot: "/canonical",
      repoRoot: "/canonical",
      workspaceId,
      transport: timelineTransport,
      activeConstellationId: "p1",
      activeProjectId: "p1",
      activeProfileScope: "bootstrapping",
      activeConstellation: null,
      isHydrated: false,
      errorMessage: null,
      constellations: [],
      selectProject,
      resolveOrCreateHome,
      createProject,
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
    };
  },
}));

const bandaNode = {
  graphNodeId: "banda", entityType: "Event", title: "Banda genocide",
  body: JSON.stringify([{ type: "image", props: { url: "assets/banda/ship.png" }, content: [], children: [] }]),
  summary: "A documented Company-state violence event.",
  archetypalResonance: null, coordinate: null, sourceCoordinates: ["episodes/2/colonial-power.md#banda"],
  evidenceTags: ["history:documented", "place:banda-islands"], sourceKind: "research",
  contentOrigin: "imported", contentRevision: 1, seedSchemaVersion: 1,
  bodySourceCoordinates: ["episodes/2/colonial-power.md#banda"], historicity: "historical",
  claimKind: "fact", evidenceStatus: "documented", temporalRole: "occurred_at", placeCoverage: "resolved",
  qlForm: null, qlUnitId: null, qlArc: "not_applicable", qlTopology: "unspecified", qlSchemaVersion: null,
  qlSourceCoordinates: [], qlCompletenessStatus: "not_applicable", isTemporal: true,
  validFrom: "1621-01-01", validTo: null, temporalPrecision: "year",
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};
const loadTimelineView = vi.fn(async () => ({
  workspaceId: "sqlite:/server-canonical/workspace.sqlite",
  nodes: [{
    node: bandaNode,
    anchor: { validFrom: "1621-01-01", validTo: null, precision: "year" },
    layoutOverride: null,
  }],
  relationships: [],
  lanes: [], diagnostics: [],
}));
const upsertTimelineLayout = vi.fn(async (input) => ({ status: "created" as const, layout: {
  lane: input.lane, offsetY: input.offsetY, width: input.width, height: input.height,
  style: input.style, layoutRevision: 0,
} }));
timelineTransport = {
  loadConstellationDocument: async ({ databasePath }: { databasePath: string }) => ({
    databasePath,
    nodes: [{ id: "banda", graphNodeId: "banda" }],
  }),
  loadTimelineView,
  upsertTimelineLayout,
  readGraphNode: async () => bandaNode,
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
};
vi.mock("@research-canvas/desktop-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@research-canvas/desktop-api")>();
  return {
    ...actual,
    createWorkspaceServices: () => timelineTransport,
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
    expect(loadTimelineView).toHaveBeenCalledWith({
      workspaceId: "sqlite:/server-canonical/workspace.sqlite",
      range: { startYear: -20000, endYear: 20000 },
    });
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
    await waitFor(() => expect(loadTimelineView).toHaveBeenCalled());
    expect(loadTimelineView.mock.calls.length).toBeGreaterThan(0);
    expect(loadTimelineView.mock.calls.every(([input]) =>
      input.workspaceId === "sqlite:/private/var/server-canonical.sqlite"
    )).toBe(true);
  });

  test("opening a timeline node presents its deep reader even when it is not on the active canvas", async () => {
    render(<Shell />);
    fireEvent.click(screen.getByTestId("lens-timeline"));
    const node = await screen.findByTestId("timeline-node-banda");
    fireEvent.doubleClick(node);
    expect(selectNode).toHaveBeenCalledWith("banda");
    expect(await screen.findByTestId("reading-pane")).toHaveTextContent("Banda genocide");
    expect(screen.getByTestId("reader-cover")).toHaveAttribute(
      "src",
      "asset://localhost/%2Fcanonical%2Fassets%2Fbanda%2Fship.png",
    );
    expect(screen.getByTestId("reading-pane")).toHaveTextContent("A documented Company-state violence event.");
    fireEvent.click(screen.getByRole("button", { name: "Back to canvas" }));
    expect(screen.queryByTestId("reading-pane")).not.toBeInTheDocument();
  });

  test("takes the same timeline reader record into full-screen reading", async () => {
    render(<Shell />);
    fireEvent.click(screen.getByTestId("lens-timeline"));
    fireEvent.doubleClick(await screen.findByTestId("timeline-node-banda"));
    fireEvent.click(screen.getByRole("button", { name: "Read full screen" }));

    const fullScreenReader = await screen.findByTestId("reading-fullscreen");
    expect(fullScreenReader).toHaveTextContent("Banda genocide");
    expect(within(fullScreenReader).getByTestId("reader-cover")).toHaveAttribute(
      "src",
      "asset://localhost/%2Fcanonical%2Fassets%2Fbanda%2Fship.png",
    );
  });

  test("timeline card geometry persists through timeline storage and never mutates canvas state", async () => {
    render(<Shell />);
    fireEvent.click(screen.getByTestId("lens-timeline"));
    const handle = await screen.findByTestId("timeline-node-resize-banda-se");

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 124, clientY: 118 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(resizeNode).not.toHaveBeenCalled();
    expect(updateNodeTimelineCard).not.toHaveBeenCalled();
    expect(screen.getByTestId("timeline-node-card-banda")).toHaveStyle({ width: "264px", height: "90px" });
    await waitFor(() => expect(upsertTimelineLayout).toHaveBeenCalledWith(expect.objectContaining({
      graphNodeId: "banda", width: 264, height: 90, expectedRevision: null,
    })));
  });
});

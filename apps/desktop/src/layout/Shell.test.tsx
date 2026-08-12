import type { ComponentProps, ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { useStore } from "zustand";

import { createAnnotationStore, createCanvasStore, createTabManagerStore } from "@research-canvas/canvas";
import type { AppTab, CanvasNode, SurfaceTabState } from "@research-canvas/schema";

import { CanvasWorkspaceContext, CanvasWorkspaceProvider } from "../features/canvas/CanvasWorkspaceContext";

const projectSpies = vi.hoisted(() => ({
  selectProject: vi.fn(),
  resolveOrCreateHome: vi.fn(),
}));

vi.mock("@research-canvas/desktop-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@research-canvas/desktop-api")>();
  return {
    ...actual,
    createWorkspaceServices: () => ({
      ...actual.createWorkspaceServices(),
      bootstrapWorkspace: async () => ({
        activeConstellationId: "root",
        activeProjectId: "root",
        activeProfileScope: "bootstrapping",
        databasePath: "/tmp/workspace.sqlite",
        workspaceId: "sqlite:/tmp/workspace.sqlite",
        workspaceRoot: "/workspace",
        constellations: [
          {
            id: "root",
            name: "Root Archetypal Field",
            slug: "root-archetypal-field",
            rootPath: "/workspace",
            rootType: "directory",
            profileScope: "bootstrapping",
            summary: "",
            parentId: null,
            children: [],
          },
        ],
      }),
      resolveOrCreateHome: projectSpies.resolveOrCreateHome.mockResolvedValue({
        homePath: "/home",
        projects: [
          {
            id: "proj-a",
            name: "Project A",
            slug: "project-a",
            rootPath: "/home/project-a",
            rootType: "directory",
            profileScope: "project:project-a",
            summary: "",
            parentId: null,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
          {
            id: "proj-b",
            name: "Project B",
            slug: "project-b",
            rootPath: "/home/project-b",
            rootType: "directory",
            profileScope: "project:project-b",
            summary: "",
            parentId: null,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ],
      }),
      selectProject: projectSpies.selectProject.mockImplementation(
        async ({ projectId }: { projectId: string }) => ({
          projectId,
          profileScope: `project:${projectId}`,
          rootType: "directory",
        }),
      ),
      loadConstellationDocument: async ({ databasePath, constellationId }: { databasePath: string; constellationId: string }) => ({
        canvasId: "c1",
        databasePath,
        entries: [],
        resourceRoots: [],
        annotations: [],
        edges: [],
        nodes: [],
        workingRoot: "/workspace",
        constellation: {
          id: constellationId,
          displayName: "Root Archetypal Field",
          slug: constellationId,
          parentConstellationId: null,
          rootPath: "/workspace",
          rootType: "directory",
          profileScope: "bootstrapping",
          primaryCanvasId: "c1",
          summary: "",
          coverAssetPath: null,
          publishSettings: {},
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      }),
      loadCanvasView: async () => ({
        canvasId: "c1",
        nodes: [
          {
            node: {
              graphNodeId: "node-a",
              entityType: "Event",
              title: "Node A",
              body: "[]",
              summary: "A temporal node.",
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
              graphNodeId: "node-a",
              canvasId: "c1",
              positionX: 0,
              positionY: 0,
              width: 280,
              height: 92,
              style: {},
            },
          },
        ],
        edges: [],
        relationships: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        appState: {},
      }),
      loadTimelineView: async () => ({
        workspaceId: "sqlite:/canonical/workspace.sqlite",
        nodes: [
          {
            node: {
              graphNodeId: "node-a",
              entityType: "Event",
              title: "Node A",
              body: "[]",
              summary: "A temporal node.",
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
            anchor: { validFrom: "1621-01-01", validTo: null, precision: "year" },
            layoutOverride: null,
          },
        ],
        lanes: [],
        diagnostics: [],
      }),
      archetypalLighting: async () => ({ operator: {}, instances: [] }),
      resonancesForInstance: async () => [],
    }),
  };
});

import { Shell } from "./Shell";

function renderShell(initialEntries?: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          path="/project/:projectId/surface/:surfaceId/constellation/:constellationId/:detailId?"
          element={
            <CanvasWorkspaceProvider>
              <Shell />
            </CanvasWorkspaceProvider>
          }
        />
        <Route
          path="*"
          element={
            <CanvasWorkspaceProvider>
              <Shell />
            </CanvasWorkspaceProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const CANVAS_ID = "22222222-2222-4222-8222-222222222222";

function seededNode(id: string, title: string): CanvasNode {
  return {
    id,
    graphNodeId: id,
    canvasId: CANVAS_ID,
    title,
    position: { x: 0, y: 0 },
    size: { width: 160, height: 80 },
    summary: "",
    sequenceCaption: null,
    sequenceViewport: null,
    type: "note",
    content: "",
    tags: [],
    createdAt: "2026-06-28T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
  } as CanvasNode;
}

function seededResourceNode(id: string, title: string): CanvasNode {
  return {
    id,
    graphNodeId: id,
    canvasId: CANVAS_ID,
    title,
    position: { x: 0, y: 0 },
    size: { width: 160, height: 80 },
    summary: "",
    sequenceCaption: null,
    sequenceViewport: null,
    type: "resource",
    resourceKind: "markdown",
    absolutePath: "/tmp/fake.md",
    relativePath: "fake.md",
    mimeType: "text/markdown",
    fileFingerprint: "fp",
    createdAt: "2026-06-28T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
  } as CanvasNode;
}

function seededPortalNode(id: string, title: string, targetCanvasId: string): CanvasNode {
  return {
    id,
    graphNodeId: id,
    canvasId: CANVAS_ID,
    title,
    position: { x: 0, y: 0 },
    size: { width: 180, height: 96 },
    summary: "Nested constellation",
    sequenceCaption: null,
    sequenceViewport: null,
    type: "portal",
    targetCanvasId,
    constellationKind: "ql-unit",
    createdAt: "2026-06-28T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
  } as CanvasNode;
}

function FakeWorkspaceProvider({
  children,
  nodes,
  canvases = {},
}: {
  children: ReactNode;
  nodes: CanvasNode[];
  canvases?: Record<string, CanvasNode[]>;
}) {
  const store = useMemo(() => {
    const s = createCanvasStore({ canvasId: CANVAS_ID });
    s.getState().hydrate({ nodes, edges: [] });
    return s;
  }, [nodes]);
  const annotationStore = useMemo(() => createAnnotationStore({ canvasId: CANVAS_ID }), []);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const selectNode = useCallback((nodeId: string | null) => setSelectedNodeId(nodeId), []);
  const openCanvas = useCallback(
    async (canvasId: string) => {
      const nextNodes = canvases[canvasId] ?? [];
      store.getState().hydrate({ nodes: nextNodes, edges: [] });
      setSelectedNodeId(nextNodes[0]?.id ?? null);
    },
    [canvases, store],
  );

  const tabManager = useMemo(() => createTabManagerStore({ tabs: [], activeTabId: null }), []);
  const tabs = useStore(tabManager, (state) => state.tabs);
  const activeTabId = useStore(tabManager, (state) => state.activeTabId);
  const activeTab = activeTabId ? tabs.find((tab) => tab.id === activeTabId) ?? null : null;

  const value = useMemo(
    () => ({
      store,
      annotationStore,
      isHydrated: true,
      errorMessage: null,
      canvasId: CANVAS_ID,
      workspaceId: "sqlite:/canonical/workspace.sqlite",
      tabManager,
      activeSurfaceId: activeTab?.surfaceId ?? "canvas",
      tabs,
      activeTabId,
      activeTab,
      openTab: (tab: AppTab) => tabManager.getState().open(tab),
      activateTab: (tabId: string) => tabManager.getState().activate(tabId),
      closeTab: (tabId: string) => tabManager.getState().close(tabId),
      updateTabState: (state: SurfaceTabState) => {
        if (activeTabId) {
          tabManager.getState().updateState(activeTabId, state);
        }
      },
      canvasTabs: [],
      activeCanvasTabId: null,
      activeCanvasViewport: null,
      constellationId: "11111111-1111-4111-8111-111111111111",
      databasePath: "/canonical/workspace.sqlite",
      activeConstellation: null,
      activeConstellationId: "11111111-1111-4111-8111-111111111111",
      activeProjectId: "11111111-1111-4111-8111-111111111111",
      activeProfileScope: "bootstrapping",
      selectProject: vi.fn().mockResolvedValue(undefined),
      resolveOrCreateHome: vi.fn().mockResolvedValue({ homePath: "/home", projects: [] }),
      createProject: vi.fn(),
      constellations: [],
      entries: [],
      resourceRoots: [],
      workingRoot: null,
      selectedEntryId,
      selectedEdgeId,
      selectedNodeId,
      selectNode,
      selectEdge: setSelectedEdgeId,
      selectEntry: setSelectedEntryId,
      selectConstellation: vi.fn(),
      openCanvas,
      addEdge: vi.fn(),
      createNoteNode: vi.fn().mockResolvedValue(undefined),
      createGroupNode: vi.fn().mockResolvedValue(undefined),
      addResourceNode: vi.fn().mockResolvedValue(undefined),
      addResourceNodeFromAbsolutePath: vi.fn().mockResolvedValue(undefined),
      deleteEdge: vi.fn(),
      deleteNode: vi.fn(),
      duplicateNode: vi.fn().mockResolvedValue(undefined),
      attachResourceRoot: vi.fn().mockResolvedValue(undefined),
      detachResourceRoot: vi.fn().mockResolvedValue(undefined),
      listDirectories: vi.fn().mockResolvedValue([]),
      searchConstellation: vi.fn().mockResolvedValue([]),
      listSavedSequences: vi.fn().mockResolvedValue([]),
      createSavedSequence: vi.fn(),
      updateSavedSequence: vi.fn(),
      deleteSavedSequence: vi.fn().mockResolvedValue(undefined),
      resizeNode: vi.fn(),
      updateNodeContent: vi.fn(),
      setNodeThumbnailFromAbsolutePath: vi.fn().mockResolvedValue(undefined),
      updateNodeStyle: vi.fn(),
      updateNodeTags: vi.fn(),
      updateNodeTimelineCard: vi.fn(),
      flyToNode: vi.fn(),
      flyToEdge: vi.fn(),
      registerFlyToNode: vi.fn(),
      registerFlyToEdge: vi.fn(),
      captureViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      registerCaptureViewport: vi.fn(),
      transport: {},
      contentLinkingActions: {},
    }) as unknown as ComponentProps<typeof CanvasWorkspaceContext.Provider>["value"],
    [store, annotationStore, selectedEntryId, selectedEdgeId, selectedNodeId, selectNode, openCanvas, tabManager, tabs, activeTabId, activeTab],
  );

  return <CanvasWorkspaceContext.Provider value={value}>{children}</CanvasWorkspaceContext.Provider>;
}

function renderShellWithNode(node: CanvasNode, initialEntries?: string[]) {
  return renderShellWithNodes([node], {}, initialEntries);
}

function renderShellWithNodes(
  nodes: CanvasNode[],
  canvases?: Record<string, CanvasNode[]>,
  initialEntries?: string[],
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <FakeWorkspaceProvider nodes={nodes} canvases={canvases}>
        <Shell />
      </FakeWorkspaceProvider>
    </MemoryRouter>,
  );
}

describe("Shell frame", () => {
  it("renders the new persistent shell frame (top bar, sidebar, stage, inspector, status)", () => {
    renderShell();
    expect(screen.getByTestId("shell-top-bar")).toBeVisible();
    expect(screen.getByTestId("shell-left-sidebar")).toBeVisible();
    expect(screen.getByTestId("shell-stage")).toBeVisible();
    expect(screen.getByTestId("status-strip")).toBeVisible();
  });

  it("summoned panels are closed by default", () => {
    renderShell();
    expect(screen.queryByTestId("bottom-dock")).not.toBeInTheDocument();
    expect(screen.queryByTestId("shell-right-inspector")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reader-pane")).not.toBeInTheDocument();
    expect(screen.getByTestId("left-overlay")).toHaveAttribute("data-open", "false");
    expect(screen.getByTestId("left-overlay")).toHaveAttribute("aria-hidden", "true");
  });

  it("summons the terminal dock via the rail Terminal verb", () => {
    renderShell();
    fireEvent.click(within(screen.getByTestId("left-rail")).getByRole("button", { name: "Terminal" }));
    expect(screen.getByTestId("bottom-dock")).toBeVisible();
  });

  it("switches the stage surface when a lens is chosen", async () => {
    renderShellWithNodes([]);
    fireEvent.click(screen.getByTestId("lens-timeline"));
    expect(screen.getByTestId("timeline-pane")).toBeVisible();
    await screen.findByTestId("timeline-node-node-a");
  });

  it("opens timeline node reading as an inline panel while keeping the timeline context mounted", async () => {
    const nodeA = seededResourceNode("node-a", "Node A");
    renderShellWithNode(nodeA);

    fireEvent.click(screen.getByTestId("lens-timeline"));
    const timelineNode = await screen.findByTestId("timeline-node-node-a");
    fireEvent.doubleClick(timelineNode);

    expect(screen.getByTestId("timeline-pane")).toBeVisible();
    expect(screen.getByTestId("reader-pane")).toBeVisible();
  });

  it("keeps the sidebar reachable while the inline reader is open", () => {
    const nodeA = seededResourceNode("node-a", "Node A");
    renderShellWithNode(nodeA);

    fireEvent.doubleClick(document.querySelector('.react-flow__node[data-id="node-a"]') as HTMLElement);
    expect(screen.getByTestId("reader-pane")).toBeVisible();
    expect(screen.getByTestId("shell-left-sidebar")).toBeVisible();
  });

  it("closes the inline reader panel back to the canvas context", async () => {
    const nodeA = seededResourceNode("node-a", "Node A");
    renderShellWithNode(nodeA);

    const canvasNode = await waitFor(() => {
      const el = document.querySelector('.react-flow__node[data-id="node-a"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.doubleClick(canvasNode);
    expect(screen.getByTestId("reader-pane")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Back to canvas" }));
    expect(screen.getByTestId("canvas-pane")).toBeVisible();
    expect(screen.queryByTestId("reader-pane")).not.toBeInTheDocument();
  });

  it("opens the inline reader panel from a note node double-click", async () => {
    const nodeA = seededNode("node-a", "Node A");
    renderShellWithNode(nodeA);

    const canvasNode = await waitFor(() => {
      const el = document.querySelector('.react-flow__node[data-id="node-a"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.doubleClick(canvasNode);

    expect(screen.getByTestId("reader-pane")).toBeVisible();
  });

  it("opens a portal's target canvas on double-click instead of opening the reader panel", async () => {
    const targetCanvasId = "33333333-3333-4333-8333-333333333333";
    const portal = seededPortalNode("portal-a", "Devil Sixfold", targetCanvasId);
    const childNode = {
      ...seededNode("child-a", "Nested Child"),
      canvasId: targetCanvasId,
    } as CanvasNode;
    renderShellWithNodes([portal], { [targetCanvasId]: [childNode] });

    const portalNode = await waitFor(() => {
      const el = document.querySelector('.react-flow__node[data-id="portal-a"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.doubleClick(portalNode);

    await waitFor(() => {
      expect(document.querySelector('.react-flow__node[data-id="child-a"]')).not.toBeNull();
    });
    expect(screen.queryByTestId("reader-pane")).not.toBeInTheDocument();
  });

  it("returns to the canvas when closing the full-screen node reader", async () => {
    const nodeA = seededResourceNode("node-a", "Node A");
    renderShellWithNode(nodeA);

    const canvasNode = await waitFor(() => {
      const el = document.querySelector('.react-flow__node[data-id="node-a"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.doubleClick(canvasNode);
    expect(screen.getByTestId("reader-pane")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Read full screen" }));
    const backButton = screen.getByRole("button", { name: "Close reading" });
    expect(backButton).toBeVisible();

    fireEvent.click(backButton);
    expect(screen.getByTestId("canvas-pane")).toBeVisible();
    expect(screen.queryByTestId("reader-pane")).not.toBeInTheDocument();
  });

  it("opens the command palette from the top bar and via Cmd+K", () => {
    renderShell();
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Command palette"));
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  });

  it("route change selects the project and activates the matching surface tab", async () => {
    renderShell(["/project/proj-a/surface/timeline/constellation/root"]);
    await waitFor(() => {
      expect(screen.getByTestId("timeline-pane")).toBeVisible();
    });
    expect(projectSpies.selectProject).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj-a" }),
    );
  });

  it("Files rail verb reopens the Files view after Annotate was active", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Annotations" }));
    expect(screen.getByTestId("left-overlay")).toBeVisible();
    expect(screen.queryByTestId("browser-files")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Files & Constellation" }));
    expect(screen.getByTestId("left-overlay")).toBeVisible();
    expect(screen.getByTestId("browser-files")).toBeInTheDocument();
  });

  it("closing the browser with Escape resets drawingMode", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Annotations" }));
    fireEvent.click(screen.getByRole("button", { name: "Start drawing" }));
    expect(screen.getByRole("button", { name: "Stop drawing" })).toHaveAttribute("data-active", "true");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("left-overlay")).toHaveAttribute("data-open", "false");

    fireEvent.click(screen.getByRole("button", { name: "Annotations" }));
    expect(screen.getByRole("button", { name: "Start drawing" })).toBeInTheDocument();
  });

  it("re-clicking the active rail verb toggles the browser closed", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Files & Constellation" }));
    expect(screen.getByTestId("left-overlay")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Files & Constellation" }));
    expect(screen.getByTestId("left-overlay")).toHaveAttribute("data-open", "false");
  });

  it("collapses the sidebar without losing its local browser filter", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Files & Constellation" }));
    fireEvent.change(screen.getByTestId("browser-filter"), { target: { value: "prometheus" } });
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.getByTestId("left-overlay")).toHaveAttribute("data-open", "false");

    fireEvent.click(screen.getByRole("button", { name: "Files & Constellation" }));
    expect(screen.getByTestId("browser-filter")).toHaveValue("prometheus");
  });

  it("selecting a node opens the right inspector, and an explicit close persists across selections", async () => {
    const nodeA = seededNode("node-a", "Node A");
    renderShellWithNode(nodeA);

    const canvasNode = await waitFor(() => {
      const el = document.querySelector('.react-flow__node[data-id="node-a"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.click(canvasNode);

    expect(await screen.findByTestId("shell-right-inspector")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));
    expect(screen.queryByTestId("shell-right-inspector")).not.toBeInTheDocument();

    fireEvent.click(canvasNode);
    expect(screen.queryByTestId("shell-right-inspector")).not.toBeInTheDocument();
  });

  it("hides the right inspector while the inline reader is open, and restores it after closing", async () => {
    const nodeA = seededNode("node-a", "Node A");
    renderShellWithNode(nodeA);

    const canvasNode = await waitFor(() => {
      const el = document.querySelector('.react-flow__node[data-id="node-a"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.click(canvasNode);
    expect(await screen.findByTestId("shell-right-inspector")).toBeVisible();

    fireEvent.doubleClick(canvasNode);
    expect(screen.getByTestId("reader-pane")).toBeVisible();
    expect(screen.queryByTestId("shell-right-inspector")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to canvas" }));
    expect(screen.getByTestId("shell-right-inspector")).toBeVisible();
  });

  it("mounts the projects layer in the left rail and lists home projects in the picker", async () => {
    renderShell();
    const trigger = await screen.findByTestId("projects-trigger");
    fireEvent.click(trigger);
    const picker = await screen.findByTestId("projects-layer");
    expect(picker).toBeInTheDocument();
    expect(await screen.findByTestId("project-row-proj-a")).toHaveTextContent("Project A");
    expect(screen.getByTestId("project-row-proj-b")).toHaveTextContent("Project B");
  });

  it("selecting a project from the picker routes through the real transport seam", async () => {
    renderShell();
    const trigger = await screen.findByTestId("projects-trigger");
    fireEvent.click(trigger);
    const picker = await screen.findByTestId("projects-layer");
    expect(picker).toBeInTheDocument();
    fireEvent.click(await screen.findByTestId("project-row-proj-a"));
    expect(projectSpies.selectProject).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj-a" }),
    );
  });

  it("resizes the left sidebar by dragging the overlay resize handle", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Files & Constellation" }));
    const shell = screen.getByTestId("shell-left-sidebar").closest(".ishell") as HTMLElement;
    const before = shell.style.getPropertyValue("--shell-left-sidebar-width");
    expect(before).toBe("280px");

    const resizeHandle = screen.getByTitle("Drag to resize");
    fireEvent.pointerDown(resizeHandle, { clientX: 280 });
    fireEvent.pointerMove(window, { clientX: 340 });
    fireEvent.pointerUp(window);

    const after = shell.style.getPropertyValue("--shell-left-sidebar-width");
    expect(after).toBe("340px");
  });
});

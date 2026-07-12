import type { ComponentProps, ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { createAnnotationStore, createCanvasStore } from "@research-canvas/canvas";
import type { CanvasNode } from "@research-canvas/schema";

import { CanvasWorkspaceContext, CanvasWorkspaceProvider } from "../features/canvas/CanvasWorkspaceContext";

// Stub the timeline-relevant transport methods so the timeline lens's real
// createTimelineDataSource (wired in Shell.tsx) never reaches the Tauri
// bridge. Without this, the "switches the stage surface when a lens is
// chosen" test below clicks into the timeline lens in jsdom, which triggers
// a real loadCanvasView() call that rejects with a 404 (no bridge present)
// — an unhandled rejection that vitest reports once the file has more async
// tests after it. Mirrors the existing mock in Shell.timeline.test.tsx, but
// wraps the real transport (rather than replacing it outright) so the other
// tests in this file — which render via CanvasWorkspaceProvider and rely on
// its real bootstrapWorkspace()/other transport methods — are unaffected.
vi.mock("@research-canvas/desktop-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@research-canvas/desktop-api")>();
  return {
    ...actual,
    createWorkspaceTransport: () => ({
      ...actual.createWorkspaceTransport(),
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

function renderShell() {
  return render(
    <MemoryRouter>
      <CanvasWorkspaceProvider>
        <Shell />
      </CanvasWorkspaceProvider>
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

// A REAL workspace context value — real canvasStore/annotationStore (so
// nodes/edges/annotations are reactive via useStore, exactly as in
// production) and real selection state, wired through selectNode exactly
// like CanvasWorkspaceProvider does. Only the transport-backed bootstrap
// side (constellations/files/resources) is stubbed, since it depends on Tauri
// IPC that isn't present in jsdom. This lets Shell-level tests exercise the
// real node-selection path (CanvasView's onNodeClick -> workspace.selectNode)
// without needing the full bootstrapping provider to hydrate over IPC.
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

  const value = useMemo(
    () => ({
      store,
      annotationStore,
      isHydrated: true,
      errorMessage: null,
      canvasId: CANVAS_ID,
      workspaceId: "sqlite:/canonical/workspace.sqlite",
      constellationId: "11111111-1111-4111-8111-111111111111",
      databasePath: "/canonical/workspace.sqlite",
      activeConstellation: null,
      activeConstellationId: null,
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
    [store, annotationStore, selectedEntryId, selectedEdgeId, selectedNodeId, selectNode, openCanvas],
  );

  return <CanvasWorkspaceContext.Provider value={value}>{children}</CanvasWorkspaceContext.Provider>;
}

function renderShellWithNode(node: CanvasNode) {
  return renderShellWithNodes([node]);
}

function renderShellWithNodes(nodes: CanvasNode[], canvases?: Record<string, CanvasNode[]>) {
  return render(
    <MemoryRouter>
      <FakeWorkspaceProvider nodes={nodes} canvases={canvases}>
        <Shell />
      </FakeWorkspaceProvider>
    </MemoryRouter>,
  );
}

describe("Shell frame", () => {
  it("renders the persistent chrome and the canvas stage by default", () => {
    renderShell();
    expect(screen.getByTestId("transport-bar")).toBeVisible();
    expect(screen.getByTestId("left-rail")).toBeVisible();
    expect(screen.getByTestId("status-strip")).toBeVisible();
    expect(screen.getByTestId("canvas-pane")).toBeVisible();
  });

  it("summoned panels are closed by default", () => {
    renderShell();
    expect(screen.queryByTestId("bottom-dock")).not.toBeInTheDocument();
    expect(screen.queryByTestId("inspector-overlay")).not.toBeInTheDocument();
    expect(screen.getByTestId("left-overlay")).toHaveAttribute("data-open", "false");
    expect(screen.getByTestId("left-overlay")).toHaveAttribute("aria-hidden", "true");
  });

  it("summons the terminal dock via the rail Terminal verb", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));
    expect(screen.getByTestId("bottom-dock")).toBeVisible();
  });

  it("switches the stage surface when a lens is chosen", async () => {
    renderShellWithNodes([]);
    expect(screen.queryByTestId("lens-reading")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("lens-timeline"));
    expect(screen.getByTestId("timeline-pane")).toBeVisible();
    await screen.findByTestId("timeline-node-node-a");
    fireEvent.keyDown(window, { key: "3", metaKey: true });
    expect(screen.getByTestId("reading-overlay")).toBeVisible();
  });

  it("opens timeline node reading as an overlay while keeping the timeline context mounted", async () => {
    const nodeA = seededResourceNode("node-a", "Node A");
    renderShellWithNode(nodeA);

    fireEvent.click(screen.getByTestId("lens-timeline"));
    const timelineNode = await screen.findByTestId("timeline-node-node-a");
    fireEvent.doubleClick(timelineNode);

    expect(screen.getByTestId("timeline-pane")).toBeVisible();
    expect(screen.getByTestId("reading-overlay")).toBeVisible();
    expect(screen.queryByTestId("reading-pane")).not.toBeInTheDocument();
  });

  it("keeps the rail reachable while in the reading lens (panels must stay reachable while reading)", () => {
    renderShell();
    expect(screen.getByTestId("left-rail")).toBeVisible();
    fireEvent.keyDown(window, { key: "3", metaKey: true });
    expect(screen.getByTestId("reading-overlay")).toBeVisible();
    expect(screen.getByTestId("left-rail")).toBeVisible();
  });

  it("closes the reading overlay back to the canvas context", async () => {
    const nodeA = seededResourceNode("node-a", "Node A");
    renderShellWithNode(nodeA);

    const canvasNode = await waitFor(() => {
      const el = document.querySelector('.react-flow__node[data-id="node-a"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.doubleClick(canvasNode);
    expect(screen.getByTestId("reading-overlay")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Close reading" }));
    expect(screen.getByTestId("canvas-pane")).toBeVisible();
    expect(screen.queryByTestId("reading-overlay")).not.toBeInTheDocument();
  });

  it("opens the reading overlay from a note node double-click", async () => {
    const nodeA = seededNode("node-a", "Node A");
    renderShellWithNode(nodeA);

    const canvasNode = await waitFor(() => {
      const el = document.querySelector('.react-flow__node[data-id="node-a"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.doubleClick(canvasNode);

    expect(screen.getByTestId("reading-overlay")).toBeVisible();
  });

  it("opens a portal's target canvas on double-click instead of opening the reading overlay", async () => {
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
    expect(screen.queryByTestId("reading-overlay")).not.toBeInTheDocument();
  });

  it("returns to the canvas when closing the full-screen node reader (not back into the reading overlay)", async () => {
    const nodeA = seededResourceNode("node-a", "Node A");
    renderShellWithNode(nodeA);

    const canvasNode = await waitFor(() => {
      const el = document.querySelector('.react-flow__node[data-id="node-a"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.doubleClick(canvasNode);
    expect(screen.getByTestId("reading-overlay")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Read full screen" }));
    const backButton = screen.getByRole("button", { name: /^← Back$/ });
    expect(backButton).toBeVisible();

    fireEvent.click(backButton);
    expect(screen.getByTestId("canvas-pane")).toBeVisible();
    expect(screen.queryByTestId("reading-overlay")).not.toBeInTheDocument();
  });

  it("opens the command palette on Cmd+K", () => {
    renderShell();
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  });

  it("Files rail verb reopens the Files view after Annotate was active (leftMode isn't stranded on annotations)", () => {
    renderShell();
    // Open the browser in annotations mode via the rail Annotate verb.
    fireEvent.click(screen.getByRole("button", { name: "Annotations" }));
    expect(screen.getByTestId("left-overlay")).toBeVisible();
    expect(screen.queryByTestId("browser-files")).not.toBeInTheDocument();

    // Clicking the Files rail verb must always show the Files view — never
    // leave the browser stranded on the Annotations panel.
    fireEvent.click(screen.getByRole("button", { name: "Files & Constellation" }));
    expect(screen.getByTestId("left-overlay")).toBeVisible();
    expect(screen.getByTestId("browser-files")).toBeInTheDocument();
  });

  it("closing the browser via the panel's close button resets drawingMode (no stuck draw cursor)", () => {
    renderShell();
    // Open the browser in annotations mode and start drawing.
    fireEvent.click(screen.getByRole("button", { name: "Annotations" }));
    fireEvent.click(screen.getByRole("button", { name: "Start drawing" }));
    expect(screen.getByRole("button", { name: "Stop drawing" })).toHaveAttribute("data-active", "true");

    // Close the panel via its close button — this must also turn drawing off.
    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(screen.getByTestId("left-overlay")).toHaveAttribute("data-open", "false");

    // Reopen annotations — drawing must not still be "on" from before.
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
    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));

    expect(screen.getByTestId("left-overlay")).toHaveAttribute("data-open", "false");

    fireEvent.click(screen.getByRole("button", { name: "Files & Constellation" }));
    expect(screen.getByTestId("browser-filter")).toHaveValue("prometheus");
  });

  it("selecting a node opens the inspector, and it stays closed after an explicit close even after selecting another node", async () => {
    const nodeA = seededNode("node-a", "Node A");
    renderShellWithNode(nodeA);

    const canvasNode = await waitFor(() => {
      const el = document.querySelector('.react-flow__node[data-id="node-a"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.click(canvasNode);

    expect(await screen.findByTestId("inspector-overlay")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));
    expect(screen.queryByTestId("inspector-overlay")).not.toBeInTheDocument();

    // Selecting again (same node, since only one is seeded) must NOT reopen
    // the inspector once the user has explicitly dismissed it.
    fireEvent.click(canvasNode);
    expect(screen.queryByTestId("inspector-overlay")).not.toBeInTheDocument();
  });

  it("hides the inspector overlay in the reading lens so it never covers the reading controls, and restores it back in the canvas lens", async () => {
    const nodeA = seededNode("node-a", "Node A");
    renderShellWithNode(nodeA);

    const canvasNode = await waitFor(() => {
      const el = document.querySelector('.react-flow__node[data-id="node-a"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.click(canvasNode);
    expect(await screen.findByTestId("inspector-overlay")).toBeVisible();

    // Opening the reading overlay must gate the inspector out entirely —
    // it is a canvas/graph affordance and must never float over the
    // modal reading surface's controls.
    fireEvent.keyDown(window, { key: "3", metaKey: true });
    expect(screen.queryByTestId("inspector-overlay")).not.toBeInTheDocument();

    // Closing reading restores it (selection + inspectorOpen state were
    // never cleared — only gated while the reading overlay is open).
    fireEvent.click(screen.getByRole("button", { name: "Close reading" }));
    expect(screen.getByTestId("inspector-overlay")).toBeVisible();
  });
});

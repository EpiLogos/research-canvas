import type { ComponentProps, ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { createAnnotationStore, createCanvasStore } from "@research-canvas/canvas";
import type { CanvasNode } from "@research-canvas/schema";

import { CanvasWorkspaceContext, CanvasWorkspaceProvider } from "../features/canvas/CanvasWorkspaceContext";
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

// A REAL workspace context value — real canvasStore/annotationStore (so
// nodes/edges/annotations are reactive via useStore, exactly as in
// production) and real selection state, wired through selectNode exactly
// like CanvasWorkspaceProvider does. Only the transport-backed bootstrap
// side (projects/files/resources) is stubbed, since it depends on Tauri
// IPC that isn't present in jsdom. This lets Shell-level tests exercise the
// real node-selection path (CanvasView's onNodeClick -> workspace.selectNode)
// without needing the full bootstrapping provider to hydrate over IPC.
function FakeWorkspaceProvider({ children, nodes }: { children: ReactNode; nodes: CanvasNode[] }) {
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

  const value = useMemo(
    () => ({
      store,
      annotationStore,
      isHydrated: true,
      errorMessage: null,
      canvasId: CANVAS_ID,
      projectId: "11111111-1111-4111-8111-111111111111",
      databasePath: null,
      activeProject: null,
      activeProjectId: null,
      projects: [],
      entries: [],
      resourceRoots: [],
      workingRoot: null,
      selectedEntryId,
      selectedEdgeId,
      selectedNodeId,
      selectNode,
      selectEdge: setSelectedEdgeId,
      selectEntry: setSelectedEntryId,
      selectProject: vi.fn(),
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
      searchProject: vi.fn().mockResolvedValue([]),
      listSavedSequences: vi.fn().mockResolvedValue([]),
      createSavedSequence: vi.fn(),
      updateSavedSequence: vi.fn(),
      deleteSavedSequence: vi.fn().mockResolvedValue(undefined),
      resizeNode: vi.fn(),
      updateNodeContent: vi.fn(),
      setNodeThumbnailFromAbsolutePath: vi.fn().mockResolvedValue(undefined),
      updateNodeStyle: vi.fn(),
      flyToNode: vi.fn(),
      flyToEdge: vi.fn(),
      registerFlyToNode: vi.fn(),
      registerFlyToEdge: vi.fn(),
      captureViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      registerCaptureViewport: vi.fn(),
      transport: {},
      contentLinkingActions: {},
    }) as unknown as ComponentProps<typeof CanvasWorkspaceContext.Provider>["value"],
    [store, annotationStore, selectedEntryId, selectedEdgeId, selectedNodeId, selectNode],
  );

  return <CanvasWorkspaceContext.Provider value={value}>{children}</CanvasWorkspaceContext.Provider>;
}

function renderShellWithNode(node: CanvasNode) {
  return render(
    <MemoryRouter>
      <FakeWorkspaceProvider nodes={[node]}>
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
    expect(screen.queryByTestId("left-overlay")).not.toBeInTheDocument();
  });

  it("summons the terminal dock via the rail Terminal verb", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));
    expect(screen.getByTestId("bottom-dock")).toBeVisible();
  });

  it("switches the stage surface when a lens is chosen", () => {
    renderShell();
    fireEvent.click(screen.getByTestId("lens-timeline"));
    expect(screen.getByTestId("timeline-pane")).toBeVisible();
    fireEvent.click(screen.getByTestId("lens-reading"));
    expect(screen.getByTestId("reading-pane")).toBeVisible();
  });

  it("keeps the rail reachable while in the reading lens (panels must stay reachable while reading)", () => {
    renderShell();
    expect(screen.getByTestId("left-rail")).toBeVisible();
    fireEvent.click(screen.getByTestId("lens-reading"));
    expect(screen.getByTestId("reading-pane")).toBeVisible();
    expect(screen.getByTestId("left-rail")).toBeVisible();
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
    fireEvent.click(screen.getByRole("button", { name: "Files & Project" }));
    expect(screen.getByTestId("left-overlay")).toBeVisible();
    expect(screen.getByTestId("browser-files")).toBeInTheDocument();
  });

  it("re-clicking the active rail verb toggles the browser closed", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Files & Project" }));
    expect(screen.getByTestId("left-overlay")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Files & Project" }));
    expect(screen.queryByTestId("left-overlay")).not.toBeInTheDocument();
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
});

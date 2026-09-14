import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectTree } from "./ProjectTree";
import type { AppTab } from "@research-canvas/schema";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

import { open } from "@tauri-apps/plugin-dialog";

const tabManager = vi.hoisted(() => ({
  tabs: [] as AppTab[],
  activeTabId: null as string | null,
  open: vi.fn((tab: AppTab) => {
    const existing = tabManager.tabs.find((t) => t.id === tab.id);
    if (existing) {
      tabManager.tabs = tabManager.tabs.map((t) => (t.id === tab.id ? tab : t));
    } else {
      tabManager.tabs.push(tab);
    }
    tabManager.activeTabId = tab.id;
  }),
  activate: vi.fn((tabId: string) => {
    tabManager.activeTabId = tabId;
  }),
  close: vi.fn(),
}));

const workspace = vi.hoisted(() => {
  const listSavedSequences = vi.fn().mockResolvedValue([
    { id: "seq-a", name: "Sequence A", canvasId: "canvas-a", constellationId: "proj-a" },
  ]);
  const listScenes = vi.fn().mockResolvedValue([
    { id: "scene-a", name: "Scene A" },
  ]);
  const selectProject = vi.fn().mockImplementation((id: string) => {
    workspace.activeProjectId = id;
    workspace.activeConstellationId = id;
    const constellation = workspace.constellations.find(
      (item: { id: string }) => item.id === id,
    );
    workspace.activeConstellation = constellation
      ? {
          id: constellation.id,
          displayName: constellation.name,
          primaryCanvasId: id,
        }
      : null;
    return Promise.resolve();
  });
  const openConstellationTab = vi.fn().mockImplementation(async (id: string) => {
    workspace.activeConstellationId = id;
    workspace.activeProjectId = id;
    const constellation = workspace.constellations.find(
      (item: { id: string }) => item.id === id,
    );
    workspace.activeConstellation = constellation
      ? {
          id: constellation.id,
          displayName: constellation.name,
          primaryCanvasId: id,
        }
      : null;
  });
  const openCanvas = vi.fn().mockResolvedValue(undefined);
  const selectNode = vi.fn();
  const openTab = vi.fn().mockImplementation((tab: AppTab) => tabManager.open(tab));
  const activateTab = vi.fn().mockImplementation((tabId: string) => tabManager.activate(tabId));
  const resolveOrCreateHome = vi.fn().mockResolvedValue({ homePath: "/home", projects: [] });
  const createProject = vi.fn().mockImplementation(
    async (input: { databasePath: string; homePath: string; name: string; rootType: string; sourcePath?: string }) => ({
      id: `proj-${input.name}`,
      displayName: input.name,
      name: input.name,
      slug: input.name.toLowerCase(),
      rootPath: input.sourcePath ?? `/home/${input.name}`,
      rootType: input.rootType,
      profileScope: `project:${input.name}`,
      primaryCanvasId: `canvas-${input.name}`,
      parentConstellationId: null,
      summary: "",
      coverAssetPath: null,
      publishSettings: {},
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    }),
  );

  return {
    databasePath: "/workspace.sqlite",
    activeProjectId: "proj-a",
    activeConstellationId: "proj-a",
    activeProfileScope: "project:project-a",
    activeConstellation: {
      id: "proj-a",
      displayName: "Project A",
      primaryCanvasId: "canvas-a",
    } as { id: string; displayName: string; primaryCanvasId: string } | null,
    constellations: [
      {
        id: "proj-a",
        name: "Project A",
        slug: "project-a",
        rootPath: "/home/project-a",
        rootType: "directory",
        profileScope: "project:project-a",
        summary: "",
        parentId: null,
        children: [
          {
            id: "c1",
            name: "Child One",
            slug: "child-one",
            rootPath: "/home/project-a/child-one",
            rootType: "directory",
            profileScope: "project:project-a",
            summary: "",
            parentId: "proj-a",
            children: [
              {
                id: "c2",
                name: "Child Two",
                slug: "child-two",
                rootPath: "/home/project-a/child-one/child-two",
                rootType: "directory",
                profileScope: "project:project-a",
                summary: "",
                parentId: "c1",
                children: [],
              },
            ],
          },
        ],
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
        children: [],
      },
    ],
    nodes: [
      {
        id: "n1",
        title: "Node One",
        type: "note",
        graph: { entityType: "note" },
      },
    ],
    selectProject,
    openConstellationTab,
    openCanvas,
    selectNode,
    openTab,
    activateTab,
    closeTab: tabManager.close,
    listSavedSequences,
    listScenes,
    transport: { listSavedSequences, listScenes },
    resolveOrCreateHome,
    createProject,
  };
});

vi.mock("../canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => workspace,
}));

function renderTree() {
  return render(<ProjectTree />);
}

describe("ProjectTree", () => {
  beforeEach(() => {
    workspace.activeProjectId = "proj-a";
    workspace.activeConstellationId = "proj-a";
    workspace.activeConstellation = {
      id: "proj-a",
      displayName: "Project A",
      primaryCanvasId: "canvas-a",
    };
    tabManager.tabs = [];
    tabManager.activeTabId = null;
    vi.mocked(open).mockReset();
    workspace.openConstellationTab.mockClear();
    workspace.openCanvas.mockClear();
    workspace.selectNode.mockClear();
    workspace.selectProject.mockClear();
    workspace.openTab.mockClear();
    workspace.activateTab.mockClear();
    workspace.resolveOrCreateHome.mockClear();
    workspace.createProject.mockClear();
    tabManager.open.mockClear();
    tabManager.activate.mockClear();
    tabManager.close.mockClear();
  });

  it("renders the project tree with root picker and constellation nodes", async () => {
    renderTree();
    await waitFor(() =>
      expect(screen.getByTestId("left-mode-projects")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("project-root-picker")).toHaveTextContent(
      "Open project root…",
    );
    expect(
      screen.getByTestId("constellation-node-c1"),
    ).toHaveTextContent("Child One");
    expect(screen.getByTestId("canvas-node-canvas-a")).toHaveTextContent(
      "Primary canvas",
    );
  });

  it("opens the constellation primary canvas when a constellation is clicked", async () => {
    renderTree();
    await waitFor(() =>
      expect(screen.getByTestId("constellation-node-c1")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("constellation-node-c1"));
    await waitFor(() =>
      expect(workspace.openConstellationTab).toHaveBeenCalledWith("c1"),
    );
  });

  it("opens a canvas when a canvas node is clicked", async () => {
    renderTree();
    await waitFor(() =>
      expect(screen.getByTestId("canvas-node-canvas-a")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("canvas-node-canvas-a"));
    await waitFor(() =>
      expect(workspace.openCanvas).toHaveBeenCalledWith("canvas-a"),
    );
  });

  it("opens a canvas when a sequence is clicked", async () => {
    renderTree();
    await waitFor(() =>
      expect(screen.getByTestId("sequence-node-seq-a")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("sequence-node-seq-a"));
    await waitFor(() =>
      expect(workspace.openCanvas).toHaveBeenCalledWith("canvas-a"),
    );
  });

  it("opens a story tab when a scene is clicked", async () => {
    renderTree();
    await waitFor(() =>
      expect(screen.getByTestId("scene-node-scene-a")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("scene-node-scene-a"));
    await waitFor(() =>
      expect(workspace.openTab).toHaveBeenCalledWith(
        expect.objectContaining({
          surfaceId: "story",
          title: "Scene A",
        }),
      ),
    );
  });

  it("selects a graph node when a graph node is clicked", async () => {
    renderTree();
    await waitFor(() =>
      expect(screen.getByTestId("graph-node-n1")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("graph-node-n1"));
    expect(workspace.selectNode).toHaveBeenCalledWith("n1");
  });

  it("toggles nested constellations via disclosure triangles", async () => {
    renderTree();
    await waitFor(() =>
      expect(screen.getByTestId("tree-disclosure-c1")).toBeInTheDocument(),
    );

    // Default expanded by the tree; collapse first.
    fireEvent.click(screen.getByTestId("tree-disclosure-c1"));
    await waitFor(() =>
      expect(
        screen.queryByTestId("constellation-node-c2"),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("tree-disclosure-c1"));
    await waitFor(() =>
      expect(screen.getByTestId("constellation-node-c2")).toBeInTheDocument(),
    );
  });

  it("shows a context menu and opens the constellation in a chosen surface", async () => {
    renderTree();
    await waitFor(() =>
      expect(screen.getByTestId("constellation-node-c1")).toBeInTheDocument(),
    );

    fireEvent.contextMenu(screen.getByTestId("constellation-node-c1"));
    await waitFor(() =>
      expect(screen.getByTestId("project-tree-context-menu")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("open-constellation-timeline"));
    await waitFor(() =>
      expect(workspace.openConstellationTab).toHaveBeenCalledWith("c1"),
    );
    expect(workspace.openTab).toHaveBeenCalledWith(
      expect.objectContaining({
        surfaceId: "timeline",
        title: "Child One",
      }),
    );
  });

  it("creates a project from the selected directory and selects it", async () => {
    vi.mocked(open).mockResolvedValue("/home/new-project");
    renderTree();
    await waitFor(() =>
      expect(screen.getByTestId("project-root-picker")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("project-root-picker"));
    await waitFor(() =>
      expect(workspace.resolveOrCreateHome).toHaveBeenCalledWith({
        databasePath: "/workspace.sqlite",
      }),
    );
    await waitFor(() =>
      expect(workspace.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          databasePath: "/workspace.sqlite",
          homePath: "/home",
          name: "new-project",
          rootType: "directory",
          sourcePath: "/home/new-project",
        }),
      ),
    );
    await waitFor(() =>
      expect(workspace.selectProject).toHaveBeenCalledWith("proj-new-project"),
    );
  });

  it("shows an error when the file dialog fails", async () => {
    vi.mocked(open).mockRejectedValue(new Error("dialog unavailable"));
    renderTree();
    await waitFor(() =>
      expect(screen.getByTestId("project-root-picker")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("project-root-picker"));
    await waitFor(() =>
      expect(screen.getByTestId("project-root-error")).toHaveTextContent(
        "dialog unavailable",
      ),
    );
  });
});

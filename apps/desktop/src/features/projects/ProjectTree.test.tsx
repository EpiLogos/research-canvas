import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectTree } from "./ProjectTree";
import { ProjectTabProvider } from "./ProjectTabContext";

const workspace = vi.hoisted(() => {
  const listSavedSequences = vi.fn().mockResolvedValue([]);
  const listScenes = vi.fn().mockResolvedValue([]);
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
  const openConstellationTab = vi.fn().mockResolvedValue(undefined);
  const openCanvas = vi.fn().mockResolvedValue(undefined);
  const selectNode = vi.fn();

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
    listSavedSequences,
    listScenes,
    transport: { listSavedSequences, listScenes },
  };
});

vi.mock("../canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => workspace,
}));

function renderTree() {
  return render(
    <ProjectTabProvider>
      <ProjectTree />
    </ProjectTabProvider>,
  );
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
    workspace.openConstellationTab.mockClear();
    workspace.openCanvas.mockClear();
    workspace.selectNode.mockClear();
    workspace.selectProject.mockClear();
  });

  it("renders the project tree with root picker and constellation nodes", async () => {
    renderTree();
    await waitFor(() =>
      expect(screen.getByTestId("left-mode-projects")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("project-root-picker")).toHaveTextContent(
      "Project A",
    );
    expect(
      screen.getByTestId("constellation-node-c1"),
    ).toHaveTextContent("Child One");
    expect(screen.getByTestId("canvas-node-canvas-a")).toHaveTextContent(
      "Primary canvas",
    );
  });

  it("opens the root picker and routes selection through the workspace seam", async () => {
    const { rerender } = renderTree();
    await waitFor(() =>
      expect(screen.getByTestId("project-root-picker")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("project-root-picker"));
    await waitFor(() =>
      expect(screen.getByTestId("project-node-proj-b")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("project-node-proj-b"));
    expect(workspace.selectProject).toHaveBeenCalledWith("proj-b");

    // Simulate the re-render that follows the workspace state update.
    rerender(
      <ProjectTabProvider>
        <ProjectTree />
      </ProjectTabProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("project-root-picker")).toHaveTextContent(
        "Project B",
      ),
    );
  });

  it("calls the global tab API when a constellation is clicked", async () => {
    renderTree();
    await waitFor(() =>
      expect(screen.getByTestId("constellation-node-c1")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("constellation-node-c1"));
    await waitFor(() =>
      expect(workspace.openConstellationTab).toHaveBeenCalledWith("c1"),
    );
  });

  it("calls the global tab API when a canvas is clicked", async () => {
    renderTree();
    await waitFor(() =>
      expect(screen.getByTestId("canvas-node-canvas-a")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("canvas-node-canvas-a"));
    await waitFor(() =>
      expect(workspace.openCanvas).toHaveBeenCalledWith("canvas-a"),
    );
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
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectsLayer } from "./ProjectsLayer";

const workspace = vi.hoisted(() => {
  const selectProject = vi.fn().mockResolvedValue(undefined);
  const resolveOrCreateHome = vi.fn().mockResolvedValue({
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
        summary: "A second project.",
        parentId: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
  });
  const createProject = vi.fn().mockResolvedValue({
    id: "proj-c",
    displayName: "Project C",
    slug: "project-c",
    parentConstellationId: null,
    rootPath: "/home/project-c",
    rootType: "directory",
    profileScope: "project:project-c",
    summary: "",
    primaryCanvasId: "canvas-c",
    coverAssetPath: null,
    publishSettings: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  });

  return {
    databasePath: "/workspace.sqlite",
    activeProjectId: "proj-a",
    activeConstellationId: "proj-a",
    activeProfileScope: "project:project-a",
    activeConstellation: {
      id: "proj-a",
      displayName: "Project A",
      slug: "project-a",
      parentConstellationId: null,
      rootPath: "/home/project-a",
      rootType: "directory",
      profileScope: "project:project-a",
      primaryCanvasId: "canvas-a",
      summary: "",
      coverAssetPath: null,
      publishSettings: {},
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
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
        children: [],
      },
    ],
    selectProject,
    resolveOrCreateHome,
    createProject,
  };
});

vi.mock("../features/canvas/CanvasWorkspaceContext", () => ({
  // Return a FRESH object reference per call (the real context value is
  // re-created on frequent re-renders) while keeping the SAME seam fns and
  // scalar/string state. This mirrors the running app and is what makes the
  // home-resolution regression test meaningful: an effect keyed on the
  // `workspace` reference (rather than the stable `databasePath`) would
  // re-run on every re-render.
  useCanvasWorkspace: () => ({
    databasePath: workspace.databasePath,
    activeProjectId: workspace.activeProjectId,
    activeConstellationId: workspace.activeConstellationId,
    activeProfileScope: workspace.activeProfileScope,
    activeConstellation: workspace.activeConstellation,
    constellations: workspace.constellations,
    selectProject: workspace.selectProject,
    resolveOrCreateHome: workspace.resolveOrCreateHome,
    createProject: workspace.createProject,
  }),
}));

function renderProjectsLayer() {
  return render(<ProjectsLayer />);
}

describe("ProjectsLayer", () => {
  beforeEach(() => {
    workspace.selectProject.mockClear();
    workspace.createProject.mockClear();
    workspace.resolveOrCreateHome.mockClear();
    workspace.resolveOrCreateHome.mockResolvedValue({
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
          summary: "A second project.",
          parentId: null,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
  });

  it("resolves the research-canvas home and lists projects in the picker", async () => {
    renderProjectsLayer();
    await waitFor(() => expect(workspace.resolveOrCreateHome).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("projects-trigger"));
    await waitFor(() => expect(screen.getByTestId("projects-layer")).toBeInTheDocument());
    expect(screen.getByTestId("project-row-proj-a")).toHaveTextContent("Project A");
    expect(screen.getByTestId("project-row-proj-b")).toHaveTextContent("Project B");
    expect(screen.getByTestId("project-row-proj-b")).toHaveTextContent("project:project-b");
  });

  it("marks the active project and shows its scope", async () => {
    renderProjectsLayer();
    await waitFor(() => expect(workspace.resolveOrCreateHome).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("projects-trigger"));
    await waitFor(() => expect(screen.getByTestId("projects-layer")).toBeInTheDocument());
    expect(screen.getByTestId("project-row-proj-a")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("project-row-proj-b")).toHaveAttribute("data-active", "false");
    expect(screen.getByTestId("projects-active-name")).toHaveTextContent("Project A");
    expect(screen.getByTestId("projects-active-scope")).toHaveTextContent("project:project-a");
  });

  it("selects a project through the real workspace seam and closes the picker", async () => {
    renderProjectsLayer();
    await waitFor(() => expect(workspace.resolveOrCreateHome).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("projects-trigger"));
    await waitFor(() => expect(screen.getByTestId("projects-layer")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("project-row-proj-b"));
    expect(workspace.selectProject).toHaveBeenCalledWith("proj-b");
    await waitFor(() => expect(screen.queryByTestId("projects-layer")).not.toBeInTheDocument());
  });

  it("creates a project and selects it through the real transport", async () => {
    renderProjectsLayer();
    await waitFor(() => expect(workspace.resolveOrCreateHome).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("projects-trigger"));
    await waitFor(() => expect(screen.getByTestId("projects-layer")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("projects-new-name"), {
      target: { value: "Project C" },
    });
    fireEvent.click(screen.getByTestId("projects-create"));
    await waitFor(() =>
      expect(workspace.createProject).toHaveBeenCalledWith({
        databasePath: "/workspace.sqlite",
        homePath: "/home",
        name: "Project C",
        rootType: "directory",
      }),
    );
    await waitFor(() => expect(workspace.selectProject).toHaveBeenCalledWith("proj-c"));
  });

  it("shows an informative empty state when the home has no projects", async () => {
    workspace.resolveOrCreateHome.mockResolvedValue({ homePath: "/home", projects: [] });
    renderProjectsLayer();
    await waitFor(() => expect(workspace.resolveOrCreateHome).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("projects-trigger"));
    await waitFor(() => expect(screen.getByTestId("projects-layer")).toBeInTheDocument());
    expect(screen.getByText("No projects yet — create one below.")).toBeInTheDocument();
  });

  it("does not re-resolve the home on re-renders even when the transport returns fresh objects", async () => {
    // Regression for the HIGH review finding: the home-resolution effect was
    // keyed on the `workspace` reference, which is a FRESH object on every
    // render (the context useMemo re-creates it), and the real bridge/Tauri
    // transport returns a FRESH array reference per call. Together that made
    // resolve → setState → re-render → new workspace ref → resolve an
    // infinite loop (reviewer measured 3555 calls in 500ms). The effect must
    // key on the stable `databasePath` and bail on identical projects.
    workspace.resolveOrCreateHome.mockImplementation(async () => ({
      homePath: "/home",
      // A fresh array reference per call, mirroring transport deserialization.
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
      ],
    }));

    renderProjectsLayer();
    // Exactly one resolve after the initial settle.
    await waitFor(() => expect(workspace.resolveOrCreateHome).toHaveBeenCalledTimes(1));

    // Re-render the layer (open the picker, type in the create field). Each
    // render receives a fresh context object reference — the home must NOT be
    // re-resolved.
    fireEvent.click(screen.getByTestId("projects-trigger"));
    await waitFor(() => expect(screen.getByTestId("projects-layer")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("projects-new-name"), { target: { value: "x" } });

    // Give any (buggy) re-resolve a chance to fire; the count stays bounded.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(workspace.resolveOrCreateHome).toHaveBeenCalledTimes(1);
  });
});

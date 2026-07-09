import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProjectTreeNode } from "@research-canvas/desktop-api";

import { ProjectTree } from "./ProjectTree";

describe("ProjectTree", () => {
  it("renders a nested project hierarchy and calls back on selection", async () => {
    const onSelectProject = vi.fn();
    const projects: ProjectTreeNode[] = [
      {
        id: "sample-project",
        name: "sample-project",
        slug: "sample-project",
        rootPath: "/workspace/sample-project",
        summary: "Seed workspace for explorer and export flows.",
        parentId: null,
        children: []
      },
      {
        id: "ep-0.1",
        name: "ep-0.1",
        slug: "ep-0-1",
        rootPath: "/workspace/episodes/ep-0.1",
        summary: "Markdown-heavy nested project.",
        parentId: "sample-project",
        children: []
      },
      {
        id: "ep-0.2",
        name: "ep-0.2",
        slug: "ep-0-2",
        rootPath: "/workspace/episodes/ep-0.2",
        summary: "Research reports and media assets.",
        parentId: "sample-project",
        children: []
      }
    ];

    render(
      <ProjectTree
        projects={projects}
        selectedProjectId="sample-project"
        onSelectProject={onSelectProject}
      />,
    );

    expect(screen.getByRole("tree")).toBeVisible();
    expect(screen.getByLabelText("Constellation tree")).toBeVisible();
    expect(screen.getByText("Constellations")).toBeVisible();
    expect(screen.getByText("sample-project")).toBeVisible();
    expect(screen.getByText("ep-0.1")).toBeVisible();
    expect(screen.getByText("ep-0.2")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /ep-0\.1/ }));
    expect(onSelectProject).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ep-0.1",
        rootPath: expect.stringContaining("episodes/ep-0.1")
      }),
    );
  });
});

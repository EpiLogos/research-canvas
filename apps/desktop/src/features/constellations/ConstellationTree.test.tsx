import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ConstellationTreeNode } from "@research-canvas/desktop-api";

import { ConstellationTree } from "./ConstellationTree";

describe("ConstellationTree", () => {
  it("renders a nested constellation hierarchy and calls back on selection", async () => {
    const onSelectConstellation = vi.fn();
    const constellations: ConstellationTreeNode[] = [
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
      <ConstellationTree
        constellations={constellations}
        selectedConstellationId="sample-project"
        onSelectConstellation={onSelectConstellation}
      />,
    );

    expect(screen.getByRole("tree")).toBeVisible();
    expect(screen.getByLabelText("Constellation tree")).toBeVisible();
    expect(screen.getByText("Constellations")).toBeVisible();
    expect(screen.getByText("sample-project")).toBeVisible();
    expect(screen.getByText("ep-0.1")).toBeVisible();
    expect(screen.getByText("ep-0.2")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /ep-0\.1/ }));
    expect(onSelectConstellation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ep-0.1",
        rootPath: expect.stringContaining("episodes/ep-0.1")
      }),
    );
  });
});

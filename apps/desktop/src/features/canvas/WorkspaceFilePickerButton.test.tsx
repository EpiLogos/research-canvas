import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { IndexedEntry } from "@research-canvas/desktop-api";

import { WorkspaceFilePickerButton } from "./WorkspaceFilePickerButton";

const entries: IndexedEntry[] = [
  {
    absolutePath: "/workspace/project/README.md",
    depth: 0,
    id: "readme",
    isDirectory: false,
    kind: "markdown",
    name: "README.md",
    relativePath: "README.md",
    sizeBytes: 128,
  },
  {
    absolutePath: "/workspace/project/assets/cover.png",
    depth: 1,
    id: "cover",
    isDirectory: false,
    kind: "image",
    name: "cover.png",
    relativePath: "assets/cover.png",
    sizeBytes: 1024,
  },
  {
    absolutePath: "/workspace/project/assets",
    depth: 0,
    id: "assets",
    isDirectory: true,
    kind: "directory",
    name: "assets",
    relativePath: "assets",
    sizeBytes: 0,
  },
];

describe("WorkspaceFilePickerButton", () => {
  it("opens a searchable project file picker and returns the selected entry", () => {
    const onSelect = vi.fn();

    render(
      <WorkspaceFilePickerButton
        buttonLabel="Choose file"
        entries={entries}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose file" }));

    const search = screen.getByPlaceholderText("Search files…");
    fireEvent.change(search, { target: { value: "cover" } });
    fireEvent.click(screen.getByText("cover.png"));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        absolutePath: "/workspace/project/assets/cover.png",
        id: "cover",
      }),
    );
  });

  it("can constrain results to matching file kinds", () => {
    render(
      <WorkspaceFilePickerButton
        buttonLabel="Choose image"
        entries={entries}
        filter={(entry) => entry.kind === "image"}
        onSelect={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose image" }));

    expect(screen.getByText("cover.png")).toBeVisible();
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FileExplorer } from "./FileExplorer";
import type { IndexedEntry } from "@research-canvas/desktop-api";

const entries: IndexedEntry[] = [
  {
    id: "readme",
    name: "README.md",
    relativePath: "README.md",
    absolutePath: "/tmp/sample-project/README.md",
    kind: "markdown",
    isDirectory: false,
    depth: 0,
    sizeBytes: 128
  },
  {
    id: "assets",
    name: "assets",
    relativePath: "assets",
    absolutePath: "/tmp/sample-project/assets",
    kind: "directory",
    isDirectory: true,
    depth: 0,
    sizeBytes: 0
  },
  {
    id: "image",
    name: "example.png",
    relativePath: "assets/example.png",
    absolutePath: "/tmp/sample-project/assets/example.png",
    kind: "image",
    isDirectory: false,
    depth: 1,
    sizeBytes: 1024
  },
  {
    id: "notes",
    name: "notes",
    relativePath: "notes",
    absolutePath: "/tmp/sample-project/notes",
    kind: "directory",
    isDirectory: true,
    depth: 0,
    sizeBytes: 0
  },
  {
    id: "outline",
    name: "outline.md",
    relativePath: "notes/outline.md",
    absolutePath: "/tmp/sample-project/notes/outline.md",
    kind: "markdown",
    isDirectory: false,
    depth: 1,
    sizeBytes: 64
  }
];

describe("FileExplorer", () => {
  it("renders nested file entries and reports selection", async () => {
    const onSelect = vi.fn();

    render(
      <FileExplorer
        entries={entries}
        projectName="sample-project"
        selectedEntryId="outline"
        onSelectEntry={onSelect}
      />,
    );

    expect(screen.getByRole("tree")).toBeVisible();
    expect(screen.getByText("README.md")).toBeVisible();
    expect(screen.getByText("example.png")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /outline\.md markdown/i }),
    ).toHaveAttribute(
      "data-selected",
      "true",
    );

    fireEvent.click(
      screen.getByRole("button", { name: /README\.md markdown/i }),
    );
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "readme",
        relativePath: "README.md"
      }),
    );
  });
});

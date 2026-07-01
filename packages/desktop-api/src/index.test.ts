import { describe, expect, it } from "vitest";

import {
  buildIndexedEntryTree,
  buildProjectTree,
  createWorkspaceTransport,
  type IndexedEntry,
  type ProjectTreeNode
} from "./index";

describe("desktop api tree helpers", () => {
  it("builds nested project trees from parent links", () => {
    const projects: ProjectTreeNode[] = [
      {
        id: "sample-project",
        name: "sample-project",
        slug: "sample-project",
        rootPath: "/workspace/sample-project",
        summary: "Workspace root",
        parentId: null,
        children: []
      },
      {
        id: "ep-0.1",
        name: "ep-0.1",
        slug: "ep-0-1",
        rootPath: "/workspace/sample-project/ep-0.1",
        summary: "Episode 0.1",
        parentId: "sample-project",
        children: []
      }
    ];

    const tree = buildProjectTree(projects);

    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe("ep-0.1");
  });

  it("builds nested entry trees from relative paths", () => {
    const entries: IndexedEntry[] = [
      {
        id: "readme",
        name: "README.md",
        relativePath: "README.md",
        absolutePath: "/workspace/sample-project/README.md",
        kind: "markdown",
        isDirectory: false,
        depth: 0,
        sizeBytes: 10
      },
      {
        id: "folder",
        name: "notes",
        relativePath: "notes",
        absolutePath: "/workspace/sample-project/notes",
        kind: "directory",
        isDirectory: true,
        depth: 0,
        sizeBytes: 0
      },
      {
        id: "outline",
        name: "outline.md",
        relativePath: "notes/outline.md",
        absolutePath: "/workspace/sample-project/notes/outline.md",
        kind: "markdown",
        isDirectory: false,
        depth: 1,
        sizeBytes: 24
      }
    ];

    const tree = buildIndexedEntryTree(entries);

    expect(tree).toHaveLength(2);
    const noteFolder = tree.find((entry) => entry.name === "notes");
    expect(noteFolder?.children).toHaveLength(1);
    expect(noteFolder?.children[0].name).toBe("outline.md");
  });
});

describe("importNodeImage transport", () => {
  it("rejects in the non-Tauri (read-only web) build", async () => {
    const transport = createWorkspaceTransport();
    await expect(
      transport.importNodeImage({
        workspaceRoot: "/ws",
        graphNodeId: "n1",
        sourceAbsolutePath: "/x/cat.png",
      }),
    ).rejects.toThrow(/read-only web build/i);
  });
});

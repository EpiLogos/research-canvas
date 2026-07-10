import { describe, expect, it, vi } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";

import type { GraphNode } from "@research-canvas/desktop-api";

import { createContentLinkingActions, type ContentLinkingDeps } from "./contentLinkingActions";

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    graphNodeId: "n1",
    entityType: "Dynamic",
    title: "Monopoly mechanism",
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    ...EMPTY_GRAPH_NODE_METADATA,
    isTemporal: false,
    validFrom: null,
    validTo: null,
    temporalPrecision: null,
    createdAt: "2026-06-28T00:00:00Z",
    updatedAt: "2026-06-28T00:00:00Z",
    ...overrides,
  };
}

function makeDeps(node: GraphNode): {
  deps: ContentLinkingDeps;
  updateGraphNode: ReturnType<typeof vi.fn>;
} {
  const updateGraphNode = vi.fn(async (input: { graphNodeId: string; patch: { body?: string } }) =>
    makeNode({ graphNodeId: input.graphNodeId, body: input.patch.body ?? node.body }),
  );
  const deps: ContentLinkingDeps = {
    readGraphNode: vi.fn(async () => node),
    updateGraphNode,
    connectGraphNodes: vi.fn(async () => ({
      id: "r1",
      relType: "CAUSES",
      sourceGraphNodeId: "n1",
      targetGraphNodeId: "n2",
      properties: {},
    })),
    createGraphNode: vi.fn(async () => makeNode({ graphNodeId: "src1", entityType: "Source" })),
    importNodeImage: vi.fn(async () => "assets/n1/cat.png"),
  };
  return { deps, updateGraphNode };
}

describe("addImageToNode", () => {
  it("imports the image and appends an image block referencing the returned path", async () => {
    const node = makeNode({ body: "[]" });
    const { deps, updateGraphNode } = makeDeps(node);
    const actions = createContentLinkingActions(deps);

    await actions.addImageToNode("n1", "/Users/me/Pictures/cat.png", "A cat");

    expect(deps.importNodeImage).toHaveBeenCalledWith({
      graphNodeId: "n1",
      sourceAbsolutePath: "/Users/me/Pictures/cat.png",
    });
    const patchBody = updateGraphNode.mock.calls[0][0].patch.body as string;
    expect(JSON.parse(patchBody)).toEqual([
      { type: "image", props: { url: "assets/n1/cat.png", caption: "A cat" } },
    ]);
  });
});

describe("attachFileToNode", () => {
  it("imports the file and appends a file-link paragraph referencing the returned path", async () => {
    const node = makeNode({ body: "[]" });
    const { deps, updateGraphNode } = makeDeps(node);
    (deps.importNodeImage as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      "assets/n1/notes.pdf",
    );
    const actions = createContentLinkingActions(deps);

    await actions.attachFileToNode("n1", "/Users/me/Documents/notes.pdf", "notes.pdf");

    expect(deps.importNodeImage).toHaveBeenCalledWith({
      graphNodeId: "n1",
      sourceAbsolutePath: "/Users/me/Documents/notes.pdf",
    });
    const patchBody = updateGraphNode.mock.calls[0][0].patch.body as string;
    expect(JSON.parse(patchBody)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "Attached file: notes.pdf (assets/n1/notes.pdf)" }] },
    ]);
  });
});

describe("addTextToNode", () => {
  it("appends pasted text as paragraph blocks and persists the new body", async () => {
    const node = makeNode({ body: "[]" });
    const { deps, updateGraphNode } = makeDeps(node);
    const actions = createContentLinkingActions(deps);

    await actions.addTextToNode("n1", "line one\nline two");

    expect(updateGraphNode).toHaveBeenCalledTimes(1);
    const patchBody = updateGraphNode.mock.calls[0][0].patch.body as string;
    expect(JSON.parse(patchBody)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "line one" }] },
      { type: "paragraph", content: [{ type: "text", text: "line two" }] },
    ]);
  });

  it("is a no-op persist for empty text but returns the node", async () => {
    const node = makeNode();
    const { deps, updateGraphNode } = makeDeps(node);
    const actions = createContentLinkingActions(deps);

    const result = await actions.addTextToNode("n1", "   ");

    expect(updateGraphNode).not.toHaveBeenCalled();
    expect(result.graphNodeId).toBe("n1");
  });
});

describe("linkMarkdownFileToNode", () => {
  it("creates a Source node from the markdown and links target via SOURCED_FROM", async () => {
    const node = makeNode({ graphNodeId: "n1", body: "[]" });
    const { deps, updateGraphNode } = makeDeps(node);
    const createGraphNode = deps.createGraphNode as ReturnType<typeof vi.fn>;
    const connectGraphNodes = deps.connectGraphNodes as ReturnType<typeof vi.fn>;
    createGraphNode.mockResolvedValueOnce(
      makeNode({ graphNodeId: "src1", entityType: "Source", title: "notes.md" }),
    );
    const actions = createContentLinkingActions(deps);

    await actions.linkMarkdownFileToNode({
      graphNodeId: "n1",
      fileName: "notes.md",
      markdown: "# Heading\nbody text",
    });

    const createArg = createGraphNode.mock.calls[0][0];
    expect(createArg.entityType).toBe("Source");
    expect(createArg.title).toBe("notes.md");
    expect(JSON.parse(createArg.body)).toEqual([
      { type: "heading", props: { level: 1 }, content: [{ type: "text", text: "Heading" }] },
      { type: "paragraph", content: [{ type: "text", text: "body text" }] },
    ]);

    expect(connectGraphNodes).toHaveBeenCalledWith({
      sourceGraphNodeId: "n1",
      targetGraphNodeId: "src1",
      relType: "SOURCED_FROM",
    });

    expect(updateGraphNode).toHaveBeenCalledTimes(1);
  });
});

describe("linkNodes", () => {
  it("creates a typed relationship through connectGraphNodes", async () => {
    const { deps } = makeDeps(makeNode());
    const connectGraphNodes = deps.connectGraphNodes as ReturnType<typeof vi.fn>;
    const actions = createContentLinkingActions(deps);

    await actions.linkNodes({
      sourceGraphNodeId: "n1",
      targetGraphNodeId: "n2",
      kind: "INSTANTIATES",
      properties: { dominance: "dominant" },
    });

    expect(connectGraphNodes).toHaveBeenCalledWith({
      sourceGraphNodeId: "n1",
      targetGraphNodeId: "n2",
      relType: "INSTANTIATES",
      properties: { dominance: "dominant" },
    });
  });

  it("rejects an unknown relationship kind before any write", async () => {
    const { deps } = makeDeps(makeNode());
    const connectGraphNodes = deps.connectGraphNodes as ReturnType<typeof vi.fn>;
    const actions = createContentLinkingActions(deps);

    await expect(
      actions.linkNodes({
        sourceGraphNodeId: "n1",
        targetGraphNodeId: "n2",
        // @ts-expect-error intentionally invalid to test the runtime guard
        kind: "RELATES",
      }),
    ).rejects.toThrow(/unknown relationship kind/i);
    expect(connectGraphNodes).not.toHaveBeenCalled();
  });
});

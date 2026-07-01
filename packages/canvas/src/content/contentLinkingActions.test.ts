import { describe, expect, it, vi } from "vitest";

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

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
    contentOrigin: "user_authored",
    contentRevision: 1,
    bodySourceCoordinates: [],
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
  compareAndSwapGraphNodeContent: ReturnType<typeof vi.fn>;
} {
  const compareAndSwapGraphNodeContent = vi.fn(async () => ({ kind: "updated" as const }));
  const deps: ContentLinkingDeps = {
    databasePath: "/tmp/workspace.sqlite",
    readGraphNode: vi.fn(async () => node),
    readLocalNodeDocument: vi.fn(async () => ({
      graphNodeId: node.graphNodeId, body: node.body, summary: node.summary,
      neo4jSynced: true, contentOrigin: node.contentOrigin!, contentRevision: node.contentRevision!,
      bodySourceCoordinates: node.bodySourceCoordinates,
    })),
    upsertLocalNodeDocument: vi.fn(async (input) => ({
      mutation: { kind: "updated" as const },
      document: { graphNodeId: input.graphNodeId, body: input.body, summary: input.summary,
        neo4jSynced: false, contentOrigin: "user_authored" as const,
        contentRevision: input.contentRevision!, bodySourceCoordinates: input.bodySourceCoordinates ?? [] },
    })),
    compareAndSwapGraphNodeContent,
    acknowledgeLocalNodeDocumentSync: vi.fn(async () => ({ kind: "updated" as const })),
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
  return { deps, compareAndSwapGraphNodeContent };
}

describe("addImageToNode", () => {
  it("imports the image and appends an image block referencing the returned path", async () => {
    const node = makeNode({ body: "[]" });
    const { deps, compareAndSwapGraphNodeContent } = makeDeps(node);
    const actions = createContentLinkingActions(deps);

    await actions.addImageToNode("n1", "/Users/me/Pictures/cat.png", "A cat");

    expect(deps.importNodeImage).toHaveBeenCalledWith({
      graphNodeId: "n1",
      sourceAbsolutePath: "/Users/me/Pictures/cat.png",
    });
    const patchBody = compareAndSwapGraphNodeContent.mock.calls[0][0].body as string;
    expect(JSON.parse(patchBody)).toEqual([
      { type: "image", props: { url: "assets/n1/cat.png", caption: "A cat" } },
    ]);
  });
});

describe("attachFileToNode", () => {
  it("imports the file and appends a file-link paragraph referencing the returned path", async () => {
    const node = makeNode({ body: "[]" });
    const { deps, compareAndSwapGraphNodeContent } = makeDeps(node);
    (deps.importNodeImage as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      "assets/n1/notes.pdf",
    );
    const actions = createContentLinkingActions(deps);

    await actions.attachFileToNode("n1", "/Users/me/Documents/notes.pdf", "notes.pdf");

    expect(deps.importNodeImage).toHaveBeenCalledWith({
      graphNodeId: "n1",
      sourceAbsolutePath: "/Users/me/Documents/notes.pdf",
    });
    const patchBody = compareAndSwapGraphNodeContent.mock.calls[0][0].body as string;
    expect(JSON.parse(patchBody)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "Attached file: notes.pdf (assets/n1/notes.pdf)" }] },
    ]);
  });
});

describe("addTextToNode", () => {
  it("appends pasted text as paragraph blocks and persists the new body", async () => {
    const node = makeNode({ body: "[]" });
    const { deps, compareAndSwapGraphNodeContent } = makeDeps(node);
    const actions = createContentLinkingActions(deps);

    await actions.addTextToNode("n1", "line one\nline two");

    expect(compareAndSwapGraphNodeContent).toHaveBeenCalledTimes(1);
    const patchBody = compareAndSwapGraphNodeContent.mock.calls[0][0].body as string;
    expect(JSON.parse(patchBody)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "line one" }] },
      { type: "paragraph", content: [{ type: "text", text: "line two" }] },
    ]);
  });

  it("refuses equal-revision projection drift before any write", async () => {
    const node = makeNode({ body: "[]" });
    const { deps, compareAndSwapGraphNodeContent } = makeDeps(node);
    (deps.readLocalNodeDocument as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      graphNodeId: "n1", body: '[{"type":"paragraph"}]', summary: "", neo4jSynced: true,
      contentOrigin: "user_authored", contentRevision: 1, bodySourceCoordinates: [],
    });
    await expect(createContentLinkingActions(deps).addTextToNode("n1", "new")).rejects.toThrow(/projections differ/);
    expect(deps.upsertLocalNodeDocument).not.toHaveBeenCalled();
    expect(compareAndSwapGraphNodeContent).not.toHaveBeenCalled();
  });

  it("does not CAS remotely unless the local mutation is Updated", async () => {
    const node = makeNode({ body: "[]" });
    const { deps, compareAndSwapGraphNodeContent } = makeDeps(node);
    (deps.upsertLocalNodeDocument as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      mutation: { kind: "preserved" }, document: null,
    });
    await expect(createContentLinkingActions(deps).addTextToNode("n1", "new")).rejects.toThrow(/returned preserved/);
    expect(compareAndSwapGraphNodeContent).not.toHaveBeenCalled();
  });

  it("is a no-op persist for empty text but returns the node", async () => {
    const node = makeNode();
    const { deps, compareAndSwapGraphNodeContent } = makeDeps(node);
    const actions = createContentLinkingActions(deps);

    const result = await actions.addTextToNode("n1", "   ");

    expect(compareAndSwapGraphNodeContent).not.toHaveBeenCalled();
    expect(result.graphNodeId).toBe("n1");
  });
});

describe("linkMarkdownFileToNode", () => {
  it("creates a Source node from the markdown and links target via SOURCED_FROM", async () => {
    const node = makeNode({ graphNodeId: "n1", body: "[]" });
    const { deps, compareAndSwapGraphNodeContent } = makeDeps(node);
    const createGraphNode = deps.createGraphNode as ReturnType<typeof vi.fn>;
    const connectGraphNodes = deps.connectGraphNodes as ReturnType<typeof vi.fn>;
    (deps.upsertLocalNodeDocument as ReturnType<typeof vi.fn>).mockImplementationOnce(async (input) => ({
      mutation: { kind: "created" as const },
      document: {
        graphNodeId: input.graphNodeId,
        body: input.body,
        summary: input.summary,
        neo4jSynced: false,
        contentOrigin: "user_authored" as const,
        contentRevision: input.contentRevision!,
        bodySourceCoordinates: input.bodySourceCoordinates ?? [],
      },
    }));
    createGraphNode.mockImplementationOnce(async (input) =>
      makeNode({ graphNodeId: input.graphNodeId!, entityType: "Source", title: "notes.md" }),
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
    expect(createArg.graphNodeId).toEqual(expect.any(String));
    expect(JSON.parse(createArg.body)).toEqual([
      { type: "heading", props: { level: 1 }, content: [{ type: "text", text: "Heading" }] },
      { type: "paragraph", content: [{ type: "text", text: "body text" }] },
    ]);

    expect(connectGraphNodes).toHaveBeenCalledWith({
      databasePath: "/tmp/workspace.sqlite",
      sourceGraphNodeId: "n1",
      targetGraphNodeId: createArg.graphNodeId,
      relType: "SOURCED_FROM",
    });

    expect(deps.upsertLocalNodeDocument).toHaveBeenCalledWith(expect.objectContaining({
      databasePath: "/tmp/workspace.sqlite",
      graphNodeId: createArg.graphNodeId,
      contentOrigin: "user_authored",
      contentRevision: 0,
      metadataProjection: { entityType: "Source", title: "notes.md", schemaVersion: 1 },
    }));

    expect(compareAndSwapGraphNodeContent).toHaveBeenCalledTimes(1);
  });

  it("creates the durable local SOURCED_FROM edge when remote Source projection is unavailable", async () => {
    const node = makeNode({ graphNodeId: "n1", body: "[]" });
    const { deps } = makeDeps(node);
    const createGraphNode = deps.createGraphNode as ReturnType<typeof vi.fn>;
    const connectGraphNodes = deps.connectGraphNodes as ReturnType<typeof vi.fn>;
    (deps.upsertLocalNodeDocument as ReturnType<typeof vi.fn>).mockImplementationOnce(async (input) => ({
      mutation: { kind: "created" as const },
      document: {
        graphNodeId: input.graphNodeId,
        body: input.body,
        summary: input.summary,
        neo4jSynced: false,
        contentOrigin: "user_authored" as const,
        contentRevision: input.contentRevision!,
        bodySourceCoordinates: input.bodySourceCoordinates ?? [],
      },
    }));
    createGraphNode.mockRejectedValueOnce(new Error("graph service unavailable"));

    await createContentLinkingActions(deps).linkMarkdownFileToNode({
      graphNodeId: "n1",
      fileName: "offline-source.md",
      markdown: "# Durable source",
    });

    const localSourceId = (deps.upsertLocalNodeDocument as ReturnType<typeof vi.fn>).mock.calls[0][0].graphNodeId;
    expect(connectGraphNodes).toHaveBeenCalledWith({
      databasePath: "/tmp/workspace.sqlite",
      sourceGraphNodeId: "n1",
      targetGraphNodeId: localSourceId,
      relType: "SOURCED_FROM",
    });
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
      databasePath: "/tmp/workspace.sqlite",
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

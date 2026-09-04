import { describe, expect, it, test } from "vitest";

import { createCanvasStore, entityTypeForNodeType } from "./canvasStore";
import type { CanvasNode } from "@research-canvas/schema";

describe("deleteNode", () => {
  it("removes the node from the store", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const node = store.getState().createNoteNode({ title: "t", content: "" });
    store.getState().deleteNode(node.id);
    expect(store.getState().nodes.find((n) => n.id === node.id)).toBeUndefined();
  });

  it("also removes edges connected to that node", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const a = store.getState().createNoteNode({ title: "a", content: "" });
    const b = store.getState().createNoteNode({ title: "b", content: "" });
    store.getState().connectNodes({ sourceNodeId: a.id, targetNodeId: b.id, relationKind: "ref" });
    store.getState().deleteNode(a.id);
    expect(store.getState().edges).toHaveLength(0);
  });
});

describe("duplicateNode", () => {
  it("creates a new node with same data but new id and offset position", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const original = store.getState().createNoteNode({ title: "orig", content: "hello" });
    const copy = store.getState().duplicateNode(original.id);
    expect(copy).toBeDefined();
    expect(copy!.id).not.toBe(original.id);
    expect(copy!.title).toBe("orig");
    expect(copy!.position.x).toBe(original.position.x + 24);
    expect(copy!.position.y).toBe(original.position.y + 24);
  });

  it("does NOT inherit the original's graphNodeId — copy gets null graphNodeId when no override is supplied", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const PRE_MINTED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const original = store.getState().createNoteNode({
      title: "orig",
      content: "hello",
      id: PRE_MINTED,
      graphNodeId: PRE_MINTED,
    });
    expect(original.graphNodeId).toBe(PRE_MINTED);

    const copy = store.getState().duplicateNode(original.id);
    expect(copy).toBeDefined();
    // The duplicate must NOT share the original's graphNodeId
    expect(copy!.graphNodeId).not.toBe(PRE_MINTED);
    // Without a caller-supplied graphNodeId the copy should be null (pending Neo4j creation)
    expect(copy!.graphNodeId).toBeNull();
  });

  it("accepts a pre-minted graphNodeId override so the context layer can stamp its own Neo4j id", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const ORIG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const NEW_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const original = store.getState().createNoteNode({
      title: "orig",
      content: "hello",
      id: ORIG_ID,
      graphNodeId: ORIG_ID,
    });

    const copy = store.getState().duplicateNode(original.id, { id: NEW_ID, graphNodeId: NEW_ID });
    expect(copy).toBeDefined();
    expect(copy!.id).toBe(NEW_ID);
    expect(copy!.graphNodeId).toBe(NEW_ID);
    expect(copy!.graphNodeId).not.toBe(ORIG_ID);
  });
});

describe("updateNodeStyle", () => {
  it("updates style fields on the node", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const node = store.getState().createNoteNode({ title: "t", content: "" });
    store.getState().updateNodeStyle(node.id, {
      dotColour: "#ff0000",
      bgColour: "#102436",
      textColour: "#f5fbff",
      thumbnail: "asset://localhost/thumb.png",
    });
    const updated = store.getState().nodes.find((n) => n.id === node.id);
    expect(updated?.dotColour).toBe("#ff0000");
    expect(updated?.bgColour).toBe("#102436");
    expect(updated?.textColour).toBe("#f5fbff");
    expect(updated?.thumbnail).toBe("asset://localhost/thumb.png");
  });
});

describe("updateNodeTags", () => {
  it("updates note tags through the canvas store state", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const node = store.getState().createNoteNode({ title: "t", content: "" });

    store.getState().updateNodeTags(node.id, ["ql", "shadow"]);

    const updated = store.getState().nodes.find((n) => n.id === node.id);
    expect(updated?.type).toBe("note");
    if (updated?.type !== "note") throw new Error("not a note");
    expect(updated.tags).toEqual(["ql", "shadow"]);
  });

  it("ignores tag updates for non-note nodes rather than writing fake tag fields", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const node = store.getState().createResourceNode({
      title: "Source report",
      absolutePath: "/tmp/report.md",
      relativePath: "report.md",
      resourceKind: "markdown",
    });

    store.getState().updateNodeTags(node.id, ["ql"]);

    const updated = store.getState().nodes.find((n) => n.id === node.id);
    expect(updated?.type).toBe("resource");
    expect("tags" in (updated ?? {})).toBe(false);
  });
});

describe("updateNodeTimelineCard", () => {
  it("updates timeline-only card geometry without changing canvas size or position", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const node = store.getState().createNoteNode({ title: "t", content: "" });

    store.getState().updateNodeTimelineCard(node.id, { offsetY: 42, width: 310, height: 118 });

    const updated = store.getState().nodes.find((n) => n.id === node.id);
    expect(updated?.position).toEqual(node.position);
    expect(updated?.size).toEqual(node.size);
    expect(updated?.timelineCard).toEqual({ offsetY: 42, width: 310, height: 118 });
  });
});

describe("createPortalNode", () => {
  it("creates a constellation portal node with a target canvas and QL unit kind", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const node = store.getState().createPortalNode({
      title: "QL Unit",
      targetCanvasId: "2a2edca9-e4af-4b2d-b1aa-7353f2bb20f4",
      constellationKind: "ql-unit",
      id: "constellation-ql-unit",
      graphNodeId: "constellation-ql-unit",
      x: 144,
      y: 192,
    });

    expect(node.type).toBe("portal");
    if (node.type !== "portal") throw new Error("not portal");
    expect(node.targetCanvasId).toBe("2a2edca9-e4af-4b2d-b1aa-7353f2bb20f4");
    expect(node.constellationKind).toBe("ql-unit");
    expect(node.id).toBe("constellation-ql-unit");
    expect(node.graphNodeId).toBe("constellation-ql-unit");
    expect(node.position).toEqual({ x: 144, y: 192 });
  });
});

describe("updateNodeTitle", () => {
  it("updates the title of a node", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const node = store.getState().createNoteNode({ title: "old", content: "" });
    store.getState().updateNodeTitle(node.id, "new title");
    const updated = store.getState().nodes.find((n) => n.id === node.id);
    expect(updated?.title).toBe("new title");
  });

  it("adopts canonical graph substance after a confirmed metadata write", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const node = store.getState().createNoteNode({ title: "Local title", content: "" });

    store.getState().updateNodeGraph(node.id, {
      graphNodeId: "graph-1",
      entityType: "Event",
      title: "Canonical title",
      body: "[]",
      summary: "Canonical pith.",
      archetypalResonance: null,
      coordinate: null,
      sourceCoordinates: [],
      evidenceTags: ["archive"],
      sourceKind: null,
      contentOrigin: "user_authored",
      contentRevision: 0,
      seedSchemaVersion: null,
      bodySourceCoordinates: [],
      historicity: "historical",
      claimKind: "fact",
      evidenceStatus: "documented",
      temporalRole: "occurred_at",
      placeCoverage: "resolved",
      place: null,
      qlForm: null,
      qlUnitId: null,
      qlArc: null,
      qlTopology: null,
      qlSchemaVersion: null,
      qlSourceCoordinates: [],
      qlCompletenessStatus: null,
      isTemporal: true,
      validFrom: "1980-01-01",
      validTo: null,
      temporalPrecision: "year",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const updated = store.getState().nodes.find((candidate) => candidate.id === node.id);
    expect(updated?.title).toBe("Canonical title");
    expect(updated?.summary).toBe("Canonical pith.");
    expect(updated?.graph?.evidenceTags).toEqual(["archive"]);
  });
});

describe("updateNodeContent", () => {
  it("refreshes the reading summary without overwriting the canonical display title", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const node = store.getState().createNoteNode({ title: "old", content: "" });

    store
      .getState()
      .updateNodeContent(node.id, "# Working thesis\n\nSupport the claim with concrete evidence.");

    const updated = store.getState().nodes.find((candidate) => candidate.id === node.id);
    expect(updated?.title).toBe("old");
    expect(updated?.summary).toBe("Working thesis Support the claim with concrete evidence.");
  });
});

describe("deleteEdge", () => {
  it("removes the edge from the store", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const note = store.getState().createNoteNode({ title: "n", content: "" });
    const res = store.getState().createResourceNode({
      title: "r",
      absolutePath: "/tmp/r.md",
      relativePath: "r.md",
      resourceKind: "markdown"
    });
    const edge = store.getState().connectNodes({
      sourceNodeId: note.id,
      targetNodeId: res.id,
      relationKind: "ref"
    });
    store.getState().deleteEdge(edge.id);
    expect(store.getState().edges).toHaveLength(0);
    // nodes are untouched
    expect(store.getState().nodes).toHaveLength(2);
  });
});

describe("connectNodes", () => {
  it("keeps a supplied graph-relationship id so the local layout and semantic edge stay coupled", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const source = store.getState().createNoteNode({ title: "Source", content: "" });
    const target = store.getState().createNoteNode({ title: "Target", content: "" });

    const edge = store.getState().connectNodes({
      id: "graph:relationship-7",
      sourceNodeId: source.id,
      targetNodeId: target.id,
      relationKind: "SUPPORTS",
    });

    expect(edge.id).toBe("graph:relationship-7");
  });

  it("rebinds an existing layout edge after its graph relationship type changes", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const source = store.getState().createNoteNode({ title: "Source", content: "" });
    const target = store.getState().createNoteNode({ title: "Target", content: "" });
    const edge = store.getState().connectNodes({
      id: "graph:old-relationship",
      sourceNodeId: source.id,
      targetNodeId: target.id,
      relationKind: "SUPPORTS",
    });

    store.getState().rebindEdgeToGraphRelationship(edge.id, "new-relationship", "CONTESTS");

    expect(store.getState().edges[0]).toEqual(expect.objectContaining({
      id: "graph:new-relationship",
      relationKind: "CONTESTS",
      label: "CONTESTS",
    }));
  });
});

describe("updateEdgeRelationKind", () => {
  it("updates the persisted edge wording everywhere that reads relationKind", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const source = store.getState().createNoteNode({ title: "Source", content: "" });
    const target = store.getState().createNoteNode({ title: "Target", content: "" });
    const edge = store.getState().connectNodes({
      sourceNodeId: source.id,
      targetNodeId: target.id,
      relationKind: "reference",
    });

    store.getState().updateEdgeRelationKind(edge.id, "supports");

    const updated = store.getState().edges.find((candidate) => candidate.id === edge.id);
    expect(updated?.relationKind).toBe("supports");
    expect(updated?.label).toBe("supports");
  });
});

describe("edge authoring metadata", () => {
  it("stores the chosen handle anchors for new connections", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const source = store.getState().createNoteNode({ title: "source", content: "" });
    const target = store.getState().createNoteNode({ title: "target", content: "" });

    const edge = store.getState().connectNodes({
      sourceNodeId: source.id,
      targetNodeId: target.id,
      relationKind: "supports",
      sourceHandleId: "source-right",
      targetHandleId: "target-left",
    });

    expect(edge.sourceHandleId).toBe("source-right");
    expect(edge.targetHandleId).toBe("target-left");
    expect(edge.directionality).toBe("forward");
  });

  it("can reconnect an edge and cycle its directionality", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const a = store.getState().createNoteNode({ title: "A", content: "" });
    const b = store.getState().createNoteNode({ title: "B", content: "" });

    const edge = store.getState().connectNodes({
      sourceNodeId: a.id,
      targetNodeId: b.id,
      relationKind: "reference",
      sourceHandleId: "source-bottom",
      targetHandleId: "target-top",
    });

    store.getState().updateEdgeConnection(edge.id, {
      sourceHandleId: "source-left",
      targetHandleId: "target-right",
    });

    store.getState().cycleEdgeDirectionality(edge.id);
    store.getState().cycleEdgeDirectionality(edge.id);

    const updated = store.getState().edges.find((candidate) => candidate.id === edge.id);
    expect(updated?.sourceHandleId).toBe("source-left");
    expect(updated?.targetHandleId).toBe("target-right");
    expect(updated?.directionality).toBe("bidirectional");
  });
});

describe("canvasStore", () => {
  it("creates nodes, connects them, updates edge notes, and reloads the snapshot", () => {
    const store = createCanvasStore({
      canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f"
    });

    const noteNode = store.getState().createNoteNode({
      title: "Opening note",
      content: "The thesis starts here."
    });
    const resourceNode = store.getState().createResourceNode({
      title: "Source report",
      absolutePath: "/tmp/report.md",
      relativePath: "report.md",
      resourceKind: "markdown"
    });

    const edge = store.getState().connectNodes({
      sourceNodeId: noteNode.id,
      targetNodeId: resourceNode.id,
      relationKind: "supports"
    });
    store.getState().updateEdgeNote(edge.id, "Primary supporting source");

    const snapshot = store.getState().serialize();
    expect(snapshot.nodes).toHaveLength(2);
    expect(snapshot.edges).toHaveLength(1);
    expect(snapshot.edges[0].note).toBe("Primary supporting source");

    const reloadedStore = createCanvasStore({
      canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f"
    });
    reloadedStore.getState().hydrate(snapshot);

    expect(reloadedStore.getState().nodes).toHaveLength(2);
    expect(reloadedStore.getState().edges[0].relationKind).toBe("supports");
    expect(reloadedStore.getState().edges[0].note).toBe(
      "Primary supporting source",
    );
  });
});

test("toggleEdgeSequencing sets sequencing flag and priority", () => {
  const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
  const { connectNodes, createNoteNode } = store.getState();

  const nodeA = createNoteNode({ title: "A", content: "" });
  const nodeB = createNoteNode({ title: "B", content: "" });
  const edge = connectNodes({
    sourceNodeId: nodeA.id,
    targetNodeId: nodeB.id,
    relationKind: "causes",
  });

  expect(edge.sequencing).toBe(false);
  expect(edge.sequencePriority).toBe(0);

  store.getState().toggleEdgeSequencing(edge.id);
  const toggled = store.getState().edges.find((e) => e.id === edge.id)!;
  expect(toggled.sequencing).toBe(true);

  store.getState().toggleEdgeSequencing(edge.id);
  const toggledOff = store.getState().edges.find((e) => e.id === edge.id)!;
  expect(toggledOff.sequencing).toBe(false);
});

test("updateEdgeSequencePriority updates priority", () => {
  const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
  const { connectNodes, createNoteNode } = store.getState();

  const nodeA = createNoteNode({ title: "A", content: "" });
  const nodeB = createNoteNode({ title: "B", content: "" });
  const edge = connectNodes({
    sourceNodeId: nodeA.id,
    targetNodeId: nodeB.id,
    relationKind: "causes",
  });

  store.getState().updateEdgeSequencePriority(edge.id, 50);
  const updated = store.getState().edges.find((e) => e.id === edge.id)!;
  expect(updated.sequencePriority).toBe(50);
});

test("updateNodeSequenceCaption sets caption", () => {
  const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
  const node = store.getState().createNoteNode({ title: "Test", content: "" });

  store.getState().updateNodeSequenceCaption(node.id, "Opening shot");
  const updated = store.getState().nodes.find((n) => n.id === node.id)!;
  expect(updated.sequenceCaption).toBe("Opening shot");
});

test("captureNodeSequenceViewport sets viewport on node", () => {
  const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
  const node = store.getState().createNoteNode({ title: "Test", content: "" });
  const viewport = { x: 100, y: 200, zoom: 1.5 };

  store.getState().setNodeSequenceViewport(node.id, viewport);
  const updated = store.getState().nodes.find((n) => n.id === node.id)!;
  expect(updated.sequenceViewport).toEqual(viewport);
});

describe("pre-minted id and graphNodeId", () => {
  const PRE_MINTED = "22222222-2222-4222-8222-222222222222";

  it("createNoteNode uses a provided id and graphNodeId", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const node = store.getState().createNoteNode({
      title: "t",
      content: "",
      id: PRE_MINTED,
      graphNodeId: PRE_MINTED
    });
    expect(node.id).toBe(PRE_MINTED);
    expect(node.graphNodeId).toBe(PRE_MINTED);
  });

  it("createNoteNode mints a random id and graphNodeId defaults to null when no id supplied", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const node = store.getState().createNoteNode({ title: "t", content: "" });
    expect(typeof node.id).toBe("string");
    expect(node.id.length).toBeGreaterThan(0);
    expect(node.graphNodeId).toBeNull();
  });

  it("createGroupNode uses a provided id and graphNodeId", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const node = store.getState().createGroupNode({
      title: "g",
      x: 0,
      y: 0,
      id: PRE_MINTED,
      graphNodeId: PRE_MINTED
    });
    expect(node.id).toBe(PRE_MINTED);
    expect(node.graphNodeId).toBe(PRE_MINTED);
  });

  it("createResourceNode uses a provided id and graphNodeId", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const node = store.getState().createResourceNode({
      title: "r",
      absolutePath: "/tmp/r.md",
      relativePath: "r.md",
      resourceKind: "markdown",
      id: PRE_MINTED,
      graphNodeId: PRE_MINTED
    });
    expect(node.id).toBe(PRE_MINTED);
    expect(node.graphNodeId).toBe(PRE_MINTED);
  });
});

describe("note content migration", () => {
  it("createNoteNode stores plain text as BlockNote paragraph blocks", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const node = store.getState().createNoteNode({ title: "Legacy", content: "hello world" });
    expect(node.type).toBe("note");
    expect((node as { content: string }).content).toBe(
      JSON.stringify([
        { type: "paragraph", content: [{ type: "text", text: "hello world" }] },
      ]),
    );
  });

  it("createNoteNode keeps existing BlockNote JSON intact", () => {
    const blocks = [{ type: "heading", props: { level: 1 }, content: [{ type: "text", text: "Hi" }] }];
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const node = store.getState().createNoteNode({
      title: "Modern",
      content: JSON.stringify(blocks),
    });
    expect(node.type).toBe("note");
    expect(JSON.parse((node as { content: string }).content)).toEqual(blocks);
  });

  it("hydrate migrates legacy plain-text note content to BlockNote blocks", () => {
    const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
    const legacyNote = {
      id: "n1",
      canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
      graphNodeId: null,
      type: "note" as const,
      title: "Legacy note",
      position: { x: 0, y: 0 },
      size: { width: 240, height: 160 },
      summary: "",
      content: "plain text body",
      tags: ["note"],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    store.getState().hydrate({ nodes: [legacyNote as CanvasNode], edges: [] });
    const hydrated = store.getState().nodes[0];
    expect(hydrated).toBeDefined();
    expect(hydrated!.type).toBe("note");
    expect(JSON.parse((hydrated as { content: string }).content)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "plain text body" }] },
    ]);
    expect(hydrated!.summary).toBe("plain text body");
  });
});

describe("entityTypeForNodeType", () => {
  it("maps resource to Source", () => {
    expect(entityTypeForNodeType("resource")).toBe("Source");
  });

  it("maps note to Work", () => {
    expect(entityTypeForNodeType("note")).toBe("Work");
  });

  it("maps group to Work", () => {
    expect(entityTypeForNodeType("group")).toBe("Work");
  });

  it("maps portal to Constellation", () => {
    expect(entityTypeForNodeType("portal")).toBe("Constellation");
  });
});

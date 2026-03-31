import { describe, expect, it } from "vitest";

import { createCanvasStore } from "./canvasStore";

describe("deleteNode", () => {
  it("removes the node from the store", () => {
    const store = createCanvasStore({ canvasId: "c1" });
    const node = store.getState().createNoteNode({ title: "t", content: "" });
    store.getState().deleteNode(node.id);
    expect(store.getState().nodes.find((n) => n.id === node.id)).toBeUndefined();
  });

  it("also removes edges connected to that node", () => {
    const store = createCanvasStore({ canvasId: "c1" });
    const a = store.getState().createNoteNode({ title: "a", content: "" });
    const b = store.getState().createNoteNode({ title: "b", content: "" });
    store.getState().connectNodes({ sourceNodeId: a.id, targetNodeId: b.id, relationKind: "ref" });
    store.getState().deleteNode(a.id);
    expect(store.getState().edges).toHaveLength(0);
  });
});

describe("duplicateNode", () => {
  it("creates a new node with same data but new id and offset position", () => {
    const store = createCanvasStore({ canvasId: "c1" });
    const original = store.getState().createNoteNode({ title: "orig", content: "hello" });
    const copy = store.getState().duplicateNode(original.id);
    expect(copy).toBeDefined();
    expect(copy!.id).not.toBe(original.id);
    expect(copy!.title).toBe("orig");
    expect(copy!.position.x).toBe(original.position.x + 24);
    expect(copy!.position.y).toBe(original.position.y + 24);
  });
});

describe("updateNodeStyle", () => {
  it("updates style fields on the node", () => {
    const store = createCanvasStore({ canvasId: "c1" });
    const node = store.getState().createNoteNode({ title: "t", content: "" });
    store.getState().updateNodeStyle(node.id, { dotColour: "#ff0000" });
    const updated = store.getState().nodes.find((n) => n.id === node.id);
    expect(updated?.dotColour).toBe("#ff0000");
  });
});

describe("updateNodeTitle", () => {
  it("updates the title of a node", () => {
    const store = createCanvasStore({ canvasId: "c1" });
    const node = store.getState().createNoteNode({ title: "old", content: "" });
    store.getState().updateNodeTitle(node.id, "new title");
    const updated = store.getState().nodes.find((n) => n.id === node.id);
    expect(updated?.title).toBe("new title");
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

import { describe, expect, test } from "vitest";
import { walkSequenceGraph } from "./walkSequenceGraph";
import type { CanvasEdge, CanvasNode } from "@research-canvas/schema";

function makeNode(id: string): CanvasNode {
  return {
    id,
    canvasId: "c1",
    type: "note",
    title: id,
    position: { x: 0, y: 0 },
    size: { width: 200, height: 150 },
    summary: "",
    content: "",
    tags: [],
    sequenceCaption: null,
    sequenceViewport: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as CanvasNode;
}

function makeEdge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  sequencing: boolean,
  opts?: { label?: string; sequencePriority?: number }
): CanvasEdge {
  return {
    id,
    canvasId: "c1",
    sourceNodeId,
    targetNodeId,
    relationKind: "causes",
    directionality: "forward",
    label: opts?.label ?? "causes",
    note: "",
    style: { stroke: "#f0b45a", width: 2, dashed: false },
    sequencing,
    sequencePriority: opts?.sequencePriority ?? 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as CanvasEdge;
}

describe("walkSequenceGraph", () => {
  test("returns empty graph when no sequencing edges", () => {
    const nodes = [makeNode("A"), makeNode("B")];
    const edges = [makeEdge("e1", "A", "B", false)];
    const graph = walkSequenceGraph(nodes, edges);

    expect(graph.roots).toEqual([]);
    expect(graph.nodeSet.size).toBe(0);
    expect(graph.terminalNodes).toEqual([]);
    expect(graph.hasCycles).toBe(false);
  });

  test("detects single root and terminal in linear sequence", () => {
    const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
    const edges = [
      makeEdge("e1", "A", "B", true),
      makeEdge("e2", "B", "C", true),
    ];
    const graph = walkSequenceGraph(nodes, edges);

    expect(graph.roots).toEqual(["A"]);
    expect(graph.terminalNodes).toEqual(["C"]);
    expect(graph.nodeSet).toEqual(new Set(["A", "B", "C"]));
    expect(graph.hasCycles).toBe(false);

    const exitsA = graph.adjacency.get("A")!;
    expect(exitsA).toHaveLength(1);
    expect(exitsA[0].targetNodeId).toBe("B");
  });

  test("detects branch point with multiple exits sorted by priority", () => {
    const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
    const edges = [
      makeEdge("e1", "A", "B", true, { label: "path B", sequencePriority: 50 }),
      makeEdge("e2", "A", "C", true, { label: "path C", sequencePriority: 10 }),
    ];
    const graph = walkSequenceGraph(nodes, edges);

    expect(graph.roots).toEqual(["A"]);
    const exits = graph.adjacency.get("A")!;
    expect(exits).toHaveLength(2);
    expect(exits[0].label).toBe("path C"); // priority 10 first
    expect(exits[1].label).toBe("path B"); // priority 50 second
  });

  test("detects cycles", () => {
    const nodes = [makeNode("A"), makeNode("B")];
    const edges = [
      makeEdge("e1", "A", "B", true),
      makeEdge("e2", "B", "A", true),
    ];
    const graph = walkSequenceGraph(nodes, edges);

    expect(graph.hasCycles).toBe(true);
    expect(graph.roots).toEqual([]); // both have incoming
  });

  test("multiple roots when graph has disconnected sequences", () => {
    const nodes = [makeNode("A"), makeNode("B"), makeNode("C"), makeNode("D")];
    const edges = [
      makeEdge("e1", "A", "B", true),
      makeEdge("e2", "C", "D", true),
    ];
    const graph = walkSequenceGraph(nodes, edges);

    expect(graph.roots.sort()).toEqual(["A", "C"]);
    expect(graph.terminalNodes.sort()).toEqual(["B", "D"]);
  });

  test("ignores non-sequencing edges", () => {
    const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
    const edges = [
      makeEdge("e1", "A", "B", true),
      makeEdge("e2", "B", "C", false), // not sequencing
    ];
    const graph = walkSequenceGraph(nodes, edges);

    expect(graph.nodeSet).toEqual(new Set(["A", "B"]));
    expect(graph.terminalNodes).toEqual(["B"]);
  });
});

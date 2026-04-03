import type { CanvasEdge, CanvasNode } from "@research-canvas/schema";

export interface SequenceExit {
  edgeId: string;
  targetNodeId: string;
  label: string;
  priority: number;
}

export interface SequenceGraph {
  roots: string[];
  adjacency: Map<string, SequenceExit[]>;
  nodeSet: Set<string>;
  hasCycles: boolean;
  terminalNodes: string[];
}

export function walkSequenceGraph(
  _nodes: CanvasNode[],
  edges: CanvasEdge[]
): SequenceGraph {
  const sequencingEdges = edges.filter((e) => e.sequencing);

  if (sequencingEdges.length === 0) {
    return {
      roots: [],
      adjacency: new Map(),
      nodeSet: new Set(),
      hasCycles: false,
      terminalNodes: [],
    };
  }

  const adjacency = new Map<string, SequenceExit[]>();
  const nodeSet = new Set<string>();
  const hasIncoming = new Set<string>();

  for (const edge of sequencingEdges) {
    nodeSet.add(edge.sourceNodeId);
    nodeSet.add(edge.targetNodeId);
    hasIncoming.add(edge.targetNodeId);

    const exits = adjacency.get(edge.sourceNodeId) ?? [];
    exits.push({
      edgeId: edge.id,
      targetNodeId: edge.targetNodeId,
      label: edge.label,
      priority: edge.sequencePriority,
    });
    adjacency.set(edge.sourceNodeId, exits);
  }

  // Sort exits by priority (ascending), then label as tiebreaker
  for (const exits of adjacency.values()) {
    exits.sort((a, b) =>
      a.priority !== b.priority
        ? a.priority - b.priority
        : a.label.localeCompare(b.label)
    );
  }

  const roots = [...nodeSet].filter((id) => !hasIncoming.has(id));

  const terminalNodes = [...nodeSet].filter(
    (id) => !adjacency.has(id) || adjacency.get(id)!.length === 0
  );

  // Cycle detection via DFS
  const hasCycles = detectCycles(adjacency, nodeSet);

  return { roots, adjacency, nodeSet, hasCycles, terminalNodes };
}

function detectCycles(
  adjacency: Map<string, SequenceExit[]>,
  nodeSet: Set<string>
): boolean {
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (inStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    inStack.add(nodeId);

    for (const exit of adjacency.get(nodeId) ?? []) {
      if (dfs(exit.targetNodeId)) return true;
    }

    inStack.delete(nodeId);
    return false;
  }

  for (const nodeId of nodeSet) {
    if (dfs(nodeId)) return true;
  }

  return false;
}

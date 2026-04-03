import { useMemo } from "react";
import type { CanvasNode } from "@research-canvas/schema";
import type { SequenceGraph } from "./walkSequenceGraph";

interface SequenceMapProps {
  graph: SequenceGraph;
  nodes: CanvasNode[];
  currentNodeId?: string | null;
  visitedNodeIds?: string[];
  onClickNode?: (nodeId: string) => void;
}

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  title: string;
  isRoot: boolean;
  isTerminal: boolean;
}

interface LayoutEdge {
  from: string;
  to: string;
}

const NODE_W = 10;
const NODE_H = 10;
const H_GAP = 24;
const V_GAP = 20;
const PADDING = 12;

export function SequenceMap({
  graph,
  nodes,
  currentNodeId,
  visitedNodeIds = [],
  onClickNode,
}: SequenceMapProps) {
  const layout = useMemo(() => computeLayout(graph, nodes), [graph, nodes]);

  if (layout.nodes.length === 0) return null;

  const visitedSet = new Set(visitedNodeIds);

  return (
    <div className="sequence-map">
      <svg
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
      >
        {layout.edges.map((edge) => {
          const from = layout.nodes.find((n) => n.id === edge.from);
          const to = layout.nodes.find((n) => n.id === edge.to);
          if (!from || !to) return null;
          return (
            <line
              key={`${edge.from}-${edge.to}`}
              x1={from.x + NODE_W / 2}
              y1={from.y + NODE_H}
              x2={to.x + NODE_W / 2}
              y2={to.y}
              className="sm-edge"
            />
          );
        })}
        {layout.nodes.map((layoutNode) => {
          const isCurrent = layoutNode.id === currentNodeId;
          const isVisited = visitedSet.has(layoutNode.id);
          return (
            <g
              key={layoutNode.id}
              className="sm-node"
              data-current={isCurrent ? "true" : "false"}
              data-visited={isVisited ? "true" : "false"}
              onClick={() => onClickNode?.(layoutNode.id)}
              style={{ cursor: onClickNode ? "pointer" : "default" }}
            >
              {layoutNode.isTerminal ? (
                <rect x={layoutNode.x} y={layoutNode.y} width={NODE_W} height={NODE_H} rx={2} />
              ) : (
                <circle cx={layoutNode.x + NODE_W / 2} cy={layoutNode.y + NODE_H / 2} r={NODE_W / 2} />
              )}
              <title>{layoutNode.title}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function computeLayout(
  graph: SequenceGraph,
  nodes: CanvasNode[]
): { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number } {
  if (graph.nodeSet.size === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const titleMap = new Map<string, string>();
  for (const n of nodes) {
    titleMap.set(n.id, n.title);
  }

  const terminalSet = new Set(graph.terminalNodes);
  const rootSet = new Set(graph.roots);

  const depths = new Map<string, number>();
  const queue: string[] = [...graph.roots];
  for (const r of queue) depths.set(r, 0);

  if (queue.length === 0) {
    const first = [...graph.nodeSet][0];
    queue.push(first);
    depths.set(first, 0);
  }

  let head = 0;
  while (head < queue.length) {
    const nodeId = queue[head++];
    const depth = depths.get(nodeId) ?? 0;
    for (const exit of graph.adjacency.get(nodeId) ?? []) {
      if (!depths.has(exit.targetNodeId)) {
        depths.set(exit.targetNodeId, depth + 1);
        queue.push(exit.targetNodeId);
      }
    }
  }

  const byDepth = new Map<number, string[]>();
  for (const [nodeId, depth] of depths) {
    const list = byDepth.get(depth) ?? [];
    list.push(nodeId);
    byDepth.set(depth, list);
  }

  const maxDepth = Math.max(...byDepth.keys(), 0);
  const layoutNodes: LayoutNode[] = [];

  for (let d = 0; d <= maxDepth; d++) {
    const row = byDepth.get(d) ?? [];
    row.forEach((nodeId, i) => {
      layoutNodes.push({
        id: nodeId,
        x: PADDING + i * (NODE_W + H_GAP),
        y: PADDING + d * (NODE_H + V_GAP),
        title: titleMap.get(nodeId) ?? nodeId,
        isRoot: rootSet.has(nodeId),
        isTerminal: terminalSet.has(nodeId),
      });
    });
  }

  const layoutEdges: LayoutEdge[] = [];
  for (const [sourceId, exits] of graph.adjacency) {
    for (const exit of exits) {
      layoutEdges.push({ from: sourceId, to: exit.targetNodeId });
    }
  }

  const maxX = Math.max(...layoutNodes.map((n) => n.x + NODE_W), 0) + PADDING;
  const maxY = Math.max(...layoutNodes.map((n) => n.y + NODE_H), 0) + PADDING;

  return { nodes: layoutNodes, edges: layoutEdges, width: maxX, height: maxY };
}

import {
  edgeLayoutFromCanvasEdge,
  nodeLayoutFromCanvasNode,
  type EdgeLayout,
  type NodeLayout,
} from "@research-canvas/desktop-api";

import type { CanvasSnapshot } from "./canvasStore";

export interface LayoutSnapshot {
  layouts: NodeLayout[];
  edges: EdgeLayout[];
}

export function serializeLayoutSnapshot(snapshot: CanvasSnapshot): LayoutSnapshot {
  return {
    layouts: snapshot.nodes.map(nodeLayoutFromCanvasNode),
    edges: snapshot.edges.map(edgeLayoutFromCanvasEdge),
  };
}

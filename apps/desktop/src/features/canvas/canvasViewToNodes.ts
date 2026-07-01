/**
 * canvasViewToNodes.ts
 *
 * Pure mapper: CanvasView (from loadCanvasView) → { nodes: CanvasNode[]; edges: CanvasEdge[] }
 * Used in CanvasWorkspaceContext to hydrate the canvas store from Neo4j-joined data
 * instead of from the legacy loadProjectDocument nodes/edges fields.
 */

import { nodeSchema, edgeSchema } from "@research-canvas/schema";
import type { CanvasNode, CanvasEdge } from "@research-canvas/schema";
import type { CanvasView } from "@research-canvas/desktop-api";

export function canvasViewToCanvasNodes(view: CanvasView): {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
} {
  const now = new Date().toISOString();

  const nodes: CanvasNode[] = [];
  for (const joined of view.nodes) {
    const { node, layout } = joined;

    const parsed = nodeSchema.parse({
      type: "note",
      id: node.graphNodeId,
      graphNodeId: node.graphNodeId,
      canvasId: view.canvasId,
      title: node.title,
      content: "",
      summary: node.summary ?? "",
      position: { x: layout.positionX, y: layout.positionY },
      size: { width: layout.width, height: layout.height },
      dotColour: layout.style.dotColour ?? null,
      bgColour: layout.style.bgColour ?? null,
      textColour: layout.style.textColour ?? null,
      thumbnail: layout.style.thumbnail ?? null,
      tags: [],
      sequenceCaption: null,
      sequenceViewport: null,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    });

    nodes.push(parsed);
  }

  const edges: CanvasEdge[] = [];
  for (const edgeLayout of view.edges) {
    const parsed = edgeSchema.parse({
      id: edgeLayout.id,
      canvasId: view.canvasId,
      sourceNodeId: edgeLayout.sourceGraphNodeId,
      targetNodeId: edgeLayout.targetGraphNodeId,
      relationKind: edgeLayout.relationKind,
      sourceHandleId: edgeLayout.sourceHandleId ?? null,
      targetHandleId: edgeLayout.targetHandleId ?? null,
      directionality: "forward",
      label: edgeLayout.relationKind,
      note: "",
      style: {
        stroke: edgeLayout.style.stroke ?? "#888888",
        width: edgeLayout.style.width ?? 1,
        dashed: edgeLayout.style.dashed ?? false,
      },
      sequencing: false,
      sequencePriority: 0,
      createdAt: now,
      updatedAt: now,
    });

    edges.push(parsed);
  }

  return { nodes, edges };
}

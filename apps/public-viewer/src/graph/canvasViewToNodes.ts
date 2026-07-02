/**
 * canvasViewToNodes.ts (web-local mirror of
 * apps/desktop/src/features/canvas/canvasViewToNodes.ts)
 *
 * Pure mapper: CanvasView (from transport.loadCanvasView) →
 * { nodes: CanvasNode[]; edges: CanvasEdge[] }, the shape the SHARED
 * <CanvasView> component consumes. The web renders the same canvas view code
 * as the desktop; only the data source (static bundle) and interactivity
 * (read-only) differ.
 */

import { nodeSchema, edgeSchema } from "@research-canvas/schema";
import type { CanvasNode, CanvasEdge } from "@research-canvas/schema";
import type { CanvasView, CanvasNodeSidecar } from "@research-canvas/desktop-api";

export function canvasViewToCanvasNodes(view: CanvasView): {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
} {
  const now = new Date().toISOString();

  const nodes: CanvasNode[] = [];
  for (const joined of view.nodes) {
    const { node, layout } = joined;
    const sidecar = layout.style.__canvasNode as CanvasNodeSidecar | undefined;

    let parsed: CanvasNode;
    if (sidecar?.type === "resource") {
      parsed = nodeSchema.parse({
        type: "resource",
        id: node.graphNodeId,
        graphNodeId: node.graphNodeId,
        canvasId: view.canvasId,
        title: node.title,
        summary: node.summary ?? "",
        position: { x: layout.positionX, y: layout.positionY },
        size: { width: layout.width, height: layout.height },
        dotColour: layout.style.dotColour ?? null,
        bgColour: layout.style.bgColour ?? null,
        textColour: layout.style.textColour ?? null,
        thumbnail: layout.style.thumbnail ?? null,
        resourceKind: sidecar.resourceKind,
        absolutePath: sidecar.absolutePath,
        relativePath: sidecar.relativePath,
        mimeType: sidecar.mimeType,
        fileFingerprint: sidecar.fileFingerprint,
        sequenceCaption: null,
        sequenceViewport: null,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      });
    } else if (sidecar?.type === "group") {
      parsed = nodeSchema.parse({
        type: "group",
        id: node.graphNodeId,
        graphNodeId: node.graphNodeId,
        canvasId: view.canvasId,
        title: node.title,
        summary: node.summary ?? "",
        position: { x: layout.positionX, y: layout.positionY },
        size: { width: layout.width, height: layout.height },
        dotColour: layout.style.dotColour ?? null,
        bgColour: layout.style.bgColour ?? null,
        textColour: layout.style.textColour ?? null,
        thumbnail: layout.style.thumbnail ?? null,
        color: sidecar.color,
        childNodeIds: sidecar.childNodeIds,
        sequenceCaption: null,
        sequenceViewport: null,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      });
    } else if (sidecar?.type === "portal") {
      parsed = nodeSchema.parse({
        type: "portal",
        id: node.graphNodeId,
        graphNodeId: node.graphNodeId,
        canvasId: view.canvasId,
        title: node.title,
        summary: node.summary ?? "",
        position: { x: layout.positionX, y: layout.positionY },
        size: { width: layout.width, height: layout.height },
        dotColour: layout.style.dotColour ?? null,
        bgColour: layout.style.bgColour ?? null,
        textColour: layout.style.textColour ?? null,
        thumbnail: layout.style.thumbnail ?? null,
        targetCanvasId: sidecar.targetCanvasId,
        sequenceCaption: null,
        sequenceViewport: null,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      });
    } else {
      // note type (sidecar?.type === "note") OR no sidecar (graph-only /
      // agent-authored node surfaced via defaultLayoutFor auto-placement).
      parsed = nodeSchema.parse({
        type: "note",
        id: node.graphNodeId,
        graphNodeId: node.graphNodeId,
        canvasId: view.canvasId,
        title: node.title,
        content: sidecar?.type === "note" ? sidecar.content : "",
        summary: node.summary ?? "",
        position: { x: layout.positionX, y: layout.positionY },
        size: { width: layout.width, height: layout.height },
        dotColour: layout.style.dotColour ?? null,
        bgColour: layout.style.bgColour ?? null,
        textColour: layout.style.textColour ?? null,
        thumbnail: layout.style.thumbnail ?? null,
        tags: sidecar?.type === "note" ? sidecar.tags : [],
        sequenceCaption: null,
        sequenceViewport: null,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      });
    }

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

/**
 * canvasViewToNodes.ts
 *
 * Pure mapper: CanvasView (from loadCanvasView) → { nodes: CanvasNode[]; edges: CanvasEdge[] }
 * Used in CanvasWorkspaceContext to hydrate the canvas store from Neo4j-joined data
 * instead of from the legacy loadConstellationDocument nodes/edges fields.
 */

import { nodeSchema, edgeSchema } from "@research-canvas/schema";
import type { CanvasNode, CanvasEdge } from "@research-canvas/schema";
import type { CanvasView, CanvasNodeSidecar } from "@research-canvas/desktop-api";

/** Used only when neither the joined GraphNode nor the layout sidecar carries
 *  a usable title — should be rare (e.g. a layout row written before the
 *  sidecar carried a title, with no synced Neo4j node either). Mirrors the
 *  Rust-side SYNTHESIZED_DEFAULT_TITLE fallback in canvas_service.rs. */
const SYNTHESIZED_DEFAULT_TITLE = "Untitled";

export function canvasViewToCanvasNodes(view: CanvasView): {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
} {
  const now = new Date().toISOString();

  const nodes: CanvasNode[] = [];
  for (const joined of view.nodes) {
    const { node, layout } = joined;
    const createdAt = canonicalCanvasTimestamp(node.createdAt, now);
    const updatedAt = canonicalCanvasTimestamp(node.updatedAt, now);
    const sidecar = layout.style.__canvasNode as CanvasNodeSidecar | undefined;
    // Local-first title reconstruction (lf-task-3): the joined GraphNode's
    // title wins when Neo4j substance is actually present, but a layout row
    // whose best-effort sync hasn't landed (or Neo4j is unreachable) gets a
    // synthesized GraphNode with no real title — fall back to the sidecar's
    // title, which is always written locally by nodeLayoutFromCanvasNode.
    const title = node.title || sidecar?.title || SYNTHESIZED_DEFAULT_TITLE;

    let parsed: CanvasNode;
    if (sidecar?.type === "resource") {
      parsed = nodeSchema.parse({
        type: "resource",
        id: node.graphNodeId,
        graphNodeId: node.graphNodeId,
        graph: node,
        canvasId: view.canvasId,
        title,
        summary: node.summary ?? "",
        position: { x: layout.positionX, y: layout.positionY },
        size: { width: layout.width, height: layout.height },
        dotColour: layout.style.dotColour ?? null,
        bgColour: layout.style.bgColour ?? null,
        textColour: layout.style.textColour ?? null,
        thumbnail: layout.style.thumbnail ?? null,
        timelineCard: layout.style.__timelineCard ?? null,
        resourceKind: sidecar.resourceKind,
        absolutePath: sidecar.absolutePath,
        relativePath: sidecar.relativePath,
        mimeType: sidecar.mimeType,
        fileFingerprint: sidecar.fileFingerprint,
        sequenceCaption: null,
        sequenceViewport: null,
        createdAt,
        updatedAt,
      });
    } else if (sidecar?.type === "group") {
      parsed = nodeSchema.parse({
        type: "group",
        id: node.graphNodeId,
        graphNodeId: node.graphNodeId,
        graph: node,
        canvasId: view.canvasId,
        title,
        summary: node.summary ?? "",
        position: { x: layout.positionX, y: layout.positionY },
        size: { width: layout.width, height: layout.height },
        dotColour: layout.style.dotColour ?? null,
        bgColour: layout.style.bgColour ?? null,
        textColour: layout.style.textColour ?? null,
        thumbnail: layout.style.thumbnail ?? null,
        timelineCard: layout.style.__timelineCard ?? null,
        color: sidecar.color,
        childNodeIds: sidecar.childNodeIds,
        sequenceCaption: null,
        sequenceViewport: null,
        createdAt,
        updatedAt,
      });
    } else if (sidecar?.type === "portal") {
      parsed = nodeSchema.parse({
        type: "portal",
        id: node.graphNodeId,
        graphNodeId: node.graphNodeId,
        graph: node,
        canvasId: view.canvasId,
        title,
        summary: node.summary ?? "",
        position: { x: layout.positionX, y: layout.positionY },
        size: { width: layout.width, height: layout.height },
        dotColour: layout.style.dotColour ?? null,
        bgColour: layout.style.bgColour ?? null,
        textColour: layout.style.textColour ?? null,
        thumbnail: layout.style.thumbnail ?? null,
        timelineCard: layout.style.__timelineCard ?? null,
        targetCanvasId: sidecar.targetCanvasId,
        constellationKind: sidecar.constellationKind ?? "standard",
        sequenceCaption: null,
        sequenceViewport: null,
        createdAt,
        updatedAt,
      });
    } else {
      // note type (sidecar?.type === "note") OR no sidecar (graph-only / agent-authored node)
      parsed = nodeSchema.parse({
        type: "note",
        id: node.graphNodeId,
        graphNodeId: node.graphNodeId,
        graph: node,
        canvasId: view.canvasId,
        title,
        content: sidecar?.type === "note" ? sidecar.content : "",
        summary: node.summary ?? "",
        position: { x: layout.positionX, y: layout.positionY },
        size: { width: layout.width, height: layout.height },
        dotColour: layout.style.dotColour ?? null,
        bgColour: layout.style.bgColour ?? null,
        textColour: layout.style.textColour ?? null,
        thumbnail: layout.style.thumbnail ?? null,
        timelineCard: layout.style.__timelineCard ?? null,
        tags: sidecar?.type === "note" ? sidecar.tags : [],
        sequenceCaption: null,
        sequenceViewport: null,
        createdAt,
        updatedAt,
      });
    }

    nodes.push(parsed);
  }

  const edges: CanvasEdge[] = [];
  const persistedRelationshipKeys = new Set<string>();
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
    persistedRelationshipKeys.add(relationshipKey(
      edgeLayout.sourceGraphNodeId,
      edgeLayout.targetGraphNodeId,
      edgeLayout.relationKind,
    ));
  }

  // Graph relationships are the semantic source of truth. Layout edges only
  // hold presentation (anchors, stroke, annotations), so surface a virtual
  // edge for every semantic link whose two endpoints are visible here.  A
  // matching persisted layout edge supplies the drawing instead, preventing
  // the same relationship from appearing twice after a canvas reload.
  const visibleGraphNodeIds = new Set(nodes.map((node) => node.graphNodeId ?? node.id));
  for (const relationship of view.relationships) {
    if (
      !visibleGraphNodeIds.has(relationship.sourceGraphNodeId)
      || !visibleGraphNodeIds.has(relationship.targetGraphNodeId)
      || persistedRelationshipKeys.has(relationshipKey(
        relationship.sourceGraphNodeId,
        relationship.targetGraphNodeId,
        relationship.relType,
      ))
    ) {
      continue;
    }

    const style = styleForRelationship(relationship.relType);
    edges.push(edgeSchema.parse({
      id: `graph:${relationship.id}`,
      canvasId: view.canvasId,
      sourceNodeId: relationship.sourceGraphNodeId,
      targetNodeId: relationship.targetGraphNodeId,
      relationKind: relationship.relType,
      directionality: "forward",
      label: relationship.relType,
      note: "",
      style,
      sequencing: false,
      sequencePriority: 0,
      createdAt: now,
      updatedAt: now,
    }));
  }

  return { nodes, edges };
}

/**
 * Neo4j and SQLite legitimately serialise UTC as either `Z` or `+00:00`.
 * Canvas nodes use a stricter `Z` contract, so normalize at the joined-read
 * boundary rather than rejecting an otherwise valid graph view wholesale.
 */
function canonicalCanvasTimestamp(value: string, fallback: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? fallback : date.toISOString();
}

function relationshipKey(source: string, target: string, relationKind: string) {
  return `${source}\u0000${target}\u0000${relationKind}`;
}

function styleForRelationship(relationKind: string) {
  if (["NESTS", "CONTAINS", "PART_OF"].includes(relationKind)) {
    return { stroke: "#8fd3ff", width: 2, dashed: false };
  }
  if (["CONTESTS", "CONTRADICTS"].includes(relationKind)) {
    return { stroke: "#e07a6f", width: 2, dashed: true };
  }
  if (["SUPPORTS", "EVIDENCES", "CAUSES", "PRECEDES"].includes(relationKind)) {
    return { stroke: "#79c0d4", width: 2, dashed: false };
  }
  return { stroke: "#b9a784", width: 1, dashed: true };
}

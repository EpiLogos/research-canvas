import type { CanvasNode, GraphNodeContract } from "@research-canvas/schema";

export interface ReaderRecord {
  kind: "graph" | "resource" | "canvas";
  graphNodeId: string | null;
  canvasNode: CanvasNode | null;
  graphNode: GraphNodeContract | null;
  title: string;
  pith: string;
  coverReference: string | null;
  evidenceTags: string[];
  sourceCoordinates: string[];
  bodySourceCoordinates: string[];
  temporal: {
    validFrom: string | null;
    validTo: string | null;
    precision: GraphNodeContract["temporalPrecision"];
  } | null;
  placeCoverage: GraphNodeContract["placeCoverage"];
}

/**
 * Normalises the material a reader needs before any view-specific rendering.
 * A timeline supplies graph substance directly; a canvas supplies graph
 * substance plus optional local presentation. Neither path invents a second
 * kind of node just to make the reader render.
 */
export function readerRecordFromGraphNode(graphNode: GraphNodeContract): ReaderRecord {
  return graphReaderRecord(graphNode, null, null);
}

export function readerRecordFromCanvasNode(canvasNode: CanvasNode): ReaderRecord {
  if (canvasNode.graph) {
    return graphReaderRecord(canvasNode.graph, canvasNode, canvasNode.thumbnail ?? null);
  }

  if (canvasNode.type === "resource") {
    return {
      kind: "resource",
      graphNodeId: canvasNode.graphNodeId,
      canvasNode,
      graphNode: null,
      title: canvasNode.title,
      pith: canvasNode.summary,
      coverReference: canvasNode.thumbnail
        ?? (canvasNode.resourceKind === "image" ? canvasNode.absolutePath : null),
      evidenceTags: [],
      sourceCoordinates: [],
      bodySourceCoordinates: [],
      temporal: null,
      placeCoverage: null,
    };
  }

  return {
    kind: "canvas",
    graphNodeId: canvasNode.graphNodeId,
    canvasNode,
    graphNode: null,
    title: canvasNode.title,
    pith: canvasNode.summary,
    coverReference: canvasNode.thumbnail ?? null,
    evidenceTags: canvasNode.type === "note" ? canvasNode.tags : [],
    sourceCoordinates: [],
    bodySourceCoordinates: [],
    temporal: null,
    placeCoverage: null,
  };
}

function graphReaderRecord(
  graphNode: GraphNodeContract,
  canvasNode: CanvasNode | null,
  preferredCover: string | null,
): ReaderRecord {
  return {
    kind: "graph",
    graphNodeId: graphNode.graphNodeId,
    canvasNode,
    graphNode,
    title: graphNode.title,
    pith: graphNode.summary,
    coverReference: preferredCover ?? firstImageReference(graphNode.body),
    evidenceTags: graphNode.evidenceTags,
    sourceCoordinates: graphNode.sourceCoordinates,
    bodySourceCoordinates: graphNode.bodySourceCoordinates,
    temporal: graphNode.isTemporal
      ? {
          validFrom: graphNode.validFrom,
          validTo: graphNode.validTo,
          precision: graphNode.temporalPrecision,
        }
      : null,
    placeCoverage: graphNode.placeCoverage,
  };
}

function firstImageReference(body: string): string | null {
  try {
    const blocks = JSON.parse(body) as unknown;
    return firstImageReferenceInValue(blocks);
  } catch {
    return null;
  }
}

function firstImageReferenceInValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const reference = firstImageReferenceInValue(item);
      if (reference) return reference;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;

  const block = value as { type?: unknown; props?: unknown; children?: unknown };
  if (block.type === "image" && block.props && typeof block.props === "object") {
    const url = (block.props as { url?: unknown }).url;
    if (typeof url === "string" && url.trim()) return url.trim();
  }
  return firstImageReferenceInValue(block.children);
}

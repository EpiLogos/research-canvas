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
  /** Statement status is distinct from its temporal placement. */
  narrative: {
    historicity: GraphNodeContract["historicity"];
    claimKind: GraphNodeContract["claimKind"];
    evidenceStatus: GraphNodeContract["evidenceStatus"];
    temporalRole: GraphNodeContract["temporalRole"];
    sourceKind: GraphNodeContract["sourceKind"];
  };
  /** Preserves QL structure and its own provenance in the shared reader. */
  ql: {
    form: GraphNodeContract["qlForm"];
    unitId: string | null;
    arc: GraphNodeContract["qlArc"];
    topology: GraphNodeContract["qlTopology"];
    schemaVersion: number | null;
    sourceCoordinates: string[];
    completeness: GraphNodeContract["qlCompletenessStatus"];
  } | null;
  /** Geographic tags name a place; placeCoverage only says whether it was mapped. */
  placeTags: string[];
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
      narrative: emptyNarrative(),
      ql: null,
      placeTags: [],
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
    narrative: emptyNarrative(),
    ql: null,
    placeTags: [],
    temporal: null,
    placeCoverage: null,
  };
}

/**
 * Replaces only the canonical graph substance of an already-open reader.
 * This deliberately preserves the originating canvas/timeline context and an
 * explicitly chosen cover while letting local-first mutations become visible
 * without closing and reopening the reader surface.
 */
export function readerRecordWithGraphNode(
  record: ReaderRecord,
  graphNode: GraphNodeContract,
): ReaderRecord {
  return graphReaderRecord(graphNode, record.canvasNode, record.coverReference);
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
    evidenceTags: graphNode.evidenceTags ?? [],
    sourceCoordinates: graphNode.sourceCoordinates ?? [],
    bodySourceCoordinates: graphNode.bodySourceCoordinates ?? [],
    narrative: {
      historicity: graphNode.historicity,
      claimKind: graphNode.claimKind,
      evidenceStatus: graphNode.evidenceStatus,
      temporalRole: graphNode.temporalRole,
      sourceKind: graphNode.sourceKind,
    },
    ql: graphNode.qlForm || graphNode.qlUnitId || (graphNode.qlSourceCoordinates?.length ?? 0) > 0
      ? {
          form: graphNode.qlForm,
          unitId: graphNode.qlUnitId,
          arc: graphNode.qlArc,
          topology: graphNode.qlTopology,
          schemaVersion: graphNode.qlSchemaVersion,
          sourceCoordinates: graphNode.qlSourceCoordinates ?? [],
          completeness: graphNode.qlCompletenessStatus,
        }
      : null,
    placeTags: (graphNode.evidenceTags ?? []).filter((tag) => tag.startsWith("place:")),
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

function emptyNarrative(): ReaderRecord["narrative"] {
  return {
    historicity: null,
    claimKind: null,
    evidenceStatus: null,
    temporalRole: null,
    sourceKind: null,
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

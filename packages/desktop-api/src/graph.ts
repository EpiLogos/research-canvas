// packages/desktop-api/src/graph.ts

import type {
  ClaimKind,
  ContentOrigin,
  EntityType,
  EvidenceStatus,
  Historicity,
  PlaceCoverage,
  QlArc,
  QlCompletenessStatus,
  QlForm,
  QlTopology,
  TemporalRole,
  GraphNodeContract,
} from "@research-canvas/schema";

export type {
  ClaimKind,
  ContentOrigin,
  EntityType,
  EvidenceStatus,
  Historicity,
  PlaceCoverage,
  QlArc,
  QlCompletenessStatus,
  QlForm,
  QlTopology,
  TemporalPrecision,
  TemporalRole,
} from "@research-canvas/schema";

/**
 * Entity types that can be passed to `createGraphNode`.
 * `PsychoidOperator` is excluded because that label is only ever added by the
 * operator-seeding path (never by the create command) — callers who pass it
 * will get a runtime rejection from the Rust handler.
 */
export type CreatableEntityType = Exclude<EntityType, "PsychoidOperator">;

export type GraphNode = GraphNodeContract;

export interface GraphRelationship {
  id: string;
  relType: string;
  sourceGraphNodeId: string;
  targetGraphNodeId: string;
  properties: Record<string, unknown>;
}

/** Sidecar stored inside style.__canvasNode to reconstruct the discriminated
 *  union type of a CanvasNode on hydrate (WS4a Fix 1).
 *  `title` (lf-task-1) lets a layout row fully describe a node offline, so a
 *  local-only node (no synced Neo4j GraphNode yet) can still be named. */
export type CanvasNodeSidecar =
  | { type: "note"; title: string; content: string; tags: string[] }
  | { type: "resource"; title: string; resourceKind: string; absolutePath: string; relativePath: string; mimeType: string; fileFingerprint: string }
  | { type: "group"; title: string; color: string; childNodeIds: string[] }
  | { type: "portal"; title: string; targetCanvasId: string; constellationKind?: "standard" | "ql-unit" };

export interface TimelineCardSidecar {
  offsetY: number;
  width?: number;
  height?: number;
}

export interface NodeLayout {
  graphNodeId: string;
  canvasId: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  style: {
    dotColour?: string; bgColour?: string; textColour?: string; thumbnail?: string;
    /** Reserved key for canvas-presentation sidecar (WS4a Fix 1). Opaque to Rust — stored in style_json TEXT. */
    __canvasNode?: CanvasNodeSidecar;
    /** Timeline-only card presentation; does not move/resize the canvas node. */
    __timelineCard?: TimelineCardSidecar;
  };
}

export interface EdgeLayout {
  id: string;
  canvasId: string;
  sourceGraphNodeId: string;
  targetGraphNodeId: string;
  relationKind: string;
  sourceHandleId?: string;
  targetHandleId?: string;
  style: { stroke?: string; width?: number; dashed?: boolean };
}

export interface JoinedCanvasNode {
  node: GraphNode;
  layout: NodeLayout;
}

export interface TimelineNodeRecord {
  node: GraphNode;
  layout: NodeLayout;
}

export interface TimelineFilters {
  entityTypes?: TimelineValueFilter<EntityType>;
  historicities?: TimelineValueFilter<Historicity>;
  temporalRoles?: TimelineValueFilter<TemporalRole>;
}
export interface TimelineValueFilter<T> { include?: T[]; exclude?: T[] }

export interface LoadTimelineViewRequest {
  workspaceId: string;
  filters?: TimelineFilters;
}

export interface TimelineAnchor {
  validFrom: string;
  validTo: string | null;
  precision: NonNullable<GraphNode["temporalPrecision"]>;
}

export interface TimelineLayoutOverride {
  lane: string;
  offsetY: number;
  width: number;
  height: number;
  style: Record<string, unknown>;
  layoutRevision: number;
}

export interface TimelineViewNode {
  node: GraphNode;
  anchor: TimelineAnchor;
  layoutOverride: TimelineLayoutOverride | null;
}

export interface TimelineLane { id: string }

export interface TimelineDiagnostic {
  graphNodeId: string;
  code: "invalid_temporal_anchor" | "missing_authoritative_document";
  message: string;
  validFrom: string | null;
  validTo: string | null;
}

export interface TimelineView {
  workspaceId: string;
  nodes: TimelineViewNode[];
  lanes: TimelineLane[];
  diagnostics: TimelineDiagnostic[];
}

export interface CanvasView {
  canvasId: string;
  nodes: JoinedCanvasNode[];
  edges: EdgeLayout[];
  relationships: GraphRelationship[];
  viewport: { x: number; y: number; zoom: number };
  appState: Record<string, unknown>;
}

export interface LitInstance {
  node: GraphNode;
  relType: "INSTANTIATES" | "ECHOES" | "RESONATES_WITH";
  dominance: "dominant" | "secondary" | null;
}

export interface ArchetypalLighting {
  operator: GraphNode;
  instances: LitInstance[];
}

export interface NewGraphNodeInput {
  graphNodeId?: string;
  entityType: CreatableEntityType;
  title: string;
  body: string;
  summary?: string;
  coordinate?: string | null;
  sourceCoordinates?: string[];
  evidenceTags?: string[];
  sourceKind?: string | null;
  contentOrigin?: ContentOrigin | null;
  contentRevision?: number | null;
  seedSchemaVersion?: number | null;
  bodySourceCoordinates?: string[];
  historicity?: Historicity | null;
  claimKind?: ClaimKind | null;
  evidenceStatus?: EvidenceStatus | null;
  temporalRole?: TemporalRole | null;
  placeCoverage?: PlaceCoverage | null;
  qlForm?: QlForm | null;
  qlUnitId?: string | null;
  qlArc?: QlArc | null;
  qlTopology?: QlTopology | null;
  qlSchemaVersion?: number | null;
  qlSourceCoordinates?: string[];
  qlCompletenessStatus?: QlCompletenessStatus | null;
  isTemporal: boolean;
  validFrom?: string | null;
  validTo?: string | null;
  temporalPrecision?: GraphNode["temporalPrecision"];
}

export type GraphNodePatch = Partial<
  Pick<GraphNode,
    "title" | "archetypalResonance" |
    "coordinate" | "sourceCoordinates" | "evidenceTags" | "sourceKind" |
    "seedSchemaVersion" |
    "historicity" | "claimKind" | "evidenceStatus" | "temporalRole" | "placeCoverage" |
    "qlForm" | "qlUnitId" | "qlArc" | "qlTopology" | "qlSchemaVersion" |
    "qlSourceCoordinates" | "qlCompletenessStatus" | "isTemporal" |
    "validFrom" | "validTo" | "temporalPrecision">
>;

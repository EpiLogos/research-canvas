// Local type-only mirror of the WS0 §5.1 shared contracts so the canvas
// package compiles and tests standalone before WS2 ships the real
// @research-canvas/desktop-api exports. Task 12 swaps these imports for the
// real package. Keep this file byte-identical in shape to WS0 §5.1.

export type EntityType =
  | "Figure" | "People" | "Event" | "Institution" | "Source" | "Claim" | "Myth" | "Interpretation"
  | "Place" | "Work" | "Archetype" | "Dynamic" | "Constellation" | "PsychoidOperator";

export type TemporalPrecision =
  | "millennium" | "century" | "decade" | "year" | "month" | "day";

export const TEMPORAL_PRECISIONS: readonly TemporalPrecision[] = [
  "millennium",
  "century",
  "decade",
  "year",
  "month",
  "day",
] as const;

export interface GraphNode {
  graphNodeId: string;
  entityType: EntityType;
  title: string;
  body: string;
  summary: string;
  archetypalResonance: string | null;
  coordinate: string | null;
  sourceCoordinates: string[];
  evidenceTags?: string[];
  sourceKind?: string | null;
  isTemporal: boolean;
  validFrom: string | null;
  validTo: string | null;
  temporalPrecision: TemporalPrecision | null;
  createdAt: string;
  updatedAt: string;
}

export interface NodeLayout {
  graphNodeId: string;
  canvasId: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  style: {
    dotColour?: string;
    bgColour?: string;
    textColour?: string;
    thumbnail?: string;
    __timelineCard?: { offsetY: number; width?: number; height?: number };
  };
}

export interface TimelineNodeRecord {
  node: GraphNode;
  layout: NodeLayout;
}

export interface JoinedCanvasNode {
  node: GraphNode;
  layout: NodeLayout;
}

export interface GraphRelationship {
  id: string;
  relType: string;
  sourceGraphNodeId: string;
  targetGraphNodeId: string;
  properties: Record<string, unknown>;
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
  // archetypalLighting() only ever yields INSTANTIATES|ECHOES (WS0 §8.2's
  // MATCH ...-[r:INSTANTIATES|ECHOES]->(op)); resonancesForInstance() widens
  // to RESONATES_WITH (MATCH ...-[r:INSTANTIATES|ECHOES|RESONATES_WITH]->(op)).
  relType: "INSTANTIATES" | "ECHOES" | "RESONATES_WITH";
  dominance: "dominant" | "secondary" | null;
}

export interface ArchetypalLighting {
  operator: GraphNode;
  instances: LitInstance[];
}

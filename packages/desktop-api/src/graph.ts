// packages/desktop-api/src/graph.ts

export type EntityType =
  | "Figure" | "People" | "Event" | "Institution" | "Source"
  | "Place" | "Work" | "Archetype" | "Dynamic" | "PsychoidOperator";

/**
 * Entity types that can be passed to `createGraphNode`.
 * `PsychoidOperator` is excluded because that label is only ever added by the
 * operator-seeding path (never by the create command) — callers who pass it
 * will get a runtime rejection from the Rust handler.
 */
export type CreatableEntityType = Exclude<EntityType, "PsychoidOperator">;

export interface GraphNode {
  graphNodeId: string;
  entityType: EntityType;
  title: string;
  body: string;
  summary: string;
  archetypalResonance: string | null;
  coordinate: string | null;
  sourceCoordinates: string[];
  isTemporal: boolean;
  validFrom: string | null;
  validTo: string | null;
  temporalPrecision:
    | "year" | "month" | "day" | "decade" | "century" | "millennium" | null;
  createdAt: string;
  updatedAt: string;
}

export interface GraphRelationship {
  id: string;
  relType: string;
  sourceGraphNodeId: string;
  targetGraphNodeId: string;
  properties: Record<string, unknown>;
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
  entityType: CreatableEntityType;
  title: string;
  body: string;
  coordinate?: string | null;
  sourceCoordinates?: string[];
  isTemporal: boolean;
  validFrom?: string | null;
  validTo?: string | null;
  temporalPrecision?: GraphNode["temporalPrecision"];
}

export type GraphNodePatch = Partial<
  Pick<GraphNode,
    "title" | "body" | "summary" | "archetypalResonance" |
    "coordinate" | "sourceCoordinates" | "isTemporal" |
    "validFrom" | "validTo" | "temporalPrecision">
>;

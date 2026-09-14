import type {
  Project,
  Canvas,
  CanvasNode,
  CanvasEdge,
  GraphNodeContract as Node,
  Viewport,
  Scene,
} from "@research-canvas/schema";

/**
 * Re-export canonical schema types that the domain layer builds on.
 * The repository ports below consume these types so that surfaces and view
 * models stay aligned with the transport contracts.
 */
export type { Project, Canvas, CanvasNode, CanvasEdge, Node, Viewport, Scene };

/** Domain constellation: a project-scoped subgraph container. */
export interface Constellation {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  summary: string;
  parentConstellationId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Domain sequence: an ordered walk through a constellation. */
export interface Sequence {
  id: string;
  constellationId: string;
  canvasId: string;
  name: string;
  rootNodeId: string | null;
  edgeIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Lightweight domain edge used by graph-level repositories. */
export interface Edge {
  id: string;
  relType: string;
  sourceGraphNodeId: string;
  targetGraphNodeId: string;
  properties: Record<string, unknown>;
}

/** Layout record for a node on a canvas. */
export interface NodeLayout {
  graphNodeId: string;
  canvasId: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  style: Record<string, unknown>;
}

/** Layout record for an edge on a canvas. */
export interface EdgeLayout {
  id: string;
  canvasId: string;
  sourceGraphNodeId: string;
  targetGraphNodeId: string;
  relationKind: string;
  sourceHandleId?: string;
  targetHandleId?: string;
  style: Record<string, unknown>;
}

/** Joined view of a node and its canvas layout. */
export interface JoinedCanvasNode {
  node: CanvasNode;
  layout: NodeLayout;
}

/** Full read model returned by a canvas repository. */
export interface CanvasView {
  canvasId: string;
  nodes: JoinedCanvasNode[];
  edges: EdgeLayout[];
  relationships: Edge[];
  viewport: Viewport;
  appState: Record<string, unknown>;
}

/** Tree node returned when listing nested constellations. */
export interface ConstellationTreeNode {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  children: ConstellationTreeNode[];
}

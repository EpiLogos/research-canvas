import type { Edge } from "../types";

export interface EdgeFilter {
  canvasId?: string;
  relationKind?: string;
}

export interface CreateEdgeInput {
  sourceGraphNodeId: string;
  targetGraphNodeId: string;
  relType: string;
  properties?: Record<string, unknown>;
}

export type UpdateEdgePatch = Partial<Pick<Edge, "relType" | "properties">>;

export interface EdgeRepository {
  listEdges(projectId: string, filters?: EdgeFilter): Promise<Edge[]>;
  createEdge(input: CreateEdgeInput): Promise<Edge>;
  updateEdge(id: string, patch: UpdateEdgePatch): Promise<Edge>;
  deleteEdge(id: string): Promise<void>;
}

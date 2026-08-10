import type { Node } from "../types";

export interface NodeFilter {
  canvasId?: string;
  entityType?: string;
}

export interface CreateNodeInput {
  entityType: string;
  title: string;
  body?: string;
  summary?: string;
  isTemporal?: boolean;
  validFrom?: string | null;
  validTo?: string | null;
  temporalPrecision?: string | null;
}

export type UpdateNodePatch = Partial<
  Omit<Node, "graphNodeId" | "createdAt" | "updatedAt">
>;

export interface NodeRepository {
  listNodes(projectId: string, filters?: NodeFilter): Promise<Node[]>;
  getNode(id: string): Promise<Node | null>;
  createNode(input: CreateNodeInput): Promise<Node>;
  updateNode(id: string, patch: UpdateNodePatch): Promise<Node>;
  deleteNode(id: string): Promise<void>;
}

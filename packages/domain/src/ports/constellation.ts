import type { Constellation, ConstellationTreeNode } from "../types";

export interface ConstellationRepository {
  listConstellations(projectId: string): Promise<Constellation[]>;
  createConstellation(projectId: string, name: string): Promise<Constellation>;
  getConstellationTree(projectId: string): Promise<ConstellationTreeNode[]>;
}

import type { Scene } from "../types";

export interface SceneRepository {
  listScenes(constellationId: string): Promise<Scene[]>;
  getScene(id: string): Promise<Scene | null>;
}

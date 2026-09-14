import type { Project } from "../types";

export interface ProjectRepository {
  listProjects(): Promise<Project[]>;
  createProject(rootPath: string): Promise<Project>;
  setActiveProject(id: string): Promise<void>;
}

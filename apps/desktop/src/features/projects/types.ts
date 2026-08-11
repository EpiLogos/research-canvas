/** A project root as shown at the top of the project tree. */
export interface ProjectTreeRoot {
  id: string;
  displayName: string;
  rootPath: string;
  rootType: string;
}

/** A canvas listed under a constellation. */
export interface ProjectTreeCanvas {
  id: string;
  name: string;
}

/** A sequence listed under a constellation. */
export interface ProjectTreeSequence {
  id: string;
  name: string;
}

/** A scene listed under a constellation. */
export interface ProjectTreeScene {
  id: string;
  name: string;
}

/** A graph node listed under a constellation, grouped by entity type. */
export interface ProjectTreeGraphNode {
  id: string;
  name: string;
  entityType: string;
}

/** A constellation node with its children: canvases, sequences, scenes, and nodes grouped by entity type. */
export interface ProjectTreeConstellation {
  id: string;
  name: string;
  canvases: ProjectTreeCanvas[];
  sequences: ProjectTreeSequence[];
  scenes: ProjectTreeScene[];
  nodes: Record<string, ProjectTreeGraphNode[]>;
  children: ProjectTreeConstellation[];
}

/** The full project tree returned by {@link useProjectTree}. */
export interface ProjectTreeNode {
  root: ProjectTreeRoot | null;
  constellations: ProjectTreeConstellation[];
}

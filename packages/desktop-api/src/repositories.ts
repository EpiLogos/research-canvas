import type {
  Canvas,
  CanvasRepository,
  CanvasView,
  Constellation,
  ConstellationRepository,
  ConstellationTreeNode,
  CreateEdgeInput,
  CreateNodeInput,
  Edge,
  EdgeFilter,
  EdgeLayout,
  EdgeRepository,
  JoinedCanvasNode,
  Node,
  NodeFilter,
  NodeLayout,
  NodeRepository,
  PersistCanvasViewInput,
  Project,
  ProjectRepository,
  Scene,
  SceneRepository,
  Sequence,
  SequenceRepository,
  UpdateEdgePatch,
  UpdateNodePatch,
  Viewport,
} from "@research-canvas/domain";
import type { ArchetypeHeatmapEntry } from "@research-canvas/schema";
import type { WorkspaceTransport, CreateProjectInput, SavedSequence } from "./index";

function notImplemented(method: string): never {
  throw new Error(`Not yet implemented: ${method}`);
}

export class DesktopProjectRepository implements ProjectRepository {
  constructor(
    private readonly transport: WorkspaceTransport,
    private readonly homePath: string,
    private readonly databasePath: string,
  ) {}

  async listProjects(): Promise<Project[]> {
    const home = await this.transport.resolveOrCreateHome({
      homePath: this.homePath,
      databasePath: this.databasePath,
    });
    return home.projects as unknown as Project[];
  }

  async createProject(rootPath: string): Promise<Project> {
    const name = rootPath.split("/").pop() ?? "untitled";
    const input: CreateProjectInput = {
      databasePath: this.databasePath,
      homePath: this.homePath,
      name,
      rootType: "directory",
    };
    const created = await this.transport.createProject(input);
    return created as Project;
  }

  async setActiveProject(id: string): Promise<void> {
    await this.transport.selectProject({
      databasePath: this.databasePath,
      projectId: id,
    });
  }
}

export class DesktopConstellationRepository implements ConstellationRepository {
  async listConstellations(_projectId: string): Promise<Constellation[]> {
    notImplemented("ConstellationRepository.listConstellations");
  }

  async createConstellation(_projectId: string, _name: string): Promise<Constellation> {
    notImplemented("ConstellationRepository.createConstellation");
  }

  async getConstellationTree(_projectId: string): Promise<ConstellationTreeNode[]> {
    notImplemented("ConstellationRepository.getConstellationTree");
  }
}

export class DesktopCanvasRepository implements CanvasRepository {
  async listCanvases(_constellationId: string): Promise<Canvas[]> {
    notImplemented("CanvasRepository.listCanvases");
  }

  async getCanvasView(_input: { canvasId: string; lens?: "canvas" | "timeline" }): Promise<CanvasView> {
    notImplemented("CanvasRepository.getCanvasView");
  }

  async persistCanvasView(_input: PersistCanvasViewInput): Promise<void> {
    notImplemented("CanvasRepository.persistCanvasView");
  }
}

export class DesktopNodeRepository implements NodeRepository {
  async listNodes(_projectId: string, _filters?: NodeFilter): Promise<Node[]> {
    notImplemented("NodeRepository.listNodes");
  }

  async getNode(_id: string): Promise<Node | null> {
    notImplemented("NodeRepository.getNode");
  }

  async createNode(_input: CreateNodeInput): Promise<Node> {
    notImplemented("NodeRepository.createNode");
  }

  async updateNode(_id: string, _patch: UpdateNodePatch): Promise<Node> {
    notImplemented("NodeRepository.updateNode");
  }

  async deleteNode(_id: string): Promise<void> {
    notImplemented("NodeRepository.deleteNode");
  }

  async getArchetypeHeatmap(_projectId: string): Promise<ArchetypeHeatmapEntry[]> {
    notImplemented("NodeRepository.getArchetypeHeatmap");
  }
}

export class DesktopEdgeRepository implements EdgeRepository {
  async listEdges(_projectId: string, _filters?: EdgeFilter): Promise<Edge[]> {
    notImplemented("EdgeRepository.listEdges");
  }

  async createEdge(_input: CreateEdgeInput): Promise<Edge> {
    notImplemented("EdgeRepository.createEdge");
  }

  async updateEdge(_id: string, _patch: UpdateEdgePatch): Promise<Edge> {
    notImplemented("EdgeRepository.updateEdge");
  }

  async deleteEdge(_id: string): Promise<void> {
    notImplemented("EdgeRepository.deleteEdge");
  }
}

function savedSequenceToDomain(s: SavedSequence): Sequence {
  return {
    id: s.id,
    constellationId: s.constellationId,
    canvasId: s.canvasId,
    name: s.name,
    rootNodeId: s.rootNodeId,
    edgeIds: s.edgeIds,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export class DesktopSequenceRepository implements SequenceRepository {
  constructor(
    private readonly transport: WorkspaceTransport,
    private readonly databasePath: string,
  ) {}

  async listSequences(constellationId: string): Promise<Sequence[]> {
    const sequences = await this.transport.listSavedSequences({
      databasePath: this.databasePath,
      constellationId,
      canvasId: "",
    });
    return sequences.map(savedSequenceToDomain);
  }

  async getSequence(id: string): Promise<Sequence | null> {
    const sequences = await this.transport.listSavedSequences({
      databasePath: this.databasePath,
      constellationId: "",
      canvasId: "",
    });
    const match = sequences.find((s) => s.id === id);
    return match ? savedSequenceToDomain(match) : null;
  }

  async persistSequence(sequence: Sequence): Promise<Sequence> {
    const existing = await this.getSequence(sequence.id);
    if (existing) {
      const updated = await this.transport.updateSavedSequence({
        databasePath: this.databasePath,
        id: sequence.id,
        name: sequence.name,
        rootNodeId: sequence.rootNodeId,
        edgeIds: sequence.edgeIds,
      });
      return savedSequenceToDomain(updated);
    }
    const created = await this.transport.createSavedSequence({
      databasePath: this.databasePath,
      constellationId: sequence.constellationId,
      canvasId: sequence.canvasId,
      name: sequence.name,
    });
    return savedSequenceToDomain(created);
  }
}

export class DesktopSceneRepository implements SceneRepository {
  constructor(
    private readonly transport: WorkspaceTransport,
    private readonly databasePath: string,
    private readonly profileScope: string,
  ) {}

  async listScenes(_constellationId: string): Promise<Scene[]> {
    return this.transport.listScenes({
      databasePath: this.databasePath,
      profileScope: this.profileScope,
    });
  }

  async getScene(id: string): Promise<Scene | null> {
    return this.transport.getScene({
      databasePath: this.databasePath,
      id,
    });
  }
}

// Keep imports referenced for future surface implementations.
export type { EdgeLayout, JoinedCanvasNode, NodeLayout, Viewport };

import type {
  ArchetypeRepository,
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
  TimelineEarthboundNode,
  TimelineRepository,
  TimelineTimeWindow,
  TimelineViewState,
  TimelineWalk,
  UpdateEdgePatch,
  UpdateNodePatch,
  Viewport,
} from "@research-canvas/domain";
import type { ArchetypeHeatmapEntry, ArchetypalExpression } from "@research-canvas/schema";
import type {
  ArchetypalLighting,
  ExpandedTimelineNode,
  GraphNode,
  LitInstance,
  TimelineFilters,
  TimelineLayoutMutationResult,
  TimelineRelationField,
  TimelineView,
  TimelineYearRange,
  UpsertTimelineLayoutInput,
  WorkspaceTransport,
  CreateProjectInput,
  SavedSequence,
  CreatableEntityType,
  GraphNodePatch,
  TemporalPrecision,
} from "./index";

export class DesktopArchetypeRepository implements ArchetypeRepository {
  async listExpressions(_archetypeId: string): Promise<ArchetypalExpression[]> {
    notImplemented("ArchetypeRepository.listExpressions");
  }

  async listExpressionsForTimeWindow(
    _projectId: string,
    _start: string,
    _end: string,
  ): Promise<ArchetypalExpression[]> {
    notImplemented("ArchetypeRepository.listExpressionsForTimeWindow");
  }

  async listExpressionsForPlace(
    _projectId: string,
    _placeGraphNodeId: string,
  ): Promise<ArchetypalExpression[]> {
    notImplemented("ArchetypeRepository.listExpressionsForPlace");
  }

  async getArchetypeHeatmap(_projectId: string): Promise<ArchetypeHeatmapEntry[]> {
    notImplemented("ArchetypeRepository.getArchetypeHeatmap");
  }
}

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
  constructor(private readonly transport: WorkspaceTransport) {}

  async listCanvases(_constellationId: string): Promise<Canvas[]> {
    notImplemented("CanvasRepository.listCanvases");
  }

  async getCanvasView(input: { canvasId: string; lens?: "canvas" | "timeline" }): Promise<CanvasView> {
    return this.transport.loadCanvasView({
      canvasId: input.canvasId,
      lens: input.lens ?? "canvas",
    }) as unknown as CanvasView;
  }

  async persistCanvasView(input: PersistCanvasViewInput): Promise<void> {
    await this.transport.upsertCanvasAppState({
      canvasId: input.canvas.id,
      viewport: input.viewport ?? { x: 0, y: 0, zoom: 1 },
      appState: input.appState ?? {},
    });
  }
}

export class DesktopNodeRepository implements NodeRepository {
  constructor(private readonly transport: WorkspaceTransport) {}

  async listNodes(_projectId: string, _filters?: NodeFilter): Promise<Node[]> {
    notImplemented("NodeRepository.listNodes");
  }

  async getNode(id: string): Promise<Node | null> {
    try {
      const node = await this.transport.readGraphNode({ graphNodeId: id });
      return node as unknown as Node;
    } catch {
      return null;
    }
  }

  async createNode(input: CreateNodeInput): Promise<Node> {
    const node = await this.transport.createGraphNode({
      entityType: input.entityType as CreatableEntityType,
      title: input.title,
      body: input.body ?? "",
      summary: input.summary,
      isTemporal: input.isTemporal ?? false,
      validFrom: input.validFrom ?? undefined,
      validTo: input.validTo ?? undefined,
      temporalPrecision: input.temporalPrecision
        ? (input.temporalPrecision as TemporalPrecision)
        : undefined,
    });
    return node as unknown as Node;
  }

  async updateNode(id: string, patch: UpdateNodePatch): Promise<Node> {
    const node = await this.transport.updateGraphNode({
      graphNodeId: id,
      patch: patch as GraphNodePatch,
    });
    return node as unknown as Node;
  }

  async deleteNode(id: string): Promise<void> {
    await this.transport.deleteGraphNode({ graphNodeId: id });
  }

  async getArchetypeHeatmap(_projectId: string): Promise<ArchetypeHeatmapEntry[]> {
    notImplemented("NodeRepository.getArchetypeHeatmap");
  }
}

export class DesktopEdgeRepository implements EdgeRepository {
  constructor(private readonly transport: WorkspaceTransport) {}

  async listEdges(_projectId: string, _filters?: EdgeFilter): Promise<Edge[]> {
    notImplemented("EdgeRepository.listEdges");
  }

  async createEdge(input: CreateEdgeInput): Promise<Edge> {
    const relationship = await this.transport.connectGraphNodes({
      sourceGraphNodeId: input.sourceGraphNodeId,
      targetGraphNodeId: input.targetGraphNodeId,
      relType: input.relType,
      properties: input.properties ?? {},
    });
    return {
      id: relationship.id,
      relType: relationship.relType,
      sourceGraphNodeId: relationship.sourceGraphNodeId,
      targetGraphNodeId: relationship.targetGraphNodeId,
      properties: relationship.properties as Record<string, unknown>,
    };
  }

  async updateEdge(_id: string, _patch: UpdateEdgePatch): Promise<Edge> {
    notImplemented("EdgeRepository.updateEdge");
  }

  async deleteEdge(id: string): Promise<void> {
    await this.transport.disconnectGraphNodes({ relationshipId: id });
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

/**
 * Desktop adapter for Surface #2. The rich TimelineLens runtime and the
 * canonical TimelineRepository share this object, so the surface never needs
 * a second transport-shaped data path.
 */
export class DesktopTimelineRepository implements TimelineRepository {
  constructor(
    private readonly transport: WorkspaceTransport,
    private readonly workspaceId: string,
    private readonly databasePath: string,
  ) {}

  async getTimelineWalk(
    constellationId: string,
    timeWindow: TimelineTimeWindow,
  ): Promise<TimelineWalk> {
    if (!constellationId.trim()) throw new Error("constellationId must not be empty");
    if (timeWindow.startYear > timeWindow.endYear) {
      throw new Error("timeline timeWindow startYear must not exceed endYear");
    }

    const [document, view] = await Promise.all([
      this.transport.loadConstellationDocument({
        databasePath: this.databasePath,
        constellationId,
      }),
      this.loadTimelineView(timeWindow),
    ]);
    const constellationNodeIds = new Set(
      document.nodes.map((node) => node.graphNodeId ?? node.id),
    );
    const nodesById = new Map(
      view.nodes.map((record) => [record.node.graphNodeId, record.node] as const),
    );

    const earthboundNodes = view.nodes.flatMap<TimelineEarthboundNode>((record) => {
      if (record.relationCompanion || !constellationNodeIds.has(record.node.graphNodeId)) return [];
      const year = temporalYear(record.anchor.validFrom);
      if (year === null) return [];
      const location = view.relationships.find((relationship) =>
        relationship.relType === "LOCATED_AT"
        && (relationship.sourceGraphNodeId === record.node.graphNodeId
          || relationship.targetGraphNodeId === record.node.graphNodeId),
      );
      const placeGraphNodeId = location
        ? (location.sourceGraphNodeId === record.node.graphNodeId
          ? location.targetGraphNodeId
          : location.sourceGraphNodeId)
        : null;
      return [{
        graphNodeId: record.node.graphNodeId,
        title: record.node.title,
        date: record.anchor.validFrom,
        precision: record.anchor.precision,
        entityType: record.node.entityType,
        placeName: placeGraphNodeId ? nodesById.get(placeGraphNodeId)?.title ?? null : null,
        x: year,
        colorTag: colourTagForGraphNode(record.node),
      }];
    });

    const archetypeLayers = [] as TimelineWalk["archetypeLayers"];
    for (const canvasNode of document.nodes) {
      const graphNodeId = canvasNode.graphNodeId ?? canvasNode.id;
      let graph = canvasNode.graph ?? null;
      if (!graph) {
        try {
          graph = await this.loadNode(graphNodeId);
        } catch {
          graph = null;
        }
      }
      if (!graph || (graph.isArchetype !== true && graph.entityType !== "Archetype")) continue;

      let expansion: ExpandedTimelineNode;
      try {
        expansion = await this.expandNode(graph.graphNodeId);
      } catch {
        continue;
      }
      const neighbourById = new Map(
        expansion.neighbours.map((node) => [node.graphNodeId, node] as const),
      );
      const expressions = expansion.edges.flatMap<TimelineWalk["archetypeLayers"][number]["expressions"][number]>((relationship) => {
        if (relationship.relType !== "ARCHETYPE_EXPRESSES_AT") return [];
        const properties = relationship.properties as Record<string, unknown>;
        const rawWindow = isRecord(properties.timeWindow) ? properties.timeWindow : properties;
        const start = typeof rawWindow.start === "string" ? rawWindow.start : null;
        const end = typeof rawWindow.end === "string" ? rawWindow.end : null;
        if (!start || !temporalWindowOverlaps(start, end, timeWindow)) return [];
        const placeGraphNodeId = relationship.sourceGraphNodeId === graph.graphNodeId
          ? relationship.targetGraphNodeId
          : relationship.sourceGraphNodeId;
        return [{
          start,
          end,
          placeName: neighbourById.get(placeGraphNodeId)?.title ?? "Unknown place",
          colorTag: "archetype-expression",
        }];
      });
      if (expressions.length > 0) {
        archetypeLayers.push({
          archetypeId: graph.graphNodeId,
          title: graph.title,
          expressions,
        });
      }
    }

    earthboundNodes.sort((left, right) => left.x - right.x || left.title.localeCompare(right.title));
    archetypeLayers.sort((left, right) => left.title.localeCompare(right.title));
    return { earthboundNodes, archetypeLayers };
  }

  async loadTimelineView(
    range?: TimelineYearRange,
    filters?: TimelineFilters,
  ): Promise<TimelineView> {
    return this.transport.loadTimelineView({
      workspaceId: this.workspaceId,
      ...(range ? { range } : {}),
      ...(filters ? { filters } : {}),
    });
  }

  async loadNode(graphNodeId: string): Promise<GraphNode> {
    return this.transport.readGraphNode({ graphNodeId });
  }

  async saveTimelineLayout(
    input: Omit<UpsertTimelineLayoutInput, "workspaceId">,
  ): Promise<TimelineLayoutMutationResult> {
    return this.transport.upsertTimelineLayout({ ...input, workspaceId: this.workspaceId });
  }

  async archetypalLighting(operatorGraphNodeId: string): Promise<ArchetypalLighting> {
    return this.transport.archetypalLighting({ operatorGraphNodeId });
  }

  async resonancesForInstance(graphNodeId: string): Promise<LitInstance[]> {
    return this.transport.resonancesForInstance({ graphNodeId });
  }

  async relationFieldForEvent(graphNodeId: string): Promise<TimelineRelationField> {
    const loadRelationField = this.transport.loadTimelineRelationField;
    if (!loadRelationField) {
      throw new Error("timeline relation fields are unavailable");
    }
    return loadRelationField({
      workspaceId: this.workspaceId,
      graphNodeId,
    });
  }

  async expandNode(graphNodeId: string): Promise<ExpandedTimelineNode> {
    return this.transport.expandTimelineNode({
      workspaceId: this.workspaceId,
      graphNodeId,
    });
  }
}

function temporalYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(-?\d{1,6})(?:-|$)/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

function temporalWindowOverlaps(
  start: string,
  end: string | null,
  window: TimelineTimeWindow,
): boolean {
  const startYear = temporalYear(start);
  const endYear = temporalYear(end) ?? startYear;
  return startYear !== null
    && endYear !== null
    && endYear >= window.startYear
    && startYear <= window.endYear;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function colourTagForGraphNode(node: GraphNode): TimelineEarthboundNode["colorTag"] {
  if (node.evidenceStatus === "documented") return "evidence-documented";
  if (node.evidenceStatus === "interpretive") return "evidence-interpretive";
  if (node.evidenceStatus === "contested") return "evidence-contested";
  if (node.historicity === "mythic") return "historicity-mythic";
  if (node.historicity === "historical") return "historicity-historical";
  if (node.entityType === "Archetype") return "archetype-expression";
  return null;
}

// Keep imports referenced for future surface implementations and expose the
// canonical timeline port through the desktop package's existing barrel.
export type {
  EdgeLayout,
  JoinedCanvasNode,
  NodeLayout,
  TimelineRepository,
  TimelineTimeWindow,
  TimelineViewState,
  TimelineWalk,
  Viewport,
};

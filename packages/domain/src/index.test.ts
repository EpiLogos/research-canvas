import { describe, expect, test } from "vitest";
import { compareTemporalBounds } from "@research-canvas/schema";
import type {
  ArchetypeRepository,
  ArchetypalExpression,
  ArchetypeHeatmapEntry,
  Canvas,
  CanvasNode,
  CanvasRepository,
  Constellation,
  ConstellationRepository,
  ConstellationTreeNode,
  CreateEdgeInput,
  CreateNodeInput,
  Edge,
  EdgeRepository,
  EdgeLayout,
  JoinedCanvasNode,
  Node,
  NodeRepository,
  Project,
  ProjectRepository,
  SceneRepository,
  Sequence,
  SequenceRepository,
  Viewport,
} from "./index";

function makeNode(input: CreateNodeInput): Node {
  return {
    graphNodeId: `gn-${Math.random().toString(36).slice(2)}`,
    entityType: input.entityType as any,
    title: input.title,
    body: input.body ?? "",
    summary: input.summary ?? "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    evidenceTags: [],
    sourceKind: null,
    contentOrigin: "user_authored",
    contentRevision: null,
    seedSchemaVersion: null,
    bodySourceCoordinates: [],
    historicity: null,
    claimKind: null,
    evidenceStatus: null,
    temporalRole: null,
    placeCoverage: null,
    place: null,
    qlForm: null,
    qlUnitId: null,
    qlArc: null,
    qlTopology: null,
    qlSchemaVersion: null,
    qlSourceCoordinates: [],
    qlCompletenessStatus: null,
    isTemporal: input.isTemporal ?? false,
    validFrom: input.validFrom ?? null,
    validTo: input.validTo ?? null,
    temporalPrecision: (input.temporalPrecision ?? null) as Node["temporalPrecision"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * In-memory fake adapter that satisfies every repository port. Surfaces and view
 * models can unit-test against this adapter without a real WorkspaceTransport or
 * database.
 */
class FakeDomainAdapter
  implements
    ProjectRepository,
    ConstellationRepository,
    CanvasRepository,
    NodeRepository,
    ArchetypeRepository,
    EdgeRepository,
    SequenceRepository,
    SceneRepository
{
  private projects: Project[] = [];
  private constellations: Constellation[] = [];
  private canvases: Canvas[] = [];
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private sequences: Sequence[] = [];
  private expressions: ArchetypalExpression[] = [];

  private id(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  }

  private now(): string {
    return new Date().toISOString();
  }

  // ProjectRepository
  async listProjects(): Promise<Project[]> {
    return this.projects;
  }

  async createProject(rootPath: string): Promise<Project> {
    const project: Project = {
      id: this.id("proj"),
      displayName: rootPath.split("/").pop() ?? "untitled",
      slug: (rootPath.split("/").pop() ?? "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      parentConstellationId: null,
      rootPath,
      rootType: "directory",
      profileScope: "default",
      primaryCanvasId: this.id("canvas"),
      summary: "",
      coverAssetPath: null,
      publishSettings: { includeResources: true, mobileSequenceFirst: false, theme: "paper" },
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.projects.push(project);
    return project;
  }

  async setActiveProject(id: string): Promise<void> {
    if (!this.projects.some((p) => p.id === id)) {
      throw new Error(`Project ${id} not found`);
    }
  }

  // ConstellationRepository
  async listConstellations(projectId: string): Promise<Constellation[]> {
    return this.constellations.filter((c) => c.projectId === projectId);
  }

  async createConstellation(projectId: string, name: string): Promise<Constellation> {
    const constellation: Constellation = {
      id: this.id("const"),
      projectId,
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
      summary: "",
      parentConstellationId: null,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.constellations.push(constellation);
    return constellation;
  }

  async getConstellationTree(projectId: string): Promise<ConstellationTreeNode[]> {
    const build = (parentId: string | null): ConstellationTreeNode[] =>
      this.constellations
        .filter((c) => c.projectId === projectId && c.parentConstellationId === parentId)
        .map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          parentId: c.parentConstellationId,
          children: build(c.id),
        }));
    return build(null);
  }

  // CanvasRepository
  async listCanvases(constellationId: string): Promise<Canvas[]> {
    return this.canvases.filter((c) => c.projectId === constellationId);
  }

  async getCanvasView(input: { canvasId: string }): Promise<{
    canvasId: string;
    nodes: JoinedCanvasNode[];
    edges: EdgeLayout[];
    relationships: Edge[];
    viewport: Viewport;
    appState: Record<string, unknown>;
  }> {
    const nodes = this.canvases.some((c) => c.id === input.canvasId)
      ? this.nodes.map(
          (n): JoinedCanvasNode => ({
            node: n as unknown as CanvasNode,
            layout: {
              graphNodeId: n.graphNodeId,
              canvasId: input.canvasId,
              positionX: 0,
              positionY: 0,
              width: 200,
              height: 120,
              style: {},
            },
          }),
        )
      : [];
    return {
      canvasId: input.canvasId,
      nodes,
      edges: [],
      relationships: this.edges,
      viewport: { x: 0, y: 0, zoom: 1 },
      appState: {},
    };
  }

  async persistCanvasView(input: {
    canvas: Canvas;
    nodes: JoinedCanvasNode[];
    edges: EdgeLayout[];
  }): Promise<void> {
    const existing = this.canvases.findIndex((c) => c.id === input.canvas.id);
    if (existing === -1) {
      this.canvases.push(input.canvas);
    } else {
      this.canvases[existing] = { ...input.canvas, updatedAt: this.now() };
    }
  }

  // NodeRepository
  async listNodes(_projectId: string): Promise<Node[]> {
    return this.nodes;
  }

  async getNode(id: string): Promise<Node | null> {
    return this.nodes.find((n) => n.graphNodeId === id) ?? null;
  }

  async createNode(input: CreateNodeInput): Promise<Node> {
    const node = makeNode(input);
    this.nodes.push(node);
    return node;
  }

  async updateNode(
    id: string,
    patch: Partial<Omit<Node, "graphNodeId" | "createdAt" | "updatedAt">>,
  ): Promise<Node> {
    const idx = this.nodes.findIndex((n) => n.graphNodeId === id);
    if (idx === -1) throw new Error(`Node ${id} not found`);
    const updated = { ...this.nodes[idx], ...patch, updatedAt: this.now() };
    this.nodes[idx] = updated;
    return updated;
  }

  async deleteNode(id: string): Promise<void> {
    this.nodes = this.nodes.filter((n) => n.graphNodeId !== id);
    this.edges = this.edges.filter((e) => e.sourceGraphNodeId !== id && e.targetGraphNodeId !== id);
    this.expressions = this.expressions.filter((e) => e.archetypeGraphNodeId !== id);
  }

  // ArchetypeRepository
  async createArchetypalExpression(
    input: Omit<ArchetypalExpression, "id">,
  ): Promise<ArchetypalExpression> {
    const expression: ArchetypalExpression = {
      id: this.id("expr"),
      ...input,
    };
    this.expressions.push(expression);
    return expression;
  }

  async listExpressions(archetypeId: string): Promise<ArchetypalExpression[]> {
    return this.expressions.filter((e) => e.archetypeGraphNodeId === archetypeId);
  }

  async listExpressionsForTimeWindow(
    _projectId: string,
    start: string,
    end: string,
  ): Promise<ArchetypalExpression[]> {
    return this.expressions.filter((e) => {
      const startsBeforeWindowEnd = compareTemporalBounds(e.timeWindow.start, end);
      if (startsBeforeWindowEnd !== null && startsBeforeWindowEnd > 0) {
        return false;
      }
      if (e.timeWindow.end == null) {
        return true;
      }
      const endsAfterWindowStart = compareTemporalBounds(e.timeWindow.end, start);
      return endsAfterWindowStart === null || endsAfterWindowStart >= 0;
    });
  }

  async listExpressionsForPlace(
    _projectId: string,
    placeGraphNodeId: string,
  ): Promise<ArchetypalExpression[]> {
    return this.expressions.filter((e) => e.placeGraphNodeId === placeGraphNodeId);
  }

  private pointFromPlaceNode(node: Node): { latitude: number; longitude: number } | null {
    const place = node.place;
    if (place == null) return null;
    const coord = place.coordinate;
    if (coord.precision === "exact" || coord.precision === "approximate") {
      return { latitude: coord.latitude, longitude: coord.longitude };
    }
    if (coord.precision === "region") {
      const geometry = coord.geometry;
      if (geometry.type !== "Polygon") return null;
      const ring = geometry.coordinates[0];
      if (!ring || ring.length === 0) return null;
      const sum = ring.reduce(
        (acc, [longitude, latitude]) => ({
          longitude: acc.longitude + longitude,
          latitude: acc.latitude + latitude,
        }),
        { longitude: 0, latitude: 0 },
      );
      return {
        latitude: sum.latitude / ring.length,
        longitude: sum.longitude / ring.length,
      };
    }
    return null;
  }

  async getArchetypeHeatmap(_projectId: string): Promise<ArchetypeHeatmapEntry[]> {
    const archetypes = this.nodes.filter((n) => n.entityType === "Archetype");
    return archetypes.map((archetype) => {
      const expressions = this.expressions.filter(
        (e) => e.archetypeGraphNodeId === archetype.graphNodeId,
      );

      const orderedStarts = expressions
        .map((e) => ({ bound: e.timeWindow.start, ms: Date.parse(e.timeWindow.start) }))
        .filter((item) => !Number.isNaN(item.ms))
        .sort((a, b) => a.ms - b.ms);
      const orderedEnds = expressions
        .map((e) => (e.timeWindow.end == null ? null : { bound: e.timeWindow.end, ms: Date.parse(e.timeWindow.end) }))
        .filter((item): item is { bound: string; ms: number } => item != null && !Number.isNaN(item.ms))
        .sort((a, b) => a.ms - b.ms);

      const temporalSpan = {
        start: orderedStarts[0]?.bound ?? expressions[0]?.timeWindow.start ?? "",
        end: orderedEnds[orderedEnds.length - 1]?.bound ?? null,
      };

      const points = expressions
        .map((e) => {
          const node = this.nodes.find((n) => n.graphNodeId === e.placeGraphNodeId);
          return node ? this.pointFromPlaceNode(node) : null;
        })
        .filter((p): p is { latitude: number; longitude: number } => p != null);

      const geographicBounds =
        points.length > 0
          ? {
              north: Math.max(...points.map((p) => p.latitude)),
              south: Math.min(...points.map((p) => p.latitude)),
              east: Math.max(...points.map((p) => p.longitude)),
              west: Math.min(...points.map((p) => p.longitude)),
            }
          : { north: 0, south: 0, east: 0, west: 0 };

      return {
        archetypeId: archetype.graphNodeId,
        title: archetype.title,
        expressions,
        temporalSpan,
        geographicBounds,
      };
    });
  }

  // EdgeRepository
  async listEdges(_projectId: string): Promise<Edge[]> {
    return this.edges;
  }

  async createEdge(input: CreateEdgeInput): Promise<Edge> {
    const edge: Edge = {
      id: this.id("edge"),
      relType: input.relType,
      sourceGraphNodeId: input.sourceGraphNodeId,
      targetGraphNodeId: input.targetGraphNodeId,
      properties: input.properties ?? {},
    };
    this.edges.push(edge);
    return edge;
  }

  async updateEdge(
    id: string,
    patch: Partial<Pick<Edge, "relType" | "properties">>,
  ): Promise<Edge> {
    const idx = this.edges.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error(`Edge ${id} not found`);
    const updated = { ...this.edges[idx], ...patch };
    this.edges[idx] = updated;
    return updated;
  }

  async deleteEdge(id: string): Promise<void> {
    this.edges = this.edges.filter((e) => e.id !== id);
  }

  // SequenceRepository
  async listSequences(constellationId: string): Promise<Sequence[]> {
    return this.sequences.filter((s) => s.constellationId === constellationId);
  }

  async getSequence(id: string): Promise<Sequence | null> {
    return this.sequences.find((s) => s.id === id) ?? null;
  }

  async persistSequence(sequence: Sequence): Promise<Sequence> {
    const idx = this.sequences.findIndex((s) => s.id === sequence.id);
    if (idx === -1) {
      this.sequences.push(sequence);
    } else {
      this.sequences[idx] = { ...sequence, updatedAt: this.now() };
    }
    return sequence;
  }

  // SceneRepository
  async listScenes(): Promise<never[]> {
    return [];
  }

  async getScene(): Promise<null> {
    return null;
  }
}

describe("domain repository ports (fake adapter)", () => {
  test("creates a project, constellation, canvas, node, and edge through the ports", async () => {
    const adapter = new FakeDomainAdapter();

    const project = await adapter.createProject("/tmp/redemption-test");
    expect(project.rootPath).toBe("/tmp/redemption-test");
    expect(project.id).toBeTruthy();

    const constellation = await adapter.createConstellation(project.id, "Test Constellation");
    expect(constellation.projectId).toBe(project.id);

    const canvas: Canvas = {
      id: `canvas-${Date.now()}`,
      projectId: constellation.id,
      name: "Primary",
      kind: "primary",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await adapter.persistCanvasView({ canvas, nodes: [], edges: [] });
    const canvases = await adapter.listCanvases(constellation.id);
    expect(canvases).toHaveLength(1);
    expect(canvases[0]?.name).toBe("Primary");

    const node = await adapter.createNode({ entityType: "Event", title: "Fall of Rome" });
    expect(node.title).toBe("Fall of Rome");

    const edge = await adapter.createEdge({
      sourceGraphNodeId: node.graphNodeId,
      targetGraphNodeId: `gn-target-${Date.now()}`,
      relType: "CAUSES",
    });
    expect(edge.relType).toBe("CAUSES");

    const view = await adapter.getCanvasView({ canvasId: canvas.id });
    expect(view.canvasId).toBe(canvas.id);
    expect(view.nodes).toHaveLength(1);
  });
});

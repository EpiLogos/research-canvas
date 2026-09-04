import type {
  LocatedGraphNode,
  PlacesRepository,
} from "@research-canvas/domain";
import {
  resolveBrowserBridgeBaseUrl,
  type ExpandedTimelineNode,
  type GraphNode,
  type WorkspaceServices,
} from "@research-canvas/desktop-api";
import type {
  ArchetypalExpression,
  GeographyEdge,
  TemporalPrecision,
} from "@research-canvas/schema";

const SESSION_COOKIE = "research_canvas_session_id";

/**
 * Desktop adapter for Surface #3.
 *
 * The base node set is read from the durable local graph projection, while
 * movement lanes reuse the existing geography-edge store. Focused relational
 * and archetypal context reuses Timeline's local-first expansion command so
 * Places does not invent a second relationship repository.
 */
export class DesktopPlacesRepository implements PlacesRepository {
  constructor(
    private readonly transport: WorkspaceServices,
    private readonly projectId: string,
    private readonly workspaceId: string,
    private readonly databasePath: string,
    private readonly profileScope: string,
  ) {}

  async getLocatedNodes(projectId: string): Promise<LocatedGraphNode[]> {
    this.assertProject(projectId);
    const nodes = await listLocatedGraphNodes(this.databasePath);
    return nodes.filter((node): node is LocatedGraphNode => node.place !== null);
  }

  async getGeographyEdges(projectId: string): Promise<GeographyEdge[]> {
    this.assertProject(projectId);
    return this.transport.listGeographyEdges({
      databasePath: this.databasePath,
      profileScope: this.profileScope,
    });
  }

  async getRelatedNodesForPlace(
    projectId: string,
    placeGraphNodeId: string,
  ): Promise<GraphNode[]> {
    this.assertProject(projectId);
    const expansion = await this.expand(placeGraphNodeId);
    return expansion.neighbours;
  }

  async getArchetypeExpressionsForPlace(
    projectId: string,
    placeGraphNodeId: string,
  ): Promise<ArchetypalExpression[]> {
    this.assertProject(projectId);
    const expansion = await this.expand(placeGraphNodeId);
    const nodesById = new Map(
      [expansion.subject, ...expansion.neighbours].map((node) => [node.graphNodeId, node] as const),
    );

    return expansion.edges.flatMap((edge) => {
      if (edge.relType !== "ARCHETYPE_EXPRESSES_AT") return [];
      const otherId = edge.sourceGraphNodeId === placeGraphNodeId
        ? edge.targetGraphNodeId
        : edge.targetGraphNodeId === placeGraphNodeId
          ? edge.sourceGraphNodeId
          : null;
      if (!otherId) return [];
      const archetype = nodesById.get(otherId);
      if (!archetype || (archetype.entityType !== "Archetype" && archetype.isArchetype !== true)) {
        return [];
      }

      const properties = edge.properties;
      const rawWindow = isRecord(properties.timeWindow) ? properties.timeWindow : properties;
      const start = typeof rawWindow.start === "string" ? rawWindow.start : null;
      const end = typeof rawWindow.end === "string" ? rawWindow.end : null;
      const precision = temporalPrecision(rawWindow.precision);
      const expressionKind = expressionKindFrom(properties.expressionKind);
      if (!start || !precision || !expressionKind) return [];

      const sourceCoordinates = Array.isArray(properties.sourceCoordinates)
        ? properties.sourceCoordinates.filter((value): value is string => typeof value === "string")
        : [];
      return [{
        id: edge.id,
        archetypeGraphNodeId: archetype.graphNodeId,
        placeGraphNodeId,
        timeWindow: { start, end, precision },
        expressionKind,
        sourceCoordinates,
      }];
    });
  }

  private async expand(graphNodeId: string): Promise<ExpandedTimelineNode> {
    return this.transport.expandTimelineNode({
      workspaceId: this.workspaceId,
      graphNodeId,
    });
  }

  private assertProject(projectId: string): void {
    if (!projectId.trim()) throw new Error("PlacesRepository projectId must not be empty");
    if (projectId !== this.projectId) {
      throw new Error(`PlacesRepository project mismatch: expected ${this.projectId}`);
    }
  }
}

async function listLocatedGraphNodes(databasePath: string): Promise<GraphNode[]> {
  const tauri = (window as typeof window & {
    __TAURI_INTERNALS__?: {
      invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
    };
  }).__TAURI_INTERNALS__;

  if (tauri) {
    return tauri.invoke<GraphNode[]>("list_located_graph_nodes_command", {
      request: { databasePath },
    });
  }

  const response = await fetch(`${resolveBrowserBridgeBaseUrl()}/graph/places`, {
    headers: { "X-Research-Canvas-Session": browserSessionId() },
  });
  if (!response.ok) {
    throw new Error(`Places bridge request failed with status ${response.status}`);
  }
  return response.json() as Promise<GraphNode[]>;
}

function browserSessionId(): string {
  const current = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (current) return current;

  const value = crypto.randomUUID();
  document.cookie = `${SESSION_COOKIE}=${value}; path=/; SameSite=Lax`;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function temporalPrecision(value: unknown): TemporalPrecision | null {
  return value === "millennium"
    || value === "century"
    || value === "decade"
    || value === "year"
    || value === "month"
    || value === "day"
    ? value
    : null;
}

function expressionKindFrom(value: unknown): ArchetypalExpression["expressionKind"] | null {
  return value === "mythic"
    || value === "ritual"
    || value === "literary"
    || value === "visual"
    || value === "theoretical"
    ? value
    : null;
}

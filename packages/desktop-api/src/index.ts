import type { GraphExportBundle } from "@research-canvas/exporter";
import type {
  Annotation,
  CanvasEdge,
  CanvasNode,
  PublishSettings,
} from "@research-canvas/schema";

export type {
  ArchetypalLighting,
  CanvasNodeSidecar,
  CanvasView,
  CreatableEntityType,
  EdgeLayout,
  EntityType,
  GraphNode,
  GraphNodePatch,
  GraphRelationship,
  JoinedCanvasNode,
  LitInstance,
  NewGraphNodeInput,
  NodeLayout,
  TimelineNodeRecord,
} from "./graph";
import type {
  ArchetypalLighting,
  CanvasNodeSidecar,
  CanvasView,
  GraphNode,
  GraphNodePatch,
  GraphRelationship,
  JoinedCanvasNode,
  LitInstance,
  NewGraphNodeInput,
  NodeLayout,
  EdgeLayout,
} from "./graph";

export type IndexedEntryKind =
  | "directory"
  | "markdown"
  | "text"
  | "image"
  | "pdf"
  | "binary";

export interface IndexedEntry {
  id: string;
  name: string;
  relativePath: string;
  absolutePath: string;
  kind: IndexedEntryKind;
  isDirectory: boolean;
  depth: number;
  sizeBytes: number;
}

export interface ProjectTreeNode {
  id: string;
  name: string;
  slug: string;
  rootPath: string;
  summary: string;
  parentId: string | null;
  children: ProjectTreeNode[];
}

export interface WorkspaceProject {
  id: string;
  displayName: string;
  slug: string;
  parentProjectId: string | null;
  rootPath: string;
  primaryCanvasId: string;
  summary: string;
  coverAssetPath: string | null;
  publishSettings: PublishSettings;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceRoot {
  id: string;
  projectId: string;
  rootPath: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceBootstrap {
  activeProjectId: string;
  databasePath: string;
  projects: ProjectTreeNode[];
}

export interface ProjectDocument {
  canvasId: string;
  databasePath: string;
  entries: IndexedEntry[];
  project: WorkspaceProject;
  resourceRoots: ResourceRoot[];
  workingRoot: string;
  annotations: Annotation[];
  edges: CanvasEdge[];
  nodes: CanvasNode[];
}

export interface PersistProjectDocumentRequest {
  annotations: Annotation[];
  canvasId: string;
  databasePath: string;
  edges: CanvasEdge[];
  nodes: CanvasNode[];
  projectId: string;
}

export interface SearchHit {
  documentKey: string;
  scopeProjectId: string;
  projectId: string;
  projectDisplayName: string;
  projectSlug: string;
  canvasId: string | null;
  entityType: string;
  entityId: string;
  title: string;
  summary: string;
  snippet: string;
  sourcePath: string | null;
  relativePath: string | null;
  contentKind: string;
  indexedAt: string;
  score: number;
}

export interface SearchProjectRequest {
  databasePath: string;
  limit?: number;
  projectId: string;
  query: string;
}

export interface ResourceRootMutationRequest {
  databasePath: string;
  displayName?: string;
  projectId: string;
  rootPath: string;
}

export interface DirectoryEntry {
  path: string;
  name: string;
  depth: number;
}

export interface SavedSequence {
  id: string;
  projectId: string;
  canvasId: string;
  name: string;
  rootNodeId: string | null;
  edgeIds: string[];
  createdAt: string;
  updatedAt: string;
}

export function nodeLayoutFromCanvasNode(node: CanvasNode): NodeLayout {
  // Build the type-specific sidecar so canvasViewToNodes can reconstruct the
  // discriminated union type on reload (Fix 1 — WS4a). `title` (lf-task-1)
  // is carried too, so a layout row fully describes a node offline — with
  // no synced Neo4j GraphNode yet, the sidecar alone still names the node.
  let canvasNode: CanvasNodeSidecar;
  if (node.type === "resource") {
    canvasNode = {
      type: "resource",
      title: node.title,
      resourceKind: node.resourceKind,
      absolutePath: node.absolutePath,
      relativePath: node.relativePath,
      mimeType: node.mimeType,
      fileFingerprint: node.fileFingerprint,
    };
  } else if (node.type === "group") {
    canvasNode = {
      type: "group",
      title: node.title,
      color: node.color,
      childNodeIds: node.childNodeIds,
    };
  } else if (node.type === "portal") {
    canvasNode = {
      type: "portal",
      title: node.title,
      targetCanvasId: node.targetCanvasId,
      constellationKind: node.constellationKind,
    };
  } else {
    canvasNode = {
      type: "note",
      title: node.title,
      content: node.content,
      tags: node.tags,
    };
  }

  return {
    graphNodeId: node.graphNodeId ?? node.id,
    canvasId: node.canvasId,
    positionX: node.position.x,
    positionY: node.position.y,
    width: node.size.width,
    height: node.size.height,
    style: {
      dotColour: node.dotColour ?? undefined,
      bgColour: node.bgColour ?? undefined,
      textColour: node.textColour ?? undefined,
      thumbnail: node.thumbnail ?? undefined,
      __timelineCard: node.timelineCard ?? undefined,
      __canvasNode: canvasNode,
    },
  };
}

export function edgeLayoutFromCanvasEdge(edge: CanvasEdge): EdgeLayout {
  return {
    id: edge.id,
    canvasId: edge.canvasId,
    sourceGraphNodeId: edge.sourceNodeId,
    targetGraphNodeId: edge.targetNodeId,
    relationKind: edge.relationKind,
    sourceHandleId: edge.sourceHandleId ?? undefined,
    targetHandleId: edge.targetHandleId ?? undefined,
    style: {
      stroke: edge.style.stroke,
      width: edge.style.width,
      dashed: edge.style.dashed,
    },
  };
}

export interface NodeLayoutPayloadWire {
  graphNodeId: string;
  canvasId: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  styleJson: string;
}

export interface EdgeLayoutPayloadWire {
  id: string;
  canvasId: string;
  sourceGraphNodeId: string;
  targetGraphNodeId: string;
  relationKind: string;
  sourceHandleId: string | null;
  targetHandleId: string | null;
  styleJson: string;
}

export interface FlushCanvasLayoutRequestPayload {
  databasePath: string;
  canvasId: string;
  layouts: NodeLayoutPayloadWire[];
  edges: EdgeLayoutPayloadWire[];
  viewportJson: string;
  appStateJson: string;
}

export interface FlushCanvasLayoutInput {
  databasePath: string;
  canvasId: string;
  layouts: NodeLayout[];
  edges: EdgeLayout[];
  viewport: { x: number; y: number; zoom: number };
  appState: Record<string, unknown>;
}

export function buildFlushRequest(
  input: FlushCanvasLayoutInput
): FlushCanvasLayoutRequestPayload {
  return {
    databasePath: input.databasePath,
    canvasId: input.canvasId,
    layouts: input.layouts.map((layout) => ({
      graphNodeId: layout.graphNodeId,
      canvasId: layout.canvasId,
      positionX: layout.positionX,
      positionY: layout.positionY,
      width: layout.width,
      height: layout.height,
      styleJson: JSON.stringify(layout.style),
    })),
    edges: input.edges.map((edge) => ({
      id: edge.id,
      canvasId: edge.canvasId,
      sourceGraphNodeId: edge.sourceGraphNodeId,
      targetGraphNodeId: edge.targetGraphNodeId,
      relationKind: edge.relationKind,
      sourceHandleId: edge.sourceHandleId ?? null,
      targetHandleId: edge.targetHandleId ?? null,
      styleJson: JSON.stringify(edge.style),
    })),
    viewportJson: JSON.stringify(input.viewport),
    appStateJson: JSON.stringify(input.appState),
  };
}

export interface AgentActivity {
  id: string;
  canvasId: string | null;
  kind: "node_created" | "node_updated" | "relationship_created" | "episode_ingested";
  graphNodeId: string | null;
  relationshipId: string | null;
  title: string;
  entityType: string | null;
  detailJson: string;
  reviewed: boolean;
  placed: boolean;
  createdAt: string;
}

interface RawAgentActivityRow {
  id: string;
  canvasId: string | null;
  kind: string;
  graphNodeId: string | null;
  relationshipId: string | null;
  title: string;
  entityType: string | null;
  detailJson: string;
  reviewed: boolean;
  placed: boolean;
  createdAt: string;
}

export function mapAgentActivityRow(row: RawAgentActivityRow): AgentActivity {
  return {
    id: row.id,
    canvasId: row.canvasId ?? null,
    kind: row.kind as AgentActivity["kind"],
    graphNodeId: row.graphNodeId ?? null,
    relationshipId: row.relationshipId ?? null,
    title: row.title ?? "",
    entityType: row.entityType ?? null,
    detailJson: row.detailJson ?? "{}",
    reviewed: Boolean(row.reviewed),
    placed: Boolean(row.placed),
    createdAt: row.createdAt,
  };
}

export interface WorkspaceTransport {
  attachProjectResourceRoot(
    request: ResourceRootMutationRequest
  ): Promise<ResourceRoot>;
  bootstrapWorkspace(): Promise<WorkspaceBootstrap>;
  detachProjectResourceRoot(request: {
    databasePath: string;
    projectId: string;
    rootPath: string;
  }): Promise<void>;
  listProjectResourceRoots(input: {
    databasePath: string;
    projectId: string;
  }): Promise<ResourceRoot[]>;
  loadProjectDocument(input: {
    databasePath: string;
    projectId: string;
  }): Promise<ProjectDocument>;
  flushProjectDocument(request: PersistProjectDocumentRequest): boolean | Promise<boolean>;
  flushCanvasLayout(input: {
    databasePath?: string;
    canvasId: string;
    layouts: NodeLayout[];
    edges: EdgeLayout[];
    viewport: { x: number; y: number; zoom: number };
    appState: Record<string, unknown>;
  }): boolean | Promise<boolean>;
  persistProjectDocument(
    request: PersistProjectDocumentRequest
  ): Promise<ProjectDocument>;
  searchProject(request: SearchProjectRequest): Promise<SearchHit[]>;
  listDirectories(): Promise<DirectoryEntry[]>;
  listSavedSequences(input: { databasePath: string; projectId: string; canvasId: string }): Promise<SavedSequence[]>;
  createSavedSequence(input: { databasePath: string; projectId: string; canvasId: string; name: string }): Promise<SavedSequence>;
  updateSavedSequence(input: { databasePath: string; id: string; name: string; rootNodeId: string | null; edgeIds: string[] }): Promise<SavedSequence>;
  deleteSavedSequence(input: { databasePath: string; id: string }): Promise<void>;

  // ---- Substance (Neo4j) ----
  readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>;
  createGraphNode(input: NewGraphNodeInput): Promise<GraphNode>;
  updateGraphNode(input: { graphNodeId: string; patch: GraphNodePatch }): Promise<GraphNode>;
  deleteGraphNode(input: { graphNodeId: string }): Promise<void>;
  connectGraphNodes(input: {
    sourceGraphNodeId: string; targetGraphNodeId: string;
    relType: string; properties?: Record<string, unknown>;
  }): Promise<GraphRelationship>;
  disconnectGraphNodes(input: { relationshipId: string }): Promise<void>;
  searchGraph(input: { query: string; limit?: number }): Promise<GraphNode[]>;

  // ---- Layout (SQLite) ----
  // `databasePath?` is OPTIONAL on every layout/joined method: omit it and the
  // Tauri command falls back to SharedApiState.db_path (Task 14). WS7 Task 3/4
  // reuse these exact signatures — keep `databasePath?:` optional, do not rename.
  upsertNodeLayout(input: { databasePath?: string; layout: NodeLayout }): Promise<void>;
  upsertNodeLayouts(input: { databasePath?: string; canvasId: string; layouts: NodeLayout[] }): Promise<number>;
  upsertEdgeLayout(input: { databasePath?: string; layout: EdgeLayout }): Promise<void>;
  upsertCanvasAppState(input: {
    databasePath?: string; canvasId: string;
    viewport: { x: number; y: number; zoom: number };
    appState: Record<string, unknown>;
  }): Promise<void>;

  // ---- Joined reads (both targets) ----
  loadCanvasView(input: { databasePath?: string; canvasId: string; lens: "canvas" | "timeline" }): Promise<CanvasView>;

  // ---- Two-lens / archetypal lighting ----
  archetypalLighting(input: { operatorGraphNodeId: string }): Promise<ArchetypalLighting>;
  resonancesForInstance(input: { graphNodeId: string }): Promise<LitInstance[]>;

  // ---- Content / image import ----
  importNodeImage(input: {
    workspaceRoot: string;
    graphNodeId: string;
    sourceAbsolutePath: string;
  }): Promise<string>;

  // ---- Agent activity (WS6) ----
  listAgentActivity(input: { limit?: number }): Promise<AgentActivity[]>;

  // ---- Local node document (SQLite; Task 1.1/1.2) ----
  readLocalNodeDocument(input: {
    databasePath: string;
    graphNodeId: string;
  }): Promise<{ body: string; summary: string; neo4jSynced: boolean } | null>;
  upsertLocalNodeDocument(input: {
    databasePath: string;
    graphNodeId: string;
    body: string;
    summary: string;
    neo4jSynced?: boolean;
  }): Promise<void>;
}

const DEFAULT_BRIDGE_PORT = 4789;
const BRIDGE_BASE_URL = resolveBrowserBridgeBaseUrl();
const SESSION_COOKIE = "research_canvas_session_id";

export function resolveBrowserBridgeBaseUrl() {
  return `http://127.0.0.1:${resolveBrowserBridgePort()}`;
}

export function createWorkspaceTransport(): WorkspaceTransport {
  return isTauriRuntime()
    ? createTauriWorkspaceTransport()
    : createBrowserBridgeTransport();
}

export function createReadLayerTransport(
  bundle: GraphExportBundle | null
): WorkspaceTransport {
  if (bundle) {
    return createStaticBundleTransport(bundle);
  }

  return createWorkspaceTransport();
}

export async function readWorkspaceTextFile(absolutePath: string) {
  if (isTauriRuntime()) {
    return invokeTauri<string>("read_workspace_text_file_command", {
      path: absolutePath
    });
  }

  const params = new URLSearchParams({ path: absolutePath });
  const response = await requestJsonWithRetry<{ content: string }>(
    `/workspace/file-content?${params.toString()}`
  );
  return response.content;
}

function createTauriWorkspaceTransport(): WorkspaceTransport {
  let activeDatabasePath: string | undefined;

  return {
    async attachProjectResourceRoot(request) {
      return invokeTauri<ResourceRoot>("attach_project_resource_root_command", {
        request
      });
    },
    async bootstrapWorkspace() {
      const result = await invokeTauri<WorkspaceBootstrap>("bootstrap_workspace_command");
      activeDatabasePath = result.databasePath;
      return result;
    },
    async detachProjectResourceRoot(request) {
      await invokeTauri<void>("detach_project_resource_root_command", {
        request
      });
    },
    async listProjectResourceRoots(request) {
      return invokeTauri<ResourceRoot[]>(
        "list_project_resource_roots_command",
        {
          request
        }
      );
    },
    async loadProjectDocument({ databasePath, projectId }) {
      return invokeTauri<ProjectDocument>("load_project_document_command", {
        request: { databasePath, projectId }
      });
    },
    async flushProjectDocument(request) {
      try {
        await invokeTauri<ProjectDocument>("persist_project_document_command", {
          request
        });
        return true;
      } catch {
        return false;
      }
    },
    async flushCanvasLayout(input) {
      const databasePath = input.databasePath ?? activeDatabasePath;
      if (!databasePath) {
        throw new Error("flushCanvasLayout: no database path in input or context");
      }
      await invokeTauri<{ writtenNodes: number; writtenEdges: number }>(
        "flush_canvas_layout_command",
        {
          request: buildFlushRequest({
            databasePath,
            canvasId: input.canvasId,
            layouts: input.layouts,
            edges: input.edges,
            viewport: input.viewport,
            appState: input.appState,
          }),
        }
      );
      return true;
    },
    async persistProjectDocument(request) {
      return invokeTauri<ProjectDocument>("persist_project_document_command", {
        request
      });
    },
    async searchProject(request) {
      return invokeTauri<SearchHit[]>("search_project_command", {
        request
      });
    },
    async listDirectories() {
      return invokeTauri<DirectoryEntry[]>("list_directories_command");
    },
    async listSavedSequences(request) {
      return invokeTauri<SavedSequence[]>("list_saved_sequences_command", { request });
    },
    async createSavedSequence(request) {
      return invokeTauri<SavedSequence>("create_saved_sequence_command", { request });
    },
    async updateSavedSequence(request) {
      return invokeTauri<SavedSequence>("update_saved_sequence_command", { request });
    },
    async deleteSavedSequence(request) {
      await invokeTauri<void>("delete_saved_sequence_command", { request });
    },
    async readGraphNode(input) {
      return invokeTauri<GraphNode>("read_graph_node_command", { request: input });
    },
    async createGraphNode(input) {
      return invokeTauri<GraphNode>("create_graph_node_command", { request: input });
    },
    async updateGraphNode(input) {
      return invokeTauri<GraphNode>("update_graph_node_command", { request: input });
    },
    async deleteGraphNode(input) {
      await invokeTauri<void>("delete_graph_node_command", { request: input });
    },
    async connectGraphNodes(input) {
      return invokeTauri<GraphRelationship>("connect_graph_nodes_command", { request: input });
    },
    async disconnectGraphNodes(input) {
      await invokeTauri<void>("disconnect_graph_nodes_command", { request: input });
    },
    async searchGraph(input) {
      return invokeTauri<GraphNode[]>("search_graph_command", { request: input });
    },
    async upsertNodeLayout(input) {
      await invokeTauri<void>("upsert_node_layout_command", { request: input });
    },
    async upsertNodeLayouts(input) {
      return invokeTauri<number>("upsert_node_layouts_command", { request: input });
    },
    async upsertEdgeLayout(input) {
      await invokeTauri<void>("upsert_edge_layout_command", { request: input });
    },
    async upsertCanvasAppState(input) {
      await invokeTauri<void>("upsert_canvas_app_state_command", { request: input });
    },
    async loadCanvasView(input) {
      return invokeTauri<CanvasView>("load_canvas_view_command", { request: input });
    },
    async archetypalLighting(input) {
      return invokeTauri<ArchetypalLighting>("archetypal_lighting_command", { request: input });
    },
    async resonancesForInstance(input) {
      return invokeTauri<LitInstance[]>("resonances_for_instance_command", { request: input });
    },
    async importNodeImage(input) {
      return invokeTauri<string>("import_node_image_command", {
        request: {
          workspaceRoot: input.workspaceRoot,
          graphNodeId: input.graphNodeId,
          sourceAbsolutePath: input.sourceAbsolutePath,
        },
      });
    },
    async listAgentActivity(input) {
      const rows = await invokeTauri<RawAgentActivityRow[]>("list_agent_activity_command", {
        limit: input.limit ?? null,
      });
      return rows.map(mapAgentActivityRow);
    },
    async readLocalNodeDocument(input) {
      return invokeTauri<{ body: string; summary: string; neo4jSynced: boolean } | null>(
        "read_local_node_document_command",
        { request: input }
      );
    },
    async upsertLocalNodeDocument(input) {
      await invokeTauri<void>("upsert_local_node_document_command", { request: input });
    },
  };
}

export function createBrowserBridgeTransport(): WorkspaceTransport {
  return {
    async attachProjectResourceRoot(request) {
      return requestJsonWithRetry<ResourceRoot>(
        `/workspace/project/${request.projectId}/resource-roots`,
        {
          body: {
            displayName: request.displayName ?? null,
            rootPath: request.rootPath
          },
          method: "POST"
        }
      );
    },
    async bootstrapWorkspace() {
      return requestJsonWithRetry<WorkspaceBootstrap>("/workspace/bootstrap");
    },
    async detachProjectResourceRoot({ projectId, rootPath }) {
      await requestJsonWithRetry<void>(
        `/workspace/project/${projectId}/resource-roots`,
        {
          body: { rootPath },
          method: "DELETE"
        }
      );
    },
    async listProjectResourceRoots({ projectId }) {
      return requestJsonWithRetry<ResourceRoot[]>(
        `/workspace/project/${projectId}/resource-roots`
      );
    },
    async loadProjectDocument({ projectId }) {
      return requestJsonWithRetry<ProjectDocument>(`/workspace/project/${projectId}`);
    },
    flushProjectDocument(request) {
      if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
        return false;
      }

      const beaconPath = `${BRIDGE_BASE_URL}/workspace/project/${request.projectId}/persist?sessionId=${encodeURIComponent(browserSessionId())}`;
      return navigator.sendBeacon(beaconPath, JSON.stringify(request));
    },
    flushCanvasLayout() {
      throw new Error("read-only web build");
    },
    async persistProjectDocument(request) {
      return requestJsonWithRetry<ProjectDocument>(
        `/workspace/project/${request.projectId}/persist`,
        {
          method: "POST",
          body: request
        }
      );
    },
    async searchProject({ limit, projectId, query }) {
      const params = new URLSearchParams({
        projectId,
        q: query
      });

      if (typeof limit === "number") {
        params.set("limit", String(limit));
      }

      return requestJsonWithRetry<SearchHit[]>(
        `/workspace/search?${params.toString()}`
      );
    },
    async listDirectories() {
      return requestJsonWithRetry<DirectoryEntry[]>("/workspace/directories");
    },
    async listSavedSequences({ databasePath: _, projectId, canvasId }) {
      return requestJsonWithRetry<SavedSequence[]>(
        `/workspace/project/${projectId}/sequences?canvasId=${encodeURIComponent(canvasId)}`
      );
    },
    async createSavedSequence({ databasePath: _, projectId, canvasId, name }) {
      return requestJsonWithRetry<SavedSequence>(
        `/workspace/project/${projectId}/sequences`,
        {
          method: "POST",
          body: { canvasId, name }
        }
      );
    },
    async updateSavedSequence({ databasePath: _, id, name, rootNodeId, edgeIds }) {
      return requestJsonWithRetry<SavedSequence>(
        `/workspace/project/sequences/${id}`,
        {
          method: "PUT",
          body: { id, name, rootNodeId, edgeIds }
        }
      );
    },
    async deleteSavedSequence({ databasePath: _, id }) {
      await requestJsonWithRetry<void>(
        `/workspace/project/sequences/${id}`,
        { method: "DELETE" }
      );
    },
    async readGraphNode(input) {
      return requestJsonWithRetry<GraphNode>(
        `/graph/node/${encodeURIComponent(input.graphNodeId)}`,
      );
    },
    async searchGraph(input) {
      const params = new URLSearchParams({ query: input.query });
      if (input.limit != null) params.set("limit", String(input.limit));
      return requestJsonWithRetry<GraphNode[]>(`/graph/search?${params.toString()}`);
    },
    async loadCanvasView(input) {
      const params = new URLSearchParams({ canvasId: input.canvasId, lens: input.lens });
      return requestJsonWithRetry<CanvasView>(`/graph/canvas-view?${params.toString()}`);
    },
    async archetypalLighting(input) {
      return requestJsonWithRetry<ArchetypalLighting>(
        `/graph/lighting/${encodeURIComponent(input.operatorGraphNodeId)}`,
      );
    },
    async resonancesForInstance(input) {
      return requestJsonWithRetry<LitInstance[]>(
        `/graph/resonances/${encodeURIComponent(input.graphNodeId)}`,
      );
    },
    async createGraphNode() { throw new Error("read-only web build"); },
    async updateGraphNode() { throw new Error("read-only web build"); },
    async deleteGraphNode() { throw new Error("read-only web build"); },
    async connectGraphNodes() { throw new Error("read-only web build"); },
    async disconnectGraphNodes() { throw new Error("read-only web build"); },
    async upsertNodeLayout() { throw new Error("read-only web build"); },
    async upsertNodeLayouts() { throw new Error("read-only web build"); },
    async upsertEdgeLayout() { throw new Error("read-only web build"); },
    async upsertCanvasAppState() { throw new Error("read-only web build"); },
    async importNodeImage() { throw new Error("read-only web build"); },
    async listAgentActivity(input) {
      const url = `${BRIDGE_BASE_URL}/agent-activity?limit=${input.limit ?? 50}`;
      const response = await fetch(url);
      if (!response.ok) return [];
      const rows = (await response.json()) as RawAgentActivityRow[];
      return rows.map(mapAgentActivityRow);
    },
    async readLocalNodeDocument() { throw new Error("read-only web build"); },
    async upsertLocalNodeDocument() { throw new Error("read-only web build"); },
  };
}

type TauriInvoke = <T>(
  command: string,
  args?: Record<string, unknown>
) => Promise<T>;

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: TauriInvoke;
    };
  }
}

function invokeTauri<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  const invoke = window.__TAURI_INTERNALS__?.invoke;
  if (!invoke) {
    return Promise.reject(new Error("Tauri runtime is unavailable"));
  }

  return invoke<T>(command, args);
}

function isTauriRuntime() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

function resolveBrowserBridgePort() {
  const env = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }).env;
  const rawPort = env?.VITE_RESEARCH_CANVAS_TERMINAL_BRIDGE_PORT;
  if (rawPort === undefined) {
    return DEFAULT_BRIDGE_PORT;
  }

  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return DEFAULT_BRIDGE_PORT;
  }

  return port;
}

async function requestJsonWithRetry<T>(
  path: string,
  options: {
    body?: unknown;
    method?: "DELETE" | "GET" | "POST" | "PUT";
  } = {}
): Promise<T> {
  const attempts = 120;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestJson<T>(path, options);
    } catch (cause) {
      if (!isRetryableNetworkError(cause) || attempt === attempts - 1) {
        throw cause;
      }

      await delay(150);
    }
  }

  throw new Error("bridge request failed");
}

async function requestJson<T>(
  path: string,
  options: {
    body?: unknown;
    method?: "DELETE" | "GET" | "POST" | "PUT";
  }
): Promise<T> {
  const method = options.method ?? "GET";
  const response = await fetch(`${BRIDGE_BASE_URL}${path}`, {
    body: method === "GET" ? undefined : JSON.stringify(options.body ?? {}),
    headers: {
      ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
      "X-Research-Canvas-Session": browserSessionId()
    },
    method
  });

  if (!response.ok) {
    throw new Error(`Bridge request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

function browserSessionId() {
  const current = readCookie(SESSION_COOKIE);
  if (current) {
    return current;
  }

  const nextValue = crypto.randomUUID();
  document.cookie = `${SESSION_COOKIE}=${nextValue}; path=/; SameSite=Lax`;
  return nextValue;
}

function readCookie(name: string) {
  return document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function isRetryableNetworkError(cause: unknown) {
  return cause instanceof TypeError && cause.message.includes("fetch");
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

interface IndexedEntryNode extends IndexedEntry {
  children: IndexedEntryNode[];
}

interface TreeRecord<T> {
  item: T;
  children: TreeRecord<T>[];
}

export function buildProjectTree(projects: ProjectTreeNode[]): ProjectTreeNode[] {
  const records = new Map<string, TreeRecord<ProjectTreeNode>>();

  for (const project of projects) {
    records.set(project.id, {
      item: { ...project, children: [] },
      children: []
    });
  }

  const roots: TreeRecord<ProjectTreeNode>[] = [];

  for (const project of projects) {
    const record = records.get(project.id);
    if (!record) {
      continue;
    }

    if (project.parentId) {
      const parent = records.get(project.parentId);
      if (parent) {
        parent.children.push(record);
      }
      continue;
    }

    roots.push(record);
  }

  const toNode = (record: TreeRecord<ProjectTreeNode>): ProjectTreeNode => ({
    ...record.item,
    children: record.children
      .slice()
      .sort((left, right) => left.item.name.localeCompare(right.item.name))
      .map(toNode)
  });

  return roots
    .slice()
    .sort((left, right) => left.item.name.localeCompare(right.item.name))
    .map(toNode);
}

export function buildIndexedEntryTree(
  entries: IndexedEntry[]
): IndexedEntryNode[] {
  const roots: TreeRecord<IndexedEntryNode>[] = [];
  const records = new Map<string, TreeRecord<IndexedEntryNode>>();

  const sortedEntries = entries
    .slice()
    .sort((left, right) => {
      if (left.depth !== right.depth) {
        return left.depth - right.depth;
      }

      return left.relativePath.localeCompare(right.relativePath);
    });

  for (const entry of sortedEntries) {
    const record: TreeRecord<IndexedEntryNode> = {
      item: { ...entry, children: [] },
      children: []
    };
    records.set(entry.relativePath, record);

    const parentPath = parentDirectory(entry.relativePath);
    if (!parentPath) {
      roots.push(record);
      continue;
    }

    const parent = records.get(parentPath);
    if (parent) {
      parent.children.push(record);
      continue;
    }

    roots.push(record);
  }

  const toNode = (record: TreeRecord<IndexedEntryNode>): IndexedEntryNode => ({
    ...record.item,
    children: record.children
      .slice()
      .sort((left, right) => left.item.name.localeCompare(right.item.name))
      .map(toNode)
  });

  return roots
    .slice()
    .sort((left, right) => left.item.name.localeCompare(right.item.name))
    .map(toNode);
}

function parentDirectory(path: string): string | null {
  const index = path.lastIndexOf("/");
  if (index === -1) {
    return null;
  }

  return path.slice(0, index);
}

const READ_ONLY_MESSAGE = "read-only web build";

function defaultLayoutFor(graphNodeId: string, canvasId: string): NodeLayout {
  // Deterministic auto-placement for substance with no layout row, so an
  // agent-authored node still surfaces in the read-only viewer.
  let hash = 0;
  for (let i = 0; i < graphNodeId.length; i += 1) {
    hash = (hash * 31 + graphNodeId.charCodeAt(i)) >>> 0;
  }
  const column = hash % 6;
  const row = Math.floor(hash / 6) % 6;
  return {
    graphNodeId,
    canvasId,
    positionX: 80 + column * 320,
    positionY: 80 + row * 220,
    width: 240,
    height: 160,
    style: {}
  };
}

export function createStaticBundleTransport(bundle: GraphExportBundle): WorkspaceTransport {
  const nodeById = new Map<string, GraphNode>(
    bundle.nodes.map((node) => [node.graphNodeId, node])
  );
  const layoutsByCanvas = new Map<string, NodeLayout[]>();
  for (const layout of bundle.nodeLayout) {
    const layouts = layoutsByCanvas.get(layout.canvasId) ?? [];
    layouts.push(layout);
    layoutsByCanvas.set(layout.canvasId, layouts);
  }

  const readOnlyReject = () => Promise.reject(new Error(READ_ONLY_MESSAGE));
  const readOnlyThrow = (): never => {
    throw new Error(READ_ONLY_MESSAGE);
  };

  return {
    // ---- existing project/file/annotation methods: not served by the static bundle ----
    attachProjectResourceRoot: readOnlyReject,
    bootstrapWorkspace: readOnlyReject,
    detachProjectResourceRoot: readOnlyReject,
    listProjectResourceRoots: readOnlyReject,
    loadProjectDocument: readOnlyReject,
    flushProjectDocument: readOnlyThrow,
    persistProjectDocument: readOnlyReject,
    searchProject: readOnlyReject,
    listDirectories: readOnlyReject,
    listSavedSequences: readOnlyReject,
    createSavedSequence: readOnlyReject,
    updateSavedSequence: readOnlyReject,
    deleteSavedSequence: readOnlyReject,

    // ---- substance reads ----
    async readGraphNode({ graphNodeId }) {
      const node = nodeById.get(graphNodeId);
      if (!node) {
        throw new Error(`graph node not found: ${graphNodeId}`);
      }
      return node;
    },
    async searchGraph({ query, limit }) {
      const needle = query.trim().toLowerCase();
      if (needle === "") {
        return [];
      }
      const hits = bundle.nodes.filter((node) =>
        `${node.title}\n${node.summary}\n${node.archetypalResonance ?? ""}`
          .toLowerCase()
          .includes(needle)
      );
      return typeof limit === "number" ? hits.slice(0, limit) : hits;
    },
    async loadCanvasView({ canvasId, lens }) {
      const canvasLayouts = layoutsByCanvas.get(canvasId) ?? [];
      const layoutById = new Map<string, NodeLayout>(
        canvasLayouts.map((layout) => [layout.graphNodeId, layout])
      );
      const canvasNodeIds = new Set(canvasLayouts.map((layout) => layout.graphNodeId));
      const visibleNodes =
        lens === "timeline"
          ? bundle.nodes.filter((node) => node.isTemporal)
          : bundle.nodes;
      const visible =
        canvasId === bundle.canvasId
          ? visibleNodes
          : visibleNodes.filter((node) => canvasNodeIds.has(node.graphNodeId));
      const joined: JoinedCanvasNode[] = visible.map((node) => {
        const layout = layoutById.get(node.graphNodeId);
        return {
          node,
          layout: layout ?? defaultLayoutFor(node.graphNodeId, canvasId)
        };
      });
      return {
        canvasId,
        nodes: joined,
        edges: bundle.edgeLayout.filter((edge) => edge.canvasId === canvasId),
        relationships: bundle.relationships,
        viewport: bundle.viewport,
        appState: bundle.appState
      };
    },
    async archetypalLighting({ operatorGraphNodeId }) {
      const operator = nodeById.get(operatorGraphNodeId);
      if (!operator) {
        throw new Error(`operator node not found: ${operatorGraphNodeId}`);
      }
      return {
        operator,
        instances: bundle.lightingIndex[operatorGraphNodeId] ?? []
      };
    },
    async resonancesForInstance({ graphNodeId }) {
      const result: LitInstance[] = [];
      for (const [operatorId, instances] of Object.entries(bundle.lightingIndex)) {
        const hit = instances.find((instance) => instance.node.graphNodeId === graphNodeId);
        if (!hit) {
          continue;
        }
        const operator = nodeById.get(operatorId);
        if (!operator) {
          continue;
        }
        result.push({ node: operator, relType: hit.relType, dominance: hit.dominance });
      }
      return result;
    },

    // ---- mutations: structurally forbidden on the web read-layer ----
    createGraphNode: readOnlyReject,
    updateGraphNode: readOnlyReject,
    deleteGraphNode: readOnlyReject,
    connectGraphNodes: readOnlyReject,
    disconnectGraphNodes: readOnlyReject,
    upsertNodeLayout: readOnlyReject,
    upsertNodeLayouts: readOnlyReject,
    upsertEdgeLayout: readOnlyReject,
    upsertCanvasAppState: readOnlyReject,
    flushCanvasLayout: readOnlyThrow,

    // ---- content / image import: not served by the static bundle ----
    importNodeImage: readOnlyReject,

    // ---- agent activity (WS6): excluded from the exported bundle per design §6 ----
    listAgentActivity: readOnlyReject,

    // ---- local node document: local-only SQLite store, not part of the static bundle ----
    readLocalNodeDocument: readOnlyReject,
    upsertLocalNodeDocument: readOnlyReject
  };
}

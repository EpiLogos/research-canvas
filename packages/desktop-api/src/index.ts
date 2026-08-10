import type {
  Annotation,
  CanvasEdge,
  CanvasNode,
  ExportAsset,
  ExportBundle,
  ProjectRootType,
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
  ContentOrigin,
  GraphRelationship,
  JoinedCanvasNode,
  LitInstance,
  LoadTimelineViewRequest,
  NewGraphNodeInput,
  NodeLayout,
  TimelineView,
  TimelineRelationField,
  TimelineAnchor,
  TimelineDiagnostic,
  TimelineFilters,
  TimelineLane,
  TimelineYearRange,
  TimelineLayoutOverride,
  UpsertTimelineLayoutInput,
  TimelineLayoutMutationResult,
  TimelineViewNode,
  TimelineValueFilter,
  TimelineNodeRecord,
  TemporalPrecision,
} from "./graph";
export type {
  ListSceneSequencesRequest,
  ListScenesRequest,
  Scene,
  SceneIdRequest,
  SceneSequence,
  UpsertSceneRequest,
  UpsertSceneSequenceRequest,
} from "./scenes";
export type {
  AddStreetViewRegionRequest,
  ApplyStreetViewRedactionRequest,
  ListStreetViewImagesRequest,
  RegisterStreetViewImageRequest,
  StageStreetViewImageInput,
  StreetViewIdRequest,
  StreetViewImageRecord,
  StreetViewRedactionReason,
  StreetViewRedactionStatus,
  StreetViewRegion,
} from "./streetView";
export type {
  GeographyEdge,
  GeographyEdgeIdRequest,
  ListGeographyEdgesRequest,
  UpsertGeographyEdgeRequest,
} from "./geographyEdges";
import {
  sceneFromWire,
  sceneSequenceFromWire,
  sceneSequenceToWire,
  sceneToWire,
  type ListSceneSequencesRequest,
  type ListScenesRequest,
  type Scene,
  type SceneIdRequest,
  type SceneSequence,
  type SceneSequenceWire,
  type SceneWire,
  type UpsertSceneRequest,
  type UpsertSceneSequenceRequest,
} from "./scenes";
import type {
  AddStreetViewRegionRequest,
  ApplyStreetViewRedactionRequest,
  ListStreetViewImagesRequest,
  RegisterStreetViewImageRequest,
  StageStreetViewImageInput,
  StreetViewIdRequest,
  StreetViewImageRecord,
} from "./streetView";
import {
  geographyEdgeFromWire,
  geographyEdgeToWire,
  type GeographyEdge,
  type GeographyEdgeIdRequest,
  type ListGeographyEdgesRequest,
  type UpsertGeographyEdgeRequest,
} from "./geographyEdges";

export type NodeDocumentMutation =
  | { kind: "created" }
  | { kind: "updated" }
  | { kind: "preserved" }
  | { kind: "conflict"; current_revision: number; reason: string };

export interface LocalNodeDocument {
  graphNodeId: string;
  body: string;
  summary: string;
  neo4jSynced: boolean;
  contentOrigin: ContentOrigin;
  contentRevision: number;
  bodySourceCoordinates: string[];
}

export interface LocalNodeDocumentWriteResult {
  mutation: NodeDocumentMutation;
  document: LocalNodeDocument | null;
}

export interface NodeAttachment {
  id: string;
  graphNodeId: string;
  managedPath: string;
  originalFilename: string;
  mimeType: string;
  kind: "image" | "file";
  contentHash: string;
  caption: string;
  /** Immutable byte class; presentation roles live in attachment usage. */
  role: "image" | "file";
  provenanceSourcePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthoritativeDocumentSnapshot {
  body: string;
  summary: string;
  contentOrigin: ContentOrigin;
  contentRevision: number;
  bodySourceCoordinates: string[];
  entityType: EntityType;
  title: string;
  schemaVersion: number;
}

export interface AttachNodeAttachmentInput {
  databasePath?: string;
  workspaceRoot: string;
  graphNodeId: string;
  sourceAbsolutePath: string;
  kind: "image" | "file";
  role: "inline" | "cover" | "file";
  caption?: string;
  /** Optional when the native SQLite projection is already open locally. */
  authoritativeDocument?: AuthoritativeDocumentSnapshot;
}

export interface AttachNodeAttachmentResult {
  attachment: NodeAttachment;
  document: LocalNodeDocument;
  /** The authoritative local projection after the durable attachment write. */
  graphNode: GraphNode;
  expectedRemoteOrigin: ContentOrigin;
  expectedRemoteRevision: number;
  /** False when native had only a pending local projection, not a CAS baseline. */
  remoteSyncEligible: boolean;
}

/** Canonical media presentation stored independently from canvas layouts. */
export interface NodeAttachmentPresentation {
  cover: NodeAttachment | null;
}

export type PendingNodeStructure = Omit<
  NewGraphNodeInput,
  "body" | "summary" | "contentOrigin" | "contentRevision" | "bodySourceCoordinates"
> & { graphNodeId: string };

export interface PendingNodeDocumentSync {
  document: LocalNodeDocument;
  structure: PendingNodeStructure;
}

export interface LocalNodeDocumentInput {
  databasePath: string;
  graphNodeId: string;
  body: string;
  summary: string;
  neo4jSynced?: boolean;
  contentOrigin?: ContentOrigin;
  contentRevision?: number;
  expectedRevision?: number;
  bodySourceCoordinates?: string[];
  dryRun?: boolean;
  metadataProjection?: {
    entityType: EntityType;
    title: string;
    schemaVersion: number;
  };
}

export interface GraphContentCasInput {
  graphNodeId: string;
  expectedRemoteRevision: number | null;
  expectedRemoteOrigin: ContentOrigin | null;
  allowLegacyNull?: boolean;
  body: string;
  summary: string;
  contentOrigin: ContentOrigin;
  contentRevision: number;
  bodySourceCoordinates: string[];
}

export type GraphContentCasMutation =
  | { kind: "updated" }
  | { kind: "missing" }
  | { kind: "conflict"; current_remote_revision: number | null; current_remote_origin: ContentOrigin | null; reason: string };

export type SyncAcknowledgementMutation =
  | { kind: "updated" }
  | { kind: "preserved" }
  | { kind: "missing" }
  | { kind: "conflict"; current_revision: number; current_origin: ContentOrigin; reason: string };
import type {
  ArchetypalLighting,
  CanvasNodeSidecar,
  CanvasView,
  ContentOrigin,
  EntityType,
  GraphNode,
  GraphNodePatch,
  GraphRelationship,
  JoinedCanvasNode,
  LitInstance,
  LoadTimelineViewRequest,
  NewGraphNodeInput,
  NodeLayout,
  EdgeLayout,
  TimelineView,
  TimelineRelationField,
  TimelineLayoutOverride,
  TimelineYearRange,
  UpsertTimelineLayoutInput,
  TimelineLayoutMutationResult,
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

export interface ConstellationTreeNode {
  id: string;
  name: string;
  slug: string;
  rootPath: string;
  rootType: ProjectRootType;
  profileScope: string;
  summary: string;
  parentId: string | null;
  children: ConstellationTreeNode[];
}

export interface WorkspaceConstellation {
  id: string;
  displayName: string;
  slug: string;
  parentConstellationId: string | null;
  rootPath: string;
  rootType: ProjectRootType;
  profileScope: string;
  primaryCanvasId: string;
  summary: string;
  coverAssetPath: string | null;
  publishSettings: PublishSettings;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceRoot {
  id: string;
  constellationId: string;
  rootPath: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceBootstrap {
  activeConstellationId: string;
  /** The active project — projects ARE constellations, so this is the same row as `activeConstellationId`. */
  activeProjectId: string;
  /** The active project's profile scope; lenses read their surface data through this scope. */
  activeProfileScope: string;
  databasePath: string;
  /** Server-derived identity of the canonical SQLite path. */
  workspaceId: string;
  constellations: ConstellationTreeNode[];
  /**
   * The monorepo root (not a constellation's content root, which for the
   * root-archetypal-field constellation is `antichrist-vault/`). Callers
   * that need to run shell commands (e.g. the embedded terminal) should
   * use this, not a constellation's `rootPath`.
   */
  workspaceRoot: string;
}

export interface ActiveProject {
  projectId: string;
  profileScope: string;
  rootType: ProjectRootType;
}

export interface HomeProject {
  id: string;
  name: string;
  slug: string;
  rootPath: string;
  rootType: ProjectRootType;
  profileScope: string;
  summary: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResolveHomeResult {
  homePath: string;
  projects: HomeProject[];
}

export interface ResolveHomeInput {
  databasePath?: string;
  homePath?: string;
}

export interface CreateProjectInput {
  databasePath: string;
  homePath: string;
  name: string;
  rootType: ProjectRootType;
  sourcePath?: string;
  summary?: string;
}

export interface ConstellationDocument {
  canvasId: string;
  databasePath: string;
  entries: IndexedEntry[];
  constellation: WorkspaceConstellation;
  resourceRoots: ResourceRoot[];
  workingRoot: string;
  annotations: Annotation[];
  edges: CanvasEdge[];
  nodes: CanvasNode[];
}

/**
 * The portable graph snapshot consumed by read-only transports.
 *
 * This contract belongs to the transport layer: the exporter produces it,
 * while desktop and public-viewer transports consume it. Keeping the type
 * here prevents a circular desktop-api -> exporter -> desktop-api dependency.
 */
export interface GraphExportBundle {
  generatedAt: string;
  project: ExportBundle["project"];
  canvasId: string;
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  nodeLayout: NodeLayout[];
  timelineLayout: Array<{ graphNodeId: string; layout: TimelineLayoutOverride }>;
  edgeLayout: EdgeLayout[];
  viewport: { x: number; y: number; zoom: number };
  appState: Record<string, unknown>;
  /** operatorGraphNodeId -> lit datable instances for a backend-less viewer. */
  lightingIndex: Record<string, LitInstance[]>;
  assets: ExportAsset[];
}

export interface PersistConstellationDocumentRequest {
  annotations: Annotation[];
  canvasId: string;
  databasePath: string;
  edges: CanvasEdge[];
  nodes: CanvasNode[];
  constellationId: string;
}

export interface SearchHit {
  documentKey: string;
  scopeConstellationId: string;
  constellationId: string;
  constellationDisplayName: string;
  constellationSlug: string;
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

export interface SearchConstellationRequest {
  databasePath: string;
  limit?: number;
  constellationId: string;
  query: string;
}

export interface ResourceRootMutationRequest {
  databasePath: string;
  displayName?: string;
  constellationId: string;
  rootPath: string;
}

export interface DirectoryEntry {
  path: string;
  name: string;
  depth: number;
}

export interface SavedSequence {
  id: string;
  constellationId: string;
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
  attachConstellationResourceRoot(
    request: ResourceRootMutationRequest
  ): Promise<ResourceRoot>;
  bootstrapWorkspace(): Promise<WorkspaceBootstrap>;
  selectProject(input: { databasePath: string; projectId: string }): Promise<ActiveProject>;
  /** Resolve-or-create the research-canvas home directory (the parent of all projects) and list the projects under it. */
  resolveOrCreateHome(input: ResolveHomeInput): Promise<ResolveHomeResult>;
  /** Create a directory or file project under the home. Idempotent per project slug. */
  createProject(input: CreateProjectInput): Promise<WorkspaceConstellation>;
  detachConstellationResourceRoot(request: {
    databasePath: string;
    constellationId: string;
    rootPath: string;
  }): Promise<void>;
  listConstellationResourceRoots(input: {
    databasePath: string;
    constellationId: string;
  }): Promise<ResourceRoot[]>;
  loadConstellationDocument(input: {
    databasePath: string;
    constellationId: string;
  }): Promise<ConstellationDocument>;
  flushConstellationDocument(request: PersistConstellationDocumentRequest): boolean | Promise<boolean>;
  flushCanvasLayout(input: {
    databasePath?: string;
    canvasId: string;
    layouts: NodeLayout[];
    edges: EdgeLayout[];
    viewport: { x: number; y: number; zoom: number };
    appState: Record<string, unknown>;
  }): boolean | Promise<boolean>;
  persistConstellationDocument(
    request: PersistConstellationDocumentRequest
  ): Promise<ConstellationDocument>;
  searchConstellation(request: SearchConstellationRequest): Promise<SearchHit[]>;
  listDirectories(): Promise<DirectoryEntry[]>;
  listSavedSequences(input: { databasePath: string; constellationId: string; canvasId: string }): Promise<SavedSequence[]>;
  createSavedSequence(input: { databasePath: string; constellationId: string; canvasId: string; name: string }): Promise<SavedSequence>;
  updateSavedSequence(input: { databasePath: string; id: string; name: string; rootNodeId: string | null; edgeIds: string[] }): Promise<SavedSequence>;
  deleteSavedSequence(input: { databasePath: string; id: string }): Promise<void>;

  // ---- Profile scenes and scene sequences (SQLite; vision §3.7/§3.15) ----
  listScenes(input: ListScenesRequest): Promise<Scene[]>;
  listSceneSequences(input: ListSceneSequencesRequest): Promise<SceneSequence[]>;
  getScene(input: SceneIdRequest): Promise<Scene | null>;
  upsertScene(input: UpsertSceneRequest): Promise<Scene>;
  upsertSceneSequence(input: UpsertSceneSequenceRequest): Promise<SceneSequence>;
  deleteScene(input: SceneIdRequest): Promise<void>;
  deleteSceneSequence(input: SceneIdRequest): Promise<void>;

  // ---- Street-view imagery (SQLite + local redaction pipeline) ----
  listStreetViewImages(input: ListStreetViewImagesRequest): Promise<StreetViewImageRecord[]>;
  registerStreetViewImage(input: RegisterStreetViewImageRequest): Promise<StreetViewImageRecord>;
  stageStreetViewImage(input: StageStreetViewImageInput): Promise<{ artifactPath: string }>;
  addManualStreetViewRegion(input: AddStreetViewRegionRequest): Promise<StreetViewImageRecord>;
  applyStreetViewRedaction(input: ApplyStreetViewRedactionRequest): Promise<StreetViewImageRecord>;
  markStreetViewRedactionNoneNeeded(input: StreetViewIdRequest): Promise<StreetViewImageRecord>;

  // ---- Geography edges (SQLite surface movement streams; ticket #19) ----
  listGeographyEdges(input: ListGeographyEdgesRequest): Promise<GeographyEdge[]>;
  upsertGeographyEdge(input: UpsertGeographyEdgeRequest): Promise<GeographyEdge>;
  deleteGeographyEdge(input: GeographyEdgeIdRequest): Promise<void>;

  // ---- Keepsake export (self-contained static bundle) ----
  writeKeepsakeBundle(input: {
    outputDir: string;
    mediaRoot: string;
    manifestJson: string;
  }): Promise<{ mediaCopied: number; manifestPath: string }>;

  // ---- Mind-palace curation (SQLite; vision §3.12) ----
  loadPalaceCuration(input: {
    databasePath: string;
    profileScope?: string;
  }): Promise<{ profileScope: string; curation: unknown }>;
  savePalaceCuration(input: {
    databasePath: string;
    profileScope?: string;
    curation: unknown;
  }): Promise<{ profileScope: string; curation: unknown }>;

  // ---- Substance (Neo4j) ----
  readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>;
  findGraphNode(input: { graphNodeId: string }): Promise<GraphNode | null>;
  createGraphNode(input: NewGraphNodeInput): Promise<GraphNode>;
  updateGraphNode(input: { graphNodeId: string; patch: GraphNodePatch }): Promise<GraphNode>;
  compareAndSwapGraphNodeContent(input: GraphContentCasInput): Promise<GraphContentCasMutation>;
  deleteGraphNode(input: { graphNodeId: string }): Promise<void>;
  connectGraphNodes(input: {
    databasePath?: string;
    sourceGraphNodeId: string; targetGraphNodeId: string;
    relType: string; properties?: Record<string, unknown>;
    canonicalKey?: string;
    origin?: ContentOrigin;
    revision?: number;
    expectedRevision?: number;
    sourceCoordinates?: string[];
    evidenceTags?: string[];
  }): Promise<GraphRelationship>;
  disconnectGraphNodes(input: { databasePath?: string; relationshipId: string }): Promise<void>;
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
  loadTimelineView(input: LoadTimelineViewRequest): Promise<TimelineView>;
  loadTimelineRelationField?(input: { workspaceId: string; graphNodeId: string }): Promise<TimelineRelationField>;
  upsertTimelineLayout(input: UpsertTimelineLayoutInput): Promise<TimelineLayoutMutationResult>;

  // ---- Two-lens / archetypal lighting ----
  archetypalLighting(input: { operatorGraphNodeId: string }): Promise<ArchetypalLighting>;
  resonancesForInstance(input: { graphNodeId: string }): Promise<LitInstance[]>;

  // ---- Content / image import ----
  importNodeImage(input: {
    workspaceRoot: string;
    graphNodeId: string;
    sourceAbsolutePath: string;
  }): Promise<string>;
  attachNodeAttachment(input: AttachNodeAttachmentInput): Promise<AttachNodeAttachmentResult>;
  readNodeAttachmentPresentation(input: {
    databasePath?: string;
    graphNodeId: string;
  }): Promise<NodeAttachmentPresentation>;

  // ---- Agent activity (WS6) ----
  listAgentActivity(input: { limit?: number }): Promise<AgentActivity[]>;

  // ---- Local node document (SQLite; Task 1.1/1.2) ----
  readLocalNodeDocument(input: {
    databasePath: string;
    graphNodeId: string;
  }): Promise<LocalNodeDocument | null>;
  listPendingNodeDocumentSyncs(input: {
    databasePath: string;
  }): Promise<PendingNodeDocumentSync[]>;
  upsertLocalNodeDocument(input: LocalNodeDocumentInput): Promise<LocalNodeDocumentWriteResult>;
  acknowledgeLocalNodeDocumentSync(input: {
    databasePath: string;
    graphNodeId: string;
    expectedRevision: number;
    expectedOrigin: ContentOrigin;
  }): Promise<SyncAcknowledgementMutation>;
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
  let activeProfileScope: string | undefined;

  return {
    async attachConstellationResourceRoot(request) {
      return invokeTauri<ResourceRoot>("attach_constellation_resource_root_command", {
        request
      });
    },
    async bootstrapWorkspace() {
      const result = await invokeTauri<WorkspaceBootstrap>("bootstrap_workspace_command");
      activeDatabasePath = result.databasePath;
      activeProfileScope = result.activeProfileScope;
      return result;
    },
    async selectProject({ databasePath, projectId }) {
      const result = await invokeTauri<ActiveProject>("set_active_project_command", {
        request: { databasePath, projectId }
      });
      activeProfileScope = result.profileScope;
      return result;
    },
    async resolveOrCreateHome(input) {
      return invokeTauri<ResolveHomeResult>("resolve_or_create_home_command", {
        request: {
          databasePath: input.databasePath ?? null,
          homePath: input.homePath ?? null,
        },
      });
    },
    async createProject(input) {
      return invokeTauri<WorkspaceConstellation>("create_project_command", { request: input });
    },
    async detachConstellationResourceRoot(request) {
      await invokeTauri<void>("detach_constellation_resource_root_command", {
        request
      });
    },
    async listConstellationResourceRoots(request) {
      return invokeTauri<ResourceRoot[]>(
        "list_constellation_resource_roots_command",
        {
          request
        }
      );
    },
    async loadConstellationDocument({ databasePath, constellationId }) {
      return invokeTauri<ConstellationDocument>("load_constellation_document_command", {
        request: { databasePath, constellationId }
      });
    },
    async flushConstellationDocument(request) {
      try {
        await invokeTauri<ConstellationDocument>("persist_constellation_document_command", {
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
    async persistConstellationDocument(request) {
      return invokeTauri<ConstellationDocument>("persist_constellation_document_command", {
        request
      });
    },
    async searchConstellation(request) {
      return invokeTauri<SearchHit[]>("search_constellation_command", {
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
    async listScenes({ databasePath, profileScope }) {
      const scope = profileScope ?? activeProfileScope;
      if (!scope) {
        throw new Error("listScenes: no profileScope in input or active project");
      }
      const wires = await invokeTauri<SceneWire[]>("list_scenes_command", {
        request: { databasePath, profileScope: scope },
      });
      return wires.map(sceneFromWire);
    },
    async listSceneSequences({ databasePath, profileScope }) {
      const scope = profileScope ?? activeProfileScope;
      if (!scope) {
        throw new Error("listSceneSequences: no profileScope in input or active project");
      }
      const wires = await invokeTauri<SceneSequenceWire[]>("list_scene_sequences_command", {
        request: { databasePath, profileScope: scope },
      });
      return wires.map(sceneSequenceFromWire);
    },
    async getScene({ databasePath, id }) {
      const wire = await invokeTauri<SceneWire | null>("get_scene_command", {
        request: { databasePath, id },
      });
      return wire ? sceneFromWire(wire) : null;
    },
    async upsertScene({ databasePath, scene }) {
      const saved = await invokeTauri<SceneWire>("upsert_scene_command", {
        request: { databasePath, scene: sceneToWire(scene) },
      });
      return sceneFromWire(saved);
    },
    async upsertSceneSequence({ databasePath, sequence }) {
      const saved = await invokeTauri<SceneSequenceWire>("upsert_scene_sequence_command", {
        request: { databasePath, sequence: sceneSequenceToWire(sequence) },
      });
      return sceneSequenceFromWire(saved);
    },
    async deleteScene({ databasePath, id }) {
      await invokeTauri<void>("delete_scene_command", {
        request: { databasePath, id },
      });
    },
    async deleteSceneSequence({ databasePath, id }) {
      await invokeTauri<void>("delete_scene_sequence_command", {
        request: { databasePath, id },
      });
    },
    async listStreetViewImages({ databasePath, profileScope }) {
      const scope = profileScope ?? activeProfileScope;
      if (!scope) {
        throw new Error("listStreetViewImages: no profileScope in input or active project");
      }
      return invokeTauri<StreetViewImageRecord[]>("list_street_view_images_command", {
        request: { databasePath, profileScope: scope },
      });
    },
    async registerStreetViewImage({ databasePath, mediaRoot, image }) {
      return invokeTauri<StreetViewImageRecord>("register_street_view_image_command", {
        request: { databasePath, mediaRoot, image },
      });
    },
    async stageStreetViewImage({ mediaRoot, profileScope, fileName, bytes }) {
      const scope = profileScope ?? activeProfileScope;
      if (!scope) {
        throw new Error("stageStreetViewImage: no profileScope in input or active project");
      }
      return invokeTauri<{ artifactPath: string }>("stage_street_view_image_command", {
        request: {
          mediaRoot,
          profileScope: scope,
          fileName,
          bytes: Array.from(bytes),
        },
      });
    },
    async addManualStreetViewRegion({ databasePath, id, region }) {
      return invokeTauri<StreetViewImageRecord>("add_manual_street_view_region_command", {
        request: { databasePath, id, region },
      });
    },
    async applyStreetViewRedaction({ databasePath, mediaRoot, id }) {
      return invokeTauri<StreetViewImageRecord>("apply_street_view_redaction_command", {
        request: { databasePath, mediaRoot, id },
      });
    },
    async markStreetViewRedactionNoneNeeded({ databasePath, id }) {
      return invokeTauri<StreetViewImageRecord>(
        "mark_street_view_redaction_none_needed_command",
        { request: { databasePath, id } },
      );
    },
    async listGeographyEdges({ databasePath, profileScope }) {
      const scope = profileScope ?? activeProfileScope;
      if (!scope) {
        throw new Error("listGeographyEdges: no profileScope in input or active project");
      }
      const wires = await invokeTauri<GeographyEdge[]>("list_geography_edges_command", {
        request: { databasePath, profileScope: scope },
      });
      return wires.map(geographyEdgeFromWire);
    },
    async upsertGeographyEdge({ databasePath, edge }) {
      const saved = await invokeTauri<GeographyEdge>("upsert_geography_edge_command", {
        request: { databasePath, edge: geographyEdgeToWire(edge) },
      });
      return geographyEdgeFromWire(saved);
    },
    async deleteGeographyEdge({ databasePath, id }) {
      await invokeTauri<void>("delete_geography_edge_command", {
        request: { databasePath, id },
      });
    },
    async writeKeepsakeBundle(input) {
      return invokeTauri<{ mediaCopied: number; manifestPath: string }>(
        "write_keepsake_bundle_command",
        { request: input },
      );
    },
    async loadPalaceCuration(input) {
      const scope = input.profileScope ?? activeProfileScope;
      if (!scope) {
        throw new Error("loadPalaceCuration: no profileScope in input or active project");
      }
      return invokeTauri<{ profileScope: string; curation: unknown }>(
        "load_palace_curation_command",
        { request: { databasePath: input.databasePath, profileScope: scope } },
      );
    },
    async savePalaceCuration(input) {
      const scope = input.profileScope ?? activeProfileScope;
      if (!scope) {
        throw new Error("savePalaceCuration: no profileScope in input or active project");
      }
      return invokeTauri<{ profileScope: string; curation: unknown }>(
        "save_palace_curation_command",
        { request: { databasePath: input.databasePath, profileScope: scope, curation: input.curation } },
      );
    },
    async readGraphNode(input) {
      return invokeTauri<GraphNode>("read_graph_node_command", { request: input });
    },
    async findGraphNode(input) {
      return invokeTauri<GraphNode | null>("find_graph_node_command", { request: input });
    },
    async createGraphNode(input) {
      return invokeTauri<GraphNode>("create_graph_node_command", { request: input });
    },
    async updateGraphNode(input) {
      return invokeTauri<GraphNode>("update_graph_node_command", { request: input });
    },
    async compareAndSwapGraphNodeContent(input) {
      return invokeTauri<GraphContentCasMutation>("compare_and_swap_graph_node_content_command", { request: input });
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
    async loadTimelineView(input) {
      return invokeTauri<TimelineView>("load_timeline_view_command", { request: input });
    },
    async loadTimelineRelationField(input) {
      return invokeTauri<TimelineRelationField>("load_timeline_relation_field_command", { request: input });
    },
    async upsertTimelineLayout(input) {
      return invokeTauri<TimelineLayoutMutationResult>("upsert_timeline_layout_command", { request: input });
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
    async attachNodeAttachment(input) {
      return invokeTauri<AttachNodeAttachmentResult>("attach_node_attachment_command", {
        request: input,
      });
    },
    async readNodeAttachmentPresentation(input) {
      return invokeTauri<NodeAttachmentPresentation>(
        "read_node_attachment_presentation_command",
        { request: input },
      );
    },
    async listAgentActivity(input) {
      const rows = await invokeTauri<RawAgentActivityRow[]>("list_agent_activity_command", {
        limit: input.limit ?? null,
      });
      return rows.map(mapAgentActivityRow);
    },
    async readLocalNodeDocument(input) {
      return invokeTauri<LocalNodeDocument | null>(
        "read_local_node_document_command",
        { request: input }
      );
    },
    async listPendingNodeDocumentSyncs(input) {
      return invokeTauri<PendingNodeDocumentSync[]>(
        "list_pending_node_document_syncs_command",
        { request: input }
      );
    },
    async upsertLocalNodeDocument(input) {
      return invokeTauri<LocalNodeDocumentWriteResult>("upsert_local_node_document_command", { request: input });
    },
    async acknowledgeLocalNodeDocumentSync(input) {
      return invokeTauri<SyncAcknowledgementMutation>("acknowledge_local_node_document_sync_command", { request: input });
    },
  };
}

export function createBrowserBridgeTransport(): WorkspaceTransport {
  let activeDatabasePath: string | undefined;
  let activeProfileScope: string | undefined;

  return {
    async attachConstellationResourceRoot(request) {
      return requestJsonWithRetry<ResourceRoot>(
        `/workspace/constellation/${request.constellationId}/resource-roots`,
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
      const result = await requestJsonWithRetry<WorkspaceBootstrap>("/workspace/bootstrap");
      activeDatabasePath = result.databasePath;
      activeProfileScope = result.activeProfileScope;
      return result;
    },
    async selectProject() {
      throw new Error("selectProject is not supported by the browser bridge transport");
    },
    async resolveOrCreateHome(input) {
      const params = new URLSearchParams();
      if (input.databasePath) params.set("databasePath", input.databasePath);
      if (input.homePath) params.set("homePath", input.homePath);
      const query = params.toString();
      return requestJsonWithRetry<ResolveHomeResult>(
        `/workspace/home${query ? `?${query}` : ""}`
      );
    },
    async createProject(input) {
      return requestJsonWithRetry<WorkspaceConstellation>("/workspace/projects", {
        method: "POST",
        body: input,
      });
    },
    async detachConstellationResourceRoot({ constellationId, rootPath }) {
      await requestJsonWithRetry<void>(
        `/workspace/constellation/${constellationId}/resource-roots`,
        {
          body: { rootPath },
          method: "DELETE"
        }
      );
    },
    async listConstellationResourceRoots({ constellationId }) {
      return requestJsonWithRetry<ResourceRoot[]>(
        `/workspace/constellation/${constellationId}/resource-roots`
      );
    },
    async loadConstellationDocument({ constellationId }) {
      return requestJsonWithRetry<ConstellationDocument>(`/workspace/constellation/${constellationId}`);
    },
    flushConstellationDocument(request) {
      if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
        return false;
      }

      const beaconPath = `${BRIDGE_BASE_URL}/workspace/constellation/${request.constellationId}/persist?sessionId=${encodeURIComponent(browserSessionId())}`;
      return navigator.sendBeacon(beaconPath, JSON.stringify(request));
    },
    async flushCanvasLayout(input) {
      const databasePath = input.databasePath ?? activeDatabasePath;
      if (!databasePath) {
        throw new Error("flushCanvasLayout: no database path in input or context");
      }
      await requestJsonWithRetry<{ writtenNodes: number; writtenEdges: number }>(
        "/workspace/canvas/layout",
        {
          method: "POST",
          body: buildFlushRequest({
            databasePath,
            canvasId: input.canvasId,
            layouts: input.layouts,
            edges: input.edges,
            viewport: input.viewport,
            appState: input.appState,
          }),
        },
      );
      return true;
    },
    async persistConstellationDocument(request) {
      return requestJsonWithRetry<ConstellationDocument>(
        `/workspace/constellation/${request.constellationId}/persist`,
        {
          method: "POST",
          body: request
        }
      );
    },
    async searchConstellation({ limit, constellationId, query }) {
      const params = new URLSearchParams({
        constellationId,
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
    async listSavedSequences({ databasePath: _, constellationId, canvasId }) {
      return requestJsonWithRetry<SavedSequence[]>(
        `/workspace/constellation/${constellationId}/sequences?canvasId=${encodeURIComponent(canvasId)}`
      );
    },
    async createSavedSequence({ databasePath: _, constellationId, canvasId, name }) {
      return requestJsonWithRetry<SavedSequence>(
        `/workspace/constellation/${constellationId}/sequences`,
        {
          method: "POST",
          body: { canvasId, name }
        }
      );
    },
    async updateSavedSequence({ databasePath: _, id, name, rootNodeId, edgeIds }) {
      return requestJsonWithRetry<SavedSequence>(
        `/workspace/constellation/sequences/${id}`,
        {
          method: "PUT",
          body: { id, name, rootNodeId, edgeIds }
        }
      );
    },
    async deleteSavedSequence({ databasePath: _, id }) {
      await requestJsonWithRetry<void>(
        `/workspace/constellation/sequences/${id}`,
        { method: "DELETE" }
      );
    },
    async listScenes({ databasePath: _, profileScope }) {
      const scope = profileScope ?? activeProfileScope;
      if (!scope) {
        throw new Error("listScenes: no profileScope in input or active project");
      }
      const params = new URLSearchParams({ profileScope: scope });
      const wires = await requestJsonWithRetry<SceneWire[]>(
        `/workspace/scenes?${params.toString()}`,
      );
      return wires.map(sceneFromWire);
    },
    async listSceneSequences({ databasePath: _, profileScope }) {
      const scope = profileScope ?? activeProfileScope;
      if (!scope) {
        throw new Error("listSceneSequences: no profileScope in input or active project");
      }
      const params = new URLSearchParams({ profileScope: scope });
      const wires = await requestJsonWithRetry<SceneSequenceWire[]>(
        `/workspace/scene-sequences?${params.toString()}`,
      );
      return wires.map(sceneSequenceFromWire);
    },
    async getScene({ databasePath: _, id }) {
      const wire = await requestJsonWithRetry<SceneWire | null>(
        `/workspace/scenes/${encodeURIComponent(id)}`,
      );
      return wire ? sceneFromWire(wire) : null;
    },
    async upsertScene({ databasePath: _, scene }) {
      const saved = await requestJsonWithRetry<SceneWire>("/workspace/scenes", {
        method: "POST",
        body: sceneToWire(scene),
      });
      return sceneFromWire(saved);
    },
    async upsertSceneSequence({ databasePath: _, sequence }) {
      const saved = await requestJsonWithRetry<SceneSequenceWire>("/workspace/scene-sequences", {
        method: "POST",
        body: sceneSequenceToWire(sequence),
      });
      return sceneSequenceFromWire(saved);
    },
    async deleteScene({ databasePath: _, id }) {
      await requestJsonWithRetry<void>(`/workspace/scenes/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
    async deleteSceneSequence({ databasePath: _, id }) {
      await requestJsonWithRetry<void>(
        `/workspace/scene-sequences/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
    },
    async listStreetViewImages({ databasePath: _, profileScope }) {
      const scope = profileScope ?? activeProfileScope;
      if (!scope) {
        throw new Error("listStreetViewImages: no profileScope in input or active project");
      }
      const params = new URLSearchParams({ profileScope: scope });
      return requestJsonWithRetry<StreetViewImageRecord[]>(
        `/workspace/street-view?${params.toString()}`,
      );
    },
    async registerStreetViewImage({ databasePath: _, mediaRoot, image }) {
      return requestJsonWithRetry<StreetViewImageRecord>("/workspace/street-view", {
        method: "POST",
        body: { mediaRoot, image },
      });
    },
    async stageStreetViewImage({ mediaRoot, profileScope, fileName, bytes }) {
      const scope = profileScope ?? activeProfileScope;
      if (!scope) {
        throw new Error("stageStreetViewImage: no profileScope in input or active project");
      }
      const params = new URLSearchParams({ mediaRoot, profileScope: scope, fileName });
      const response = await fetch(
        `${BRIDGE_BASE_URL}/workspace/street-view/stage?${params.toString()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer,
        },
      );
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `stage street view image failed (${response.status}): ${detail.slice(0, 240)}`,
        );
      }
      return response.json() as Promise<{ artifactPath: string }>;
    },
    async addManualStreetViewRegion({ databasePath: _, id, region }) {
      return requestJsonWithRetry<StreetViewImageRecord>(
        `/workspace/street-view/${encodeURIComponent(id)}/regions`,
        { method: "POST", body: { region } },
      );
    },
    async applyStreetViewRedaction({ databasePath: _, mediaRoot, id }) {
      return requestJsonWithRetry<StreetViewImageRecord>(
        `/workspace/street-view/${encodeURIComponent(id)}/redact`,
        { method: "POST", body: { mediaRoot } },
      );
    },
    async markStreetViewRedactionNoneNeeded({ databasePath: _, id }) {
      return requestJsonWithRetry<StreetViewImageRecord>(
        `/workspace/street-view/${encodeURIComponent(id)}/none-needed`,
        { method: "POST" },
      );
    },
    async listGeographyEdges({ databasePath: _, profileScope }) {
      const scope = profileScope ?? activeProfileScope;
      if (!scope) {
        throw new Error("listGeographyEdges: no profileScope in input or active project");
      }
      const params = new URLSearchParams({ profileScope: scope });
      const wires = await requestJsonWithRetry<GeographyEdge[]>(
        `/workspace/geography-edges?${params.toString()}`,
      );
      return wires.map(geographyEdgeFromWire);
    },
    async upsertGeographyEdge({ databasePath: _, edge }) {
      const saved = await requestJsonWithRetry<GeographyEdge>("/workspace/geography-edges", {
        method: "POST",
        body: geographyEdgeToWire(edge),
      });
      return geographyEdgeFromWire(saved);
    },
    async deleteGeographyEdge({ databasePath: _, id }) {
      await requestJsonWithRetry<void>(
        `/workspace/geography-edges/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
    },
    async writeKeepsakeBundle(input) {
      return requestJsonWithRetry<{ mediaCopied: number; manifestPath: string }>(
        "/workspace/keepsake",
        { method: "POST", body: input },
      );
    },
    async loadPalaceCuration({ databasePath: _, profileScope }) {
      const scope = profileScope ?? activeProfileScope;
      if (!scope) {
        throw new Error("loadPalaceCuration: no profileScope in input or active project");
      }
      const params = new URLSearchParams({ profileScope: scope });
      return requestJsonWithRetry<{ profileScope: string; curation: unknown }>(
        `/workspace/palace-curation?${params.toString()}`,
      );
    },
    async savePalaceCuration({ databasePath: _, profileScope, curation }) {
      const scope = profileScope ?? activeProfileScope;
      if (!scope) {
        throw new Error("savePalaceCuration: no profileScope in input or active project");
      }
      return requestJsonWithRetry<{ profileScope: string; curation: unknown }>(
        "/workspace/palace-curation",
        { method: "POST", body: { profileScope: scope, curation } },
      );
    },
    async readGraphNode(input) {
      return requestJsonWithRetry<GraphNode>(
        `/graph/node/${encodeURIComponent(input.graphNodeId)}`,
      );
    },
    async findGraphNode() { throw new Error("read-only web build"); },
    async searchGraph(input) {
      const params = new URLSearchParams({ query: input.query });
      if (input.limit != null) params.set("limit", String(input.limit));
      return requestJsonWithRetry<GraphNode[]>(`/graph/search?${params.toString()}`);
    },
    async loadCanvasView(input) {
      const params = new URLSearchParams({ canvasId: input.canvasId, lens: input.lens });
      return requestJsonWithRetry<CanvasView>(`/graph/canvas-view?${params.toString()}`);
    },
    async loadTimelineView(input) {
      return requestJsonWithRetry<TimelineView>("/graph/timeline-view", {
        method: "POST",
        body: input,
      });
    },
    async loadTimelineRelationField() { throw new Error("read-only web build"); },
    async upsertTimelineLayout() { throw new Error("read-only web build"); },
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
    async compareAndSwapGraphNodeContent() { throw new Error("read-only web build"); },
    async deleteGraphNode() { throw new Error("read-only web build"); },
    async connectGraphNodes() { throw new Error("read-only web build"); },
    async disconnectGraphNodes() { throw new Error("read-only web build"); },
    async upsertNodeLayout() { throw new Error("read-only web build"); },
    async upsertNodeLayouts() { throw new Error("read-only web build"); },
    async upsertEdgeLayout() { throw new Error("read-only web build"); },
    async upsertCanvasAppState() { throw new Error("read-only web build"); },
    async importNodeImage() { throw new Error("read-only web build"); },
    async attachNodeAttachment() { throw new Error("read-only web build"); },
    async readNodeAttachmentPresentation() { throw new Error("read-only web build"); },
    async listAgentActivity(input) {
      const url = `${BRIDGE_BASE_URL}/agent-activity?limit=${input.limit ?? 50}`;
      const response = await fetch(url);
      if (!response.ok) return [];
      const rows = (await response.json()) as RawAgentActivityRow[];
      return rows.map(mapAgentActivityRow);
    },
    async readLocalNodeDocument() { throw new Error("read-only web build"); },
    async listPendingNodeDocumentSyncs() { throw new Error("read-only web build"); },
    async upsertLocalNodeDocument() { throw new Error("read-only web build"); },
    async acknowledgeLocalNodeDocumentSync() { throw new Error("read-only web build"); },
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

export function buildConstellationTree(constellations: ConstellationTreeNode[]): ConstellationTreeNode[] {
  const records = new Map<string, TreeRecord<ConstellationTreeNode>>();

  for (const constellation of constellations) {
    records.set(constellation.id, {
      item: { ...constellation, children: [] },
      children: []
    });
  }

  const roots: TreeRecord<ConstellationTreeNode>[] = [];

  for (const constellation of constellations) {
    const record = records.get(constellation.id);
    if (!record) {
      continue;
    }

    if (constellation.parentId) {
      const parent = records.get(constellation.parentId);
      if (parent) {
        parent.children.push(record);
      }
      continue;
    }

    roots.push(record);
  }

  const toNode = (record: TreeRecord<ConstellationTreeNode>): ConstellationTreeNode => ({
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

type TimelineInstantKey = readonly [number, number, number, number, number, number, number];

function parseStaticTimelineInstant(value: string | null): TimelineInstantKey | null {
  if (value === null || value.trim() !== value || value.startsWith("+")) return null;
  const trimmed = value.trim();
  if (/^-?\d{1,6}$/u.test(trimmed)) return [Number(trimmed), 1, 1, 0, 0, 0, 0];
  const rfc3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/u.exec(trimmed);
  if (rfc3339) {
    const localYear = Number(rfc3339[1]);
    const localMonth = Number(rfc3339[2]);
    const localDay = Number(rfc3339[3]);
    if (localMonth < 1 || localMonth > 12 || localDay < 1 || localDay > timelineDaysInMonth(localYear, localMonth)) return null;
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) return null;
    return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()];
  }
  const match = /^(-?\d{1,6})-(\d{2})(?:-(\d{2}))?$/u.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] === undefined ? 1 : Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > timelineDaysInMonth(year, month)) return null;
  return [year, month, day, 0, 0, 0, 0];
}

function timelineDaysInMonth(year: number, month: number): number {
  if ([4, 6, 9, 11].includes(month)) return 30;
  if (month !== 2) return 31;
  const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;
  return mod(year, 4) === 0 && (mod(year, 100) !== 0 || mod(year, 400) === 0) ? 29 : 28;
}

function compareTimelineKeys(a: TimelineInstantKey, b: TimelineInstantKey): number {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function staticTimelineDiagnostic(node: GraphNode): string | null {
  if (node.temporalPrecision === null) return "temporal node is missing temporalPrecision";
  const start = parseStaticTimelineInstant(node.validFrom);
  if (start === null) return `invalid validFrom temporal anchor: ${node.validFrom ?? "null"}`;
  if (node.validTo !== null) {
    const end = parseStaticTimelineInstant(node.validTo);
    if (end === null) return `invalid validTo temporal anchor: ${node.validTo}`;
    if (compareTimelineKeys(end, start) < 0) return "validTo precedes validFrom";
  }
  return null;
}

function matchesTimelineFilter<T>(value: T | null, filter?: { include?: T[]; exclude?: T[] }): boolean {
  const included = !filter?.include?.length || (value !== null && filter.include.includes(value));
  return included && !(value !== null && filter?.exclude?.includes(value));
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
    // ---- existing constellation/file/annotation methods: not served by the static bundle ----
    attachConstellationResourceRoot: readOnlyReject,
    bootstrapWorkspace: readOnlyReject,
    selectProject: readOnlyReject,
    resolveOrCreateHome: readOnlyReject,
    createProject: readOnlyReject,
    detachConstellationResourceRoot: readOnlyReject,
    listConstellationResourceRoots: readOnlyReject,
    loadConstellationDocument: readOnlyReject,
    flushConstellationDocument: readOnlyThrow,
    persistConstellationDocument: readOnlyReject,
    searchConstellation: readOnlyReject,
    listDirectories: readOnlyReject,
    listSavedSequences: readOnlyReject,
    createSavedSequence: readOnlyReject,
    updateSavedSequence: readOnlyReject,
    deleteSavedSequence: readOnlyReject,
    listScenes: readOnlyReject,
    listSceneSequences: readOnlyReject,
    getScene: readOnlyReject,
    upsertScene: readOnlyReject,
    upsertSceneSequence: readOnlyReject,
    deleteScene: readOnlyReject,
    deleteSceneSequence: readOnlyReject,
    listStreetViewImages: readOnlyReject,
    registerStreetViewImage: readOnlyReject,
    stageStreetViewImage: readOnlyReject,
    addManualStreetViewRegion: readOnlyReject,
    applyStreetViewRedaction: readOnlyReject,
    markStreetViewRedactionNoneNeeded: readOnlyReject,
    listGeographyEdges: readOnlyReject,
    upsertGeographyEdge: readOnlyReject,
    deleteGeographyEdge: readOnlyReject,
    writeKeepsakeBundle: readOnlyReject,
    loadPalaceCuration: readOnlyReject,
    savePalaceCuration: readOnlyReject,

    // ---- substance reads ----
    async readGraphNode({ graphNodeId }) {
      const node = nodeById.get(graphNodeId);
      if (!node) {
        throw new Error(`graph node not found: ${graphNodeId}`);
      }
      return node;
    },
    async findGraphNode({ graphNodeId }) {
      return nodeById.get(graphNodeId) ?? null;
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
    async loadTimelineView({ workspaceId, filters, range }) {
      const canonicalWorkspaceId = `static:${bundle.project.id}`;
      if (workspaceId.trim() === "" || workspaceId !== canonicalWorkspaceId) {
        throw new Error(`workspaceId does not match static bundle: expected ${canonicalWorkspaceId}`);
      }
      const temporalNodes = bundle.nodes
        .filter((node) => node.isTemporal)
        .filter((node) => matchesTimelineFilter(node.entityType, filters?.entityTypes))
        .filter((node) => matchesTimelineFilter(node.historicity, filters?.historicities))
        .filter((node) => matchesTimelineFilter(node.temporalRole, filters?.temporalRoles));
      const invalid = temporalNodes.filter((node) =>
        staticTimelineDiagnostic(node) !== null
      );
      const timelineLayoutById = new Map(bundle.timelineLayout.map((record) => [record.graphNodeId, record.layout]));
      const temporalRecords = temporalNodes
        .filter((node) => !range || staticTimelineNodeIntersectsRange(node, range))
        .filter((node): node is GraphNode & { validFrom: string; temporalPrecision: NonNullable<GraphNode["temporalPrecision"]> } =>
          !invalid.includes(node) && typeof node.validFrom === "string" && node.temporalPrecision !== null
        )
        .map((node) => ({
          node,
          anchor: {
            validFrom: node.validFrom,
            validTo: node.validTo,
            precision: node.temporalPrecision,
          },
          layoutOverride: timelineLayoutById.get(node.graphNodeId) ?? null,
        }));
      return {
        workspaceId: canonicalWorkspaceId,
        nodes: temporalRecords,
        relationships: [],
        lanes: [],
        diagnostics: invalid.map((node) => ({
          graphNodeId: node.graphNodeId,
          code: "invalid_temporal_anchor" as const,
          message: staticTimelineDiagnostic(node) ?? "invalid temporal anchor",
          validFrom: node.validFrom,
          validTo: node.validTo,
        })),
      };
    },
    async loadTimelineRelationField({ workspaceId, graphNodeId }) {
      const canonicalWorkspaceId = `static:${bundle.project.id}`;
      if (workspaceId.trim() === "" || workspaceId !== canonicalWorkspaceId) {
        throw new Error(`workspaceId does not match static bundle: expected ${canonicalWorkspaceId}`);
      }
      if (!nodeById.get(graphNodeId)?.isTemporal) {
        throw new Error("timeline relation field subject must be temporal");
      }
      const relationships = bundle.relationships.filter((relationship) =>
        relationship.sourceGraphNodeId === graphNodeId || relationship.targetGraphNodeId === graphNodeId,
      );
      const contextualNodes = [...new Set(relationships.flatMap((relationship) => [
        relationship.sourceGraphNodeId,
        relationship.targetGraphNodeId,
      ]))]
        .filter((nodeId) => nodeId !== graphNodeId)
        .flatMap((nodeId) => {
          const node = nodeById.get(nodeId);
          return node ? [node] : [];
        });
      return { subjectGraphNodeId: graphNodeId, relationships, contextualNodes };
    },
    async upsertTimelineLayout() { throw new Error("read-only static bundle"); },
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
    compareAndSwapGraphNodeContent: readOnlyReject,
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
    attachNodeAttachment: readOnlyReject,
    readNodeAttachmentPresentation: readOnlyReject,

    // ---- agent activity (WS6): excluded from the exported bundle per design §6 ----
    listAgentActivity: readOnlyReject,

    // ---- local node document: local-only SQLite store, not part of the static bundle ----
    readLocalNodeDocument: readOnlyReject,
    listPendingNodeDocumentSyncs: readOnlyReject,
    upsertLocalNodeDocument: readOnlyReject,
    acknowledgeLocalNodeDocumentSync: readOnlyReject
  };
}

function staticTimelineNodeIntersectsRange(node: GraphNode, range: TimelineYearRange): boolean {
  const start = parseStaticTimelineInstant(node.validFrom);
  const end = parseStaticTimelineInstant(node.validTo) ?? start;
  if (!start || !end) return false;
  return start[0] <= range.endYear && end[0] >= range.startYear;
}

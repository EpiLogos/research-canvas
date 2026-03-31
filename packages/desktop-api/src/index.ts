import type {
  Annotation,
  CanvasEdge,
  CanvasNode,
  PublishSettings,
  Sequence,
  SequenceStep
} from "@research-canvas/schema";

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
  sequenceSteps: SequenceStep[];
  sequences: Sequence[];
}

export interface PersistProjectDocumentRequest {
  annotations: Annotation[];
  canvasId: string;
  databasePath: string;
  edges: CanvasEdge[];
  nodes: CanvasNode[];
  projectId: string;
  sequenceSteps: SequenceStep[];
  sequences: Sequence[];
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

interface WorkspaceTransport {
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
  flushProjectDocument(request: PersistProjectDocumentRequest): boolean;
  persistProjectDocument(
    request: PersistProjectDocumentRequest
  ): Promise<ProjectDocument>;
  searchProject(request: SearchProjectRequest): Promise<SearchHit[]>;
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

function createTauriWorkspaceTransport(): WorkspaceTransport {
  return {
    async attachProjectResourceRoot(request) {
      return invokeTauri<ResourceRoot>("attach_project_resource_root_command", {
        request
      });
    },
    async bootstrapWorkspace() {
      return invokeTauri<WorkspaceBootstrap>("bootstrap_workspace_command");
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
    flushProjectDocument() {
      return false;
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
    }
  };
}

function createBrowserBridgeTransport(): WorkspaceTransport {
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
    }
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
    method?: "DELETE" | "GET" | "POST";
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
    method?: "DELETE" | "GET" | "POST";
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

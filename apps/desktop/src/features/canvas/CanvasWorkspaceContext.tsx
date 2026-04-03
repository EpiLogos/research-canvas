import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { useStore } from "zustand";

import {
  createAnnotationStore,
  createCanvasStore,
} from "@research-canvas/canvas";
import type { Viewport } from "@research-canvas/schema";
import {
  createWorkspaceTransport,
  type IndexedEntry,
  type ProjectDocument,
  type ProjectTreeNode,
  type ResourceRoot,
  type SearchHit,
  type WorkspaceProject
} from "@research-canvas/desktop-api";
import {
  deriveResourceImportPlan,
  toAssetUrl,
} from "./resourceFileHelpers";

const EMPTY_CANVAS_ID = "00000000-0000-4000-8000-000000000001";
const EMPTY_PROJECT_ID = "00000000-0000-4000-8000-000000000002";

interface WorkspaceStores {
  annotationStore: ReturnType<typeof createAnnotationStore>;
  store: ReturnType<typeof createCanvasStore>;
}

interface CanvasWorkspaceContextValue extends WorkspaceStores {
  activeProject: WorkspaceProject | null;
  activeProjectId: string | null;
  canvasId: string;
  databasePath: string | null;
  entries: IndexedEntry[];
  errorMessage: string | null;
  addEdge: (input: {
    sourceNodeId: string;
    targetNodeId: string;
    relationKind: string;
    sourceHandleId?: string;
    targetHandleId?: string;
    directionality?: "none" | "forward" | "backward" | "bidirectional";
  }) => void;
  attachResourceRoot: (rootPath: string, displayName?: string) => Promise<void>;
  createNoteNode: (position?: { x: number; y: number }) => void;
  createGroupNode: (position?: { x: number; y: number }) => void;
  addResourceNode: (entry: { id?: string; name: string; path?: string; absolutePath?: string; relativePath?: string; kind?: string }, position: { x: number; y: number }) => void;
  addResourceNodeFromAbsolutePath: (absolutePath: string, position: { x: number; y: number }) => Promise<void>;
  deleteEdge: (edgeId: string) => void;
  deleteNode: (nodeId: string) => void;
  detachResourceRoot: (rootPath: string) => Promise<void>;
  duplicateNode: (nodeId: string) => void;
  isHydrated: boolean;
  projectId: string;
  projects: ProjectTreeNode[];
  resourceRoots: ResourceRoot[];
  searchProject: (query: string, limit?: number) => Promise<SearchHit[]>;
  selectEntry: (entryId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  selectNode: (nodeId: string | null) => void;
  selectProject: (projectId: string) => void | Promise<void>;
  selectedEntryId: string | null;
  selectedEdgeId: string | null;
  selectedNodeId: string | null;
  resizeNode: (nodeId: string, width: number, height: number) => void;
  updateNodeContent: (nodeId: string, content: string) => void;
  setNodeThumbnailFromAbsolutePath: (nodeId: string, absolutePath: string) => Promise<void>;
  updateNodeStyle: (nodeId: string, style: { dotColour?: string; bgColour?: string; textColour?: string; thumbnail?: string }) => void;
  workingRoot: string | null;
  flyToNode: (nodeId: string, viewport?: { x: number; y: number; zoom: number }) => void;
  flyToEdge: (edgeId: string, viewport?: { x: number; y: number; zoom: number }) => void;
  registerFlyToNode: (fn: (nodeId: string, viewport?: { x: number; y: number; zoom: number }) => void) => void;
  registerFlyToEdge: (fn: (edgeId: string, viewport?: { x: number; y: number; zoom: number }) => void) => void;
  captureViewport: () => Viewport;
  registerCaptureViewport: (fn: () => Viewport) => void;
}

const CanvasWorkspaceContext = createContext<CanvasWorkspaceContextValue | null>(
  null
);

export function CanvasWorkspaceProvider({
  children
}: {
  children: ReactNode;
}) {
  const transport = useMemo(() => createWorkspaceTransport(), []);
  const [stores, setStores] = useState<WorkspaceStores>(() =>
    createWorkspaceStores(EMPTY_CANVAS_ID, EMPTY_PROJECT_ID)
  );
  const [projects, setProjects] = useState<ProjectTreeNode[]>([]);
  const [databasePath, setDatabasePath] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<WorkspaceProject | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [entries, setEntries] = useState<IndexedEntry[]>([]);
  const [resourceRoots, setResourceRoots] = useState<ResourceRoot[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workingRoot, setWorkingRoot] = useState<string | null>(null);
  const selectedEntryIdRef = useRef<string | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  const selectedEdgeIdRef = useRef<string | null>(null);
  const flyToNodeRef = useRef<(nodeId: string, viewport?: { x: number; y: number; zoom: number }) => void>(() => {});
  const flyToEdgeRef = useRef<(edgeId: string, viewport?: { x: number; y: number; zoom: number }) => void>(() => {});
  const captureViewportRef = useRef<() => Viewport>(() => ({ x: 0, y: 0, zoom: 1 }));

  useEffect(() => {
    selectedEntryIdRef.current = selectedEntryId;
  }, [selectedEntryId]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    selectedEdgeIdRef.current = selectedEdgeId;
  }, [selectedEdgeId]);

  useEffect(() => {
    let cancelled = false;

    void transport
      .bootstrapWorkspace()
      .then((workspace) => {
        if (cancelled) {
          return;
        }

        setProjects(workspace.projects);
        setDatabasePath(workspace.databasePath);
        setActiveProjectId((current) =>
          current && workspace.projects.some((project) => project.id === current)
            ? current
            : workspace.activeProjectId
        );
        setErrorMessage(null);
      })
      .catch((error: Error) => {
        if (cancelled) {
          return;
        }

        setErrorMessage(error.message);
      });

    return () => {
      cancelled = true;
    };
  }, [transport]);

  useEffect(() => {
    if (!databasePath || !activeProjectId) {
      return;
    }

    let cancelled = false;
    setIsHydrated(false);

    void transport
      .loadProjectDocument({
        databasePath,
        projectId: activeProjectId
      })
      .then((document) => {
        if (cancelled) {
          return;
        }

        hydrateWorkspaceDocument(
          document,
          {
            selectedEntryId: selectedEntryIdRef.current,
            selectedEdgeId: selectedEdgeIdRef.current,
            selectedNodeId: selectedNodeIdRef.current
          },
          setStores,
          setActiveProject,
          setEntries,
          setResourceRoots,
          setSelectedEntryId,
          setSelectedEdgeId,
          setSelectedNodeId,
          setWorkingRoot
        );
        setErrorMessage(null);
        setIsHydrated(true);
        if (isTauriRuntime()) {
          invoke("activate_canvas_command", { canvasId: document.canvasId }).catch(() => {});
        }
      })
      .catch((error: Error) => {
        if (cancelled) {
          return;
        }

        setErrorMessage(error.message);
      });

    return () => {
      cancelled = true;
    };
  }, [activeProjectId, databasePath, transport]);

  useEffect(() => {
    if (!isHydrated || !databasePath || !activeProject) {
      return;
    }

    let cancelled = false;
    let persistQueued = false;
    let persistRunning = false;
    let persistTimer: ReturnType<typeof setTimeout> | null = null;

    const persistLatest = async () => {
      if (persistRunning) {
        persistQueued = true;
        return;
      }

      persistRunning = true;

      do {
        persistQueued = false;

        try {
          const persisted = await transport.persistProjectDocument({
            annotations: stores.annotationStore.getState().serialize(),
            canvasId: activeProject.primaryCanvasId,
            databasePath,
            edges: stores.store.getState().serialize().edges,
            nodes: stores.store.getState().serialize().nodes,
            projectId: activeProject.id,
          });

          if (cancelled) {
            return;
          }

          setActiveProject(persisted.project);
          setEntries(persisted.entries);
          setResourceRoots(persisted.resourceRoots ?? []);
          setWorkingRoot(persisted.workingRoot ?? persisted.project.rootPath);
          setErrorMessage(null);
        } catch (error) {
          if (cancelled) {
            return;
          }

          setErrorMessage(
            error instanceof Error
              ? error.message
              : typeof error === "string"
                ? error
                : "failed to persist workspace"
          );
        }
      } while (persistQueued && !cancelled);

      persistRunning = false;
    };

    const schedulePersist = () => {
      if (persistTimer !== null) {
        globalThis.clearTimeout(persistTimer);
      }

      persistTimer = globalThis.setTimeout(() => {
        persistTimer = null;
        void persistLatest();
      }, 120);
    };

    const unsubscribeCanvas = stores.store.subscribe(schedulePersist);
    const unsubscribeAnnotations = stores.annotationStore.subscribe(schedulePersist);

    return () => {
      cancelled = true;
      if (persistTimer !== null) {
        globalThis.clearTimeout(persistTimer);
      }
      unsubscribeCanvas();
      unsubscribeAnnotations();
    };
  }, [activeProject, databasePath, isHydrated, stores, transport]);

  useEffect(() => {
    if (!isHydrated || !databasePath || !activeProject) {
      return;
    }

    const flushLatest = () => {
      const request = {
        annotations: stores.annotationStore.getState().serialize(),
        canvasId: activeProject.primaryCanvasId,
        databasePath,
        edges: stores.store.getState().serialize().edges,
        nodes: stores.store.getState().serialize().nodes,
        projectId: activeProject.id,
      };
      const result = transport.flushProjectDocument(request);
      if (result instanceof Promise) {
        void result.catch(() => {});
      }
    };

    window.addEventListener("beforeunload", flushLatest);
    window.addEventListener("pagehide", flushLatest);

    return () => {
      window.removeEventListener("beforeunload", flushLatest);
      window.removeEventListener("pagehide", flushLatest);
    };
  }, [activeProject, databasePath, isHydrated, stores, transport]);

  const refreshCanvas = useCallback(async () => {
    if (!databasePath || !activeProjectId) return;
    try {
      const document = await transport.loadProjectDocument({
        databasePath,
        projectId: activeProjectId
      });
      // Hydrate in-place to update nodes/edges without replacing stores
      stores.store.getState().hydrate({
        edges: document.edges,
        nodes: document.nodes,
      });
    } catch {
      // ignore refresh errors silently
    }
  }, [databasePath, activeProjectId, stores.store, transport]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    listen("canvas:updated", () => {
      void refreshCanvas();
    }).then((fn) => {
      if (active) {
        unlisten = fn;
      } else {
        fn();
      }
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [refreshCanvas]);

  const contextValue = useMemo<CanvasWorkspaceContextValue>(
    () => ({
      ...stores,
      activeProject,
      activeProjectId,
      canvasId: activeProject?.primaryCanvasId ?? EMPTY_CANVAS_ID,
      databasePath,
      entries,
      errorMessage,
      isHydrated,
      projectId: activeProject?.id ?? EMPTY_PROJECT_ID,
      projects,
      resourceRoots,
      workingRoot,
      async attachResourceRoot(rootPath, displayName) {
        if (!databasePath || !activeProject) {
          return;
        }

        const nextRoots = await transport.attachProjectResourceRoot({
          databasePath,
          displayName,
          projectId: activeProject.id,
          rootPath
        });
        setResourceRoots((current) => {
          const remaining = current.filter((root) => root.id !== nextRoots.id);
          return [...remaining, nextRoots];
        });
      },
      async detachResourceRoot(rootPath) {
        if (!databasePath || !activeProject) {
          return;
        }

        await transport.detachProjectResourceRoot({
          databasePath,
          projectId: activeProject.id,
          rootPath
        });
        const nextRoots = await transport.listProjectResourceRoots({
          databasePath,
          projectId: activeProject.id
        });
        setResourceRoots(nextRoots);
      },
      async searchProject(query, limit = 20) {
        if (!databasePath || !activeProject) {
          return [];
        }

        return transport.searchProject({
          databasePath,
          limit,
          projectId: activeProject.id,
          query
        });
      },
      addEdge: (input) => {
        stores.store.getState().connectNodes(input);
      },
      createNoteNode: (position) => {
        const node = stores.store.getState().createNoteNode({
          title: "Untitled note",
          content: ""
        });
        if (position) {
          stores.store.getState().updateNodePosition(node.id, position);
        }
      },
      createGroupNode: (position) => {
        stores.store.getState().createGroupNode({
          title: "New group",
          x: position?.x ?? 100,
          y: position?.y ?? 100,
        });
      },
      addResourceNode: (entry, position) => {
        const absolutePath = ("absolutePath" in entry ? entry.absolutePath : entry.path) ?? "";
        const relativePath = ("relativePath" in entry ? entry.relativePath : entry.path) ?? entry.name;
        const kind = (entry.kind ?? "binary") as "markdown" | "image" | "pdf" | "text" | "binary" | "directory" | "url" | "audio" | "video";
        const node = stores.store.getState().createResourceNode({
          title: entry.name,
          absolutePath,
          relativePath,
          resourceKind: kind === "directory" ? "binary" : kind
        });
        stores.store.getState().updateNodePosition(node.id, position);
      },
      async addResourceNodeFromAbsolutePath(absolutePath, position) {
        const plan = deriveResourceImportPlan({
          absolutePath,
          resourceRoots: resourceRoots.map((root) => root.rootPath),
        });

        if (plan.shouldAttachRoot && databasePath && activeProject) {
          const nextRoot = await transport.attachProjectResourceRoot({
            databasePath,
            projectId: activeProject.id,
            rootPath: plan.rootPath,
          });
          setResourceRoots((current) => {
            const remaining = current.filter((root) => root.rootPath !== nextRoot.rootPath);
            return [...remaining, nextRoot];
          });
        }

        const node = stores.store.getState().createResourceNode({
          title: plan.title,
          absolutePath,
          relativePath: plan.relativePath,
          resourceKind: plan.kind,
        });
        stores.store.getState().updateNodePosition(node.id, position);
      },
      deleteEdge: (edgeId) => {
        stores.store.getState().deleteEdge(edgeId);
        if (selectedEdgeId === edgeId) {
          setSelectedEdgeId(null);
        }
      },
      deleteNode: (nodeId) => {
        stores.store.getState().deleteNode(nodeId);
        // If deleted node was selected, clear selection
        if (selectedNodeId === nodeId) {
          setSelectedNodeId(null);
        }
        if (
          selectedEdgeId &&
          !stores.store.getState().edges.some((edge) => edge.id === selectedEdgeId)
        ) {
          setSelectedEdgeId(null);
        }
      },
      duplicateNode: (nodeId) => {
        stores.store.getState().duplicateNode(nodeId);
      },
      selectEntry: setSelectedEntryId,
      selectEdge: setSelectedEdgeId,
      selectNode: setSelectedNodeId,
      selectProject: async (projectId: string) => {
        if (activeProject && databasePath) {
          const currentState = {
            annotations: stores.annotationStore.getState().serialize(),
            canvasId: activeProject.primaryCanvasId,
            databasePath,
            edges: stores.store.getState().serialize().edges,
            nodes: stores.store.getState().serialize().nodes,
            projectId: activeProject.id,
          };
          await transport.persistProjectDocument(currentState);
        }
        setSelectedEdgeId(null);
        setSelectedNodeId(null);
        setActiveProjectId(projectId);
      },
      selectedEntryId,
      selectedEdgeId,
      selectedNodeId,
      resizeNode: (nodeId, width, height) => {
        stores.store.getState().updateNodeSize(nodeId, { width, height });
      },
      updateNodeContent: (nodeId, content) => {
        stores.store.getState().updateNodeContent(nodeId, content);
      },
      async setNodeThumbnailFromAbsolutePath(nodeId, absolutePath) {
        const plan = deriveResourceImportPlan({
          absolutePath,
          resourceRoots: resourceRoots.map((root) => root.rootPath),
        });

        if (plan.shouldAttachRoot && databasePath && activeProject) {
          const nextRoot = await transport.attachProjectResourceRoot({
            databasePath,
            projectId: activeProject.id,
            rootPath: plan.rootPath,
          });
          setResourceRoots((current) => {
            const remaining = current.filter((root) => root.rootPath !== nextRoot.rootPath);
            return [...remaining, nextRoot];
          });
        }

        stores.store.getState().updateNodeStyle(nodeId, { thumbnail: toAssetUrl(absolutePath) });
      },
      updateNodeStyle: (nodeId, style) => {
        stores.store.getState().updateNodeStyle(nodeId, style);
      },
      flyToNode: (nodeId, viewport) => flyToNodeRef.current(nodeId, viewport),
      flyToEdge: (edgeId, viewport) => flyToEdgeRef.current(edgeId, viewport),
      registerFlyToNode: (fn) => { flyToNodeRef.current = fn; },
      registerFlyToEdge: (fn) => { flyToEdgeRef.current = fn; },
      captureViewport: () => captureViewportRef.current(),
      registerCaptureViewport: (fn) => { captureViewportRef.current = fn; },
    }),
    [
      activeProject,
      activeProjectId,
      databasePath,
      entries,
      errorMessage,
      isHydrated,
      projects,
      resourceRoots,
      selectedEntryId,
      selectedEdgeId,
      selectedNodeId,
      stores,
      transport,
      workingRoot
    ]
  );

  return (
    <CanvasWorkspaceContext.Provider value={contextValue}>
      {children}
    </CanvasWorkspaceContext.Provider>
  );
}

export function useCanvasWorkspace() {
  const workspace = useContext(CanvasWorkspaceContext);
  if (!workspace) {
    throw new Error("CanvasWorkspaceProvider is required.");
  }

  const nodes = useStore(workspace.store, (state) => state.nodes);
  const edges = useStore(workspace.store, (state) => state.edges);
  const annotations = useStore(
    workspace.annotationStore,
    (state) => state.annotations
  );
  const selectedEntry =
    workspace.entries.find((entry) => entry.id === workspace.selectedEntryId) ?? null;

  return {
    ...workspace,
    annotations,
    edges,
    nodes,
    selectedEntry,
  };
}

function createWorkspaceStores(canvasId: string, _projectId: string): WorkspaceStores {
  return {
    annotationStore: createAnnotationStore({ canvasId }),
    store: createCanvasStore({ canvasId })
  };
}

function hydrateWorkspaceDocument(
  document: ProjectDocument,
  selection: {
    selectedEntryId: string | null;
    selectedEdgeId: string | null;
    selectedNodeId: string | null;
  },
  setStores: (stores: WorkspaceStores) => void,
  setActiveProject: (project: WorkspaceProject) => void,
  setEntries: (entries: IndexedEntry[]) => void,
  setResourceRoots: (resourceRoots: ResourceRoot[]) => void,
  setSelectedEntryId: (entryId: string | null) => void,
  setSelectedEdgeId: (edgeId: string | null) => void,
  setSelectedNodeId: (nodeId: string | null) => void,
  setWorkingRoot: (workingRoot: string) => void
) {
  const nextStores = createWorkspaceStores(
    document.canvasId,
    document.project.id
  );
  nextStores.store.getState().hydrate({
    edges: document.edges,
    nodes: document.nodes
  });
  nextStores.annotationStore.getState().hydrate(document.annotations);

  setStores(nextStores);
  setActiveProject(document.project);
  setEntries(document.entries);
  setResourceRoots(document.resourceRoots ?? []);
  setWorkingRoot(document.workingRoot ?? document.project.rootPath);
  setSelectedEntryId(
    selection.selectedEntryId &&
      document.entries.some((entry) => entry.id === selection.selectedEntryId)
      ? selection.selectedEntryId
      : document.entries.find((entry) => !entry.isDirectory)?.id ??
          document.entries[0]?.id ??
          null
  );
  setSelectedEdgeId(
    selection.selectedEdgeId &&
      document.edges.some((edge) => edge.id === selection.selectedEdgeId)
      ? selection.selectedEdgeId
      : null
  );
  setSelectedNodeId(
    selection.selectedNodeId &&
      document.nodes.some((node) => node.id === selection.selectedNodeId)
      ? selection.selectedNodeId
      : document.nodes[0]?.id ?? null
  );
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__);
}

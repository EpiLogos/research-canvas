import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import { useStore } from "zustand";

import {
  createAnnotationStore,
  createCanvasStore,
  createSequenceStore,
  type SequenceSnapshot
} from "@research-canvas/canvas";
import {
  createWorkspaceTransport,
  type IndexedEntry,
  type ProjectDocument,
  type ProjectTreeNode,
  type ResourceRoot,
  type SearchHit,
  type WorkspaceProject
} from "@research-canvas/desktop-api";

const EMPTY_CANVAS_ID = "00000000-0000-4000-8000-000000000001";
const EMPTY_PROJECT_ID = "00000000-0000-4000-8000-000000000002";

interface WorkspaceStores {
  annotationStore: ReturnType<typeof createAnnotationStore>;
  sequenceStore: ReturnType<typeof createSequenceStore>;
  store: ReturnType<typeof createCanvasStore>;
}

interface CanvasWorkspaceContextValue extends WorkspaceStores {
  activeProject: WorkspaceProject | null;
  activeProjectId: string | null;
  canvasId: string;
  databasePath: string | null;
  entries: IndexedEntry[];
  errorMessage: string | null;
  addEdge: (input: { sourceNodeId: string; targetNodeId: string; relationKind: string }) => void;
  attachResourceRoot: (rootPath: string, displayName?: string) => Promise<void>;
  createNoteNode: (position?: { x: number; y: number }) => void;
  createGroupNode: (position?: { x: number; y: number }) => void;
  addResourceNode: (entry: { id?: string; name: string; path?: string; absolutePath?: string; relativePath?: string; kind?: string }, position: { x: number; y: number }) => void;
  deleteNode: (nodeId: string) => void;
  detachResourceRoot: (rootPath: string) => Promise<void>;
  duplicateNode: (nodeId: string) => void;
  isHydrated: boolean;
  projectId: string;
  projects: ProjectTreeNode[];
  resourceRoots: ResourceRoot[];
  searchProject: (query: string, limit?: number) => Promise<SearchHit[]>;
  selectEntry: (entryId: string | null) => void;
  selectNode: (nodeId: string | null) => void;
  selectProject: (projectId: string) => void;
  selectedEntryId: string | null;
  selectedNodeId: string | null;
  updateNodeContent: (nodeId: string, content: string) => void;
  updateNodeStyle: (nodeId: string, style: { dotColour?: string; bgColour?: string; textColour?: string; thumbnail?: string }) => void;
  workingRoot: string | null;
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workingRoot, setWorkingRoot] = useState<string | null>(null);
  const selectedEntryIdRef = useRef<string | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedEntryIdRef.current = selectedEntryId;
  }, [selectedEntryId]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

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
            selectedNodeId: selectedNodeIdRef.current
          },
          setStores,
          setActiveProject,
          setEntries,
          setResourceRoots,
          setSelectedEntryId,
          setSelectedNodeId,
          setWorkingRoot
        );
        setErrorMessage(null);
        setIsHydrated(true);
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
            sequenceSteps: stores.sequenceStore.getState().serialize().steps,
            sequences: stores.sequenceStore.getState().serialize().sequences
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
            error instanceof Error ? error.message : "failed to persist workspace"
          );
        }
      } while (persistQueued && !cancelled);

      persistRunning = false;
    };

    const schedulePersist = () => {
      void persistLatest();
    };

    const unsubscribeCanvas = stores.store.subscribe(schedulePersist);
    const unsubscribeAnnotations = stores.annotationStore.subscribe(schedulePersist);
    const unsubscribeSequences = stores.sequenceStore.subscribe(schedulePersist);

    return () => {
      cancelled = true;
      unsubscribeCanvas();
      unsubscribeAnnotations();
      unsubscribeSequences();
    };
  }, [activeProject, databasePath, isHydrated, stores, transport]);

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
          title: "New note",
          content: ""
        });
        if (position) {
          stores.store.getState().updateNodePosition(node.id, position);
        }
      },
      createGroupNode: (position) => {
        const node = stores.store.getState().createNoteNode({
          title: "New group",
          content: ""
        });
        if (position) {
          stores.store.getState().updateNodePosition(node.id, position);
        }
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
      deleteNode: (nodeId) => {
        stores.store.getState().deleteNode(nodeId);
      },
      duplicateNode: (nodeId) => {
        stores.store.getState().duplicateNode(nodeId);
      },
      selectEntry: setSelectedEntryId,
      selectNode: setSelectedNodeId,
      selectProject: setActiveProjectId,
      selectedEntryId,
      selectedNodeId,
      updateNodeContent: (nodeId, content) => {
        stores.store.getState().updateNodeContent(nodeId, content);
      },
      updateNodeStyle: (nodeId, style) => {
        stores.store.getState().updateNodeStyle(nodeId, style);
      }
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
  const sequences = useStore(workspace.sequenceStore, (state) => state.sequences);
  const steps = useStore(workspace.sequenceStore, (state) => state.steps);
  const activeSequenceId = useStore(
    workspace.sequenceStore,
    (state) => state.activeSequenceId
  );
  const activeStepIndex = useStore(
    workspace.sequenceStore,
    (state) => state.activeStepIndex
  );
  const activeStep = useStore(workspace.sequenceStore, (state) => state.activeStep);
  const selectedEntry =
    workspace.entries.find((entry) => entry.id === workspace.selectedEntryId) ?? null;

  return {
    ...workspace,
    activeSequenceId,
    activeStep,
    activeStepIndex,
    annotations,
    edges,
    nodes,
    selectedEntry,
    sequences,
    steps
  };
}

function createWorkspaceStores(canvasId: string, projectId: string): WorkspaceStores {
  return {
    annotationStore: createAnnotationStore({ canvasId }),
    sequenceStore: createSequenceStore({ canvasId, projectId }),
    store: createCanvasStore({ canvasId })
  };
}

function hydrateWorkspaceDocument(
  document: ProjectDocument,
  selection: {
    selectedEntryId: string | null;
    selectedNodeId: string | null;
  },
  setStores: (stores: WorkspaceStores) => void,
  setActiveProject: (project: WorkspaceProject) => void,
  setEntries: (entries: IndexedEntry[]) => void,
  setResourceRoots: (resourceRoots: ResourceRoot[]) => void,
  setSelectedEntryId: (entryId: string | null) => void,
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
  nextStores.sequenceStore.getState().hydrate({
    activeSequenceId: document.sequences[0]?.id ?? null,
    activeStepIndex: document.sequenceSteps.length > 0 ? 0 : -1,
    sequences: document.sequences,
    steps: document.sequenceSteps
  } as SequenceSnapshot);

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
  setSelectedNodeId(
    selection.selectedNodeId &&
      document.nodes.some((node) => node.id === selection.selectedNodeId)
      ? selection.selectedNodeId
      : document.nodes[0]?.id ?? null
  );
}

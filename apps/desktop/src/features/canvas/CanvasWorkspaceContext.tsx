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
  createContentLinkingActions,
  createTabManagerStore,
  entityTypeForNodeType,
  isRelationshipKind,
  serializeLayoutSnapshot,
  type ContentLinkingActions,
  type TabManagerStore,
} from "@research-canvas/canvas";
import { buildNewGraphNodeInput, createPreparedNoteNode } from "./nodeCreation";
import {
  rehydratePendingGraphNodeSyncs,
  retryPendingGraphNodeSyncs,
  startDurablePendingGraphNodeSyncRetryInterval,
} from "./pendingGraphNodeSync";
import { canvasViewToCanvasNodes } from "./canvasViewToNodes";
import { selectLegacyNodesNeedingImport, importLegacyCanvasNodes } from "./legacyNodeImport";
import type { AppTab, CanvasNode, CanvasEdge, SurfaceId, Viewport } from "@research-canvas/schema";
import {
  createWorkspaceServices,
  DesktopEdgeRepository,
  DesktopNodeRepository,
  type DirectoryEntry,
  type IndexedEntry,
  type ConstellationDocument,
  type ConstellationTreeNode,
  type ResourceRoot,
  type SavedSequence,
  type SearchHit,
  type GraphNodePatch,
  type WorkspaceConstellation,
  type ResolveHomeInput,
  type ResolveHomeResult,
  type CreateProjectInput
} from "@research-canvas/desktop-api";
type WorkspaceServices = import("@research-canvas/desktop-api").WorkspaceServices;
import {
  deriveResourceImportPlan,
  toAssetUrl,
} from "./resourceFileHelpers";
import { shouldWriteSubstanceOnLayoutFlush } from "./persistPolicy";

const EMPTY_CANVAS_ID = "00000000-0000-4000-8000-000000000001";
const EMPTY_CONSTELLATION_ID = "00000000-0000-4000-8000-000000000002";

export interface CanvasTab {
  id: string;
  constellationId: string;
  canvasId: string;
  label: string;
  pinned: boolean;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  viewport: Viewport | null;
}

function canvasTabId(constellationId: string, canvasId: string) {
  return `${constellationId}:${canvasId}`;
}

function toCanvasTab(tab: AppTab | null): CanvasTab | null {
  if (!tab || tab.surfaceId !== "canvas") return null;
  const state = tab.state;
  if (typeof state !== "object" || state === null || !("canvasId" in state)) return null;
  const canvasState = state as {
    canvasId: string;
    constellationId: string;
    viewport: Viewport;
    selectedGraphNodeId?: string | null;
    selectedEdgeId?: string | null;
  };
  return {
    id: tab.id,
    constellationId: canvasState.constellationId,
    canvasId: canvasState.canvasId,
    label: tab.title,
    pinned: tab.pinned,
    selectedNodeId: canvasState.selectedGraphNodeId ?? null,
    selectedEdgeId: canvasState.selectedEdgeId ?? null,
    viewport: canvasState.viewport ?? null,
  };
}


interface WorkspaceStores {
  annotationStore: ReturnType<typeof createAnnotationStore>;
  store: ReturnType<typeof createCanvasStore>;
}

interface CanvasWorkspaceContextValue extends WorkspaceStores {
  tabManager: TabManagerStore;
  activeConstellation: WorkspaceConstellation | null;
  activeConstellationId: string | null;
  /** The active project — projects ARE constellations, so this mirrors `activeConstellationId`. */
  activeProjectId: string | null;
  /** The active project's profile scope; profile-scoped surfaces read through this. */
  activeProfileScope: string | null;
  /** The currently active surface lens, driven by the active global tab. */
  activeSurfaceId: SurfaceId;
  /** Select a project by id, switching the active profile scope (and re-hydrating the canvas for its primary canvas). */
  selectProject: (projectId: string) => Promise<void>;
  /** Resolve-or-create the research-canvas home directory and list projects under it. */
  resolveOrCreateHome: (input: ResolveHomeInput) => Promise<ResolveHomeResult>;
  /** Create a directory or file project under the home. */
  createProject: (input: CreateProjectInput) => Promise<WorkspaceConstellation>;
  canvasId: string;
  databasePath: string | null;
  workspaceId: string | null;
  entries: IndexedEntry[];
  errorMessage: string | null;
  addEdge: (input: {
    sourceNodeId: string;
    targetNodeId: string;
    relationKind: string;
    sourceHandleId?: string;
    targetHandleId?: string;
    directionality?: "none" | "forward" | "backward" | "bidirectional";
  }) => Promise<void>;
  attachResourceRoot: (rootPath: string, displayName?: string) => Promise<void>;
  createNoteNode: (position?: { x: number; y: number }) => Promise<void>;
  createGroupNode: (position?: { x: number; y: number }) => Promise<void>;
  createImageNode: (entry: { id?: string; name: string; absolutePath?: string; relativePath?: string }, position: { x: number; y: number }) => Promise<void>;
  addResourceNode: (entry: { id?: string; name: string; path?: string; absolutePath?: string; relativePath?: string; kind?: string }, position: { x: number; y: number }) => Promise<void>;
  addResourceNodeFromAbsolutePath: (absolutePath: string, position: { x: number; y: number }) => Promise<void>;
  deleteEdge: (edgeId: string) => Promise<void>;
  deleteNode: (nodeId: string) => void;
  detachResourceRoot: (rootPath: string) => Promise<void>;
  duplicateNode: (nodeId: string) => Promise<void>;
  isHydrated: boolean;
  constellationId: string;
  constellations: ConstellationTreeNode[];
  resourceRoots: ResourceRoot[];
  listDirectories: () => Promise<DirectoryEntry[]>;
  searchConstellation: (query: string, limit?: number) => Promise<SearchHit[]>;
  listSavedSequences: (input: { databasePath: string; constellationId: string; canvasId: string }) => Promise<SavedSequence[]>;
  createSavedSequence: (input: { databasePath: string; constellationId: string; canvasId: string; name: string }) => Promise<SavedSequence>;
  updateSavedSequence: (input: { databasePath: string; id: string; name: string; rootNodeId: string | null; edgeIds: string[] }) => Promise<SavedSequence>;
  deleteSavedSequence: (input: { databasePath: string; id: string }) => Promise<void>;
  openCanvas: (canvasId: string) => Promise<void>;
  /** Opens a constellation's primary canvas as a persistent canvas tab. */
  openConstellationTab: (constellationId: string) => Promise<void>;
  /** Activates a known tab and restores only that tab's selection/viewport. */
  activateCanvasTab: (tabId: string) => Promise<void>;
  /** Closes a non-root tab; the root tab is intentionally protected. */
  closeCanvasTab: (tabId: string) => Promise<void>;
  /** All open global tabs. */
  tabs: AppTab[];
  /** The active global tab id. */
  activeTabId: string | null;
  /** The active global tab, or null when the tab list is empty. */
  activeTab: AppTab | null;
  /** Opens a new global tab or replaces an existing one with the same id. */
  openTab: (tab: AppTab) => void;
  /** Activates an existing global tab. */
  activateTab: (tabId: string) => void;
  /** Closes a global tab. */
  closeTab: (tabId: string) => void;
  /** Updates the persisted surface state for the active tab. */
  updateTabState: (state: import("@research-canvas/schema").SurfaceTabState) => void;
  canvasTabs: CanvasTab[];
  activeCanvasTabId: string | null;
  activeCanvasViewport: Viewport | null;
  selectEntry: (entryId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  selectNode: (nodeId: string | null) => void;
  selectConstellation: (constellationId: string) => void | Promise<void>;
  selectedEntryId: string | null;
  selectedEdgeId: string | null;
  selectedNodeId: string | null;
  resizeNode: (
    nodeId: string,
    width: number,
    height: number,
    position?: { x?: number; y?: number },
  ) => void;
  updateNodeContent: (nodeId: string, content: string) => void;
  /** Persist canonical graph metadata before updating the canvas cache. */
  updateNodeMetadata: (nodeId: string, patch: GraphNodePatch) => Promise<void>;
  /** Re-types a semantic relationship without leaving a layout-only lie behind. */
  updateEdgeRelationKind: (edgeId: string, relationKind: string) => Promise<void>;
  setNodeThumbnailFromAbsolutePath: (nodeId: string, absolutePath: string) => Promise<void>;
  updateNodeStyle: (nodeId: string, style: { dotColour?: string; bgColour?: string; textColour?: string; thumbnail?: string }) => void;
  updateNodeTags: (nodeId: string, tags: string[]) => void;
  updateNodeTimelineCard: (
    nodeId: string,
    timelineCard: { offsetY: number; width?: number; height?: number },
  ) => void;
  workingRoot: string | null;
  /**
   * The monorepo root, distinct from `workingRoot` (a constellation's
   * content root, e.g. `antichrist-vault/`). Use this for shell commands
   * such as the embedded terminal's working directory.
   */
  repoRoot: string | null;
  flyToNode: (nodeId: string, viewport?: { x: number; y: number; zoom: number }) => void;
  flyToEdge: (edgeId: string, viewport?: { x: number; y: number; zoom: number }) => void;
  registerFlyToNode: (fn: (nodeId: string, viewport?: { x: number; y: number; zoom: number }) => void) => void;
  registerFlyToEdge: (fn: (edgeId: string, viewport?: { x: number; y: number; zoom: number }) => void) => void;
  captureViewport: () => Viewport;
  registerCaptureViewport: (fn: () => Viewport) => void;
  transport: WorkspaceServices;
  contentLinkingActions: ContentLinkingActions;
}

// Exported so tests (and future provider composition) can supply a stable
// context value directly, rather than mounting the full bootstrapping
// CanvasWorkspaceProvider.
export const CanvasWorkspaceContext =
  createContext<CanvasWorkspaceContextValue | null>(null);

export function CanvasWorkspaceProvider({
  children
}: {
  children: ReactNode;
}) {
  const transport = useMemo(() => createWorkspaceServices(), []);
  const nodeRepository = useMemo(() => new DesktopNodeRepository(transport), [transport]);
  const edgeRepository = useMemo(() => new DesktopEdgeRepository(transport), [transport]);
  const [stores, setStores] = useState<WorkspaceStores>(() =>
    createWorkspaceStores(EMPTY_CANVAS_ID, EMPTY_CONSTELLATION_ID)
  );
  const [tabManager] = useState(() =>
    createTabManagerStore(
      { tabs: [], activeTabId: null },
      { onPersist: (snapshot) => persistTabsRef.current(snapshot) },
    ),
  );
  const [constellations, setConstellations] = useState<ConstellationTreeNode[]>([]);
  const [databasePath, setDatabasePath] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [activeConstellation, setActiveConstellation] = useState<WorkspaceConstellation | null>(null);
  const [activeConstellationId, setActiveConstellationId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProfileScope, setActiveProfileScope] = useState<string | null>(null);
  const [activeCanvasId, setActiveCanvasId] = useState(EMPTY_CANVAS_ID);
  const [entries, setEntries] = useState<IndexedEntry[]>([]);
  const [resourceRoots, setResourceRoots] = useState<ResourceRoot[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workingRoot, setWorkingRoot] = useState<string | null>(null);
  const [repoRoot, setRepoRoot] = useState<string | null>(null);
  const selectedEntryIdRef = useRef<string | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  const selectedEdgeIdRef = useRef<string | null>(null);
  const pendingCanvasTabIdRef = useRef<string | null>(null);
  const flyToNodeRef = useRef<(nodeId: string, viewport?: { x: number; y: number; zoom: number }) => void>(() => {});
  const flyToEdgeRef = useRef<(edgeId: string, viewport?: { x: number; y: number; zoom: number }) => void>(() => {});
  const captureViewportRef = useRef<() => Viewport>(() => ({ x: 0, y: 0, zoom: 1 }));
  const persistTabsRef = useRef<(snapshot: { tabs: AppTab[]; activeTabId: string | null }) => void>(() => {});

  const tabs = useStore(tabManager, (state) => state.tabs);
  const activeTabId = useStore(tabManager, (state) => state.activeTabId);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeSurfaceId: SurfaceId = activeTab?.surfaceId ?? "canvas";

  const persistTabs = useCallback(
    async (snapshot: { tabs: AppTab[]; activeTabId: string | null }) => {
      if (!databasePath || typeof transport.saveAppTabs !== "function") return;
      try {
        await transport.saveAppTabs({ databasePath, tabs: snapshot.tabs, activeTabId: snapshot.activeTabId });
      } catch (error) {
        console.warn("failed to persist app tabs", error);
      }
    },
    [databasePath, transport],
  );

  useEffect(() => {
    persistTabsRef.current = (snapshot) => {
      void persistTabs(snapshot);
    };
  }, [persistTabs]);

  const contentLinkingActions = useMemo<ContentLinkingActions>(
    () =>
      createContentLinkingActions({
        databasePath: databasePath ?? "",
        readGraphNode: (input) => transport.readGraphNode(input),
        readLocalNodeDocument: (input) => transport.readLocalNodeDocument(input),
        upsertLocalNodeDocument: (input) => transport.upsertLocalNodeDocument(input),
        compareAndSwapGraphNodeContent: (input) => transport.compareAndSwapGraphNodeContent(input),
        acknowledgeLocalNodeDocumentSync: (input) => transport.acknowledgeLocalNodeDocumentSync(input),
        connectGraphNodes: (input) => transport.connectGraphNodes(input),
        createGraphNode: (input) => transport.createGraphNode(input),
        importNodeImage: (input) =>
          transport.importNodeImage({
            workspaceRoot: workingRoot ?? "",
            graphNodeId: input.graphNodeId,
            sourceAbsolutePath: input.sourceAbsolutePath,
          }),
      }),
    [transport, workingRoot, databasePath],
  );

  useEffect(() => {
    selectedEntryIdRef.current = selectedEntryId;
  }, [selectedEntryId]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    selectedEdgeIdRef.current = selectedEdgeId;
  }, [selectedEdgeId]);

  const ensureCanvasTab = useCallback(
    (input: {
      id: string;
      constellationId: string;
      canvasId: string;
      title: string;
      pinned: boolean;
      viewport?: Viewport;
      selectedNodeId?: string | null;
      selectedEdgeId?: string | null;
      activate?: boolean;
    }) => {
      const manager = tabManager.getState();
      const existing = manager.tabs.find((tab) => tab.id === input.id);
      if (existing) {
        manager.update(input.id, { title: input.title, pinned: input.pinned });
        if (existing.surfaceId === "canvas" && "canvasId" in existing.state) {
          manager.updateState(input.id, {
            ...existing.state,
            viewport: input.viewport ?? existing.state.viewport,
            selectedGraphNodeId: input.selectedNodeId ?? existing.state.selectedGraphNodeId,
            selectedEdgeId: input.selectedEdgeId ?? existing.state.selectedEdgeId,
          });
        }
      } else {
        manager.open(
          {
            id: input.id,
            surfaceId: "canvas",
            title: input.title,
            pinned: input.pinned,
            state: {
              surfaceId: "canvas",
              canvasId: input.canvasId,
              constellationId: input.constellationId,
              viewport: input.viewport ?? { x: 0, y: 0, zoom: 1 },
              selectedGraphNodeId: input.selectedNodeId ?? null,
              selectedEdgeId: input.selectedEdgeId ?? null,
            },
          },
          { activate: false },
        );
      }
      if (input.activate) {
        manager.activate(input.id);
      }
    },
    [tabManager],
  );

  const rememberCanvasTabSession = useCallback(
    (tabId: string, session: { selectedNodeId: string | null; selectedEdgeId: string | null; viewport: Viewport }) => {
      const manager = tabManager.getState();
      const tab = manager.tabs.find((candidate) => candidate.id === tabId);
      if (!tab || tab.surfaceId !== "canvas" || !("canvasId" in tab.state)) return;
      manager.updateState(tabId, {
        ...tab.state,
        selectedGraphNodeId: session.selectedNodeId,
        selectedEdgeId: session.selectedEdgeId,
        viewport: session.viewport,
      });
    },
    [tabManager],
  );

  useEffect(() => {
    let cancelled = false;

    void transport
      .bootstrapWorkspace()
      .then((workspace) => {
        if (cancelled) {
          return;
        }

        setConstellations(workspace.constellations);
        setDatabasePath(workspace.databasePath);
        setWorkspaceId(workspace.workspaceId);
        setRepoRoot(workspace.workspaceRoot);
        setActiveConstellationId((current) =>
          current && workspace.constellations.some((constellation) => constellation.id === current)
            ? current
            : workspace.activeConstellationId
        );
        setActiveProjectId(workspace.activeProjectId);
        setActiveProfileScope(workspace.activeProfileScope);
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
    if (!databasePath || !activeConstellationId) {
      return;
    }

    let cancelled = false;
    setIsHydrated(false);

    void (async () => {
      try {
        const document = await transport.loadConstellationDocument({
          databasePath,
          constellationId: activeConstellationId
        });

        if (cancelled) return;

        // Local-first hydration: load_canvas_view is layout-authoritative
        // (every layout row is returned, with a synthesized GraphNode when
        // Neo4j substance hasn't landed yet or is unreachable), so the
        // canvas hydrates from it directly — no union with document.nodes
        // needed. Only fall back to the local document nodes if the call
        // itself fails (e.g. transport/backend error), for resilience.
          const pendingTab = pendingCanvasTabIdRef.current
            ? toCanvasTab(tabManager.getState().tabs.find((tab) => tab.id === pendingCanvasTabIdRef.current) ?? null)
            : null;
          // A tab may refer to a non-primary canvas inside the same
          // constellation. A constellation switch otherwise begins at its
          // primary canvas and creates that tab during hydration.
          const primaryCanvasId = pendingTab?.constellationId === document.constellation.id
            ? pendingTab.canvasId
            : document.constellation.primaryCanvasId;
          let graphNodes = document.nodes;
          let graphEdges = document.edges;
          let persistedViewport: Viewport | null = null;
          try {
            let view = await transport.loadCanvasView({
              databasePath,
              canvasId: primaryCanvasId,
              lens: "canvas",
            });
            if (cancelled) return;
            persistedViewport = view.viewport;

          // lf-task-4: one-time import of any legacy canvas_nodes rows (the
          // pre-cutover substance table) that aren't yet represented in the
          // layout store, so nothing already on a user's canvas is stranded
          // by the cutover to a layout-authoritative load. Idempotent (skips
          // nodes that already have a layout row) and best-effort: a failure
          // here must never block hydration or the canvas render.
          try {
            const toImport = selectLegacyNodesNeedingImport(document.nodes, view);
            if (toImport.length > 0) {
              await importLegacyCanvasNodes({
                legacyNodes: toImport,
                view,
                databasePath,
                upsertNodeLayout: (input) => transport.upsertNodeLayout(input),
                createGraphNode: (input) => transport.createGraphNode(input),
              });
              if (cancelled) return;
              // Re-fetch so the just-imported nodes appear immediately
              // instead of only after the next reload.
              view = await transport.loadCanvasView({
                databasePath,
                canvasId: primaryCanvasId,
                lens: "canvas",
              });
              if (cancelled) return;
              persistedViewport = view.viewport;
            }
          } catch (error) {
            console.warn("legacy canvas_nodes import failed; continuing with layout-authoritative view", error);
          }

          const joined = canvasViewToCanvasNodes(view);
          graphNodes = joined.nodes;
          graphEdges = joined.edges;
        } catch (error) {
          console.warn("loadCanvasView failed; rendering local document nodes", error);
        }

        if (cancelled) return;

        const tabId = canvasTabId(document.constellation.id, primaryCanvasId);
        const rememberedTab = toCanvasTab(tabManager.getState().tabs.find((tab) => tab.id === tabId) ?? null);
        hydrateWorkspaceDocument(
          document,
          graphNodes,
          graphEdges,
          {
            selectedEntryId: selectedEntryIdRef.current,
            selectedEdgeId: rememberedTab?.selectedEdgeId ?? selectedEdgeIdRef.current,
            selectedNodeId: rememberedTab?.selectedNodeId ?? selectedNodeIdRef.current,
          },
          setStores,
          setActiveConstellation,
          setEntries,
          setResourceRoots,
          setSelectedEntryId,
          setSelectedEdgeId,
          setSelectedNodeId,
          setWorkingRoot,
          setActiveCanvasId,
          primaryCanvasId
        );
        const managerAtHydration = tabManager.getState();
        const activeTabAtHydration =
          managerAtHydration.tabs.find((tab) => tab.id === managerAtHydration.activeTabId) ?? null;
        // Constellation hydration may complete after the user has already
        // moved to another surface. Keep its Canvas tab current without
        // stealing focus; activation is reserved for normal Canvas-led
        // constellation navigation, first hydration, or an explicit pending
        // Canvas-tab activation.
        const shouldActivateCanvasTab =
          pendingCanvasTabIdRef.current === tabId ||
          activeTabAtHydration === null ||
          activeTabAtHydration.surfaceId === "canvas";

        ensureCanvasTab({
          id: tabId,
          constellationId: document.constellation.id,
          canvasId: primaryCanvasId,
          title: document.constellation.displayName,
          pinned: document.constellation.parentConstellationId === null,
          viewport: persistedViewport ?? undefined,
          selectedNodeId: rememberedTab?.selectedNodeId ?? undefined,
          selectedEdgeId: rememberedTab?.selectedEdgeId ?? undefined,
          activate: shouldActivateCanvasTab,
        });
        pendingCanvasTabIdRef.current = null;
        setErrorMessage(null);
        setIsHydrated(true);
        void rehydratePendingGraphNodeSyncs(databasePath, {
          listPendingNodeDocumentSyncs: (input) => transport.listPendingNodeDocumentSyncs(input),
          createGraphNode: (input) => transport.createGraphNode(input),
          findGraphNode: (input) => transport.findGraphNode(input),
          readLocalNodeDocument: (input) => transport.readLocalNodeDocument(input),
          compareAndSwapGraphNodeContent: (input) => transport.compareAndSwapGraphNodeContent(input),
          acknowledgeLocalNodeDocumentSync: (input) => transport.acknowledgeLocalNodeDocumentSync(input),
        }).catch((error) => {
          console.warn("durable pending node sync hydration failed; rows remain pending", error);
        });
        if (isTauriRuntime()) {
          invoke("activate_canvas_command", { canvasId: primaryCanvasId }).catch(() => {});
        }
      } catch (error) {
        if (cancelled) return;
        setErrorMessage((error as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeConstellationId, databasePath, tabManager, transport]);

  useEffect(() => {
    if (!isHydrated || !databasePath || !activeConstellation) {
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
          // Annotations are independent SQLite substance. Persist them before
          // the heavier layout flush so a slow or unavailable layout backend
          // cannot strand a completed stroke during reload or app shutdown.
          const writeSubstance = shouldWriteSubstanceOnLayoutFlush();
          const serialized = stores.store.getState().serialize();
          await transport.persistConstellationDocument({
            annotations: stores.annotationStore.getState().serialize(),
            canvasId: activeCanvasId,
            databasePath,
            edges: writeSubstance ? serialized.edges : [],
            nodes: writeSubstance ? serialized.nodes : [],
            constellationId: activeConstellation.id,
          });

          if (cancelled) {
            return;
          }

          const snapshot = serializeLayoutSnapshot(stores.store.getState().serialize());
          const viewport = captureViewportRef.current();
          const result = await transport.flushCanvasLayout({
            databasePath,
            canvasId: activeCanvasId,
            layouts: snapshot.layouts,
            edges: snapshot.edges,
            viewport,
            appState: {},
          });

          if (cancelled) {
            return;
          }

          if (result === false) {
            setErrorMessage("failed to persist canvas layout");
          } else {
            setErrorMessage(null);
          }
        } catch (error) {
          if (cancelled) {
            return;
          }

          setErrorMessage(
            error instanceof Error
              ? error.message
              : typeof error === "string"
                ? error
                : "failed to persist canvas layout"
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
  }, [activeCanvasId, activeConstellation, databasePath, isHydrated, stores, transport]);

  useEffect(() => {
    if (!isHydrated || !databasePath || !activeConstellation) {
      return;
    }

    const flushLatest = () => {
      const snapshot = serializeLayoutSnapshot(stores.store.getState().serialize());
      const viewport = captureViewportRef.current();
      const result = transport.flushCanvasLayout({
        databasePath,
        canvasId: activeCanvasId,
        layouts: snapshot.layouts,
        edges: snapshot.edges,
        viewport,
        appState: {},
      });
      if (result instanceof Promise) {
        result.catch((error: unknown) => {
          console.error("canvas layout flush failed on unload", error);
        });
      } else if (result === false) {
        console.error("canvas layout flush returned false on unload");
      }
    };

    // LIMITATION (WS3 review): beforeunload cannot await this async flush; the final layout write is best-effort on hard window close. The document-view body flush has the same constraint (WS3 flushOnClose). Not addressed here — tracked for a future durable-flush task.
    window.addEventListener("beforeunload", flushLatest);
    window.addEventListener("pagehide", flushLatest);

    return () => {
      window.removeEventListener("beforeunload", flushLatest);
      window.removeEventListener("pagehide", flushLatest);
    };
  }, [activeCanvasId, activeConstellation, databasePath, isHydrated, stores, transport]);

  const refreshCanvas = useCallback(async () => {
    if (!databasePath || !activeConstellation) return;
    try {
      const view = await transport.loadCanvasView({
        databasePath,
        canvasId: activeCanvasId,
        lens: "canvas",
      });
      const { nodes, edges } = canvasViewToCanvasNodes(view);
      // Hydrate in-place to update nodes/edges without replacing stores
      stores.store.getState().hydrate({ nodes, edges });
      // A successful transport round-trip is a good signal Neo4j is
      // reachable again — opportunistically retry anything pending.
      void retryPendingGraphNodeSyncs({
        createGraphNode: (input) => transport.createGraphNode(input),
        findGraphNode: (input) => transport.findGraphNode(input),
        readLocalNodeDocument: (input) => transport.readLocalNodeDocument(input),
        compareAndSwapGraphNodeContent: (input) => transport.compareAndSwapGraphNodeContent(input),
        acknowledgeLocalNodeDocumentSync: (input) => transport.acknowledgeLocalNodeDocumentSync(input),
      });
    } catch (error) {
      console.error("refreshCanvas: loadCanvasView failed", error);
      setErrorMessage(error instanceof Error ? error.message : "failed to refresh canvas");
    }
  }, [activeCanvasId, databasePath, activeConstellation, stores.store, transport]);

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

  // Reconnect/retry: rescan SQLite, rather than only the process-local map, so
  // ordinary document saves made while Neo4j was unavailable are discovered
  // without an app restart. Reconciliation remains single-flight and never
  // blocks the UI.
  useEffect(() => {
    if (!databasePath) return;
    return startDurablePendingGraphNodeSyncRetryInterval(databasePath, {
      listPendingNodeDocumentSyncs: (input) => transport.listPendingNodeDocumentSyncs(input),
      createGraphNode: (input) => transport.createGraphNode(input),
      findGraphNode: (input) => transport.findGraphNode(input),
      readLocalNodeDocument: (input) => transport.readLocalNodeDocument(input),
      compareAndSwapGraphNodeContent: (input) => transport.compareAndSwapGraphNodeContent(input),
      acknowledgeLocalNodeDocumentSync: (input) => transport.acknowledgeLocalNodeDocumentSync(input),
    });
  }, [databasePath, transport]);

  const flushActiveCanvas = useCallback(async () => {
    if (!databasePath || !activeConstellation) {
      return;
    }

    const snapshot = serializeLayoutSnapshot(stores.store.getState().serialize());
    const viewport = captureViewportRef.current();
    const result = await transport.flushCanvasLayout({
      databasePath,
      canvasId: activeCanvasId,
      layouts: snapshot.layouts,
      edges: snapshot.edges,
      viewport,
      appState: {},
    });
    if (result === false) {
      setErrorMessage("failed to persist canvas layout");
      return;
    }

    const writeSubstance = shouldWriteSubstanceOnLayoutFlush();
    const serialized = stores.store.getState().serialize();
    await transport.persistConstellationDocument({
      annotations: stores.annotationStore.getState().serialize(),
      canvasId: activeCanvasId,
      databasePath,
      edges: writeSubstance ? serialized.edges : [],
      nodes: writeSubstance ? serialized.nodes : [],
      constellationId: activeConstellation.id,
    });
  }, [activeCanvasId, activeConstellation, databasePath, stores, transport]);

  const captureActiveCanvasTabSession = useCallback(() => {
    const manager = tabManager.getState();
    const activeTabId = manager.activeTabId;
    if (!activeTabId) return;
    rememberCanvasTabSession(activeTabId, {
      selectedNodeId: selectedNodeIdRef.current,
      selectedEdgeId: selectedEdgeIdRef.current,
      viewport: captureViewportRef.current(),
    });
  }, [tabManager, rememberCanvasTabSession]);

  const openCanvas = useCallback(
    async (canvasId: string, options: { captureCurrent?: boolean } = {}) => {
      if (!databasePath || !activeConstellation) {
        return;
      }

      try {
        if (options.captureCurrent !== false) {
          captureActiveCanvasTabSession();
        }
        await flushActiveCanvas();
        const view = await transport.loadCanvasView({
          databasePath,
          canvasId,
          lens: "canvas",
        });
        const { nodes, edges } = canvasViewToCanvasNodes(view);
        const nextStores = createWorkspaceStores(canvasId, activeConstellation.id);
        nextStores.store.getState().hydrate({ nodes, edges });

        const tabId = canvasTabId(activeConstellation.id, canvasId);
        ensureCanvasTab({
          id: tabId,
          constellationId: activeConstellation.id,
          canvasId,
          title: activeConstellation.displayName,
          pinned: activeConstellation.parentConstellationId === null
            && canvasId === activeConstellation.primaryCanvasId,
          viewport: view.viewport,
          selectedNodeId: undefined,
          selectedEdgeId: undefined,
          activate: true,
        });
        const rememberedTab = toCanvasTab(tabManager.getState().tabs.find((candidate) => candidate.id === tabId) ?? null);
        const restoredEdgeId = rememberedTab?.selectedEdgeId && edges.some((edge) => edge.id === rememberedTab.selectedEdgeId)
          ? rememberedTab.selectedEdgeId
          : null;
        const restoredNodeId = rememberedTab?.selectedNodeId && nodes.some((node) => node.id === rememberedTab.selectedNodeId)
          ? rememberedTab.selectedNodeId
          : nodes[0]?.id ?? null;

        setStores(nextStores);
        setActiveCanvasId(canvasId);
        selectedEdgeIdRef.current = restoredEdgeId;
        selectedNodeIdRef.current = restoredNodeId;
        setSelectedEdgeId(restoredEdgeId);
        setSelectedNodeId(restoredNodeId);
        setErrorMessage(null);
        if (isTauriRuntime()) {
          invoke("activate_canvas_command", { canvasId }).catch(() => {});
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "failed to open canvas");
      }
    },
    [activeConstellation, captureActiveCanvasTabSession, databasePath, ensureCanvasTab, flushActiveCanvas, tabManager, transport],
  );

  const activateCanvasTabById = useCallback(async (tabId: string): Promise<void> => {
    const manager = tabManager.getState();
    const target = toCanvasTab(manager.tabs.find((tab) => tab.id === tabId) ?? null);
    if (!target || target.id === manager.activeTabId) return;

    captureActiveCanvasTabSession();
    pendingCanvasTabIdRef.current = tabId;
    if (target.constellationId !== activeConstellationId) {
      selectedEdgeIdRef.current = null;
      selectedNodeIdRef.current = null;
      setSelectedEdgeId(null);
      setSelectedNodeId(null);
      setActiveConstellationId(target.constellationId);
      return;
    }
    if (target.canvasId !== activeCanvasId) {
      await openCanvas(target.canvasId, { captureCurrent: false });
      return;
    }

    manager.activate(tabId);
    selectedEdgeIdRef.current = target.selectedEdgeId;
    selectedNodeIdRef.current = target.selectedNodeId;
    setSelectedEdgeId(target.selectedEdgeId);
    setSelectedNodeId(target.selectedNodeId);
  }, [activeCanvasId, activeConstellationId, captureActiveCanvasTabSession, openCanvas, tabManager]);

  const openConstellationTab = useCallback(async (constellationId: string) => {
    const existing = tabManager.getState().tabs.find(
      (tab): tab is AppTab & { state: { constellationId: string; canvasId: string } } =>
        tab.surfaceId === "canvas" && "constellationId" in tab.state && tab.state.constellationId === constellationId,
    );
    if (existing) {
      await activateCanvasTabById(existing.id);
      return;
    }
    if (constellationId === activeConstellationId) return;

    captureActiveCanvasTabSession();
    pendingCanvasTabIdRef.current = null;
    selectedEdgeIdRef.current = null;
    selectedNodeIdRef.current = null;
    setSelectedEdgeId(null);
    setSelectedNodeId(null);
    setActiveConstellationId(constellationId);
  }, [activateCanvasTabById, activeConstellationId, captureActiveCanvasTabSession, tabManager]);

  const selectProject = useCallback(
    async (projectId: string) => {
      if (!databasePath) {
        throw new Error("selectProject: no database path yet");
      }
      const selected = await transport.selectProject({ databasePath, projectId });
      // Guard against stale state: the active scope always follows the
      // selected project, and the canvas re-hydrates from the project's
      // primary canvas because activeConstellationId changes too.
      setActiveProjectId(selected.projectId);
      setActiveProfileScope(selected.profileScope);
      selectedEdgeIdRef.current = null;
      selectedNodeIdRef.current = null;
      setSelectedEdgeId(null);
      setSelectedNodeId(null);
      setActiveConstellationId(selected.projectId);
      setErrorMessage(null);
    },
    [databasePath, transport],
  );

  const resolveOrCreateHome = useCallback(
    (input: ResolveHomeInput) => transport.resolveOrCreateHome(input),
    [transport],
  );

  const createProject = useCallback(
    async (input: CreateProjectInput) => {
      const project = await transport.createProject(input);
      const treeNode: ConstellationTreeNode = {
        id: project.id,
        name: project.displayName,
        slug: project.slug,
        rootPath: project.rootPath,
        rootType: project.rootType,
        profileScope: project.profileScope,
        summary: project.summary,
        parentId: project.parentConstellationId,
        children: [],
      };
      setConstellations((current) => {
        if (current.some((c) => c.id === treeNode.id)) return current;
        return [...current, treeNode];
      });
      return project;
    },
    [transport],
  );

  const closeCanvasTab = useCallback(async (tabId: string) => {
    const manager = tabManager.getState();
    const tab = manager.tabs.find((candidate) => candidate.id === tabId);
    if (!tab || tab.pinned) return;

    const wasActive = manager.activeTabId === tabId;
    if (wasActive) captureActiveCanvasTabSession();

    manager.close(tabId);

    if (!wasActive) return;
    const successorId = tabManager.getState().activeTabId;
    if (!successorId) return;
    const successor = tabManager.getState().tabs.find((candidate) => candidate.id === successorId);
    if (!successor) return;

    pendingCanvasTabIdRef.current = successor.id;
    if (successor.surfaceId === "canvas" && "constellationId" in successor.state) {
      const { constellationId, canvasId } = successor.state;
      if (constellationId !== activeConstellationId) {
        selectedEdgeIdRef.current = null;
        selectedNodeIdRef.current = null;
        setSelectedEdgeId(null);
        setSelectedNodeId(null);
        setActiveConstellationId(constellationId);
        return;
      }
      if (canvasId !== activeCanvasId) {
        await openCanvas(canvasId, { captureCurrent: false });
      }
    }
  }, [activeCanvasId, activeConstellationId, captureActiveCanvasTabSession, openCanvas, tabManager]);

  const selectEntry = useCallback((entryId: string | null) => {
    selectedEntryIdRef.current = entryId;
    setSelectedEntryId(entryId);
  }, []);
  const selectEdge = useCallback((edgeId: string | null) => {
    selectedEdgeIdRef.current = edgeId;
    setSelectedEdgeId(edgeId);
  }, []);
  const selectNode = useCallback((nodeId: string | null) => {
    selectedNodeIdRef.current = nodeId;
    setSelectedNodeId(nodeId);
  }, []);

  const activeCanvasTab = toCanvasTab(activeTab);

  const contextValue = useMemo<CanvasWorkspaceContextValue>(
    () => ({
      ...stores,
      tabManager,
      activeSurfaceId,
      tabs,
      activeTabId,
      activeTab,
      openTab: (tab) => tabManager.getState().open(tab),
      activateTab: (tabId) => tabManager.getState().activate(tabId),
      closeTab: (tabId) => tabManager.getState().close(tabId),
      updateTabState: (state) => {
        const manager = tabManager.getState();
        if (manager.activeTabId) {
          manager.updateState(manager.activeTabId, state);
        }
      },
      activeConstellation,
      activeConstellationId,
      activeProjectId,
      activeProfileScope,
      selectProject,
      resolveOrCreateHome,
      createProject,
      canvasId: activeCanvasId,
      databasePath,
      workspaceId,
      entries,
      errorMessage,
      isHydrated,
      constellationId: activeConstellation?.id ?? EMPTY_CONSTELLATION_ID,
      constellations,
      resourceRoots,
      workingRoot,
      repoRoot,
      canvasTabs: tabs.map((tab) => toCanvasTab(tab)).filter((tab): tab is CanvasTab => tab !== null),
      activeCanvasTabId: activeCanvasTab?.id ?? null,
      activeCanvasViewport: activeCanvasTab?.viewport ?? null,
      async attachResourceRoot(rootPath, displayName) {
        if (!databasePath || !activeConstellation) {
          return;
        }

        const nextRoots = await transport.attachConstellationResourceRoot({
          databasePath,
          displayName,
          constellationId: activeConstellation.id,
          rootPath
        });
        setResourceRoots((current) => {
          const remaining = current.filter((root) => root.id !== nextRoots.id);
          return [...remaining, nextRoots];
        });
      },
      async detachResourceRoot(rootPath) {
        if (!databasePath || !activeConstellation) {
          return;
        }

        await transport.detachConstellationResourceRoot({
          databasePath,
          constellationId: activeConstellation.id,
          rootPath
        });
        const nextRoots = await transport.listConstellationResourceRoots({
          databasePath,
          constellationId: activeConstellation.id
        });
        setResourceRoots(nextRoots);
      },
      async listDirectories() {
        return transport.listDirectories();
      },
      async searchConstellation(query, limit = 20) {
        if (!databasePath || !activeConstellation) {
          return [];
        }

        return transport.searchConstellation({
          databasePath,
          limit,
          constellationId: activeConstellation.id,
          query
        });
      },
      async listSavedSequences(input) {
        return transport.listSavedSequences(input);
      },
      async createSavedSequence(input) {
        return transport.createSavedSequence(input);
      },
      async updateSavedSequence(input) {
        return transport.updateSavedSequence(input);
      },
      async deleteSavedSequence(input) {
        return transport.deleteSavedSequence(input);
      },
      openCanvas,
      openConstellationTab,
      activateCanvasTab: activateCanvasTabById,
      closeCanvasTab,
      async addEdge(input) {
        if (!isRelationshipKind(input.relationKind)) {
          const message = `Unknown relationship type: ${input.relationKind}`;
          setErrorMessage(message);
          throw new Error(message);
        }
        const source = stores.store.getState().nodes.find((node) => node.id === input.sourceNodeId);
        const target = stores.store.getState().nodes.find((node) => node.id === input.targetNodeId);
        if (!source?.graphNodeId || !target?.graphNodeId) {
          const message = "Both cards must be synchronised to the knowledge graph before they can be linked.";
          setErrorMessage(message);
          throw new Error(message);
        }

        try {
          const relationship = await edgeRepository.createEdge({
            sourceGraphNodeId: source.graphNodeId,
            targetGraphNodeId: target.graphNodeId,
            relType: input.relationKind,
          });
          stores.store.getState().connectNodes({
            ...input,
            id: `graph:${relationship.id}`,
            relationKind: relationship.relType,
          });
          setErrorMessage(null);
        } catch (error) {
          console.warn("addEdge: graph relationship creation failed; falling back to local-only edge", error);
          stores.store.getState().connectNodes({
            ...input,
            id: crypto.randomUUID(),
            relationKind: input.relationKind,
          });
          setErrorMessage(null);
        }
      },
      async createNoteNode(position) {
        const graphNodeId = crypto.randomUUID();
        const publishCanvasNode = () => {
          const node = stores.store.getState().createNoteNode({
            title: "Untitled note", content: "", id: graphNodeId, graphNodeId,
          });
          if (position) {
            stores.store.getState().updateNodePosition(node.id, position);
          }
        };

        try {
          await createPreparedNoteNode({
            graphNodeId,
            title: "Untitled note",
            databasePath,
            upsertLocalNodeDocument: (input) => transport.upsertLocalNodeDocument(input),
            publishCanvasNode,
            createGraphNode: (input) =>
              transport.createGraphNode(
                input as Parameters<typeof transport.createGraphNode>[0] & { graphNodeId: string }
              ),
            acknowledgeLocalNodeDocumentSync: (input) =>
              transport.acknowledgeLocalNodeDocumentSync(input),
          });
        } catch (error) {
          console.warn("createNoteNode: authoritative creation failed; falling back to local-only note", error);
          publishCanvasNode();
        }
      },
      async createGroupNode(position) {
        const graphNodeId = crypto.randomUUID();
        // Local-first: add the node immediately; sync to Neo4j best-effort.
        stores.store.getState().createGroupNode({
          title: "New group",
          x: position?.x ?? 100,
          y: position?.y ?? 100,
          id: graphNodeId,
          graphNodeId,
        });
        void transport
          .createGraphNode({
            ...buildNewGraphNodeInput({ nodeType: "group", title: "New group" }),
            graphNodeId,
          } as Parameters<typeof transport.createGraphNode>[0] & { graphNodeId: string })
          .catch((error) => console.warn("createGraphNode sync failed; node kept locally", error));
      },
      async addResourceNode(entry, position) {
        const absolutePath = ("absolutePath" in entry ? entry.absolutePath : entry.path) ?? "";
        const relativePath = ("relativePath" in entry ? entry.relativePath : entry.path) ?? entry.name;
        const kind = (entry.kind ?? "binary") as "markdown" | "image" | "pdf" | "text" | "binary" | "directory" | "url" | "audio" | "video";
        const graphNodeId = crypto.randomUUID();
        // Local-first: place the resource node immediately; sync best-effort.
        const node = stores.store.getState().createResourceNode({
          title: entry.name,
          absolutePath,
          relativePath,
          resourceKind: kind,
          id: graphNodeId,
          graphNodeId,
        });
        stores.store.getState().updateNodePosition(node.id, position);
        void transport
          .createGraphNode({
            ...buildNewGraphNodeInput({ nodeType: "resource", title: entry.name }),
            graphNodeId,
          } as Parameters<typeof transport.createGraphNode>[0] & { graphNodeId: string })
          .catch((error) => console.warn("createGraphNode sync failed; node kept locally", error));
      },
      async addResourceNodeFromAbsolutePath(absolutePath, position) {
        const plan = deriveResourceImportPlan({
          absolutePath,
          resourceRoots: resourceRoots.map((root) => root.rootPath),
        });

        if (plan.shouldAttachRoot && databasePath && activeConstellation) {
          const nextRoot = await transport.attachConstellationResourceRoot({
            databasePath,
            constellationId: activeConstellation.id,
            rootPath: plan.rootPath,
          });
          setResourceRoots((current) => {
            const remaining = current.filter((root) => root.rootPath !== nextRoot.rootPath);
            return [...remaining, nextRoot];
          });
        }

        const graphNodeId = crypto.randomUUID();
        // Local-first: place the resource node immediately; sync best-effort.
        const node = stores.store.getState().createResourceNode({
          title: plan.title,
          absolutePath,
          relativePath: plan.relativePath,
          resourceKind: plan.kind,
          id: graphNodeId,
          graphNodeId,
        });
        stores.store.getState().updateNodePosition(node.id, position);
        void transport
          .createGraphNode({
            ...buildNewGraphNodeInput({ nodeType: "resource", title: plan.title }),
            graphNodeId,
          } as Parameters<typeof transport.createGraphNode>[0] & { graphNodeId: string })
          .catch((error) => console.warn("createGraphNode sync failed; node kept locally", error));
      },
      async createImageNode(entry, position) {
        const graphNodeId = crypto.randomUUID();
        const absolutePath = entry.absolutePath ?? "";
        const node = stores.store.getState().createImageNode({
          title: entry.name,
          src: absolutePath,
          caption: undefined,
          id: graphNodeId,
          graphNodeId,
        });
        stores.store.getState().updateNodePosition(node.id, position);
        void transport
          .createGraphNode({
            ...buildNewGraphNodeInput({ nodeType: "resource", title: entry.name }),
            graphNodeId,
          } as Parameters<typeof transport.createGraphNode>[0] & { graphNodeId: string })
          .catch((error) => console.warn("createGraphNode sync failed for image; node kept locally", error));
      },
      async deleteEdge(edgeId) {
        const edge = stores.store.getState().edges.find((candidate) => candidate.id === edgeId);
        if (!edge) return;
        const relationshipId = relationshipIdFromCanvasEdge(edgeId);
        try {
          if (relationshipId) {
            await edgeRepository.deleteEdge(relationshipId);
          }
          stores.store.getState().deleteEdge(edgeId);
          setErrorMessage(null);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not delete graph relationship.";
          setErrorMessage(message);
          throw error;
        }
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
      duplicateNode: async (nodeId) => {
        const original = stores.store.getState().nodes.find((n) => n.id === nodeId);
        if (!original) return;

        const newId = crypto.randomUUID();
        // Local-first: duplicate the node immediately; sync an independent Neo4j
        // node for the copy best-effort (WS4a invariant: each canvas node maps
        // 1:1 to its OWN GraphNode — the duplicate never shares the original's).
        stores.store.getState().duplicateNode(nodeId, { id: newId, graphNodeId: newId });
        void (async () => {
          try {
            let body = "[]";
            const entityType = entityTypeForNodeType(
              original.type as "note" | "group" | "resource" | "portal"
            );
            if (original.graphNodeId) {
              const sourceNode = await nodeRepository.getNode(original.graphNodeId);
              body = sourceNode?.body ?? "[]";
            }
            await transport.createGraphNode({
              entityType,
              title: original.title,
              body,
              isTemporal: false,
              sourceCoordinates: [],
              graphNodeId: newId,
            } as Parameters<typeof transport.createGraphNode>[0] & { graphNodeId: string });
          } catch (error) {
            console.warn("duplicate createGraphNode sync failed; node kept locally", error);
          }
        })();
      },
      selectEntry,
      selectEdge,
      selectNode,
      selectConstellation: openConstellationTab,
      selectedEntryId,
      selectedEdgeId,
      selectedNodeId,
      resizeNode: (nodeId, width, height, position) => {
        const store = stores.store.getState();
        if (position && (position.x !== undefined || position.y !== undefined)) {
          const node = store.nodes.find((candidate) => candidate.id === nodeId);
          if (node) {
            store.updateNodePosition(nodeId, {
              x: position.x ?? node.position.x,
              y: position.y ?? node.position.y,
            });
          }
        }
        store.updateNodeSize(nodeId, { width, height });
      },
      updateNodeContent: (nodeId, content) => {
        stores.store.getState().updateNodeContent(nodeId, content);
      },
      async updateNodeMetadata(nodeId, patch) {
        const node = stores.store.getState().nodes.find((candidate) => candidate.id === nodeId);
        if (!node?.graphNodeId) {
          const message = "This card has not yet been synchronised to the knowledge graph; its metadata cannot be edited yet.";
          setErrorMessage(message);
          throw new Error(message);
        }

        try {
          const graph = await transport.updateGraphNode({ graphNodeId: node.graphNodeId, patch });
          stores.store.getState().updateNodeGraph(nodeId, graph);
          setErrorMessage(null);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not save canonical node metadata.";
          setErrorMessage(message);
          throw error;
        }
      },
      async updateEdgeRelationKind(edgeId, relationKind) {
        if (!isRelationshipKind(relationKind)) {
          const message = `Unknown relationship type: ${relationKind}`;
          setErrorMessage(message);
          throw new Error(message);
        }
        const edge = stores.store.getState().edges.find((candidate) => candidate.id === edgeId);
        if (!edge) return;
        const oldRelationshipId = relationshipIdFromCanvasEdge(edge.id);
        if (!oldRelationshipId) {
          stores.store.getState().updateEdgeRelationKind(edgeId, relationKind);
          return;
        }

        try {
          // Create the replacement before deleting the old semantic edge. If
          // the create fails the original relationship and visual link remain
          // intact; if deletion fails, remove the replacement again rather
          // than leave two competing assertions in the graph.
          const replacement = await edgeRepository.createEdge({
            sourceGraphNodeId: edge.sourceNodeId,
            targetGraphNodeId: edge.targetNodeId,
            relType: relationKind,
          });
          try {
            await edgeRepository.deleteEdge(oldRelationshipId);
          } catch (disconnectError) {
            try {
              await edgeRepository.deleteEdge(replacement.id);
            } catch {
              // The primary failure is more actionable; the workspace error
              // surface reports it, while the two relationships remain explicit
              // rather than silently changing the canvas label.
            }
            throw disconnectError;
          }
          stores.store.getState().rebindEdgeToGraphRelationship(
            edgeId,
            replacement.id,
            replacement.relType,
          );
          setErrorMessage(null);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not change graph relationship type.";
          setErrorMessage(message);
          throw error;
        }
      },
      async setNodeThumbnailFromAbsolutePath(nodeId, absolutePath) {
        const plan = deriveResourceImportPlan({
          absolutePath,
          resourceRoots: resourceRoots.map((root) => root.rootPath),
        });

        if (plan.shouldAttachRoot && databasePath && activeConstellation) {
          const nextRoot = await transport.attachConstellationResourceRoot({
            databasePath,
            constellationId: activeConstellation.id,
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
      updateNodeTags: (nodeId, tags) => {
        stores.store.getState().updateNodeTags(nodeId, tags);
      },
      updateNodeTimelineCard: (nodeId, timelineCard) => {
        stores.store.getState().updateNodeTimelineCard(nodeId, timelineCard);
      },
      flyToNode: (nodeId, viewport) => flyToNodeRef.current(nodeId, viewport),
      flyToEdge: (edgeId, viewport) => flyToEdgeRef.current(edgeId, viewport),
      registerFlyToNode: (fn) => { flyToNodeRef.current = fn; },
      registerFlyToEdge: (fn) => { flyToEdgeRef.current = fn; },
      captureViewport: () => captureViewportRef.current(),
      registerCaptureViewport: (fn) => { captureViewportRef.current = fn; },
      transport,
      contentLinkingActions,
    }),
    [
      activeConstellation,
      activeConstellationId,
      activeProjectId,
      activeProfileScope,
      selectProject,
      resolveOrCreateHome,
      createProject,
      activeCanvasId,
      contentLinkingActions,
      databasePath,
      workspaceId,
      entries,
      errorMessage,
      isHydrated,
      constellations,
      resourceRoots,
      selectedEntryId,
      selectedEdgeId,
      selectedNodeId,
      activeCanvasTab,
      openCanvas,
      openConstellationTab,
      activateCanvasTabById,
      closeCanvasTab,
      selectEntry,
      selectEdge,
      selectNode,
      stores,
      tabManager,
      tabs,
      activeTabId,
      activeTab,
      activeSurfaceId,
      transport,
      workingRoot,
      repoRoot
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

function createWorkspaceStores(canvasId: string, _constellationId: string): WorkspaceStores {
  return {
    annotationStore: createAnnotationStore({ canvasId }),
    store: createCanvasStore({ canvasId }),
  };
}

function relationshipIdFromCanvasEdge(edgeId: string): string | null {
  return edgeId.startsWith("graph:") ? edgeId.slice("graph:".length) || null : null;
}

function hydrateWorkspaceDocument(
  document: ConstellationDocument,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  selection: {
    selectedEntryId: string | null;
    selectedEdgeId: string | null;
    selectedNodeId: string | null;
  },
  setStores: (stores: WorkspaceStores) => void,
  setActiveConstellation: (constellation: WorkspaceConstellation) => void,
  setEntries: (entries: IndexedEntry[]) => void,
  setResourceRoots: (resourceRoots: ResourceRoot[]) => void,
  setSelectedEntryId: (entryId: string | null) => void,
  setSelectedEdgeId: (edgeId: string | null) => void,
  setSelectedNodeId: (nodeId: string | null) => void,
  setWorkingRoot: (workingRoot: string) => void,
  setActiveCanvasId: (canvasId: string) => void,
  canvasId: string
) {
  const nextStores = createWorkspaceStores(
    canvasId,
    document.constellation.id
  );
  nextStores.store.getState().hydrate({ nodes, edges });
  nextStores.annotationStore.getState().hydrate(document.annotations);

  setStores(nextStores);
  setActiveConstellation(document.constellation);
  setEntries(document.entries);
  setResourceRoots(document.resourceRoots ?? []);
  setWorkingRoot(document.workingRoot ?? document.constellation.rootPath);
  setActiveCanvasId(canvasId);
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
      edges.some((edge) => edge.id === selection.selectedEdgeId)
      ? selection.selectedEdgeId
      : null
  );
  setSelectedNodeId(
    selection.selectedNodeId &&
      nodes.some((node) => node.id === selection.selectedNodeId)
      ? selection.selectedNodeId
      : nodes[0]?.id ?? null
  );
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__);
}

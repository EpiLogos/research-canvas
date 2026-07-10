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
  entityTypeForNodeType,
  serializeLayoutSnapshot,
  type ContentLinkingActions,
} from "@research-canvas/canvas";
import { buildNewGraphNodeInput, createPreparedNoteNode } from "./nodeCreation";
import { retryPendingGraphNodeSyncs } from "./pendingGraphNodeSync";
import { canvasViewToCanvasNodes } from "./canvasViewToNodes";
import { selectLegacyNodesNeedingImport, importLegacyCanvasNodes } from "./legacyNodeImport";
import type { CanvasNode, CanvasEdge, Viewport } from "@research-canvas/schema";
import {
  createWorkspaceTransport,
  type DirectoryEntry,
  type IndexedEntry,
  type ConstellationDocument,
  type ConstellationTreeNode,
  type ResourceRoot,
  type SavedSequence,
  type SearchHit,
  type WorkspaceConstellation
} from "@research-canvas/desktop-api";
type WorkspaceTransport = ReturnType<typeof createWorkspaceTransport>;
import {
  deriveResourceImportPlan,
  toAssetUrl,
} from "./resourceFileHelpers";
import { shouldWriteSubstanceOnLayoutFlush } from "./persistPolicy";

const EMPTY_CANVAS_ID = "00000000-0000-4000-8000-000000000001";
const EMPTY_CONSTELLATION_ID = "00000000-0000-4000-8000-000000000002";

interface WorkspaceStores {
  annotationStore: ReturnType<typeof createAnnotationStore>;
  store: ReturnType<typeof createCanvasStore>;
}

interface CanvasWorkspaceContextValue extends WorkspaceStores {
  activeConstellation: WorkspaceConstellation | null;
  activeConstellationId: string | null;
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
  createNoteNode: (position?: { x: number; y: number }) => Promise<void>;
  createGroupNode: (position?: { x: number; y: number }) => Promise<void>;
  addResourceNode: (entry: { id?: string; name: string; path?: string; absolutePath?: string; relativePath?: string; kind?: string }, position: { x: number; y: number }) => Promise<void>;
  addResourceNodeFromAbsolutePath: (absolutePath: string, position: { x: number; y: number }) => Promise<void>;
  deleteEdge: (edgeId: string) => void;
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
  setNodeThumbnailFromAbsolutePath: (nodeId: string, absolutePath: string) => Promise<void>;
  updateNodeStyle: (nodeId: string, style: { dotColour?: string; bgColour?: string; textColour?: string; thumbnail?: string }) => void;
  updateNodeTags: (nodeId: string, tags: string[]) => void;
  updateNodeTimelineCard: (
    nodeId: string,
    timelineCard: { offsetY: number; width?: number; height?: number },
  ) => void;
  workingRoot: string | null;
  flyToNode: (nodeId: string, viewport?: { x: number; y: number; zoom: number }) => void;
  flyToEdge: (edgeId: string, viewport?: { x: number; y: number; zoom: number }) => void;
  registerFlyToNode: (fn: (nodeId: string, viewport?: { x: number; y: number; zoom: number }) => void) => void;
  registerFlyToEdge: (fn: (edgeId: string, viewport?: { x: number; y: number; zoom: number }) => void) => void;
  captureViewport: () => Viewport;
  registerCaptureViewport: (fn: () => Viewport) => void;
  transport: WorkspaceTransport;
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
  const transport = useMemo(() => createWorkspaceTransport(), []);
  const [stores, setStores] = useState<WorkspaceStores>(() =>
    createWorkspaceStores(EMPTY_CANVAS_ID, EMPTY_CONSTELLATION_ID)
  );
  const [constellations, setConstellations] = useState<ConstellationTreeNode[]>([]);
  const [databasePath, setDatabasePath] = useState<string | null>(null);
  const [activeConstellation, setActiveConstellation] = useState<WorkspaceConstellation | null>(null);
  const [activeConstellationId, setActiveConstellationId] = useState<string | null>(null);
  const [activeCanvasId, setActiveCanvasId] = useState(EMPTY_CANVAS_ID);
  const [entries, setEntries] = useState<IndexedEntry[]>([]);
  const [resourceRoots, setResourceRoots] = useState<ResourceRoot[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workingRoot, setWorkingRoot] = useState<string | null>(null);
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

        setConstellations(workspace.constellations);
        setDatabasePath(workspace.databasePath);
        setActiveConstellationId((current) =>
          current && workspace.constellations.some((constellation) => constellation.id === current)
            ? current
            : workspace.activeConstellationId
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
          const primaryCanvasId = document.constellation.primaryCanvasId;
          let graphNodes = document.nodes;
          let graphEdges = document.edges;
          try {
            let view = await transport.loadCanvasView({
              databasePath,
              canvasId: primaryCanvasId,
              lens: "canvas",
            });
          if (cancelled) return;

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

        hydrateWorkspaceDocument(
          document,
          graphNodes,
          graphEdges,
          {
            selectedEntryId: selectedEntryIdRef.current,
            selectedEdgeId: selectedEdgeIdRef.current,
            selectedNodeId: selectedNodeIdRef.current
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
        setErrorMessage(null);
        setIsHydrated(true);
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
  }, [activeConstellationId, databasePath, transport]);

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
            // Annotations-only write: nodes/edges substance is owned by Neo4j
            // (WS4a Task 6 cutover). shouldWriteSubstanceOnLayoutFlush() returns
            // false (permanently), so nodes/edges are always empty here.
            // canvas_annotations has no FK dependency on canvas_nodes (confirmed
            // in migrations/0001_initial.sql), so the annotation write is safe
            // independently of whether any node rows exist.
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
      void retryPendingGraphNodeSyncs((input) => transport.createGraphNode(input));
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

  // Reconnect/retry: nodes created while Neo4j was unreachable are recorded
  // as "pending sync" (pendingGraphNodeSync.ts). Re-attempt them on a modest
  // interval — simple and best-effort, never blocking the UI. A node that
  // syncs successfully is cleared from the pending set by the helper itself.
  useEffect(() => {
    const intervalId = setInterval(() => {
      void retryPendingGraphNodeSyncs((input) => transport.createGraphNode(input));
    }, 15_000);
    return () => clearInterval(intervalId);
  }, [transport]);

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

  const openCanvas = useCallback(
    async (canvasId: string) => {
      if (!databasePath || !activeConstellation) {
        return;
      }

      try {
        await flushActiveCanvas();
        const view = await transport.loadCanvasView({
          databasePath,
          canvasId,
          lens: "canvas",
        });
        const { nodes, edges } = canvasViewToCanvasNodes(view);
        const nextStores = createWorkspaceStores(canvasId, activeConstellation.id);
        nextStores.store.getState().hydrate({ nodes, edges });

        setStores(nextStores);
        setActiveCanvasId(canvasId);
        setSelectedEdgeId(null);
        setSelectedNodeId(nodes[0]?.id ?? null);
        setErrorMessage(null);
        if (isTauriRuntime()) {
          invoke("activate_canvas_command", { canvasId }).catch(() => {});
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "failed to open canvas");
      }
    },
    [activeConstellation, databasePath, flushActiveCanvas, transport],
  );

  const contextValue = useMemo<CanvasWorkspaceContextValue>(
    () => ({
      ...stores,
      activeConstellation,
      activeConstellationId,
      canvasId: activeCanvasId,
      databasePath,
      entries,
      errorMessage,
      isHydrated,
      constellationId: activeConstellation?.id ?? EMPTY_CONSTELLATION_ID,
      constellations,
      resourceRoots,
      workingRoot,
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
      addEdge: (input) => {
        stores.store.getState().connectNodes(input);
      },
      async createNoteNode(position) {
        const graphNodeId = crypto.randomUUID();
        await createPreparedNoteNode({
          graphNodeId,
          title: "Untitled note",
          databasePath,
          upsertLocalNodeDocument: (input) => transport.upsertLocalNodeDocument(input),
          publishCanvasNode: () => {
            const node = stores.store.getState().createNoteNode({
              title: "Untitled note", content: "", id: graphNodeId, graphNodeId,
            });
            if (position) {
              stores.store.getState().updateNodePosition(node.id, position);
            }
          },
          createGraphNode: (input) =>
            transport.createGraphNode(
              input as Parameters<typeof transport.createGraphNode>[0] & { graphNodeId: string }
            ),
        });
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
              const sourceNode = await transport.readGraphNode({ graphNodeId: original.graphNodeId });
              body = sourceNode.body;
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
      selectEntry: setSelectedEntryId,
      selectEdge: setSelectedEdgeId,
      selectNode: setSelectedNodeId,
      selectConstellation: async (constellationId: string) => {
        if (activeConstellation && databasePath) {
          // Flush layout of the outgoing canvas so positions are saved.
          // Mirror the unload handler pattern: capture the result and attach
          // .catch() so a rejection does not become an unhandled promise rejection.
          const snapshot = serializeLayoutSnapshot(stores.store.getState().serialize());
          const viewport = captureViewportRef.current();
          const flushResult = transport.flushCanvasLayout({
            databasePath,
            canvasId: activeCanvasId,
            layouts: snapshot.layouts,
            edges: snapshot.edges,
            viewport,
            appState: {},
          });
          if (flushResult instanceof Promise) {
            flushResult.catch((error: unknown) => {
              console.error("canvas layout flush failed on constellation switch", error);
            });
          } else if (flushResult === false) {
            console.error("canvas layout flush returned false on constellation switch");
          }
          // Annotations-only write: node/edge substance lives in Neo4j
          // (WS4a Task 6 cutover). shouldWriteSubstanceOnLayoutFlush() returns
          // false (permanently), so nodes/edges are always empty here.
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
        }
        setSelectedEdgeId(null);
        setSelectedNodeId(null);
        setActiveConstellationId(constellationId);
      },
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
      activeCanvasId,
      contentLinkingActions,
      databasePath,
      entries,
      errorMessage,
      isHydrated,
      constellations,
      resourceRoots,
      selectedEntryId,
      selectedEdgeId,
      selectedNodeId,
      openCanvas,
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

function createWorkspaceStores(canvasId: string, _constellationId: string): WorkspaceStores {
  return {
    annotationStore: createAnnotationStore({ canvasId }),
    store: createCanvasStore({ canvasId })
  };
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

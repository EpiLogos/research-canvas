import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";

import {
  createNodeDocumentStore,
  type NodeDocumentStore,
} from "@research-canvas/node-document";
import { BlockNoteDocument } from "@research-canvas/viewers";
import type {
  ContentOrigin,
  GraphContentCasInput,
  GraphContentCasMutation,
  GraphNode,
  LocalNodeDocumentInput,
  LocalNodeDocumentWriteResult,
  SyncAcknowledgementMutation,
} from "@research-canvas/desktop-api";
import { resolveBlockNoteAssetUrls, restoreBlockNoteAssetUrls } from "../canvas/resourceFileHelpers";

interface NodeDocumentTransport {
  readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>;
  compareAndSwapGraphNodeContent?(input: GraphContentCasInput): Promise<GraphContentCasMutation>;
  readLocalNodeDocument(input: {
    databasePath: string;
    graphNodeId: string;
  }): Promise<{
    body: string;
    summary: string;
    neo4jSynced: boolean;
    contentOrigin?: ContentOrigin;
    contentRevision?: number;
    bodySourceCoordinates?: string[];
  } | null>;
  upsertLocalNodeDocument(input: LocalNodeDocumentInput): Promise<LocalNodeDocumentWriteResult>;
  acknowledgeLocalNodeDocumentSync?(input: {
    databasePath: string;
    graphNodeId: string;
    expectedRevision: number;
    expectedOrigin: ContentOrigin;
  }): Promise<SyncAcknowledgementMutation>;
}

interface NodeDocumentPaneProps {
  graphNodeId: string;
  transport: NodeDocumentTransport;
  /**
   * Absolute path of the SQLite workspace database, used for the authoritative
   * local read/upsert of the node document. Threaded from
   * `useCanvasWorkspace().databasePath`. When null, the editor still mounts
   * (empty body) but local persistence is unavailable — a non-blocking status
   * is shown rather than a dead-end.
   */
  databasePath: string | null;
  /** Workspace root resolves portable `assets/...` image blocks for display. */
  workspaceRoot?: string | null;
  editable?: boolean;
  /**
   * Test-only: when set, renders a hidden button that pushes this body via
   * setBody so jsdom tests can drive a dirty-then-close flush. Never passed by
   * production callers.
   */
  __testSetBody?: string;
}

class ContentSyncConflictError extends Error {}

export function NodeDocumentPane({
  graphNodeId,
  transport,
  databasePath,
  workspaceRoot = null,
  editable = true,
  __testSetBody,
}: NodeDocumentPaneProps) {
  const [store, setStore] = useState<NodeDocumentStore | null>(null);
  // Non-blocking, inline-only status; NEVER a full-pane dead-end. Neo4j is a
  // sync target, not a read gate — the editor must always mount.
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [localAuthorityAvailable, setLocalAuthorityAvailable] = useState(databasePath !== null);
  const transportRef = useRef(transport);
  transportRef.current = transport;
  const databasePathRef = useRef(databasePath);
  databasePathRef.current = databasePath;
  const contentRevisionRef = useRef<number | null>(null);
  const contentOriginRef = useRef<ContentOrigin | null>(null);
  const remoteRevisionRef = useRef<number | null>(null);
  const remoteOriginRef = useRef<ContentOrigin | null>(null);
  const bodySourcesRef = useRef<string[]>([]);
  const effectGenerationRef = useRef(0);

  useEffect(() => {
    const generation = ++effectGenerationRef.current;
    let cancelled = false;
    const isCurrentGeneration = () => !cancelled && effectGenerationRef.current === generation;
    setStore(null);
    setStatusNote(null);
    setLocalAuthorityAvailable(databasePath !== null);

    // flush is authoritative-local-first: write the local document (SQLite)
    // FIRST — this is the durable write and its failure must propagate so the
    // doc store surfaces status="error". THEN sync Neo4j best-effort; a Neo4j
    // failure never blocks or surfaces a blocking error — it only leaves the
    // local row's neo4j_synced=false and shows a subtle non-blocking status.
    const flush = async (body: string, summary: string): Promise<void> => {
      const dbPath = databasePathRef.current;

      if (!dbPath) {
        throw new Error("editing requires the authoritative local document store");
      }

      // Authoritative local write, FIRST. A failure here IS a real save
      // failure and must propagate so the doc store surfaces status="error".
      const expectedRevision = contentRevisionRef.current;
      const expectedRemoteRevision = remoteRevisionRef.current;
      const expectedRemoteOrigin = remoteOriginRef.current;
      const bodySourceCoordinates = [...bodySourcesRef.current];
      const contentRevision = expectedRevision === null ? 0 : expectedRevision + 1;
      const localResult = await transportRef.current.upsertLocalNodeDocument({
        databasePath: dbPath,
        graphNodeId,
        body,
        summary,
        neo4jSynced: false,
        contentOrigin: "user_authored",
        contentRevision,
        ...(expectedRevision === null ? {} : { expectedRevision }),
        bodySourceCoordinates,
      });
      const mutation = (localResult as { mutation?: { kind?: string; reason?: string } } | undefined)?.mutation;
      if (mutation?.kind === "conflict") {
        throw new Error(mutation.reason ?? "node document reconciliation conflict");
      }
      const returnedRevision = (localResult as { document?: { contentRevision?: number } | null } | undefined)
        ?.document?.contentRevision;
      if (isCurrentGeneration()) {
        contentRevisionRef.current = returnedRevision ?? contentRevision;
        contentOriginRef.current = "user_authored";
      }

      // Best-effort Neo4j sync, AFTER the local write succeeded. Never blocks
      // and never surfaces a blocking error — only a subtle status note.
      try {
        if (expectedRemoteRevision === null || expectedRemoteOrigin === null) {
          throw new Error("remote content baseline unavailable; local edit remains pending");
        }
        const compareAndSwap = transportRef.current.compareAndSwapGraphNodeContent;
        if (!compareAndSwap) {
          throw new Error("revision-aware remote content sync is unavailable");
        }
        const remote = await compareAndSwap({
          graphNodeId,
          expectedRemoteRevision,
          expectedRemoteOrigin,
          body,
          summary,
          contentOrigin: "user_authored",
          contentRevision,
          bodySourceCoordinates,
        });
        if (remote.kind !== "updated") {
          throw new ContentSyncConflictError(
            remote.kind === "conflict" ? remote.reason : `remote content sync ${remote.kind}`
          );
        }
        if (isCurrentGeneration()) {
          remoteRevisionRef.current = contentRevision;
          remoteOriginRef.current = "user_authored";
        }
        const acknowledge = transportRef.current.acknowledgeLocalNodeDocumentSync;
        if (!acknowledge) {
          throw new Error("local sync acknowledgement is unavailable");
        }
        const acknowledgement = await acknowledge({
          databasePath: dbPath,
          graphNodeId,
          expectedRevision: contentRevision,
          expectedOrigin: "user_authored",
        });
        if (!["updated", "preserved"].includes(acknowledgement.kind)) {
          throw new ContentSyncConflictError(
            acknowledgement.kind === "conflict"
              ? acknowledgement.reason
              : `local sync acknowledgement ${acknowledgement.kind}`
          );
        }
        if (isCurrentGeneration()) {
          setStatusNote(null);
        }
      } catch (error) {
        // Local write already succeeded; leave neo4j_synced=false and just
        // note the pending sync. Non-blocking by design.
        if (isCurrentGeneration()) {
          setStatusNote(error instanceof ContentSyncConflictError ? "Saved locally, sync conflict" : "Saved locally, sync pending");
        }
        console.warn("node document Neo4j sync failed; kept locally", error);
        if (error instanceof ContentSyncConflictError) {
          throw error;
        }
      }
    };

    const mountStore = (initialBody: string) => {
      const nextStore = createNodeDocumentStore({
        graphNodeId,
        initialBody,
        flush,
      });
      if (isCurrentGeneration()) {
        setStore(nextStore);
      }
      return nextStore;
    };

    const readLocal = databasePath
      ? transportRef.current.readLocalNodeDocument({ databasePath, graphNodeId })
      : Promise.resolve(null);

    readLocal
      .then(async (local) => {
        if (!isCurrentGeneration()) {
          return;
        }
        setLocalAuthorityAvailable(databasePath !== null);
        if (!databasePath) {
          setStatusNote("Local document unavailable — read-only");
        }
        const localBody = local?.body ?? "";
        contentRevisionRef.current = local?.contentRevision ?? null;
        contentOriginRef.current = local?.contentOrigin ?? null;
        bodySourcesRef.current = local?.bodySourceCoordinates ?? [];
        if (local?.neo4jSynced) {
          remoteRevisionRef.current = local.contentRevision ?? null;
          remoteOriginRef.current = local.contentOrigin ?? null;
        } else {
          remoteRevisionRef.current = null;
          remoteOriginRef.current = null;
        }

        // Backfill completes before store construction. The reconciled body is
        // mounted as both body and savedBody, so no setBody debounce can emit a
        // stale second write.
        if (local === null && databasePath) {
          try {
            const node = await transportRef.current.readGraphNode({ graphNodeId });
            if (!isCurrentGeneration()) {
              return;
            }
            remoteRevisionRef.current = node.contentRevision ?? null;
            remoteOriginRef.current = node.contentOrigin ?? null;
            const result = await transportRef.current.upsertLocalNodeDocument({
              databasePath, graphNodeId, body: node.body, summary: node.summary ?? "",
              neo4jSynced: true, contentOrigin: node.contentOrigin ?? "imported",
              contentRevision: node.contentRevision ?? 0,
              bodySourceCoordinates: node.bodySourceCoordinates ?? [],
              metadataProjection: {
                entityType: node.entityType,
                title: node.title,
                schemaVersion: 1,
              },
            });
            if (!isCurrentGeneration()) {
              return;
            }
            if (result.mutation?.kind === "conflict" || !result.document) {
              throw new Error(
                result.mutation.kind === "conflict"
                  ? result.mutation.reason
                  : "remote backfill was not accepted locally"
              );
            }
            contentRevisionRef.current = result.document.contentRevision;
            contentOriginRef.current = result.document.contentOrigin;
            bodySourcesRef.current = result.document.bodySourceCoordinates;
            mountStore(result.document.body);
            return;
          } catch (error) {
            console.warn("remote document backfill failed; mounting local body", error);
          }
        } else if (local && !local.neo4jSynced) {
          void transportRef.current.readGraphNode({ graphNodeId }).then((node) => {
            if (!isCurrentGeneration()) {
              return;
            }
            remoteRevisionRef.current = node.contentRevision ?? null;
            remoteOriginRef.current = node.contentOrigin ?? null;
          }).catch(() => {});
        }
        mountStore(localBody);
      })
      .catch((error: unknown) => {
        if (!isCurrentGeneration()) {
          return;
        }
        // Local DB read itself failed: still mount the reader (empty
        // body) with a small non-blocking status — never a dead-end pane.
        console.warn("readLocalNodeDocument failed; mounting empty editor", error);
        setStatusNote("Local document unavailable");
        setLocalAuthorityAvailable(false);
        mountStore("");
      });

    return () => {
      cancelled = true;
    };
    // databasePath is intentionally excluded: it is read via ref inside flush
    // and re-read on the initial local read; a mid-session change of the
    // workspace db path is not a supported scenario for an open node document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphNodeId]);

  if (!store) {
    return <div className="node-document-pane node-document-pane--loading">Loading…</div>;
  }

  return (
    <NodeDocumentBody
      store={store}
      editable={editable}
      localAuthorityAvailable={localAuthorityAvailable}
      statusNote={statusNote}
      workspaceRoot={workspaceRoot}
      testSetBody={__testSetBody}
    />
  );
}

function NodeDocumentBody({
  store,
  editable,
  statusNote,
  testSetBody,
  localAuthorityAvailable,
  workspaceRoot,
}: {
  store: NodeDocumentStore;
  editable: boolean;
  statusNote: string | null;
  testSetBody?: string;
  localAuthorityAvailable: boolean;
  workspaceRoot: string | null;
}) {
  const body = useStore(store, (state) => state.body);
  const status = useStore(store, (state) => state.status);
  const errorMessage = useStore(store, (state) => state.errorMessage);
  const displayBody = useMemo(
    () => resolveBlockNoteAssetUrls(body, workspaceRoot),
    [body, workspaceRoot],
  );

  // Crash-safe flush-on-close (WS1 robustness bar (b)): write the dirty body on
  // window unload AND on unmount, and SURFACE failure rather than dropping it.
  // The flush now writes local first (authoritative), then syncs Neo4j.
  useEffect(() => {
    const closeFlush = () => {
      void store
        .getState()
        .flushOnClose()
        .then((ok) => {
          if (!ok) {
            // flushOnClose already set status="error"/errorMessage on the store;
            // also log so a failure during teardown is never silently lost.
            console.error(
              "node-document close flush failed:",
              store.getState().errorMessage
            );
          }
        });
    };
    window.addEventListener("beforeunload", closeFlush);
    return () => {
      window.removeEventListener("beforeunload", closeFlush);
      closeFlush();
    };
  }, [store]);

  return (
    <div className="node-document-pane">
      <BlockNoteDocument
        // BlockNote seeds its document only on mount. Re-mount when the
        // workspace becomes known so an early-opened reader upgrades stored
        // `assets/...` image paths to renderable Tauri URLs.
        key={editable
          ? (workspaceRoot ?? "unresolved-workspace")
          : `${workspaceRoot ?? "unresolved-workspace"}:${displayBody}`}
        body={displayBody}
        editable={editable && localAuthorityAvailable}
        saveState={status}
        saveErrorMessage={errorMessage}
        onChange={(next) => store.getState().setBody(restoreBlockNoteAssetUrls(next, workspaceRoot))}
      />
      <div className="node-document-pane__status" data-status={status}>
        {status === "saving"
          ? "Saving…"
          : status === "error"
            ? (errorMessage ?? "Save failed")
            : status === "dirty"
              ? "Unsaved changes"
              : (statusNote ?? "Saved")}
      </div>
      {testSetBody !== undefined ? (
        <button
          type="button"
          data-testid="set-body"
          style={{ display: "none" }}
          onClick={() => store.getState().setBody(testSetBody)}
        >
          set body (test only)
        </button>
      ) : null}
    </div>
  );
}

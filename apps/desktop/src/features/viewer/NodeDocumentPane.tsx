import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";

import {
  createNodeDocumentStore,
  type NodeDocumentStore,
} from "@research-canvas/node-document";
import { BlockNoteDocument } from "@research-canvas/viewers";
import type { ContentOrigin, GraphNode } from "@research-canvas/desktop-api";

interface NodeDocumentTransport {
  readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>;
  compareAndSwapGraphNodeContent?(input: {
    graphNodeId: string;
    expectedRemoteRevision: number | null;
    expectedRemoteOrigin: ContentOrigin | null;
    body: string;
    summary: string;
    contentOrigin: ContentOrigin;
    contentRevision: number;
    bodySourceCoordinates: string[];
  }): Promise<{ kind: string; reason?: string }>;
  readLocalNodeDocument(input: {
    databasePath: string;
    graphNodeId: string;
  }): Promise<{ body: string; summary: string; neo4jSynced: boolean; contentOrigin?: ContentOrigin; contentRevision?: number; bodySourceCoordinates?: string[] } | null>;
  upsertLocalNodeDocument(input: {
    databasePath: string;
    graphNodeId: string;
    body: string;
    summary: string;
    neo4jSynced?: boolean;
    contentOrigin?: "user_authored" | "seed" | "corpus_compiled" | "imported";
    contentRevision?: number;
    expectedRevision?: number;
    bodySourceCoordinates?: string[];
  }): Promise<unknown>;
  acknowledgeLocalNodeDocumentSync?(input: {
    databasePath: string;
    graphNodeId: string;
    expectedRevision: number;
    expectedOrigin: ContentOrigin;
  }): Promise<{ kind: string; reason?: string }>;
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
  editable?: boolean;
  /**
   * Test-only: when set, renders a hidden button that pushes this body via
   * setBody so jsdom tests can drive a dirty-then-close flush. Never passed by
   * production callers.
   */
  __testSetBody?: string;
}

class ContentSyncConflictError extends Error {}

/** True when the BlockNote body JSON has no visible text content. */
function isEmptyBody(body: string): boolean {
  if (!body) {
    return true;
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return true;
    }
    const hasText = JSON.stringify(parsed).includes('"text"');
    return !hasText;
  } catch {
    return body.trim().length === 0;
  }
}

export function NodeDocumentPane({
  graphNodeId,
  transport,
  databasePath,
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
  const bodySourcesRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
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
      const expectedOrigin = contentOriginRef.current;
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
        bodySourceCoordinates: bodySourcesRef.current,
      });
      const mutation = (localResult as { mutation?: { kind?: string; reason?: string } } | undefined)?.mutation;
      if (mutation?.kind === "conflict") {
        throw new Error(mutation.reason ?? "node document reconciliation conflict");
      }
      const returnedRevision = (localResult as { document?: { contentRevision?: number } | null } | undefined)
        ?.document?.contentRevision;
      contentRevisionRef.current = returnedRevision ?? contentRevision;
      contentOriginRef.current = "user_authored";

      // Best-effort Neo4j sync, AFTER the local write succeeded. Never blocks
      // and never surfaces a blocking error — only a subtle status note.
      try {
        if (expectedRevision === null || expectedOrigin === null) {
          throw new Error("remote content baseline unavailable; local edit remains pending");
        }
        const compareAndSwap = transportRef.current.compareAndSwapGraphNodeContent;
        if (!compareAndSwap) {
          throw new Error("revision-aware remote content sync is unavailable");
        }
        const remote = await compareAndSwap({
          graphNodeId,
          expectedRemoteRevision: expectedRevision,
          expectedRemoteOrigin: expectedOrigin,
          body,
          summary,
          contentOrigin: "user_authored",
          contentRevision,
          bodySourceCoordinates: bodySourcesRef.current,
        });
        if (remote.kind !== "updated") {
          throw new ContentSyncConflictError(remote.reason ?? `remote content sync ${remote.kind}`);
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
          throw new ContentSyncConflictError(acknowledgement.reason ?? `local sync acknowledgement ${acknowledgement.kind}`);
        }
        if (!cancelled) {
          setStatusNote(null);
        }
      } catch (error) {
        // Local write already succeeded; leave neo4j_synced=false and just
        // note the pending sync. Non-blocking by design.
        if (!cancelled) {
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
      if (!cancelled) {
        setStore(nextStore);
      }
      return nextStore;
    };

    const readLocal = databasePath
      ? transportRef.current.readLocalNodeDocument({ databasePath, graphNodeId })
      : Promise.resolve(null);

    readLocal
      .then((local) => {
        if (cancelled) {
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
        const mounted = mountStore(localBody);

        // Reconcile (best-effort, non-blocking): if the local body was empty
        // but Neo4j has substance, seed the local store from Neo4j and persist
        // it as synced. Offline / missing node is fine — ignore failures.
        if (isEmptyBody(localBody) && databasePath) {
          transportRef.current
            .readGraphNode({ graphNodeId })
            .then((node) => {
              if (cancelled || !node || isEmptyBody(node.body)) {
                return;
              }
              // Re-check the LIVE store body at resolution time (not the
              // mount-time snapshot): if the user has started typing into the
              // empty editor while this request was in flight, the store body
              // is no longer empty and reconcile must NOT clobber it.
              if (!isEmptyBody(mounted.getState().body)) {
                return;
              }
              mounted.getState().setBody(node.body);
              void transportRef.current
                .upsertLocalNodeDocument({
                  databasePath,
                  graphNodeId,
                  body: node.body,
                  summary: node.summary ?? "",
                  neo4jSynced: true,
                  contentOrigin: node.contentOrigin ?? "imported",
                  contentRevision: node.contentRevision ?? 0,
                  ...(local?.contentRevision === undefined ? {} : { expectedRevision: local.contentRevision }),
                  bodySourceCoordinates: node.bodySourceCoordinates ?? [],
                })
                .catch((error) =>
                  console.warn("reconcile local seed failed", error)
                );
            })
            .catch(() => {
              // Offline / node not in Neo4j — the empty local editor stands.
            });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
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
}: {
  store: NodeDocumentStore;
  editable: boolean;
  statusNote: string | null;
  testSetBody?: string;
  localAuthorityAvailable: boolean;
}) {
  const body = useStore(store, (state) => state.body);
  const status = useStore(store, (state) => state.status);
  const errorMessage = useStore(store, (state) => state.errorMessage);

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
        body={body}
        editable={editable && localAuthorityAvailable}
        saveState={status}
        saveErrorMessage={errorMessage}
        onChange={(next) => store.getState().setBody(next)}
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

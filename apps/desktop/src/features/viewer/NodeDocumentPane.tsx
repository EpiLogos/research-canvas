import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";

import {
  createNodeDocumentStore,
  type NodeDocumentStore,
} from "@research-canvas/node-document";
import { BlockNoteDocument } from "@research-canvas/viewers";
import type { GraphNode, GraphNodePatch } from "@research-canvas/desktop-api";

interface NodeDocumentTransport {
  readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>;
  updateGraphNode(input: {
    graphNodeId: string;
    patch: GraphNodePatch;
  }): Promise<GraphNode>;
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
  const transportRef = useRef(transport);
  transportRef.current = transport;
  const databasePathRef = useRef(databasePath);
  databasePathRef.current = databasePath;

  useEffect(() => {
    let cancelled = false;
    setStore(null);
    setStatusNote(null);

    // flush is authoritative-local-first: write the local document (SQLite)
    // FIRST, then sync Neo4j best-effort. Neo4j failure never blocks — it only
    // marks the local row neo4j_synced=false and leaves a subtle status.
    const flush = async (body: string, summary: string): Promise<void> => {
      const dbPath = databasePathRef.current;
      let neo4jSynced = false;
      // Fire the Neo4j sync first so we can record its outcome in the local
      // row, but the local write is what determines durability.
      try {
        await transportRef.current.updateGraphNode({
          graphNodeId,
          patch: { body, summary } as GraphNodePatch,
        });
        neo4jSynced = true;
        if (!cancelled) {
          setStatusNote(null);
        }
      } catch (error) {
        neo4jSynced = false;
        if (!cancelled) {
          setStatusNote("Saved locally, sync pending");
        }
        console.warn("node document Neo4j sync failed; kept locally", error);
      }

      if (!dbPath) {
        // No local store available (e.g. no workspace db path). The Neo4j
        // write above is the only persistence; surface it non-blockingly.
        if (!neo4jSynced) {
          throw new Error("saved locally unavailable: no workspace database");
        }
        return;
      }

      // Authoritative local write. A failure here IS a real save failure and
      // must propagate so the doc store surfaces status="error".
      await transportRef.current.upsertLocalNodeDocument({
        databasePath: dbPath,
        graphNodeId,
        body,
        summary,
        neo4jSynced,
      });
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
        const localBody = local?.body ?? "";
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
              mounted.getState().setBody(node.body);
              void transportRef.current
                .upsertLocalNodeDocument({
                  databasePath,
                  graphNodeId,
                  body: node.body,
                  summary: node.summary ?? "",
                  neo4jSynced: true,
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
        // Local DB read itself failed: still mount an editable editor (empty
        // body) with a small non-blocking status — never a dead-end pane.
        console.warn("readLocalNodeDocument failed; mounting empty editor", error);
        setStatusNote("Local document unavailable");
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
}: {
  store: NodeDocumentStore;
  editable: boolean;
  statusNote: string | null;
  testSetBody?: string;
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
        editable={editable}
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

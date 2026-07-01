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
}

interface NodeDocumentPaneProps {
  graphNodeId: string;
  transport: NodeDocumentTransport;
  editable?: boolean;
  /**
   * Test-only: when set, renders a hidden button that pushes this body via
   * setBody so jsdom tests can drive a dirty-then-close flush. Never passed by
   * production callers.
   */
  __testSetBody?: string;
}

export function NodeDocumentPane({
  graphNodeId,
  transport,
  editable = true,
  __testSetBody,
}: NodeDocumentPaneProps) {
  const [store, setStore] = useState<NodeDocumentStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const transportRef = useRef(transport);
  transportRef.current = transport;

  useEffect(() => {
    let cancelled = false;
    setStore(null);
    setLoadError(null);

    transportRef.current
      .readGraphNode({ graphNodeId })
      .then((node) => {
        if (cancelled) {
          return;
        }
        const nextStore = createNodeDocumentStore({
          graphNodeId,
          initialBody: node.body,
          flush: async (body, summary) => {
            await transportRef.current.updateGraphNode({
              graphNodeId,
              patch: { body, summary } as GraphNodePatch,
            });
          },
        });
        setStore(nextStore);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setLoadError(
          error instanceof Error ? error.message : "failed to read node"
        );
      });

    return () => {
      cancelled = true;
    };
  }, [graphNodeId]);

  if (loadError) {
    return (
      <div className="node-document-pane node-document-pane--error" role="alert">
        {loadError}
      </div>
    );
  }

  if (!store) {
    return <div className="node-document-pane node-document-pane--loading">Loading…</div>;
  }

  return (
    <NodeDocumentBody store={store} editable={editable} testSetBody={__testSetBody} />
  );
}

function NodeDocumentBody({
  store,
  editable,
  testSetBody,
}: {
  store: NodeDocumentStore;
  editable: boolean;
  testSetBody?: string;
}) {
  const body = useStore(store, (state) => state.body);
  const status = useStore(store, (state) => state.status);
  const errorMessage = useStore(store, (state) => state.errorMessage);

  // Crash-safe flush-on-close (WS1 robustness bar (b)): write the dirty body on
  // window unload AND on unmount, and SURFACE failure rather than dropping it.
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
              : "Saved"}
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

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import type { GraphNode } from "@research-canvas/desktop-api";

import { NodeDocumentPane } from "./NodeDocumentPane";

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

function makeNode(body: string): GraphNode {
  return {
    graphNodeId: "n1",
    entityType: "Figure",
    title: "Test node",
    body,
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    ...EMPTY_GRAPH_NODE_METADATA,
    isTemporal: true,
    validFrom: null,
    validTo: null,
    temporalPrecision: null,
    createdAt: "2026-06-28T00:00:00Z",
    updatedAt: "2026-06-28T00:00:00Z",
  };
}

describe("NodeDocumentPane", () => {
  it("reads the node body and renders it in the editor", async () => {
    const body = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Loaded body", styles: {} }],
        children: [],
      },
    ]);
    const transport = {
      readLocalNodeDocument: vi
        .fn()
        .mockResolvedValue({ body, summary: "", neo4jSynced: true }),
      upsertLocalNodeDocument: vi.fn().mockResolvedValue(undefined),
      readGraphNode: vi.fn().mockResolvedValue(makeNode(body)),
      updateGraphNode: vi.fn().mockResolvedValue(makeNode(body)),
    };

    render(
      <NodeDocumentPane
        graphNodeId="n1"
        transport={transport}
        databasePath="/tmp/db.sqlite"
        editable={false}
      />
    );

    expect(transport.readLocalNodeDocument).toHaveBeenCalledWith({
      databasePath: "/tmp/db.sqlite",
      graphNodeId: "n1",
    });
    expect(await screen.findByText("Loaded body")).toBeInTheDocument();
  });

  it("mounts the editor from the LOCAL document even when readGraphNode rejects (no dead-end)", async () => {
    const localBody = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "LOCAL", styles: {} }],
        children: [],
      },
    ]);
    const transport = {
      // Local store is authoritative for mount — Neo4j is only a sync target.
      readLocalNodeDocument: vi
        .fn()
        .mockResolvedValue({ body: localBody, summary: "", neo4jSynced: false }),
      upsertLocalNodeDocument: vi.fn().mockResolvedValue(undefined),
      // Neo4j down / node never synced: the editor must NOT be blocked.
      readGraphNode: vi.fn().mockRejectedValue(new Error("read failed")),
      updateGraphNode: vi.fn().mockResolvedValue(makeNode(localBody)),
    };

    render(
      <NodeDocumentPane
        graphNodeId="n1"
        transport={transport}
        databasePath="/tmp/db.sqlite"
        editable={false}
      />
    );

    // The editor mounts showing the LOCAL body.
    expect(await screen.findByText("LOCAL")).toBeInTheDocument();
    expect(transport.readLocalNodeDocument).toHaveBeenCalledWith({
      databasePath: "/tmp/db.sqlite",
      graphNodeId: "n1",
    });
    // And there is NO full-pane "failed to read node" dead-end.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not let a slow reconcile clobber in-progress typing into an empty local doc", async () => {
    const neo4jBody = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "NEO4J BODY", styles: {} }],
        children: [],
      },
    ]);
    const typedBody = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "User typed this", styles: {} }],
        children: [],
      },
    ]);

    // The local document is empty at mount, so reconcile-from-Neo4j is
    // eligible to run. readGraphNode is held open (does not resolve) until
    // we explicitly release it below, simulating network latency.
    let releaseReadGraphNode: (node: GraphNode) => void = () => {};
    const readGraphNodePromise = new Promise<GraphNode>((resolve) => {
      releaseReadGraphNode = resolve;
    });
    const transport = {
      readLocalNodeDocument: vi
        .fn()
        .mockResolvedValue({ body: "", summary: "", neo4jSynced: false }),
      upsertLocalNodeDocument: vi.fn().mockResolvedValue(undefined),
      readGraphNode: vi.fn().mockReturnValue(readGraphNodePromise),
      updateGraphNode: vi.fn().mockResolvedValue(makeNode(typedBody)),
    };

    render(
      <NodeDocumentPane
        graphNodeId="n1"
        transport={transport}
        databasePath="/tmp/db.sqlite"
        __testSetBody={typedBody}
      />
    );

    // Wait for the (empty) editor to mount and reconcile's readGraphNode to
    // have been kicked off.
    await waitFor(() => expect(transport.readGraphNode).toHaveBeenCalled());

    // Simulate the user typing into the still-empty editor before the Neo4j
    // read resolves. (BlockNote itself is an uncontrolled editor once
    // mounted — the store's `body` field, not the rendered DOM, is the
    // source of truth the reconcile guard must respect.)
    fireEvent.click(screen.getByTestId("set-body"));

    // Now let the slow Neo4j read resolve with non-empty substance.
    releaseReadGraphNode(makeNode(neo4jBody));
    // Flush pending microtasks so the reconcile .then() handler runs (or is
    // skipped by the guard).
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Reconcile must NOT have persisted the Neo4j body over the user's
    // in-progress edit: only the typed body may ever be upserted.
    for (const call of transport.upsertLocalNodeDocument.mock.calls) {
      expect(call[0].body).not.toBe(neo4jBody);
    }
  });

  it("flush writes local first (authoritative), then syncs Neo4j best-effort", async () => {
    const localBody = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "LOCAL", styles: {} }],
        children: [],
      },
    ]);
    const edited = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Edited body", styles: {} }],
        children: [],
      },
    ]);
    const transport = {
      readLocalNodeDocument: vi
        .fn()
        .mockResolvedValue({ body: localBody, summary: "", neo4jSynced: true, contentRevision: 7, bodySourceCoordinates: ["source.md#p1"] }),
      upsertLocalNodeDocument: vi.fn().mockResolvedValue({ document: { contentRevision: 8 } }),
      readGraphNode: vi.fn().mockResolvedValue(makeNode(localBody)),
      updateGraphNode: vi.fn().mockResolvedValue(makeNode(edited)),
    };

    const { unmount } = render(
      <NodeDocumentPane
        graphNodeId="n1"
        transport={transport}
        databasePath="/tmp/db.sqlite"
        __testSetBody={edited}
      />
    );

    await screen.findByText("LOCAL");
    fireEvent.click(screen.getByTestId("set-body"));

    // Force a flush via the close path.
    unmount();

    await waitFor(() =>
      expect(transport.upsertLocalNodeDocument).toHaveBeenCalled()
    );
    expect(transport.upsertLocalNodeDocument.mock.calls[0]![0]).toEqual(expect.objectContaining({
      contentOrigin: "user_authored",
      expectedRevision: 7,
      contentRevision: 8,
      bodySourceCoordinates: ["source.md#p1"],
      neo4jSynced: false,
    }));
    // Local upsert is authoritative and happens with the edited body.
    expect(transport.upsertLocalNodeDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({
        databasePath: "/tmp/db.sqlite",
        graphNodeId: "n1",
        body: edited,
        contentRevision: 8,
        expectedRevision: 8,
        neo4jSynced: true,
      })
    );
    // Neo4j is still synced best-effort with the same body.
    await waitFor(() => expect(transport.updateGraphNode).toHaveBeenCalled());
    expect(transport.updateGraphNode).toHaveBeenLastCalledWith({
      graphNodeId: "n1",
      patch: expect.objectContaining({ body: edited, contentOrigin: "user_authored", contentRevision: 8 }),
    });
  });

  it("flushes the dirty body on unmount (crash-safe close flush)", async () => {
    const body = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Loaded body", styles: {} }],
        children: [],
      },
    ]);
    const edited = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Edited body", styles: {} }],
        children: [],
      },
    ]);
    const transport = {
      readLocalNodeDocument: vi
        .fn()
        .mockResolvedValue({ body, summary: "", neo4jSynced: true }),
      upsertLocalNodeDocument: vi.fn().mockResolvedValue(undefined),
      readGraphNode: vi.fn().mockResolvedValue(makeNode(body)),
      updateGraphNode: vi.fn().mockResolvedValue(makeNode(edited)),
    };

    const { unmount } = render(
      <NodeDocumentPane
        graphNodeId="n1"
        transport={transport}
        databasePath="/tmp/db.sqlite"
        __testSetBody={edited}
      />
    );

    // Wait for the editor to mount, then make a dirty edit that has NOT yet
    // been flushed by the debounce.
    await screen.findByText("Loaded body");
    fireEvent.click(screen.getByTestId("set-body"));

    // Closing the view must force a final write of the dirty body.
    unmount();

    await waitFor(() => expect(transport.updateGraphNode).toHaveBeenCalled());
    expect(transport.updateGraphNode).toHaveBeenLastCalledWith({
      graphNodeId: "n1",
      patch: expect.objectContaining({ body: edited }),
    });
  });

  it("surfaces a failed close flush instead of swallowing it", async () => {
    const body = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Loaded body", styles: {} }],
        children: [],
      },
    ]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const transport = {
      readLocalNodeDocument: vi
        .fn()
        .mockResolvedValue({ body, summary: "", neo4jSynced: true }),
      // Local upsert fails on the close write → the failure must be surfaced
      // (local is authoritative, so its failure is the one that matters).
      upsertLocalNodeDocument: vi
        .fn()
        .mockRejectedValue(new Error("close write failed")),
      readGraphNode: vi.fn().mockResolvedValue(makeNode(body)),
      updateGraphNode: vi.fn().mockResolvedValue(makeNode(body)),
    };

    const edited = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Edited body", styles: {} }],
        children: [],
      },
    ]);
    const { unmount } = render(
      <NodeDocumentPane
        graphNodeId="n1"
        transport={transport}
        databasePath="/tmp/db.sqlite"
        __testSetBody={edited}
      />
    );
    await screen.findByText("Loaded body");
    fireEvent.click(screen.getByTestId("set-body"));

    unmount();

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(errorSpy.mock.calls.flat().join(" ")).toMatch(/close write failed/i);
    errorSpy.mockRestore();
  });

  it("surfaces an ownership conflict and never syncs rejected content to Neo4j", async () => {
    const body = JSON.stringify([{ id: "b1", type: "paragraph", props: {}, content: [{ type: "text", text: "Stored", styles: {} }], children: [] }]);
    const edited = JSON.stringify([{ id: "b1", type: "paragraph", props: {}, content: [{ type: "text", text: "Stale edit", styles: {} }], children: [] }]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const transport = {
      readLocalNodeDocument: vi.fn().mockResolvedValue({ body, summary: "", neo4jSynced: true, contentRevision: 4 }),
      upsertLocalNodeDocument: vi.fn().mockResolvedValue({
        mutation: { kind: "conflict", current_revision: 5, reason: "expected revision does not match persisted revision" },
        document: { contentRevision: 5 },
      }),
      readGraphNode: vi.fn().mockResolvedValue(makeNode(body)),
      updateGraphNode: vi.fn().mockResolvedValue(makeNode(edited)),
    };
    const { unmount } = render(<NodeDocumentPane graphNodeId="n1" transport={transport} databasePath="/tmp/db.sqlite" __testSetBody={edited} />);
    await screen.findByText("Stored");
    fireEvent.click(screen.getByTestId("set-body"));
    unmount();
    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(transport.updateGraphNode).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls.flat().join(" ")).toMatch(/expected revision/i);
    errorSpy.mockRestore();
  });
});

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

  it("renders a portable attached-image path through the workspace asset protocol", async () => {
    const body = JSON.stringify([
      {
        id: "image-1",
        type: "image",
        props: { url: "assets/n1/cat.png", caption: "A cat" },
        content: [],
        children: [],
      },
    ]);
    const transport = {
      readLocalNodeDocument: vi.fn().mockResolvedValue({ body, summary: "", neo4jSynced: true }),
      upsertLocalNodeDocument: vi.fn().mockResolvedValue(undefined),
      readGraphNode: vi.fn().mockResolvedValue(makeNode(body)),
    };

    const { container } = render(
      <NodeDocumentPane
        graphNodeId="n1"
        transport={transport}
        databasePath="/tmp/db.sqlite"
        workspaceRoot="/workspace/project"
        editable={false}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('img[src="asset://localhost/workspace/project/assets/n1/cat.png"]')).not.toBeNull();
    });
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

  it("awaits one remote backfill, mounts it clean, and never emits a stale debounce write", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const neo4jBody = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "NEO4J BODY", styles: {} }],
        children: [],
      },
    ]);
    const remote = {
      ...makeNode(neo4jBody),
      contentOrigin: "user_authored" as const,
      contentRevision: 3,
      bodySourceCoordinates: ["research.md#remote"],
    };
    const transport = {
      readLocalNodeDocument: vi
        .fn()
        .mockResolvedValue(null),
      upsertLocalNodeDocument: vi.fn().mockResolvedValue({
        mutation: { kind: "created" },
        document: {
          body: neo4jBody,
          contentRevision: 3,
          contentOrigin: "user_authored",
          bodySourceCoordinates: ["research.md#remote"],
        },
      }),
      readGraphNode: vi.fn().mockResolvedValue(remote),
      updateGraphNode: vi.fn().mockResolvedValue(remote),
      compareAndSwapGraphNodeContent: vi.fn(),
      acknowledgeLocalNodeDocumentSync: vi.fn(),
    };

    try {
      render(
        <NodeDocumentPane
          graphNodeId="n1"
          transport={transport}
          databasePath="/tmp/db.sqlite"
          editable={false}
        />
      );

      expect(await screen.findByText("NEO4J BODY")).toBeInTheDocument();
      expect(transport.upsertLocalNodeDocument).toHaveBeenCalledTimes(1);
      expect(transport.upsertLocalNodeDocument).toHaveBeenCalledWith(expect.objectContaining({
        body: neo4jBody,
        contentRevision: 3,
        neo4jSynced: true,
      }));

      await vi.advanceTimersByTimeAsync(1_000);
      expect(transport.upsertLocalNodeDocument).toHaveBeenCalledTimes(1);
      expect(transport.compareAndSwapGraphNodeContent).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("mounts an existing empty user document immediately and saves locally without waiting for remote", async () => {
    const edited = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Fresh local note", styles: {} }],
        children: [],
      },
    ]);
    const neverResolvingRemote = new Promise<GraphNode>(() => {});
    const transport = {
      readLocalNodeDocument: vi.fn().mockResolvedValue({
        body: "",
        summary: "",
        neo4jSynced: false,
        contentOrigin: "user_authored",
        contentRevision: 0,
        bodySourceCoordinates: [],
      }),
      upsertLocalNodeDocument: vi.fn().mockResolvedValue({
        mutation: { kind: "updated" },
        document: { contentRevision: 1 },
      }),
      readGraphNode: vi.fn().mockReturnValue(neverResolvingRemote),
      updateGraphNode: vi.fn(),
      compareAndSwapGraphNodeContent: vi.fn(),
      acknowledgeLocalNodeDocumentSync: vi.fn(),
    };

    const { unmount } = render(
      <NodeDocumentPane
        graphNodeId="n1"
        transport={transport}
        databasePath="/tmp/db.sqlite"
        __testSetBody={edited}
      />
    );

    expect(await screen.findByTestId("set-body")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("set-body"));
    unmount();

    await waitFor(() => expect(transport.upsertLocalNodeDocument).toHaveBeenCalledTimes(1));
    expect(transport.upsertLocalNodeDocument).toHaveBeenCalledWith(expect.objectContaining({
      body: edited,
      expectedRevision: 0,
      contentRevision: 1,
      contentOrigin: "user_authored",
      neo4jSynced: false,
    }));
    expect(transport.compareAndSwapGraphNodeContent).not.toHaveBeenCalled();
  });

  it("projects absent-local backfill metadata, then edits through remote CAS and local acknowledgement without revision drift", async () => {
    const remoteBody = JSON.stringify([{ id: "b1", type: "paragraph", props: {}, content: [{ type: "text", text: "Imported body", styles: {} }], children: [] }]);
    const edited = JSON.stringify([{ id: "b1", type: "paragraph", props: {}, content: [{ type: "text", text: "Authored edit", styles: {} }], children: [] }]);
    const remote = {
      ...makeNode(remoteBody),
      entityType: "Figure" as const,
      title: "Imported figure",
      contentOrigin: "imported" as const,
      contentRevision: 3,
      bodySourceCoordinates: ["remote.md#body"],
    };
    const transport = {
      readLocalNodeDocument: vi.fn().mockResolvedValue(null),
      upsertLocalNodeDocument: vi
        .fn()
        .mockResolvedValueOnce({
          mutation: { kind: "created" },
          document: {
            graphNodeId: "n1",
            body: remoteBody,
            summary: "",
            neo4jSynced: true,
            contentOrigin: "imported",
            contentRevision: 3,
            bodySourceCoordinates: ["remote.md#body"],
          },
        })
        .mockResolvedValueOnce({
          mutation: { kind: "updated" },
          document: {
            graphNodeId: "n1",
            body: edited,
            summary: "",
            neo4jSynced: false,
            contentOrigin: "user_authored",
            contentRevision: 4,
            bodySourceCoordinates: ["remote.md#body"],
          },
        }),
      readGraphNode: vi.fn().mockResolvedValue(remote),
      updateGraphNode: vi.fn(),
      compareAndSwapGraphNodeContent: vi.fn().mockResolvedValue({ kind: "updated" }),
      acknowledgeLocalNodeDocumentSync: vi.fn().mockResolvedValue({ kind: "updated" }),
    };

    const { unmount } = render(
      <NodeDocumentPane graphNodeId="n1" transport={transport} databasePath="/tmp/db.sqlite" __testSetBody={edited} />
    );
    expect(await screen.findByText("Imported body")).toBeInTheDocument();
    expect(transport.upsertLocalNodeDocument.mock.calls[0]![0]).toEqual(expect.objectContaining({
      body: remoteBody,
      contentOrigin: "imported",
      contentRevision: 3,
      neo4jSynced: true,
      metadataProjection: {
        entityType: "Figure",
        title: "Imported figure",
        schemaVersion: 1,
      },
    }));

    fireEvent.click(screen.getByTestId("set-body"));
    unmount();
    await waitFor(() => expect(transport.acknowledgeLocalNodeDocumentSync).toHaveBeenCalledTimes(1));

    expect(transport.upsertLocalNodeDocument.mock.calls[1]![0]).toEqual(expect.objectContaining({
      expectedRevision: 3,
      contentRevision: 4,
      contentOrigin: "user_authored",
      neo4jSynced: false,
    }));
    expect(transport.compareAndSwapGraphNodeContent).toHaveBeenCalledWith(expect.objectContaining({
      expectedRemoteRevision: 3,
      expectedRemoteOrigin: "imported",
      contentRevision: 4,
      contentOrigin: "user_authored",
    }));
    expect(transport.acknowledgeLocalNodeDocumentSync).toHaveBeenCalledWith({
      databasePath: "/tmp/db.sqlite",
      graphNodeId: "n1",
      expectedRevision: 4,
      expectedOrigin: "user_authored",
    });
    expect(transport.upsertLocalNodeDocument).toHaveBeenCalledTimes(2);
  });

  it("materializes an empty remote revision zero exactly before editing to revision one", async () => {
    const remoteBody = "[]";
    const edited = JSON.stringify([{ id: "b1", type: "paragraph", props: {}, content: [{ type: "text", text: "First authored text", styles: {} }], children: [] }]);
    const remote = {
      ...makeNode(remoteBody),
      title: "Empty imported note",
      contentOrigin: "imported" as const,
      contentRevision: 0,
      bodySourceCoordinates: ["remote.md#empty"],
    };
    const transport = {
      readLocalNodeDocument: vi.fn().mockResolvedValue(null),
      upsertLocalNodeDocument: vi
        .fn()
        .mockResolvedValueOnce({
          mutation: { kind: "created" },
          document: {
            graphNodeId: "n1",
            body: remoteBody,
            summary: "",
            neo4jSynced: true,
            contentOrigin: "imported",
            contentRevision: 0,
            bodySourceCoordinates: ["remote.md#empty"],
          },
        })
        .mockResolvedValueOnce({
          mutation: { kind: "updated" },
          document: {
            graphNodeId: "n1",
            body: edited,
            summary: "",
            neo4jSynced: false,
            contentOrigin: "user_authored",
            contentRevision: 1,
            bodySourceCoordinates: ["remote.md#empty"],
          },
        }),
      readGraphNode: vi.fn().mockResolvedValue(remote),
      updateGraphNode: vi.fn(),
      compareAndSwapGraphNodeContent: vi.fn().mockResolvedValue({ kind: "updated" }),
      acknowledgeLocalNodeDocumentSync: vi.fn().mockResolvedValue({ kind: "updated" }),
    };

    const { unmount } = render(
      <NodeDocumentPane graphNodeId="n1" transport={transport} databasePath="/tmp/db.sqlite" __testSetBody={edited} />
    );
    expect(await screen.findByTestId("set-body")).toBeInTheDocument();
    expect(transport.upsertLocalNodeDocument.mock.calls[0]![0]).toEqual(expect.objectContaining({
      body: "[]",
      contentOrigin: "imported",
      contentRevision: 0,
      neo4jSynced: true,
      metadataProjection: {
        entityType: "Figure",
        title: "Empty imported note",
        schemaVersion: 1,
      },
    }));

    fireEvent.click(screen.getByTestId("set-body"));
    unmount();
    await waitFor(() => expect(transport.acknowledgeLocalNodeDocumentSync).toHaveBeenCalledTimes(1));

    expect(transport.upsertLocalNodeDocument.mock.calls[1]![0]).toEqual(expect.objectContaining({
      body: edited,
      expectedRevision: 0,
      contentRevision: 1,
      contentOrigin: "user_authored",
    }));
    expect(transport.compareAndSwapGraphNodeContent).toHaveBeenCalledWith(expect.objectContaining({
      expectedRemoteRevision: 0,
      expectedRemoteOrigin: "imported",
      contentRevision: 1,
    }));
    expect(transport.acknowledgeLocalNodeDocumentSync).toHaveBeenCalledWith(expect.objectContaining({
      expectedRevision: 1,
      expectedOrigin: "user_authored",
    }));
    expect(transport.upsertLocalNodeDocument).toHaveBeenCalledTimes(2);
  });

  it("keeps the last-known remote revision after a failed CAS while local revisions advance", async () => {
    const body = JSON.stringify([{ id: "b1", type: "paragraph", props: {}, content: [{ type: "text", text: "Stored", styles: {} }], children: [] }]);
    const edit8 = JSON.stringify([{ id: "b1", type: "paragraph", props: {}, content: [{ type: "text", text: "Edit 8", styles: {} }], children: [] }]);
    const edit9 = JSON.stringify([{ id: "b1", type: "paragraph", props: {}, content: [{ type: "text", text: "Edit 9", styles: {} }], children: [] }]);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const remote = { ...makeNode(body), contentOrigin: "user_authored" as const, contentRevision: 7 };
    const transport = {
      readLocalNodeDocument: vi.fn().mockResolvedValue({
        body,
        summary: "",
        neo4jSynced: false,
        contentOrigin: "user_authored",
        contentRevision: 7,
      }),
      upsertLocalNodeDocument: vi
        .fn()
        .mockResolvedValueOnce({ mutation: { kind: "updated" }, document: { contentRevision: 8 } })
        .mockResolvedValueOnce({ mutation: { kind: "updated" }, document: { contentRevision: 9 } }),
      readGraphNode: vi.fn().mockResolvedValue(remote),
      updateGraphNode: vi.fn(),
      compareAndSwapGraphNodeContent: vi
        .fn()
        .mockResolvedValueOnce({ kind: "conflict", reason: "remote busy" })
        .mockResolvedValueOnce({ kind: "updated" }),
      acknowledgeLocalNodeDocumentSync: vi.fn().mockResolvedValue({ kind: "updated" }),
    };

    const { rerender } = render(
      <NodeDocumentPane graphNodeId="n1" transport={transport} databasePath="/tmp/db.sqlite" __testSetBody={edit8} />
    );
    await screen.findByText("Stored");
    await waitFor(() => expect(transport.readGraphNode).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId("set-body"));
    await waitFor(() => expect(transport.compareAndSwapGraphNodeContent).toHaveBeenCalledTimes(1));

    rerender(
      <NodeDocumentPane graphNodeId="n1" transport={transport} databasePath="/tmp/db.sqlite" __testSetBody={edit9} />
    );
    fireEvent.click(screen.getByTestId("set-body"));
    await waitFor(() => expect(transport.compareAndSwapGraphNodeContent).toHaveBeenCalledTimes(2));

    expect(transport.upsertLocalNodeDocument.mock.calls.map(([input]) => [input.expectedRevision, input.contentRevision]))
      .toEqual([[7, 8], [8, 9]]);
    expect(transport.compareAndSwapGraphNodeContent.mock.calls.map(([input]) => [
      input.expectedRemoteRevision,
      input.contentRevision,
    ])).toEqual([[7, 8], [7, 9]]);
    expect(transport.acknowledgeLocalNodeDocumentSync).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 9 }));
    warnSpy.mockRestore();
  });

  it("ignores a delayed absent-local backfill from the previous node generation", async () => {
    const bodyB = JSON.stringify([{ id: "b1", type: "paragraph", props: {}, content: [{ type: "text", text: "Node B", styles: {} }], children: [] }]);
    const editB = JSON.stringify([{ id: "b1", type: "paragraph", props: {}, content: [{ type: "text", text: "Node B edit", styles: {} }], children: [] }]);
    let releaseA: (node: GraphNode) => void = () => {};
    const delayedA = new Promise<GraphNode>((resolve) => { releaseA = resolve; });
    const transport = {
      readLocalNodeDocument: vi.fn(({ graphNodeId }: { graphNodeId: string }) => Promise.resolve(
        graphNodeId === "A" ? null : {
          graphNodeId: "B", body: bodyB, summary: "", neo4jSynced: true,
          contentOrigin: "user_authored" as const, contentRevision: 5, bodySourceCoordinates: [],
        }
      )),
      upsertLocalNodeDocument: vi.fn().mockResolvedValue({
        mutation: { kind: "updated" },
        document: { graphNodeId: "B", body: editB, summary: "", neo4jSynced: false, contentOrigin: "user_authored", contentRevision: 6, bodySourceCoordinates: [] },
      }),
      readGraphNode: vi.fn(({ graphNodeId }: { graphNodeId: string }) => graphNodeId === "A"
        ? delayedA
        : Promise.resolve({ ...makeNode(bodyB), graphNodeId: "B", contentOrigin: "user_authored" as const, contentRevision: 5 })),
      updateGraphNode: vi.fn(),
      compareAndSwapGraphNodeContent: vi.fn().mockResolvedValue({ kind: "updated" }),
      acknowledgeLocalNodeDocumentSync: vi.fn().mockResolvedValue({ kind: "updated" }),
    };

    const { rerender, unmount } = render(
      <NodeDocumentPane graphNodeId="A" transport={transport} databasePath="/tmp/db.sqlite" />
    );
    await waitFor(() => expect(transport.readGraphNode).toHaveBeenCalledWith({ graphNodeId: "A" }));
    rerender(
      <NodeDocumentPane graphNodeId="B" transport={transport} databasePath="/tmp/db.sqlite" __testSetBody={editB} />
    );
    expect(await screen.findByText("Node B")).toBeInTheDocument();

    releaseA({ ...makeNode("[]"), graphNodeId: "A", title: "Late A", contentOrigin: "imported", contentRevision: 2 });
    await Promise.resolve();
    await Promise.resolve();
    expect(transport.upsertLocalNodeDocument).not.toHaveBeenCalled();
    expect(screen.queryByText("Late A")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("set-body"));
    unmount();
    await waitFor(() => expect(transport.compareAndSwapGraphNodeContent).toHaveBeenCalledTimes(1));
    expect(transport.compareAndSwapGraphNodeContent).toHaveBeenCalledWith(expect.objectContaining({
      graphNodeId: "B",
      expectedRemoteRevision: 5,
      expectedRemoteOrigin: "user_authored",
      contentRevision: 6,
    }));
  });

  it("ignores a delayed unsynced-local remote lookup from the previous node generation", async () => {
    const bodyA = JSON.stringify([{ id: "a", type: "paragraph", props: {}, content: [{ type: "text", text: "Node A", styles: {} }], children: [] }]);
    const bodyB = JSON.stringify([{ id: "b", type: "paragraph", props: {}, content: [{ type: "text", text: "Pending B", styles: {} }], children: [] }]);
    const editB = JSON.stringify([{ id: "b", type: "paragraph", props: {}, content: [{ type: "text", text: "Pending B edit", styles: {} }], children: [] }]);
    let releaseA: (node: GraphNode) => void = () => {};
    const delayedA = new Promise<GraphNode>((resolve) => { releaseA = resolve; });
    const transport = {
      readLocalNodeDocument: vi.fn(({ graphNodeId }: { graphNodeId: string }) => Promise.resolve({
        graphNodeId,
        body: graphNodeId === "A" ? bodyA : bodyB,
        summary: "",
        neo4jSynced: false,
        contentOrigin: "user_authored" as const,
        contentRevision: graphNodeId === "A" ? 1 : 9,
        bodySourceCoordinates: [],
      })),
      upsertLocalNodeDocument: vi.fn().mockResolvedValue({
        mutation: { kind: "updated" },
        document: { graphNodeId: "B", body: editB, summary: "", neo4jSynced: false, contentOrigin: "user_authored", contentRevision: 10, bodySourceCoordinates: [] },
      }),
      readGraphNode: vi.fn(({ graphNodeId }: { graphNodeId: string }) => graphNodeId === "A"
        ? delayedA
        : Promise.resolve({ ...makeNode(bodyB), graphNodeId: "B", contentOrigin: "user_authored" as const, contentRevision: 9 })),
      updateGraphNode: vi.fn(),
      compareAndSwapGraphNodeContent: vi.fn().mockResolvedValue({ kind: "updated" }),
      acknowledgeLocalNodeDocumentSync: vi.fn().mockResolvedValue({ kind: "updated" }),
    };

    const { rerender, unmount } = render(
      <NodeDocumentPane graphNodeId="A" transport={transport} databasePath="/tmp/db.sqlite" />
    );
    expect(await screen.findByText("Node A")).toBeInTheDocument();
    rerender(
      <NodeDocumentPane graphNodeId="B" transport={transport} databasePath="/tmp/db.sqlite" __testSetBody={editB} />
    );
    expect(await screen.findByText("Pending B")).toBeInTheDocument();
    await waitFor(() => expect(transport.readGraphNode).toHaveBeenCalledWith({ graphNodeId: "B" }));
    await Promise.resolve();

    releaseA({ ...makeNode(bodyA), graphNodeId: "A", contentOrigin: "user_authored", contentRevision: 1 });
    await Promise.resolve();
    await Promise.resolve();
    fireEvent.click(screen.getByTestId("set-body"));
    unmount();

    await waitFor(() => expect(transport.compareAndSwapGraphNodeContent).toHaveBeenCalledTimes(1));
    expect(transport.compareAndSwapGraphNodeContent).toHaveBeenCalledWith(expect.objectContaining({
      graphNodeId: "B",
      expectedRemoteRevision: 9,
      expectedRemoteOrigin: "user_authored",
      contentRevision: 10,
    }));
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
        .mockResolvedValue({ body: localBody, summary: "", neo4jSynced: true, contentOrigin: "user_authored", contentRevision: 7, bodySourceCoordinates: ["source.md#p1"] }),
      upsertLocalNodeDocument: vi.fn().mockResolvedValue({ document: { contentRevision: 8 } }),
      readGraphNode: vi.fn().mockResolvedValue(makeNode(localBody)),
      updateGraphNode: vi.fn().mockResolvedValue(makeNode(edited)),
      compareAndSwapGraphNodeContent: vi.fn().mockResolvedValue({ kind: "updated" }),
      acknowledgeLocalNodeDocumentSync: vi.fn().mockResolvedValue({ kind: "updated" }),
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
    expect(transport.upsertLocalNodeDocument).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(transport.compareAndSwapGraphNodeContent).toHaveBeenCalled());
    expect(transport.compareAndSwapGraphNodeContent).toHaveBeenLastCalledWith(expect.objectContaining({
      graphNodeId: "n1", body: edited, expectedRemoteRevision: 7,
      expectedRemoteOrigin: "user_authored", contentRevision: 8,
    }));
    expect(transport.acknowledgeLocalNodeDocumentSync).toHaveBeenCalledWith({
      databasePath: "/tmp/db.sqlite", graphNodeId: "n1", expectedRevision: 8,
      expectedOrigin: "user_authored",
    });
    expect(transport.updateGraphNode).not.toHaveBeenCalled();
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
        .mockResolvedValue({ body, summary: "", neo4jSynced: true, contentOrigin: "user_authored", contentRevision: 3 }),
      upsertLocalNodeDocument: vi.fn().mockResolvedValue({ document: { contentRevision: 4 } }),
      readGraphNode: vi.fn().mockResolvedValue(makeNode(body)),
      updateGraphNode: vi.fn().mockResolvedValue(makeNode(edited)),
      compareAndSwapGraphNodeContent: vi.fn().mockResolvedValue({ kind: "updated" }),
      acknowledgeLocalNodeDocumentSync: vi.fn().mockResolvedValue({ kind: "updated" }),
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

    await waitFor(() => expect(transport.compareAndSwapGraphNodeContent).toHaveBeenCalled());
    expect(transport.updateGraphNode).not.toHaveBeenCalled();
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

  it("surfaces a concurrent-edit acknowledgement conflict and never uses the unsafe updater", async () => {
    const body = JSON.stringify([{ id: "b1", type: "paragraph", props: {}, content: [{ type: "text", text: "Stored", styles: {} }], children: [] }]);
    const edited = JSON.stringify([{ id: "b1", type: "paragraph", props: {}, content: [{ type: "text", text: "Edit 8", styles: {} }], children: [] }]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const transport = {
      readLocalNodeDocument: vi.fn().mockResolvedValue({ body, summary: "", neo4jSynced: true, contentOrigin: "user_authored", contentRevision: 7 }),
      upsertLocalNodeDocument: vi.fn().mockResolvedValue({ mutation: { kind: "updated" }, document: { contentRevision: 8 } }),
      readGraphNode: vi.fn().mockResolvedValue(makeNode(body)),
      updateGraphNode: vi.fn().mockResolvedValue(makeNode(edited)),
      compareAndSwapGraphNodeContent: vi.fn().mockResolvedValue({ kind: "updated" }),
      acknowledgeLocalNodeDocumentSync: vi.fn().mockResolvedValue({ kind: "conflict", reason: "local document changed before remote sync acknowledgement" }),
    };
    const { unmount } = render(<NodeDocumentPane graphNodeId="n1" transport={transport} databasePath="/tmp/db.sqlite" __testSetBody={edited} />);
    await screen.findByText("Stored");
    fireEvent.click(screen.getByTestId("set-body"));
    unmount();
    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(errorSpy.mock.calls.flat().join(" ")).toMatch(/changed before remote sync acknowledgement/i);
    expect(transport.updateGraphNode).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("never writes remote body content when the local authority is unavailable", async () => {
    const edited = JSON.stringify([{ id: "b1", type: "paragraph", props: {}, content: [{ type: "text", text: "Unsafe", styles: {} }], children: [] }]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const transport = {
      readLocalNodeDocument: vi.fn(), upsertLocalNodeDocument: vi.fn(),
      readGraphNode: vi.fn(), updateGraphNode: vi.fn(),
      compareAndSwapGraphNodeContent: vi.fn(), acknowledgeLocalNodeDocumentSync: vi.fn(),
    };
    const { unmount } = render(<NodeDocumentPane graphNodeId="n1" transport={transport} databasePath={null} __testSetBody={edited} />);
    await screen.findByText("Local document unavailable — read-only");
    fireEvent.click(screen.getByTestId("set-body"));
    unmount();
    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(transport.upsertLocalNodeDocument).not.toHaveBeenCalled();
    expect(transport.compareAndSwapGraphNodeContent).not.toHaveBeenCalled();
    expect(transport.updateGraphNode).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

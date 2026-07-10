import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildNewGraphNodeInput, seedNoteNodeEffects } from "./nodeCreation";
import {
  isGraphNodeSyncPending,
  pendingGraphNodeSyncCount,
  resetPendingGraphNodeSync,
  retryPendingGraphNodeSyncs,
} from "./pendingGraphNodeSync";

describe("buildNewGraphNodeInput", () => {
  it("maps a note to a Work entity type with empty body", () => {
    const result = buildNewGraphNodeInput({ nodeType: "note", title: "T" });
    expect(result).toEqual({
      entityType: "Work",
      title: "T",
      body: "[]",
      isTemporal: false,
      sourceCoordinates: [],
      contentOrigin: "user_authored",
      contentRevision: 0,
      bodySourceCoordinates: [],
    });
  });

  it("maps a group to a Work entity type with empty body", () => {
    const result = buildNewGraphNodeInput({ nodeType: "group", title: "G" });
    expect(result).toEqual({
      entityType: "Work",
      title: "G",
      body: "[]",
      isTemporal: false,
      sourceCoordinates: [],
      contentOrigin: "user_authored",
      contentRevision: 0,
      bodySourceCoordinates: [],
    });
  });

  it("maps a resource to a Source entity type with empty body", () => {
    const result = buildNewGraphNodeInput({ nodeType: "resource", title: "R" });
    expect(result).toEqual({
      entityType: "Source",
      title: "R",
      body: "[]",
      isTemporal: false,
      sourceCoordinates: [],
      contentOrigin: "user_authored",
      contentRevision: 0,
      bodySourceCoordinates: [],
    });
  });
});

describe("seedNoteNodeEffects", () => {
  beforeEach(() => {
    resetPendingGraphNodeSync();
  });

  it("seeds a local node document with the node's graphNodeId and empty body/summary", async () => {
    const upsertLocalNodeDocument = vi.fn().mockResolvedValue(undefined);
    const createGraphNode = vi.fn().mockResolvedValue({});

    await seedNoteNodeEffects({
      graphNodeId: "node-1",
      title: "Untitled note",
      databasePath: "/db/path.sqlite",
      upsertLocalNodeDocument,
      createGraphNode,
    });

    expect(upsertLocalNodeDocument).toHaveBeenCalledWith({
      databasePath: "/db/path.sqlite",
      graphNodeId: "node-1",
      body: "",
      summary: "",
      contentOrigin: "user_authored",
      contentRevision: 0,
      bodySourceCoordinates: [],
    });

    expect(createGraphNode).toHaveBeenCalledWith(expect.objectContaining({
      graphNodeId: "node-1",
      contentOrigin: "user_authored",
      contentRevision: 0,
      bodySourceCoordinates: [],
    }));
  });

  it("skips seeding the local document gracefully when databasePath is null", async () => {
    const upsertLocalNodeDocument = vi.fn().mockResolvedValue(undefined);
    const createGraphNode = vi.fn().mockResolvedValue({});

    await expect(
      seedNoteNodeEffects({
        graphNodeId: "node-1",
        title: "Untitled note",
        databasePath: null,
        upsertLocalNodeDocument,
        createGraphNode,
      })
    ).resolves.toBeUndefined();

    expect(upsertLocalNodeDocument).not.toHaveBeenCalled();
    expect(createGraphNode).toHaveBeenCalled();
  });

  it("still creates the graph node even if upsertLocalNodeDocument fails", async () => {
    const upsertLocalNodeDocument = vi.fn().mockRejectedValue(new Error("sqlite busy"));
    const createGraphNode = vi.fn().mockResolvedValue({});

    await expect(
      seedNoteNodeEffects({
        graphNodeId: "node-1",
        title: "Untitled note",
        databasePath: "/db/path.sqlite",
        upsertLocalNodeDocument,
        createGraphNode,
      })
    ).resolves.toBeUndefined();

    expect(createGraphNode).toHaveBeenCalled();
  });

  it("records the node as pending sync when createGraphNode fails, and never throws", async () => {
    const upsertLocalNodeDocument = vi.fn().mockResolvedValue(undefined);
    const createGraphNode = vi.fn().mockRejectedValue(new Error("neo4j down"));

    await expect(
      seedNoteNodeEffects({
        graphNodeId: "node-2",
        title: "Untitled note",
        databasePath: "/db/path.sqlite",
        upsertLocalNodeDocument,
        createGraphNode,
      })
    ).resolves.toBeUndefined();

    expect(isGraphNodeSyncPending("node-2")).toBe(true);
  });

  it("does not record the node as pending when createGraphNode succeeds", async () => {
    const upsertLocalNodeDocument = vi.fn().mockResolvedValue(undefined);
    const createGraphNode = vi.fn().mockResolvedValue({});

    await seedNoteNodeEffects({
      graphNodeId: "node-3",
      title: "Untitled note",
      databasePath: "/db/path.sqlite",
      upsertLocalNodeDocument,
      createGraphNode,
    });

    expect(isGraphNodeSyncPending("node-3")).toBe(false);
  });
});

describe("retryPendingGraphNodeSyncs", () => {
  beforeEach(() => {
    resetPendingGraphNodeSync();
  });

  it("clears a node from pending once its retried createGraphNode call succeeds", async () => {
    const createGraphNode = vi
      .fn()
      .mockRejectedValueOnce(new Error("neo4j down"))
      .mockResolvedValueOnce({});

    await seedNoteNodeEffects({
      graphNodeId: "node-4",
      title: "Untitled note",
      databasePath: "/db/path.sqlite",
      upsertLocalNodeDocument: vi.fn().mockResolvedValue(undefined),
      createGraphNode,
    });
    expect(isGraphNodeSyncPending("node-4")).toBe(true);

    await retryPendingGraphNodeSyncs(createGraphNode);

    expect(isGraphNodeSyncPending("node-4")).toBe(false);
    expect(createGraphNode).toHaveBeenCalledTimes(2);
  });

  it("keeps a node pending if the retry attempt also fails", async () => {
    const createGraphNode = vi.fn().mockRejectedValue(new Error("still down"));

    await seedNoteNodeEffects({
      graphNodeId: "node-5",
      title: "Untitled note",
      databasePath: "/db/path.sqlite",
      upsertLocalNodeDocument: vi.fn().mockResolvedValue(undefined),
      createGraphNode,
    });
    expect(pendingGraphNodeSyncCount()).toBe(1);

    await retryPendingGraphNodeSyncs(createGraphNode);

    expect(isGraphNodeSyncPending("node-5")).toBe(true);
    expect(pendingGraphNodeSyncCount()).toBe(1);
  });
});

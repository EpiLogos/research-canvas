import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildNewGraphNodeInput, seedNoteNodeEffects } from "./nodeCreation";
import {
  isGraphNodeSyncPending,
  pendingGraphNodeSyncCount,
  resetPendingGraphNodeSync,
  retryPendingGraphNodeSyncs,
} from "./pendingGraphNodeSync";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildNewGraphNodeInput", () => {
  it("maps a note to a Work entity type with empty body", () => {
    const result = buildNewGraphNodeInput({ nodeType: "note", title: "T" });
    expect(result).toEqual({
      entityType: "Work",
      title: "T",
      body: "[]",
      isTemporal: false,
      sourceCoordinates: [],
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
    });
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
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

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
    expect(warn).toHaveBeenCalledWith(
      "upsertLocalNodeDocument failed; note kept locally without a seeded doc row",
      expect.any(Error)
    );
  });

  it("records the node as pending sync when createGraphNode fails, and never throws", async () => {
    const upsertLocalNodeDocument = vi.fn().mockResolvedValue(undefined);
    const createGraphNode = vi.fn().mockRejectedValue(new Error("neo4j down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

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
    expect(warn).toHaveBeenCalledWith(
      "createGraphNode sync failed; node kept locally",
      expect.any(Error)
    );
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
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

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
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "createGraphNode sync failed; node kept locally",
      expect.any(Error)
    );
  });

  it("keeps a node pending if the retry attempt also fails", async () => {
    const createGraphNode = vi.fn().mockRejectedValue(new Error("still down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

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
    expect(warn).toHaveBeenCalledWith(
      "createGraphNode sync failed; node kept locally",
      expect.any(Error)
    );
    expect(warn).toHaveBeenCalledWith(
      "retryPendingGraphNodeSyncs: createGraphNode still failing; node kept pending",
      "node-5",
      expect.any(Error)
    );
  });
});

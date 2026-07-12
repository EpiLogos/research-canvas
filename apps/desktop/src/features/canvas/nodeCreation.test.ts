import { describe, expect, it, vi, beforeEach } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import type { GraphNode } from "@research-canvas/desktop-api";
import { buildNewGraphNodeInput, createPreparedNoteNode, seedNoteNodeEffects, syncNoteNodeRemote } from "./nodeCreation";
import {
  canPromoteRemoteContent,
  isGraphNodeSyncPending,
  pendingGraphNodeSyncCount,
  rehydratePendingGraphNodeSyncs,
  resetPendingGraphNodeSync,
  retryPendingGraphNodeSyncs,
  startDurablePendingGraphNodeSyncRetryInterval,
} from "./pendingGraphNodeSync";

const createdLocal = (graphNodeId: string) => ({
  mutation: { kind: "created" as const },
  document: {
    graphNodeId, body: "", summary: "", neo4jSynced: false,
    contentOrigin: "user_authored" as const, contentRevision: 0,
    bodySourceCoordinates: [],
  },
});
const ackSynced = () => vi.fn().mockResolvedValue({ kind: "updated" as const });
const remoteNode = (graphNodeId: string, revision = 0, body = ""): GraphNode => ({
  graphNodeId, entityType: "Work", title: "Untitled note", body, summary: "",
  archetypalResonance: null, coordinate: null, sourceCoordinates: [],
  ...EMPTY_GRAPH_NODE_METADATA, contentOrigin: "user_authored", contentRevision: revision,
  bodySourceCoordinates: [], isTemporal: false, validFrom: null, validTo: null,
  temporalPrecision: null, createdAt: "now", updatedAt: "now",
});
const localDocument = (graphNodeId: string, revision = 0, body = "") => ({
  ...createdLocal(graphNodeId).document,
  body,
  contentRevision: revision,
  neo4jSynced: false,
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
    const upsertLocalNodeDocument = vi.fn().mockResolvedValue(createdLocal("node-1"));
    const createGraphNode = vi.fn().mockResolvedValue({});

    await seedNoteNodeEffects({
      graphNodeId: "node-1",
      title: "Untitled note",
      databasePath: "/db/path.sqlite",
      upsertLocalNodeDocument,
      createGraphNode,
      acknowledgeLocalNodeDocumentSync: ackSynced(),
    });

    expect(upsertLocalNodeDocument).toHaveBeenCalledWith({
      databasePath: "/db/path.sqlite",
      graphNodeId: "node-1",
      body: "",
      summary: "",
      contentOrigin: "user_authored",
      contentRevision: 0,
      bodySourceCoordinates: [],
      metadataProjection: { entityType: "Work", title: "Untitled note", schemaVersion: 1 },
    });

    expect(createGraphNode).toHaveBeenCalledWith(expect.objectContaining({
      graphNodeId: "node-1",
      body: "",
      contentOrigin: "user_authored",
      contentRevision: 0,
      bodySourceCoordinates: [],
    }));
  });

  it("fails closed before remote creation when databasePath is null", async () => {
    const upsertLocalNodeDocument = vi.fn().mockResolvedValue(createdLocal("node-1"));
    const createGraphNode = vi.fn().mockResolvedValue({});

    await expect(
      seedNoteNodeEffects({
        graphNodeId: "node-1",
        title: "Untitled note",
        databasePath: null,
        upsertLocalNodeDocument,
        createGraphNode,
        acknowledgeLocalNodeDocumentSync: ackSynced(),
      })
    ).rejects.toThrow(/authoritative local document store/);

    expect(upsertLocalNodeDocument).not.toHaveBeenCalled();
    expect(createGraphNode).not.toHaveBeenCalled();
  });

  it("fails closed before remote creation if authoritative local creation fails", async () => {
    const upsertLocalNodeDocument = vi.fn().mockRejectedValue(new Error("sqlite busy"));
    const createGraphNode = vi.fn().mockResolvedValue({});
    await expect(
      seedNoteNodeEffects({
        graphNodeId: "node-1",
        title: "Untitled note",
        databasePath: "/db/path.sqlite",
        upsertLocalNodeDocument,
        createGraphNode,
        acknowledgeLocalNodeDocumentSync: ackSynced(),
      })
    ).rejects.toThrow("sqlite busy");

    expect(createGraphNode).not.toHaveBeenCalled();
  });

  it.each([
    ["graphNodeId", { graphNodeId: "wrong" }],
    ["body", { body: "not empty" }],
    ["summary", { summary: "not empty" }],
    ["neo4jSynced", { neo4jSynced: true }],
    ["contentOrigin", { contentOrigin: "imported" }],
    ["contentRevision", { contentRevision: 1 }],
    ["bodySourceCoordinates", { bodySourceCoordinates: ["unexpected"] }],
  ])("rejects malformed Created local document dimension %s", async (_field, malformed) => {
    const createGraphNode = vi.fn();
    await expect(seedNoteNodeEffects({
      graphNodeId: "node-exact", title: "Untitled note", databasePath: "/db.sqlite",
      upsertLocalNodeDocument: vi.fn().mockResolvedValue({
        mutation: { kind: "created" },
        document: { ...createdLocal("node-exact").document, ...malformed },
      }),
      createGraphNode, acknowledgeLocalNodeDocumentSync: ackSynced(),
    })).rejects.toThrow(/incoherent document/);
    expect(createGraphNode).not.toHaveBeenCalled();
  });

  it("keeps the node pending when acknowledgement transport fails", async () => {
    await expect(syncNoteNodeRemote({
      graphNodeId: "ack-error", title: "Untitled note", databasePath: "/db.sqlite",
      createGraphNode: vi.fn().mockResolvedValue({}),
      acknowledgeLocalNodeDocumentSync: vi.fn().mockRejectedValue(new Error("sqlite busy")),
    })).resolves.toBe("pending");
    expect(isGraphNodeSyncPending("ack-error")).toBe(true);
  });

  it("records the node as pending sync when createGraphNode fails, and never throws", async () => {
    const upsertLocalNodeDocument = vi.fn().mockResolvedValue(createdLocal("node-2"));
    const createGraphNode = vi.fn().mockRejectedValue(new Error("neo4j down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      seedNoteNodeEffects({
        graphNodeId: "node-2",
        title: "Untitled note",
        databasePath: "/db/path.sqlite",
        upsertLocalNodeDocument,
        createGraphNode,
        acknowledgeLocalNodeDocumentSync: ackSynced(),
      })
    ).resolves.toBeUndefined();

    expect(isGraphNodeSyncPending("node-2")).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      "createGraphNode sync failed; node kept locally",
      expect.any(Error)
    );
  });

  it("does not record the node as pending when createGraphNode succeeds", async () => {
    const upsertLocalNodeDocument = vi.fn().mockResolvedValue(createdLocal("node-3"));
    const createGraphNode = vi.fn().mockResolvedValue({});

    await seedNoteNodeEffects({
      graphNodeId: "node-3",
      title: "Untitled note",
      databasePath: "/db/path.sqlite",
      upsertLocalNodeDocument,
      createGraphNode,
      acknowledgeLocalNodeDocumentSync: ackSynced(),
    });

    expect(isGraphNodeSyncPending("node-3")).toBe(false);
  });
});

describe("initial remote creation acknowledgement", () => {
  beforeEach(() => resetPendingGraphNodeSync());

  it("reports synced only after rev0 acknowledgement succeeds", async () => {
    const acknowledge = ackSynced();
    await expect(syncNoteNodeRemote({
      graphNodeId: "ack-1", title: "Untitled note", databasePath: "/db.sqlite",
      createGraphNode: vi.fn().mockResolvedValue({}), acknowledgeLocalNodeDocumentSync: acknowledge,
    })).resolves.toBe("synced");
    expect(acknowledge).toHaveBeenCalledWith({
      databasePath: "/db.sqlite", graphNodeId: "ack-1", expectedRevision: 0,
      expectedOrigin: "user_authored",
    });
    expect(isGraphNodeSyncPending("ack-1")).toBe(false);
  });

  it.each([
    ["conflict", { kind: "conflict", current_revision: 1, current_origin: "user_authored", reason: "newer" }],
    ["missing", { kind: "missing" }],
  ])("keeps the node pending when acknowledgement returns %s", async (_name, result) => {
    await expect(syncNoteNodeRemote({
      graphNodeId: "ack-pending", title: "Untitled note", databasePath: "/db.sqlite",
      createGraphNode: vi.fn().mockResolvedValue({}),
      acknowledgeLocalNodeDocumentSync: vi.fn().mockResolvedValue(result),
    })).resolves.toBe("pending");
    expect(isGraphNodeSyncPending("ack-pending")).toBe(true);
  });

  it("retries acknowledgement without recreating remote or advancing revision", async () => {
    const createGraphNode = vi.fn().mockResolvedValue({});
    await syncNoteNodeRemote({
      graphNodeId: "ack-retry", title: "Untitled note", databasePath: "/db.sqlite",
      createGraphNode,
      acknowledgeLocalNodeDocumentSync: vi.fn().mockResolvedValue({ kind: "conflict", current_revision: 0, current_origin: "user_authored", reason: "busy" }),
    });
    const acknowledge = ackSynced();
    await retryPendingGraphNodeSyncs({
      createGraphNode: async (input) => { await createGraphNode(input); return remoteNode(input.graphNodeId); },
      findGraphNode: vi.fn().mockResolvedValue(remoteNode("ack-retry")),
      readLocalNodeDocument: vi.fn().mockResolvedValue(createdLocal("ack-retry").document),
      compareAndSwapGraphNodeContent: vi.fn().mockResolvedValue({ kind: "updated" }),
      acknowledgeLocalNodeDocumentSync: acknowledge,
    });
    expect(createGraphNode).toHaveBeenCalledTimes(1);
    expect(acknowledge).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 0 }));
    expect(isGraphNodeSyncPending("ack-retry")).toBe(false);
  });

  it("syncs the latest local edit before acknowledging when editing raced initial ack", async () => {
    const createGraphNode = vi.fn().mockResolvedValue({});
    await syncNoteNodeRemote({
      graphNodeId: "edited-before-ack", title: "Untitled note", databasePath: "/db.sqlite",
      createGraphNode,
      acknowledgeLocalNodeDocumentSync: vi.fn().mockResolvedValue({ kind: "conflict", current_revision: 1, current_origin: "user_authored", reason: "edited" }),
    });
    const cas = vi.fn().mockResolvedValue({ kind: "updated" });
    const acknowledge = ackSynced();
    await retryPendingGraphNodeSyncs({
      createGraphNode: async () => remoteNode("edited-before-ack"),
      findGraphNode: vi.fn().mockResolvedValue(remoteNode("edited-before-ack", 0, "")),
      readLocalNodeDocument: vi.fn().mockResolvedValue(localDocument("edited-before-ack", 1, "latest")),
      compareAndSwapGraphNodeContent: cas,
      acknowledgeLocalNodeDocumentSync: acknowledge,
    });
    expect(cas).toHaveBeenCalledWith(expect.objectContaining({
      expectedRemoteRevision: 0, contentRevision: 1, body: "latest",
    }));
    expect(acknowledge).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 1 }));
    expect(isGraphNodeSyncPending("edited-before-ack")).toBe(false);
  });

  it("recovers an ambiguous create error only after exact typed re-read evidence", async () => {
    await syncNoteNodeRemote({
      graphNodeId: "ambiguous", title: "Untitled note", databasePath: "/db.sqlite",
      createGraphNode: vi.fn().mockRejectedValue(new Error("offline")),
      acknowledgeLocalNodeDocumentSync: ackSynced(),
    });
    const findGraphNode = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(remoteNode("ambiguous", 1, "latest"));
    const createGraphNode = vi.fn().mockRejectedValue(new Error("socket reset after commit"));
    await retryPendingGraphNodeSyncs({
      createGraphNode, findGraphNode,
      readLocalNodeDocument: vi.fn().mockResolvedValue(localDocument("ambiguous", 1, "latest")),
      compareAndSwapGraphNodeContent: vi.fn(),
      acknowledgeLocalNodeDocumentSync: ackSynced(),
    });
    expect(createGraphNode).toHaveBeenCalledTimes(1);
    expect(findGraphNode).toHaveBeenCalledTimes(2);
    expect(isGraphNodeSyncPending("ambiguous")).toBe(false);
  });
});

describe("createPreparedNoteNode production orchestration", () => {
  it("publishes only after typed local Created and does not await slow remote sync", async () => {
    const publishCanvasNode = vi.fn();
    const createGraphNode = vi.fn(() => new Promise(() => {}));
    await createPreparedNoteNode({
      graphNodeId: "new-id", title: "Untitled note", databasePath: "/db.sqlite",
      upsertLocalNodeDocument: vi.fn().mockResolvedValue(createdLocal("new-id")),
      publishCanvasNode, createGraphNode, acknowledgeLocalNodeDocumentSync: ackSynced(),
    });
    expect(publishCanvasNode).toHaveBeenCalledTimes(1);
    expect(createGraphNode).toHaveBeenCalledTimes(1);
  });

  it("does not publish or create remotely when local reconciliation is rejected", async () => {
    const publishCanvasNode = vi.fn();
    const createGraphNode = vi.fn();
    await expect(createPreparedNoteNode({
      graphNodeId: "new-id", title: "Untitled note", databasePath: "/db.sqlite",
      upsertLocalNodeDocument: vi.fn().mockResolvedValue({
        mutation: { kind: "conflict", current_revision: 1, reason: "already exists" },
        document: createdLocal("new-id").document,
      }),
      publishCanvasNode, createGraphNode, acknowledgeLocalNodeDocumentSync: ackSynced(),
    })).rejects.toThrow(/not created.*already exists/);
    expect(publishCanvasNode).not.toHaveBeenCalled();
    expect(createGraphNode).not.toHaveBeenCalled();
  });

  it("rejects Preserved for a newly minted id rather than publishing a replay", async () => {
    const publishCanvasNode = vi.fn();
    const createGraphNode = vi.fn();
    await expect(createPreparedNoteNode({
      graphNodeId: "new-id", title: "Untitled note", databasePath: "/db.sqlite",
      upsertLocalNodeDocument: vi.fn().mockResolvedValue({ mutation: { kind: "preserved" }, document: createdLocal("new-id").document }),
      publishCanvasNode, createGraphNode, acknowledgeLocalNodeDocumentSync: ackSynced(),
    })).rejects.toThrow(/not created \(preserved\)/);
    expect(publishCanvasNode).not.toHaveBeenCalled();
    expect(createGraphNode).not.toHaveBeenCalled();
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
      upsertLocalNodeDocument: vi.fn().mockResolvedValue(createdLocal("node-4")),
      createGraphNode,
      acknowledgeLocalNodeDocumentSync: ackSynced(),
    });
    expect(isGraphNodeSyncPending("node-4")).toBe(true);

    await retryPendingGraphNodeSyncs({
      createGraphNode: async (input) => { await createGraphNode(input); return remoteNode(input.graphNodeId); },
      findGraphNode: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue(remoteNode("node-4")),
      readLocalNodeDocument: vi.fn().mockResolvedValue(createdLocal("node-4").document),
      compareAndSwapGraphNodeContent: vi.fn().mockResolvedValue({ kind: "updated" }),
      acknowledgeLocalNodeDocumentSync: ackSynced(),
    });

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
      upsertLocalNodeDocument: vi.fn().mockResolvedValue(createdLocal("node-5")),
      createGraphNode,
      acknowledgeLocalNodeDocumentSync: ackSynced(),
    });
    expect(pendingGraphNodeSyncCount()).toBe(1);

    await retryPendingGraphNodeSyncs({
      createGraphNode: async (input) => { await createGraphNode(input); return remoteNode(input.graphNodeId); },
      findGraphNode: vi.fn().mockResolvedValue(null),
      readLocalNodeDocument: vi.fn().mockResolvedValue(createdLocal("node-5").document),
      compareAndSwapGraphNodeContent: vi.fn().mockResolvedValue({ kind: "updated" }),
      acknowledgeLocalNodeDocumentSync: ackSynced(),
    });

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

  it("is single-flight and does not interpret lookup outages as absence", async () => {
    await syncNoteNodeRemote({
      graphNodeId: "single", title: "Untitled note", databasePath: "/db.sqlite",
      createGraphNode: vi.fn().mockRejectedValue(new Error("offline")),
      acknowledgeLocalNodeDocumentSync: ackSynced(),
    });
    let release!: () => void;
    const lookup = new Promise<GraphNode | null>((resolve) => { release = () => resolve(null); });
    const createGraphNode = vi.fn(async () => remoteNode("single"));
    const deps = {
      createGraphNode,
      findGraphNode: vi.fn().mockReturnValueOnce(lookup).mockRejectedValue(new Error("transport outage")),
      readLocalNodeDocument: vi.fn().mockResolvedValue(localDocument("single")),
      compareAndSwapGraphNodeContent: vi.fn().mockResolvedValue({ kind: "updated" as const }),
      acknowledgeLocalNodeDocumentSync: ackSynced(),
    };
    const first = retryPendingGraphNodeSyncs(deps);
    const second = retryPendingGraphNodeSyncs(deps);
    expect(first).toBe(second);
    release();
    await first;
    expect(createGraphNode).toHaveBeenCalledTimes(1);
    expect(isGraphNodeSyncPending("single")).toBe(true);
  });
});

describe("durable pending sync restart hydration", () => {
  it("discovers a durable editor save on the next interval and keeps overlapping ticks single-flight", async () => {
    vi.useFakeTimers();
    const local = localDocument("interval-save", 1, "saved between hydration and interval");
    const remote = remoteNode("interval-save", 1, local.body);
    let releaseDurableRows!: () => void;
    const delayedRows = new Promise<unknown[]>((resolve) => {
      releaseDurableRows = () => resolve([{
        document: local,
        structure: { graphNodeId: "interval-save", entityType: "Work", title: "Interval save", isTemporal: false },
      }]);
    });
    const listPendingNodeDocumentSyncs = vi.fn()
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(delayedRows);
    let remoteReads = 0;
    const deps = {
      listPendingNodeDocumentSyncs,
      createGraphNode: vi.fn().mockResolvedValue(remote),
      findGraphNode: vi.fn().mockImplementation(async () => (++remoteReads === 1 ? null : remote)),
      readLocalNodeDocument: vi.fn().mockResolvedValue(local),
      compareAndSwapGraphNodeContent: vi.fn(),
      acknowledgeLocalNodeDocumentSync: vi.fn().mockResolvedValue({ kind: "updated" }),
    };

    try {
      await rehydratePendingGraphNodeSyncs("/workspace.sqlite", deps);
      expect(listPendingNodeDocumentSyncs).toHaveBeenCalledTimes(1);
      const stop = startDurablePendingGraphNodeSyncRetryInterval("/workspace.sqlite", deps);

      await vi.advanceTimersByTimeAsync(15_000);
      expect(listPendingNodeDocumentSyncs).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(15_000);
      expect(listPendingNodeDocumentSyncs).toHaveBeenCalledTimes(2);

      releaseDurableRows();
      stop();
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
      expect(deps.createGraphNode).toHaveBeenCalledOnce();
      expect(deps.acknowledgeLocalNodeDocumentSync).toHaveBeenCalledWith(expect.objectContaining({
        graphNodeId: "interval-save",
        expectedRevision: 1,
      }));
      expect(pendingGraphNodeSyncCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["user_authored", "imported", 4, 3, true],
    ["corpus_compiled", "seed", 4, 3, true],
    ["corpus_compiled", "imported", 4, 3, true],
    ["seed", "corpus_compiled", 4, 3, false],
    ["corpus_compiled", "user_authored", 4, 3, false],
    ["imported", "imported", 4, 3, false],
    ["user_authored", "imported", 3, 3, false],
  ] as const)("validates ownership transition local %s over remote %s", (localOrigin, remoteOrigin, localRevision, remoteRevision, expected) => {
    expect(canPromoteRemoteContent(remoteOrigin, remoteRevision, localOrigin, localRevision)).toBe(expected);
  });

  it("promotes imported content to newer user authorship but leaves forbidden downgrades pending", async () => {
    vi.resetModules();
    const pendingSync = await import("./pendingGraphNodeSync");
    const promoted = { ...localDocument("promoted", 4, "authored"), contentOrigin: "user_authored" as const };
    const seedDowngrade = { ...localDocument("seed-downgrade", 4, "seed"), contentOrigin: "seed" as const };
    const corpusDowngrade = { ...localDocument("corpus-downgrade", 4, "corpus"), contentOrigin: "corpus_compiled" as const };
    const importedUpdate = { ...localDocument("imported-update", 4, "new import"), contentOrigin: "imported" as const };
    const rows = [promoted, seedDowngrade, corpusDowngrade, importedUpdate].map((document) => ({
      document,
      structure: { graphNodeId: document.graphNodeId, entityType: "Work" as const, title: document.graphNodeId, isTemporal: false },
    }));
    const remotes = new Map<string, GraphNode>([
      ["promoted", { ...remoteNode("promoted", 3, "imported"), contentOrigin: "imported" }],
      ["seed-downgrade", { ...remoteNode("seed-downgrade", 3, "corpus"), contentOrigin: "corpus_compiled" }],
      ["corpus-downgrade", { ...remoteNode("corpus-downgrade", 3, "authored"), contentOrigin: "user_authored" }],
      ["imported-update", { ...remoteNode("imported-update", 3, "old import"), contentOrigin: "imported" }],
    ]);
    const locals = new Map(rows.map((row) => [row.document.graphNodeId, row.document]));
    const compareAndSwapGraphNodeContent = vi.fn().mockResolvedValue({ kind: "updated" });
    const acknowledgeLocalNodeDocumentSync = vi.fn().mockResolvedValue({ kind: "updated" });

    await pendingSync.rehydratePendingGraphNodeSyncs("/workspace.sqlite", {
      listPendingNodeDocumentSyncs: vi.fn().mockResolvedValue(rows),
      createGraphNode: vi.fn(),
      findGraphNode: vi.fn(async ({ graphNodeId }) => remotes.get(graphNodeId) ?? null),
      readLocalNodeDocument: vi.fn(async ({ graphNodeId }) => locals.get(graphNodeId) ?? null),
      compareAndSwapGraphNodeContent,
      acknowledgeLocalNodeDocumentSync,
    });

    expect(compareAndSwapGraphNodeContent).toHaveBeenCalledOnce();
    expect(compareAndSwapGraphNodeContent).toHaveBeenCalledWith(expect.objectContaining({
      graphNodeId: "promoted",
      expectedRemoteRevision: 3,
      expectedRemoteOrigin: "imported",
      contentRevision: 4,
      contentOrigin: "user_authored",
    }));
    expect(acknowledgeLocalNodeDocumentSync).toHaveBeenCalledOnce();
    expect(acknowledgeLocalNodeDocumentSync).toHaveBeenCalledWith(expect.objectContaining({
      graphNodeId: "promoted",
      expectedRevision: 4,
      expectedOrigin: "user_authored",
    }));
    expect(pendingSync.isGraphNodeSyncPending("seed-downgrade")).toBe(true);
    expect(pendingSync.isGraphNodeSyncPending("corpus-downgrade")).toBe(true);
    expect(pendingSync.isGraphNodeSyncPending("imported-update")).toBe(true);
    expect(pendingSync.pendingGraphNodeSyncCount()).toBe(3);
  });

  it("rehydrates exact SQLite rows once and reconciles absent and older remotes without drift", async () => {
    vi.resetModules();
    const pendingSync = await import("./pendingGraphNodeSync");
    const absentLocal = localDocument("restart-absent", 2, "latest absent body");
    const exactLocal = localDocument("restart-exact", 5, "latest exact body");
    const listPendingNodeDocumentSyncs = vi.fn().mockResolvedValue([
      {
        document: absentLocal,
        structure: {
          graphNodeId: "restart-absent", entityType: "Event", title: "Historical event",
          coordinate: "P4", sourceCoordinates: ["canon.md#event"], evidenceTags: ["documented"],
          sourceKind: "historical_record", historicity: "historical", claimKind: "fact",
          evidenceStatus: "documented", temporalRole: "occurred_at", placeCoverage: "resolved",
          qlForm: "partial_positional_map", qlUnitId: "ql-event", qlArc: "braided",
          qlTopology: "klein", qlSchemaVersion: 2, qlSourceCoordinates: ["ql.md#event"],
          qlCompletenessStatus: "partial", isTemporal: true, validFrom: "0325-05-20",
          validTo: "0325-08-25", temporalPrecision: "day",
        },
      },
      {
        document: exactLocal,
        structure: { graphNodeId: "restart-exact", entityType: "Work", title: "Exact", isTemporal: false },
      },
    ]);
    const absentRemote = remoteNode("restart-absent", 2, "latest absent body");
    absentRemote.entityType = "Event";
    absentRemote.title = "Historical event";
    const exactRemote = remoteNode("restart-exact", 4, "older remote body");
    let absentReads = 0;
    const findGraphNode = vi.fn().mockImplementation(async ({ graphNodeId }: { graphNodeId: string }) => {
      if (graphNodeId === "restart-exact") return exactRemote;
      absentReads += 1;
      return absentReads === 1 ? null : absentRemote;
    });
    const createGraphNode = vi.fn().mockResolvedValue(absentRemote);
    const acknowledgeLocalNodeDocumentSync = vi.fn().mockResolvedValue({ kind: "updated" });
    const deps = {
      listPendingNodeDocumentSyncs,
      createGraphNode,
      findGraphNode,
      readLocalNodeDocument: vi.fn().mockImplementation(async ({ graphNodeId }) =>
        graphNodeId === "restart-absent" ? absentLocal : exactLocal),
      compareAndSwapGraphNodeContent: vi.fn().mockResolvedValue({ kind: "updated" }),
      acknowledgeLocalNodeDocumentSync,
    };

    const first = pendingSync.rehydratePendingGraphNodeSyncs("/workspace.sqlite", deps);
    const second = pendingSync.rehydratePendingGraphNodeSyncs("/workspace.sqlite", deps);
    expect(second).toBe(first);
    await first;

    expect(listPendingNodeDocumentSyncs).toHaveBeenCalledOnce();
    expect(createGraphNode).toHaveBeenCalledOnce();
    const created = createGraphNode.mock.calls[0][0];
    expect(created).toMatchObject({
      graphNodeId: "restart-absent", entityType: "Event", title: "Historical event",
      body: "latest absent body", summary: "", contentOrigin: "user_authored",
      contentRevision: 2, bodySourceCoordinates: [], historicity: "historical",
      evidenceStatus: "documented", validFrom: "0325-05-20",
    });
    expect(deps.compareAndSwapGraphNodeContent).toHaveBeenCalledOnce();
    expect(deps.compareAndSwapGraphNodeContent).toHaveBeenCalledWith({
      graphNodeId: "restart-exact", expectedRemoteRevision: 4,
      expectedRemoteOrigin: "user_authored", body: "latest exact body", summary: "",
      contentOrigin: "user_authored", contentRevision: 5, bodySourceCoordinates: [],
    });
    expect(acknowledgeLocalNodeDocumentSync).toHaveBeenCalledTimes(2);
    expect(pendingSync.pendingGraphNodeSyncCount()).toBe(0);
  });
});

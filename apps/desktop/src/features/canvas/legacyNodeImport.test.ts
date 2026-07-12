import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasNode } from "@research-canvas/schema";
import type { CanvasView } from "@research-canvas/desktop-api";
import {
  selectLegacyNodesNeedingImport,
  importLegacyCanvasNodes,
} from "./legacyNodeImport";

const CANVAS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = "2026-07-01T00:00:00.000Z";

afterEach(() => {
  vi.restoreAllMocks();
});

function buildLegacyNode(id: string, title = "Legacy"): CanvasNode {
  return {
    id,
    graphNodeId: id,
    canvasId: CANVAS_ID,
    type: "note",
    title,
    content: "legacy content",
    tags: [],
    summary: "",
    position: { x: 1, y: 2 },
    size: { width: 240, height: 160 },
    sequenceCaption: null,
    sequenceViewport: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function buildView(nodeIds: string[]): CanvasView {
  return {
    canvasId: CANVAS_ID,
    nodes: nodeIds.map((id) => ({
      node: {
        graphNodeId: id,
        entityType: "Work",
        title: "T",
        body: "[]",
        summary: "",
        archetypalResonance: null,
        coordinate: null,
        sourceCoordinates: [],
        evidenceTags: [],
        sourceKind: null,
        isTemporal: false,
        validFrom: null,
        validTo: null,
        temporalPrecision: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
      layout: {
        graphNodeId: id,
        canvasId: CANVAS_ID,
        positionX: 0,
        positionY: 0,
        width: 240,
        height: 160,
        style: {},
      },
    })),
    edges: [],
    relationships: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    appState: {},
  };
}

describe("selectLegacyNodesNeedingImport", () => {
  it("returns legacy nodes whose id is not already present in the layout-authoritative view", () => {
    const legacyA = buildLegacyNode("node-a");
    const legacyB = buildLegacyNode("node-b");
    const view = buildView(["node-a"]);

    const result = selectLegacyNodesNeedingImport([legacyA, legacyB], view);

    expect(result).toEqual([legacyB]);
  });

  it("returns an empty array when every legacy node already has a layout row", () => {
    const legacyA = buildLegacyNode("node-a");
    const view = buildView(["node-a"]);

    const result = selectLegacyNodesNeedingImport([legacyA], view);

    expect(result).toEqual([]);
  });

  it("returns all legacy nodes when the view has no nodes at all", () => {
    const legacyA = buildLegacyNode("node-a");
    const legacyB = buildLegacyNode("node-b");
    const view = buildView([]);

    const result = selectLegacyNodesNeedingImport([legacyA, legacyB], view);

    expect(result).toEqual([legacyA, legacyB]);
  });

  it("is idempotent: running twice against an already-imported view yields nothing new", () => {
    const legacyA = buildLegacyNode("node-a");
    const viewAfterImport = buildView(["node-a"]);

    const first = selectLegacyNodesNeedingImport([legacyA], viewAfterImport);
    const second = selectLegacyNodesNeedingImport([legacyA], viewAfterImport);

    expect(first).toEqual([]);
    expect(second).toEqual([]);
  });
});

describe("importLegacyCanvasNodes", () => {
  it("writes a layout row (with sidecar) and fires best-effort createGraphNode for each unimported legacy node", async () => {
    const legacyA = buildLegacyNode("node-a", "Legacy A");
    const view = buildView([]);
    const upsertNodeLayout = vi.fn().mockResolvedValue(undefined);
    const createGraphNode = vi.fn().mockResolvedValue({});

    await importLegacyCanvasNodes({
      legacyNodes: [legacyA],
      view,
      databasePath: "/db.sqlite",
      upsertNodeLayout,
      createGraphNode,
    });

    expect(upsertNodeLayout).toHaveBeenCalledTimes(1);
    const layoutArg = upsertNodeLayout.mock.calls[0]![0];
    expect(layoutArg.databasePath).toBe("/db.sqlite");
    expect(layoutArg.layout.graphNodeId).toBe("node-a");
    expect(layoutArg.layout.canvasId).toBe(CANVAS_ID);
    expect(layoutArg.layout.style.__canvasNode).toMatchObject({
      type: "note",
      title: "Legacy A",
      content: "legacy content",
    });

    expect(createGraphNode).toHaveBeenCalledTimes(1);
    const graphArg = createGraphNode.mock.calls[0]![0];
    expect(graphArg.graphNodeId).toBe("node-a");
    expect(graphArg.title).toBe("Legacy A");
    // body must be a JSON BlockNote block array (matching the live
    // content-linking path), never the raw text itself.
    expect(JSON.parse(graphArg.body)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "legacy content" }] },
    ]);
  });

  it("skips nodes that already have a layout row (idempotent)", async () => {
    const legacyA = buildLegacyNode("node-a");
    const view = buildView(["node-a"]);
    const upsertNodeLayout = vi.fn().mockResolvedValue(undefined);
    const createGraphNode = vi.fn().mockResolvedValue({});

    await importLegacyCanvasNodes({
      legacyNodes: [legacyA],
      view,
      databasePath: "/db.sqlite",
      upsertNodeLayout,
      createGraphNode,
    });

    expect(upsertNodeLayout).not.toHaveBeenCalled();
    expect(createGraphNode).not.toHaveBeenCalled();
  });

  it("does not let a createGraphNode rejection block or throw (best-effort sync)", async () => {
    const legacyA = buildLegacyNode("node-a");
    const view = buildView([]);
    const upsertNodeLayout = vi.fn().mockResolvedValue(undefined);
    const createGraphNode = vi.fn().mockRejectedValue(new Error("neo4j unreachable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      importLegacyCanvasNodes({
        legacyNodes: [legacyA],
        view,
        databasePath: "/db.sqlite",
        upsertNodeLayout,
        createGraphNode,
      })
    ).resolves.toBeUndefined();

    expect(upsertNodeLayout).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "legacy node import: createGraphNode sync failed; node kept locally",
      "node-a",
      expect.any(Error)
    );
  });

  it("does not throw when upsertNodeLayout itself rejects for one node; continues with the rest", async () => {
    const legacyA = buildLegacyNode("node-a");
    const legacyB = buildLegacyNode("node-b");
    const view = buildView([]);
    const upsertNodeLayout = vi
      .fn()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce(undefined);
    const createGraphNode = vi.fn().mockResolvedValue({});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      importLegacyCanvasNodes({
        legacyNodes: [legacyA, legacyB],
        view,
        databasePath: "/db.sqlite",
        upsertNodeLayout,
        createGraphNode,
      })
    ).resolves.toBeUndefined();

    expect(upsertNodeLayout).toHaveBeenCalledTimes(2);
    // createGraphNode should still fire for the node whose layout write failed
    // is a design choice — we choose NOT to sync substance for a node whose
    // local layout write failed, to avoid orphaning Neo4j nodes with no local
    // layout row. Only the successfully-written node gets synced.
    expect(createGraphNode).toHaveBeenCalledTimes(1);
    expect(createGraphNode.mock.calls[0]![0].graphNodeId).toBe("node-b");
    expect(warn).toHaveBeenCalledWith(
      "legacy node import: upsertNodeLayout failed; skipping node",
      "node-a",
      expect.any(Error)
    );
  });

  it("does nothing when there are no legacy nodes needing import", async () => {
    const view = buildView(["node-a"]);
    const upsertNodeLayout = vi.fn();
    const createGraphNode = vi.fn();

    await importLegacyCanvasNodes({
      legacyNodes: [buildLegacyNode("node-a")],
      view,
      databasePath: "/db.sqlite",
      upsertNodeLayout,
      createGraphNode,
    });

    expect(upsertNodeLayout).not.toHaveBeenCalled();
    expect(createGraphNode).not.toHaveBeenCalled();
  });
});

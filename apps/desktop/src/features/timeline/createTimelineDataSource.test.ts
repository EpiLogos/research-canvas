import { describe, expect, test, vi } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import { createTimelineDataSource } from "./createTimelineDataSource";
import type {
  ArchetypalLighting,
  ExpandedTimelineNode,
  GraphNode,
  LitInstance,
  TimelineView,
} from "@research-canvas/desktop-api";

test("timeline datasource persists through the timeline-only transport command", async () => {
  const upsertTimelineLayout = vi.fn(async () => ({ status: "created" as const, layout: {
    lane: "events", offsetY: 4, width: 260, height: 90, style: {}, layoutRevision: 0,
  }}));
  const ds = createTimelineDataSource({
    transport: { loadTimelineView: vi.fn(), archetypalLighting: vi.fn(), resonancesForInstance: vi.fn(), upsertTimelineLayout },
    workspaceId: "sqlite:/canonical/workspace.sqlite",
  });
  await ds.saveTimelineLayout?.({ graphNodeId: "event-1", lane: "events", offsetY: 4, width: 260, height: 90, style: {}, expectedRevision: null });
  expect(upsertTimelineLayout).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "sqlite:/canonical/workspace.sqlite", graphNodeId: "event-1" }));
});

function gnode(id: string, isTemporal: boolean): GraphNode {
  return {
    graphNodeId: id,
    entityType: isTemporal ? "Event" : "Archetype",
    title: id,
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    ...EMPTY_GRAPH_NODE_METADATA,
    isTemporal,
    validFrom: isTemporal ? "1621-01-01" : null,
    validTo: null,
    temporalPrecision: isTemporal ? "year" : null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("createTimelineDataSource", () => {
  test("loads the workspace timeline independently of canvas membership", async () => {
    const view: TimelineView = {
      workspaceId: "sqlite:/canonical/workspace.sqlite",
      nodes: [
        {
          node: gnode("banda", true),
          anchor: { validFrom: "1621-01-01", validTo: null, precision: "year" },
          layoutOverride: {
            lane: "events",
            offsetY: 12,
            width: 100,
            height: 50,
            style: {},
            layoutRevision: 3,
          },
        },
      ],
      relationships: [],
      lanes: [{ id: "events" }],
      diagnostics: [],
    };
    const loadTimelineView = vi.fn(async () => view);
    const ds = createTimelineDataSource({
      transport: {
        loadTimelineView,
        upsertTimelineLayout: vi.fn(),
        archetypalLighting: vi.fn(),
        resonancesForInstance: vi.fn(),
      },
      workspaceId: "sqlite:/canonical/workspace.sqlite",
    });
    const loaded = await ds.loadTimelineView();
    expect(loadTimelineView).toHaveBeenCalledWith({ workspaceId: "sqlite:/canonical/workspace.sqlite" });
    expect(loaded.nodes.map((record) => record.node.graphNodeId)).toEqual(["banda"]);
    expect(loaded.nodes[0]?.layoutOverride).toEqual(expect.objectContaining({ lane: "events", width: 100 }));
  });

  test("forwards a bounded camera window to the transport", async () => {
    const loadTimelineView = vi.fn(async () => ({
      workspaceId: "sqlite:/canonical/workspace.sqlite",
      nodes: [], relationships: [], lanes: [], diagnostics: [],
    }));
    const ds = createTimelineDataSource({
      transport: { loadTimelineView, upsertTimelineLayout: vi.fn(), archetypalLighting: vi.fn(), resonancesForInstance: vi.fn() },
      workspaceId: "sqlite:/canonical/workspace.sqlite",
    });
    await ds.loadTimelineView({ startYear: 1880, endYear: 1940 });
    expect(loadTimelineView).toHaveBeenCalledWith({
      workspaceId: "sqlite:/canonical/workspace.sqlite",
      range: { startYear: 1880, endYear: 1940 },
    });
  });

  test("archetypalLighting forwards the operator id", async () => {
    const lighting: ArchetypalLighting = {
      operator: gnode("op", false),
      instances: [
        { node: gnode("banda", true), relType: "INSTANTIATES", dominance: "dominant" },
      ],
    };
    const archetypalLighting = vi.fn(async () => lighting);
    const ds = createTimelineDataSource({
      transport: {
        loadTimelineView: vi.fn(),
        upsertTimelineLayout: vi.fn(),
        archetypalLighting,
        resonancesForInstance: vi.fn(),
      },
      workspaceId: "sqlite:/canonical/workspace.sqlite",
    });
    const out = await ds.archetypalLighting("op");
    expect(archetypalLighting).toHaveBeenCalledWith({ operatorGraphNodeId: "op" });
    expect(out.instances).toHaveLength(1);
  });

  test("derives resonances from local-first expansion and shares the in-flight neighbourhood read", async () => {
    const subject = gnode("event-medici", true);
    const archetype = gnode("archetype-shadow", false);
    const dynamic = { ...gnode("dynamic-return", false), entityType: "Dynamic" as const };
    const ordinary = gnode("event-other", true);
    const expansion: ExpandedTimelineNode = {
      subjectGraphNodeId: subject.graphNodeId,
      subject,
      neighbours: [archetype, dynamic, ordinary],
      edges: [
        {
          id: "instantiates",
          relType: "INSTANTIATES",
          sourceGraphNodeId: subject.graphNodeId,
          targetGraphNodeId: archetype.graphNodeId,
          properties: { dominance: "dominant" },
        },
        {
          id: "resonates",
          relType: "RESONATES_WITH",
          sourceGraphNodeId: subject.graphNodeId,
          targetGraphNodeId: dynamic.graphNodeId,
          properties: {},
        },
        {
          id: "incoming-echo",
          relType: "ECHOES",
          sourceGraphNodeId: dynamic.graphNodeId,
          targetGraphNodeId: subject.graphNodeId,
          properties: { dominance: "secondary" },
        },
        {
          id: "ordinary-echo",
          relType: "ECHOES",
          sourceGraphNodeId: subject.graphNodeId,
          targetGraphNodeId: ordinary.graphNodeId,
          properties: { dominance: "secondary" },
        },
      ],
    };
    const pending = deferred<ExpandedTimelineNode>();
    const expandTimelineNode = vi.fn(() => pending.promise);
    const resonancesForInstance = vi.fn(async () => [] as LitInstance[]);
    const ds = createTimelineDataSource({
      transport: {
        loadTimelineView: vi.fn(),
        upsertTimelineLayout: vi.fn(),
        archetypalLighting: vi.fn(),
        resonancesForInstance,
        expandTimelineNode,
      },
      workspaceId: "sqlite:/canonical/workspace.sqlite",
    });

    const resonanceRead = ds.resonancesForInstance(subject.graphNodeId);
    const expansionRead = ds.expandNode!(subject.graphNodeId);
    expect(expandTimelineNode).toHaveBeenCalledTimes(1);
    expect(expandTimelineNode).toHaveBeenCalledWith({
      workspaceId: "sqlite:/canonical/workspace.sqlite",
      graphNodeId: subject.graphNodeId,
    });
    pending.resolve(expansion);

    await expect(resonanceRead).resolves.toEqual([
      { node: archetype, relType: "INSTANTIATES", dominance: "dominant" },
      { node: dynamic, relType: "RESONATES_WITH", dominance: null },
    ]);
    await expect(expansionRead).resolves.toBe(expansion);
    expect(resonancesForInstance).not.toHaveBeenCalled();
  });

  test("resonancesForInstance forwards the node id when expansion is unavailable", async () => {
    const resonances: LitInstance[] = [
      { node: gnode("op", false), relType: "ECHOES", dominance: "secondary" },
    ];
    const resonancesForInstance = vi.fn(async () => resonances);
    const ds = createTimelineDataSource({
      transport: {
        loadTimelineView: vi.fn(),
        upsertTimelineLayout: vi.fn(),
        archetypalLighting: vi.fn(),
        resonancesForInstance,
      },
      workspaceId: "sqlite:/canonical/workspace.sqlite",
    });
    const out = await ds.resonancesForInstance("banda");
    expect(resonancesForInstance).toHaveBeenCalledWith({ graphNodeId: "banda" });
    expect(out).toHaveLength(1);
  });
});

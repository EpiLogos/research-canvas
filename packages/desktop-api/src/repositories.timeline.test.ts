import { describe, expect, test, vi } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import type { GraphNode, TimelineView, WorkspaceTransport } from "./index";
import { DesktopTimelineRepository } from "./repositories";

function graphNode(
  graphNodeId: string,
  entityType: GraphNode["entityType"],
  validFrom: string | null = null,
): GraphNode {
  const isTemporal = validFrom !== null;
  return {
    graphNodeId,
    entityType,
    title: graphNodeId,
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    ...EMPTY_GRAPH_NODE_METADATA,
    isTemporal,
    isArchetype: entityType === "Archetype",
    validFrom,
    validTo: null,
    temporalPrecision: isTemporal ? "year" : null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("DesktopTimelineRepository", () => {
  test("builds a constellation-scoped earthbound walk and archetypal expression field", async () => {
    const event = { ...graphNode("event-1917", "Event", "1917-01-01"), historicity: "historical" as const };
    const outside = graphNode("outside-1920", "Event", "1920-01-01");
    const place = graphNode("place-london", "Place");
    const archetype = graphNode("archetype-shadow", "Archetype");

    const view: TimelineView = {
      workspaceId: "sqlite:/workspace.sqlite",
      nodes: [
        {
          node: event,
          anchor: { validFrom: "1917-01-01", validTo: null, precision: "year" },
          layoutOverride: null,
        },
        {
          node: outside,
          anchor: { validFrom: "1920-01-01", validTo: null, precision: "year" },
          layoutOverride: null,
        },
        {
          node: place,
          anchor: { validFrom: "1917-01-01", validTo: null, precision: "year" },
          layoutOverride: null,
          relationCompanion: true,
        },
      ],
      relationships: [
        {
          id: "located",
          relType: "LOCATED_AT",
          sourceGraphNodeId: event.graphNodeId,
          targetGraphNodeId: place.graphNodeId,
          properties: {},
        },
      ],
      lanes: [{ id: "events" }],
      diagnostics: [],
    };

    const transport = {
      loadConstellationDocument: vi.fn(async () => ({
        nodes: [
          { id: event.graphNodeId, graphNodeId: event.graphNodeId, graph: event },
          { id: place.graphNodeId, graphNodeId: place.graphNodeId, graph: place },
          { id: archetype.graphNodeId, graphNodeId: archetype.graphNodeId, graph: archetype },
        ],
      })),
      loadTimelineView: vi.fn(async () => view),
      readGraphNode: vi.fn(async ({ graphNodeId }: { graphNodeId: string }) => {
        if (graphNodeId === archetype.graphNodeId) return archetype;
        if (graphNodeId === place.graphNodeId) return place;
        return event;
      }),
      expandTimelineNode: vi.fn(async () => ({
        subjectGraphNodeId: archetype.graphNodeId,
        subject: archetype,
        neighbours: [place],
        edges: [{
          id: "shadow-expresses-london",
          relType: "ARCHETYPE_EXPRESSES_AT",
          sourceGraphNodeId: archetype.graphNodeId,
          targetGraphNodeId: place.graphNodeId,
          properties: {
            timeWindow: { start: "1900", end: "1940", precision: "year" },
          },
        }],
      })),
    } as unknown as WorkspaceTransport;

    const repository = new DesktopTimelineRepository(
      transport,
      "sqlite:/workspace.sqlite",
      "/tmp/workspace.sqlite",
    );
    const walk = await repository.getTimelineWalk("constellation-1", {
      startYear: 1880,
      endYear: 1950,
    });

    expect(walk.earthboundNodes).toEqual([
      expect.objectContaining({
        graphNodeId: "event-1917",
        x: 1917,
        placeName: "place-london",
        colorTag: "historicity-historical",
      }),
    ]);
    expect(walk.earthboundNodes.some((node) => node.graphNodeId === outside.graphNodeId)).toBe(false);
    expect(walk.archetypeLayers).toEqual([
      {
        archetypeId: "archetype-shadow",
        title: "archetype-shadow",
        expressions: [{
          start: "1900",
          end: "1940",
          placeName: "place-london",
          colorTag: "archetype-expression",
        }],
      },
    ]);
  });

  test("rejects an inverted time window before touching persistence", async () => {
    const loadTimelineView = vi.fn();
    const transport = { loadTimelineView } as unknown as WorkspaceTransport;
    const repository = new DesktopTimelineRepository(
      transport,
      "sqlite:/workspace.sqlite",
      "/tmp/workspace.sqlite",
    );

    await expect(repository.getTimelineWalk("constellation-1", {
      startYear: 1950,
      endYear: 1880,
    })).rejects.toThrow("startYear must not exceed endYear");
    expect(loadTimelineView).not.toHaveBeenCalled();
  });
});

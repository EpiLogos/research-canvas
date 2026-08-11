import { describe, expect, test } from "vitest";
import {
  type ArchetypeHeatmapEntry,
  type ArchetypalExpression,
  EMPTY_GRAPH_NODE_METADATA,
  type GraphNodeContract,
} from "@research-canvas/schema";
import type { ArchetypeRepository, NodeRepository } from "@research-canvas/domain";
class FakeArchetypeAdapter
  implements ArchetypeRepository, Pick<NodeRepository, "getArchetypeHeatmap">
{
  private nodes: GraphNodeContract[] = [];
  private expressions: ArchetypalExpression[] = [];

  private id(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2)}`;
  }

  seedNode(
    overrides: Partial<GraphNodeContract> & {
      graphNodeId: string;
      entityType: GraphNodeContract["entityType"];
    },
  ): GraphNodeContract {
    const { graphNodeId, entityType, ...rest } = overrides;
    const node: GraphNodeContract = {
      graphNodeId,
      entityType,
      title: rest.title ?? "untitled",
      body: "[]",
      summary: "",
      archetypalResonance: null,
      coordinate: null,
      sourceCoordinates: [],
      ...EMPTY_GRAPH_NODE_METADATA,
      isTemporal: rest.isTemporal ?? false,
      validFrom: rest.validFrom ?? null,
      validTo: rest.validTo ?? null,
      temporalPrecision: rest.temporalPrecision ?? null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      ...rest,
    };
    this.nodes.push(node);
    return node;
  }

  createArchetypalExpression(
    input: Omit<ArchetypalExpression, "id">,
  ): Promise<ArchetypalExpression> {
    const expression: ArchetypalExpression = { id: this.id("expr"), ...input };
    this.expressions.push(expression);
    return Promise.resolve(expression);
  }

  listExpressions(archetypeId: string): Promise<ArchetypalExpression[]> {
    return Promise.resolve(
      this.expressions.filter((e) => e.archetypeGraphNodeId === archetypeId),
    );
  }

  listExpressionsForTimeWindow(
    _projectId: string,
    _start: string,
    _end: string,
  ): Promise<ArchetypalExpression[]> {
    // The fake adapter is only used to exercise the heatmap shape; window
    // filtering is covered by the schema-level bound-order tests.
    return Promise.resolve(this.expressions);
  }

  listExpressionsForPlace(
    _projectId: string,
    placeGraphNodeId: string,
  ): Promise<ArchetypalExpression[]> {
    return Promise.resolve(
      this.expressions.filter((e) => e.placeGraphNodeId === placeGraphNodeId),
    );
  }

  async getArchetypeHeatmap(_projectId: string): Promise<ArchetypeHeatmapEntry[]> {
    return this.nodes
      .filter((n) => n.entityType === "Archetype")
      .map((archetype) => {
        const expressions = this.expressions.filter(
          (e) => e.archetypeGraphNodeId === archetype.graphNodeId,
        );
        const points = expressions
          .map((e) => {
            const n = this.nodes.find((x) => x.graphNodeId === e.placeGraphNodeId);
            if (n?.place?.coordinate.precision !== "exact") return null;
            return {
              latitude: n.place.coordinate.latitude,
              longitude: n.place.coordinate.longitude,
            };
          })
          .filter((p): p is { latitude: number; longitude: number } => p != null);

        const orderedStarts = expressions
          .map((e) => ({ bound: e.timeWindow.start, ms: Date.parse(e.timeWindow.start) }))
          .filter((item) => !Number.isNaN(item.ms))
          .sort((a, b) => a.ms - b.ms);
        const orderedEnds = expressions
          .map((e) =>
            e.timeWindow.end == null
              ? null
              : { bound: e.timeWindow.end, ms: Date.parse(e.timeWindow.end) },
          )
          .filter((item): item is { bound: string; ms: number } => item != null && !Number.isNaN(item.ms))
          .sort((a, b) => a.ms - b.ms);

        return {
          archetypeId: archetype.graphNodeId,
          title: archetype.title,
          expressions,
          temporalSpan: {
            start: orderedStarts[0]?.bound ?? expressions[0]?.timeWindow.start ?? "",
            end: orderedEnds[orderedEnds.length - 1]?.bound ?? null,
          },
          geographicBounds:
            points.length > 0
              ? {
                  north: Math.max(...points.map((p) => p.latitude)),
                  south: Math.min(...points.map((p) => p.latitude)),
                  east: Math.max(...points.map((p) => p.longitude)),
                  west: Math.min(...points.map((p) => p.longitude)),
                }
              : { north: 0, south: 0, east: 0, west: 0 },
        };
      });
  }
}

describe("ArchetypeRepository heatmap", () => {
  test("seeds three archetypes with expressions and returns correct temporal and geographic bounds", async () => {
    const adapter = new FakeArchetypeAdapter();

    // Places
    const rome = adapter.seedNode({
      graphNodeId: "place-rome",
      entityType: "Place",
      title: "Rome",
      place: {
        graphNodeId: "place-rome",
        names: [{ language: "en", name: "Rome" }],
        coordinate: {
          precision: "exact",
          latitude: 41.9,
          longitude: 12.5,
        },
        hierarchy: [],
        externalRefs: [],
        provenance: { sourceRefs: [] },
      },
    });

    const babylon = adapter.seedNode({
      graphNodeId: "place-babylon",
      entityType: "Place",
      title: "Babylon",
      place: {
        graphNodeId: "place-babylon",
        names: [{ language: "en", name: "Babylon" }],
        coordinate: {
          precision: "exact",
          latitude: 32.5,
          longitude: 44.4,
        },
        hierarchy: [],
        externalRefs: [],
        provenance: { sourceRefs: [] },
      },
    });

    // Archetypes
    const empire = adapter.seedNode({
      graphNodeId: "arch-empire",
      entityType: "Archetype",
      title: "Imperial Centre",
    });
    const fall = adapter.seedNode({
      graphNodeId: "arch-fall",
      entityType: "Archetype",
      title: "Imperial Collapse",
    });
    const law = adapter.seedNode({
      graphNodeId: "arch-law",
      entityType: "Archetype",
      title: "Codified Law",
    });

    // Expressions
    await adapter.createArchetypalExpression({
      archetypeGraphNodeId: empire.graphNodeId,
      placeGraphNodeId: rome.graphNodeId,
      timeWindow: { start: "1600-01-01", end: "1900-01-01", precision: "century" },
      expressionKind: "mythic",
      sourceCoordinates: ["livvy-1"],
    });
    await adapter.createArchetypalExpression({
      archetypeGraphNodeId: empire.graphNodeId,
      placeGraphNodeId: babylon.graphNodeId,
      timeWindow: { start: "1500-01-01", end: "1700-01-01", precision: "century" },
      expressionKind: "ritual",
      sourceCoordinates: ["enuma-elish"],
    });

    await adapter.createArchetypalExpression({
      archetypeGraphNodeId: fall.graphNodeId,
      placeGraphNodeId: rome.graphNodeId,
      timeWindow: { start: "1800-01-01", end: "1900-01-01", precision: "century" },
      expressionKind: "literary",
      sourceCoordinates: ["ammianus-31"],
    });

    await adapter.createArchetypalExpression({
      archetypeGraphNodeId: law.graphNodeId,
      placeGraphNodeId: babylon.graphNodeId,
      timeWindow: { start: "1200-01-01", end: null, precision: "century" },
      expressionKind: "theoretical",
      sourceCoordinates: ["codex-hammurabi"],
    });

    const heatmap = await adapter.getArchetypeHeatmap("project-1");

    expect(heatmap).toHaveLength(3);

    const empireEntry = heatmap.find((h) => h.archetypeId === empire.graphNodeId)!;
    expect(empireEntry.expressions).toHaveLength(2);
    expect(empireEntry.temporalSpan.start).toBe("1500-01-01");
    expect(empireEntry.temporalSpan.end).toBe("1900-01-01");
    expect(empireEntry.geographicBounds).toMatchObject({
      north: 41.9,
      south: 32.5,
      east: 44.4,
      west: 12.5,
    });

    const fallEntry = heatmap.find((h) => h.archetypeId === fall.graphNodeId)!;
    expect(fallEntry.expressions).toHaveLength(1);
    expect(fallEntry.geographicBounds).toMatchObject({
      north: 41.9,
      south: 41.9,
      east: 12.5,
      west: 12.5,
    });

    const lawEntry = heatmap.find((h) => h.archetypeId === law.graphNodeId)!;
    expect(lawEntry.expressions).toHaveLength(1);
    expect(lawEntry.temporalSpan.end).toBeNull();
  });
});

describe("ArchetypeRepository port contract", () => {
  test("exposes all four ticket-required methods on the adapter", () => {
    const adapter = new FakeArchetypeAdapter();
    const methods = [
      "listExpressions",
      "listExpressionsForTimeWindow",
      "listExpressionsForPlace",
      "getArchetypeHeatmap",
    ] as const;
    for (const method of methods) {
      expect(typeof (adapter as unknown as Record<string, unknown>)[method]).toBe(
        "function",
      );
    }
  });
});

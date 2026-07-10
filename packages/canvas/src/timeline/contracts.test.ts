import { describe, expect, test } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import { TEMPORAL_PRECISIONS } from "./contracts";
import type { GraphNode, TimelineNodeRecord } from "./contracts";

describe("timeline contracts mirror", () => {
  test("TEMPORAL_PRECISIONS lists every precision tier coarse-to-fine", () => {
    expect(TEMPORAL_PRECISIONS).toEqual([
      "millennium",
      "century",
      "decade",
      "year",
      "month",
      "day",
    ]);
  });

  test("GraphNode shape carries the timeline discriminator", () => {
    const node: GraphNode = {
      graphNodeId: "n1",
      entityType: "Event",
      title: "Banda genocide",
      body: "[]",
      summary: "",
      archetypalResonance: null,
      coordinate: null,
      sourceCoordinates: [],
      ...EMPTY_GRAPH_NODE_METADATA,
      historicity: "historical",
      claimKind: "fact",
      evidenceStatus: "documented",
      temporalRole: "occurred_at",
      placeCoverage: "resolved",
      qlForm: "partial_positional_map",
      qlUnitId: "ql-banda",
      qlArc: "braided",
      qlTopology: "composite",
      qlSchemaVersion: 2,
      qlSourceCoordinates: ["Canon/ql/banda.md#unit"],
      qlCompletenessStatus: "partial",
      isTemporal: true,
      validFrom: "1621-01-01",
      validTo: "1621-12-31",
      temporalPrecision: "year",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    const record: TimelineNodeRecord = {
      node,
      layout: { graphNodeId: "n1", canvasId: "c1", positionX: 0, positionY: 0, width: 200, height: 120, style: {} },
    };
    expect(record.node.isTemporal).toBe(true);
    expect(record.node.historicity).toBe("historical");
    expect(record.node.qlUnitId).toBe("ql-banda");
  });
});

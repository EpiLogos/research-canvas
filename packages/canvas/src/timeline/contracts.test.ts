import { describe, expect, test } from "vitest";
import { TEMPORAL_PRECISIONS } from "./contracts";
import type { GraphNode } from "./contracts";

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
      isTemporal: true,
      validFrom: "1621-01-01",
      validTo: "1621-12-31",
      temporalPrecision: "year",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(node.isTemporal).toBe(true);
  });
});

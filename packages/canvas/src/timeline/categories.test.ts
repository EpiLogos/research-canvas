import { describe, expect, test } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import type { GraphNode } from "./contracts";
import { deriveTimelineCategory } from "./categories";

function node(overrides: Partial<GraphNode>): GraphNode {
  return {
    graphNodeId: "n", entityType: "Event", title: "n", body: "[]", summary: "",
    archetypalResonance: null, coordinate: null, sourceCoordinates: [],
    ...EMPTY_GRAPH_NODE_METADATA,
    isTemporal: true, validFrom: "1900-01-01", validTo: null, temporalPrecision: "year",
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("deriveTimelineCategory", () => {
  test("keeps typed fact, claim, interpretation, myth, and source distinctions", () => {
    expect(deriveTimelineCategory(node({ entityType: "Event", claimKind: "fact" }))).toBe("historical-event");
    expect(deriveTimelineCategory(node({ entityType: "Claim", evidenceStatus: "contested" }))).toBe("claim");
    expect(deriveTimelineCategory(node({ entityType: "Interpretation" }))).toBe("interpretation");
    expect(deriveTimelineCategory(node({ entityType: "Myth", historicity: "mythic", temporalRole: "myth_located_at" }))).toBe("myth-in-time");
    expect(deriveTimelineCategory(node({ entityType: "Source" }))).toBe("source");
  });

  test("does not infer myth-in-time from archetypal resonance", () => {
    expect(deriveTimelineCategory(node({ entityType: "Event", archetypalResonance: "trickster" }))).toBe("historical-event");
    expect(deriveTimelineCategory(node({ entityType: "Myth", temporalRole: "claim_about_time" }))).toBe("myth");
    expect(deriveTimelineCategory(node({ entityType: "Myth", historicity: "historical", temporalRole: "myth_located_at" }))).toBe("myth");
  });
});

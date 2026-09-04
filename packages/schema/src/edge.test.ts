import { describe, expect, it } from "vitest";
import { edgeSchema } from "./edge";

const baseEdge = {
  id: "e1",
  canvasId: "11111111-1111-4111-8111-111111111111",
  sourceNodeId: "n1",
  targetNodeId: "n2",
  relationKind: "INSTANTIATES",
  directionality: "forward",
  style: { stroke: "#000000", width: 2 },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("edge schema", () => {
  it("accepts ARCHETYPE_EXPRESSES_AT as a relation kind", () => {
    const parsed = edgeSchema.parse({
      ...baseEdge,
      relationKind: "ARCHETYPE_EXPRESSES_AT",
    });
    expect(parsed.relationKind).toBe("ARCHETYPE_EXPRESSES_AT");
  });

  it("rejects an empty relation kind", () => {
    const result = edgeSchema.safeParse({ ...baseEdge, relationKind: "" });
    expect(result.success).toBe(false);
  });
});

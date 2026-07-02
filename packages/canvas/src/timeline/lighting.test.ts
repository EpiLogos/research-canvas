import { describe, expect, test } from "vitest";
import { buildLitMap, dominantResonance } from "./lighting";
import type { ArchetypalLighting, GraphNode, LitInstance } from "./contracts";

function gnode(id: string): GraphNode {
  return {
    graphNodeId: id,
    entityType: "Event",
    title: id,
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    isTemporal: true,
    validFrom: "1600-01-01",
    validTo: null,
    temporalPrecision: "year",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("buildLitMap", () => {
  test("null lighting yields an empty map", () => {
    expect(buildLitMap(null).size).toBe(0);
  });

  test("maps each lit instance by graphNodeId with dominance + relType", () => {
    const lighting: ArchetypalLighting = {
      operator: gnode("op"),
      instances: [
        { node: gnode("a"), relType: "INSTANTIATES", dominance: "dominant" },
        { node: gnode("b"), relType: "ECHOES", dominance: "secondary" },
      ],
    };
    const map = buildLitMap(lighting);
    expect(map.get("a")).toEqual({ dominance: "dominant", relType: "INSTANTIATES" });
    expect(map.get("b")).toEqual({ dominance: "secondary", relType: "ECHOES" });
  });

  test("missing dominance defaults to secondary", () => {
    const lighting: ArchetypalLighting = {
      operator: gnode("op"),
      instances: [{ node: gnode("a"), relType: "ECHOES", dominance: null }],
    };
    expect(buildLitMap(lighting).get("a")).toEqual({
      dominance: "secondary",
      relType: "ECHOES",
    });
  });

  test("duplicate instance: INSTANTIATES/dominant wins over ECHOES/secondary", () => {
    const lighting: ArchetypalLighting = {
      operator: gnode("op"),
      instances: [
        { node: gnode("a"), relType: "ECHOES", dominance: "secondary" },
        { node: gnode("a"), relType: "INSTANTIATES", dominance: "dominant" },
      ],
    };
    expect(buildLitMap(lighting).get("a")).toEqual({
      dominance: "dominant",
      relType: "INSTANTIATES",
    });
  });
});

describe("dominantResonance", () => {
  test("returns null for no resonances", () => {
    expect(dominantResonance([])).toBeNull();
  });

  test("dominant INSTANTIATES beats secondary ECHOES", () => {
    const instances: LitInstance[] = [
      { node: gnode("x"), relType: "ECHOES", dominance: "secondary" },
      { node: gnode("y"), relType: "INSTANTIATES", dominance: "dominant" },
    ];
    expect(dominantResonance(instances)!.node.graphNodeId).toBe("y");
  });
});

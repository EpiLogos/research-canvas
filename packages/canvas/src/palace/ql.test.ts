import { describe, expect, test } from "vitest";

import type { GraphNode } from "@research-canvas/desktop-api";

import {
  chamberHasQlResonance,
  conjugatePosition,
  conjugatePositionForChamber,
  faceForQlPosition,
  qlPositionForFace,
  qlPositionForNode,
  QL_FACE_MAP,
  QL_POSITIONS,
} from "./ql";

function node(id: string, over: Partial<GraphNode> = {}): GraphNode {
  return {
    graphNodeId: id,
    entityType: over.entityType ?? "Event",
    title: over.title ?? id,
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    evidenceTags: [],
    sourceKind: null,
    contentOrigin: null,
    contentRevision: null,
    seedSchemaVersion: null,
    bodySourceCoordinates: [],
    historicity: null,
    claimKind: null,
    evidenceStatus: null,
    temporalRole: null,
    placeCoverage: null,
    place: null,
    qlForm: over.qlForm ?? null,
    qlUnitId: over.qlUnitId ?? null,
    qlArc: over.qlArc ?? null,
    qlTopology: over.qlTopology ?? null,
    qlSchemaVersion: over.qlSchemaVersion ?? null,
    qlSourceCoordinates: [],
    qlCompletenessStatus: over.qlCompletenessStatus ?? null,
    isTemporal: false,
    validFrom: null,
    validTo: null,
    temporalPrecision: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("QL positions and face mapping", () => {
  test("the six Day positions carry canonical position–lens coordinates", () => {
    expect(QL_POSITIONS.map((p) => p.day)).toEqual([
      "ground/source",
      "material",
      "dynamis",
      "pattern",
      "context",
      "synthesis",
    ]);
  });

  test("the six interior faces map to P0–P5", () => {
    // P0 ground/source → floor; P5 synthesis → ceiling; P1–P4 the four walls.
    expect(QL_FACE_MAP.floor).toBe(0);
    expect(QL_FACE_MAP.south).toBe(1);
    expect(QL_FACE_MAP.east).toBe(2);
    expect(QL_FACE_MAP.north).toBe(3);
    expect(QL_FACE_MAP.west).toBe(4);
    expect(QL_FACE_MAP.ceiling).toBe(5);
  });

  test("qlPositionForFace and faceForQlPosition are inverses", () => {
    for (let i = 0; i < 6; i += 1) {
      const face = faceForQlPosition(i as 0 | 1 | 2 | 3 | 4 | 5);
      expect(qlPositionForFace(face)).toBe(i);
    }
  });

  test("conjugate positions label the Night half", () => {
    expect(conjugatePosition(0)).toBe("P0'");
    expect(conjugatePosition(5)).toBe("P5'");
  });
});

describe("qlPositionForNode (deterministic resonance)", () => {
  test("nodes without QL metadata have no resonance", () => {
    const members = [node("a"), node("b")];
    expect(qlPositionForNode({ node: node("a"), members })).toBeNull();
  });

  test("resonant members of a unit place in stable id order", () => {
    const members = [
      node("c", { qlUnitId: "ql-1" }),
      node("a", { qlUnitId: "ql-1" }),
      node("b", { qlUnitId: "ql-1" }),
    ];
    // Stable id order: a → 0, b → 1, c → 2.
    expect(qlPositionForNode({ node: node("a", { qlUnitId: "ql-1" }), members })).toBe(0);
    expect(qlPositionForNode({ node: node("b", { qlUnitId: "ql-1" }), members })).toBe(1);
    expect(qlPositionForNode({ node: node("c", { qlUnitId: "ql-1" }), members })).toBe(2);
  });

  test("members with different units get independent sixfolds", () => {
    const members = [
      node("a", { qlUnitId: "u1" }),
      node("b", { qlUnitId: "u1" }),
      node("x", { qlUnitId: "u2" }),
    ];
    expect(qlPositionForNode({ node: node("x", { qlUnitId: "u2" }), members })).toBe(0);
  });

  test("chamberHasQlResonance gates QL shaping", () => {
    expect(chamberHasQlResonance([node("a"), node("b")])).toBe(false);
    expect(chamberHasQlResonance([node("a", { qlForm: "complete_sixfold" }), node("b")])).toBe(true);
  });
});

describe("conjugatePositionForChamber", () => {
  test("is deterministic and always in 0..5", () => {
    const value = conjugatePositionForChamber("chamber:x");
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(5);
    expect(conjugatePositionForChamber("chamber:x")).toBe(value);
  });
});

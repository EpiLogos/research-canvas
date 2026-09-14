import { describe, expect, test } from "vitest";

import type { GraphNode, GraphRelationship } from "@research-canvas/desktop-api";

import {
  compressToObject,
  encapsulationEdgesFromRelationships,
  encapsulationInfo,
  isCompressedConstellationNode,
  toEncapsulationEdge,
  unfoldConstellation,
  type EncapsulationEdgeInput,
} from "./encapsulation";

function node(id: string, over: Partial<GraphNode> = {}): GraphNode {
  return {
    graphNodeId: id,
    entityType: over.entityType ?? "Event",
    title: over.title ?? id,
    body: "[]",
    summary: `summary of ${id}`,
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
    qlForm: null,
    qlUnitId: null,
    qlArc: null,
    qlTopology: null,
    qlSchemaVersion: null,
    qlSourceCoordinates: [],
    qlCompletenessStatus: null,
    isTemporal: false,
    validFrom: null,
    validTo: null,
    temporalPrecision: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function encaps(
  container: string,
  member: string,
  mode: "outgoing" | "ingoing" = "outgoing",
): EncapsulationEdgeInput {
  return { containerGraphNodeId: container, memberGraphNodeId: member, mode };
}

function relationship(
  id: string,
  source: string,
  target: string,
  relType = "INFLUENCES",
  mode?: "outgoing" | "ingoing",
): GraphRelationship {
  return {
    id,
    relType,
    sourceGraphNodeId: source,
    targetGraphNodeId: target,
    properties: mode ? { mode } : {},
  };
}

describe("encapsulationInfo — form follows member count", () => {
  test("full 4+2 (six members) is a room", () => {
    const edges = ["b", "c", "d", "e", "f", "g"].map((id) => encaps("a", id));
    expect(encapsulationInfo("a", edges).form).toBe("room");
    expect(encapsulationInfo("a", edges).memberCount).toBe(6);
  });

  test("partial constellations become faithful partial architecture", () => {
    expect(encapsulationInfo("a", ["b", "c", "d", "e"].map((id) => encaps("a", id))).form).toBe("alcove");
    expect(encapsulationInfo("a", ["b", "c"].map((id) => encaps("a", id))).form).toBe("corridor");
    expect(encapsulationInfo("a", [encaps("a", "b")]).form).toBe("wallSection");
  });

  test("a non-container has no form", () => {
    const info = encapsulationInfo("leaf", [encaps("a", "leaf")]);
    expect(info.isContainer).toBe(false);
    expect(info.form).toBeNull();
  });

  test("only outgoing (0/1 bimba) edges mark a container", () => {
    // a ingoing into root: a is a member, not a container.
    const edges = [encaps("root", "a", "ingoing")];
    expect(encapsulationInfo("a", edges).isContainer).toBe(false);
  });
});

describe("isCompressedConstellationNode", () => {
  test("a node encapsulated by a parent is compressed", () => {
    expect(isCompressedConstellationNode("a", [encaps("root", "a", "ingoing")])).toBe(true);
    expect(isCompressedConstellationNode("a", [encaps("root", "a", "outgoing")])).toBe(false);
  });
});

describe("toEncapsulationEdge + encapsulationEdgesFromRelationships", () => {
  test("reads ENCAPSULATES relationships with their mode", () => {
    const edge = toEncapsulationEdge(relationship("r1", "a", "b", "ENCAPSULATES", "outgoing"));
    expect(edge).toEqual({ containerGraphNodeId: "a", memberGraphNodeId: "b", mode: "outgoing" });
  });

  test("ignores non-ENCAPSULATES relationships", () => {
    expect(toEncapsulationEdge(relationship("r1", "a", "b", "INFLUENCES"))).toBeNull();
  });

  test("filters the relationship list", () => {
    const edges = encapsulationEdgesFromRelationships([
      relationship("r1", "a", "b", "ENCAPSULATES", "outgoing"),
      relationship("r2", "a", "b", "INFLUENCES"),
      relationship("r3", "c", "d", "ENCAPSULATES", "ingoing"),
    ]);
    expect(edges).toEqual([
      { containerGraphNodeId: "a", memberGraphNodeId: "b", mode: "outgoing" },
      { containerGraphNodeId: "c", memberGraphNodeId: "d", mode: "ingoing" },
    ]);
  });
});

describe("unfoldConstellation / compressToObject — data intact", () => {
  test("unfold returns internal members with full substance, compress restores", () => {
    const nodes = [
      node("constellation-a", { entityType: "Constellation", title: "The 4+2" }),
      node("m1", { title: "Member one" }),
      node("m2", { title: "Member two" }),
      node("outside", { title: "Outside" }),
    ];
    const relationships = [
      relationship("e1", "m1", "m2", "INFLUENCES"),
      relationship("e2", "m1", "outside", "INFLUENCES"),
    ];
    const edges = [encaps("constellation-a", "m1"), encaps("constellation-a", "m2")];

    const internal = unfoldConstellation("constellation-a", nodes, relationships, edges);
    expect(internal).not.toBeNull();
    expect(internal!.members.map((member) => member.graphNodeId).sort()).toEqual(["m1", "m2"]);
    // Data intact: the member keeps its summary.
    expect(internal!.members.find((member) => member.graphNodeId === "m1")!.summary).toBe("summary of m1");
    // Only real edges among members are included.
    expect(internal!.memberEdges.map((edge) => edge.id)).toEqual(["e1"]);

    const compressed = compressToObject(internal!);
    expect(compressed.objectNode.graphNodeId).toBe("constellation-a");
    expect(compressed.memberIds.sort()).toEqual(["m1", "m2"]);
  });

  test("unfold returns null for a non-container or missing node", () => {
    const nodes = [node("a"), node("b")];
    const edges = [encaps("a", "b")];
    expect(unfoldConstellation("b", nodes, [], edges)).toBeNull();
    expect(unfoldConstellation("missing", nodes, [], edges)).toBeNull();
  });

  test("isCompressed is true when the container is itself a member", () => {
    const nodes = [node("a"), node("b"), node("root")];
    const edges = [
      encaps("a", "b"),
      encaps("root", "a", "ingoing"),
    ];
    const internal = unfoldConstellation("a", nodes, [], edges);
    expect(internal!.isCompressed).toBe(true);
  });
});

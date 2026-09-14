import { describe, expect, test } from "vitest";

import type { GraphNode, GraphRelationship } from "@research-canvas/desktop-api";

import {
  compressToObject,
  encapsulationEdgesFromRelationships,
  type EncapsulationEdgeInput,
  unfoldConstellation,
} from "./encapsulation";
import { buildPalaceScene } from "./renderer";

/**
 * Form-shaping integration (B1 + F2): the ENCAPSULATES edges and QL-resonant
 * nodes are delivered in the exact contract `loadPalaceGraph` returns from the
 * graph repository — raw `GraphRelationship` objects with
 * `relType: "ENCAPSULATES"` and `properties.mode`, plus full `GraphNode`s with
 * QL metadata. The edges are converted through the same adapter the palace
 * host uses (`encapsulationEdgesFromRelationships`), so the real-store path
 * (Rust `palace_graph` test) and the form-shaping path share one shape.
 */

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
    ...over,
  };
}

/** A raw ENCAPSULATES `GraphRelationship` exactly as the graph repository
 * returns it (`GraphRepository::list_encapsulation_edges`). */
function encapsRelationship(
  id: string,
  container: string,
  member: string,
  mode: "outgoing" | "ingoing",
): GraphRelationship {
  return {
    id,
    relType: "ENCAPSULATES",
    sourceGraphNodeId: container,
    targetGraphNodeId: member,
    properties: { mode },
  };
}

/** A regular graph relationship (drives chamber clustering + constellation
 * member edges). */
function link(
  id: string,
  source: string,
  target: string,
): GraphRelationship {
  return { id, relType: "INFLUENCES", sourceGraphNodeId: source, targetGraphNodeId: target, properties: {} };
}

function edges(relationships: GraphRelationship[]): EncapsulationEdgeInput[] {
  return encapsulationEdgesFromRelationships(relationships);
}

/** Build a container constellation with `memberCount` members. The container
 * is the hub (degree = memberCount) so it anchors its chamber; the members are
 * connected to it by regular links so they cluster together. */
function constellation(
  container: string,
  memberCount: number,
  mode: "outgoing" | "ingoing" = "outgoing",
): { nodes: GraphNode[]; relationships: GraphRelationship[]; container: GraphNode } {
  const memberIds = Array.from({ length: memberCount }, (_, i) => `${container}-m${i + 1}`);
  const nodes = [
    node(container, { entityType: "Constellation", title: `${container} constellation` }),
    ...memberIds.map((id) => node(id)),
  ];
  const relationships = [
    ...memberIds.map((id) => link(`link:${container}:${id}`, container, id)),
    ...memberIds.map((id) =>
      encapsRelationship(`enc:${container}:${id}`, container, id, mode),
    ),
  ];
  return { nodes, relationships, container: nodes[0] };
}

describe("form-shaping on real ENCAPSULATES edges (buildPalaceScene)", () => {
  test("full 4+2 constellation (six members) becomes a room", () => {
    const { nodes, relationships } = constellation("container", 6);
    const scene = buildPalaceScene({
      nodes,
      relationships,
      profileScope: "migration",
      curation: null,
      encapsulationEdges: edges(relationships),
    });
    const chamber = scene.rooms.find((room) => room.anchorGraphNodeId === "container");
    expect(chamber).toBeTruthy();
    expect(chamber?.form).toBe("room");
  });

  test("partial constellations become faithful partial architecture, never a cube", () => {
    const expectations: Array<[number, "alcove" | "corridor" | "wallSection"]> = [
      [4, "alcove"],
      [2, "corridor"],
      [1, "wallSection"],
    ];
    for (const [count, expected] of expectations) {
      const { nodes, relationships } = constellation(`partial-${count}`, count);
      const scene = buildPalaceScene({
        nodes,
        relationships,
        profileScope: "migration",
        curation: null,
        encapsulationEdges: edges(relationships),
      });
      const chamber = scene.rooms.find(
        (room) => room.anchorGraphNodeId === `partial-${count}`,
      );
      expect(chamber).toBeTruthy();
      expect(chamber?.form).toBe(expected);
    }
  });

  test("a compressed constellation (ingoing edge) becomes a single palace object", () => {
    const outer = "outer";
    const inner = "inner";
    const nodes = [
      node(outer, { entityType: "Constellation" }),
      node(inner, { entityType: "Constellation" }),
      node("outer-m1"),
      node("inner-m1"),
      node("inner-m2"),
    ];
    const relationships = [
      link("link:outer:inner", outer, inner),
      link("link:outer:outer-m1", outer, "outer-m1"),
      // outer is a container (outgoing) — its members include inner.
      encapsRelationship("enc:outer:inner", outer, inner, "outgoing"),
      encapsRelationship("enc:outer:outer-m1", outer, "outer-m1", "outgoing"),
      // inner is itself a container (outgoing to its own members) …
      encapsRelationship("enc:inner:inner-m1", inner, "inner-m1", "outgoing"),
      encapsRelationship("enc:inner:inner-m2", inner, "inner-m2", "outgoing"),
      // … and is compressed into outer (ingoing, 1/0 pratibimba).
      encapsRelationship("enc:outer<-inner", outer, inner, "ingoing"),
    ];
    const scene = buildPalaceScene({
      nodes,
      relationships,
      profileScope: "migration",
      curation: null,
      encapsulationEdges: edges(relationships),
    });
    const compressed = scene.objects.find(
      (object) => object.kind === "compressedConstellation" && object.graphNodeId === inner,
    );
    expect(compressed).toBeTruthy();
    expect(scene.encapsulationObjects.some((entry) => entry.containerNodeId === inner)).toBe(true);
  });

  test("unfold returns the internal constellation with data intact; compress is its inverse", () => {
    const { nodes, relationships } = constellation("container", 6);
    const edgeInput = edges(relationships);
    const unfolded = unfoldConstellation("container", nodes, relationships, edgeInput);
    expect(unfolded).toBeTruthy();
    expect(unfolded?.members).toHaveLength(6);
    // Data intact: members keep their full GraphNode substance.
    expect(unfolded?.members.every((member) => member.title === member.graphNodeId)).toBe(true);
    expect(unfolded?.members.every((member) => member.graphNodeId.startsWith("container-m"))).toBe(true);
    // The container itself is preserved.
    expect(unfolded?.container.graphNodeId).toBe("container");
    // Compress returns the container and the member ids — the exact inverse.
    const compressed = compressToObject(unfolded!);
    expect(compressed.objectNode.graphNodeId).toBe("container");
    expect(compressed.memberIds.sort()).toEqual(
      unfolded!.members.map((member) => member.graphNodeId).sort(),
    );
  });
});

describe("QL 6+6' live-data shaping (bootstrapping profile only)", () => {
  function qlNode(id: string, unitId: string): GraphNode {
    return node(id, { qlUnitId: unitId, qlForm: "complete_sixfold", qlArc: "day" });
  }

  function qlConstellation(): { nodes: GraphNode[]; relationships: GraphRelationship[] } {
    const container = "ql-container";
    const members = ["ql-a", "ql-b", "ql-c"];
    const nodes = [
      node(container, { entityType: "Constellation" }),
      ...members.map((id) => qlNode(id, "ql-unit-1")),
    ];
    const relationships = [
      ...members.map((id) => link(`link:${id}`, container, id)),
      ...members.map((id) =>
        encapsRelationship(`enc:${id}`, container, id, "outgoing"),
      ),
    ];
    return { nodes, relationships };
  }

  test("bootstrapping rooms shape the six interior faces (P0–P5) + exterior conjugate (P0'–P5')", () => {
    const { nodes, relationships } = qlConstellation();
    const scene = buildPalaceScene({
      nodes,
      relationships,
      profileScope: "bootstrapping",
      curation: null,
      encapsulationEdges: edges(relationships),
    });
    const chamber = scene.rooms.find((room) => room.anchorGraphNodeId === "ql-container");
    expect(chamber).toBeTruthy();
    // Six interior faces with QL positions (P0 ground/source … P5 synthesis).
    expect(chamber?.interiorFaces).toHaveLength(6);
    expect(chamber?.interiorFaces.every((face) => face.qlPosition !== null)).toBe(true);
    // The conjugate Night position rides the room-as-object.
    expect(chamber?.exteriorConjugate).not.toBeNull();
    // Resonant members place on a QL face, not the floor/center.
    const resonant = chamber?.members.find((member) => member.nodeId === "ql-a");
    expect(resonant?.face).not.toBe("center");
    expect(resonant?.qlPosition).not.toBeNull();
  });

  test("non-bootstrapping profiles get neutral cube rooms (QL never forced)", () => {
    const { nodes, relationships } = qlConstellation();
    const scene = buildPalaceScene({
      nodes,
      relationships,
      profileScope: "migration",
      curation: null,
      encapsulationEdges: edges(relationships),
    });
    const chamber = scene.rooms.find((room) => room.anchorGraphNodeId === "ql-container");
    expect(chamber).toBeTruthy();
    expect(chamber?.interiorFaces.every((face) => face.qlPosition === null)).toBe(true);
    expect(chamber?.exteriorConjugate).toBeNull();
    // Members stay on the neutral floor/center.
    const resonant = chamber?.members.find((member) => member.nodeId === "ql-a");
    expect(resonant?.face).toBe("center");
    expect(resonant?.qlPosition).toBeNull();
  });
});

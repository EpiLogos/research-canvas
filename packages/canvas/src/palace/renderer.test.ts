import { describe, expect, test } from "vitest";

import type { GraphNode, GraphRelationship } from "@research-canvas/desktop-api";

import { clusterChambers } from "./clustering";
import { curateChambers } from "./curation";
import { buildPalaceScene, fixtureRotationY, type PalaceScene } from "./renderer";
import { QL_FACE_MAP } from "./ql";

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
    qlForm: over.qlForm ?? null,
    qlUnitId: over.qlUnitId ?? null,
    qlArc: over.qlArc ?? null,
    qlTopology: over.qlTopology ?? null,
    qlSchemaVersion: over.qlSchemaVersion ?? null,
    qlSourceCoordinates: [],
    qlCompletenessStatus: over.qlCompletenessStatus ?? null,
    isTemporal: over.isTemporal ?? false,
    validFrom: over.validFrom ?? null,
    validTo: over.validTo ?? null,
    temporalPrecision: over.temporalPrecision ?? null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function edge(
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

function baseScene(
  nodes: GraphNode[],
  relationships: GraphRelationship[],
  profileScope = "bootstrapping",
): PalaceScene {
  return buildPalaceScene({
    nodes,
    relationships,
    profileScope,
    curation: null,
    encapsulationEdges: relationships
      .filter((relationship) => relationship.relType === "ENCAPSULATES")
      .map((relationship) => ({
        containerGraphNodeId: relationship.sourceGraphNodeId,
        memberGraphNodeId: relationship.targetGraphNodeId,
        mode: (relationship.properties?.mode as "outgoing" | "ingoing") ?? "outgoing",
      })),
  });
}

// A 10-node cycle chunks into two chambers (n0–n7 and n8–n9) with cross edges
// n7–n8 and n9–n0 → real corridors between rooms.
const CYCLE_COUNT = 10;
const CORPUS = Array.from({ length: CYCLE_COUNT }, (_, i) =>
  node(`n${i}`, { title: `Node ${i}`, entityType: i % 2 === 0 ? "Event" : "Figure" }),
);
const CORPUS_EDGES = Array.from({ length: CYCLE_COUNT }, (_, i) =>
  edge(`ce${i}`, `n${i}`, `n${(i + 1) % CYCLE_COUNT}`),
);

describe("buildPalaceScene — rooms from real chamber clustering", () => {
  test("generates one room per walkable chamber, deterministically", () => {
    const scene = baseScene(CORPUS, CORPUS_EDGES);
    const again = baseScene(CORPUS, CORPUS_EDGES);
    expect(scene.rooms.length).toBeGreaterThanOrEqual(2);
    expect(scene.rooms.map((room) => room.id)).toEqual(again.rooms.map((room) => room.id));
    // Every room has real geometry.
    for (const room of scene.rooms) {
      expect(room.size.width).toBeGreaterThan(0);
      expect(room.size.height).toBeGreaterThan(0);
      expect(room.doorways.length).toBeGreaterThan(0);
    }
  });

  test("connections are graph edges between chambers", () => {
    const scene = baseScene(CORPUS, CORPUS_EDGES);
    // n7–n8 and n9–n0 connect the two chunked chambers → at least one corridor.
    expect(scene.connections.length).toBeGreaterThanOrEqual(1);
    for (const corridor of scene.connections) {
      expect(scene.rooms.some((room) => room.id === corridor.fromRoomId)).toBe(true);
      expect(scene.rooms.some((room) => room.id === corridor.toRoomId)).toBe(true);
    }
  });

  test("each chamber hosts a real constellation object laid out from its subgraph", () => {
    const scene = baseScene(CORPUS, CORPUS_EDGES);
    expect(scene.constellationObjects.length).toBeGreaterThanOrEqual(2);
    for (const constellation of scene.constellationObjects) {
      expect(constellation.nodes.length).toBeGreaterThanOrEqual(2);
      // Edges are the chamber's real internal graph edges.
      expect(constellation.edges.length).toBeGreaterThanOrEqual(1);
    }
  });

  test("a real collection derives from the chamber's coherent set", () => {
    const scene = baseScene(CORPUS, CORPUS_EDGES);
    expect(scene.collections.length).toBeGreaterThanOrEqual(1);
    for (const collection of scene.collections) {
      expect(collection.objectIds.length).toBeGreaterThan(0);
      expect(collection.title).not.toBe("");
    }
  });
});

describe("QL 6+6' — bootstrapping profile", () => {
  function qlScene() {
    // A chamber whose members all share a QL unit (a QL constellation), with a
    // non-resonant member connected in so it sits in the same chamber.
    const qlMembers = [
      node("q0", { qlUnitId: "ql-royal", title: "Zero" }),
      node("q1", { qlUnitId: "ql-royal", title: "One" }),
      node("q2", { qlUnitId: "ql-royal", title: "Two" }),
      node("q3", { qlUnitId: "ql-royal", title: "Three" }),
      node("q4", { qlUnitId: "ql-royal", title: "Four" }),
      node("q5", { qlUnitId: "ql-royal", title: "Five" }),
      node("plain", { title: "Plain" }),
    ];
    const qlEdges = [
      ...qlMembers
        .slice(0, 6)
        .map((member, index) =>
          edge(`q-e${index}`, member.graphNodeId, qlMembers[(index + 1) % 6].graphNodeId),
        ),
      edge("plain-e", "plain", "q0"),
    ];
    return { qlMembers, qlEdges };
  }

  function qlRoom(scene: PalaceScene) {
    const room = scene.rooms.find((candidate) => candidate.anchorGraphNodeId === "q0");
    if (!room) throw new Error("no QL chamber found");
    return room;
  }

  test("six interior faces map to P0–P5", () => {
    const { qlMembers, qlEdges } = qlScene();
    const room = qlRoom(baseScene(qlMembers, qlEdges));
    // QL-shaped: every face carries a QL position.
    const positions = room.interiorFaces.map((face) => face.qlPosition).sort();
    expect(positions).toEqual([0, 1, 2, 3, 4, 5]);
    // The mapping matches the canonical position–lens coordinates.
    for (const { face, qlPosition } of room.interiorFaces) {
      expect(qlPosition).toBe(QL_FACE_MAP[face]);
    }
  });

  test("resonant members place on the matching face; non-resonant on center", () => {
    const { qlMembers, qlEdges } = qlScene();
    const room = qlRoom(baseScene(qlMembers, qlEdges));
    const zero = room.members.find((member) => member.nodeId === "q0")!;
    const plain = room.members.find((member) => member.nodeId === "plain")!;
    expect(zero.qlPosition).toBe(0);
    // Position 0 is the floor (P0 ground/source).
    expect(zero.face).toBe("floor");
    expect(plain.face).toBe("center");
    expect(plain.qlPosition).toBeNull();
  });

  test("exterior conjugate faces sit on the room-as-object", () => {
    const { qlMembers, qlEdges } = qlScene();
    const room = qlRoom(baseScene(qlMembers, qlEdges));
    expect(room.exteriorConjugate).toBeGreaterThanOrEqual(0);
    expect(room.exteriorConjugate).toBeLessThanOrEqual(5);
    expect(room.doorways).toContain(room.exteriorFace);
  });
});

describe("neutral cube rooms for other profiles", () => {
  test("non-bootstrapping rooms carry no QL vocabulary", () => {
    const members = [
      node("q0", { qlUnitId: "ql-royal" }),
      node("q1", { qlUnitId: "ql-royal" }),
      node("q2", { qlUnitId: "ql-royal" }),
      node("q3", { qlUnitId: "ql-royal" }),
    ];
    const qlEdges = members.map((member, index) =>
      edge(`q-e${index}`, member.graphNodeId, members[(index + 1) % members.length].graphNodeId),
    );
    const scene = baseScene(members, qlEdges, "migration");
    const room = scene.rooms[0];
    // Neutral: no face maps to a QL position, no conjugate on the exterior.
    for (const face of room.interiorFaces) {
      expect(face.qlPosition).toBeNull();
    }
    expect(room.exteriorConjugate).toBeNull();
    // QL is never forced into visible vocabulary.
    expect(scene.objects.some((object) => object.title.includes("P0"))).toBe(false);
  });
});

describe("encapsulation objectification", () => {
  test("a compressed constellation exists as a single palace object", () => {
    const nodes = [
      node("root", { entityType: "Constellation", title: "Root" }),
      node("container", { entityType: "Constellation", title: "Nested" }),
      node("m1", { title: "Member 1" }),
      node("m2", { title: "Member 2" }),
    ];
    const relationships = [
      // container is compressed into root (single palace object in root's room).
      edge("enc-in", "root", "container", "ENCAPSULATES", "ingoing"),
      // container itself is a constellation with two members.
      edge("enc1", "container", "m1", "ENCAPSULATES", "outgoing"),
      edge("enc2", "container", "m2", "ENCAPSULATES", "outgoing"),
    ];
    const scene = baseScene(nodes, relationships);
    const compressed = scene.objects.find((object) => object.kind === "compressedConstellation");
    expect(compressed).toBeDefined();
    expect(compressed!.graphNodeId).toBe("container");
    expect(scene.encapsulationObjects).toContainEqual({
      objectId: compressed!.id,
      containerNodeId: "container",
      roomId: compressed!.roomId,
    });
  });

  test("a full constellation anchor shapes its room as a cube room", () => {
    const members = ["m1", "m2", "m3", "m4", "m5", "m6"];
    const nodes = [
      node("full", { entityType: "Constellation", title: "Full 4+2" }),
      ...members.map((id) => node(id)),
    ];
    const relationships = members.map((id, index) =>
      edge(`enc${index}`, "full", id, "ENCAPSULATES", "outgoing"),
    );
    const scene = baseScene(nodes, relationships);
    // The full constellation is the anchor of a chamber → its room is a cube.
    const room = scene.rooms.find((candidate) => candidate.anchorGraphNodeId === "full");
    expect(room).toBeDefined();
    expect(room!.form).toBe("room");
  });

  test("partial constellations shape faithful partial architecture, never a forced cube", () => {
    const nodes = [
      node("partial", { entityType: "Constellation", title: "Dyad" }),
      node("p1"),
      node("p2"),
      node("other"),
    ];
    const relationships = [
      edge("enc1", "partial", "p1", "ENCAPSULATES", "outgoing"),
      edge("enc2", "partial", "p2", "ENCAPSULATES", "outgoing"),
      // Keeps `partial` as the highest-degree anchor of the chamber.
      edge("rel", "partial", "other", "INFLUENCES"),
    ];
    const scene = baseScene(nodes, relationships);
    const room = scene.rooms.find((candidate) => candidate.anchorGraphNodeId === "partial");
    expect(room).toBeDefined();
    // Two members → corridor (a passage), never a cube.
    expect(room!.form).toBe("corridor");
  });
});

describe("wall fixtures", () => {
  test("every room carries a title plaque and member text panels", () => {
    const scene = baseScene(CORPUS, CORPUS_EDGES);
    expect(scene.fixtures.length).toBeGreaterThanOrEqual(2);
    // At least one title plaque per room.
    for (const room of scene.rooms) {
      const plaque = scene.fixtures.find(
        (fixture) =>
          fixture.roomId === room.id && fixture.kind === "titlePlaque",
      );
      expect(plaque).toBeDefined();
      expect(plaque!.face).toBe(room.exteriorFace);
      expect(plaque!.title).not.toBe("");
    }
    // Member text panels derive from real substance and face the room center.
    const panels = scene.fixtures.filter(
      (fixture) => fixture.kind === "textPanel",
    );
    for (const panel of panels) {
      expect(panel.sourceGraphNodeId).toBeTruthy();
      expect(panel.rotationY).toBe(fixtureRotationY(panel.face));
    }
  });

  test("curated fixtures overlay the generated defaults", () => {
    const base = baseScene(CORPUS, CORPUS_EDGES);
    const roomId = base.rooms[0].id;
    const candidates = clusterChambers(CORPUS, CORPUS_EDGES);
    const nodesById = new Map(CORPUS.map((item) => [item.graphNodeId, item]));
    const curated = curateChambers(candidates, nodesById, "bootstrapping");
    curated.fixtures.push({
      fixtureId: "fixture:custom",
      roomId,
      kind: "titlePlaque",
      face: "south",
      title: "Custom plaque",
      contentRef: "note:custom",
      sourceGraphNodeId: null,
    });
    const scene = buildPalaceScene({
      nodes: CORPUS,
      relationships: CORPUS_EDGES,
      profileScope: "bootstrapping",
      curation: curated,
      encapsulationEdges: [],
    });
    const custom = scene.fixtures.find(
      (fixture) => fixture.id === "fixture:custom",
    );
    expect(custom).toBeDefined();
    expect(custom!.title).toBe("Custom plaque");
    expect(custom!.face).toBe("south");
  });
});

describe("regeneration stability", () => {
  test("deterministic generation over the same graph is byte-stable", () => {
    const sceneA = baseScene(CORPUS, CORPUS_EDGES);
    const sceneB = baseScene(CORPUS, CORPUS_EDGES);
    expect(JSON.stringify(sceneA)).toBe(JSON.stringify(sceneB));
  });
});

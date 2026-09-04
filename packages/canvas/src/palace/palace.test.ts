import { describe, expect, test } from "vitest";
import {
  sceneSequenceSchema,
  type SceneSequence,
} from "@research-canvas/schema";
import type { GraphNode, GraphRelationship } from "@research-canvas/desktop-api";

import {
  chamberTitle,
  clusterChambers,
  type ChamberCandidate,
} from "./clustering";
import {
  curateChambers,
  excludeChamber,
  pinChamber,
  renameChamber,
  reorderChamber,
  walkableChambers,
} from "./curation";
import {
  assemblePalaceWalk,
  recallRevealCount,
} from "./palaceWalk";

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

function edge(id: string, source: string, target: string): GraphRelationship {
  return { id, relType: "INFLUENCES", sourceGraphNodeId: source, targetGraphNodeId: target, properties: {} };
}

function sequence(sceneIds: string[]): SceneSequence {
  return sceneSequenceSchema.parse({
    id: "sequence-palace",
    profileScope: "bootstrapping",
    name: "Palace walk",
    sceneIds,
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
  });
}

describe("clusterChambers", () => {
  const nodes = [
    node("a"),
    node("b"),
    node("c"),
    node("d"),
    node("e"),
    node("f"),
  ];
  const relationships = [
    edge("e1", "a", "b"),
    edge("e2", "b", "c"),
    edge("e3", "d", "e"),
    edge("e4", "e", "f"),
  ];

  test("chambers are connected components anchored to the highest-degree node", () => {
    const chambers = clusterChambers(nodes, relationships);
    const anchors = chambers.map((chamber) => chamber.anchorGraphNodeId).sort();
    // a-b-c and d-e-f are both lines: b and e are the degree-2 anchors.
    expect(anchors).toEqual(["b", "e"]);
    const first = chambers.find((chamber) => chamber.anchorGraphNodeId === "b")!;
    expect(first.memberNodeIds.sort()).toEqual(["a", "b", "c"]);
    expect(first.internalEdgeIds).toEqual(["e1", "e2"]);
  });

  test("chunking keeps chambers at or under the maximum size", () => {
    const bigComponent = Array.from({ length: 20 }, (_, index) =>
      node(`n${index}`),
    );
    const chain = bigComponent.slice(0, -1).map((current, index) =>
      edge(`edge-${index}`, current.graphNodeId, `n${index + 1}`),
    );
    const chambers = clusterChambers(bigComponent, chain, {
      maxChamberSize: 5,
    });
    expect(chambers.every((chamber) => chamber.memberNodeIds.length <= 5)).toBe(
      true,
    );
    expect(chambers).toHaveLength(4);
  });

  test("isolated nodes form their own chambers", () => {
    const chambers = clusterChambers([node("solo")], []);
    expect(chambers).toHaveLength(1);
    expect(chambers[0].memberNodeIds).toEqual(["solo"]);
  });
});

describe("curation", () => {
  const candidates: ChamberCandidate[] = [
    {
      id: "chamber:b",
      anchorGraphNodeId: "b",
      memberNodeIds: ["a", "b", "c"],
      internalEdgeIds: ["e1", "e2"],
    },
    {
      id: "chamber:e",
      anchorGraphNodeId: "e",
      memberNodeIds: ["d", "e", "f"],
      internalEdgeIds: ["e3", "e4"],
    },
  ];
  const nodesById = new Map([
    ["b", node("b", { title: "Council" })],
    ["e", node("e", { title: "Exile" })],
  ]);

  test("profile-aware titles shape bootstrapping and migration chambers", () => {
    const bootstrapping = chamberTitle(
      node("arch", { entityType: "Archetype", title: "Monopoly" }),
      "bootstrapping",
    );
    expect(bootstrapping).toContain("archetype");
    const migration = chamberTitle(
      node("p", { entityType: "Place", title: "Florence" }),
      "migration",
    );
    expect(migration).toContain("place of the journey");
  });

  test("pin, exclude, rename and reorder never touch the candidate set", () => {
    let curation = curateChambers(candidates, nodesById, "bootstrapping");
    curation = pinChamber(curation, "chamber:e");
    curation = renameChamber(curation, "chamber:b", "The council chamber");
    curation = reorderChamber(curation, "chamber:e", 0);

    expect(curation.chambers[0].title).toBe("Exile");
    expect(curation.chambers[0].pinned).toBe(true);
    expect(curation.chambers[1].title).toBe("The council chamber");
    expect(candidates[0].id).toBe("chamber:b");
    expect(candidates[1].internalEdgeIds).toEqual(["e3", "e4"]);
  });

  test("walkable chambers drop excluded and put pinned first", () => {
    let curation = curateChambers(candidates, nodesById, "bootstrapping");
    curation = excludeChamber(curation, "chamber:b");
    curation = pinChamber(curation, "chamber:e");
    expect(walkableChambers(curation).map((chamber) => chamber.candidateId)).toEqual([
      "chamber:e",
    ]);
  });
});

describe("assemblePalaceWalk", () => {
  test("a curated chamber sequence becomes a walk with chamber anchors", () => {
    const candidates: ChamberCandidate[] = [
      {
        id: "chamber:b",
        anchorGraphNodeId: "b",
        memberNodeIds: ["a", "b", "c"],
        internalEdgeIds: [],
      },
      {
        id: "chamber:e",
        anchorGraphNodeId: "e",
        memberNodeIds: ["d", "e", "f"],
        internalEdgeIds: [],
      },
    ];
    const curation = curateChambers(
      candidates,
      new Map([
        ["b", node("b", { title: "Council" })],
        ["e", node("e", { title: "Exile" })],
      ]),
      "bootstrapping",
    );
    const memberCounts = new Map([
      ["chamber:b", 3],
      ["chamber:e", 3],
    ]);

    const walk = assemblePalaceWalk(
      sequence(["chamber:b", "chamber:e"]),
      curation,
      memberCounts,
    );
    expect(walk.stops.map((stop) => stop.anchorGraphNodeId)).toEqual(["b", "e"]);
    expect(walk.stops[0].memberCount).toBe(3);
  });

  test("guided recall reveals stops one at a time", () => {
    const walk = assemblePalaceWalk(
      sequence(["chamber:b", "chamber:e"]),
      {
        chambers: [
          {
            candidateId: "chamber:b",
            anchorGraphNodeId: "b",
            title: "Council",
            pinned: false,
            excluded: false,
            position: 0,
          },
          {
            candidateId: "chamber:e",
            anchorGraphNodeId: "e",
            title: "Exile",
            pinned: false,
            excluded: false,
            position: 1,
          },
        ],
        objects: [],
        fixtures: [],
        collections: [],
      },
      new Map(),
      "recall",
    );
    expect(recallRevealCount(walk, 1)).toBe(1);
    expect(recallRevealCount(walk, 99)).toBe(2);
    expect(recallRevealCount(walk, -1)).toBe(0);
  });
});

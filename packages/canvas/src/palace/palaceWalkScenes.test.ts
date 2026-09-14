import { describe, expect, test } from "vitest";

import type { GraphNode } from "@research-canvas/desktop-api";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";

import { clusterChambers } from "./clustering";
import { curateChambers, pinChamber } from "./curation";
import {
  buildPalaceWalkScenes,
  buildPalaceWalkSequence,
} from "./palaceWalk";

function node(
  id: string,
  title: string,
  entityType: string,
  over: Partial<GraphNode> = {},
): GraphNode {
  return {
    graphNodeId: id,
    entityType: entityType as GraphNode["entityType"],
    title,
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    ...EMPTY_GRAPH_NODE_METADATA,
    isTemporal: over.isTemporal ?? true,
    validFrom: over.validFrom ?? "1600-01-01",
    validTo: over.validTo ?? null,
    temporalPrecision: over.temporalPrecision ?? "year",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

const nodes = [
  node("council", "Council of Florence", "Event", {
    validFrom: "1438-01-01",
    validTo: "1445-12-31",
  }),
  node("florence", "Florence", "Place", {
    isTemporal: false,
    validFrom: null,
    validTo: null,
    temporalPrecision: null,
  }),
  node("monopoly", "Monopoly mechanism", "Archetype", {
    isTemporal: false,
    validFrom: null,
    validTo: null,
    temporalPrecision: null,
  }),
  node("banda", "Banda genocide", "Event", {
    validFrom: "1621-01-01",
    validTo: "1621-12-31",
  }),
];

const relationships = [
  {
    id: "r1",
    relType: "LOCATED_AT",
    sourceGraphNodeId: "council",
    targetGraphNodeId: "florence",
    properties: {},
  },
  {
    id: "r2",
    relType: "INSTANTIATES",
    sourceGraphNodeId: "council",
    targetGraphNodeId: "monopoly",
    properties: {},
  },
];

describe("buildPalaceWalkScenes", () => {
  test("builds scenes only for chambers with temporal anchors", () => {
    const candidates = clusterChambers(nodes, relationships, {
      maxChamberSize: 8,
    });
    const nodesById = new Map(nodes.map((item) => [item.graphNodeId, item]));
    const curation = curateChambers(candidates, nodesById, "bootstrapping");

    const { scenes } = buildPalaceWalkScenes(
      curation,
      candidates,
      nodesById,
      "bootstrapping",
    );

    // The council/florence/monopoly cluster anchors on the highest-degree
    // temporal node (council); the Banda chamber anchors on a temporal event.
    expect(scenes.length).toBeGreaterThan(0);
    for (const scene of scenes) {
      expect(scene.timeWindow.start).toBeTruthy();
      expect(scene.placeFrame.placeId.length).toBeGreaterThan(0);
      expect(scene.assembledBy).toBe("agent");
    }
    const sequence = buildPalaceWalkSequence(curation, scenes, "bootstrapping");
    expect(sequence.sceneIds).toEqual(scenes.map((scene) => scene.id));
    expect(sequence.profileScope).toBe("bootstrapping");
  });

  test("pinned chambers lead the walk order", () => {
    const candidates = clusterChambers(nodes, relationships, {
      maxChamberSize: 8,
    });
    const nodesById = new Map(nodes.map((item) => [item.graphNodeId, item]));
    let curation = curateChambers(candidates, nodesById, "bootstrapping");
    const bandaChamber = curation.chambers.find(
      (chamber) => chamber.anchorGraphNodeId === "banda",
    );
    if (!bandaChamber) {
      throw new Error("fixture expected a Banda chamber");
    }
    curation = pinChamber(curation, bandaChamber.candidateId);

    const { scenes } = buildPalaceWalkScenes(
      curation,
      candidates,
      nodesById,
      "bootstrapping",
    );
    expect(scenes[0].placeFrame.placeId).toBe("banda");
  });
});

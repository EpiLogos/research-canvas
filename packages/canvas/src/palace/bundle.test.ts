import { describe, expect, test } from "vitest";

import type { GraphNode, GraphRelationship } from "@research-canvas/desktop-api";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";

import { buildPalaceBundle, validatePalaceBundle } from "./bundle";
import { clusterChambers } from "./clustering";
import { curateChambers } from "./curation";
import { buildPalaceScene } from "./renderer";

function node(id: string, entityType = "Event", over: Partial<GraphNode> = {}): GraphNode {
  return {
    graphNodeId: id,
    entityType: entityType as GraphNode["entityType"],
    title: id,
    body: "[]",
    summary: `summary of ${id}`,
    archetypalResonance: null,
    coordinate: null,
    ...EMPTY_GRAPH_NODE_METADATA,
    sourceCoordinates: [] as string[],
    evidenceTags: [] as string[],
    bodySourceCoordinates: [] as string[],
    qlSourceCoordinates: [] as string[],
    isTemporal: false,
    validFrom: null,
    validTo: null,
    temporalPrecision: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
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

const NODES = [
  node("root", "Constellation"),
  node("container", "Constellation"),
  node("m1", "Event"),
  node("m2", "Event"),
  node("plain", "Place"),
];

const RELATIONSHIPS = [
  edge("e1", "root", "container", "ENCAPSULATES", "ingoing"),
  edge("e2", "container", "m1", "ENCAPSULATES", "outgoing"),
  edge("e3", "container", "m2", "ENCAPSULATES", "outgoing"),
  edge("e4", "root", "plain", "INFLUENCES"),
];

function buildBundle() {
  const encapsulationEdges = RELATIONSHIPS.filter(
    (relationship) => relationship.relType === "ENCAPSULATES",
  ).map((relationship) => ({
    containerGraphNodeId: relationship.sourceGraphNodeId,
    memberGraphNodeId: relationship.targetGraphNodeId,
    mode: (relationship.properties?.mode as "outgoing" | "ingoing") ?? "outgoing",
  }));
  const candidates = clusterChambers(NODES, RELATIONSHIPS);
  const nodesById = new Map(NODES.map((item) => [item.graphNodeId, item]));
  const curation = curateChambers(candidates, nodesById, "bootstrapping");
  const scene = buildPalaceScene({
    nodes: NODES,
    relationships: RELATIONSHIPS,
    profileScope: "bootstrapping",
    curation,
    encapsulationEdges,
  });
  return buildPalaceBundle({
    scene,
    nodes: NODES,
    relationships: RELATIONSHIPS,
    encapsulationEdges,
    curation,
  });
}

describe("buildPalaceBundle", () => {
  test("serializes the scene plus its graph inputs into a versioned bundle", () => {
    const bundle = buildBundle();
    expect(bundle.formatVersion).toBe(1);
    expect(bundle.profileScope).toBe("bootstrapping");
    expect(bundle.scene.rooms.length).toBeGreaterThan(0);
    expect(bundle.nodes.map((n) => n.graphNodeId)).toContain("container");
    expect(bundle.relationships).toHaveLength(RELATIONSHIPS.length);
    expect(bundle.encapsulationEdges.some((e) => e.containerGraphNodeId === "container")).toBe(
      true,
    );
    expect(bundle.curation).not.toBeNull();
    // The scene is pure plain data — it round-trips through JSON losslessly,
    // which is exactly what the export writes to disk.
    const roundTripped = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
    expect(roundTripped.scene).toEqual(bundle.scene);
    expect(roundTripped.nodes).toEqual(bundle.nodes);
  });
});

describe("validatePalaceBundle", () => {
  test("accepts a well-formed bundle", () => {
    const bundle = buildBundle();
    expect(validatePalaceBundle(bundle)).toEqual(bundle);
  });

  test("accepts a bundle that went through JSON serialization (export round-trip)", () => {
    const bundle = buildBundle();
    const parsed = validatePalaceBundle(JSON.parse(JSON.stringify(bundle)));
    expect(parsed).toEqual(bundle);
  });

  test("rejects non-object, wrong formatVersion, and missing scene", () => {
    expect(validatePalaceBundle(null)).toBeNull();
    expect(validatePalaceBundle("palace")).toBeNull();
    expect(validatePalaceBundle({ ...buildBundle(), formatVersion: 2 })).toBeNull();
    const { scene: _scene, ...withoutScene } = buildBundle();
    expect(validatePalaceBundle(withoutScene)).toBeNull();
  });

  test("rejects bundles whose scene is not an object with rooms", () => {
    expect(validatePalaceBundle({ formatVersion: 1, profileScope: "bootstrapping", scene: null, nodes: [], relationships: [], encapsulationEdges: [] })).toBeNull();
    expect(validatePalaceBundle({ formatVersion: 1, profileScope: "bootstrapping", scene: { rooms: "nope" }, nodes: [], relationships: [], encapsulationEdges: [] })).toBeNull();
  });
});

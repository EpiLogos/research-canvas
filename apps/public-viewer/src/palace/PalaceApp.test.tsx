import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import type { GraphNode, GraphRelationship } from "@research-canvas/desktop-api";
import {
  buildPalaceBundle,
  buildPalaceScene,
  clusterChambers,
  curateChambers,
} from "@research-canvas/canvas";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import { describe, expect, it } from "vitest";

import { PalaceApp, readBootstrappedPalaceBundle } from "./PalaceApp";

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
];

const RELATIONSHIPS = [
  edge("e1", "root", "container", "ENCAPSULATES", "ingoing"),
  edge("e2", "container", "m1", "ENCAPSULATES", "outgoing"),
  edge("e3", "container", "m2", "ENCAPSULATES", "outgoing"),
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

describe("public-viewer PalaceApp (offline 3D mind palace)", () => {
  it("renders the palace surface read-only from a bundle", () => {
    render(<PalaceApp bundle={buildBundle()} />);
    // jsdom has no WebGL2 → the deterministic error banner path renders, and
    // the shared PalaceSurface mounts its overlays.
    expect(screen.getByTestId("palace-surface")).toBeInTheDocument();
    expect(screen.getByTestId("palace-error")).toBeInTheDocument();
    expect(screen.getAllByTestId(/palace-chamber-/).length).toBeGreaterThan(0);
    // Read-only: no curation mutations, no save state, no export button.
    expect(screen.queryByTestId(/palace-pin-/)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/palace-exclude-/)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/palace-rename-/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("palace-save-state")).not.toBeInTheDocument();
    expect(screen.queryByTestId("palace-export-bundle")).not.toBeInTheDocument();
  });

  it("reads an inlined window.__RESEARCH_CANVAS_PALACE_BUNDLE__", () => {
    const bundle = buildBundle();
    (window as unknown as { __RESEARCH_CANVAS_PALACE_BUNDLE__?: unknown }).__RESEARCH_CANVAS_PALACE_BUNDLE__ =
      JSON.parse(JSON.stringify(bundle));
    expect(readBootstrappedPalaceBundle()).toEqual(bundle);
    delete (window as unknown as { __RESEARCH_CANVAS_PALACE_BUNDLE__?: unknown })
      .__RESEARCH_CANVAS_PALACE_BUNDLE__;
  });

  it("rejects a malformed inlined palace bundle", () => {
    (window as unknown as { __RESEARCH_CANVAS_PALACE_BUNDLE__?: unknown }).__RESEARCH_CANVAS_PALACE_BUNDLE__ =
      { formatVersion: 2 };
    expect(readBootstrappedPalaceBundle()).toBeNull();
    delete (window as unknown as { __RESEARCH_CANVAS_PALACE_BUNDLE__?: unknown })
      .__RESEARCH_CANVAS_PALACE_BUNDLE__;
  });
});

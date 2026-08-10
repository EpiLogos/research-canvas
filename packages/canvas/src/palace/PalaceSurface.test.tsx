import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { GraphNode, GraphRelationship } from "@research-canvas/desktop-api";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";

import { clusterChambers } from "./clustering";
import { curateChambers, type PalaceCuration } from "./curation";
import { buildPalaceScene } from "./renderer";
import { PalaceSurface } from "./PalaceSurface";

function node(id: string, entityType = "Event", over: Partial<GraphNode> = {}): GraphNode {
  return {
    graphNodeId: id,
    entityType: entityType as GraphNode["entityType"],
    title: id,
    body: "[]",
    summary: `summary of ${id}`,
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    evidenceTags: [],
    ...EMPTY_GRAPH_NODE_METADATA,
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

const ENCAPSULATION_EDGES = RELATIONSHIPS.filter(
  (relationship) => relationship.relType === "ENCAPSULATES",
).map((relationship) => ({
  containerGraphNodeId: relationship.sourceGraphNodeId,
  memberGraphNodeId: relationship.targetGraphNodeId,
  mode: relationship.properties?.mode ?? "outgoing",
}));

function renderSurface(onSaveCuration?: (curation: PalaceCuration) => void) {
  const candidates = clusterChambers(NODES, RELATIONSHIPS);
  const nodesById = new Map(NODES.map((item) => [item.graphNodeId, item]));
  const curation = curateChambers(candidates, nodesById, "bootstrapping");
  const scene = buildPalaceScene({
    nodes: NODES,
    relationships: RELATIONSHIPS,
    profileScope: "bootstrapping",
    curation,
    encapsulationEdges: ENCAPSULATION_EDGES,
  });
  const save = vi.fn(async (next: PalaceCuration) => next);
  render(
    <PalaceSurface
      scene={scene}
      nodes={NODES}
      relationships={RELATIONSHIPS}
      encapsulationEdges={ENCAPSULATION_EDGES}
      curation={curation}
      onSaveCuration={onSaveCuration ?? save}
    />,
  );
  return { save };
}

describe("PalaceSurface (jsdom, WebGL unavailable)", () => {
  test("shows a clear error banner and still renders the curation overlays", () => {
    renderSurface();
    // WebGL2 is unavailable in the jsdom harness → the error state is the
    // deterministic unit-test path.
    expect(screen.getByTestId("palace-error")).toBeInTheDocument();
    // The curation overlays render regardless of WebGL.
    expect(screen.getAllByTestId(/palace-chamber-/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("palace-objects")).toBeInTheDocument();
    expect(screen.getByTestId("palace-collections")).toBeInTheDocument();
    expect(screen.getByTestId("palace-constellations")).toBeInTheDocument();
  });

  test("real objects, collections and constellation objects surface from the graph", () => {
    renderSurface();
    // Real member objects (m1, m2, plain) appear; the compressed constellation
    // is a single palace object with an Enter affordance.
    const objects = screen.getAllByTestId(/^palace-object-obj:/);
    expect(objects.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByTestId("palace-enter-obj:container")).toBeInTheDocument();
    // A real collection derives from the chamber's coherent set.
    const collections = screen.getAllByTestId(/^palace-collection-/);
    expect(collections.length).toBeGreaterThan(0);
    // A real constellation object hosts the chamber's subgraph.
    const constellations = screen.getAllByTestId(/^palace-constellation-/);
    expect(constellations.length).toBeGreaterThan(0);
    expect(Number(constellations[0].getAttribute("data-members"))).toBeGreaterThan(0);
  });

  test("pinning a chamber persists through onSaveCuration", async () => {
    const save = vi.fn(async (next: PalaceCuration) => next);
    renderSurface(save);
    fireEvent.click(screen.getAllByTestId(/palace-pin-/)[0]);
    expect(save).toHaveBeenCalled();
    const saved = save.mock.calls[0]?.[0] as PalaceCuration;
    expect(saved.chambers.some((chamber) => chamber.pinned)).toBe(true);
  });

  test("guided recall reveals chambers one at a time over the walk order", () => {
    renderSurface();
    fireEvent.click(screen.getByTestId("palace-mode-recall"));
    expect(screen.getByTestId("palace-recall")).toBeInTheDocument();
    const initialRevealed = screen
      .getByTestId("palace-recall")
      .textContent?.match(/Revealed (\d+)/)?.[1];
    expect(Number(initialRevealed)).toBe(1);
    if (screen.queryByTestId("palace-reveal-next")) {
      fireEvent.click(screen.getByTestId("palace-reveal-next"));
      const next = screen
        .getByTestId("palace-recall")
        .textContent?.match(/Revealed (\d+)/)?.[1];
      expect(Number(next)).toBeGreaterThan(Number(initialRevealed));
    }
  });

  test("entering a compressed constellation unfolds and exiting compresses back", () => {
    renderSurface();
    fireEvent.click(screen.getByTestId("palace-enter-obj:container"));
    expect(screen.getByTestId("palace-constellation-open")).toBeInTheDocument();
    // The unfolded interior names the container with its member count.
    expect(screen.getByTestId("palace-constellation-open")).toHaveTextContent(
      "container",
    );
    fireEvent.click(screen.getByTestId("palace-exit"));
    expect(screen.queryByTestId("palace-constellation-open")).not.toBeInTheDocument();
  });
});

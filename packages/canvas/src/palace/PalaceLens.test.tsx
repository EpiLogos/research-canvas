import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { GraphNode } from "@research-canvas/desktop-api";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";

import { PalaceLens } from "./PalaceLens";

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

describe("PalaceLens", () => {
  test("generates chambers from graph structure with members and paths", () => {
    render(
      <PalaceLens
        nodes={nodes}
        relationships={relationships}
        profileScope="bootstrapping"
        curation={null}
        onSaveCuration={vi.fn()}
      />,
    );

    expect(screen.getByTestId("palace-lens")).toBeInTheDocument();
    expect(screen.getAllByTestId(/palace-chamber-/)).toHaveLength(2);
    expect(screen.getAllByText("Council of Florence").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Banda genocide").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Florence").length).toBeGreaterThan(0);
  });

  test("curation actions pin, rename, and persist without touching the graph", () => {
    const onSaveCuration = vi.fn();
    render(
      <PalaceLens
        nodes={nodes}
        relationships={relationships}
        profileScope="bootstrapping"
        curation={null}
        onSaveCuration={onSaveCuration}
      />,
    );

    fireEvent.click(screen.getByTestId("palace-pin-chamber:council"));
    expect(onSaveCuration).toHaveBeenCalled();
    const pinned = onSaveCuration.mock.calls[0][0] as {
      chambers: Array<{ pinned: boolean }>;
    };
    expect(pinned.chambers.find((chamber) => chamber.pinned)).toBeTruthy();

    fireEvent.click(screen.getByTestId("palace-rename-chamber:council"));
    fireEvent.change(screen.getByTestId("palace-rename-input-chamber:council"), {
      target: { value: "Conciliar studiolo" },
    });
    fireEvent.click(screen.getByTestId("palace-rename-confirm"));
    expect(screen.getByText("Conciliar studiolo")).toBeInTheDocument();
  });

  test("guided recall reveals chambers one at a time", () => {
    render(
      <PalaceLens
        nodes={nodes}
        relationships={relationships}
        profileScope="bootstrapping"
        curation={null}
        onSaveCuration={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("palace-mode-recall"));
    expect(screen.getAllByTestId(/palace-chamber-/)).toHaveLength(1);
    fireEvent.click(screen.getByTestId("palace-reveal-next"));
    expect(screen.getAllByTestId(/palace-chamber-/)).toHaveLength(2);
    expect(screen.getByTestId("palace-recall-restart")).toBeInTheDocument();
  });

  test("persisting the walk emits a scene sequence over temporal anchors", () => {
    const onPersistWalk = vi.fn();
    render(
      <PalaceLens
        nodes={nodes}
        relationships={relationships}
        profileScope="bootstrapping"
        curation={null}
        onSaveCuration={vi.fn()}
        onPersistWalk={onPersistWalk}
      />,
    );

    fireEvent.click(screen.getByTestId("palace-persist-walk"));
    expect(onPersistWalk).toHaveBeenCalled();
    const walk = onPersistWalk.mock.calls[0][0] as {
      sequence: { sceneIds: string[] };
      scenes: Array<{ id: string }>;
    };
    expect(walk.scenes.length).toBeGreaterThan(0);
    expect(walk.sequence.sceneIds).toEqual(walk.scenes.map((scene) => scene.id));
  });
});

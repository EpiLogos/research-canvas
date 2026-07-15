import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, test, vi } from "vitest";
import type { GraphNode, LitInstance, TimelineRelationField as RelationFieldData } from "./contracts";
import { TimelineRelationField } from "./TimelineRelationField";

function node(graphNodeId: string, title: string, entityType: GraphNode["entityType"]): GraphNode {
  return {
    graphNodeId,
    entityType,
    title,
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    ...EMPTY_GRAPH_NODE_METADATA,
    isTemporal: entityType === "Event",
    validFrom: entityType === "Event" ? "1900-01-01" : null,
    validTo: null,
    temporalPrecision: entityType === "Event" ? "year" : null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

const subject = node("event", "Historical event", "Event");
const archetype = node("archetype", "Antichrist archetype", "Archetype");
const companion = node("companion", "Another event", "Event");

const field: RelationFieldData = {
  subjectGraphNodeId: subject.graphNodeId,
  contextualNodes: [archetype, companion],
  relationships: [
    {
      id: "instantiates-1",
      relType: "INSTANTIATES",
      sourceGraphNodeId: subject.graphNodeId,
      targetGraphNodeId: archetype.graphNodeId,
      properties: {},
    },
    {
      id: "instantiates-duplicate",
      relType: "INSTANTIATES",
      sourceGraphNodeId: subject.graphNodeId,
      targetGraphNodeId: archetype.graphNodeId,
      properties: {},
    },
    {
      id: "causes-companion",
      relType: "CAUSES" as RelationFieldData["relationships"][number]["relType"],
      sourceGraphNodeId: subject.graphNodeId,
      targetGraphNodeId: companion.graphNodeId,
      properties: {},
    },
  ],
};

const resonances: LitInstance[] = [
  { node: archetype, relType: "INSTANTIATES", dominance: "dominant" },
  { node: node("myth", "Flood myth", "Myth"), relType: "RESONATES_WITH", dominance: "secondary" },
];

function renderField(overrides: Partial<ComponentProps<typeof TimelineRelationField>> = {}) {
  return render(
    <TimelineRelationField
      field={field}
      resonances={resonances}
      showRelations
      showArchetypalContext
      onOpenNode={vi.fn()}
      onLightOperator={vi.fn()}
      {...overrides}
    />,
  );
}

describe("TimelineRelationField", () => {
  test("deduplicates relation/resonance content and exact duplicate relationships", () => {
    renderField();

    expect(screen.getByTestId("timeline-relation-instantiates-1")).toHaveTextContent("×2");
    expect(screen.queryByTestId("timeline-relation-instantiates-duplicate")).not.toBeInTheDocument();
    expect(screen.queryByTestId("timeline-resonance-archetype")).not.toBeInTheDocument();
    expect(screen.getByTestId("timeline-resonance-myth")).toHaveTextContent("Flood myth");
  });

  test("keeps links and archetypal context independently toggleable", () => {
    const light = vi.fn();
    const { rerender } = renderField({ showRelations: false, onLightOperator: light });
    expect(screen.queryByTestId("timeline-relation-instantiates-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("timeline-relation-causes-companion")).not.toBeInTheDocument();
    expect(screen.getByTestId("timeline-resonance-archetype")).toBeInTheDocument();

    rerender(
      <TimelineRelationField
        field={field}
        resonances={resonances}
        showRelations
        showArchetypalContext={false}
        onOpenNode={vi.fn()}
        onLightOperator={light}
      />,
    );
    expect(screen.getByTestId("timeline-relation-causes-companion")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-relation-instantiates-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("timeline-resonance-myth")).not.toBeInTheDocument();

    rerender(
      <TimelineRelationField
        field={field}
        resonances={resonances}
        showRelations
        showArchetypalContext
        onOpenNode={vi.fn()}
        onLightOperator={light}
      />,
    );
    fireEvent.click(screen.getByTestId("timeline-light-archetype"));
    expect(light).toHaveBeenCalledWith("archetype");
  });
});

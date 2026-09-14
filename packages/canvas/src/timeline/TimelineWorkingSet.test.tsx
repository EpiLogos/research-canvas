import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, test, vi } from "vitest";
import type { GraphNode } from "./contracts";
import type { WorkingSetEntry } from "./timelineStore";
import { TimelineWorkingSet, toWorkingSetEntry } from "./TimelineWorkingSet";
import type { ExpandedTimelineNode } from "./contracts";

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

function entry(over: Partial<WorkingSetEntry>): WorkingSetEntry {
  return {
    graphNodeId: over.graphNodeId ?? "event-1",
    node: over.node ?? node("event-1", "Event One", "Event"),
    edges: over.edges ?? [],
    neighbours: over.neighbours ?? [],
    loadedAt: over.loadedAt ?? 1,
  };
}

function renderWorkingSet(overrides: Partial<ComponentProps<typeof TimelineWorkingSet>> = {}) {
  return render(
    <TimelineWorkingSet
      workingSet={[]}
      onUnload={vi.fn()}
      onClear={vi.fn()}
      onOpenNode={vi.fn()}
      {...overrides}
    />,
  );
}

describe("TimelineWorkingSet", () => {
  test("renders nothing while the stack is empty", () => {
    renderWorkingSet();
    expect(screen.queryByTestId("timeline-working-set")).not.toBeInTheDocument();
  });

  test("surfaces one node's real edges with deep property labels", () => {
    const archetype = node("arch-1", "Monopoly mechanism", "Archetype");
    renderWorkingSet({
      workingSet: [entry({
        graphNodeId: "event-1",
        node: node("event-1", "Event One", "Event"),
        edges: [{
          id: "e1",
          relType: "INSTANTIATES",
          sourceGraphNodeId: "event-1",
          targetGraphNodeId: "arch-1",
          properties: {
            dominance: "dominant",
            temporal_precision: "century",
            source_coordinates: ["corpus/a.md#L10"],
            mode: "temporal",
          },
        }],
        neighbours: [archetype],
      })],
    });

    expect(screen.getByTestId("timeline-working-set")).toBeInTheDocument();
    expect(screen.getByText("Event One")).toBeInTheDocument();
    const edge = screen.getByTestId("timeline-working-set-edge-e1");
    expect(edge).toHaveAttribute("data-relation-kind", "INSTANTIATES");
    // The neighbour node resolves as a clickable target.
    expect(edge).toHaveTextContent("Monopoly mechanism");
    // Deep properties surface with their human labels.
    expect(screen.getByTestId("timeline-working-set-deep-e1-role")).toHaveTextContent("dominant");
    expect(screen.getByTestId("timeline-working-set-deep-e1-precision")).toHaveTextContent("century");
    expect(screen.getByTestId("timeline-working-set-deep-e1-provenance")).toHaveTextContent("corpus/a.md#L10");
    expect(screen.getByTestId("timeline-working-set-deep-e1-mode")).toHaveTextContent("temporal");
  });

  test("unload removes one clicked node; clear empties the stack", () => {
    const onUnload = vi.fn();
    const onClear = vi.fn();
    renderWorkingSet({
      workingSet: [
        entry({ graphNodeId: "event-1", node: node("event-1", "Event One", "Event") }),
        entry({ graphNodeId: "event-2", node: node("event-2", "Event Two", "Event") }),
      ],
      onUnload,
      onClear,
    });

    fireEvent.click(screen.getByTestId("timeline-working-set-unload-event-1"));
    expect(onUnload).toHaveBeenCalledWith("event-1");

    fireEvent.click(screen.getByTestId("timeline-working-set-clear"));
    expect(onClear).toHaveBeenCalled();
  });

  test("toWorkingSetEntry adapts the transport expansion into a stack entry", () => {
    const expansion: ExpandedTimelineNode = {
      subjectGraphNodeId: "event-1",
      subject: node("event-1", "Event One", "Event"),
      edges: [{ id: "e1", relType: "ECHOES", sourceGraphNodeId: "event-1", targetGraphNodeId: "other", properties: {} }],
      neighbours: [node("other", "Other", "Event")],
    };
    const adapted = toWorkingSetEntry(expansion);
    expect(adapted.graphNodeId).toBe("event-1");
    expect(adapted.node.title).toBe("Event One");
    expect(adapted.edges).toHaveLength(1);
    expect(adapted.neighbours.map((n) => n.graphNodeId)).toEqual(["other"]);
    expect(adapted.loadedAt).toBeGreaterThan(0);
  });
});

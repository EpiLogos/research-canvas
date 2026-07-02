import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TimelineNode } from "./TimelineNode";
import type { PlacedItem } from "./projection";
import type { GraphNode } from "./contracts";

function placed(over: Partial<GraphNode> & { startPx?: number; endPx?: number }): PlacedItem {
  const node: GraphNode = {
    graphNodeId: over.graphNodeId ?? "n1",
    entityType: over.entityType ?? "Event",
    title: over.title ?? "Banda genocide",
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    isTemporal: true,
    validFrom: "1621-01-01",
    validTo: null,
    temporalPrecision: "year",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  return {
    item: { graphNodeId: node.graphNodeId, node, startYear: 1621, endYear: null, precision: "year" },
    startPx: over.startPx ?? 120,
    endPx: over.endPx ?? 120,
  };
}

describe("TimelineNode", () => {
  test("renders the title and positions at startPx", () => {
    render(
      <TimelineNode
        placed={placed({ startPx: 200 })}
        lit={null}
        selected={false}
        dimmed={false}
        onSelect={() => {}}
        onOpen={() => {}}
      />,
    );
    const el = screen.getByTestId("timeline-node-n1");
    expect(el).toHaveTextContent("Banda genocide");
    expect(el.style.left).toBe("200px");
  });

  test("single click selects, double click opens", () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    render(
      <TimelineNode
        placed={placed({})}
        lit={null}
        selected={false}
        dimmed={false}
        onSelect={onSelect}
        onOpen={onOpen}
      />,
    );
    const el = screen.getByTestId("timeline-node-n1");
    fireEvent.click(el);
    expect(onSelect).toHaveBeenCalledWith("n1");
    fireEvent.doubleClick(el);
    expect(onOpen).toHaveBeenCalledWith("n1");
  });

  test("lit dominant node carries the lit-dominant data attribute", () => {
    render(
      <TimelineNode
        placed={placed({})}
        lit={{ dominance: "dominant", relType: "INSTANTIATES" }}
        selected={false}
        dimmed={false}
        onSelect={() => {}}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByTestId("timeline-node-n1").dataset.lit).toBe("dominant");
  });

  test("dimmed node carries the dimmed data attribute", () => {
    render(
      <TimelineNode
        placed={placed({})}
        lit={null}
        selected={false}
        dimmed={true}
        onSelect={() => {}}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByTestId("timeline-node-n1").dataset.dimmed).toBe("true");
  });
});

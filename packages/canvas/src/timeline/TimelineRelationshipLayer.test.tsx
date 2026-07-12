import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { GraphRelationship } from "./contracts";
import type { PlacedItem } from "./projection";
import { TimelineRelationshipLayer } from "./TimelineRelationshipLayer";

const placed = (id: string, startPx: number): PlacedItem => ({
  item: {
    graphNodeId: id,
    node: {} as PlacedItem["item"]["node"],
    startYear: 0,
    endYear: null,
    precision: "year",
    presentation: { lane: null, offsetY: 0, width: 240, height: 72, style: {}, layoutRevision: null },
  },
  startPx,
  endPx: startPx,
  laneIndex: 0,
  laneSide: "above",
});

describe("TimelineRelationshipLayer", () => {
  test("draws only canonical relationships whose temporal endpoints are visible", () => {
    const relationships: GraphRelationship[] = [
      { id: "rel-1", relType: "CAUSES", sourceGraphNodeId: "banda", targetGraphNodeId: "balfour", properties: {} },
      { id: "rel-hidden", relType: "RESONATES_WITH", sourceGraphNodeId: "banda", targetGraphNodeId: "archetype", properties: {} },
    ];

    render(
      <TimelineRelationshipLayer
        relationships={relationships}
        placed={[placed("banda", 120), placed("balfour", 640)]}
        viewportWidth={1000}
        lod="detail"
      />,
    );

    expect(screen.getByTestId("timeline-relationship-rel-1")).toHaveAttribute("data-relation-kind", "CAUSES");
    expect(screen.queryByTestId("timeline-relationship-rel-hidden")).not.toBeInTheDocument();
  });

  test("hides relation lines at panoramic marker LOD", () => {
    render(
      <TimelineRelationshipLayer
        relationships={[{ id: "rel-1", relType: "CAUSES", sourceGraphNodeId: "a", targetGraphNodeId: "b", properties: {} }]}
        placed={[placed("a", 10), placed("b", 30)]}
        viewportWidth={1000}
        lod="marker"
      />,
    );

    expect(screen.queryByTestId("timeline-relationship-layer")).not.toBeInTheDocument();
  });
});

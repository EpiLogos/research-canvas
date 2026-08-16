import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import type { TimelineRepository, TimelineWalk } from "@research-canvas/desktop-api";
import { TimelineSurface } from "./TimelineSurface";
import type { TimelineDataSource } from "./TimelineLens";

function dataSource(): TimelineDataSource {
  return {
    loadTimelineView: async () => ({
      workspaceId: "sqlite:/test",
      nodes: [{
        node: {
          graphNodeId: "event-1917",
          entityType: "Event",
          title: "Historical event",
          body: "[]",
          summary: "A dated event in the active constellation.",
          archetypalResonance: null,
          coordinate: null,
          sourceCoordinates: [],
          ...EMPTY_GRAPH_NODE_METADATA,
          historicity: "historical",
          isTemporal: true,
          validFrom: "1917-01-01",
          validTo: null,
          temporalPrecision: "year",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
        anchor: { validFrom: "1917-01-01", validTo: null, precision: "year" },
        layoutOverride: null,
      }],
      relationships: [],
      lanes: [],
      diagnostics: [],
    }),
    archetypalLighting: async () => { throw new Error("not used"); },
    resonancesForInstance: async () => [],
  };
}

function emptyDataSource(): TimelineDataSource {
  return {
    loadTimelineView: async () => ({
      workspaceId: "sqlite:/test",
      nodes: [],
      relationships: [],
      lanes: [],
      diagnostics: [],
    }),
    archetypalLighting: async () => { throw new Error("not used"); },
    resonancesForInstance: async () => [],
  };
}

function repository(): TimelineRepository {
  const walk: TimelineWalk = {
    earthboundNodes: [
      {
        graphNodeId: "event-1917",
        title: "Historical event",
        date: "1917-01-01",
        precision: "year",
        entityType: "Event",
        placeName: "London",
        x: 1917,
        colorTag: "historicity-historical",
      },
    ],
    archetypeLayers: [
      {
        archetypeId: "shadow",
        title: "Shadow",
        expressions: [
          {
            start: "1900",
            end: "1940",
            placeName: "Europe",
            colorTag: "archetype-expression",
          },
        ],
      },
    ],
  };
  return { getTimelineWalk: vi.fn(async () => walk) };
}

function emptyRepository(): TimelineRepository {
  return {
    getTimelineWalk: vi.fn(async () => ({ earthboundNodes: [], archetypeLayers: [] })),
  };
}

describe("TimelineSurface", () => {
  test("renders cards from the canonical walk and exact spectral expression range", async () => {
    render(
      <TimelineSurface
        repository={repository()}
        constellationId="project-1"
        dataSource={dataSource()}
        initialState={{ centerYear: 1917, pixelsPerYear: 4, selectedNodeId: null }}
        onOpenCanvasNode={() => {}}
        onOpenNode={() => {}}
      />,
    );

    expect(screen.getByTestId("timeline-surface")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-earthbound-track")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-axis")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-zoom-in")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-zoom-out")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-fit")).toBeInTheDocument();

    const card = await screen.findByTestId("timeline-card-event-1917");
    expect(card).toHaveAttribute("data-entity-type", "Event");
    expect(card).toHaveTextContent("Historical event");
    expect(card).toHaveTextContent("1917");
    await waitFor(() => expect(screen.getByTestId("timeline-card-event-1917")).toHaveTextContent("London"));
    expect(screen.getByTestId("timeline-node-place-event-1917")).toHaveTextContent("London");
    expect(screen.getByTestId("timeline-node-entity-icon-event-1917")).toHaveAttribute("aria-label", "Event entity");
    expect(screen.getByTestId("timeline-card-event-1917")).toHaveAttribute("data-color-tag", "historicity-historical");
    expect(within(card).getByTestId("timeline-node-color-event-1917")).toBeInTheDocument();

    const layer = await screen.findByTestId("timeline-archetype-layer-shadow");
    const expression = within(layer).getByTestId("timeline-archetype-expression-shadow-0");
    expect(expression).toHaveAttribute("data-start-year", "1900");
    expect(expression).toHaveAttribute("data-end-year", "1940");
    expect(expression).toHaveAttribute("data-color-tag", "archetype-expression");
  });

  test("renders an explicit empty-constellation zero-state and keeps Fit inert", async () => {
    render(
      <TimelineSurface
        repository={emptyRepository()}
        constellationId="empty-constellation"
        dataSource={emptyDataSource()}
        initialState={{ centerYear: 0, pixelsPerYear: 0.05, selectedNodeId: null }}
        onOpenCanvasNode={() => {}}
        onOpenNode={() => {}}
      />,
    );

    expect(await screen.findByTestId("timeline-empty-state")).toHaveTextContent("No temporal nodes loaded");
    expect(screen.getByTestId("timeline-fit")).toBeDisabled();
    expect(screen.queryAllByTestId(/^timeline-card-/)).toHaveLength(0);
  });

  test("publishes only genuine camera changes without a lens feedback loop", async () => {
    const onViewStateChange = vi.fn();
    render(
      <TimelineSurface
        repository={repository()}
        constellationId="project-1"
        dataSource={dataSource()}
        initialState={{ centerYear: 1917, pixelsPerYear: 4, selectedNodeId: null }}
        onViewStateChange={onViewStateChange}
        onOpenCanvasNode={() => {}}
        onOpenNode={() => {}}
      />,
    );

    await screen.findByTestId("timeline-card-event-1917");
    expect(onViewStateChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("timeline-zoom-in"));
    await waitFor(() => {
      expect(onViewStateChange).toHaveBeenCalledTimes(1);
      expect(onViewStateChange).toHaveBeenCalledWith(expect.objectContaining({
        centerYear: 1917,
        pixelsPerYear: 6.4,
      }));
    });
  });
});

import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TimelineLens, type TimelineDataSource } from "./TimelineLens";
import type { ArchetypalLighting, GraphNode, LitInstance } from "./contracts";

function event(id: string, title: string, validFrom: string): GraphNode {
  return {
    graphNodeId: id,
    entityType: "Event",
    title,
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    isTemporal: true,
    validFrom,
    validTo: null,
    temporalPrecision: "year",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function archetype(id: string, title: string): GraphNode {
  return { ...event(id, title, "1600-01-01"), entityType: "Archetype", isTemporal: false, validFrom: null };
}

function makeDataSource(over: Partial<TimelineDataSource> = {}): TimelineDataSource {
  return {
    loadTimelineNodes: async () => [
      event("banda", "Banda genocide", "1621-01-01"),
      event("balfour", "Balfour Declaration", "1917-01-01"),
    ],
    archetypalLighting: async (operatorGraphNodeId: string): Promise<ArchetypalLighting> => ({
      operator: archetype(operatorGraphNodeId, "Monopoly mechanism"),
      instances: [
        { node: event("banda", "Banda genocide", "1621-01-01"), relType: "INSTANTIATES", dominance: "dominant" },
      ],
    }),
    resonancesForInstance: async (): Promise<LitInstance[]> => [
      { node: archetype("monopoly", "Monopoly mechanism"), relType: "INSTANTIATES", dominance: "dominant" },
    ],
    ...over,
  };
}

describe("TimelineLens", () => {
  test("loads and renders temporal nodes on mount", async () => {
    render(<TimelineLens dataSource={makeDataSource()} onOpenNode={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("timeline-node-banda")).toBeInTheDocument();
    });
    expect(screen.getByTestId("timeline-node-balfour")).toBeInTheDocument();
  });

  test("double-clicking a node opens the same document via onOpenNode", async () => {
    const onOpenNode = vi.fn();
    render(<TimelineLens dataSource={makeDataSource()} onOpenNode={onOpenNode} />);
    const node = await screen.findByTestId("timeline-node-banda");
    fireEvent.doubleClick(node);
    expect(onOpenNode).toHaveBeenCalledWith("banda");
  });

  test("selecting an event fetches and shows its resonant archetypes", async () => {
    render(<TimelineLens dataSource={makeDataSource()} onOpenNode={() => {}} />);
    const node = await screen.findByTestId("timeline-node-banda");
    fireEvent.click(node);
    await waitFor(() => {
      expect(screen.getByTestId("resonance-row-monopoly")).toBeInTheDocument();
    });
  });

  test("lighting an operator dims unlit nodes and marks lit ones", async () => {
    render(<TimelineLens dataSource={makeDataSource()} onOpenNode={() => {}} />);
    const node = await screen.findByTestId("timeline-node-banda");
    fireEvent.click(node); // loads resonances
    const row = await screen.findByTestId("resonance-row-monopoly");
    fireEvent.click(row); // light the operator
    await waitFor(() => {
      expect(screen.getByTestId("timeline-node-banda").dataset.lit).toBe("dominant");
    });
    // balfour is not in the lighting result => dimmed
    expect(screen.getByTestId("timeline-node-balfour").dataset.dimmed).toBe("true");
  });

  test("clear-lighting control removes the lit state", async () => {
    render(<TimelineLens dataSource={makeDataSource()} onOpenNode={() => {}} />);
    const node = await screen.findByTestId("timeline-node-banda");
    fireEvent.click(node);
    const row = await screen.findByTestId("resonance-row-monopoly");
    fireEvent.click(row);
    await waitFor(() => {
      expect(screen.getByTestId("timeline-node-banda").dataset.lit).toBe("dominant");
    });
    fireEvent.click(screen.getByTestId("timeline-clear-lighting"));
    await waitFor(() => {
      expect(screen.getByTestId("timeline-node-banda").dataset.lit).toBeUndefined();
    });
  });

  test("wheel over the track zooms in (more, sharper ticks appear)", async () => {
    render(<TimelineLens dataSource={makeDataSource()} onOpenNode={() => {}} />);
    await screen.findByTestId("timeline-node-banda");
    const track = screen.getByTestId("timeline-track");
    const before = screen.getByTestId("timeline-tier").textContent;
    fireEvent.wheel(track, { deltaY: -600, clientX: 400 });
    await waitFor(() => {
      expect(screen.getByTestId("timeline-tier").textContent).not.toBe(before);
    });
  });
});

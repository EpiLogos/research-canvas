import { describe, expect, test, vi } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TimelineLens, type TimelineDataSource } from "./TimelineLens";
import type { ArchetypalLighting, GraphNode, LitInstance, NodeLayout } from "./contracts";

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
    ...EMPTY_GRAPH_NODE_METADATA,
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

function constellation(id: string, title: string, validFrom: string): GraphNode {
  return {
    ...event(id, title, validFrom),
    entityType: "Constellation",
    summary: "Nested interpretive grouping",
    coordinate: "#2:L3/P4",
    evidenceTags: ["ql-unit"],
    sourceKind: "constellation",
  };
}

function makeDataSource(over: Partial<TimelineDataSource> = {}): TimelineDataSource {
  return {
    loadTimelineNodes: async () => [
      {
        node: event("banda", "Banda genocide", "1621-01-01"),
        layout: layout("banda", 280, 92, { bgColour: "#172033", dotColour: "#79c0d4" }),
      },
      {
        node: { ...event("balfour", "Balfour Declaration", "1917-01-01"), entityType: "Source" },
        layout: layout("balfour", 240, 72, { bgColour: "#27211a", dotColour: "#d0a24a" }),
      },
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

function layout(
  graphNodeId: string,
  width: number,
  height: number,
  style: NodeLayout["style"] = {},
): NodeLayout {
  return {
    graphNodeId,
    canvasId: "c1",
    positionX: 0,
    positionY: 0,
    width,
    height,
    style: {
      ...style,
      __timelineCard: {
        offsetY: 0,
        width,
        height,
      },
    },
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

  test("shows a visible load error instead of a dates-only surface", async () => {
    render(
      <TimelineLens
        dataSource={makeDataSource({
          loadTimelineNodes: async () => {
            throw new Error("state not managed for SharedGraphState");
          },
        })}
        onOpenNode={() => {}}
      />,
    );

    expect(await screen.findByTestId("timeline-load-error")).toHaveTextContent(
      "state not managed for SharedGraphState",
    );
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

  test("renders persisted card sizes and category color tags", async () => {
    render(<TimelineLens dataSource={makeDataSource()} onOpenNode={() => {}} />);
    const bandaCard = await screen.findByTestId("timeline-node-card-banda");
    expect(bandaCard).toHaveStyle({ width: "280px", height: "92px" });
    expect(screen.getByTestId("timeline-node-banda").dataset.category).toBe("historical-event");
    expect(screen.getByTestId("timeline-node-balfour").dataset.category).toBe("source");
  });

  test("resizing a card updates timeline geometry state and calls the persistence callback", async () => {
    const onResizeNode = vi.fn();
    render(
      <TimelineLens
        dataSource={makeDataSource()}
        onOpenNode={() => {}}
        onResizeNode={onResizeNode}
      />,
    );

    const handle = await screen.findByTestId("timeline-node-resize-banda-se");
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 140, clientY: 122 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(onResizeNode).toHaveBeenCalledWith("banda", {
      positionX: 0,
      positionY: 22,
      width: 320,
      height: 114,
    });
    await waitFor(() => {
      expect(screen.getByTestId("timeline-node-card-banda")).toHaveStyle({ width: "320px", height: "114px" });
    });
  });

  test("vertical card dragging persists through timeline state and callback", async () => {
    const onResizeNode = vi.fn();
    render(
      <TimelineLens
        dataSource={makeDataSource()}
        onOpenNode={() => {}}
        onResizeNode={onResizeNode}
      />,
    );

    const card = await screen.findByTestId("timeline-node-card-banda");
    fireEvent.pointerDown(card, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 160, clientY: 136 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(onResizeNode).toHaveBeenCalledWith("banda", {
      positionX: 0,
      positionY: 36,
      width: 280,
      height: 92,
    });
    await waitFor(() => {
      expect(screen.getByTestId("timeline-node-card-banda").style.getPropertyValue("--timeline-card-offset-y")).toBe("36px");
    });
  });

  test("edge fade updates from rendered card position when the viewport zoom changes", async () => {
    render(
      <TimelineLens
        dataSource={makeDataSource({
          loadTimelineNodes: async () => [
            {
              node: event("edge", "Edge event", "1600-01-01"),
              layout: layout("edge", 280, 92),
            },
          ],
        })}
        onOpenNode={() => {}}
      />,
    );

    const card = await screen.findByTestId("timeline-node-card-edge");
    expect(card.dataset.edgeFade).toBe("none");

    const track = screen.getByTestId("timeline-track");
    fireEvent.wheel(track, { deltaY: -900, clientX: 980 });

    await waitFor(() => {
      expect(screen.getByTestId("timeline-node-card-edge").dataset.edgeFade).not.toBe("none");
    });
  });

  test("category filters hide matching timeline card types without disturbing other nodes", async () => {
    render(<TimelineLens dataSource={makeDataSource()} onOpenNode={() => {}} />);
    await screen.findByTestId("timeline-node-banda");
    fireEvent.click(screen.getByRole("button", { name: /hide source/i }));

    expect(screen.getByTestId("timeline-node-banda")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-node-balfour")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show source/i }));
    expect(screen.getByTestId("timeline-node-balfour")).toBeInTheDocument();
  });

  test("constellation cards get their own category filter", async () => {
    render(
      <TimelineLens
        dataSource={makeDataSource({
          loadTimelineNodes: async () => [
            {
              node: event("banda", "Banda genocide", "1621-01-01"),
              layout: layout("banda", 280, 92),
            },
            {
              node: constellation("ql-unit", "QL Reading Unit", "1621-01-01"),
              layout: layout("ql-unit", 300, 120),
            },
          ],
        })}
        onOpenNode={() => {}}
      />,
    );

    await screen.findByTestId("timeline-node-ql-unit");
    expect(screen.getByTestId("timeline-node-ql-unit").dataset.category).toBe("constellation");

    fireEvent.click(screen.getByRole("button", { name: /hide constellation/i }));

    expect(screen.queryByTestId("timeline-node-ql-unit")).not.toBeInTheDocument();
    expect(screen.getByTestId("timeline-node-banda")).toBeInTheDocument();
  });
});

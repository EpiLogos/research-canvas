import { describe, expect, test, vi } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { TimelineNode } from "./TimelineNode";
import type { PlacedItem } from "./projection";
import type { GraphNode } from "./contracts";

function placed(
  over: Partial<GraphNode> & {
    startPx?: number;
    endPx?: number;
    positionX?: number;
    positionY?: number;
    width?: number;
    height?: number;
    laneSide?: PlacedItem["laneSide"];
  },
): PlacedItem {
  const node: GraphNode = {
    graphNodeId: over.graphNodeId ?? "n1",
    entityType: over.entityType ?? "Event",
    title: over.title ?? "Banda genocide",
    body: "[]",
    summary: over.summary ?? "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    ...EMPTY_GRAPH_NODE_METADATA,
    isTemporal: true,
    validFrom: "1621-01-01",
    validTo: null,
    temporalPrecision: "year",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  return {
    item: {
      graphNodeId: node.graphNodeId,
      node,
      startYear: 1621,
      endYear: null,
      precision: "year",
      presentation: {
        lane: "events",
        offsetY: over.positionY ?? 0,
        width: over.width ?? 320,
        height: over.height ?? 120,
        layoutRevision: 1,
        style: {
          bgColour: "#2f1d3a",
          textColour: "#f8e7ff",
          dotColour: "#d98cff",
        },
      },
    },
    startPx: over.startPx ?? 120,
    endPx: over.endPx ?? 120,
    laneIndex: 0,
    laneSide: over.laneSide ?? "above",
  };
}

describe("TimelineNode", () => {
  test("does not register global pointer listeners for every mounted timeline card", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    render(
      <TimelineNode
        placed={placed({})}
        lit={null}
        selected={false}
        dimmed={false}
        filtered={false}
        onSelect={() => {}}
        onOpen={() => {}}
        onResize={() => {}}
        onColorTag={() => {}}
      />,
    );

    expect(addEventListener).not.toHaveBeenCalledWith("pointermove", expect.any(Function));
    expect(addEventListener).not.toHaveBeenCalledWith("pointerup", expect.any(Function));
    addEventListener.mockRestore();
  });

  test("renders the title and positions at startPx", () => {
    render(
      <TimelineNode
        placed={placed({ startPx: 200 })}
        lit={null}
        selected={false}
        dimmed={false}
        filtered={false}
        onSelect={() => {}}
        onOpen={() => {}}
        onResize={() => {}}
        onColorTag={() => {}}
      />,
    );
    const el = screen.getByTestId("timeline-node-n1");
    expect(el).toHaveTextContent("Banda genocide");
    expect(el).toHaveTextContent("1621");
    expect(el.style.left).toBe("200px");
    expect(el).toHaveClass("timeline-node--above");
  });

  test("renders compact summary text when available", () => {
    render(
      <TimelineNode
        placed={placed({ summary: "Colonial violence as monopoly enforcement." })}
        lit={null}
        selected={false}
        dimmed={false}
        filtered={false}
        onSelect={() => {}}
        onOpen={() => {}}
        onResize={() => {}}
        onColorTag={() => {}}
      />,
    );
    expect(screen.getByTestId("timeline-node-summary-n1")).toHaveTextContent(
      "Colonial violence as monopoly enforcement.",
    );
  });

  test("uses marker LOD at broad zoom without mounting full-size cards", () => {
    render(
      <TimelineNode
        placed={placed({ title: "Banda genocide" })}
        lod="marker"
        lit={null}
        selected={false}
        dimmed={false}
        filtered={false}
        onSelect={() => {}}
        onOpen={() => {}}
        onResize={() => {}}
        onColorTag={() => {}}
      />,
    );

    expect(screen.getByTestId("timeline-node-n1").dataset.lod).toBe("marker");
    expect(screen.queryByTestId("timeline-node-card-n1")).not.toBeInTheDocument();
    expect(screen.getByTestId("timeline-node-marker-n1")).toHaveTextContent("Banda genocide");
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
        filtered={false}
        onSelect={onSelect}
        onOpen={onOpen}
        onResize={() => {}}
        onColorTag={() => {}}
      />,
    );
    const el = screen.getByTestId("timeline-node-n1");
    fireEvent.click(el);
    expect(onSelect).toHaveBeenCalledWith("n1");
    fireEvent.doubleClick(el);
    expect(onOpen).toHaveBeenCalledWith("n1", expect.objectContaining({ graphNodeId: "n1" }));
  });

  test("selecting a card does not create or commit a timeline layout", () => {
    const onSelect = vi.fn();
    const onResize = vi.fn();
    const onCommit = vi.fn();
    render(
      <TimelineNode
        placed={placed({})}
        lit={null}
        selected={false}
        dimmed={false}
        filtered={false}
        onSelect={onSelect}
        onOpen={() => {}}
        onResize={onResize}
        onCommit={onCommit}
        onColorTag={() => {}}
      />,
    );

    const card = screen.getByTestId("timeline-node-card-n1");
    fireEvent.pointerDown(card, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.click(card);

    expect(onSelect).toHaveBeenCalledWith("n1");
    expect(onResize).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  test("lit dominant node carries the lit-dominant data attribute", () => {
    render(
      <TimelineNode
        placed={placed({})}
        lit={{ dominance: "dominant", relType: "INSTANTIATES" }}
        selected={false}
        dimmed={false}
        filtered={false}
        onSelect={() => {}}
        onOpen={() => {}}
        onResize={() => {}}
        onColorTag={() => {}}
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
        filtered={false}
        onSelect={() => {}}
        onOpen={() => {}}
        onResize={() => {}}
        onColorTag={() => {}}
      />,
    );
    expect(screen.getByTestId("timeline-node-n1").dataset.dimmed).toBe("true");
  });

  test("uses persisted layout dimensions and color tags on the card", () => {
    render(
      <TimelineNode
        placed={placed({})}
        lit={null}
        selected={false}
        dimmed={false}
        filtered={false}
        onSelect={() => {}}
        onOpen={() => {}}
        onResize={() => {}}
        onColorTag={() => {}}
      />,
    );
    const card = screen.getByTestId("timeline-node-card-n1");
    expect(card).toHaveStyle({ width: "320px", height: "120px" });
    expect(card).toHaveStyle({ backgroundColor: "#2f1d3a", color: "#f8e7ff" });
    expect(screen.getByTestId("timeline-node-n1").dataset.category).toBe("historical-event");
  });

  test("constellation entities render as constellation timeline cards", () => {
    render(
      <TimelineNode
        placed={placed({ entityType: "Constellation", title: "QL Unit" })}
        lit={null}
        selected={false}
        dimmed={false}
        filtered={false}
        onSelect={() => {}}
        onOpen={() => {}}
        onResize={() => {}}
        onColorTag={() => {}}
      />,
    );

    expect(screen.getByTestId("timeline-node-n1").dataset.category).toBe("constellation");
    expect(screen.getByRole("button", { name: /tag ql unit as constellation/i })).toBeInTheDocument();
  });

  test("dragging the southeast resize handle grows the card without moving the year anchor", () => {
    const onResize = vi.fn();
    render(
      <TimelineNode
        placed={placed({})}
        lit={null}
        selected={false}
        dimmed={false}
        filtered={false}
        onSelect={() => {}}
        onOpen={() => {}}
        onResize={onResize}
        onColorTag={() => {}}
      />,
    );

    const handle = screen.getByTestId("timeline-node-resize-n1-se");
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(screen.getByTestId("timeline-node-n1"), { pointerId: 1, clientX: 140, clientY: 130 });
    fireEvent.pointerUp(screen.getByTestId("timeline-node-n1"), { pointerId: 1 });

    expect(onResize).toHaveBeenCalledWith("n1", {
      positionX: 0,
      positionY: 30,
      width: 360,
      height: 150,
    });
  });

  test("dragging each remaining resize corner reports direct non-inverted geometry", () => {
    const corners = [
      {
        corner: "nw",
        end: { clientX: 140, clientY: 130 },
        expected: { positionX: 0, positionY: 0, width: 280, height: 90 },
      },
      {
        corner: "ne",
        end: { clientX: 140, clientY: 80 },
        expected: { positionX: 0, positionY: 0, width: 360, height: 140 },
      },
      {
        corner: "sw",
        end: { clientX: 60, clientY: 130 },
        expected: { positionX: 0, positionY: 30, width: 360, height: 150 },
      },
    ];

    for (const { corner, end, expected } of corners) {
      const onResize = vi.fn();
      const { unmount } = render(
        <TimelineNode
          placed={placed({ graphNodeId: `n-${corner}` })}
          lit={null}
          selected={false}
          dimmed={false}
          filtered={false}
          onSelect={() => {}}
          onOpen={() => {}}
          onResize={onResize}
          onColorTag={() => {}}
        />,
      );

      const handle = screen.getByTestId(`timeline-node-resize-n-${corner}-${corner}`);
      fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(screen.getByTestId(`timeline-node-n-${corner}`), { pointerId: 1, ...end });
      fireEvent.pointerUp(screen.getByTestId(`timeline-node-n-${corner}`), { pointerId: 1 });

      expect(onResize).toHaveBeenCalledWith(`n-${corner}`, expected);
      unmount();
    }
  });

  test("dragging the card vertically reports a persisted lane offset without moving the year anchor", () => {
    const onResize = vi.fn();
    render(
      <TimelineNode
        placed={placed({ startPx: 200, positionY: 12 })}
        lit={null}
        selected={false}
        dimmed={false}
        filtered={false}
        onSelect={() => {}}
        onOpen={() => {}}
        onResize={onResize}
        onColorTag={() => {}}
      />,
    );

    const card = screen.getByTestId("timeline-node-card-n1");
    fireEvent.pointerDown(card, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(screen.getByTestId("timeline-node-n1"), { pointerId: 1, clientX: 135, clientY: 145 });
    fireEvent.pointerUp(screen.getByTestId("timeline-node-n1"), { pointerId: 1 });

    expect(screen.getByTestId("timeline-node-n1").style.left).toBe("200px");
    expect(onResize).toHaveBeenCalledWith("n1", {
      positionX: 0,
      positionY: 57,
      width: 320,
      height: 120,
    });
  });

  test("marks cards near viewport edges with adaptive fade strength", () => {
    render(
      <TimelineNode
        placed={placed({ startPx: 20, width: 220 })}
        lit={null}
        selected={false}
        dimmed={false}
        filtered={false}
        viewportWidth={500}
        onSelect={() => {}}
        onOpen={() => {}}
        onResize={() => {}}
        onColorTag={() => {}}
      />,
    );

    const card = screen.getByTestId("timeline-node-card-n1");
    expect(card.dataset.edgeFade).toBe("left");
    expect(card.style.getPropertyValue("--timeline-edge-fade-left")).not.toBe("0");
  });
});

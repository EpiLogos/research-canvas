import { afterEach, describe, expect, test, vi } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TimelineLens, type TimelineDataSource } from "./TimelineLens";
import type { ArchetypalLighting, GraphNode, LitInstance, NodeLayout, TimelineViewNode } from "./contracts";

afterEach(() => {
  vi.restoreAllMocks();
});

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
    loadTimelineView: async () => ({
      workspaceId: "sqlite:/test",
      nodes: [
        timelineRecord(event("banda", "Banda genocide", "1621-01-01"), layout("banda", 280, 92, { bgColour: "#172033", dotColour: "#79c0d4" })),
        timelineRecord({ ...event("balfour", "Balfour Declaration", "1917-01-01"), entityType: "Source" }, layout("balfour", 240, 72, { bgColour: "#27211a", dotColour: "#d0a24a" })),
      ], relationships: [{
        id: "historical-cause",
        relType: "CAUSES",
        sourceGraphNodeId: "banda",
        targetGraphNodeId: "balfour",
        properties: {},
      }], lanes: [{ id: "events" }], diagnostics: [],
    }),
    archetypalLighting: async (operatorGraphNodeId: string): Promise<ArchetypalLighting> => ({
      operator: archetype(operatorGraphNodeId, "Monopoly mechanism"),
      instances: [
        { node: event("banda", "Banda genocide", "1621-01-01"), relType: "INSTANTIATES", dominance: "dominant" },
      ],
    }),
    resonancesForInstance: async (): Promise<LitInstance[]> => [
      { node: archetype("monopoly", "Monopoly mechanism"), relType: "INSTANTIATES", dominance: "dominant" },
    ],
    saveTimelineLayout: async (input) => ({
      status: input.expectedRevision === null ? "created" : "updated",
      layout: {
        lane: input.lane, offsetY: input.offsetY, width: input.width, height: input.height,
        style: input.style, layoutRevision: (input.expectedRevision ?? -1) + 1,
      },
    }),
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

function timelineRecord(node: GraphNode, oldLayout: NodeLayout): TimelineViewNode {
  const card = oldLayout.style.__timelineCard;
  return {
    node,
    anchor: { validFrom: node.validFrom!, validTo: node.validTo, precision: node.temporalPrecision! },
    layoutOverride: {
      lane: "events",
      offsetY: card?.offsetY ?? 0,
      width: card?.width ?? oldLayout.width,
      height: card?.height ?? oldLayout.height,
      style: oldLayout.style,
      layoutRevision: 1,
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
    expect(screen.queryByTestId("timeline-relationship-historical-cause")).not.toBeInTheDocument();
  });

  test("requests a bounded temporal window on mount", async () => {
    const loadTimelineView = vi.fn(makeDataSource().loadTimelineView);
    render(<TimelineLens dataSource={makeDataSource({ loadTimelineView })} onOpenNode={() => {}} />);
    await screen.findByTestId("timeline-node-banda");
    expect(loadTimelineView).toHaveBeenCalledWith({ startYear: 1200, endYear: 2200 });
  });

  test("mounts only historical cards inside the viewport render band", async () => {
    render(
      <TimelineLens
        initialViewport={{ centerYear: 1900, pixelsPerYear: 10 }}
        dataSource={makeDataSource({
          loadTimelineView: async () => ({
            workspaceId: "sqlite:/test",
            nodes: [
              timelineRecord(event("near", "Near event", "1900-01-01"), layout("near", 240, 72)),
              timelineRecord(event("far", "Far event", "1700-01-01"), layout("far", 240, 72)),
            ],
            relationships: [],
            lanes: [{ id: "events" }],
            diagnostics: [],
          }),
        })}
        onOpenNode={() => {}}
      />,
    );

    expect(await screen.findByTestId("timeline-node-near")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-node-far")).not.toBeInTheDocument();
  });

  test("keeps an archetypal relation off the historical axis until its event is focused", async () => {
    const historicalEvent = event("event-1888", "The 1888 event", "1888-01-01");
    const contextualArchetype = archetype("archetype-antichrist", "Antichrist archetype");
    const relationFieldForEvent = vi.fn(async () => ({
      subjectGraphNodeId: "event-1888",
      contextualNodes: [contextualArchetype],
      relationships: [{
        id: "event-instantiates-archetype",
        relType: "INSTANTIATES",
        sourceGraphNodeId: "event-1888",
        targetGraphNodeId: "archetype-antichrist",
        properties: {},
      }],
    }));
    const dataSource = makeDataSource({
      loadTimelineView: async () => ({
        workspaceId: "sqlite:/test",
        nodes: [
          timelineRecord(historicalEvent, layout("event-1888", 240, 72)),
          {
            node: contextualArchetype,
            anchor: { validFrom: "1888-01-01", validTo: null, precision: "year" },
            layoutOverride: null,
            relationCompanion: true,
          },
        ],
        relationships: [],
        lanes: [{ id: "events" }],
        diagnostics: [],
      }),
    }) as TimelineDataSource & { relationFieldForEvent: typeof relationFieldForEvent };
    dataSource.relationFieldForEvent = relationFieldForEvent;
    render(
      <TimelineLens
        dataSource={dataSource}
        onOpenNode={() => {}}
      />,
    );

    await screen.findByTestId("timeline-node-event-1888");
    expect(screen.queryByTestId("timeline-node-archetype-antichrist")).not.toBeInTheDocument();
    expect(screen.queryByTestId("timeline-relation-field")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("timeline-node-event-1888"));

    expect(relationFieldForEvent).toHaveBeenCalledWith("event-1888");
    expect(await screen.findByTestId("timeline-relation-field")).toHaveTextContent("Antichrist archetype");
    expect(screen.getByTestId("timeline-relation-event-instantiates-archetype")).toHaveTextContent("INSTANTIATES");
  });

  test("shows a visible load error instead of a dates-only surface", async () => {
    render(
      <TimelineLens
        dataSource={makeDataSource({
          loadTimelineView: async () => {
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

  test("retains and renders nonblocking timeline diagnostics", async () => {
    render(<TimelineLens dataSource={makeDataSource({
      loadTimelineView: async () => ({
        workspaceId: "sqlite:/test", nodes: [], relationships: [], lanes: [{ id: "events" }],
        diagnostics: [{ graphNodeId: "bad-date", code: "invalid_temporal_anchor", message: "invalid date", validFrom: "nope", validTo: null }],
      }),
    })} onOpenNode={() => {}} />);
    expect(await screen.findByTestId("timeline-diagnostics")).toHaveTextContent("bad-date: invalid date");
  });

  test("double-clicking a node opens the same document via onOpenNode", async () => {
    const onOpenNode = vi.fn();
    render(<TimelineLens dataSource={makeDataSource()} onOpenNode={onOpenNode} />);
    const node = await screen.findByTestId("timeline-node-banda");
    fireEvent.doubleClick(node);
    expect(onOpenNode).toHaveBeenCalledWith(
      "banda",
      expect.objectContaining({ graphNodeId: "banda" }),
    );
  });

  test("a read-only card still opens on double-click without moving the timeline camera", async () => {
    const onOpenNode = vi.fn();
    render(<TimelineLens dataSource={makeDataSource({ saveTimelineLayout: undefined })} onOpenNode={onOpenNode} />);
    const card = await screen.findByTestId("timeline-node-card-banda");

    fireEvent.pointerDown(card, { pointerId: 63, clientX: 300, clientY: 210 });
    fireEvent.pointerMove(screen.getByTestId("timeline-track"), { pointerId: 63, clientX: 300, clientY: 270 });
    fireEvent.doubleClick(card);

    expect(screen.getByTestId("timeline-scene")).toHaveStyle({ transform: "translateY(0px)" });
    expect(onOpenNode).toHaveBeenCalledWith("banda", expect.objectContaining({ graphNodeId: "banda" }));
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

  test("ArrowLeft and ArrowRight accelerate smoothly, coast briefly after release, and reset before reversing", async () => {
    let frame: FrameRequestCallback | null = null;
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const viewportChanges: Array<{ centerYear: number; pixelsPerYear: number }> = [];

    render(
      <TimelineLens
        dataSource={makeDataSource()}
        onOpenNode={() => {}}
        initialViewport={{ centerYear: 1800, pixelsPerYear: 2 }}
        onViewportChange={(viewport) => viewportChanges.push(viewport)}
      />,
    );
    await screen.findByTestId("timeline-node-banda");
    const initialCenter = viewportChanges.at(-1)!.centerYear;

    expect(screen.queryByRole("button", { name: "Move timeline earlier" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move timeline later" })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(viewportChanges.at(-1)!.centerYear).toBe(initialCenter);

    act(() => {
      frame?.(0);
      for (let timestamp = 16; timestamp <= 480; timestamp += 16) {
        frame?.(timestamp);
      }
    });
    const afterEarlier = viewportChanges.at(-1)!.centerYear;
    expect(afterEarlier).toBeLessThan(initialCenter - 100);

    // Reversing clears existing velocity first: the next direction starts from
    // rest rather than carrying the old motion through the axis.
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(viewportChanges.at(-1)!.centerYear).toBe(afterEarlier);
    expect(cancelFrame).toHaveBeenCalled();

    act(() => {
      frame?.(496);
      for (let timestamp = 512; timestamp <= 800; timestamp += 16) {
        frame?.(timestamp);
      }
    });
    const beforeRelease = viewportChanges.at(-1)!.centerYear;
    expect(beforeRelease).toBeGreaterThan(afterEarlier);

    fireEvent.keyUp(window, { key: "ArrowRight" });
    act(() => {
      frame?.(816);
    });
    const afterTailStarts = viewportChanges.at(-1)!.centerYear;
    expect(afterTailStarts).toBeGreaterThan(beforeRelease);

    act(() => {
      for (let timestamp = 832; timestamp <= 1_200; timestamp += 16) {
        frame?.(timestamp);
      }
    });
    const afterTailStops = viewportChanges.at(-1)!.centerYear;
    act(() => frame?.(1_216));
    expect(viewportChanges.at(-1)!.centerYear).toBe(afterTailStops);
    expect(requestFrame).toHaveBeenCalled();
  });

  test("timeline navigation leaves arrow keys to text editing and an open reader", async () => {
    const viewportChanges: Array<{ centerYear: number; pixelsPerYear: number }> = [];
    const { container } = render(
      <TimelineLens
        dataSource={makeDataSource()}
        onOpenNode={() => {}}
        initialViewport={{ centerYear: 1800, pixelsPerYear: 2 }}
        onViewportChange={(viewport) => viewportChanges.push(viewport)}
      />,
    );
    await screen.findByTestId("timeline-node-banda");
    const initialCenter = viewportChanges.at(-1)!.centerYear;
    const input = document.createElement("input");
    container.append(input);

    fireEvent.keyDown(input, { key: "ArrowLeft" });
    expect(viewportChanges.at(-1)!.centerYear).toBe(initialCenter);

    input.remove();
    const reader = document.createElement("section");
    reader.setAttribute("role", "dialog");
    reader.setAttribute("aria-modal", "true");
    container.append(reader);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(viewportChanges.at(-1)!.centerYear).toBe(initialCenter);
    reader.remove();
  });

  test("has no transport bar and pans the whole timeline scene vertically", async () => {
    render(<TimelineLens dataSource={makeDataSource()} onOpenNode={() => {}} />);
    await screen.findByTestId("timeline-node-banda");

    expect(screen.queryByTestId("timeline-transport")).not.toBeInTheDocument();
    const track = screen.getByTestId("timeline-track");
    fireEvent.pointerDown(track, { pointerId: 19, clientX: 400, clientY: 200 });
    fireEvent.pointerMove(track, { pointerId: 19, clientX: 400, clientY: 280 });
    fireEvent.pointerUp(track, { pointerId: 19, clientX: 400, clientY: 280 });

    expect(screen.getByTestId("timeline-scene")).toHaveStyle({ transform: "translateY(80px)" });
  });

  test("renders persisted card sizes and category color tags", async () => {
    render(<TimelineLens dataSource={makeDataSource()} onOpenNode={() => {}} />);
    const bandaCard = await screen.findByTestId("timeline-node-card-banda");
    expect(bandaCard).toHaveStyle({ width: "280px", height: "92px" });
    expect(screen.getByTestId("timeline-node-banda").dataset.category).toBe("historical-event");
    expect(screen.getByTestId("timeline-node-balfour").dataset.category).toBe("source");
  });

  test("resizing a card updates timeline-local geometry state", async () => {
    render(
      <TimelineLens
        dataSource={makeDataSource()}
        onOpenNode={() => {}}
      />,
    );

    const handle = await screen.findByTestId("timeline-node-resize-banda-se");
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(screen.getByTestId("timeline-node-banda"), { pointerId: 1, clientX: 140, clientY: 122 });
    fireEvent.pointerUp(screen.getByTestId("timeline-node-banda"), { pointerId: 1 });

    await waitFor(() => {
      expect(screen.getByTestId("timeline-node-card-banda")).toHaveStyle({ width: "320px", height: "114px" });
    });
  });

  test("vertical card dragging remains in timeline-local state", async () => {
    render(
      <TimelineLens
        dataSource={makeDataSource()}
        onOpenNode={() => {}}
      />,
    );

    const card = await screen.findByTestId("timeline-node-card-banda");
    fireEvent.pointerDown(card, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(screen.getByTestId("timeline-node-banda"), { pointerId: 1, clientX: 160, clientY: 136 });
    fireEvent.pointerUp(screen.getByTestId("timeline-node-banda"), { pointerId: 1 });

    await waitFor(() => {
      expect(screen.getByTestId("timeline-node-card-banda").style.getPropertyValue("--timeline-card-offset-y")).toBe("36px");
    });
  });

  test("failed persistence keeps the local preview and exposes a pending error", async () => {
    render(<TimelineLens dataSource={makeDataSource({
      saveTimelineLayout: async () => { throw new Error("disk busy"); },
    })} onOpenNode={() => {}} />);
    const handle = await screen.findByTestId("timeline-node-resize-banda-se");
    fireEvent.pointerDown(handle, { pointerId: 7, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(screen.getByTestId("timeline-node-banda"), { pointerId: 7, clientX: 120, clientY: 110 });
    fireEvent.pointerUp(screen.getByTestId("timeline-node-banda"), { pointerId: 7 });
    expect(screen.getByTestId("timeline-node-card-banda")).toHaveStyle({ width: "300px", height: "102px" });
    expect(await screen.findByTestId("timeline-save-error-banda")).toHaveTextContent("Pending timeline edit: disk busy");
  });

  test("uses the returned layout revision for the next serialized edit", async () => {
    const saveTimelineLayout = vi.fn(async (input) => ({
      status: input.expectedRevision === 1 ? "updated" as const : "created" as const,
      layout: { lane: input.lane, offsetY: input.offsetY, width: input.width, height: input.height,
        style: input.style, layoutRevision: input.expectedRevision === 1 ? 8 : 9 },
    }));
    render(<TimelineLens dataSource={makeDataSource({ saveTimelineLayout })} onOpenNode={() => {}} />);
    fireEvent.click(await screen.findByTestId("timeline-node-color-banda"));
    await waitFor(() => expect(saveTimelineLayout).toHaveBeenCalledTimes(1));
    const handle = screen.getByTestId("timeline-node-resize-banda-se");
    fireEvent.pointerDown(handle, { pointerId: 8, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(screen.getByTestId("timeline-node-banda"), { pointerId: 8, clientX: 110, clientY: 105 });
    fireEvent.pointerUp(screen.getByTestId("timeline-node-banda"), { pointerId: 8 });
    await waitFor(() => expect(saveTimelineLayout).toHaveBeenLastCalledWith(expect.objectContaining({ expectedRevision: 8 })));
  });

  test("a delayed save from an old datasource cannot mutate a new workspace with the same node id", async () => {
    let resolveOld!: (value: Awaited<ReturnType<NonNullable<TimelineDataSource["saveTimelineLayout"]>>>) => void;
    const oldSave = vi.fn(() => new Promise<Awaited<ReturnType<NonNullable<TimelineDataSource["saveTimelineLayout"]>>>>((resolve) => { resolveOld = resolve; }));
    const oldSource = makeDataSource({ saveTimelineLayout: oldSave });
    const newSource = makeDataSource({
      loadTimelineView: async () => ({ workspaceId: "sqlite:/new", lanes: [{ id: "events" }], diagnostics: [], relationships: [], nodes: [
        timelineRecord(event("banda", "New workspace Banda", "1621-01-01"), layout("banda", 400, 130, { bgColour: "#abcdef" })),
      ] }),
    });
    const rendered = render(<TimelineLens dataSource={oldSource} onOpenNode={() => {}} />);
    const handle = await screen.findByTestId("timeline-node-resize-banda-se");
    fireEvent.pointerDown(handle, { pointerId: 41, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(screen.getByTestId("timeline-node-banda"), { pointerId: 41, clientX: 120, clientY: 110 });
    fireEvent.pointerUp(screen.getByTestId("timeline-node-banda"), { pointerId: 41 });
    await waitFor(() => expect(oldSave).toHaveBeenCalled());
    rendered.rerender(<TimelineLens dataSource={newSource} onOpenNode={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("timeline-node-card-banda")).toHaveStyle({ width: "400px", height: "130px" }));
    resolveOld({ status: "updated", layout: { lane: "events", offsetY: 0, width: 300, height: 102, style: {}, layoutRevision: 2 } });
    await Promise.resolve();
    expect(screen.getByTestId("timeline-node-card-banda")).toHaveStyle({ width: "400px", height: "130px" });
    expect(screen.queryByTestId("timeline-save-error-banda")).not.toBeInTheDocument();
  });

  test("transient failure retries the current preview with the same revision and clears the error", async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error("disk busy"))
      .mockImplementationOnce(async (input) => ({ status: "preserved", layout: { lane: input.lane, offsetY: input.offsetY,
        width: input.width, height: input.height, style: input.style, layoutRevision: 2 } }));
    render(<TimelineLens dataSource={makeDataSource({ saveTimelineLayout: save })} onOpenNode={() => {}} />);
    fireEvent.click(await screen.findByTestId("timeline-node-color-banda"));
    const alert = await screen.findByTestId("timeline-save-error-banda");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[0][0].expectedRevision).toBe(1);
    expect(save.mock.calls[1][0].expectedRevision).toBe(1);
    await waitFor(() => expect(screen.queryByTestId("timeline-save-error-banda")).not.toBeInTheDocument());
  });

  test("conflict retry uses the returned current revision", async () => {
    const save = vi.fn()
      .mockResolvedValueOnce({ status: "conflict", layout: { lane: "events", offsetY: 0, width: 280, height: 92, style: {}, layoutRevision: 7 }, reason: "stale" })
      .mockImplementationOnce(async (input) => ({ status: "updated", layout: { lane: input.lane, offsetY: input.offsetY,
        width: input.width, height: input.height, style: input.style, layoutRevision: 8 } }));
    render(<TimelineLens dataSource={makeDataSource({ saveTimelineLayout: save })} onOpenNode={() => {}} />);
    fireEvent.click(await screen.findByTestId("timeline-node-color-banda"));
    const alert = await screen.findByTestId("timeline-save-error-banda");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ expectedRevision: 7 })));
  });

  test("edge fade updates from rendered card position when the viewport zoom changes", async () => {
    render(
      <TimelineLens
        dataSource={makeDataSource({
          loadTimelineView: async () => ({ workspaceId: "sqlite:/test", lanes: [], diagnostics: [], relationships: [], nodes: [
            timelineRecord(event("edge", "Edge event", "1600-01-01"), layout("edge", 280, 92)),
          ] }),
        })}
        onOpenNode={() => {}}
      />,
    );

    const card = await screen.findByTestId("timeline-node-card-edge");
    expect(card.dataset.edgeFade).toBe("none");

    const track = screen.getByTestId("timeline-track");
    // Keep the card in the render overscan while moving it far enough left to
    // exercise its edge fade. A card far outside that band is deliberately
    // unmounted rather than retained merely to compute a fade.
    fireEvent.wheel(track, { deltaY: -900, clientX: 550 });

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
          loadTimelineView: async () => ({ workspaceId: "sqlite:/test", lanes: [], diagnostics: [], relationships: [], nodes: [
            timelineRecord(event("banda", "Banda genocide", "1621-01-01"), layout("banda", 280, 92)),
            timelineRecord(constellation("ql-unit", "QL Reading Unit", "1621-01-01"), layout("ql-unit", 300, 120)),
          ] }),
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

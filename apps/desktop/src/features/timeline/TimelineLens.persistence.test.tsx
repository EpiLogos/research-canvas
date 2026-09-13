import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { TimelineViewState } from "@research-canvas/desktop-api";
import type { AppTab, SurfaceTabState } from "@research-canvas/schema";

const context = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  publish: null as ((view: TimelineViewState) => void) | null,
}));

vi.mock("../canvas/CanvasWorkspaceContext", () => ({ useCanvasWorkspace: () => context.current }));
vi.mock("./createTimelineDataSource", () => ({ createTimelineDataSource: () => ({}) }));
vi.mock("@research-canvas/desktop-api", () => ({ DesktopTimelineRepository: class {} }));
vi.mock("@research-canvas/canvas", () => ({
  TimelineSurface: ({ initialState, onViewStateChange }: {
    initialState: TimelineViewState;
    onViewStateChange: (state: TimelineViewState) => void;
  }) => {
    // Mirrors the real surface's mount-only state. A new prop by itself must
    // not make this test pass: switching tabs has to remount the surface.
    const [camera] = useState(initialState);
    context.publish = onViewStateChange;
    return <output data-testid="camera">{JSON.stringify(camera)}</output>;
  },
}));

import { TimelineLens } from "./TimelineLens";

function tab(id: string, centerYear: number, pixelsPerYear: number): AppTab {
  return {
    id, surfaceId: "timeline", title: id, pinned: false,
    state: { surfaceId: "timeline", constellationId: "history", centerYear, pixelsPerYear, selectedGraphNodeId: null },
  };
}

function fixture() {
  let tabs = [tab("earlier", 1621, 8), tab("later", 1917, 24)];
  let activeTabId = "earlier";
  const updateState = vi.fn((id: string, state: SurfaceTabState) => {
    tabs = tabs.map((entry) => entry.id === id ? { ...entry, state } : entry);
  });
  const tabManager = { getState: () => ({ tabs, activeTabId, updateState }) };
  const activate = (id: string) => {
    activeTabId = id;
    context.current = {
      activeConstellationId: "history", activeTabId, activeTab: tabs.find((entry) => entry.id === id),
      tabManager, transport: {}, workspaceId: "sqlite:test", databasePath: "/tmp/test.sqlite",
      openConstellationTab: vi.fn(), selectNode: vi.fn(),
    };
  };
  activate(activeTabId);
  return { activate, tabManager, updateState };
}

beforeEach(() => { context.publish = null; });

describe("TimelineLens persisted tab integration", () => {
  test("remounts the saved camera when switching between two Timelines in one constellation", () => {
    const { activate } = fixture();
    const rendered = render(<TimelineLens onOpenNodeDocument={vi.fn()} />);
    expect(screen.getByTestId("camera")).toHaveTextContent('"centerYear":1621');
    activate("later");
    rendered.rerender(<TimelineLens onOpenNodeDocument={vi.fn()} />);
    expect(screen.getByTestId("camera")).toHaveTextContent('"centerYear":1917');
    expect(screen.getByTestId("camera")).toHaveTextContent('"pixelsPerYear":24');
    activate("earlier");
    rendered.rerender(<TimelineLens onOpenNodeDocument={vi.fn()} />);
    expect(screen.getByTestId("camera")).toHaveTextContent('"pixelsPerYear":8');
  });

  test("a retained callback from the departing tab cannot retarget the newly active tab", () => {
    const { activate, updateState, tabManager } = fixture();
    const rendered = render(<TimelineLens onOpenNodeDocument={vi.fn()} />);
    const departed = context.publish!;
    activate("later");
    rendered.rerender(<TimelineLens onOpenNodeDocument={vi.fn()} />);
    act(() => departed({ centerYear: 1700, pixelsPerYear: 0.05, selectedNodeId: null }));
    expect(updateState).not.toHaveBeenCalled();
    expect(tabManager.getState().tabs[1].state).toMatchObject({ constellationId: "history", centerYear: 1917, pixelsPerYear: 24 });
  });

  test("saved camera and owner survive a fresh host mount", () => {
    const { activate, tabManager } = fixture();
    const first = render(<TimelineLens onOpenNodeDocument={vi.fn()} />);
    act(() => context.publish!({ centerYear: 1550, pixelsPerYear: 11, selectedNodeId: "event" }));
    expect(tabManager.getState().tabs[0].state).toMatchObject({ constellationId: "history", centerYear: 1550, pixelsPerYear: 11 });
    first.unmount();
    activate("earlier");
    render(<TimelineLens onOpenNodeDocument={vi.fn()} />);
    expect(screen.getByTestId("camera")).toHaveTextContent('"centerYear":1550');
    expect(screen.getByTestId("camera")).toHaveTextContent('"pixelsPerYear":11');
    expect(screen.getByTestId("camera")).toHaveTextContent('"selectedNodeId":"event"');
  });
});

import { describe, expect, it } from "vitest";

import {
  activateCanvasTab,
  closeCanvasTab,
  openOrActivateCanvasTab,
  rememberCanvasTabSession,
  type CanvasTabState,
} from "./canvasTabState";

const initialState: CanvasTabState = { tabs: [], activeTabId: null };

describe("canvas tab state", () => {
  it("opens a constellation/canvas once and activates it rather than duplicating it", () => {
    const first = openOrActivateCanvasTab(initialState, {
      constellationId: "root",
      canvasId: "canvas-root",
      label: "Archetypal field",
      pinned: true,
    });
    const repeated = openOrActivateCanvasTab(first, {
      constellationId: "root",
      canvasId: "canvas-root",
      label: "Archetypal field",
      pinned: true,
    });

    expect(repeated.tabs).toHaveLength(1);
    expect(repeated.activeTabId).toBe("root:canvas-root");
    expect(repeated.tabs[0]).toMatchObject({ pinned: true, label: "Archetypal field" });
  });

  it("never closes the pinned root tab", () => {
    const withRoot = openOrActivateCanvasTab(initialState, {
      constellationId: "root",
      canvasId: "canvas-root",
      label: "Archetypal field",
      pinned: true,
    });

    expect(closeCanvasTab(withRoot, "root:canvas-root")).toEqual(withRoot);
  });

  it("retains independent selection and viewport sessions while moving between tabs", () => {
    let state = openOrActivateCanvasTab(initialState, {
      constellationId: "root",
      canvasId: "canvas-root",
      label: "Archetypal field",
      pinned: true,
    });
    state = rememberCanvasTabSession(state, "root:canvas-root", {
      selectedNodeId: "root-node",
      selectedEdgeId: null,
      viewport: { x: 120, y: -40, zoom: 1.4 },
    });
    state = openOrActivateCanvasTab(state, {
      constellationId: "episode-2",
      canvasId: "canvas-episode-2",
      label: "Episode 2",
      pinned: false,
    });
    state = rememberCanvasTabSession(state, "episode-2:canvas-episode-2", {
      selectedNodeId: "banda-1621",
      selectedEdgeId: "edge-banda",
      viewport: { x: -80, y: 24, zoom: 0.82 },
    });
    state = activateCanvasTab(state, "root:canvas-root");

    expect(state.activeTabId).toBe("root:canvas-root");
    expect(state.tabs.find((tab) => tab.id === "root:canvas-root")).toMatchObject({
      selectedNodeId: "root-node",
      viewport: { x: 120, y: -40, zoom: 1.4 },
    });
    expect(state.tabs.find((tab) => tab.id === "episode-2:canvas-episode-2")).toMatchObject({
      selectedNodeId: "banda-1621",
      selectedEdgeId: "edge-banda",
      viewport: { x: -80, y: 24, zoom: 0.82 },
    });
  });

  it("activates the nearest surviving tab when a non-pinned tab closes", () => {
    let state = openOrActivateCanvasTab(initialState, {
      constellationId: "root", canvasId: "canvas-root", label: "Root", pinned: true,
    });
    state = openOrActivateCanvasTab(state, {
      constellationId: "episode-2", canvasId: "canvas-episode-2", label: "Episode 2", pinned: false,
    });

    expect(closeCanvasTab(state, "episode-2:canvas-episode-2")).toMatchObject({
      activeTabId: "root:canvas-root",
      tabs: [{ id: "root:canvas-root" }],
    });
  });
});

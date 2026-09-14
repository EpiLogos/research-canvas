import { describe, expect, it, vi } from "vitest";
import {
  createTabManagerStore,
  type TabManagerStateSnapshot,
} from "./tabManager";

function buildTab(id: string, surfaceId: "canvas" | "timeline" = "canvas", title = id): import("@research-canvas/schema").AppTab {
  return {
    id,
    surfaceId,
    title,
    pinned: false,
    state:
      surfaceId === "canvas"
        ? {
            surfaceId: "canvas",
            canvasId: "11111111-1111-4111-8111-111111111111",
            constellationId: "root",
            viewport: { x: 0, y: 0, zoom: 1 },
          }
        : { surfaceId: "timeline", centerYear: 0, pixelsPerYear: 20 },
  };
}

describe("tabManager", () => {
  it("opens a tab and activates it by default", () => {
    const store = createTabManagerStore();
    const tab = buildTab("tab-1");

    store.getState().open(tab);

    expect(store.getState().tabs).toHaveLength(1);
    expect(store.getState().activeTabId).toBe("tab-1");
    expect(store.getState().getActiveTab()?.title).toBe("tab-1");
  });

  it("can open without activating", () => {
    const store = createTabManagerStore();
    store.getState().open(buildTab("first"));
    store.getState().open(buildTab("second"), { activate: false });

    expect(store.getState().tabs).toHaveLength(2);
    expect(store.getState().activeTabId).toBe("first");
  });

  it("replaces an existing tab with the same id", () => {
    const store = createTabManagerStore();
    store.getState().open(buildTab("tab-1", "canvas", "Original"));
    store.getState().open({ ...buildTab("tab-1", "canvas", "Replaced"), pinned: true });

    expect(store.getState().tabs).toHaveLength(1);
    expect(store.getState().tabs[0].title).toBe("Replaced");
    expect(store.getState().tabs[0].pinned).toBe(true);
  });

  it("activates a tab", () => {
    const store = createTabManagerStore();
    store.getState().open(buildTab("first"));
    store.getState().open(buildTab("second"), { activate: false });

    store.getState().activate("second");

    expect(store.getState().activeTabId).toBe("second");
  });

  it("ignores activation of an unknown tab id", () => {
    const store = createTabManagerStore();
    store.getState().open(buildTab("first"));

    store.getState().activate("missing");

    expect(store.getState().activeTabId).toBe("first");
  });

  it("closes a tab and activates the previous one", () => {
    const store = createTabManagerStore();
    store.getState().open(buildTab("first"));
    store.getState().open(buildTab("second"));
    store.getState().open(buildTab("third"));

    store.getState().close("third");

    expect(store.getState().tabs.map((t) => t.id)).toEqual(["first", "second"]);
    expect(store.getState().activeTabId).toBe("second");
  });

  it("activates the next tab when closing the first tab", () => {
    const store = createTabManagerStore();
    store.getState().open(buildTab("first"));
    store.getState().open(buildTab("second"));

    store.getState().close("first");

    expect(store.getState().activeTabId).toBe("second");
  });

  it("closes all tabs", () => {
    const store = createTabManagerStore();
    store.getState().open(buildTab("first"));
    store.getState().open(buildTab("second"));

    store.getState().closeAll();

    expect(store.getState().tabs).toHaveLength(0);
    expect(store.getState().activeTabId).toBeNull();
  });

  it("closes every tab except the requested one", () => {
    const store = createTabManagerStore();
    store.getState().open(buildTab("first"));
    store.getState().open(buildTab("second"));
    store.getState().open(buildTab("third"));

    store.getState().closeOthers("second");

    expect(store.getState().tabs.map((t) => t.id)).toEqual(["second"]);
    expect(store.getState().activeTabId).toBe("second");
  });

  it("update mutates tab metadata", () => {
    const store = createTabManagerStore();
    store.getState().open(buildTab("first", "canvas", "A"));

    store.getState().update("first", { title: "Renamed", pinned: true });

    expect(store.getState().tabs[0].title).toBe("Renamed");
    expect(store.getState().tabs[0].pinned).toBe(true);
  });

  it("updateState replaces the persisted surface state", () => {
    const store = createTabManagerStore();
    store.getState().open(buildTab("first"));

    store.getState().updateState("first", {
      surfaceId: "canvas",
      canvasId: "11111111-1111-4111-8111-111111111111",
      constellationId: "root",
      viewport: { x: 10, y: 20, zoom: 0.5 },
      selectedGraphNodeId: "node-1",
    });

    const state = store.getState().tabs[0].state;
    expect(state.surfaceId).toBe("canvas");
    if (state.surfaceId === "canvas") {
      expect(state.viewport).toEqual({ x: 10, y: 20, zoom: 0.5 });
      expect(state.selectedGraphNodeId).toBe("node-1");
    }
  });

  it("hydrates from a snapshot", () => {
    const snapshot: TabManagerStateSnapshot = {
      tabs: [
        {
          id: "timeline-1",
          surfaceId: "timeline",
          title: "Timeline",
          pinned: true,
          state: { surfaceId: "timeline", centerYear: 500, pixelsPerYear: 40 },
        },
      ],
      activeTabId: "timeline-1",
    };
    const store = createTabManagerStore();

    store.getState().hydrate(snapshot);

    expect(store.getState().tabs).toHaveLength(1);
    expect(store.getState().activeTabId).toBe("timeline-1");
    expect(store.getState().getActiveTab()?.state.surfaceId).toBe("timeline");
  });

  it("invokes onPersist after mutations", () => {
    const onPersist = vi.fn();
    const store = createTabManagerStore({ tabs: [], activeTabId: null }, { onPersist });

    store.getState().open(buildTab("first"));
    expect(onPersist).toHaveBeenCalledWith(
      expect.objectContaining({ activeTabId: "first", tabs: expect.any(Array) }),
    );

    store.getState().activate("first");
    store.getState().close("first");
    expect(onPersist.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("has returns true for open tabs only", () => {
    const store = createTabManagerStore();
    store.getState().open(buildTab("first"));

    expect(store.getState().has("first")).toBe(true);
    expect(store.getState().has("missing")).toBe(false);
  });
});

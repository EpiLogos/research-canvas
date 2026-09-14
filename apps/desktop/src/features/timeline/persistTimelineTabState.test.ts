import { describe, expect, test, vi } from "vitest";
import { createTabManagerStore } from "@research-canvas/canvas";
import { appTabSchema, type AppTab } from "@research-canvas/schema";
import { persistTimelineTabState } from "./persistTimelineTabState";

function timelineTab(id: string, constellationId?: string): AppTab {
  return {
    id, surfaceId: "timeline", title: "Renamed timeline", pinned: false,
    state: {
      surfaceId: "timeline", constellationId,
      centerYear: 1700, pixelsPerYear: 2, selectedGraphNodeId: null,
    },
  };
}

const camera = { centerYear: 1621, pixelsPerYear: 8, selectedNodeId: "authored-event" };

function fixture(tabs: AppTab[] = [timelineTab("history-tab", "history")], activeTabId = tabs[0]?.id ?? null) {
  const onPersist = vi.fn();
  const store = createTabManagerStore({ tabs, activeTabId }, { onPersist });
  return { store, onPersist };
}

describe("Timeline tab persistence", () => {
  test("retains the canonical owner, camera and selection through schema + JSON restore", () => {
    const { store } = fixture();
    expect(persistTimelineTabState(store.getState(), "history-tab", "history", camera)).toBe(true);
    const restored = appTabSchema.parse(JSON.parse(JSON.stringify(store.getState().tabs[0])));
    expect(restored).toEqual({
      ...timelineTab("history-tab", "history"),
      state: {
        surfaceId: "timeline", constellationId: "history",
        centerYear: 1621, pixelsPerYear: 8, selectedGraphNodeId: "authored-event",
      },
    });
  });

  test("a departing Timeline callback cannot overwrite another active Timeline", () => {
    const { store, onPersist } = fixture([timelineTab("history-tab", "history"), timelineTab("other-tab", "other")]);
    const departingCallback = () => persistTimelineTabState(store.getState(), "history-tab", "history", camera);
    store.getState().activate("other-tab");
    onPersist.mockClear();
    const before = structuredClone(store.getState().tabs);
    expect(departingCallback()).toBe(false);
    expect(store.getState().tabs).toEqual(before);
    expect(onPersist).not.toHaveBeenCalled();
  });

  test("rejects a stale callback after closing its originating tab", () => {
    const { store, onPersist } = fixture([timelineTab("history-tab", "history"), timelineTab("successor", "other")]);
    store.getState().close("history-tab");
    onPersist.mockClear();
    const before = structuredClone(store.getState().tabs);
    expect(persistTimelineTabState(store.getState(), "history-tab", "history", camera)).toBe(false);
    expect(store.getState().tabs).toEqual(before);
    expect(onPersist).not.toHaveBeenCalled();
  });

  test("does not write a camera into an active non-Timeline surface", () => {
    const palace: AppTab = { id: "palace", surfaceId: "palace", title: "Palace", pinned: false, state: { surfaceId: "palace", constellationId: "history" } };
    const { store, onPersist } = fixture([palace]);
    expect(persistTimelineTabState(store.getState(), "palace", "history", camera)).toBe(false);
    expect(store.getState().tabs).toEqual([palace]);
    expect(onPersist).not.toHaveBeenCalled();
  });

  test("refuses to transfer an owned tab to a different constellation", () => {
    const { store, onPersist } = fixture();
    expect(persistTimelineTabState(store.getState(), "history-tab", "root", camera)).toBe(false);
    expect(store.getState().tabs[0].state).toEqual(timelineTab("history-tab", "history").state);
    expect(onPersist).not.toHaveBeenCalled();
  });

  test("binds only an unowned active legacy Timeline to its current constellation", () => {
    const { store } = fixture([timelineTab("legacy")]);
    expect(persistTimelineTabState(store.getState(), "legacy", "history", camera)).toBe(true);
    expect(store.getState().tabs[0].state).toMatchObject({ constellationId: "history", pixelsPerYear: 8 });
  });

  test.each([
    { centerYear: NaN, pixelsPerYear: 8 },
    { centerYear: Infinity, pixelsPerYear: 8 },
    { centerYear: 1621, pixelsPerYear: NaN },
    { centerYear: 1621, pixelsPerYear: Infinity },
    { centerYear: 1621, pixelsPerYear: 0 },
    { centerYear: 1621, pixelsPerYear: -1 },
  ])("does not persist an invalid camera: %j", (viewport) => {
    const { store, onPersist } = fixture();
    expect(persistTimelineTabState(store.getState(), "history-tab", "history", { ...camera, ...viewport })).toBe(false);
    expect(onPersist).not.toHaveBeenCalled();
  });

  test("ignores repeated camera settlement instead of enqueuing duplicate durable writes", () => {
    const { store, onPersist } = fixture();
    persistTimelineTabState(store.getState(), "history-tab", "history", camera);
    onPersist.mockClear();
    expect(persistTimelineTabState(store.getState(), "history-tab", "history", camera)).toBe(false);
    expect(onPersist).not.toHaveBeenCalled();
  });

  test("can clear a saved selection without losing its camera or owner", () => {
    const { store } = fixture();
    persistTimelineTabState(store.getState(), "history-tab", "history", camera);
    expect(persistTimelineTabState(store.getState(), "history-tab", "history", { ...camera, selectedNodeId: null })).toBe(true);
    expect(store.getState().tabs[0].state).toMatchObject({ constellationId: "history", centerYear: 1621, pixelsPerYear: 8, selectedGraphNodeId: null });
  });
});

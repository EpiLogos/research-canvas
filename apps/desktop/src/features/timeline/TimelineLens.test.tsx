import { describe, expect, test } from "vitest";
import { timelineViewStateFromTab } from "./TimelineLens";

describe("timelineViewStateFromTab", () => {
  test("maps a persisted timeline tab camera and selection without changing it", () => {
    expect(timelineViewStateFromTab({
      surfaceId: "timeline",
      centerYear: 1917,
      pixelsPerYear: 8,
      selectedGraphNodeId: "event-1",
    })).toEqual({
      centerYear: 1917,
      pixelsPerYear: 8,
      selectedNodeId: "event-1",
    });
  });

  test("opens an unpositioned timeline as a broad global walk", () => {
    expect(timelineViewStateFromTab(null)).toEqual({
      centerYear: 0,
      pixelsPerYear: 0.05,
      selectedNodeId: null,
    });
    expect(timelineViewStateFromTab({
      surfaceId: "timeline",
      centerYear: 0,
      pixelsPerYear: 20,
    })).toEqual({
      centerYear: 0,
      pixelsPerYear: 0.05,
      selectedNodeId: null,
    });
  });
});

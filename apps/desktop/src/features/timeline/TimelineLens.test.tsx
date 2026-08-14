import { describe, expect, test } from "vitest";
import { timelineViewStateFromTab } from "./TimelineLens";

describe("timelineViewStateFromTab", () => {
  test("maps the persisted timeline tab camera and selection to the domain contract", () => {
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

  test("uses the timeline zero-case when no timeline tab is active", () => {
    expect(timelineViewStateFromTab(null)).toEqual({
      centerYear: 0,
      pixelsPerYear: 20,
      selectedNodeId: null,
    });
  });
});

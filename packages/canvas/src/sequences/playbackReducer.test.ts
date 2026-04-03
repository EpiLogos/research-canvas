import { describe, expect, test } from "vitest";
import { playbackReducer, initialPlaybackState, type PlaybackState } from "./playbackReducer";

describe("playbackReducer", () => {
  test("enter sets active and pushes root", () => {
    const state = playbackReducer(initialPlaybackState, {
      type: "enter",
      rootNodeId: "A",
    });
    expect(state.active).toBe(true);
    expect(state.currentNodeId).toBe("A");
    expect(state.path).toEqual(["A"]);
  });

  test("advance pushes target onto path", () => {
    const state: PlaybackState = { active: true, path: ["A"], currentNodeId: "A" };
    const next = playbackReducer(state, { type: "advance", targetNodeId: "B" });
    expect(next.path).toEqual(["A", "B"]);
    expect(next.currentNodeId).toBe("B");
  });

  test("back pops current from path", () => {
    const state: PlaybackState = { active: true, path: ["A", "B", "C"], currentNodeId: "C" };
    const next = playbackReducer(state, { type: "back" });
    expect(next.path).toEqual(["A", "B"]);
    expect(next.currentNodeId).toBe("B");
  });

  test("back from root exits playback", () => {
    const state: PlaybackState = { active: true, path: ["A"], currentNodeId: "A" };
    const next = playbackReducer(state, { type: "back" });
    expect(next.active).toBe(false);
    expect(next.path).toEqual([]);
    expect(next.currentNodeId).toBeNull();
  });

  test("exit deactivates playback", () => {
    const state: PlaybackState = { active: true, path: ["A", "B"], currentNodeId: "B" };
    const next = playbackReducer(state, { type: "exit" });
    expect(next.active).toBe(false);
  });

  test("jump replaces path", () => {
    const state: PlaybackState = { active: true, path: ["A", "B"], currentNodeId: "B" };
    const next = playbackReducer(state, { type: "jump", nodeId: "D", pathFromRoot: ["A", "C", "D"] });
    expect(next.path).toEqual(["A", "C", "D"]);
    expect(next.currentNodeId).toBe("D");
  });

  test("home clears path", () => {
    const state: PlaybackState = { active: true, path: ["A", "B", "C"], currentNodeId: "C" };
    const next = playbackReducer(state, { type: "home" });
    expect(next.path).toEqual([]);
    expect(next.currentNodeId).toBeNull();
    expect(next.active).toBe(true);
  });
});

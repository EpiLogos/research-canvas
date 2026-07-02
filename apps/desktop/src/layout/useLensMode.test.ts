import { describe, expect, test } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLensMode } from "./useLensMode";

describe("useLensMode", () => {
  test("defaults to canvas", () => {
    const { result } = renderHook(() => useLensMode());
    expect(result.current.lens).toBe("canvas");
  });

  test("honours an explicit initial lens", () => {
    const { result } = renderHook(() => useLensMode("timeline"));
    expect(result.current.lens).toBe("timeline");
  });

  test("setLens switches to a chosen lens", () => {
    const { result } = renderHook(() => useLensMode());
    act(() => result.current.setLens("timeline"));
    expect(result.current.lens).toBe("timeline");
  });

  test("toggleLens flips between the two lenses", () => {
    const { result } = renderHook(() => useLensMode());
    act(() => result.current.toggleLens());
    expect(result.current.lens).toBe("timeline");
    act(() => result.current.toggleLens());
    expect(result.current.lens).toBe("canvas");
  });
});

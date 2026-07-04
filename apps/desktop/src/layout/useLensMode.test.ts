import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useLensMode } from "./useLensMode";

describe("useLensMode", () => {
  it("defaults to canvas", () => {
    const { result } = renderHook(() => useLensMode());
    expect(result.current.lens).toBe("canvas");
  });

  it("sets any of the three lenses", () => {
    const { result } = renderHook(() => useLensMode());
    act(() => result.current.setLens("reading"));
    expect(result.current.lens).toBe("reading");
    act(() => result.current.setLens("timeline"));
    expect(result.current.lens).toBe("timeline");
  });

  it("cycles canvas -> timeline -> reading -> canvas", () => {
    const { result } = renderHook(() => useLensMode());
    act(() => result.current.cycleLens());
    expect(result.current.lens).toBe("timeline");
    act(() => result.current.cycleLens());
    expect(result.current.lens).toBe("reading");
    act(() => result.current.cycleLens());
    expect(result.current.lens).toBe("canvas");
  });
});

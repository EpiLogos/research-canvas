import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useLensMode } from "./useLensMode";

describe("useLensMode", () => {
  it("defaults to canvas", () => {
    const { result } = renderHook(() => useLensMode());
    expect(result.current.lens).toBe("canvas");
  });

  it("sets any lens", () => {
    const { result } = renderHook(() => useLensMode());
    act(() => result.current.setLens("reading"));
    expect(result.current.lens).toBe("reading");
    act(() => result.current.setLens("timeline"));
    expect(result.current.lens).toBe("timeline");
    act(() => result.current.setLens("psychogeographic"));
    expect(result.current.lens).toBe("psychogeographic");
  });

  it("cycles canvas -> timeline -> psychogeographic -> story -> palace -> reading -> canvas", () => {
    const { result } = renderHook(() => useLensMode());
    act(() => result.current.cycleLens());
    expect(result.current.lens).toBe("timeline");
    act(() => result.current.cycleLens());
    expect(result.current.lens).toBe("psychogeographic");
    act(() => result.current.cycleLens());
    expect(result.current.lens).toBe("story");
    act(() => result.current.cycleLens());
    expect(result.current.lens).toBe("palace");
    act(() => result.current.cycleLens());
    expect(result.current.lens).toBe("reading");
    act(() => result.current.cycleLens());
    expect(result.current.lens).toBe("canvas");
  });
});

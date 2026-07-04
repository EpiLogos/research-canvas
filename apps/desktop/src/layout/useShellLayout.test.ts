import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useShellLayout } from "./useShellLayout";

describe("useShellLayout summoned panels", () => {
  it("all panels start closed", () => {
    const { result } = renderHook(() => useShellLayout());
    expect(result.current.browserOpen).toBe(false);
    expect(result.current.inspectorOpen).toBe(false);
    expect(result.current.dockOpen).toBe(false);
    expect(result.current.inspectorPinned).toBe(false);
  });

  it("toggles each panel", () => {
    const { result } = renderHook(() => useShellLayout());
    act(() => result.current.toggleBrowser());
    expect(result.current.browserOpen).toBe(true);
    act(() => result.current.toggleInspector());
    expect(result.current.inspectorOpen).toBe(true);
    act(() => result.current.toggleDock());
    expect(result.current.dockOpen).toBe(true);
    act(() => result.current.toggleBrowser());
    expect(result.current.browserOpen).toBe(false);
  });

  it("toggles the inspector pin", () => {
    const { result } = renderHook(() => useShellLayout());
    act(() => result.current.toggleInspectorPin());
    expect(result.current.inspectorPinned).toBe(true);
  });

  it("setBrowserOpen sets explicitly", () => {
    const { result } = renderHook(() => useShellLayout());
    act(() => result.current.setBrowserOpen(true));
    expect(result.current.browserOpen).toBe(true);
  });
});

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useShellLayout } from "./useShellLayout";

describe("useShellLayout summoned panels", () => {
  it("all panels start closed", () => {
    const { result } = renderHook(() => useShellLayout());
    expect(result.current.browserOpen).toBe(false);
    expect(result.current.inspectorOpen).toBe(false);
    expect(result.current.inspectorPinned).toBe(false);
  });

  it("toggles each panel", () => {
    const { result } = renderHook(() => useShellLayout());
    act(() => result.current.toggleBrowser());
    expect(result.current.browserOpen).toBe(true);
    act(() => result.current.toggleInspector());
    expect(result.current.inspectorOpen).toBe(true);
    act(() => result.current.toggleBrowser());
    expect(result.current.browserOpen).toBe(false);
  });

  it("toggles the inspector pin", () => {
    const { result } = renderHook(() => useShellLayout());
    act(() => result.current.toggleInspectorPin());
    expect(result.current.inspectorPinned).toBe(true);
  });

  it("inspectorUserClosed defaults to false", () => {
    const { result } = renderHook(() => useShellLayout());
    expect(result.current.inspectorUserClosed).toBe(false);
  });

  it("closeInspector closes the inspector and records the user dismissal", () => {
    const { result } = renderHook(() => useShellLayout());
    act(() => result.current.openInspector());
    act(() => result.current.closeInspector());
    expect(result.current.inspectorOpen).toBe(false);
    expect(result.current.inspectorUserClosed).toBe(true);
  });

  it("openInspector opens the inspector and clears the user dismissal", () => {
    const { result } = renderHook(() => useShellLayout());
    act(() => result.current.closeInspector());
    act(() => result.current.openInspector());
    expect(result.current.inspectorOpen).toBe(true);
    expect(result.current.inspectorUserClosed).toBe(false);
  });

  it("toggleInspector from open closes and records the user dismissal", () => {
    const { result } = renderHook(() => useShellLayout());
    act(() => result.current.openInspector());
    act(() => result.current.toggleInspector());
    expect(result.current.inspectorOpen).toBe(false);
    expect(result.current.inspectorUserClosed).toBe(true);
  });

  it("toggleInspector from closed opens and clears the user dismissal", () => {
    const { result } = renderHook(() => useShellLayout());
    act(() => result.current.closeInspector());
    act(() => result.current.toggleInspector());
    expect(result.current.inspectorOpen).toBe(true);
    expect(result.current.inspectorUserClosed).toBe(false);
  });

  it("setBrowserOpen sets explicitly", () => {
    const { result } = renderHook(() => useShellLayout());
    act(() => result.current.setBrowserOpen(true));
    expect(result.current.browserOpen).toBe(true);
  });

  it("browser resize widens as the pointer moves right", () => {
    const { result } = renderHook(() => useShellLayout());
    const start = { clientX: 100, preventDefault() {} } as unknown as React.PointerEvent;
    act(() => result.current.beginBrowserResize(start));
    act(() => window.dispatchEvent(new PointerEvent("pointermove", { clientX: 140 })));
    expect(result.current.browserWidth).toBe(320);
    act(() => window.dispatchEvent(new PointerEvent("pointerup")));
  });

  it("inspector resize widens as the pointer moves LEFT (right-anchored)", () => {
    const { result } = renderHook(() => useShellLayout());
    const start = { clientX: 500, preventDefault() {} } as unknown as React.PointerEvent;
    act(() => result.current.beginInspectorResize(start));
    act(() => window.dispatchEvent(new PointerEvent("pointermove", { clientX: 460 })));
    expect(result.current.inspectorWidth).toBe(360);
    act(() => window.dispatchEvent(new PointerEvent("pointerup")));
  });
});

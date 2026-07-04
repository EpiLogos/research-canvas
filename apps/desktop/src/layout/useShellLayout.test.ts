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

  it("browser resize widens as the pointer moves right", () => {
    const { result } = renderHook(() => useShellLayout());
    const start = { clientX: 100, preventDefault() {} } as unknown as React.PointerEvent;
    act(() => result.current.beginBrowserResize(start));
    act(() => window.dispatchEvent(new PointerEvent("pointermove", { clientX: 140 })));
    expect(result.current.browserWidth).toBe(280);
    act(() => window.dispatchEvent(new PointerEvent("pointerup")));
  });

  it("inspector resize widens as the pointer moves LEFT (right-anchored)", () => {
    const { result } = renderHook(() => useShellLayout());
    const start = { clientX: 500, preventDefault() {} } as unknown as React.PointerEvent;
    act(() => result.current.beginInspectorResize(start));
    act(() => window.dispatchEvent(new PointerEvent("pointermove", { clientX: 460 })));
    expect(result.current.inspectorWidth).toBe(300);
    act(() => window.dispatchEvent(new PointerEvent("pointerup")));
  });

  it("dock grows as the pointer moves UP (bottom-anchored)", () => {
    const { result } = renderHook(() => useShellLayout());
    const start = { clientY: 400, preventDefault() {} } as unknown as React.PointerEvent;
    act(() => result.current.beginDockResize(start));
    act(() => window.dispatchEvent(new PointerEvent("pointermove", { clientY: 360 })));
    expect(result.current.dockHeight).toBe(280);
    act(() => window.dispatchEvent(new PointerEvent("pointerup")));
  });
});

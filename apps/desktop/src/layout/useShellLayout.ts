import { useCallback, useRef, useState } from "react";

const BROWSER_MIN = 240;
const BROWSER_MAX = 460;
const INSPECTOR_MIN = 220;
const INSPECTOR_MAX = 380;

export function useShellLayout() {
  const shellRef = useRef<HTMLDivElement>(null);

  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserWidth, setBrowserWidth] = useState(280);
  const toggleBrowser = useCallback(() => setBrowserOpen((v) => !v), []);

  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorPinned, setInspectorPinned] = useState(false);
  const [inspectorUserClosed, setInspectorUserClosed] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(320);
  const openInspector = useCallback(() => {
    setInspectorOpen(true);
    setInspectorUserClosed(false);
  }, []);
  const closeInspector = useCallback(() => {
    setInspectorOpen(false);
    setInspectorUserClosed(true);
  }, []);
  const toggleInspector = useCallback(() => {
    setInspectorOpen((v) => {
      if (v) {
        setInspectorUserClosed(true);
        return false;
      }
      setInspectorUserClosed(false);
      return true;
    });
  }, []);
  const toggleInspectorPin = useCallback(() => setInspectorPinned((v) => !v), []);

  const browserWidthRef = useRef(browserWidth);
  browserWidthRef.current = browserWidth;
  const inspectorWidthRef = useRef(inspectorWidth);
  inspectorWidthRef.current = inspectorWidth;

  const beginBrowserResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = browserWidthRef.current;
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(BROWSER_MAX, Math.max(BROWSER_MIN, startW + ev.clientX - startX));
      setBrowserWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const beginInspectorResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = inspectorWidthRef.current;
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, startW + startX - ev.clientX));
      setInspectorWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  return {
    shellRef,
    browserOpen,
    setBrowserOpen,
    toggleBrowser,
    browserWidth,
    beginBrowserResize,
    inspectorOpen,
    setInspectorOpen,
    toggleInspector,
    openInspector,
    closeInspector,
    inspectorPinned,
    toggleInspectorPin,
    inspectorUserClosed,
    inspectorWidth,
    beginInspectorResize,
  };
}

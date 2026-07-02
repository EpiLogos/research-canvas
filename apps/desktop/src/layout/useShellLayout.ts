import { useCallback, useRef, useState } from "react";

export type RightTab = "inspector" | "content" | "terminal" | "agent";

const LEFT_MIN = 200;
const LEFT_MAX = 480;
const RIGHT_MIN = 280;
const RIGHT_MAX = 560;

export function useShellLayout() {
  // Attached to the top-level shell <div> in Shell.tsx
  const shellRef = useRef<HTMLDivElement>(null);

  const [leftOpen, setLeftOpen] = useState(false);
  const [leftWidth, setLeftWidth] = useState(240);

  const [rightOpen, setRightOpen] = useState(false);
  const [rightWidth, setRightWidth] = useState(320);

  const leftWidthRef = useRef(leftWidth);
  leftWidthRef.current = leftWidth;

  const rightWidthRef = useRef(rightWidth);
  rightWidthRef.current = rightWidth;
  const [rightTab, setRightTab] = useState<RightTab>("inspector");

  const openRightTab = useCallback((tab: RightTab) => {
    setRightTab(tab);
    setRightOpen(true);
  }, []);

  const toggleLeft = useCallback(() => setLeftOpen((v) => !v), []);
  const toggleRight = useCallback(() => setRightOpen((v) => !v), []);

  const beginLeftResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = leftWidthRef.current;
      const onMove = (ev: PointerEvent) => {
        const next = Math.min(LEFT_MAX, Math.max(LEFT_MIN, startW + ev.clientX - startX));
        setLeftWidth(next);
        if (next <= LEFT_MIN) setLeftOpen(false);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [], // stable — reads width via ref, not closure
  );

  const beginRightResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = rightWidthRef.current;
      const onMove = (ev: PointerEvent) => {
        const delta = startX - ev.clientX;
        const next = Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, startW + delta));
        setRightWidth(next);
        if (next <= RIGHT_MIN) setRightOpen(false);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [], // stable
  );

  return {
    shellRef,
    leftOpen,
    leftWidth,
    setLeftOpen,
    toggleLeft,
    beginLeftResize,
    rightOpen,
    rightWidth,
    rightTab,
    setRightOpen,
    openRightTab,
    toggleRight,
    beginRightResize,
  };
}

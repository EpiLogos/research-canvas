import { useCallback, useState } from "react";

const OPEN_KEY = "research-canvas.terminal.open";
const OPACITY_KEY = "research-canvas.terminal.opacity";
const WIDTH_KEY = "research-canvas.terminal.width";
const HEIGHT_KEY = "research-canvas.terminal.height";

const MIN_OPACITY = 0.5;
const MAX_OPACITY = 1.0;
const MIN_WIDTH = 420;
const MAX_WIDTH = 1100;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 560;

function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "true";
}

function readStoredNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function writeStored(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage may be unavailable in private modes; ignore.
  }
}

function defaultWidth(): number {
  if (typeof window === "undefined") return 960;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(window.innerWidth * 0.8)));
}

function defaultHeight(): number {
  if (typeof window === "undefined") return 320;
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(window.innerHeight * 0.4)));
}

export interface TerminalManager {
  /** Whether the floating terminal panel is currently open. */
  isOpen: boolean;
  /** Open the terminal panel. */
  open: () => void;
  /** Close the terminal panel (sessions stay alive server-side). */
  close: () => void;
  /** Toggle the terminal panel. */
  toggle: () => void;
  /** Panel background opacity, clamped 0.5–1.0. */
  opacity: number;
  /** Update panel opacity and persist the preference. */
  setOpacity: (value: number) => void;
  /** Panel width in pixels. */
  width: number;
  /** Panel height in pixels. */
  height: number;
  /** Resize the panel, clamping to min/max bounds. */
  setSize: (size: { width?: number; height?: number }) => void;
}

export function useTerminalManager(initialOpen = false): TerminalManager {
  const [isOpen, setIsOpen] = useState(() => readStoredBoolean(OPEN_KEY, initialOpen));
  const [opacity, setOpacityState] = useState(() =>
    readStoredNumber(OPACITY_KEY, 0.85),
  );
  const [width, setWidth] = useState(() => readStoredNumber(WIDTH_KEY, defaultWidth()));
  const [height, setHeight] = useState(() => readStoredNumber(HEIGHT_KEY, defaultHeight()));

  const open = useCallback(() => {
    setIsOpen(true);
    writeStored(OPEN_KEY, "true");
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    writeStored(OPEN_KEY, "false");
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      writeStored(OPEN_KEY, String(next));
      return next;
    });
  }, []);

  const setOpacity = useCallback((value: number) => {
    const clamped = Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, value));
    setOpacityState(clamped);
    writeStored(OPACITY_KEY, String(clamped));
  }, []);

  const setSize = useCallback((size: { width?: number; height?: number }) => {
    setWidth((prev) => {
      const next = size.width;
      if (next === undefined) return prev;
      return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(next)));
    });
    setHeight((prev) => {
      const next = size.height;
      if (next === undefined) return prev;
      return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(next)));
    });
  }, []);

  return {
    isOpen,
    open,
    close,
    toggle,
    opacity,
    setOpacity,
    width,
    height,
    setSize,
  };
}

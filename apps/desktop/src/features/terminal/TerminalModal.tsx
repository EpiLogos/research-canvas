import { useCallback, useEffect, useRef, useState } from "react";

import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import { useTerminal } from "./useTerminal";
import type { TerminalManager } from "./useTerminalManager";

interface TerminalModalProps {
  manager: TerminalManager;
}

const RESIZE_HEIGHT_MIN = 120;
const RESIZE_HEIGHT_MAX = 560;
const RESIZE_WIDTH_MIN = 420;
const RESIZE_WIDTH_MAX = 1100;

export function TerminalModal({ manager }: TerminalModalProps) {
  const workspace = useCanvasWorkspace();
  const workdir = workspace.repoRoot ?? undefined;
  const { terminalContainerRef, status, session } = useTerminal(workdir);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [isResizingHeight, setIsResizingHeight] = useState(false);
  const [isResizingWidth, setIsResizingWidth] = useState(false);

  const cwd = session?.workdir ?? workdir ?? "—";
  const activeProcesses = status === "connected" ? 1 : 0;

  const handleOpacityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      manager.setOpacity(Number.parseFloat(e.target.value));
    },
    [manager],
  );

  const startHeightResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = manager.height;
      const onMove = (ev: PointerEvent) => {
        const next = Math.min(
          RESIZE_HEIGHT_MAX,
          Math.max(RESIZE_HEIGHT_MIN, startHeight + startY - ev.clientY),
        );
        manager.setSize({ height: next });
      };
      const onUp = () => {
        setIsResizingHeight(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      setIsResizingHeight(true);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [manager],
  );

  const startWidthResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = manager.width;
      const onMove = (ev: PointerEvent) => {
        const next = Math.min(
          RESIZE_WIDTH_MAX,
          Math.max(RESIZE_WIDTH_MIN, startWidth + (ev.clientX - startX) * 2),
        );
        manager.setSize({ width: next });
      };
      const onUp = () => {
        setIsResizingWidth(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      setIsResizingWidth(true);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [manager],
  );

  useEffect(() => {
    if (!manager.isOpen) return undefined;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        manager.close();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [manager]);

  if (!manager.isOpen) {
    return null;
  }

  const opacityVar = String(manager.opacity);

  return (
    <div
      ref={modalRef}
      className="terminal-modal"
      data-testid="terminal-modal"
      data-resizing-height={isResizingHeight ? "true" : undefined}
      data-resizing-width={isResizingWidth ? "true" : undefined}
      style={{
        ["--terminal-modal-opacity" as string]: opacityVar,
        opacity: manager.opacity,
        width: `${manager.width}px`,
        height: `${manager.height}px`,
      }}
    >
      <div
        className="terminal-modal__resize terminal-modal__resize--height"
        onPointerDown={startHeightResize}
        role="slider"
        aria-label="Resize terminal height"
        title="Resize height"
      />
      <div
        className="terminal-modal__resize terminal-modal__resize--width"
        onPointerDown={startWidthResize}
        role="slider"
        aria-label="Resize terminal width"
        title="Resize width"
      />

      <header className="terminal-modal__header" data-testid="terminal-header">
        <span className="terminal-modal__cwd" title={cwd}>
          {cwd}
        </span>
        <span className="terminal-modal__processes">
          {activeProcesses} process{activeProcesses === 1 ? "" : "es"}
        </span>

        <label className="terminal-modal__opacity" htmlFor="terminal-opacity">
          Opacity
        </label>
        <input
          id="terminal-opacity"
          data-testid="terminal-opacity-slider"
          className="terminal-modal__opacity-slider"
          type="range"
          min={0.5}
          max={1.0}
          step={0.05}
          value={manager.opacity}
          onChange={handleOpacityChange}
        />

        <button
          type="button"
          className="terminal-modal__close"
          aria-label="Close terminal"
          onClick={manager.close}
        >
          ✕
        </button>
      </header>

      <div className="terminal-modal__body">
        <div className="terminal-modal__viewport" ref={terminalContainerRef} />
      </div>
    </div>
  );
}

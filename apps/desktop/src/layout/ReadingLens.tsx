import { useEffect } from "react";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { NodeReaderBody } from "../features/viewer/NodeReaderBody";

export function ReadingLens({
  onFullScreen,
  onExitToCanvas,
  variant = "lens",
}: {
  onFullScreen: () => void;
  onExitToCanvas: () => void;
  variant?: "lens" | "overlay";
}) {
  const workspace = useCanvasWorkspace();
  const node = workspace.nodes.find((n) => n.id === workspace.selectedNodeId) ?? null;

  useEffect(() => {
    if (variant !== "overlay") return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExitToCanvas();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onExitToCanvas, variant]);

  return (
    <section
      className={`ishell-reading ${variant === "overlay" ? "ishell-reading--overlay" : ""}`}
      data-testid={variant === "overlay" ? "reading-overlay" : "reading-pane"}
      role={variant === "overlay" ? "dialog" : undefined}
      aria-modal={variant === "overlay" ? "true" : undefined}
      aria-label={variant === "overlay" ? "Node reading" : undefined}
    >
      {node ? (
        <>
          <div className="ishell-reading__bar">
            <span className="ishell-reading__title">{node.title}</span>
            <button
              type="button"
              className="ishell-reading__canvas"
              aria-label={variant === "overlay" ? "Close reading" : "Back to canvas"}
              onClick={onExitToCanvas}
            >
              {variant === "overlay" ? "Close" : "← Canvas"}
            </button>
            <button
              type="button"
              className="ishell-reading__full"
              aria-label="Read full screen"
              onClick={onFullScreen}
            >
              ⤢
            </button>
          </div>
          <div className="ishell-reading__col">
            <NodeReaderBody node={node} />
          </div>
        </>
      ) : (
        <div className="ishell-reading__empty">Select a node to read</div>
      )}
    </section>
  );
}

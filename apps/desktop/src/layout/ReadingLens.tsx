import { useEffect } from "react";
import type { CanvasNode } from "@research-canvas/schema";
import { resolveKnowledgeCardPresentation } from "@research-canvas/canvas";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { NodeReaderBody } from "../features/viewer/NodeReaderBody";
import { resolveWorkspaceAssetUrl, toAssetUrl } from "../features/canvas/resourceFileHelpers";

export function ReadingLens({
  onFullScreen,
  onExitToCanvas,
  variant = "lens",
  nodeOverride = null,
}: {
  onFullScreen: () => void;
  onExitToCanvas: () => void;
  variant?: "lens" | "overlay";
  nodeOverride?: CanvasNode | null;
}) {
  const workspace = useCanvasWorkspace();
  const node = nodeOverride ?? workspace.nodes.find((n) => n.id === workspace.selectedNodeId) ?? null;
  const presentationNode = node
    ? {
        ...node,
        thumbnail: node.thumbnail
          ? resolveWorkspaceAssetUrl(node.thumbnail, workspace.workingRoot)
          : node.type === "resource" && node.resourceKind === "image" && node.absolutePath
            ? toAssetUrl(node.absolutePath)
            : undefined,
      }
    : null;
  const presentation = presentationNode
    ? resolveKnowledgeCardPresentation(presentationNode, presentationNode.graph)
    : null;

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
            {presentation && (
              <header className="ishell-reading__record" style={{ borderLeftColor: presentation.palette.accent }}>
                {presentation.coverUrl && (
                  <img className="ishell-reading__cover" src={presentation.coverUrl} alt="" />
                )}
                <div>
                  {presentation.pith && <p className="ishell-reading__pith">{presentation.pith}</p>}
                  {presentation.badges.length > 0 && (
                    <ul className="ishell-reading__badges" aria-label="Knowledge metadata">
                      {presentation.badges.map((badge) => <li key={badge}>{badge}</li>)}
                    </ul>
                  )}
                </div>
              </header>
            )}
            <NodeReaderBody node={node} />
          </div>
        </>
      ) : (
        <div className="ishell-reading__empty">Select a node to read</div>
      )}
    </section>
  );
}

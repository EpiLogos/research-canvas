import { useEffect } from "react";
import type { CanvasNode } from "@research-canvas/schema";
import { resolveKnowledgeCardPresentation } from "@research-canvas/canvas";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { NodeReaderBody } from "../features/viewer/NodeReaderBody";
import {
  readerRecordFromCanvasNode,
  type ReaderRecord,
} from "../features/viewer/readerRecord";
import { resolveReaderMediaReference } from "../features/viewer/readerMedia";

export function ReadingLens({
  onFullScreen,
  onExitToCanvas,
  variant = "lens",
  nodeOverride = null,
  recordOverride = null,
}: {
  onFullScreen: () => void;
  onExitToCanvas: () => void;
  variant?: "lens" | "overlay";
  nodeOverride?: CanvasNode | null;
  recordOverride?: ReaderRecord | null;
}) {
  const workspace = useCanvasWorkspace();
  const selectedNode = nodeOverride ?? workspace.nodes.find((n) => n.id === workspace.selectedNodeId) ?? null;
  const record = recordOverride ?? (selectedNode ? readerRecordFromCanvasNode(selectedNode) : null);
  const coverMedia = record?.coverReference
    ? resolveReaderMediaReference(record.coverReference, workspace.workingRoot)
    : null;
  const coverUrl = coverMedia?.status === "resolved" ? coverMedia.displayUrl : null;
  const presentation = record
    ? resolveKnowledgeCardPresentation({
        title: record.title,
        summary: record.pith,
        dotColour: record.canvasNode?.dotColour,
        bgColour: record.canvasNode?.bgColour,
        textColour: record.canvasNode?.textColour,
        thumbnail: coverUrl ?? undefined,
      }, record.graphNode)
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
      {record ? (
        <>
          <div className="ishell-reading__bar">
            <span className="ishell-reading__title">{record.title}</span>
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
                {coverMedia?.status === "unresolved" ? (
                  <div className="ishell-reading__media-unresolved" data-testid="reader-media-unresolved">
                    Image source needs re-attaching
                  </div>
                ) : presentation.coverUrl ? (
                  <img className="ishell-reading__cover" data-testid="reader-cover" src={presentation.coverUrl} alt="" />
                ) : null}
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
            <NodeReaderBody node={record.canvasNode} record={record} />
          </div>
        </>
      ) : (
        <div className="ishell-reading__empty">Select a node to read</div>
      )}
    </section>
  );
}

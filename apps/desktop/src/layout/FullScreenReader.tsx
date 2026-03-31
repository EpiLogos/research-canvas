import { useEffect } from "react";
import type { CanvasNode } from "@research-canvas/schema";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";

interface FullScreenReaderProps {
  onClose: () => void;
}

/** Extends CanvasNode with fields that the backend may attach at runtime (e.g. rendered markdown). */
interface RichCanvasNode extends CanvasNode {
  renderedHtml?: string;
}

export function FullScreenReader({ onClose }: FullScreenReaderProps) {
  const workspace = useCanvasWorkspace();
  const node: RichCanvasNode | null =
    (workspace.nodes.find((n) => n.id === workspace.selectedNodeId) as RichCanvasNode) ?? null;

  useEffect(() => {
    if (!node) onClose();
  }, [node, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!node) {
    return null;
  }

  const kind = node.type === "resource" ? node.resourceKind : node.type;

  return (
    <div className="fullscreen-reader">
      <header className="fullscreen-reader__header">
        <nav className="fullscreen-reader__breadcrumb">
          <span>{workspace.activeProject?.name ?? "Project"}</span>
          <span className="fsr-sep">›</span>
          <span>Canvas</span>
          <span className="fsr-sep">›</span>
          <span className="fsr-current">{node.title}</span>
        </nav>
        <button className="fullscreen-reader__close" onClick={onClose} title="Back to canvas (Esc)">
          ← Back
        </button>
      </header>

      <main className="fullscreen-reader__body">
        {kind === "markdown" && node.renderedHtml ? (
          <article
            className="fsr-markdown"
            dangerouslySetInnerHTML={{ __html: node.renderedHtml }}
          />
        ) : kind === "image" && node.type === "resource" && node.absolutePath ? (
          <div className="fsr-image-wrap">
            <img
              className="fsr-image"
              src={`asset://localhost/${node.absolutePath}`}
              alt={node.title}
            />
          </div>
        ) : node.type === "note" ? (
          // TODO: wire updateNodeContent to workspace
          <textarea
            className="fsr-note-editor"
            defaultValue={node.content ?? ""}
            placeholder="Write a note…"
            readOnly
          />
        ) : (
          <div className="fsr-placeholder">
            {node.type === "resource" ? node.absolutePath : "No content"}
          </div>
        )}
      </main>
    </div>
  );
}

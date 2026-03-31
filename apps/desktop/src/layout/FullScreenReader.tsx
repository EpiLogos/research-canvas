import { useEffect } from "react";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";

interface FullScreenReaderProps {
  onClose: () => void;
}

export function FullScreenReader({ onClose }: FullScreenReaderProps) {
  const workspace = useCanvasWorkspace();
  const node = workspace.nodes.find((n) => n.id === workspace.selectedNodeId) ?? null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!node) {
    onClose();
    return null;
  }

  const kind = (node as { resourceKind?: string }).resourceKind ?? "text";

  return (
    <div className="fullscreen-reader">
      <header className="fullscreen-reader__header">
        <nav className="fullscreen-reader__breadcrumb">
          <span>{workspace.activeProject?.name ?? "Project"}</span>
          <span className="fsr-sep">›</span>
          <span>Canvas</span>
          <span className="fsr-sep">›</span>
          <span className="fsr-current">{(node as { title?: string }).title ?? node.id}</span>
        </nav>
        <button className="fullscreen-reader__close" onClick={onClose} title="Back to canvas (Esc)">
          ← Back
        </button>
      </header>

      <main className="fullscreen-reader__body">
        {kind === "markdown" && (node as { renderedHtml?: string }).renderedHtml ? (
          <article
            className="fsr-markdown"
            dangerouslySetInnerHTML={{ __html: (node as { renderedHtml: string }).renderedHtml }}
          />
        ) : kind === "image" && (node as { absolutePath?: string }).absolutePath ? (
          <div className="fsr-image-wrap">
            <img
              className="fsr-image"
              src={`asset://localhost/${(node as { absolutePath: string }).absolutePath}`}
              alt={(node as { title?: string }).title ?? node.id}
            />
          </div>
        ) : (node as { type?: string }).type === "note" ? (
          <textarea
            className="fsr-note-editor"
            defaultValue={(node as { content?: string }).content ?? ""}
            placeholder="Write a note…"
            onBlur={(e) =>
              (workspace as { updateNodeContent?: (id: string, value: string) => void }).updateNodeContent?.(node.id, e.target.value)
            }
          />
        ) : (
          <div className="fsr-placeholder">
            {(node as { absolutePath?: string }).absolutePath ?? "No content"}
          </div>
        )}
      </main>
    </div>
  );
}

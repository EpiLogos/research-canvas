import { useEffect, useState } from "react";
import type { CanvasNode } from "@research-canvas/schema";
import { readWorkspaceTextFile } from "@research-canvas/desktop-api";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { NodeContentPane } from "../features/viewer/NodeContentPane";

interface FullScreenReaderProps {
  onClose: () => void;
}

export function FullScreenReader({ onClose }: FullScreenReaderProps) {
  const workspace = useCanvasWorkspace();
  const node: CanvasNode | null =
    workspace.nodes.find((n) => n.id === workspace.selectedNodeId) ?? null;
  const textResourceNode =
    node?.type === "resource" &&
    node.absolutePath &&
    (node.resourceKind === "markdown" || node.resourceKind === "text")
      ? node
      : null;
  const [textContent, setTextContent] = useState<string | null>(null);

  useEffect(() => {
    setTextContent(null);
    if (!textResourceNode) return;
    readWorkspaceTextFile(textResourceNode.absolutePath)
      .then(setTextContent)
      .catch(() => setTextContent(null));
  }, [textResourceNode]);

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

  return (
    <div className="fullscreen-reader">
      <header className="fullscreen-reader__header">
        <nav className="fullscreen-reader__breadcrumb">
          <span>{workspace.activeProject?.displayName ?? "Project"}</span>
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
        <NodeContentPane
          node={node}
          textContent={textContent}
          onFullScreen={onClose}
          onNoteContentChange={(content) => workspace.updateNodeContent(node.id, content)}
          showToolbar={false}
        />
      </main>
    </div>
  );
}

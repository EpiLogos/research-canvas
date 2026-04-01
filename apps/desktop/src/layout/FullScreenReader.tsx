import { useEffect, useState } from "react";
import type { CanvasNode } from "@research-canvas/schema";
import {
  ImageViewer,
  MarkdownViewer,
  NoteViewer,
  PdfViewer,
  FileMetaViewer,
} from "@research-canvas/viewers";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";

interface FullScreenReaderProps {
  onClose: () => void;
}

export function FullScreenReader({ onClose }: FullScreenReaderProps) {
  const workspace = useCanvasWorkspace();
  const node: CanvasNode | null =
    workspace.nodes.find((n) => n.id === workspace.selectedNodeId) ?? null;
  const [textContent, setTextContent] = useState<string | null>(null);

  useEffect(() => {
    setTextContent(null);
    if (!node) return;
    if (node.type === "resource" && node.absolutePath && (node.resourceKind === "markdown" || node.resourceKind === "text")) {
      fetch(`asset://localhost/${node.absolutePath}`)
        .then((r) => r.text())
        .then(setTextContent)
        .catch(() => setTextContent(null));
    }
  }, [node?.id, node?.type, node?.absolutePath, node?.resourceKind]);

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
        {node.type === "note" ? (
          <NoteViewer
            title={node.title}
            content={node.content ?? ""}
            tags={node.tags}
          />
        ) : node.type === "resource" && node.resourceKind === "image" && node.absolutePath ? (
          <ImageViewer
            source={`asset://localhost/${node.absolutePath}`}
            title={node.title}
          />
        ) : node.type === "resource" && node.resourceKind === "pdf" && node.absolutePath ? (
          <PdfViewer
            source={`asset://localhost/${node.absolutePath}`}
            title={node.title}
          />
        ) : node.type === "resource" && (node.resourceKind === "markdown" || node.resourceKind === "text") && textContent !== null ? (
          <MarkdownViewer content={textContent} />
        ) : node.type === "resource" ? (
          <FileMetaViewer
            title={node.title}
            absolutePath={node.absolutePath ?? ""}
            relativePath={node.relativePath ?? ""}
            mimeType={node.mimeType ?? ""}
            resourceKind={node.resourceKind ?? "binary"}
            fileFingerprint={node.fileFingerprint ?? ""}
          />
        ) : (
          <div className="fsr-placeholder">No content</div>
        )}
      </main>
    </div>
  );
}

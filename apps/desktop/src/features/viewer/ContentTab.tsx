import { useEffect, useState } from "react";
import {
  ImageViewer,
  MarkdownViewer,
  NoteViewer,
  PdfViewer,
  FileMetaViewer,
} from "@research-canvas/viewers";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";

interface ContentTabProps {
  onFullScreen: () => void;
}

export function ContentTab({ onFullScreen }: ContentTabProps) {
  const workspace = useCanvasWorkspace();
  const node = workspace.nodes.find((n) => n.id === workspace.selectedNodeId) ?? null;
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

  if (!node) {
    return <div className="content-tab-empty">No node selected</div>;
  }

  return (
    <div className="content-tab">
      <div className="content-tab__toolbar">
        <span className="content-tab__title">{node.title}</span>
        <button
          className="content-tab__fullscreen-btn"
          onClick={onFullScreen}
          title="Full screen"
        >
          ⤢
        </button>
      </div>
      <div className="content-tab__body">
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
        ) : node.type === "resource" && node.resourceKind === "markdown" && textContent !== null ? (
          <MarkdownViewer content={textContent} />
        ) : node.type === "resource" && node.resourceKind === "text" && textContent !== null ? (
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
          <div className="content-tab__placeholder">No content</div>
        )}
      </div>
    </div>
  );
}

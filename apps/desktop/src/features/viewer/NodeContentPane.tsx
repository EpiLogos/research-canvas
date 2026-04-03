import {
  FileMetaViewer,
  ImageViewer,
  MarkdownViewer,
  PdfViewer,
} from "@research-canvas/viewers";
import type { CanvasNode } from "@research-canvas/schema";

import { toAssetUrl } from "../canvas/resourceFileHelpers";

interface NodeContentPaneProps {
  node: CanvasNode;
  textContent: string | null;
  onFullScreen: () => void;
  onNoteContentChange?: (content: string) => void;
  showToolbar?: boolean;
}

export function NodeContentPane({
  node,
  textContent,
  onFullScreen,
  onNoteContentChange,
  showToolbar = true,
}: NodeContentPaneProps) {
  return (
    <div className="content-tab">
      {showToolbar ? (
        <div className="content-tab__toolbar">
          <span className="content-tab__title">{node.title}</span>
          <button
            className="content-tab__fullscreen-btn"
            onClick={onFullScreen}
            title="Full screen"
            type="button"
          >
            ⤢
          </button>
        </div>
      ) : null}
      <div className="content-tab__body">
        {renderNodeBody(node, textContent, onNoteContentChange)}
      </div>
    </div>
  );
}

function renderNodeBody(
  node: CanvasNode,
  textContent: string | null,
  onNoteContentChange?: (content: string) => void,
) {
  if (node.type === "note") {
    return (
      <textarea
        aria-label="Note content"
        className="content-tab__note-editor"
        onChange={(event) => onNoteContentChange?.(event.target.value)}
        value={node.content ?? ""}
      />
    );
  }

  if (node.type === "resource" && node.resourceKind === "image" && node.absolutePath) {
    return (
      <ImageViewer
        source={toAssetUrl(node.absolutePath)}
        title={node.title}
      />
    );
  }

  if (node.type === "resource" && node.resourceKind === "pdf" && node.absolutePath) {
    return (
      <PdfViewer
        source={toAssetUrl(node.absolutePath)}
        title={node.title}
      />
    );
  }

  if (node.type === "resource" && node.resourceKind === "markdown" && textContent !== null) {
    return <MarkdownViewer content={textContent} />;
  }

  if (node.type === "resource" && node.resourceKind === "text" && textContent !== null) {
    return (
      <pre className="content-tab__text-viewer">{textContent}</pre>
    );
  }

  if (node.type === "resource") {
    return (
      <FileMetaViewer
        title={node.title}
        absolutePath={node.absolutePath ?? ""}
        relativePath={node.relativePath ?? ""}
        mimeType={node.mimeType ?? ""}
        resourceKind={node.resourceKind ?? "binary"}
        fileFingerprint={node.fileFingerprint ?? ""}
      />
    );
  }

  return <div className="content-tab__placeholder">No content</div>;
}

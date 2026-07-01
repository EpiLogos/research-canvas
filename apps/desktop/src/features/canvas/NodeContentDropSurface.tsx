import { useCallback, useState, type DragEvent, type ClipboardEvent, type ReactNode } from "react";

import {
  classifyDropItems,
  classifyPasteItems,
  type ContentLinkingActions,
  type IngestResult,
} from "@research-canvas/canvas";

import { useCanvasWorkspace } from "./CanvasWorkspaceContext";

interface NodeContentDropSurfaceProps {
  graphNodeId: string;
  children: ReactNode;
}

function toFileShapes(list: FileList | null): { name: string; type: string; file: File }[] {
  if (!list) {
    return [];
  }
  return Array.from(list).map((file) => ({ name: file.name, type: file.type, file }));
}

async function ingest(
  graphNodeId: string,
  items: IngestResult[],
  actions: ContentLinkingActions,
) {
  for (const item of items) {
    if (item.kind === "text") {
      await actions.addTextToNode(graphNodeId, item.text);
    } else if (item.kind === "markdown") {
      await actions.linkMarkdownFileToNode({ graphNodeId, fileName: item.fileName, markdown: item.text });
    } else {
      // image: item.file is a File; in Tauri the File object carries a .path property
      const path = (item.file as File & { path?: string }).path;
      if (path) {
        await actions.addImageToNode(graphNodeId, path);
      }
    }
  }
}

export function NodeContentDropSurface({ graphNodeId, children }: NodeContentDropSurfaceProps) {
  const workspace = useCanvasWorkspace();
  const [active, setActive] = useState(false);

  const onDrop = useCallback(
    async (event: DragEvent) => {
      event.preventDefault();
      setActive(false);
      const items = classifyDropItems({
        files: toFileShapes(event.dataTransfer.files),
        text: event.dataTransfer.getData("text/plain"),
      });
      await ingest(graphNodeId, items, workspace.contentLinkingActions);
    },
    [graphNodeId, workspace.contentLinkingActions],
  );

  const onPaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = classifyPasteItems({
        files: toFileShapes(event.clipboardData.files),
        text: event.clipboardData.getData("text/plain"),
      });
      if (items.length > 0) {
        event.preventDefault();
        await ingest(graphNodeId, items, workspace.contentLinkingActions);
      }
    },
    [graphNodeId, workspace.contentLinkingActions],
  );

  return (
    <div
      className="node-content-drop-surface"
      data-active={active ? "true" : "false"}
      onDragOver={(event) => {
        event.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(event) => void onDrop(event)}
      onPaste={(event) => void onPaste(event)}
    >
      {children}
    </div>
  );
}

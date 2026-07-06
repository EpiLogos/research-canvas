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

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return fallback;
}

// Tauri v2's File objects dropped/pasted from the OS do NOT carry a `.path`
// property (that was a Tauri v1 convenience the webview no longer exposes),
// so an image ingest item can never be imported this way. Previously this
// silently no-op'd (the image just vanished). We now surface that explicitly
// instead of guessing at a workaround, and point the user at the native
// picker buttons ("Insert image" / "Attach file") which DO get a real
// absolute path via the dialog plugin.
const NO_PATH_MESSAGE =
  "Can't read a file path from a dropped/pasted file in this app. Use the \"Insert image\" or \"Attach file\" button instead.";

async function ingest(
  graphNodeId: string,
  items: IngestResult[],
  actions: ContentLinkingActions,
): Promise<{ ok: boolean; message?: string }> {
  for (const item of items) {
    if (item.kind === "text") {
      await actions.addTextToNode(graphNodeId, item.text);
    } else if (item.kind === "markdown") {
      await actions.linkMarkdownFileToNode({ graphNodeId, fileName: item.fileName, markdown: item.text });
    } else {
      // image: item.file is a File; in Tauri v1 the File object carried a
      // .path property. In Tauri v2 it does not — see NO_PATH_MESSAGE above.
      const path = (item.file as File & { path?: string }).path;
      if (!path) {
        return { ok: false, message: NO_PATH_MESSAGE };
      }
      await actions.addImageToNode(graphNodeId, path);
    }
  }
  return { ok: true };
}

export function NodeContentDropSurface({ graphNodeId, children }: NodeContentDropSurfaceProps) {
  const workspace = useCanvasWorkspace();
  const [active, setActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runIngest = useCallback(
    async (items: IngestResult[]) => {
      setErrorMessage(null);
      try {
        const result = await ingest(graphNodeId, items, workspace.contentLinkingActions);
        if (!result.ok) {
          setErrorMessage(result.message ?? "Failed to add the dropped/pasted content.");
        }
      } catch (error) {
        setErrorMessage(toErrorMessage(error, "Failed to add the dropped/pasted content."));
      }
    },
    [graphNodeId, workspace.contentLinkingActions],
  );

  const onDrop = useCallback(
    async (event: DragEvent) => {
      event.preventDefault();
      setActive(false);
      const items = classifyDropItems({
        files: toFileShapes(event.dataTransfer.files),
        text: event.dataTransfer.getData("text/plain"),
      });
      await runIngest(items);
    },
    [runIngest],
  );

  const onPaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = classifyPasteItems({
        files: toFileShapes(event.clipboardData.files),
        text: event.clipboardData.getData("text/plain"),
      });
      if (items.length > 0) {
        event.preventDefault();
        await runIngest(items);
      }
    },
    [runIngest],
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
      {errorMessage ? (
        <p className="node-content-drop-surface__error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

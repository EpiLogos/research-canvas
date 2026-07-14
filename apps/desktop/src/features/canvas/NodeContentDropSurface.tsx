import { useCallback, useEffect, useState, type DragEvent, type ClipboardEvent, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import {
  classifyDropItems,
  classifyPasteItems,
  type ContentLinkingActions,
  type IngestResult,
} from "@research-canvas/canvas";

import { useCanvasWorkspace } from "./CanvasWorkspaceContext";
import { attachNodeMedia } from "../viewer/nodeAttachmentActions";
import type { GraphNode } from "@research-canvas/desktop-api";

interface NodeContentDropSurfaceProps {
  graphNodeId: string;
  children: ReactNode;
  /** Lets a live reader replace its open record after a durable drop. */
  onGraphNodeUpdated?: (graphNode: GraphNode) => void;
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

// Browser File objects do not reveal a source path. In a native Tauri window
// OS drags are handled below through `onDragDropEvent`, whose drop payload
// carries real absolute paths. Clipboard files remain browser-shaped and need
// a picker if the platform does not expose a path.
const NO_PATH_MESSAGE =
  "Can't read a source path from this pasted file. Use the \"Insert image\" or \"Attach file\" button instead.";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined"
    && Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__);
}

function nativeFileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? "attachment";
}

function isImagePath(path: string): boolean {
  return /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(path);
}

async function ingest(
  graphNodeId: string,
  items: IngestResult[],
  actions: ContentLinkingActions,
  addImageToNode: (graphNodeId: string, sourceAbsolutePath: string) => Promise<unknown> =
    actions.addImageToNode,
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
      await addImageToNode(graphNodeId, path);
    }
  }
  return { ok: true };
}

export function NodeContentDropSurface({
  graphNodeId,
  children,
  onGraphNodeUpdated,
}: NodeContentDropSurfaceProps) {
  const workspace = useCanvasWorkspace();
  const [active, setActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runIngest = useCallback(
    async (items: IngestResult[]) => {
      setErrorMessage(null);
      try {
        const result = await ingest(
          graphNodeId,
          items,
          workspace.contentLinkingActions,
          async (nodeId, sourceAbsolutePath) => {
            // Tests and static/read-only contexts intentionally omit the
            // native transport. Production desktop drops always use the same
            // durable attachment operation as reader and inspector media.
            if (!workspace.transport || !workspace.databasePath || !workspace.workingRoot) {
              return workspace.contentLinkingActions.addImageToNode(nodeId, sourceAbsolutePath);
            }
            const attached = await attachNodeMedia({
              transport: workspace.transport,
              databasePath: workspace.databasePath,
              workspaceRoot: workspace.workingRoot,
              graphNodeId: nodeId,
              sourceAbsolutePath,
              kind: "image",
              role: "inline",
            });
            onGraphNodeUpdated?.(attached.graphNode);
            return attached.graphNode;
          },
        );
        if (!result.ok) {
          setErrorMessage(result.message ?? "Failed to add the dropped/pasted content.");
        }
      } catch (error) {
        setErrorMessage(toErrorMessage(error, "Failed to add the dropped/pasted content."));
      }
    },
    [
      graphNodeId,
      workspace.contentLinkingActions,
      workspace.databasePath,
      workspace.transport,
      workspace.workingRoot,
    ],
  );

  const runNativePaths = useCallback(
    async (paths: string[]) => {
      setErrorMessage(null);
      try {
        for (const sourceAbsolutePath of paths) {
          if (!sourceAbsolutePath) continue;
          const kind = isImagePath(sourceAbsolutePath) ? "image" : "file";
          if (workspace.transport && workspace.databasePath && workspace.workingRoot) {
            const attached = await attachNodeMedia({
              transport: workspace.transport,
              databasePath: workspace.databasePath,
              workspaceRoot: workspace.workingRoot,
              graphNodeId,
              sourceAbsolutePath,
              kind,
              role: kind === "image" ? "inline" : "file",
            });
            onGraphNodeUpdated?.(attached.graphNode);
          } else if (kind === "image") {
            await workspace.contentLinkingActions.addImageToNode(graphNodeId, sourceAbsolutePath);
          } else {
            await workspace.contentLinkingActions.attachFileToNode(
              graphNodeId,
              sourceAbsolutePath,
              nativeFileName(sourceAbsolutePath),
            );
          }
        }
      } catch (error) {
        setErrorMessage(toErrorMessage(error, "Failed to add the dropped files."));
      }
    },
    [
      graphNodeId,
      workspace.contentLinkingActions,
      workspace.databasePath,
      workspace.transport,
      workspace.workingRoot,
    ],
  );

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setActive(true);
        } else if (payload.type === "leave") {
          setActive(false);
        } else if (payload.type === "drop") {
          setActive(false);
          void runNativePaths(payload.paths);
        }
      })
      .then((nextUnlisten) => {
        if (disposed) nextUnlisten();
        else unlisten = nextUnlisten;
      })
      .catch((error) => {
        setErrorMessage(toErrorMessage(error, "Native file dropping is unavailable."));
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [runNativePaths]);

  const onDrop = useCallback(
    async (event: DragEvent) => {
      event.preventDefault();
      setActive(false);
      // Tauri v2 delivers the authoritative path-bearing event on the native
      // window listener above. Do not let its pathless DOM File shadow it.
      if (isTauriRuntime()) return;
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

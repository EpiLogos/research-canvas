import { open } from "@tauri-apps/plugin-dialog";

import type { ContentLinkingActions } from "@research-canvas/canvas";

export type MediaPickerActions = Pick<ContentLinkingActions, "addImageToNode" | "attachFileToNode">;

export interface PickResult {
  ok: boolean;
  message?: string;
}

function fileNameFromAbsolutePath(absolutePath: string): string {
  const segments = absolutePath.split(/[\\/]/);
  return segments[segments.length - 1] || absolutePath;
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

/**
 * Opens a native image-filtered file picker and, if the user selects a file,
 * runs the caller's durable local-first attachment action. Never throws:
 * every failure (dialog or attachment operation) is captured and returned so the caller can
 * surface it instead of silently dropping the action.
 */
export async function pickAndInsertImage(
  graphNodeId: string,
  actions: MediaPickerActions,
): Promise<PickResult> {
  let selected: string | string[] | null;
  try {
    selected = await open({
      multiple: false,
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] },
      ],
    });
  } catch (error) {
    return { ok: false, message: toErrorMessage(error, "Failed to open the image picker.") };
  }

  const path = Array.isArray(selected) ? selected[0] : selected;
  if (!path) {
    // User cancelled — not a failure.
    return { ok: true };
  }

  try {
    await actions.addImageToNode(graphNodeId, path);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: toErrorMessage(error, "Failed to insert the image.") };
  }
}

/**
 * Opens a native (unfiltered) file picker and, if the user selects a file,
 * runs the same caller-supplied durable attachment path as image insertion,
 * with an explicit file role.
 * Never throws: every failure is captured and returned.
 */
export async function pickAndAttachFile(
  graphNodeId: string,
  actions: MediaPickerActions,
): Promise<PickResult> {
  let selected: string | string[] | null;
  try {
    selected = await open({ multiple: false });
  } catch (error) {
    return { ok: false, message: toErrorMessage(error, "Failed to open the file picker.") };
  }

  const path = Array.isArray(selected) ? selected[0] : selected;
  if (!path) {
    // User cancelled — not a failure.
    return { ok: true };
  }

  try {
    await actions.attachFileToNode(graphNodeId, path, fileNameFromAbsolutePath(path));
    return { ok: true };
  } catch (error) {
    return { ok: false, message: toErrorMessage(error, "Failed to attach the file.") };
  }
}

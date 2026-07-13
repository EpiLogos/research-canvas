import { resolveWorkspaceAssetUrl } from "../canvas/resourceFileHelpers";

export type ReaderMediaResolution =
  | {
      status: "resolved";
      reference: string;
      displayUrl: string;
    }
  | {
      status: "unresolved";
      reference: string;
      reason: "ephemeral_blob" | "missing_workspace" | "unsupported_scheme";
    };

/**
 * Converts a persisted media reference into a renderable URL at the outermost
 * reader boundary. The persisted value is deliberately left untouched so an
 * exported or moved workspace retains portable `assets/...` references.
 */
export function resolveReaderMediaReference(
  reference: string,
  workspaceRoot: string | null | undefined,
): ReaderMediaResolution {
  const normalized = reference.trim();
  if (normalized.startsWith("blob:")) {
    return { status: "unresolved", reference, reason: "ephemeral_blob" };
  }
  if (/^https:\/\//i.test(normalized) || /^http:\/\/asset\.localhost\//i.test(normalized)) {
    return { status: "resolved", reference, displayUrl: normalized };
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(normalized) && !/^asset:/i.test(normalized)) {
    return { status: "unresolved", reference, reason: "unsupported_scheme" };
  }
  if (normalized.startsWith("assets/") && !workspaceRoot) {
    return { status: "unresolved", reference, reason: "missing_workspace" };
  }
  return {
    status: "resolved",
    reference,
    displayUrl: resolveWorkspaceAssetUrl(normalized, workspaceRoot),
  };
}

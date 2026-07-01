/** The literal empty-doc sentinel (BlockNote's empty block array). WS0 §7. */
export const EMPTY_BLOCKNOTE_DOC = "[]";

/** Frontend treats "" and "[]" (and whitespace-only) as an empty body. WS0 §7. */
export function isEmptyBlockNoteBody(body: string): boolean {
  const trimmed = body.trim();
  return trimmed === "" || trimmed === "[]";
}

/**
 * Coerce any stored body to a safe BlockNote block-array JSON string.
 * Empty, whitespace, unparseable, or non-array input collapses to "[]".
 * Valid block-array JSON is returned trimmed and verbatim (never rewritten).
 */
export function normaliseBlockNoteBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed === "" || trimmed === "[]") {
    return EMPTY_BLOCKNOTE_DOC;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return trimmed;
    }
    return EMPTY_BLOCKNOTE_DOC;
  } catch {
    return EMPTY_BLOCKNOTE_DOC;
  }
}

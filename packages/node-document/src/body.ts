/** The literal empty-doc sentinel (BlockNote's empty block array). WS0 §7. */
export const EMPTY_BLOCKNOTE_DOC = "[]";

/** Frontend treats "" and "[]" (and whitespace-only) as an empty body. WS0 §7. */
export function isEmptyBlockNoteBody(body: string): boolean {
  const trimmed = body.trim();
  return trimmed === "" || trimmed === "[]";
}

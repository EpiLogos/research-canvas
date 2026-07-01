import { describe, expect, it } from "vitest";

import { EMPTY_BLOCKNOTE_DOC, isEmptyBlockNoteBody } from "./body";

describe("EMPTY_BLOCKNOTE_DOC", () => {
  it("is the empty block array sentinel", () => {
    expect(EMPTY_BLOCKNOTE_DOC).toBe("[]");
  });
});

describe("isEmptyBlockNoteBody", () => {
  it("treats empty string as empty", () => {
    expect(isEmptyBlockNoteBody("")).toBe(true);
  });

  it("treats the empty block array string as empty", () => {
    expect(isEmptyBlockNoteBody("[]")).toBe(true);
  });

  it("treats a whitespace-only string as empty", () => {
    expect(isEmptyBlockNoteBody("  \n ")).toBe(true);
  });

  it("treats a populated block array as non-empty", () => {
    expect(isEmptyBlockNoteBody('[{"type":"paragraph"}]')).toBe(false);
  });
});

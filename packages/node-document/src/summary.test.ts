import { describe, expect, it } from "vitest";

import { blockNoteSummary } from "./summary";

const TWO_PARAGRAPHS = JSON.stringify([
  {
    type: "paragraph",
    content: [
      { type: "text", text: "The monopoly mechanism " },
      { type: "text", text: "recurs across eras." },
    ],
  },
  {
    type: "paragraph",
    content: [{ type: "text", text: "A second paragraph." }],
  },
]);

describe("blockNoteSummary", () => {
  it("returns empty string for an empty body", () => {
    expect(blockNoteSummary("[]")).toBe("");
  });

  it("returns empty string for unparseable input", () => {
    expect(blockNoteSummary("{not json")).toBe("");
  });

  it("joins block text with single spaces", () => {
    expect(blockNoteSummary(TWO_PARAGRAPHS)).toBe(
      "The monopoly mechanism recurs across eras. A second paragraph."
    );
  });

  it("truncates to maxChars and appends an ellipsis", () => {
    expect(blockNoteSummary(TWO_PARAGRAPHS, 20)).toBe("The monopoly mechani…");
  });
});

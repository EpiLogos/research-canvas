import { describe, expect, it } from "vitest";

import { blockNoteJsonToMarkdown } from "./renderMarkdown";

describe("blockNoteJsonToMarkdown", () => {
  it("returns empty string for the empty-body sentinels", () => {
    expect(blockNoteJsonToMarkdown("")).toBe("");
    expect(blockNoteJsonToMarkdown("[]")).toBe("");
  });

  it("renders a paragraph with inline styles", () => {
    const json = JSON.stringify([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Plain " },
          { type: "text", text: "bold", styles: { bold: true } },
          { type: "text", text: " and " },
          { type: "text", text: "code", styles: { code: true } },
        ],
      },
    ]);
    expect(blockNoteJsonToMarkdown(json)).toBe("Plain **bold** and `code`");
  });

  it("renders headings at the right level", () => {
    const json = JSON.stringify([
      { type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Title" }] },
    ]);
    expect(blockNoteJsonToMarkdown(json)).toBe("## Title");
  });

  it("renders bullet and numbered lists and a quote and a code block", () => {
    const json = JSON.stringify([
      { type: "bulletListItem", content: [{ type: "text", text: "one" }] },
      { type: "bulletListItem", content: [{ type: "text", text: "two" }] },
      { type: "numberedListItem", content: [{ type: "text", text: "first" }] },
      { type: "quote", content: [{ type: "text", text: "said" }] },
      { type: "codeBlock", content: [{ type: "text", text: "x = 1" }] },
    ]);
    expect(blockNoteJsonToMarkdown(json)).toBe(
      "- one\n- two\n1. first\n> said\n```\nx = 1\n```",
    );
  });

  it("renders an image block to markdown image syntax", () => {
    const json = JSON.stringify([
      { type: "image", props: { url: "assets/n1/cat.png", caption: "A cat" } },
    ]);
    expect(blockNoteJsonToMarkdown(json)).toBe("![A cat](assets/n1/cat.png)");
  });
});

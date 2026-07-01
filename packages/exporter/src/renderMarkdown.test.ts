import { describe, expect, it } from "vitest";

import { blockNoteJsonToMarkdown, markdownToBlockNoteJson } from "./renderMarkdown";

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

describe("markdownToBlockNoteJson", () => {
  it("returns the empty-body sentinel for blank input", () => {
    expect(markdownToBlockNoteJson("")).toBe("[]");
    expect(markdownToBlockNoteJson("   \n  ")).toBe("[]");
  });

  it("parses a heading into a heading block with level", () => {
    const blocks = JSON.parse(markdownToBlockNoteJson("## Title"));
    expect(blocks).toEqual([
      { type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Title" }] },
    ]);
  });

  it("parses inline bold, italic, and code", () => {
    const blocks = JSON.parse(markdownToBlockNoteJson("a **b** *c* `d`"));
    expect(blocks[0].content).toEqual([
      { type: "text", text: "a " },
      { type: "text", text: "b", styles: { bold: true } },
      { type: "text", text: " " },
      { type: "text", text: "c", styles: { italic: true } },
      { type: "text", text: " " },
      { type: "text", text: "d", styles: { code: true } },
    ]);
  });

  it("parses bullets, numbers, quote, fenced code, and a standalone image", () => {
    const md = "- one\n- two\n1. first\n> said\n```\nx = 1\n```\n![A cat](assets/n1/cat.png)";
    const blocks = JSON.parse(markdownToBlockNoteJson(md));
    expect(blocks).toEqual([
      { type: "bulletListItem", content: [{ type: "text", text: "one" }] },
      { type: "bulletListItem", content: [{ type: "text", text: "two" }] },
      { type: "numberedListItem", content: [{ type: "text", text: "first" }] },
      { type: "quote", content: [{ type: "text", text: "said" }] },
      { type: "codeBlock", content: [{ type: "text", text: "x = 1" }] },
      { type: "image", props: { url: "assets/n1/cat.png", caption: "A cat" } },
    ]);
  });
});

describe("body ↔ markdown round-trip", () => {
  const markdown =
    "# Heading\nA paragraph with **bold** and `code`.\n- one\n- two\n> a quote\n```\ncode block\n```\n![cap](assets/n/i.png)";

  it("markdown → json → markdown is stable", () => {
    const json = markdownToBlockNoteJson(markdown);
    expect(blockNoteJsonToMarkdown(json)).toBe(markdown);
  });

  it("json → markdown → json is stable for a known body", () => {
    const json = JSON.stringify([
      { type: "heading", props: { level: 1 }, content: [{ type: "text", text: "H" }] },
      { type: "paragraph", content: [{ type: "text", text: "p" }] },
    ]);
    const roundTripped = markdownToBlockNoteJson(blockNoteJsonToMarkdown(json));
    expect(JSON.parse(roundTripped)).toEqual(JSON.parse(json));
  });
});

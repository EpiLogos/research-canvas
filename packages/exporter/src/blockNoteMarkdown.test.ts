import { describe, expect, it } from "vitest";

import { blockNoteJsonToMarkdown } from "./renderMarkdown";

describe("blockNoteJsonToMarkdown", () => {
  it("returns empty string for an empty body", () => {
    expect(blockNoteJsonToMarkdown("[]")).toBe("");
  });

  it("returns empty string for unparseable input", () => {
    expect(blockNoteJsonToMarkdown("{not json")).toBe("");
  });

  it("renders a heading by level", () => {
    const body = JSON.stringify([
      { type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Origins" }] },
    ]);
    expect(blockNoteJsonToMarkdown(body)).toBe("## Origins");
  });

  it("renders a paragraph with bold and italic inline styles", () => {
    const body = JSON.stringify([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "The ", styles: {} },
          { type: "text", text: "monopoly", styles: { bold: true } },
          { type: "text", text: " ", styles: {} },
          { type: "text", text: "mechanism", styles: { italic: true } },
        ],
      },
    ]);
    expect(blockNoteJsonToMarkdown(body)).toBe("The **monopoly** *mechanism*");
  });

  it("renders bullet and numbered list items", () => {
    const body = JSON.stringify([
      { type: "bulletListItem", content: [{ type: "text", text: "first" }] },
      { type: "numberedListItem", content: [{ type: "text", text: "second" }] },
    ]);
    expect(blockNoteJsonToMarkdown(body)).toBe("- first\n\n1. second");
  });

  it("renders an image block as markdown image with caption alt", () => {
    const body = JSON.stringify([
      { type: "image", props: { url: "assets/n1/diagram.png", caption: "Diagram" } },
    ]);
    expect(blockNoteJsonToMarkdown(body)).toBe("![Diagram](assets/n1/diagram.png)");
  });

  it("renders a quote and a fenced code block", () => {
    const body = JSON.stringify([
      { type: "quote", content: [{ type: "text", text: "as above" }] },
      { type: "codeBlock", content: [{ type: "text", text: "const x = 1;" }] },
    ]);
    expect(blockNoteJsonToMarkdown(body)).toBe("> as above\n\n```\nconst x = 1;\n```");
  });
});

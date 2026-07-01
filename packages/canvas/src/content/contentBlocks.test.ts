import { describe, expect, it } from "vitest";

import { appendBlocksToBody, imageBlock, paragraphsToBlocks } from "./contentBlocks";

describe("paragraphsToBlocks", () => {
  it("returns no blocks for empty text", () => {
    expect(paragraphsToBlocks("")).toEqual([]);
    expect(paragraphsToBlocks("   \n\n ")).toEqual([]);
  });

  it("makes one paragraph block per non-empty line", () => {
    expect(paragraphsToBlocks("first\nsecond")).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "first" }] },
      { type: "paragraph", content: [{ type: "text", text: "second" }] },
    ]);
  });

  it("skips blank lines between paragraphs", () => {
    expect(paragraphsToBlocks("a\n\n\nb")).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "a" }] },
      { type: "paragraph", content: [{ type: "text", text: "b" }] },
    ]);
  });
});

describe("imageBlock", () => {
  it("builds an image block from a url with empty caption by default", () => {
    expect(imageBlock("assets/n1/cat.png")).toEqual({
      type: "image",
      props: { url: "assets/n1/cat.png", caption: "" },
    });
  });

  it("uses the provided caption", () => {
    expect(imageBlock("assets/n1/cat.png", "A cat")).toEqual({
      type: "image",
      props: { url: "assets/n1/cat.png", caption: "A cat" },
    });
  });
});

describe("appendBlocksToBody", () => {
  it("appends to an empty body sentinel", () => {
    const result = appendBlocksToBody("[]", [
      { type: "paragraph", content: [{ type: "text", text: "hi" }] },
    ]);
    expect(JSON.parse(result)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "hi" }] },
    ]);
  });

  it("treats an empty string the same as the sentinel", () => {
    const result = appendBlocksToBody("", [imageBlock("assets/n/i.png")]);
    expect(JSON.parse(result)).toEqual([
      { type: "image", props: { url: "assets/n/i.png", caption: "" } },
    ]);
  });

  it("appends after existing blocks preserving order", () => {
    const existing = JSON.stringify([
      { type: "paragraph", content: [{ type: "text", text: "old" }] },
    ]);
    const result = appendBlocksToBody(existing, paragraphsToBlocks("new"));
    expect(JSON.parse(result)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "old" }] },
      { type: "paragraph", content: [{ type: "text", text: "new" }] },
    ]);
  });

  it("returns the original body when there are no new blocks", () => {
    const existing = JSON.stringify([
      { type: "paragraph", content: [{ type: "text", text: "old" }] },
    ]);
    expect(appendBlocksToBody(existing, [])).toBe(existing);
  });
});

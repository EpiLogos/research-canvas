import { describe, expect, it } from "vitest";

import { imageBlock, paragraphsToBlocks } from "./contentBlocks";

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

import { describe, expect, it } from "vitest";

import { classifyDropItems, classifyPasteItems } from "./pasteIngest";

function fakeFile(name: string, type: string): { name: string; type: string; file: File } {
  return { name, type, file: new File(["x"], name, { type }) };
}

describe("classifyDropItems", () => {
  it("classifies image files as image ingests", () => {
    const result = classifyDropItems({ files: [fakeFile("cat.png", "image/png")], text: "" });
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("image");
    expect(result[0].mimeType).toBe("image/png");
  });

  it("classifies markdown files by extension even when type is empty", () => {
    const result = classifyDropItems({ files: [fakeFile("notes.md", "")], text: "" });
    expect(result[0].kind).toBe("markdown");
    if (result[0].kind === "markdown") {
      expect(result[0].fileName).toBe("notes.md");
    }
  });

  it("classifies text/markdown mime as markdown", () => {
    const result = classifyDropItems({ files: [fakeFile("notes", "text/markdown")], text: "" });
    expect(result[0].kind).toBe("markdown");
  });

  it("falls back to dropped plain text when there are no files", () => {
    const result = classifyDropItems({ files: [], text: "hello world" });
    expect(result).toEqual([{ kind: "text", mimeType: "text/plain", text: "hello world" }]);
  });

  it("ignores empty text and empty files", () => {
    expect(classifyDropItems({ files: [], text: "   " })).toEqual([]);
  });
});

describe("classifyPasteItems", () => {
  it("uses the same classification as drop", () => {
    const files = [fakeFile("cat.png", "image/png")];
    expect(classifyPasteItems({ files, text: "" })).toEqual(
      classifyDropItems({ files, text: "" }),
    );
  });
});

import type { BlockNoteBlock } from "@research-canvas/exporter";

export function paragraphsToBlocks(text: string): BlockNoteBlock[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line }],
    }));
}

export function imageBlock(url: string, caption = ""): BlockNoteBlock {
  return {
    type: "image",
    props: { url, caption },
  };
}

// A generic attached-file reference. There is no dedicated "file" BlockNote
// type recognized by the markdown renderer (packages/exporter/renderMarkdown.ts
// only special-cases heading/list/quote/codeBlock/image), so this is
// represented as a plain paragraph — the same pattern linkMarkdownFileToNode
// already uses for its "Linked source: <name>" line — which renders correctly
// everywhere (desktop editor, exporter, static viewer) without new plumbing.
export function fileLinkBlock(url: string, fileName: string): BlockNoteBlock {
  return {
    type: "paragraph",
    content: [{ type: "text", text: `Attached file: ${fileName} (${url})` }],
  };
}

function parseBody(bodyJson: string): BlockNoteBlock[] {
  const trimmed = bodyJson.trim();
  if (trimmed === "" || trimmed === "[]") {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? (parsed as BlockNoteBlock[]) : [];
  } catch {
    return [];
  }
}

export function appendBlocksToBody(bodyJson: string, blocks: BlockNoteBlock[]): string {
  if (blocks.length === 0) {
    return bodyJson;
  }
  const existing = parseBody(bodyJson);
  return JSON.stringify([...existing, ...blocks]);
}

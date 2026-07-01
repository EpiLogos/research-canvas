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

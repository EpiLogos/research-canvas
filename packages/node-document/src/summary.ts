interface InlineNode {
  type?: string;
  text?: string;
  content?: unknown;
}

interface BlockNode {
  content?: unknown;
}

function extractInlineText(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const item of content as InlineNode[]) {
    if (item && typeof item.text === "string") {
      parts.push(item.text);
    } else if (item && Array.isArray(item.content)) {
      parts.push(extractInlineText(item.content));
    }
  }
  return parts.join("");
}

/**
 * Plain-text digest of a BlockNote body. Joins each block's inline text with a
 * single space, collapses runs of whitespace, truncates to maxChars (default
 * 200) with a trailing "…". Empty/unparseable bodies yield "".
 */
export function blockNoteSummary(body: string, maxChars = 200): string {
  let blocks: BlockNode[];
  try {
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed)) {
      return "";
    }
    blocks = parsed as BlockNode[];
  } catch {
    return "";
  }

  const text = blocks
    .map((block) => extractInlineText(block?.content))
    .filter((value) => value.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}…`;
}

const HTML_ESCAPE_LOOKUP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

export function renderMarkdownToHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(
        `<h${level}>${renderInline(headingMatch[2].trim())}</h${level}>`
      );
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${renderInline(quoteLines.join(" "))}</blockquote>`);
      continue;
    }

    if (/^(\d+)\.\s+/.test(line) || /^[-*+]\s+/.test(line)) {
      const ordered = /^(\d+)\.\s+/.test(line);
      const items: string[] = [];
      while (
        index < lines.length &&
        (ordered ? /^(\d+)\.\s+/.test(lines[index]) : /^[-*+]\s+/.test(lines[index]))
      ) {
        items.push(lines[index].replace(/^(\d+)\.\s+|^[-*+]\s+/, ""));
        index += 1;
      }
      const tag = ordered ? "ol" : "ul";
      blocks.push(
        `<${tag}>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${tag}>`
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      const currentLine = lines[index];
      if (
        paragraphLines.length > 0 &&
        (currentLine.startsWith("#") ||
          currentLine.startsWith("```") ||
          currentLine.startsWith(">") ||
          /^(\d+)\.\s+/.test(currentLine) ||
          /^[-*+]\s+/.test(currentLine))
      ) {
        break;
      }
      paragraphLines.push(currentLine);
      index += 1;
    }

    blocks.push(`<p>${renderInline(paragraphLines.join(" "))}</p>`);
  }

  return blocks.join("");
}

function renderInline(text: string) {
  const parts: string[] = [];
  let index = 0;

  while (index < text.length) {
    const strongStart = text.indexOf("**", index);
    const codeStart = text.indexOf("`", index);
    const linkStart = text.indexOf("[", index);
    const emphasisStart = findSingleStar(text, index);

    const candidates = [strongStart, codeStart, linkStart, emphasisStart].filter(
      (value) => value !== -1
    );
    const nextIndex = candidates.length > 0 ? Math.min(...candidates) : -1;

    if (nextIndex === -1) {
      parts.push(escapeHtml(text.slice(index)));
      break;
    }

    if (nextIndex > index) {
      parts.push(escapeHtml(text.slice(index, nextIndex)));
      index = nextIndex;
      continue;
    }

    if (text.startsWith("**", index)) {
      const end = text.indexOf("**", index + 2);
      if (end !== -1) {
        parts.push(`<strong>${escapeHtml(text.slice(index + 2, end))}</strong>`);
        index = end + 2;
        continue;
      }
    }

    if (text.startsWith("`", index)) {
      const end = text.indexOf("`", index + 1);
      if (end !== -1) {
        parts.push(`<code>${escapeHtml(text.slice(index + 1, end))}</code>`);
        index = end + 1;
        continue;
      }
    }

    if (text.startsWith("[", index)) {
      const labelEnd = text.indexOf("]", index + 1);
      const hrefStart = text.indexOf("(", labelEnd + 1);
      const hrefEnd = text.indexOf(")", hrefStart + 1);
      if (labelEnd !== -1 && hrefStart === labelEnd + 1 && hrefEnd !== -1) {
        const label = text.slice(index + 1, labelEnd);
        const href = text.slice(hrefStart + 1, hrefEnd);
        parts.push(
          `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`
        );
        index = hrefEnd + 1;
        continue;
      }
    }

    if (emphasisStart === index) {
      const end = text.indexOf("*", index + 1);
      if (end !== -1) {
        parts.push(`<em>${escapeHtml(text.slice(index + 1, end))}</em>`);
        index = end + 1;
        continue;
      }
    }

    parts.push(escapeHtml(text[index]));
    index += 1;
  }

  return parts.join("");
}

function findSingleStar(text: string, startIndex: number) {
  const starIndex = text.indexOf("*", startIndex);
  if (starIndex === -1 || text.startsWith("**", starIndex)) {
    return -1;
  }

  return starIndex;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPE_LOOKUP[character] ?? character);
}

// ─── BlockNote → Markdown (WS3, single producer — WS0 §7) ───────────────────

/** Public contract type for a BlockNote inline node (WS0 §7). */
export interface BlockNoteInline {
  type: "text";
  text: string;
  styles?: { bold?: boolean; italic?: boolean; code?: boolean };
}

/** Public contract type for a BlockNote block node (WS0 §7). */
export interface BlockNoteBlock {
  type: string;
  props?: Record<string, unknown>;
  content?: BlockNoteInline[];
  children?: BlockNoteBlock[];
}

// Internal aliases (looser, for parsing robustness)
type BnInline = { type?: string; text?: string; styles?: { bold?: boolean; italic?: boolean; code?: boolean } };
type BnBlock = { type?: string; props?: { level?: number; url?: string; caption?: string }; content?: unknown };

function renderBnInline(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  return (content as BnInline[])
    .map((node) => {
      if (typeof node.text !== "string") {
        return "";
      }
      let text = node.text;
      const styles = node.styles ?? {};
      if (styles.code) {
        text = `\`${text}\``;
      }
      if (styles.bold) {
        text = `**${text}**`;
      }
      if (styles.italic) {
        text = `*${text}*`;
      }
      return text;
    })
    .join("");
}

function renderBnBlock(block: BnBlock): string {
  const inline = renderBnInline(block.content);
  switch (block.type) {
    case "heading": {
      const level = Math.min(Math.max(block.props?.level ?? 1, 1), 3);
      return `${"#".repeat(level)} ${inline}`;
    }
    case "bulletListItem":
      return `- ${inline}`;
    case "numberedListItem":
      return `1. ${inline}`;
    case "quote":
      return `> ${inline}`;
    case "codeBlock":
      return `\`\`\`\n${inline}\n\`\`\``;
    case "image": {
      const url = block.props?.url ?? "";
      const caption = block.props?.caption ?? "";
      return `![${caption}](${url})`;
    }
    case "paragraph":
    default:
      return inline;
  }
}

function textBlock(type: string, text: string, props?: Record<string, unknown>): BnBlock {
  return {
    type,
    props: props as BnBlock["props"],
    content: [{ type: "text", text, styles: {} }],
  };
}

/**
 * Convert a stored BlockNote/ProseMirror body JSON string to Markdown.
 * Used by the static web layer and "export node to .md" linking. (WS0 §7)
 */
export function blockNoteJsonToMarkdown(bodyJson: string): string {
  let blocks: BnBlock[];
  try {
    const parsed = JSON.parse(bodyJson);
    if (!Array.isArray(parsed)) {
      return "";
    }
    blocks = parsed as BnBlock[];
  } catch {
    return "";
  }
  return blocks.map((block) => renderBnBlock(block)).join("\n");
}

/**
 * Inverse of blockNoteJsonToMarkdown, for importing a linked .md file into a
 * node body (WS4). Parses a Markdown subset; returns "[]" for empty input. (WS0 §7)
 */
export function markdownToBlockNoteJson(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: BnBlock[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push(textBlock("heading", heading[2], { level: heading[1].length }));
      continue;
    }
    if (/^[-*+]\s+/.test(line)) {
      blocks.push(textBlock("bulletListItem", line.replace(/^[-*+]\s+/, "")));
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      blocks.push(textBlock("numberedListItem", line.replace(/^\d+\.\s+/, "")));
      continue;
    }
    if (/^>\s?/.test(line)) {
      blocks.push(textBlock("quote", line.replace(/^>\s?/, "")));
      continue;
    }
    blocks.push(textBlock("paragraph", line));
  }

  return JSON.stringify(blocks);
}

import type { ReactNode } from "react";

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; text: string }
  | { type: "blockquote"; text: string };

export function MarkdownViewer({ content, className }: MarkdownViewerProps) {
  const blocks = parseBlocks(content);

  return (
    <div className={["markdown-viewer", className].filter(Boolean).join(" ")}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.type) {
    case "heading": {
      const Heading = `h${block.level}` as const;

      return (
        <Heading key={`${block.type}-${index}`} className="markdown-viewer__heading">
          {renderInline(block.text)}
        </Heading>
      );
    }
    case "list":
      return block.ordered ? (
        <ol key={`${block.type}-${index}`} className="markdown-viewer__list">
          {block.items.map((item, itemIndex) => (
            <li key={`${index}-${itemIndex}`}>{renderInline(item)}</li>
          ))}
        </ol>
      ) : (
        <ul key={`${block.type}-${index}`} className="markdown-viewer__list">
          {block.items.map((item, itemIndex) => (
            <li key={`${index}-${itemIndex}`}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "code":
      return (
        <pre key={`${block.type}-${index}`} className="markdown-viewer__code">
          <code>{block.text}</code>
        </pre>
      );
    case "blockquote":
      return (
        <blockquote key={`${block.type}-${index}`} className="markdown-viewer__quote">
          {renderInline(block.text)}
        </blockquote>
      );
    case "paragraph":
    default:
      return (
        <p key={`${block.type}-${index}`} className="markdown-viewer__paragraph">
          {renderInline(block.text)}
        </p>
      );
  }
}

function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: headingMatch[2].trim()
      });
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
      blocks.push({ type: "code", text: codeLines.join("\n") });
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "blockquote", text: quoteLines.join(" ") });
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
      blocks.push({ type: "list", ordered, items });
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
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < text.length) {
    const strongStart = text.indexOf("**", index);
    const emStart =
      text.indexOf("*", index) !== -1 && text.indexOf("**", index) !== index
        ? text.indexOf("*", index)
        : -1;
    const codeStart = text.indexOf("`", index);
    const linkStart = text.indexOf("[", index);

    const candidates = [strongStart, emStart, codeStart, linkStart].filter(
      (value) => value !== -1
    );
    const nextIndex = candidates.length > 0 ? Math.min(...candidates) : -1;

    if (nextIndex === -1) {
      nodes.push(text.slice(index));
      break;
    }

    if (nextIndex > index) {
      nodes.push(text.slice(index, nextIndex));
      index = nextIndex;
      continue;
    }

    if (text.startsWith("**", index)) {
      const end = text.indexOf("**", index + 2);
      if (end !== -1) {
        nodes.push(
          <strong key={`${index}-${end}`}>{text.slice(index + 2, end)}</strong>
        );
        index = end + 2;
        continue;
      }
    }

    if (text.startsWith("`", index)) {
      const end = text.indexOf("`", index + 1);
      if (end !== -1) {
        nodes.push(
          <code key={`${index}-${end}`}>{text.slice(index + 1, end)}</code>
        );
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
        nodes.push(
          <a key={`${index}-${hrefEnd}`} href={href}>
            {label}
          </a>
        );
        index = hrefEnd + 1;
        continue;
      }
    }

    if (text.startsWith("*", index)) {
      const end = text.indexOf("*", index + 1);
      if (end !== -1) {
        nodes.push(
          <em key={`${index}-${end}`}>{text.slice(index + 1, end)}</em>
        );
        index = end + 1;
        continue;
      }
    }

    nodes.push(text[index]);
    index += 1;
  }

  return nodes;
}

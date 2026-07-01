import { blockNoteJsonToMarkdown } from "@research-canvas/exporter";

import { MarkdownViewer } from "./MarkdownViewer";

interface BlockNoteReadOnlyProps {
  body: string;
  className?: string;
}

/**
 * Non-editable render of a BlockNote body. Converts to Markdown and delegates
 * to MarkdownViewer so the web read-layer needs no BlockNote editor runtime.
 * (WS0 §7)
 */
export function BlockNoteReadOnly({ body, className }: BlockNoteReadOnlyProps) {
  const markdown = blockNoteJsonToMarkdown(body);
  return (
    <div className={["blocknote-readonly", className].filter(Boolean).join(" ")}>
      <MarkdownViewer content={markdown} />
    </div>
  );
}

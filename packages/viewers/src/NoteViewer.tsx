import { MarkdownViewer } from "./MarkdownViewer";

interface NoteViewerProps {
  title: string;
  content: string;
  tags?: string[];
  className?: string;
}

export function NoteViewer({ title, content, tags = [], className }: NoteViewerProps) {
  return (
    <article className={["note-viewer", className].filter(Boolean).join(" ")}>
      <header className="note-viewer__header">
        <p className="eyebrow">Note</p>
        <h1>{title}</h1>
        {tags.length > 0 ? (
          <ul className="note-viewer__tags" aria-label="Note tags">
            {tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        ) : null}
      </header>
      <MarkdownViewer content={content} />
    </article>
  );
}

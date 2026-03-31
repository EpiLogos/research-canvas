interface PdfViewerProps {
  source: string;
  title: string;
  className?: string;
}

export function PdfViewer({ source, title, className }: PdfViewerProps) {
  return (
    <section className={["pdf-viewer", className].filter(Boolean).join(" ")}>
      <object
        aria-label={title}
        className="pdf-viewer__object"
        data={source}
        type="application/pdf"
      >
        <a href={source}>Open {title}</a>
      </object>
    </section>
  );
}

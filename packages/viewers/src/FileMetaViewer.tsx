interface FileMetaViewerProps {
  title: string;
  absolutePath: string;
  relativePath: string;
  mimeType: string;
  resourceKind: string;
  fileFingerprint: string;
  url?: string;
  className?: string;
}

export function FileMetaViewer({
  title,
  absolutePath,
  relativePath,
  mimeType,
  resourceKind,
  fileFingerprint,
  url,
  className
}: FileMetaViewerProps) {
  return (
    <section className={["file-meta-viewer", className].filter(Boolean).join(" ")}>
      <header className="file-meta-viewer__header">
        <p className="eyebrow">Resource</p>
        <h1>{title}</h1>
      </header>
      <dl className="file-meta-viewer__list">
        <div>
          <dt>Resource kind</dt>
          <dd>{resourceKind}</dd>
        </div>
        <div>
          <dt>Relative path</dt>
          <dd>{relativePath}</dd>
        </div>
        <div>
          <dt>Absolute path</dt>
          <dd>{absolutePath}</dd>
        </div>
        <div>
          <dt>Mime type</dt>
          <dd>{mimeType}</dd>
        </div>
        <div>
          <dt>Fingerprint</dt>
          <dd>{fileFingerprint}</dd>
        </div>
        {url ? (
          <div>
            <dt>URL</dt>
            <dd>
              <a href={url}>{url}</a>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

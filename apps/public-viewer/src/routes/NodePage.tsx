import type { ExportBundle } from "@research-canvas/schema";

import { FileMetaViewer, ImageViewer, NoteViewer, PdfViewer } from "@research-canvas/viewers";

interface NodePageProps {
  bundle: ExportBundle;
  nodeId: string;
}

export function NodePage({ bundle, nodeId }: NodePageProps) {
  const node = bundle.nodes.find((entry) => entry.id === nodeId);

  if (!node) {
    return (
      <main className="viewer viewer--node">
        <header className="viewer__hero">
          <p className="eyebrow">Node page</p>
          <h1>Node not found</h1>
        </header>
      </main>
    );
  }

  return (
    <main className="viewer viewer--node">
      <header className="viewer__hero">
        <p className="eyebrow">Node page</p>
        <h1>{node.title}</h1>
        <p>{node.summary || node.type}</p>
      </header>

      {node.type === "note" ? (
        <NoteViewer content={node.content} tags={node.tags} title={node.title} />
      ) : null}

      {node.type === "resource" ? (
        <section className="viewer__section">
          <FileMetaViewer
            absolutePath={node.absolutePath}
            fileFingerprint={node.fileFingerprint}
            mimeType={node.mimeType}
            relativePath={node.relativePath}
            resourceKind={node.resourceKind}
            title={node.title}
            url={node.url}
          />
          {node.resourceKind === "image" ? (
            <ImageViewer source={node.absolutePath} title={node.title} />
          ) : null}
          {node.resourceKind === "pdf" ? (
            <PdfViewer source={node.absolutePath} title={node.title} />
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

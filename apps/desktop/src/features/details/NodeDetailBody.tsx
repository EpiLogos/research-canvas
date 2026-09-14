import {
  FileMetaViewer,
  ImageViewer,
  NoteViewer,
  PdfViewer
} from "@research-canvas/viewers";

import type { CanvasNode } from "@research-canvas/schema";
import { toAssetUrl } from "../canvas/resourceFileHelpers";

interface NodeDetailBodyProps {
  node: CanvasNode;
}

export function NodeDetailBody({ node }: NodeDetailBodyProps) {
  if (node.type === "note") {
    return (
      <NoteViewer
        content={node.content}
        tags={node.tags}
        title={node.title}
      />
    );
  }

  if (node.type === "resource") {
    return (
      <section className="node-detail-body">
        <FileMetaViewer
          absolutePath={node.absolutePath}
          fileFingerprint={node.fileFingerprint}
          mimeType={node.mimeType}
          resourceKind={node.resourceKind}
          relativePath={node.relativePath}
          title={node.title}
          url={node.url}
        />

        {node.resourceKind === "image" ? (
          <ImageViewer source={toAssetUrl(node.absolutePath)} title={node.title} />
        ) : null}

        {node.resourceKind === "pdf" ? (
          <PdfViewer source={node.absolutePath} title={node.title} />
        ) : null}

        <a
          className="node-detail-body__source-link"
          href={node.url ?? `file://${node.absolutePath}`}
          rel="noreferrer"
          target="_blank"
        >
          Open source
        </a>
      </section>
    );
  }

  if (node.type === "group") {
    return (
      <section className="node-detail-body">
        <header>
          <p className="eyebrow">Group</p>
          <h1>{node.title}</h1>
        </header>
        <p>{node.summary || "Grouped nodes are stored here."}</p>
      </section>
    );
  }

  if (node.type === "image") {
    return (
      <section className="node-detail-body">
        <header>
          <p className="eyebrow">Image</p>
          <h1>{node.title}</h1>
        </header>
        <ImageViewer source={toAssetUrl(node.src)} title={node.title} />
        {node.caption ? <p>{node.caption}</p> : null}
      </section>
    );
  }

  return (
    <section className="node-detail-body">
      <header>
        <p className="eyebrow">Portal</p>
        <h1>{node.title}</h1>
      </header>
      <p>Portal nodes jump to canvas {node.targetCanvasId}.</p>
    </section>
  );
}

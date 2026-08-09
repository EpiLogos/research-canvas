import type { ExportBundle } from "@research-canvas/schema";

import { NoteViewer } from "@research-canvas/viewers";

import type { ExportManifest } from "@research-canvas/exporter";

interface IndexViewProps {
  bundle: ExportBundle;
  manifest: ExportManifest;
}

export function IndexView({ bundle, manifest }: IndexViewProps) {
  const firstNote = bundle.nodes.find((node) => node.type === "note");

  return (
    <main className="viewer viewer--map">
      <header className="viewer__hero">
        <p className="eyebrow">Static export</p>
        <h1>{bundle.project.displayName}</h1>
        <p>{bundle.project.summary || "Published research canvas"}</p>
      </header>

      <section className="viewer__section">
        <header className="viewer__section-header">
          <p className="eyebrow">Map</p>
          <h2>Canvas nodes</h2>
        </header>
        <div className="viewer__card-grid">
          {manifest.nodePages.map((page) => {
            const node = bundle.nodes.find((entry) => entry.id === page.nodeId);
            if (!node) {
              return null;
            }

            return (
              <article className="viewer__card" key={node.id}>
                <a className="viewer__card-link" href={page.href}>
                  <h3>{node.title}</h3>
                  <p>{node.summary || node.type}</p>
                </a>
              </article>
            );
          })}
        </div>
      </section>

      {firstNote ? (
        <section className="viewer__section">
          <header className="viewer__section-header">
            <p className="eyebrow">Featured note</p>
            <h2>{firstNote.title}</h2>
          </header>
          <NoteViewer
            content={firstNote.type === "note" ? firstNote.content : ""}
            tags={firstNote.type === "note" ? firstNote.tags : []}
            title={firstNote.title}
          />
        </section>
      ) : null}

      <section className="viewer__section">
        <header className="viewer__section-header">
          <p className="eyebrow">Downloads</p>
          <h2>Published resources</h2>
        </header>
        <ul className="viewer__download-list">
          {bundle.assets.map((asset) => (
            <li key={`${asset.nodeId}-${asset.downloadName}`}>
              <a href={`assets/${asset.downloadName}`}>Download {asset.downloadName}</a>
            </li>
          ))}
        </ul>
      </section>

    </main>
  );
}

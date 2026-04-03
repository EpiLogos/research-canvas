import type { ExportBundle } from "@research-canvas/schema";

interface MobileFallbackProps {
  bundle: ExportBundle;
}

export function MobileFallback({ bundle }: MobileFallbackProps) {
  return (
    <main className="viewer viewer--mobile">
      <header className="viewer__hero">
        <p className="eyebrow">Mobile mode</p>
        <h1>Resource exploration</h1>
        <p>Browse published resources and notes.</p>
      </header>
      <section className="viewer__section">
        <header className="viewer__section-header">
          <p className="eyebrow">Nodes</p>
          <h2>{bundle.project.displayName}</h2>
        </header>
        <ul className="viewer__step-list">
          {bundle.nodes.map((node) => (
            <li key={node.id}>
              <strong>{node.title}</strong>
              <span>{node.summary || node.type}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

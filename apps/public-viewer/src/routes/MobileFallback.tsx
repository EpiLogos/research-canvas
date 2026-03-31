import type { ExportBundle } from "@research-canvas/schema";

interface MobileFallbackProps {
  bundle: ExportBundle;
}

export function MobileFallback({ bundle }: MobileFallbackProps) {
  const sequence = bundle.sequences[0];

  return (
    <main className="viewer viewer--mobile">
      <header className="viewer__hero">
        <p className="eyebrow">Mobile mode</p>
        <h1>Sequence-first exploration</h1>
        <p>Follow the published path, then open resources when you need the source material.</p>
      </header>
      <section className="viewer__section">
        <header className="viewer__section-header">
          <p className="eyebrow">Sequences</p>
          <h2>{sequence?.name ?? "Published tour"}</h2>
        </header>
        <ol className="viewer__step-list">
          {(sequence
            ? bundle.sequenceSteps.filter((step) => step.sequenceId === sequence.id)
            : []
          ).map((step) => {
            const target =
              bundle.nodes.find((node) => node.id === step.targetId) ??
              bundle.edges.find((edge) => edge.id === step.targetId);
            const label = target && "title" in target ? target.title : target?.relationKind;
            return (
              <li key={step.id}>
                <strong>{step.caption || label}</strong>
                <span>{label}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}

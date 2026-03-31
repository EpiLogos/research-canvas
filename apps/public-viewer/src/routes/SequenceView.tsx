import type { ExportBundle } from "@research-canvas/schema";

interface SequenceViewProps {
  bundle: ExportBundle;
}

export function SequenceView({ bundle }: SequenceViewProps) {
  const sequence = bundle.sequences[0];

  return (
    <main className="viewer viewer--sequence">
      <header className="viewer__hero">
        <p className="eyebrow">Sequence view</p>
        <h1>{sequence?.name ?? bundle.project.displayName}</h1>
        <p>{sequence?.description || "Guided traversal of the export"}</p>
      </header>
      <section className="viewer__section">
        <header className="viewer__section-header">
          <p className="eyebrow">Steps</p>
          <h2>Published tour</h2>
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

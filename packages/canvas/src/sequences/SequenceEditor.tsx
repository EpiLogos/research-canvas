import type { Sequence, SequenceStep } from "@research-canvas/schema";

interface SequenceEditorProps {
  activeSequenceId: string | null;
  sequences: Sequence[];
  steps: SequenceStep[];
}

export function SequenceEditor({
  activeSequenceId,
  sequences,
  steps
}: SequenceEditorProps) {
  if (sequences.length === 0) {
    return (
      <section className="sequence-panel__section">
        <h3>Sequences</h3>
        <p>No guided sequences yet.</p>
      </section>
    );
  }

  return (
    <section className="sequence-panel__section">
      <h3>Sequences</h3>
      {sequences.map((sequence) => (
        <article className="sequence-panel__card" key={sequence.id}>
          <strong>{sequence.name}</strong>
          <span>{sequence.kind}</span>
          <span data-testid="sequence-step-count">
            {steps.filter((step) => step.sequenceId === sequence.id).length}
          </span>
          {activeSequenceId === sequence.id ? <em>Active</em> : null}
        </article>
      ))}
    </section>
  );
}

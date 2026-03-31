import type { SequenceStep } from "@research-canvas/schema";

interface SequencePlayerProps {
  activeStep: SequenceStep | null;
  activeStepIndex: number;
  onPlayNext: () => void;
}

export function SequencePlayer({
  activeStep,
  activeStepIndex,
  onPlayNext
}: SequencePlayerProps) {
  return (
    <section className="sequence-panel__section">
      <h3>Playback</h3>
      <button onClick={onPlayNext} type="button">
        Play next step
      </button>

      {activeStep ? (
        <article className="sequence-panel__card">
          <strong>{activeStep.caption}</strong>
          <span data-testid="sequence-active-step">{activeStepIndex + 1}</span>
        </article>
      ) : (
        <p>No active step.</p>
      )}
    </section>
  );
}

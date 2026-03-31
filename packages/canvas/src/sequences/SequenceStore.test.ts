import { describe, expect, it } from "vitest";

import { createSequenceStore } from "./SequenceStore";

describe("SequenceStore", () => {
  it("creates sequences, adds ordered steps, and restores playback state", () => {
    const store = createSequenceStore({
      canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
      projectId: "d8c78a1f-f53f-49b8-8b84-8090c37f8b59"
    });

    const sequence = store.getState().createSequence({
      kind: "storyboard",
      name: "Episode flow"
    });

    store.getState().addNodeStep(sequence.id, {
      caption: "Start with the thesis",
      targetId: "11111111-1111-4111-8111-111111111111",
      viewport: { x: 0, y: 0, zoom: 1 }
    });
    store.getState().addNodeStep(sequence.id, {
      caption: "Bring in the supporting source",
      targetId: "22222222-2222-4222-8222-222222222222",
      viewport: { x: 160, y: 40, zoom: 1.2 }
    });

    store.getState().setActiveSequence(sequence.id);
    store.getState().playStep(1);

    const snapshot = store.getState().serialize();

    expect(snapshot.sequences).toHaveLength(1);
    expect(snapshot.steps).toHaveLength(2);
    expect(snapshot.activeSequenceId).toBe(sequence.id);
    expect(snapshot.activeStepIndex).toBe(1);

    const reloaded = createSequenceStore({
      canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
      projectId: "d8c78a1f-f53f-49b8-8b84-8090c37f8b59"
    });
    reloaded.getState().hydrate(snapshot);

    expect(reloaded.getState().sequences[0].name).toBe("Episode flow");
    expect(reloaded.getState().stepsForSequence(sequence.id)).toHaveLength(2);
    expect(reloaded.getState().activeStep?.caption).toBe(
      "Bring in the supporting source"
    );
  });
});

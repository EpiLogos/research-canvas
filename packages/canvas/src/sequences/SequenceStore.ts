import { createStore } from "zustand/vanilla";

import {
  sequenceSchema,
  sequenceStepSchema,
  type Sequence,
  type SequenceStep,
  type Viewport
} from "@research-canvas/schema";

export interface SequenceSnapshot {
  activeSequenceId: string | null;
  activeStepIndex: number;
  sequences: Sequence[];
  steps: SequenceStep[];
}

interface CreateSequenceStoreOptions {
  canvasId: string;
  projectId: string;
}

interface CreateSequenceInput {
  description?: string;
  kind: Sequence["kind"];
  name: string;
}

interface AddNodeStepInput {
  caption: string;
  targetId: string;
  viewport: Viewport;
}

export interface SequenceStoreState {
  activeSequenceId: string | null;
  activeStep: SequenceStep | null;
  activeStepIndex: number;
  addNodeStep: (sequenceId: string, input: AddNodeStepInput) => SequenceStep;
  createSequence: (input: CreateSequenceInput) => Sequence;
  hydrate: (snapshot: SequenceSnapshot) => void;
  playNextStep: () => void;
  playStep: (index: number) => void;
  sequences: Sequence[];
  serialize: () => SequenceSnapshot;
  setActiveSequence: (sequenceId: string | null) => void;
  steps: SequenceStep[];
  stepsForSequence: (sequenceId: string) => SequenceStep[];
}

export function createSequenceStore({
  canvasId,
  projectId
}: CreateSequenceStoreOptions) {
  return createStore<SequenceStoreState>((set, get) => ({
    activeSequenceId: null,
    activeStep: null,
    activeStepIndex: -1,
    addNodeStep: (sequenceId, { caption, targetId, viewport }) => {
      const step = sequenceStepSchema.parse({
        id: crypto.randomUUID(),
        sequenceId,
        position: get().stepsForSequence(sequenceId).length,
        targetType: "node",
        targetId,
        caption,
        viewport,
        transitionHint: "ease"
      });

      set((state) =>
        withActiveStep({
          ...state,
          activeStepIndex:
            state.activeSequenceId === sequenceId && state.activeStepIndex < 0
              ? 0
              : state.activeStepIndex,
          steps: [...state.steps, step]
        })
      );

      return step;
    },
    createSequence: ({ description = "", kind, name }) => {
      const sequence = sequenceSchema.parse({
        id: crypto.randomUUID(),
        projectId,
        canvasId,
        name,
        kind,
        description,
        published: false,
        createdAt: now(),
        updatedAt: now()
      });

      set((state) =>
        withActiveStep({
          ...state,
          activeSequenceId: sequence.id,
          activeStepIndex: -1,
          sequences: [...state.sequences, sequence]
        })
      );

      return sequence;
    },
    hydrate: (snapshot) => {
      set((state) =>
        withActiveStep({
          ...state,
          activeSequenceId: snapshot.activeSequenceId,
          activeStepIndex: snapshot.activeStepIndex,
          sequences: snapshot.sequences.map((sequence) => sequenceSchema.parse(sequence)),
          steps: snapshot.steps.map((step) => sequenceStepSchema.parse(step))
        })
      );
    },
    playNextStep: () => {
      const { activeSequenceId, activeStepIndex, stepsForSequence } = get();
      if (!activeSequenceId) {
        return;
      }

      const steps = stepsForSequence(activeSequenceId);
      if (steps.length === 0) {
        return;
      }

      set((state) =>
        withActiveStep({
          ...state,
          activeStepIndex: Math.min(activeStepIndex + 1, steps.length - 1)
        })
      );
    },
    playStep: (index) => {
      set((state) =>
        withActiveStep({
          ...state,
          activeStepIndex: index
        })
      );
    },
    sequences: [],
    serialize: () => ({
      activeSequenceId: get().activeSequenceId,
      activeStepIndex: get().activeStepIndex,
      sequences: get().sequences,
      steps: get().steps
    }),
    setActiveSequence: (sequenceId) => {
      const nextSteps = sequenceId ? get().stepsForSequence(sequenceId) : [];
      set((state) =>
        withActiveStep({
          ...state,
          activeSequenceId: sequenceId,
          activeStepIndex: nextSteps.length > 0 ? 0 : -1
        })
      );
    },
    steps: [],
    stepsForSequence: (sequenceId) =>
      sortSequenceSteps(
        get().steps.filter((step) => step.sequenceId === sequenceId)
      )
  }));
}

function withActiveStep(state: SequenceStoreState) {
  const steps =
    state.activeSequenceId === null
      ? []
      : sortSequenceSteps(
          state.steps.filter((step) => step.sequenceId === state.activeSequenceId)
        );

  return {
    ...state,
    activeStep:
      state.activeStepIndex >= 0 && state.activeStepIndex < steps.length
        ? steps[state.activeStepIndex]
        : null
  };
}

function now() {
  return new Date().toISOString();
}

function sortSequenceSteps(steps: SequenceStep[]) {
  return steps.slice().sort((left, right) => left.position - right.position);
}

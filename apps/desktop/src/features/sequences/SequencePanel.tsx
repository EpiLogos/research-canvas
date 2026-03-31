import { SequenceEditor, SequencePlayer } from "@research-canvas/canvas";

import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";

export function SequencePanel() {
  const workspace = useCanvasWorkspace();
  const activeSequenceSteps = workspace.activeSequenceId
    ? workspace.sequenceStore.getState().stepsForSequence(workspace.activeSequenceId)
    : [];

  const playNextStep = () => {
    workspace.sequenceStore.getState().playNextStep();

    const activeStep = workspace.sequenceStore.getState().activeStep;
    if (activeStep?.targetType === "node") {
      workspace.selectNode(activeStep.targetId);
    }
  };

  return (
    <section className="sequence-panel">
      <SequenceEditor
        activeSequenceId={workspace.activeSequenceId}
        sequences={workspace.sequences}
        steps={activeSequenceSteps}
      />
      <SequencePlayer
        activeStep={workspace.activeStep}
        activeStepIndex={workspace.activeStepIndex}
        onPlayNext={playNextStep}
      />
    </section>
  );
}

import { useCallback } from "react";
import { SequenceEditor, SequencePlayer } from "@research-canvas/canvas";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";

export function SequencePanel() {
  const workspace = useCanvasWorkspace();
  const activeSequenceSteps = workspace.activeSequenceId
    ? workspace.sequenceStore.getState().stepsForSequence(workspace.activeSequenceId)
    : [];

  const playNextStep = useCallback(() => {
    workspace.sequenceStore.getState().playNextStep();
    const activeStep = workspace.sequenceStore.getState().activeStep;
    if (activeStep?.targetType === "node") {
      workspace.selectNode(activeStep.targetId);
      workspace.flyToNode(activeStep.targetId, activeStep.viewport);
    }
  }, [workspace]);

  const handleAddCurrentNode = useCallback(() => {
    if (!workspace.activeSequenceId || !workspace.selectedNodeId) return;
    workspace.sequenceStore.getState().addNodeStep(workspace.activeSequenceId, {
      caption: workspace.nodes.find((n) => n.id === workspace.selectedNodeId)?.title ?? "Step",
      targetId: workspace.selectedNodeId,
      viewport: { x: 0, y: 0, zoom: 1 },
    });
  }, [workspace]);

  const handleCreateSequence = useCallback(() => {
    const name = window.prompt("Sequence name:", "New sequence");
    if (!name) return;
    workspace.sequenceStore.getState().createSequence({
      kind: "storyboard",
      name,
    });
  }, [workspace]);

  const handleDeleteStep = useCallback(
    (stepId: string) => {
      workspace.sequenceStore.getState().removeStep(stepId);
    },
    [workspace]
  );

  const handleDeleteSequence = useCallback(
    (sequenceId: string) => {
      workspace.sequenceStore.getState().removeSequence(sequenceId);
    },
    [workspace]
  );

  return (
    <section className="sequence-panel">
      <div className="sequence-panel__actions">
        <button onClick={handleCreateSequence} type="button">
          New sequence
        </button>
        {workspace.activeSequenceId && workspace.selectedNodeId && (
          <button onClick={handleAddCurrentNode} type="button">
            Add selected node
          </button>
        )}
      </div>

      <SequenceEditor
        activeSequenceId={workspace.activeSequenceId}
        sequences={workspace.sequences}
        steps={activeSequenceSteps}
      />

      {activeSequenceSteps.length > 0 && (
        <div className="sequence-panel__steps">
          <h4>Steps</h4>
          <ol>
            {activeSequenceSteps.map((step, i) => (
              <li key={step.id} data-active={workspace.activeStepIndex === i ? "true" : "false"}>
                <span>{step.caption}</span>
                <button
                  onClick={() => handleDeleteStep(step.id)}
                  title="Remove step"
                  type="button"
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {workspace.activeSequenceId && (
        <button
          className="sequence-panel__delete"
          onClick={() => handleDeleteSequence(workspace.activeSequenceId!)}
          type="button"
        >
          Delete sequence
        </button>
      )}

      <SequencePlayer
        activeStep={workspace.activeStep}
        activeStepIndex={workspace.activeStepIndex}
        onPlayNext={playNextStep}
      />
    </section>
  );
}

// apps/desktop/src/features/pipeline/FlowView.tsx
//
// The flow view (task-9 step 4): select an object, see its passage through
// the pipeline stages (Constellations → Timeline → Places → Stories → Palace),
// run the next send-to action at the frontier, and jump into any reached
// stage's surface. The inspector hosts this view for the selected canvas node.

import { useMemo, useState, type JSX } from "react";

import {
  PIPELINE_STAGES,
  type ObjectStageState,
  type PipelineStageMeta,
} from "./pipelineStages";
import type {
  PipelineObject,
  UsePipelineActionsResult,
} from "./usePipelineActions";

export type PipelineJumpTarget = PipelineStageMeta["lens"];

interface FlowViewProps {
  node: PipelineObject | null;
  stageState: ObjectStageState | null;
  candidatePlaces: Array<{ graphNodeId: string; title: string }>;
  actions: UsePipelineActionsResult;
  onJump: (lens: PipelineJumpTarget) => void;
}

export function FlowView({
  node,
  stageState,
  candidatePlaces,
  actions,
  onJump,
}: FlowViewProps): JSX.Element {
  const [year, setYear] = useState("1600");
  const [placeId, setPlaceId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectivePlaceId =
    placeId && candidatePlaces.some((place) => place.graphNodeId === placeId)
      ? placeId
      : (candidatePlaces[0]?.graphNodeId ?? "");

  const reached = useMemo(() => {
    return {
      constellations: true,
      timeline: stageState?.timeline ?? false,
      places: stageState?.places ?? false,
      stories: stageState?.stories ?? false,
      palace: stageState?.palace ?? false,
    };
  }, [stageState]);

  if (!node) {
    return (
      <div className="flow-view" data-testid="flow-view">
        <p className="flow-view__empty">Select an object to see its passage through the pipeline.</p>
      </div>
    );
  }

  const runAction = async (stageId: string, fn: () => Promise<void>) => {
    setBusy(stageId);
    setError(null);
    try {
      await fn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const renderAction = (stage: PipelineStageMeta) => {
    if (stage.id === "constellations") return null;
    if (stage.id === "timeline" && !reached.timeline) {
      return (
        <div className="flow-action" data-testid="flow-action-send-to-timeline">
          <input
            className="flow-action__input"
            type="text"
            inputMode="numeric"
            aria-label="Year to date this object"
            data-testid="flow-year-input"
            value={year}
            onChange={(event) => setYear(event.target.value)}
          />
          <button
            type="button"
            className="flow-action__button"
            data-testid="flow-send-to-timeline"
            disabled={busy !== null}
            onClick={() =>
              void runAction("timeline", () => actions.sendToTimeline(node, year))
            }
          >
            {busy === "timeline" ? "Sending…" : "Send to timeline"}
          </button>
        </div>
      );
    }
    if (stage.id === "places" && reached.timeline && !reached.places) {
      return (
        <div className="flow-action" data-testid="flow-action-locate">
          <select
            className="flow-action__input"
            aria-label="Temporal place"
            data-testid="flow-place-select"
            value={effectivePlaceId}
            onChange={(event) => setPlaceId(event.target.value)}
          >
            {candidatePlaces.map((place) => (
              <option key={place.graphNodeId} value={place.graphNodeId}>
                {place.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="flow-action__button"
            data-testid="flow-locate"
            disabled={busy !== null || !effectivePlaceId}
            onClick={() =>
              void runAction("places", () =>
                actions.locate(node, effectivePlaceId),
              )
            }
          >
            {busy === "places" ? "Locating…" : "Locate"}
          </button>
        </div>
      );
    }
    if (stage.id === "stories" && reached.places && !reached.stories) {
      return (
        <div className="flow-action" data-testid="flow-action-add-to-story">
          <button
            type="button"
            className="flow-action__button"
            data-testid="flow-add-to-story"
            disabled={busy !== null}
            onClick={() => void runAction("stories", () => actions.addToStory(node))}
          >
            {busy === "stories" ? "Adding…" : "Add to story"}
          </button>
        </div>
      );
    }
    if (stage.id === "palace" && reached.stories && !reached.palace) {
      return (
        <div className="flow-action" data-testid="flow-action-place-in-palace">
          <button
            type="button"
            className="flow-action__button"
            data-testid="flow-place-in-palace"
            disabled={busy !== null}
            onClick={() => void runAction("palace", () => actions.placeInPalace(node))}
          >
            {busy === "palace" ? "Placing…" : "Place in palace"}
          </button>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flow-view" data-testid="flow-view" data-object={node.graphNodeId}>
      <p className="flow-view__subject" data-testid="flow-subject">
        {node.title}
      </p>
      <ol className="flow-view__stages">
        {PIPELINE_STAGES.map((stage) => {
          const reachedStage = reached[stage.id];
          return (
            <li
              key={stage.id}
              className="flow-view__stage"
              data-testid={`flow-stage-${stage.id}`}
              data-reached={reachedStage ? "true" : "false"}
              data-active={!reachedStage ? "true" : "false"}
            >
              <span className="flow-view__stage-label">
                {reachedStage ? "✓" : "○"} {stage.label}
              </span>
              <span className="flow-view__stage-actions">
                {reachedStage && (
                  <button
                    type="button"
                    className="flow-view__jump"
                    data-testid={`flow-jump-${stage.id}`}
                    onClick={() => onJump(stage.lens)}
                  >
                    Open {stage.label}
                  </button>
                )}
                {renderAction(stage)}
              </span>
            </li>
          );
        })}
      </ol>
      {error && (
        <p className="flow-view__error" role="alert" data-testid="flow-error">
          {error}
        </p>
      )}
    </div>
  );
}

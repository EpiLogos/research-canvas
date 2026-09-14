import { Fragment } from "react";

import {
  PIPELINE_STAGES,
  type PipelineStageId,
} from "../features/pipeline/pipelineStages";
import type { LensMode } from "./useLensMode";

/**
 * The shell's five lenses rendered as ONE visible pipeline
 * (Constellations → Timeline → Places → Stories → Palace), with stage state —
 * which objects have reached which stage — shown as counts. The rail is a
 * navigation + action surface, not a new store: the counts are derived from
 * the existing stores through the real transport (see usePipelineStages).
 */

interface PipelineRailProps {
  lens: LensMode;
  onSetLens: (lens: LensMode) => void;
  breadcrumb?: string;
  onOpenPalette: () => void;
  /** Cumulative reached-object count per pipeline stage. */
  stageCounts: Record<PipelineStageId, number>;
}

// Tab labels are the shell's existing lens names (the pipeline stage labels
// live in the flow view); the story stage keeps its journey framing.
const TAB_LABELS: Record<PipelineStageId, string> = {
  constellations: "Canvas",
  timeline: "Timeline",
  places: "Places",
  stories: "Journeys",
  palace: "Palace",
};

export function PipelineRail({
  lens,
  onSetLens,
  breadcrumb,
  onOpenPalette,
  stageCounts,
}: PipelineRailProps) {
  return (
    <div className="ishell-transport" data-testid="transport-bar">
      <div className="ishell-lensswitch" role="tablist" aria-label="Pipeline">
        {PIPELINE_STAGES.map((stage, index) => {
          const active = lens === stage.lens;
          const count = stageCounts[stage.id];
          return (
            <Fragment key={stage.id}>
              {index > 0 && (
                <span className="ishell-rail-arrow" aria-hidden="true">
                  →
                </span>
              )}
              <button
                type="button"
                role="tab"
                data-testid={`lens-${stage.lens}`}
                data-active={active ? "true" : "false"}
                data-stage={stage.id}
                aria-selected={active}
                onClick={() => onSetLens(stage.lens)}
              >
                {TAB_LABELS[stage.id]}
                {count > 0 && (
                  <span
                    className="ishell-rail-count"
                    aria-hidden="true"
                    data-testid={`rail-count-${stage.id}`}
                  >
                    {count}
                  </span>
                )}
              </button>
            </Fragment>
          );
        })}
      </div>

      {breadcrumb ? <span className="ishell-breadcrumb">{breadcrumb}</span> : null}

      <span className="ishell-transport__spacer" />

      <button
        type="button"
        className="ishell-palette-affordance"
        aria-label="Do anything"
        onClick={onOpenPalette}
      >
        <kbd>⌘K</kbd>
        <span>Do anything</span>
      </button>
    </div>
  );
}

// apps/desktop/src/features/pipeline/usePipelineStages.ts
//
// Stage-state hook: derives each canvas object's position through the pipeline
// from the real stores via the transport (timeline view + LOCATED_AT
// relationships, profile scenes, palace curation). No new persistence layer —
// every signal is a live read of an existing store.

import { useCallback, useEffect, useMemo, useState } from "react";

import type { PalaceCuration } from "@research-canvas/canvas";
import type { WorkspaceTransport, TimelineView } from "@research-canvas/desktop-api";
import type { Scene } from "@research-canvas/schema";

import {
  candidatePlacesFromTimeline,
  deriveStageState,
  reachedStage,
  stageIndex,
  type ObjectStageState,
  type PipelineStageId,
} from "./pipelineStages";

export interface StageInputObject {
  graphNodeId: string | null;
  title: string;
}

interface UsePipelineStagesInput {
  transport: WorkspaceTransport | null;
  workspaceId: string | null;
  databasePath: string | null;
  profileScope: string | null;
  objects: StageInputObject[];
}

export interface UsePipelineStagesResult {
  /** Stage state keyed by graphNodeId (canvas objects only). */
  byGraphNodeId: Map<string, ObjectStageState>;
  /** The furthest stage reached by `graphNodeId`. */
  reachedStageFor: (graphNodeId: string) => PipelineStageId;
  /** How many tracked objects have reached at least `stage` (cumulative). */
  countAt: (stage: PipelineStageId) => number;
  /** Candidate Temporal Places for the "Locate" action. */
  candidatePlaces: Array<{ graphNodeId: string; title: string }>;
  /** Re-read the underlying stores (after a send-to action). */
  refresh: () => void;
}

export function usePipelineStages(
  input: UsePipelineStagesInput,
): UsePipelineStagesResult {
  const { transport, workspaceId, databasePath, profileScope, objects } = input;

  const [timeline, setTimeline] = useState<TimelineView | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [curation, setCuration] = useState<PalaceCuration | null>(null);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // Stable gate: the store reads fire only once there is at least one canvas
  // object to track. A boolean (not the `objects` array) is the dependency so
  // callers passing a fresh array each render cannot retrigger the effect.
  const hasObjects = objects.length > 0;

  useEffect(() => {
    const canReadTimeline = Boolean(transport?.loadTimelineView && workspaceId);
    const canReadScenes = Boolean(transport?.listScenes && databasePath);
    const canReadCuration = Boolean(transport?.loadPalaceCuration && databasePath);

    // Nothing to track until there are canvas objects: rail counts and the
    // flow view are derived from the tracked objects, and a selected object
    // implies a non-empty canvas. Deferring the store reads keeps the
    // pipeline's load off the workspace-boot critical path.
    if (!hasObjects) {
      setTimeline(null);
      setScenes([]);
      setCuration(null);
      return;
    }

    if (!canReadTimeline && !canReadScenes && !canReadCuration) {
      setTimeline(null);
      setScenes([]);
      setCuration(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      const loadTimeline =
        transport && workspaceId && transport.loadTimelineView
          ? transport
              .loadTimelineView({ workspaceId })
              .then((view) => view as TimelineView)
              .catch(() => null)
          : Promise.resolve(null);
      const loadScenes =
        transport && databasePath && transport.listScenes
          ? transport
              .listScenes({
                databasePath,
                profileScope: profileScope ?? undefined,
              })
              .catch(() => [] as Scene[])
          : Promise.resolve([] as Scene[]);
      const loadCuration =
        transport && databasePath && transport.loadPalaceCuration
          ? transport
              .loadPalaceCuration({
                databasePath,
                profileScope: profileScope ?? undefined,
              })
              .then((result) => (result.curation as PalaceCuration) ?? null)
              .catch(() => null)
          : Promise.resolve(null);

      const [nextTimeline, nextScenes, nextCuration] = await Promise.all([
        loadTimeline,
        loadScenes,
        loadCuration,
      ]);
      if (cancelled) return;
      setTimeline(nextTimeline);
      setScenes(nextScenes);
      setCuration(nextCuration);
    })();

    return () => {
      cancelled = true;
    };
  }, [transport, workspaceId, databasePath, profileScope, version, hasObjects]);

  const byGraphNodeId = useMemo(
    () => deriveStageState(objects, timeline, scenes, curation),
    [objects, timeline, scenes, curation],
  );

  const reachedStageFor = useCallback(
    (graphNodeId: string): PipelineStageId => {
      const state = byGraphNodeId.get(graphNodeId);
      return state ? reachedStage(state) : "constellations";
    },
    [byGraphNodeId],
  );

  const countAt = useCallback(
    (stage: PipelineStageId): number => {
      const threshold = stageIndex(stage);
      let count = 0;
      for (const state of byGraphNodeId.values()) {
        if (stageIndex(reachedStage(state)) >= threshold) count += 1;
      }
      return count;
    },
    [byGraphNodeId],
  );

  const candidatePlaces = useMemo(
    () => candidatePlacesFromTimeline(timeline),
    [timeline],
  );

  return {
    byGraphNodeId,
    reachedStageFor,
    countAt,
    candidatePlaces,
    refresh,
  };
}

// apps/desktop/src/features/pipeline/pipelineStages.ts
//
// Stage-state model for the canvas pipeline (refinement-2 D6, task 9):
// Constellations → Timeline → Places → Stories → Palace.
//
// The rail is a navigation + action surface, NOT a new store: every stage
// signal is derived from the existing stores through the real transport
// contracts (timeline view + LOCATED_AT relationships, profile scenes,
// palace curation). The two-store split is preserved — nothing here writes a
// competing ledger.

import type { PalaceCuration } from "@research-canvas/canvas";
import type { TimelineView } from "@research-canvas/desktop-api";
import type { Scene } from "@research-canvas/schema";

export type PipelineStageId =
  | "constellations"
  | "timeline"
  | "places"
  | "stories"
  | "palace";

export const PIPELINE_STAGE_ORDER: PipelineStageId[] = [
  "constellations",
  "timeline",
  "places",
  "stories",
  "palace",
];

export interface PipelineStageMeta {
  id: PipelineStageId;
  /** The shell lens whose surface renders this stage. */
  lens: "canvas" | "timeline" | "psychogeographic" | "story" | "palace";
  label: string;
}

export const PIPELINE_STAGES: PipelineStageMeta[] = [
  { id: "constellations", lens: "canvas", label: "Constellations" },
  { id: "timeline", lens: "timeline", label: "Timeline" },
  { id: "places", lens: "psychogeographic", label: "Places" },
  { id: "stories", lens: "story", label: "Stories" },
  { id: "palace", lens: "palace", label: "Palace" },
];

/** An object's position through the pipeline stages (all derived, no ledger). */
export interface ObjectStageState {
  graphNodeId: string;
  title: string;
  timeline: boolean;
  places: boolean;
  stories: boolean;
  palace: boolean;
}

export function stageIndex(stage: PipelineStageId): number {
  return PIPELINE_STAGE_ORDER.indexOf(stage);
}

export function reachedStage(state: ObjectStageState): PipelineStageId {
  if (state.palace) return "palace";
  if (state.stories) return "stories";
  if (state.places) return "places";
  if (state.timeline) return "timeline";
  return "constellations";
}

export function hasReached(
  state: ObjectStageState,
  stage: PipelineStageId,
): boolean {
  return stageIndex(reachedStage(state)) >= stageIndex(stage);
}

/**
 * Derive the stage-state model from real store snapshots.
 *
 * `objects` is the universe of objects being tracked (canvas nodes). The
 * returned map is keyed by graphNodeId and covers exactly those objects.
 */
export function deriveStageState(
  objects: Array<{ graphNodeId: string | null; title: string }>,
  timeline: TimelineView | null,
  scenes: Scene[],
  curation: PalaceCuration | null,
): Map<string, ObjectStageState> {
  const timelineIds = new Set<string>();
  const locatedIds = new Set<string>();

  if (timeline) {
    const nodesById = new Map(
      timeline.nodes.map((record) => [record.node.graphNodeId, record.node]),
    );
    for (const record of timeline.nodes) {
      // Relation companions are atemporal endpoints (e.g. a gazetted place)
      // shown beside a dated event. They are NOT objects that have passed
      // through the timeline stage themselves.
      if (!record.relationCompanion) timelineIds.add(record.node.graphNodeId);
    }
    for (const relationship of timeline.relationships) {
      if (relationship.relType !== "LOCATED_AT") continue;
      const source = nodesById.get(relationship.sourceGraphNodeId);
      const target = nodesById.get(relationship.targetGraphNodeId);
      const place =
        source?.entityType === "Place"
          ? source
          : target?.entityType === "Place"
            ? target
            : null;
      const event =
        source?.entityType === "Place" ? target : target?.entityType === "Place" ? source : null;
      if (place && event) locatedIds.add(event.graphNodeId);
    }
  }

  const storyIds = new Set<string>();
  for (const scene of scenes) {
    for (const person of scene.people) storyIds.add(person.graphNodeId);
    if (scene.placeFrame.placeId) storyIds.add(scene.placeFrame.placeId);
  }

  const palaceIds = new Set<string>();
  if (curation) {
    for (const placement of curation.objects) {
      if (placement.graphNodeId) palaceIds.add(placement.graphNodeId);
      palaceIds.add(placement.objectId);
    }
  }

  const states = new Map<string, ObjectStageState>();
  for (const object of objects) {
    if (!object.graphNodeId) continue;
    states.set(object.graphNodeId, {
      graphNodeId: object.graphNodeId,
      title: object.title,
      timeline: timelineIds.has(object.graphNodeId) || locatedIds.has(object.graphNodeId),
      places: locatedIds.has(object.graphNodeId),
      stories: storyIds.has(object.graphNodeId),
      palace: palaceIds.has(object.graphNodeId),
    });
  }
  return states;
}

/**
 * Candidate Temporal Places for the "Locate" action: real Place nodes surfaced
 * by the timeline view (relation companions of LOCATED_AT relationships).
 */
export function candidatePlacesFromTimeline(
  timeline: TimelineView | null,
): Array<{ graphNodeId: string; title: string }> {
  if (!timeline) return [];
  const seen = new Set<string>();
  const places: Array<{ graphNodeId: string; title: string }> = [];
  for (const record of timeline.nodes) {
    const node = record.node;
    if (node.entityType !== "Place") continue;
    if (seen.has(node.graphNodeId)) continue;
    seen.add(node.graphNodeId);
    places.push({ graphNodeId: node.graphNodeId, title: node.title });
  }
  return places.sort((a, b) => a.title.localeCompare(b.title));
}

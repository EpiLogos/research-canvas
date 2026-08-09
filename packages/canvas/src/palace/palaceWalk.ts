import type { SceneSequence } from "@research-canvas/schema";

import type { PalaceCuration } from "./curation";

/**
 * Palace walks (vision §3.12): a curated sequence of chambers that reuses the
 * scene-sequence machinery — the walk is a scene sequence whose place frames
 * are chamber anchors. Guided recall is a viewing mode over the same walk,
 * never a separate surface.
 */
export interface PalaceWalkStop {
  chamberId: string;
  anchorGraphNodeId: string;
  title: string;
  memberCount: number;
}

export type PalaceViewMode = "explore" | "recall";

export interface PalaceWalk {
  sequenceId: string;
  profileScope: string;
  stops: PalaceWalkStop[];
  mode: PalaceViewMode;
}

export function assemblePalaceWalk(
  sequence: SceneSequence,
  curation: PalaceCuration,
  memberCounts: Map<string, number>,
  mode: PalaceViewMode = "explore",
): PalaceWalk {
  const chambersById = new Map(
    curation.chambers.map((chamber) => [chamber.candidateId, chamber]),
  );
  const stops: PalaceWalkStop[] = [];
  for (const sceneId of sequence.sceneIds) {
    const chamber = chambersById.get(sceneId);
    if (!chamber || chamber.excluded) continue;
    stops.push({
      chamberId: chamber.candidateId,
      anchorGraphNodeId: chamber.anchorGraphNodeId,
      title: chamber.title,
      memberCount: memberCounts.get(chamber.candidateId) ?? 0,
    });
  }
  return {
    sequenceId: sequence.id,
    profileScope: sequence.profileScope,
    stops,
    mode,
  };
}

/** In guided recall the palace reveals stops one at a time in walk order. */
export function recallRevealCount(walk: PalaceWalk, revealed: number): number {
  if (walk.mode !== "recall") return walk.stops.length;
  return Math.max(0, Math.min(revealed, walk.stops.length));
}

import type {
  GraphNode,
} from "@research-canvas/desktop-api";
import type { Scene, SceneSequence } from "@research-canvas/schema";

import type { ChamberCandidate } from "./clustering";
import { walkableChambers, type PalaceCuration } from "./curation";

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

/**
 * The palace walk as real scene-sequence data: each walkable chamber with a
 * temporal anchor becomes a scene whose place frame is the chamber anchor
 * (vision §3.12 — palace walks reuse the scene-sequence machinery). Chambers
 * anchored to non-temporal nodes are excluded from the exported sequence with
 * an explicit report rather than being invented into a time window.
 */
export function buildPalaceWalkScenes(
  curation: PalaceCuration,
  candidates: ChamberCandidate[],
  nodesById: Map<string, GraphNode>,
  profileScope: string,
): { scenes: Scene[]; skippedChambers: string[] } {
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const now = new Date().toISOString();
  const scenes: Scene[] = [];
  const skippedChambers: string[] = [];
  for (const chamber of walkableChambers(curation)) {
    const candidate = candidateById.get(chamber.candidateId);
    const anchor = candidate
      ? nodesById.get(candidate.anchorGraphNodeId)
      : undefined;
    if (!anchor || !anchor.isTemporal || !anchor.validFrom) {
      skippedChambers.push(chamber.title);
      continue;
    }
    scenes.push({
      id: `palace:${chamber.candidateId}`,
      profileScope,
      placeFrame: {
        placeId: anchor.graphNodeId,
        validAt: { instant: anchor.validFrom },
      },
      timeWindow: {
        start: anchor.validFrom,
        end: anchor.validTo ?? anchor.validFrom,
      },
      people: [],
      passages: [],
      consents: [],
      redactions: [],
      languageVariants: [],
      title: chamber.title,
      assembledBy: "agent",
      curationEvents: [],
      nestedSequenceIds: [],
      createdAt: now,
      updatedAt: now,
    });
  }
  return { scenes, skippedChambers };
}

export function buildPalaceWalkSequence(
  curation: PalaceCuration,
  scenes: Scene[],
  profileScope: string,
): SceneSequence {
  const now = new Date().toISOString();
  const walkable = walkableChambers(curation);
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const orderedIds = walkable
    .map((chamber) => `palace:${chamber.candidateId}`)
    .filter((id) => sceneIds.has(id));
  return {
    id: `palace-walk:${profileScope}`,
    profileScope,
    name: `${profileScope} palace walk`,
    sceneIds: orderedIds,
    createdAt: now,
    updatedAt: now,
  };
}

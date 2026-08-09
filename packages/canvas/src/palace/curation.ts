import type { GraphNode } from "@research-canvas/desktop-api";

import type { ChamberCandidate } from "./clustering";
import { chamberTitle } from "./clustering";

/**
 * Mind palace curation (vision §3.12): authoring is curation, not
 * construction — pin, exclude, rename, reorder chambers. Curation lives in a
 * separate layer over the derived candidates; the raw graph is never touched.
 */
export interface CuratedChamber {
  candidateId: string;
  anchorGraphNodeId: string;
  title: string;
  pinned: boolean;
  excluded: boolean;
  position: number;
}

export interface PalaceCuration {
  chambers: CuratedChamber[];
}

export function curateChambers(
  candidates: ChamberCandidate[],
  nodesById: Map<string, GraphNode>,
  profileScope: string,
): PalaceCuration {
  return {
    chambers: candidates.map((candidate, position) => ({
      candidateId: candidate.id,
      anchorGraphNodeId: candidate.anchorGraphNodeId,
      title: chamberTitle(
        nodesById.get(candidate.anchorGraphNodeId) ?? {
          graphNodeId: candidate.anchorGraphNodeId,
          title: candidate.anchorGraphNodeId,
          entityType: "Work",
        } as GraphNode,
        profileScope,
      ),
      pinned: false,
      excluded: false,
      position,
    })),
  };
}

export function pinChamber(
  curation: PalaceCuration,
  candidateId: string,
): PalaceCuration {
  return mapChamber(curation, candidateId, (chamber) => ({
    ...chamber,
    pinned: true,
  }));
}

export function excludeChamber(
  curation: PalaceCuration,
  candidateId: string,
): PalaceCuration {
  return mapChamber(curation, candidateId, (chamber) => ({
    ...chamber,
    excluded: true,
  }));
}

export function renameChamber(
  curation: PalaceCuration,
  candidateId: string,
  title: string,
): PalaceCuration {
  if (title.trim() === "") {
    throw new Error("chamber title must not be blank");
  }
  return mapChamber(curation, candidateId, (chamber) => ({
    ...chamber,
    title: title.trim(),
  }));
}

/** Reorders by moving the chamber to `position` (0-based). */
export function reorderChamber(
  curation: PalaceCuration,
  candidateId: string,
  position: number,
): PalaceCuration {
  const withoutTarget = curation.chambers.filter(
    (chamber) => chamber.candidateId !== candidateId,
  );
  if (withoutTarget.length === curation.chambers.length) {
    throw new Error(`unknown chamber ${candidateId}`);
  }
  const target = curation.chambers.find(
    (chamber) => chamber.candidateId === candidateId,
  )!;
  const clamped = Math.max(0, Math.min(position, withoutTarget.length));
  const chambers = [...withoutTarget];
  chambers.splice(clamped, 0, target);
  return { chambers: chambers.map((chamber, index) => ({ ...chamber, position: index })) };
}

/** The walkable palace: ordered, non-excluded chambers (pinned first). */
export function walkableChambers(curation: PalaceCuration): CuratedChamber[] {
  return [...curation.chambers]
    .filter((chamber) => !chamber.excluded)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.position - b.position;
    });
}

function mapChamber(
  curation: PalaceCuration,
  candidateId: string,
  update: (chamber: CuratedChamber) => CuratedChamber,
): PalaceCuration {
  let found = false;
  const chambers = curation.chambers.map((chamber) => {
    if (chamber.candidateId !== candidateId) return chamber;
    found = true;
    return update(chamber);
  });
  if (!found) {
    throw new Error(`unknown chamber ${candidateId}`);
  }
  return { chambers };
}

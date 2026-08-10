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

/** The six named faces of a cube room (the six-face memory-palace pattern). */
export type PalaceFaceId =
  | "north"
  | "south"
  | "east"
  | "west"
  | "floor"
  | "ceiling";

export type PalaceObjectKind =
  | "event"
  | "place"
  | "image"
  | "storyScene"
  | "compressedConstellation";

/** A placeable palace object: events, places, images, and story scenes become
 * objects from a palette; placement (position/rotation/scale on floor, plinth,
 * or fixture) persists in the layout store. Placement is curation, never a
 * graph write. */
export interface PalaceObjectPlacement {
  objectId: string;
  roomId: string;
  kind: PalaceObjectKind;
  title: string;
  graphNodeId: string | null;
  contentRef: string | null;
  placement: {
    surface: "floor" | "plinth" | "fixture";
    position: { x: number; y: number; z: number };
    rotationY: number;
    scale: number;
    face?: PalaceFaceId;
  };
}

export type PalaceFixtureKind = "imageFrame" | "textPanel" | "titlePlaque";

/** A wall fixture mounted to a named wall face, derived from graph content
 * (image frames, text panels, title plaques) and curated like objects. */
export interface PalaceFixture {
  fixtureId: string;
  roomId: string;
  kind: PalaceFixtureKind;
  face: PalaceFaceId;
  title: string;
  contentRef: string | null;
  sourceGraphNodeId: string | null;
}

/** A collection fixture (shelf / alcove / wall section) grouping a coherent
 * set of objects. Collections derive from graph structure (relationship kind,
 * entity type, cluster membership) and are rename/reorder/populate-curatable.
 * The palace reads as a library. */
export interface PalaceCollection {
  collectionId: string;
  roomId: string;
  title: string;
  objectIds: string[];
  position: { shelf: number; row: number };
}

export interface PalaceCuration {
  chambers: CuratedChamber[];
  /** Placement edits; empty means "use the generated defaults". */
  objects: PalaceObjectPlacement[];
  fixtures: PalaceFixture[];
  collections: PalaceCollection[];
}

export function emptyPalaceLayout(): Pick<
  PalaceCuration,
  "objects" | "fixtures" | "collections"
> {
  return { objects: [], fixtures: [], collections: [] };
}

export function applyPalaceLayoutOverrides(
  curation: PalaceCuration,
  overrides: Pick<PalaceCuration, "objects" | "fixtures" | "collections">,
): PalaceCuration {
  return {
    ...curation,
    objects: overrides.objects,
    fixtures: overrides.fixtures,
    collections: overrides.collections,
  };
}

/** Merge an object placement into the curation (upsert by objectId+roomId). */
export function placePalaceObject(
  curation: PalaceCuration,
  placement: PalaceObjectPlacement,
): PalaceCuration {
  const index = curation.objects.findIndex(
    (existing) =>
      existing.objectId === placement.objectId &&
      existing.roomId === placement.roomId,
  );
  const objects = [...curation.objects];
  if (index === -1) {
    objects.push(placement);
  } else {
    objects[index] = placement;
  }
  return { ...curation, objects };
}

/** Remove an object placement from the curation. */
export function removePalaceObject(
  curation: PalaceCuration,
  objectId: string,
  roomId: string,
): PalaceCuration {
  return {
    ...curation,
    objects: curation.objects.filter(
      (placement) =>
        !(placement.objectId === objectId && placement.roomId === roomId),
    ),
    collections: curation.collections.map((collection) => ({
      ...collection,
      objectIds: collection.objectIds.filter(
        (id) => !(collection.roomId === roomId && id === objectId),
      ),
    })),
  };
}

/** Rename a collection (curatable). */
export function renamePalaceCollection(
  curation: PalaceCuration,
  collectionId: string,
  title: string,
): PalaceCuration {
  if (title.trim() === "") {
    throw new Error("collection title must not be blank");
  }
  return {
    ...curation,
    collections: curation.collections.map((collection) =>
      collection.collectionId === collectionId
        ? { ...collection, title: title.trim() }
        : collection,
    ),
  };
}

/** Reorder a collection's member object ids (curatable). */
export function reorderPalaceCollection(
  curation: PalaceCuration,
  collectionId: string,
  objectIds: string[],
): PalaceCuration {
  return {
    ...curation,
    collections: curation.collections.map((collection) =>
      collection.collectionId === collectionId
        ? { ...collection, objectIds }
        : collection,
    ),
  };
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
    objects: [],
    fixtures: [],
    collections: [],
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
  return {
    ...curation,
    chambers: chambers.map((chamber, index) => ({ ...chamber, position: index })),
  };
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
  return { ...curation, chambers };
}

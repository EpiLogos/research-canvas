import type { Scene, SceneSequence } from "@research-canvas/schema";
import type { GazetteerEntry, GazetteerIndex } from "@research-canvas/geography";

/** One stop of a psychogeographic walk: a scene's place frame resolved
 * against the offline gazetteer (vision §3.7, §3.15). Unlocated places still
 * produce a stop — the walk is never silently dropped, and the map marks it
 * as unlocated instead of inventing a point. */
export interface WalkStop {
  sceneId: string;
  placeId: string;
  /** The human-readable validAt of the place frame. */
  validAt: string;
  title: string;
  coordinate: { latitude: number; longitude: number } | null;
  gazetteerEntry: GazetteerEntry | null;
  located: boolean;
  /** Explicit waypoints for a non-great-circle route segment *from this
   * stop to the next located stop* (refinement-2 D1, task-2 step 5). */
  controlPoints?: Array<{ latitude: number; longitude: number }>;
}

export function assembleWalk(
  sequence: SceneSequence,
  scenes: Scene[],
  gazetteer: GazetteerIndex,
): WalkStop[] {
  const scenesById = new Map(scenes.map((scene) => [scene.id, scene]));
  const stops: WalkStop[] = [];
  for (const sceneId of sequence.sceneIds) {
    const scene = scenesById.get(sceneId);
    if (!scene) continue;
    const placeId = scene.placeFrame.placeId;
    const entry = gazetteer.resolveById(placeId);
    const coordinate =
      entry?.latitude !== undefined && entry.longitude !== undefined
        ? { latitude: entry.latitude, longitude: entry.longitude }
        : null;
    stops.push({
      sceneId,
      placeId,
      validAt: formatValidAt(scene.placeFrame.validAt),
      title: scene.title ?? placeId,
      coordinate,
      gazetteerEntry: entry ?? null,
      located: coordinate !== null,
    });
  }
  return stops;
}

/** Ordered point geometry of the walk, dropping unlocated stops rather than
 * guessing a path through them. */
export function walkPathGeometry(stops: WalkStop[]): Array<{
  latitude: number;
  longitude: number;
}> {
  const path: Array<{ latitude: number; longitude: number }> = [];
  for (const stop of stops) {
    if (stop.coordinate) path.push(stop.coordinate);
  }
  return path;
}

function formatValidAt(
  validAt: Scene["placeFrame"]["validAt"],
): string {
  return "instant" in validAt
    ? validAt.instant
    : `${validAt.start}–${validAt.end}`;
}

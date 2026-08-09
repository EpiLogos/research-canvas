import type {
  GraphNode,
  WorkspaceTransport,
} from "@research-canvas/desktop-api";
import type { GazetteerIndex } from "@research-canvas/geography";
import type { Scene, SceneSequence } from "@research-canvas/schema";
import { assembleWalk, type WalkStop } from "@research-canvas/canvas";

/**
 * Agent assembly of psychogeographic walks (vision §3.7/§3.15): temporal
 * graph nodes with a LOCATED_AT relation become candidate scenes whose place
 * frame resolves against the offline gazetteer; unmatched places still appear
 * as unlocated stops — the walk is never silently dropped. Assembly only
 * writes to the profile scene store; the raw graph is untouched.
 */

export interface AssembleWalkInput {
  transport: WorkspaceTransport;
  databasePath: string;
  workspaceId: string;
  profileScope: string;
  gazetteer: GazetteerIndex;
}

export interface AssembledWalkResult {
  sequence: SceneSequence | null;
  stops: WalkStop[];
  assembledSceneCount: number;
  unmatchedPlaces: string[];
}

export async function assembleProfileWalk(
  input: AssembleWalkInput,
): Promise<AssembledWalkResult> {
  const view = await input.transport.loadTimelineView({
    workspaceId: input.workspaceId,
  });
  const nodesById = new Map(
    view.nodes.map((record) => [record.node.graphNodeId, record.node]),
  );

  const candidates: Array<{ event: GraphNode; place: GraphNode }> = [];
  const unmatchedPlaces: string[] = [];
  for (const relationship of view.relationships) {
    if (relationship.relType !== "LOCATED_AT") continue;
    const source = nodesById.get(relationship.sourceGraphNodeId);
    const target = nodesById.get(relationship.targetGraphNodeId);
    if (!source || !target) continue;
    const event = source.entityType === "Place" ? target : source;
    const place = source.entityType === "Place" ? source : target;
    if (place.entityType !== "Place") continue;
    if (!event.isTemporal || !event.validFrom) continue;
    candidates.push({ event, place });
  }

  const now = new Date().toISOString();
  const scenes: Scene[] = [];
  const seen = new Set<string>();
  for (const { event, place } of candidates.sort((a, b) =>
    (a.event.validFrom ?? "").localeCompare(b.event.validFrom ?? ""),
  )) {
    if (seen.has(event.graphNodeId)) continue;
    seen.add(event.graphNodeId);
    const validFrom = event.validFrom;
    if (!validFrom) continue;
    const entry = gazetteerEntryForPlace(input.gazetteer, place.title);
    if (!entry) {
      unmatchedPlaces.push(place.title);
    }
    const windowEnd = event.validTo ?? validFrom;
    const scene: Scene = {
      id: `walk:${event.graphNodeId}`,
      profileScope: input.profileScope,
      placeFrame: {
        placeId: entry?.id ?? place.graphNodeId,
        validAt: { instant: validFrom },
      },
      timeWindow: { start: validFrom, end: windowEnd },
      people: [],
      passages: [],
      consents: [],
      redactions: [],
      languageVariants: [],
      title: event.title,
      assembledBy: "agent",
      curationEvents: [],
      nestedSequenceIds: [],
      createdAt: now,
      updatedAt: now,
    };
    scenes.push(scene);
    await input.transport.upsertScene({
      databasePath: input.databasePath,
      scene,
    });
  }

  const sequence: SceneSequence = {
    id: `walk:${input.profileScope}`,
    profileScope: input.profileScope,
    name: `${input.profileScope} psychogeographic walk`,
    sceneIds: scenes.map((scene) => scene.id),
    createdAt: now,
    updatedAt: now,
  };
  await input.transport.upsertSceneSequence({
    databasePath: input.databasePath,
    sequence,
  });

  const stops = assembleWalk(sequence, scenes, input.gazetteer);
  return {
    sequence: scenes.length > 0 ? sequence : null,
    stops,
    assembledSceneCount: scenes.length,
    unmatchedPlaces: [...new Set(unmatchedPlaces)],
  };
}

export function gazetteerEntryForPlace(
  gazetteer: GazetteerIndex,
  placeTitle: string,
) {
  const exact = gazetteer.searchByName(placeTitle, { language: "en", limit: 1 });
  if (exact.length > 0) return exact[0];
  const anyLanguage = gazetteer.searchByName(placeTitle, { limit: 1 });
  return anyLanguage[0] ?? null;
}

export async function loadProfileWalks(
  input: AssembleWalkInput,
): Promise<Array<{ sequence: SceneSequence; stops: WalkStop[] }>> {
  const [sequences, scenes] = await Promise.all([
    input.transport.listSceneSequences({
      databasePath: input.databasePath,
      profileScope: input.profileScope,
    }),
    input.transport.listScenes({
      databasePath: input.databasePath,
      profileScope: input.profileScope,
    }),
  ]);
  return sequences.map((sequence) => ({
    sequence,
    stops: assembleWalk(sequence, scenes, input.gazetteer),
  }));
}

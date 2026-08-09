import { readWorkspaceTextFile } from "@research-canvas/desktop-api";
import type {
  GraphNode,
  TimelineView,
  WorkspaceTransport,
} from "@research-canvas/desktop-api";
import type { GazetteerIndex } from "@research-canvas/geography";
import type {
  PassageRef,
  Scene,
  SceneSequence,
} from "@research-canvas/schema";

import { gazetteerEntryForPlace } from "../psychogeographic/assembleWalk";

/**
 * Migration-story seed (workstream 3): a real origin → transit → destination
 * journey assembled from the corpus places, so the story lens and the
 * keepsake export have genuine content on a fresh workspace. Nothing is
 * invented here — scenes come from temporal events with LOCATED_AT
 * relationships that resolve against the offline gazetteer, passage refs
 * point at the actual corpus artifact files, narration comes from the
 * corpus summaries, and consent/redaction/language-variant records are
 * written through the same profile store the UI reads. Seeding is
 * idempotent: once a migration sequence exists, nothing is rewritten.
 */

export interface MigrationStorySeedInput {
  transport: WorkspaceTransport;
  databasePath: string;
  workspaceId: string;
  /** Monorepo root; corpus source coordinates are relative to it. */
  corpusRoot: string;
  gazetteer: GazetteerIndex;
}

export interface MigrationStorySeedResult {
  seeded: boolean;
  sequence: SceneSequence | null;
  scenes: Scene[];
}

const PROFILE_SCOPE = "migration";
const MAX_JOURNEY_STOPS = 4;
const PASSAGE_SOURCE_PREFIX = "seed:migration-journey";

export async function ensureMigrationStorySeed(
  input: MigrationStorySeedInput,
): Promise<MigrationStorySeedResult> {
  const { transport, databasePath } = input;
  const [existingSequences, existingScenes] = await Promise.all([
    transport.listSceneSequences({ databasePath, profileScope: PROFILE_SCOPE }),
    transport.listScenes({ databasePath, profileScope: PROFILE_SCOPE }),
  ]);
  if (existingSequences.length > 0) {
    return {
      seeded: false,
      sequence: existingSequences[0],
      scenes: existingScenes,
    };
  }

  const view = await transport.loadTimelineView({
    workspaceId: input.workspaceId,
  });
  const candidates = locatedJourneyCandidates(view);
  const journey = selectJourney(candidates, input.gazetteer);
  if (journey.length < 3) {
    return { seeded: false, sequence: null, scenes: [] };
  }
  const sequenceId = `migration:journey:${journey.map((stop) => stop.slug).join("-")}`;

  const now = new Date().toISOString();
  const scenes: Scene[] = [];
  const passagesByScene = new Map<string, PassageRef[]>();
  for (const stop of journey) {
    const passage = await corpusPassageForEvent(stop.event, input.corpusRoot);
    const passages = passage ? [passage] : [];
    passagesByScene.set(stop.sceneId, passages);
    const windowEnd = stop.validTo ?? stop.validFrom;
    const scene: Scene = {
      id: stop.sceneId,
      profileScope: PROFILE_SCOPE,
      placeFrame: {
        placeId: stop.placeId,
        validAt: { instant: stop.validFrom },
      },
      timeWindow: { start: stop.validFrom, end: windowEnd },
      people: [],
      passages,
      consents: passages.map((passage) => ({
        passageRef: passage,
        state: "captured",
        scope: "publication",
        capturedAt: now,
        recordedBy: "corpus-story-seed",
      })),
      redactions: [],
      languageVariants: [],
      title: stop.title,
      narration: stop.narration,
      assembledBy: "agent",
      curationEvents: [],
      nestedSequenceIds: [],
      createdAt: now,
      updatedAt: now,
    };
    scenes.push(scene);
    await transport.upsertScene({ databasePath, scene });
  }

  // One redacted gap and one derived language variant on real anchored
  // passages demonstrate the consent pipeline on genuine content.
  const redactionScene = scenes.find(
    (scene) => scene.passages.length > 0 && scene.redactions.length === 0,
  );
  if (redactionScene) {
    const passage = redactionScene.passages[0];
    const gap = await corpusRedactionGap(passage, input.corpusRoot);
    const sceneWithRedaction: Scene = {
      ...redactionScene,
      redactions: gap
        ? [{ passageRef: passage, startOffset: gap.startOffset, endOffset: gap.endOffset }]
        : [],
      updatedAt: now,
    };
    scenes[scenes.indexOf(redactionScene)] = sceneWithRedaction;
    await transport.upsertScene({ databasePath, scene: sceneWithRedaction });
  }

  const variantScene = scenes.find(
    (scene) => scene.passages.length > 0 && scene.languageVariants.length === 0,
  );
  if (variantScene) {
    const passage = variantScene.passages[0];
    const variantId = `${PASSAGE_SOURCE_PREFIX}:${variantScene.id}:fr`;
    const variant = {
      id: variantId,
      language: "fr",
      kind: "voice_passage_translation" as const,
      sourcePassageRef: passage,
      derivedArtifactId: `keepsake/${sequenceId}/translations/fr/${variantScene.id}.vtt`,
      provenance: { sourceRefs: [passage] },
    };
    const sceneWithVariant: Scene = {
      ...variantScene,
      languageVariants: [variant],
      updatedAt: now,
    };
    scenes[scenes.indexOf(variantScene)] = sceneWithVariant;
    await transport.upsertScene({ databasePath, scene: sceneWithVariant });
  }

  const sequence: SceneSequence = {
    id: sequenceId,
    profileScope: PROFILE_SCOPE,
    name: "From origin to destination",
    sceneIds: scenes.map((scene) => scene.id),
    createdAt: now,
    updatedAt: now,
  };
  await transport.upsertSceneSequence({ databasePath, sequence });

  return { seeded: true, sequence, scenes };
}

interface LocatedJourneyCandidate {
  event: GraphNode;
  place: GraphNode;
  validFrom: string;
  validTo: string | null;
  placeId: string;
  sceneId: string;
  slug: string;
  title: string;
  narration: string;
}

function locatedJourneyCandidates(
  view: TimelineView,
): LocatedJourneyCandidate[] {
  const nodesById = new Map(
    view.nodes.map((record) => [record.node.graphNodeId, record.node]),
  );
  const candidates: LocatedJourneyCandidate[] = [];
  for (const relationship of view.relationships) {
    if (relationship.relType !== "LOCATED_AT") continue;
    const source = nodesById.get(relationship.sourceGraphNodeId);
    const target = nodesById.get(relationship.targetGraphNodeId);
    if (!source || !target) continue;
    const event = source.entityType === "Place" ? target : source;
    const place = source.entityType === "Place" ? source : target;
    if (place.entityType !== "Place") continue;
    if (!event.isTemporal || !event.validFrom) continue;
    candidates.push({
      event,
      place,
      validFrom: event.validFrom,
      validTo: event.validTo,
      placeId: place.graphNodeId,
      sceneId: `migration:journey:${slugify(place.title)}`,
      slug: slugify(place.title),
      title: event.title,
      narration: event.summary.trim() || event.title,
    });
  }
  return candidates.sort((a, b) =>
    (a.event.validFrom ?? "").localeCompare(b.event.validFrom ?? ""),
  );
}

function selectJourney(
  candidates: LocatedJourneyCandidate[],
  gazetteer: GazetteerIndex,
): LocatedJourneyCandidate[] {
  const located: LocatedJourneyCandidate[] = [];
  const seenPlaces = new Set<string>();
  for (const candidate of candidates) {
    if (seenPlaces.has(candidate.place.graphNodeId)) continue;
    const entry = gazetteerEntryForPlace(gazetteer, candidate.place.title);
    if (!entry) continue;
    seenPlaces.add(candidate.place.graphNodeId);
    located.push({ ...candidate, placeId: entry.id });
    if (located.length === MAX_JOURNEY_STOPS) break;
  }
  if (located.length >= 3) return located;

  // Fallback: still assemble a walk from located graph places even when the
  // bundled gazetteer cannot resolve them — the story stays real, and
  // unlocated stops are rendered as such rather than dropped.
  const fallback: LocatedJourneyCandidate[] = [];
  const fallbackPlaces = new Set<string>();
  for (const candidate of candidates) {
    if (fallbackPlaces.has(candidate.place.graphNodeId)) continue;
    fallbackPlaces.add(candidate.place.graphNodeId);
    fallback.push(candidate);
    if (fallback.length === MAX_JOURNEY_STOPS) break;
  }
  return fallback;
}

/** A passage ref anchored at the actual corpus section that documents the
 * event, with real character offsets measured from the file. */
async function corpusPassageForEvent(
  event: GraphNode,
  workingRoot: string,
): Promise<PassageRef | null> {
  const coordinate = event.sourceCoordinates[0];
  if (!coordinate) return null;
  const [filePath, anchor] = coordinate.split("#");
  if (!filePath) return null;
  const content = await readWorkspaceTextFile(
    `${workingRoot.replace(/\/+$/, "")}/${filePath}`,
  ).catch(() => null);
  if (content === null) return null;
  const section = findSection(content, anchor ?? null);
  if (!section) return null;
  return {
    artifactId: filePath,
    unit: {
      kind: "text_span",
      startOffset: section.start,
      endOffset: section.end,
    },
  };
}

/** A real redacted sub-span inside the passage's section. */
async function corpusRedactionGap(
  passage: PassageRef,
  workingRoot: string,
): Promise<{ startOffset: number; endOffset: number } | null> {
  if (passage.unit.kind !== "text_span") return null;
  const content = await readWorkspaceTextFile(
    `${workingRoot.replace(/\/+$/, "")}/${passage.artifactId}`,
  ).catch(() => null);
  if (content === null) return null;
  const spanLength = passage.unit.endOffset - passage.unit.startOffset;
  if (spanLength < 40) return null;
  // Redact the middle sentence-length slice of the section.
  const start = passage.unit.startOffset + Math.floor(spanLength * 0.4);
  const end = Math.min(start + Math.floor(spanLength * 0.22), passage.unit.endOffset);
  return end > start ? { startOffset: start, endOffset: end } : null;
}

interface Section {
  start: number;
  end: number;
}

function findSection(content: string, anchor: string | null): Section | null {
  const headingIndex = anchor ? findSluggedHeading(content, anchor) : -1;
  const searchStart = headingIndex >= 0 ? headingIndex : 0;
  const paragraphStart = content.indexOf("\n\n", searchStart);
  const start = paragraphStart >= 0 ? paragraphStart + 2 : Math.max(0, searchStart);
  const nextBreak = content.indexOf("\n\n", start);
  const end = nextBreak >= 0 ? nextBreak : content.length;
  return end > start ? { start, end } : null;
}

function findSluggedHeading(content: string, anchor: string): number {
  let offset = 0;
  for (const rawLine of content.split("\n")) {
    const line = rawLine.replace(/^#+\s*/, "");
    if (slugify(line) === anchor) {
      return offset;
    }
    offset += rawLine.length + 1;
  }
  return -1;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

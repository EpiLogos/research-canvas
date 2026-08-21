import type {
  StoryAuthoringScene,
  StoryJourney,
  StoryNodeOption,
  StoryRepository,
  StorySceneInput,
  StoryTransition,
} from "@research-canvas/domain";
import type {
  FetchRecord,
  GraphNode,
  Scene,
  SceneSequence,
  StreetViewImageRecord,
  WorkspaceServices,
} from "@research-canvas/desktop-api";

const STORY_PREFIX = "story:";
const STORY_METADATA_KIND = "story-authoring-v1";
const STORY_METADATA_PREFIX = `${STORY_METADATA_KIND}:`;

interface StoryMetadata {
  kind: typeof STORY_METADATA_KIND;
  journeyId: string;
  nodeIds: string[];
  mediaAssetIds: string[];
  transition: StoryTransition;
  durationMs: number;
}

/**
 * Desktop Story adapter over the existing durable SQLite scene store.
 *
 * The canonical Scene remains the place/time/passage authority. Story-only
 * authoring choices (extra node/media references, transition, duration) are a
 * derived curation detail on that Scene, so T13 does not fork a second scene
 * database or weaken the consent/publication model already built on Scenes.
 */
export class DesktopStoryRepository implements StoryRepository {
  constructor(
    private readonly transport: WorkspaceServices,
    private readonly databasePath: string,
    private readonly workspaceId: string,
    private readonly profileScope: string,
  ) {}

  async listJourneys(constellationId: string): Promise<StoryJourney[]> {
    this.assertConstellation(constellationId);
    const sequences = await this.transport.listSceneSequences({
      databasePath: this.databasePath,
      profileScope: this.profileScope,
    });
    return sequences
      .filter((sequence) =>
        sequence.id.startsWith(storySequencePrefix(constellationId))
        // Preserve genuine pre-T13 published journeys as legacy journeys;
        // they are no longer auto-created or implicitly selected.
        || sequence.id.startsWith("migration:journey:"),
      )
      .map((sequence) => journeyFromSequence(sequence, constellationId));
  }

  async createJourney(constellationId: string, title: string): Promise<StoryJourney> {
    this.assertConstellation(constellationId);
    const cleanTitle = title.trim();
    if (!cleanTitle) throw new Error("Story journey title must not be empty");
    const now = new Date().toISOString();
    const sequence: SceneSequence = {
      id: `${storySequencePrefix(constellationId)}${crypto.randomUUID()}`,
      profileScope: this.profileScope,
      name: cleanTitle,
      sceneIds: [],
      createdAt: now,
      updatedAt: now,
    };
    const persisted = await this.transport.upsertSceneSequence({
      databasePath: this.databasePath,
      sequence,
    });
    return journeyFromSequence(persisted, constellationId);
  }

  async getJourneyScenes(journeyId: string): Promise<StoryAuthoringScene[]> {
    const { sequence, scenes } = await this.getCanonicalJourney(journeyId);
    const scenesById = new Map(scenes.map((scene) => [scene.id, scene] as const));
    return sequence.sceneIds.flatMap((sceneId) => {
      const scene = scenesById.get(sceneId);
      return scene ? [authoringSceneFromCanonical(scene, sequence.id)] : [];
    });
  }

  async addScene(journeyId: string, input: StorySceneInput): Promise<StoryAuthoringScene> {
    const { sequence } = await this.getCanonicalJourney(journeyId);
    const normalized = normalizeInput(input);
    const frame = await this.resolveCanonicalFrame(normalized.nodeIds);
    const now = new Date().toISOString();
    const scene: Scene = {
      id: `${journeyId}:scene:${crypto.randomUUID()}`,
      profileScope: this.profileScope,
      placeFrame: {
        placeId: frame.placeGraphNodeId,
        validAt: { instant: frame.start },
      },
      timeWindow: { start: frame.start, end: frame.end },
      people: [],
      passages: [],
      consents: [],
      redactions: [],
      languageVariants: [],
      title: normalized.title,
      narration: normalized.narrationText || undefined,
      assembledBy: "human",
      curationEvents: [storyMetadataEvent(journeyId, normalized, now)],
      nestedSequenceIds: [],
      createdAt: now,
      updatedAt: now,
    };
    const persisted = await this.transport.upsertScene({
      databasePath: this.databasePath,
      scene,
    });
    const nextSequence: SceneSequence = {
      ...sequence,
      sceneIds: [...sequence.sceneIds, persisted.id],
      updatedAt: now,
    };
    await this.transport.upsertSceneSequence({
      databasePath: this.databasePath,
      sequence: nextSequence,
    });
    return authoringSceneFromCanonical(persisted, journeyId);
  }

  async updateScene(sceneId: string, input: StorySceneInput): Promise<StoryAuthoringScene> {
    const existing = await this.transport.getScene({
      databasePath: this.databasePath,
      id: sceneId,
    });
    if (!existing) throw new Error(`Story scene not found: ${sceneId}`);
    const normalized = normalizeInput(input);
    const existingMetadata = readStoryMetadata(existing);
    const journeyId = existingMetadata?.journeyId ?? journeyIdFromSceneId(sceneId);
    if (!journeyId) throw new Error(`Story scene has no journey identity: ${sceneId}`);
    const now = new Date().toISOString();
    const next: Scene = {
      ...existing,
      title: normalized.title,
      narration: normalized.narrationText || undefined,
      assembledBy: "human",
      curationEvents: [
        ...existing.curationEvents.filter((event) => !event.detail?.startsWith(STORY_METADATA_PREFIX)),
        storyMetadataEvent(journeyId, normalized, now),
      ],
      updatedAt: now,
    };
    const persisted = await this.transport.upsertScene({
      databasePath: this.databasePath,
      scene: next,
    });
    return authoringSceneFromCanonical(persisted, journeyId);
  }

  async reorderScenes(journeyId: string, sceneIds: string[]): Promise<void> {
    const { sequence } = await this.getCanonicalJourney(journeyId);
    const existingIds = new Set(sequence.sceneIds);
    if (sceneIds.length !== sequence.sceneIds.length
      || sceneIds.some((id) => !existingIds.has(id))
      || new Set(sceneIds).size !== sceneIds.length) {
      throw new Error("Story scene reorder must contain every journey scene exactly once");
    }
    await this.transport.upsertSceneSequence({
      databasePath: this.databasePath,
      sequence: { ...sequence, sceneIds, updatedAt: new Date().toISOString() },
    });
  }

  async listNodeOptions(constellationId: string): Promise<StoryNodeOption[]> {
    this.assertConstellation(constellationId);
    const document = await this.transport.loadConstellationDocument({
      databasePath: this.databasePath,
      constellationId,
    });
    return document.nodes.map((canvasNode) => {
      const candidate = canvasNode as unknown as {
        id: string;
        graphNodeId?: string | null;
        title?: string;
        graph?: GraphNode | null;
      };
      const graphNodeId = candidate.graphNodeId ?? candidate.graph?.graphNodeId ?? candidate.id;
      return {
        graphNodeId,
        title: candidate.graph?.title ?? candidate.title ?? graphNodeId,
        entityType: candidate.graph?.entityType ?? null,
      };
    });
  }

  async getCanonicalJourney(journeyId: string): Promise<{ sequence: SceneSequence; scenes: Scene[] }> {
    const [sequences, scenes] = await Promise.all([
      this.transport.listSceneSequences({
        databasePath: this.databasePath,
        profileScope: this.profileScope,
      }),
      this.transport.listScenes({
        databasePath: this.databasePath,
        profileScope: this.profileScope,
      }),
    ]);
    const sequence = sequences.find((candidate) => candidate.id === journeyId);
    if (!sequence) throw new Error(`Story journey not found: ${journeyId}`);
    const wanted = new Set(sequence.sceneIds);
    return { sequence, scenes: scenes.filter((scene) => wanted.has(scene.id)) };
  }

  async getPresentationSupport(): Promise<{
    streetImages: StreetViewImageRecord[];
    fetchRecords: FetchRecord[];
  }> {
    const [streetImages, fetchRecords] = await Promise.all([
      this.transport.listStreetViewImages({
        databasePath: this.databasePath,
        profileScope: this.profileScope,
      }),
      this.transport.listFetchRecords({
        databasePath: this.databasePath,
        profileScope: this.profileScope,
      }),
    ]);
    return { streetImages, fetchRecords };
  }

  async writeKeepsakeBundle(input: Parameters<WorkspaceServices["writeKeepsakeBundle"]>[0]) {
    return this.transport.writeKeepsakeBundle(input);
  }

  private async resolveCanonicalFrame(preferredNodeIds: string[]): Promise<{
    placeGraphNodeId: string;
    start: string;
    end: string;
  }> {
    const view = await this.transport.loadTimelineView({ workspaceId: this.workspaceId });
    const nodesById = new Map(
      view.nodes.map((record) => [record.node.graphNodeId, record.node] as const),
    );
    const preferred = new Set(preferredNodeIds);
    const ordered = [
      ...view.nodes.filter((record) => preferred.has(record.node.graphNodeId)),
      ...view.nodes.filter((record) => !preferred.has(record.node.graphNodeId)),
    ];
    for (const record of ordered) {
      const start = record.node.validFrom;
      if (!start) continue;
      const locatedAt = view.relationships.find((relationship) =>
        relationship.relType === "LOCATED_AT"
        && (relationship.sourceGraphNodeId === record.node.graphNodeId
          || relationship.targetGraphNodeId === record.node.graphNodeId),
      );
      if (!locatedAt) continue;
      const placeGraphNodeId = locatedAt.sourceGraphNodeId === record.node.graphNodeId
        ? locatedAt.targetGraphNodeId
        : locatedAt.sourceGraphNodeId;
      if (nodesById.get(placeGraphNodeId)?.entityType !== "Place") continue;
      return {
        placeGraphNodeId,
        start,
        end: record.node.validTo ?? start,
      };
    }
    throw new Error(
      "Story scenes require a canonically located temporal node; none is available in this project.",
    );
  }

  private assertConstellation(constellationId: string): void {
    if (!constellationId.trim()) throw new Error("Story constellationId must not be empty");
  }
}

function storySequencePrefix(constellationId: string): string {
  return `${STORY_PREFIX}${encodeURIComponent(constellationId)}:`;
}

function journeyFromSequence(sequence: SceneSequence, constellationId: string): StoryJourney {
  return {
    id: sequence.id,
    constellationId,
    title: sequence.name?.trim() || "Untitled journey",
    sceneIds: sequence.sceneIds,
    createdAt: sequence.createdAt,
    updatedAt: sequence.updatedAt,
  };
}

function normalizeInput(input: StorySceneInput): StorySceneInput {
  const title = input.title.trim();
  if (!title) throw new Error("Story scene title must not be empty");
  const durationMs = Math.max(250, Math.round(input.durationMs));
  return {
    title,
    nodeIds: uniqueStrings(input.nodeIds),
    mediaAssetIds: uniqueStrings(input.mediaAssetIds),
    narrationText: input.narrationText.trim(),
    transition: input.transition,
    durationMs,
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function storyMetadataEvent(journeyId: string, input: StorySceneInput, at: string): Scene["curationEvents"][number] {
  const metadata: StoryMetadata = {
    kind: STORY_METADATA_KIND,
    journeyId,
    nodeIds: input.nodeIds,
    mediaAssetIds: input.mediaAssetIds,
    transition: input.transition,
    durationMs: input.durationMs,
  };
  return {
    type: "edit_as_derived",
    at,
    detail: `${STORY_METADATA_PREFIX}${JSON.stringify(metadata)}`,
  };
}

function readStoryMetadata(scene: Scene): StoryMetadata | null {
  for (let index = scene.curationEvents.length - 1; index >= 0; index -= 1) {
    const detail = scene.curationEvents[index]?.detail;
    if (!detail?.startsWith(STORY_METADATA_PREFIX)) continue;
    try {
      const value = JSON.parse(detail.slice(STORY_METADATA_PREFIX.length)) as Partial<StoryMetadata>;
      if (value.kind !== STORY_METADATA_KIND || typeof value.journeyId !== "string") continue;
      return {
        kind: STORY_METADATA_KIND,
        journeyId: value.journeyId,
        nodeIds: Array.isArray(value.nodeIds) ? value.nodeIds.filter((id): id is string => typeof id === "string") : [],
        mediaAssetIds: Array.isArray(value.mediaAssetIds)
          ? value.mediaAssetIds.filter((id): id is string => typeof id === "string")
          : [],
        transition: isTransition(value.transition) ? value.transition : "fade",
        durationMs: typeof value.durationMs === "number" && Number.isFinite(value.durationMs)
          ? Math.max(250, Math.round(value.durationMs))
          : 4000,
      };
    } catch {
      continue;
    }
  }
  return null;
}

function authoringSceneFromCanonical(scene: Scene, fallbackJourneyId: string): StoryAuthoringScene {
  const metadata = readStoryMetadata(scene);
  return {
    id: scene.id,
    journeyId: metadata?.journeyId ?? fallbackJourneyId,
    title: scene.title?.trim() || "Untitled scene",
    nodeIds: metadata?.nodeIds ?? [],
    mediaAssetIds: metadata?.mediaAssetIds ?? [],
    narrationText: scene.narration ?? "",
    transition: metadata?.transition ?? "fade",
    durationMs: metadata?.durationMs ?? 4000,
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
  };
}

function journeyIdFromSceneId(sceneId: string): string | null {
  const marker = ":scene:";
  const index = sceneId.lastIndexOf(marker);
  return index > 0 ? sceneId.slice(0, index) : null;
}

function isTransition(value: unknown): value is StoryTransition {
  return value === "cut" || value === "fade" || value === "dissolve";
}

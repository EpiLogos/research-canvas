import {
  consentedPassages,
  sceneSequenceSchema,
  sceneSchema,
  type PassageConsent,
  type RedactedSpan,
  type Scene,
  type SceneSequence,
} from "@research-canvas/schema";

/**
 * Keepsake export (vision §3.13/§3.16, tickets #8/#11): a self-contained
 * offline static bundle — navigable journey, own-language, media playback,
 * consent-filtered, with the place's redacted street-view imagery and the
 * walk's map/globe context as first-class scene content. The manifest never
 * contains hardcoded local paths: every asset reference is relative, and the
 * builder refuses absolute paths.
 */
export interface KeepsakeWalkStop {
  sceneId: string;
  placeId: string;
  title: string;
  coordinate: { latitude: number; longitude: number } | null;
}

export interface KeepsakeStreetViewImage {
  id: string;
  artifactPath: string;
  redactionStatus: string;
  redactedArtifactPath: string | null;
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  headingDegrees: number | null;
}

export interface KeepsakeWalkContext {
  coordinate: { latitude: number; longitude: number } | null;
  route: Array<{ latitude: number; longitude: number }>;
}

export interface KeepsakeScene {
  sceneId: string;
  placeId: string;
  title: string;
  languageVariants: Array<{ language: string; derivedArtifactId: string }>;
  passages: Array<{
    artifactId: string;
    unit: unknown;
    gaps: Array<{ startOffset: number; endOffset: number }>;
  }>;
  media: string[];
  /** The place's redacted street-view imagery (refinement-2 D4). */
  streetViewImages: KeepsakeStreetViewImage[];
  /** The walk's map/globe context for this stop. */
  walkContext: KeepsakeWalkContext | null;
}

export interface KeepsakeManifest {
  formatVersion: 1;
  title: string;
  profileScope: string;
  /** The storyteller's default language is canonical; variants are derived. */
  defaultLanguage: "original";
  scenes: KeepsakeScene[];
  media: string[];
  walk: Array<{ latitude: number; longitude: number }>;
}

export interface KeepsakeInput {
  sequence: SceneSequence;
  scenes: Scene[];
  consents: PassageConsent[];
  redactions: RedactedSpan[];
  /** Relative asset paths per scene (media, transcripts, translations). */
  mediaForScene: (sceneId: string) => string[];
  walk: KeepsakeWalkStop[];
  /** The place's redacted street-view imagery per scene (refinement-2 D4). */
  streetViewImagesForScene?: (sceneId: string) => KeepsakeStreetViewImage[];
}

export function buildKeepsakeManifest(input: KeepsakeInput): KeepsakeManifest {
  const sequence = sceneSequenceSchema.parse(input.sequence);
  const scenesById = new Map(
    input.scenes.map((scene) => [
      scene.id,
      sceneSchema.parse(scene) as Scene,
    ]),
  );
  const streetViewForScene = input.streetViewImagesForScene ?? (() => []);
  const walkBySceneId = new Map(
    input.walk.map((stop) => [stop.sceneId, stop]),
  );
  const route = input.walk
    .filter((stop) => stop.coordinate !== null)
    .map((stop) => stop.coordinate as { latitude: number; longitude: number });
  const media = new Set<string>();
  const keepsakeScenes: KeepsakeScene[] = [];

  for (const sceneId of sequence.sceneIds) {
    const scene = scenesById.get(sceneId);
    if (!scene) continue;
    const published = consentedPassages(
      scene.passages,
      input.consents,
      input.redactions,
    );
    const sceneMedia = input.mediaForScene(sceneId);
    for (const path of sceneMedia) {
      assertPortablePath(path, `scene ${sceneId}`);
      media.add(path);
    }
    const streetViewImages = streetViewForScene(sceneId);
    for (const image of streetViewImages) {
      const path = image.redactedArtifactPath ?? image.artifactPath;
      assertPortablePath(path, `scene ${sceneId} street view`);
      media.add(path);
    }
    const stop = walkBySceneId.get(sceneId);
    keepsakeScenes.push({
      sceneId,
      placeId: scene.placeFrame.placeId,
      title: scene.title ?? scene.placeFrame.placeId,
      languageVariants: scene.languageVariants.map((variant) => ({
        language: variant.language,
        derivedArtifactId: variant.derivedArtifactId,
      })),
      passages: published.map(({ passage, gaps }) => ({
        artifactId: passage.artifactId,
        unit: passage.unit,
        gaps,
      })),
      media: sceneMedia,
      streetViewImages,
      walkContext: {
        coordinate: stop?.coordinate ?? null,
        route,
      },
    });
  }

  const walk = input.walk
    .filter((stop): stop is KeepsakeWalkStop & { coordinate: NonNullable<KeepsakeWalkStop["coordinate"]> } =>
      stop.coordinate !== null,
    )
    .map((stop) => stop.coordinate);

  return {
    formatVersion: 1,
    title: sequence.name ?? "Keepsake",
    profileScope: sequence.profileScope,
    defaultLanguage: "original",
    scenes: keepsakeScenes,
    media: [...media],
    walk,
  };
}

function assertPortablePath(path: string, context: string): void {
  if (
    path.startsWith("/") ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(path) ||
    path.includes("..")
  ) {
    throw new Error(
      `keepsake ${context} references a non-portable path: ${path}`,
    );
  }
}

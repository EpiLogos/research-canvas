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
 * consent-filtered. The manifest never contains hardcoded local paths: every
 * asset reference is relative, and the builder refuses absolute paths.
 */
export interface KeepsakeWalkStop {
  sceneId: string;
  placeId: string;
  title: string;
  coordinate: { latitude: number; longitude: number } | null;
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
}

export function buildKeepsakeManifest(input: KeepsakeInput): KeepsakeManifest {
  const sequence = sceneSequenceSchema.parse(input.sequence);
  const scenesById = new Map(
    input.scenes.map((scene) => [
      scene.id,
      sceneSchema.parse(scene) as Scene,
    ]),
  );
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

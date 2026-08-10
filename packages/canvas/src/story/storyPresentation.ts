import {
  consentedPassages,
  passageRefKey,
  type PassageConsent,
  type PassageRef,
  type RedactedSpan,
  type Scene,
} from "@research-canvas/schema";

import { CANONICAL_LANGUAGE, presentScene } from "../scenes/presentation";

/**
 * Story presentation (vision §3.13/§3.16, tickets #8/#11): a published story
 * is a journey as a scene sequence — per-scene language switching over
 * derived variants (canonical originals untouched) and consent-filtered
 * passages with redacted spans rendered as gaps. The mapping below turns the
 * profile scene store into the surface's data contract; the surface itself
 * stays presentation-only.
 */

export interface StoryPassageView {
  key: string;
  artifactId: string;
  unit: unknown;
  redacted: boolean;
  gaps: Array<{ startOffset: number; endOffset: number }>;
}

/** A publishable street-view capture for a scene's place (refinement-2 D4):
 * only `redacted` or `none_needed` imagery ever reaches the surface — the
 * redacted derived copy is what scenes render, never the pending original. */
export interface StorySceneStreetView {
  id: string;
  artifactPath: string;
  redactionStatus: string;
  redactedArtifactPath: string | null;
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  headingDegrees: number | null;
}

/** The walk's map/globe context for one scene: where this stop sits on the
 * ordered route, so the scene renders its geography inline, not as an
 * afterthought. */
export interface StorySceneWalkContext {
  /** Coordinate of this scene's place frame; null when unlocated. */
  coordinate: { latitude: number; longitude: number } | null;
  /** Ordered coordinates of the whole walk (for the route line). */
  route: Array<{ latitude: number; longitude: number }>;
}

export interface StorySceneView {
  sceneId: string;
  title: string;
  placeId: string;
  /** Real prose attached to the scene (schema-level narration), rendered as
   * the scene's lead passage. */
  narration?: string;
  language: string;
  availableLanguages: string[];
  /** Consent-filtered passages; redacted passages carry their gaps. */
  passages: StoryPassageView[];
  media: string[];
  transcriptPath: string | null;
  /** The place's redacted street-view imagery (media-first scene content). */
  streetViewImages: StorySceneStreetView[];
  /** The walk's map/globe context for this stop. */
  walkContext: StorySceneWalkContext | null;
}

export interface PresentStorySceneOptions {
  scene: Scene;
  consents: PassageConsent[];
  redactions: RedactedSpan[];
  language?: string;
  media?: string[];
  transcriptPath?: string | null;
  scope?: string;
  streetViewImages?: StorySceneStreetView[];
  walkContext?: StorySceneWalkContext | null;
}

export function presentStoryScene(
  options: PresentStorySceneOptions,
): StorySceneView {
  const {
    scene,
    consents,
    redactions,
    language = CANONICAL_LANGUAGE,
    media = [],
    transcriptPath = null,
    scope = "publication",
    streetViewImages = [],
    walkContext = null,
  } = options;
  const presentation = presentScene(scene, language);
  const published = consentedPassages(
    scene.passages,
    consents,
    redactions,
    scope,
  );
  const redactedKeys = new Set(
    redactions.map((span) => passageRefKey(span.passageRef)),
  );
  return {
    sceneId: scene.id,
    title: scene.title ?? scene.placeFrame.placeId,
    placeId: scene.placeFrame.placeId,
    narration: scene.narration,
    language: presentation.language,
    availableLanguages: presentation.availableLanguages,
    passages: published.map(({ passage, gaps }) => ({
      key: passageRefKey(passage),
      artifactId: passage.artifactId,
      unit: passage.unit,
      redacted: redactedKeys.has(passageRefKey(passage)),
      gaps,
    })),
    media,
    transcriptPath,
    streetViewImages,
    walkContext,
  };
}

/** The media files a scene presents: media plus its derived transcript. */
export function sceneMediaWithTranscript(
  media: string[],
  transcriptPath: string | null,
): string[] {
  const paths = new Set(media);
  if (transcriptPath) {
    paths.add(transcriptPath);
  }
  return [...paths];
}

/** Default passage text for a scene when no transcript store exists yet. */
export function passageUnitLabel(passage: { artifactId: string; unit: unknown }): string {
  const unit = passage.unit as PassageRef["unit"];
  if (unit.kind === "timestamp_range") {
    return `Audio passage ${formatMs(unit.startMs)}–${formatMs(unit.endMs)}`;
  }
  if (unit.kind === "text_span") {
    return `Text passage ${unit.startOffset}–${unit.endOffset}`;
  }
  if (unit.kind === "image_region") {
    return "Image passage";
  }
  return "Passage";
}

function formatMs(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

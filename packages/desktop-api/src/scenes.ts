import type {
  PassageConsent,
  PassageRef,
  RedactedSpan,
  Scene,
  SceneCurationEvent,
  SceneLanguageVariant,
  ScenePeopleRef,
  SceneSequence,
  SceneTimeWindow,
} from "@research-canvas/schema";

/**
 * Profile-level scene/sequence wire types (vision §3.7/§3.15). The shared TS
 * zod contract in @research-canvas/schema is the semantic authority, so the
 * transport maps the nullable wire shape (Rust `Option<T>` serializes as
 * `null`) onto the schema types and back at the boundary.
 */

export type ScenePlaceFrameWire = {
  placeId: string;
  validAt: { instant: string } | { start: string; end: string };
};

export interface SceneWire {
  id: string;
  profileScope: string;
  placeFrame: ScenePlaceFrameWire;
  timeWindow: SceneTimeWindow;
  people: ScenePeopleRef[];
  passages: PassageRef[];
  consents: PassageConsent[];
  redactions: RedactedSpan[];
  languageVariants: SceneLanguageVariant[];
  title: string | null;
  narration: string | null;
  assembledBy: "agent" | "human";
  curationEvents: SceneCurationEvent[];
  nestedSequenceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SceneSequenceWire {
  id: string;
  profileScope: string;
  name: string | null;
  sceneIds: string[];
  subTimelineId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function sceneFromWire(wire: SceneWire): Scene {
  return {
    ...wire,
    title: wire.title ?? undefined,
    narration: wire.narration ?? undefined,
  };
}

export function sceneToWire(scene: Scene): SceneWire {
  return {
    ...scene,
    title: scene.title ?? null,
    narration: scene.narration ?? null,
  };
}

export function sceneSequenceFromWire(wire: SceneSequenceWire): SceneSequence {
  return {
    ...wire,
    name: wire.name ?? undefined,
    subTimelineId: wire.subTimelineId ?? undefined,
  };
}

export function sceneSequenceToWire(sequence: SceneSequence): SceneSequenceWire {
  return {
    ...sequence,
    name: sequence.name ?? null,
    subTimelineId: sequence.subTimelineId ?? null,
  };
}

export interface ListScenesRequest {
  databasePath: string;
  profileScope: string;
}

export interface ListSceneSequencesRequest {
  databasePath: string;
  profileScope: string;
}

export interface SceneIdRequest {
  databasePath: string;
  id: string;
}

export interface UpsertSceneRequest {
  databasePath: string;
  scene: Scene;
}

export interface UpsertSceneSequenceRequest {
  databasePath: string;
  sequence: SceneSequence;
}

export type { Scene, SceneSequence };

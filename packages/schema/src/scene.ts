import { z } from "zod";

import { passageRefKey, passageRefSchema } from "./passage";
import { compareTemporalBounds, isoTemporalBoundSchema } from "./time";

/** A scene's time window; instants are allowed (start === end). */
export const sceneTimeWindowSchema = z
  .object({
    start: isoTemporalBoundSchema,
    end: isoTemporalBoundSchema,
  })
  .superRefine((window, ctx) => {
    const cmp = compareTemporalBounds(window.start, window.end);
    if (cmp !== null && cmp > 0) {
      ctx.addIssue({
        code: "custom",
        message: "scene time window end must not precede start",
        path: ["end"],
      });
    }
  });

/** Place-plus-time reference: a scene points at a place and the instant or
 * interval within the scene's time window at which that place identity
 * applies. */
export const placeFrameSchema = z
  .object({
    placeId: z.string().min(1),
    validAt: z.union([
      z.object({ instant: isoTemporalBoundSchema }),
      z
        .object({
          start: isoTemporalBoundSchema,
          end: isoTemporalBoundSchema,
        })
        .superRefine((interval, ctx) => {
          const cmp = compareTemporalBounds(interval.start, interval.end);
          if (cmp !== null && cmp > 0) {
            ctx.addIssue({
              code: "custom",
              message: "placeFrame interval end must not precede start",
              path: ["end"],
            });
          }
        }),
    ]),
  });

export const scenePeopleRefSchema = z.object({
  graphNodeId: z.string().min(1),
  role: z.string().min(1),
});

export const SCENE_ASSEMBLERS = ["agent", "human"] as const;
export const sceneAssemblerSchema = z.enum(SCENE_ASSEMBLERS);

export const CURATION_EVENT_TYPES = [
  "pin",
  "exclude",
  "reorder",
  "split",
  "merge",
  "edit_as_derived",
] as const;
export const curationEventTypeSchema = z.enum(CURATION_EVENT_TYPES);

export const sceneCurationEventSchema = z.object({
  type: curationEventTypeSchema,
  at: z.string().datetime(),
  detail: z.string().optional(),
});

/** A derived translation/narration/title of a canonical voice passage. The
 * original passage is never overwritten; the variant points back at it with
 * passage-level provenance. */
export const sceneLanguageVariantSchema = z.object({
  id: z.string().min(1),
  language: z.string().min(2).max(16),
  kind: z.enum(["voice_passage_translation", "narration", "title"]),
  sourcePassageRef: passageRefSchema,
  derivedArtifactId: z.string().min(1),
  provenance: z.object({
    sourceRefs: z.array(passageRefSchema).min(1),
  }),
});

function placeFrameFitsWindow(
  frame: z.infer<typeof placeFrameSchema>,
  window: z.infer<typeof sceneTimeWindowSchema>,
): boolean {
  const bounds =
    "instant" in frame.validAt
      ? [frame.validAt.instant, frame.validAt.instant]
      : [frame.validAt.start, frame.validAt.end];
  for (const bound of bounds) {
    const cmpStart = compareTemporalBounds(bound, window.start);
    if (cmpStart !== null && cmpStart < 0) {
      return false;
    }
    const cmpEnd = compareTemporalBounds(bound, window.end);
    if (cmpEnd !== null && cmpEnd > 0) {
      return false;
    }
  }
  return true;
}

/**
 * The Scene contract (locked by ticket #10): a profile-level unit joining a
 * place frame, a time window, people, and the media/voice passages anchored
 * there. Sequences of scenes power walks, stories, and journeys.
 */
export const sceneSchema = z
  .object({
    id: z.string().min(1),
    profileScope: z.string().min(1),
    placeFrame: placeFrameSchema,
    timeWindow: sceneTimeWindowSchema,
    people: z.array(scenePeopleRefSchema),
    passages: z.array(passageRefSchema),
    languageVariants: z.array(sceneLanguageVariantSchema),
    title: z.string().optional(),
    narration: z.string().optional(),
    assembledBy: sceneAssemblerSchema,
    curationEvents: z.array(sceneCurationEventSchema),
    /** Sequences compose: a scene may contain a nested sequence. */
    nestedSequenceIds: z.array(z.string().min(1)),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .superRefine((scene, ctx) => {
    if (!placeFrameFitsWindow(scene.placeFrame, scene.timeWindow)) {
      ctx.addIssue({
        code: "custom",
        message: "placeFrame.validAt must be inside the scene time window",
        path: ["placeFrame"],
      });
    }
    const peopleKeys = new Set<string>();
    scene.people.forEach((person, index) => {
      const key = `${person.graphNodeId}:${person.role}`;
      if (peopleKeys.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate people ref ${key}`,
          path: ["people", index],
        });
      }
      peopleKeys.add(key);
    });
    const anchored = new Set(scene.passages.map(passageRefKey));
    scene.languageVariants.forEach((variant, index) => {
      if (!anchored.has(passageRefKey(variant.sourcePassageRef))) {
        ctx.addIssue({
          code: "custom",
          message:
            "language variant source passage must be anchored in the scene",
          path: ["languageVariants", index, "sourcePassageRef"],
        });
      }
    });
  });

/**
 * Sequence semantics: an ordered list of scenes; sequences compose (a scene
 * may contain a nested sequence) and nest inside sub-timelines. Sequences are
 * profile-level units — a pattern over substrate nodes, never a locked
 * category.
 */
export const sceneSequenceSchema = z
  .object({
    id: z.string().min(1),
    profileScope: z.string().min(1),
    name: z.string().optional(),
    sceneIds: z.array(z.string().min(1)),
    subTimelineId: z.string().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .superRefine((sequence, ctx) => {
    const seen = new Set<string>();
    sequence.sceneIds.forEach((sceneId, index) => {
      if (seen.has(sceneId)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate scene ${sceneId} in sequence`,
          path: ["sceneIds", index],
        });
      }
      seen.add(sceneId);
    });
  });

/** The spatial zero-case of the main timeline is Earth; any node can frame a
 * sub-timeline. Trans-temporal nodes hover above all timelines and are never
 * nested inside a frame. */
export const SUB_TIMELINE_SPATIAL_FRAMES = ["earth", "place", "none"] as const;
export const subTimelineSpatialFrameSchema = z.enum(SUB_TIMELINE_SPATIAL_FRAMES);

export const subTimelineSchema = z.object({
  id: z.string().min(1),
  /** The node whose sub-timeline this is; for the Earth zero-case this is the
   * workspace root frame node. */
  frameNodeId: z.string().min(1),
  spatialFrame: subTimelineSpatialFrameSchema,
  temporalWindow: sceneTimeWindowSchema.optional(),
  nestedTimelineIds: z.array(z.string().min(1)),
  transTemporalNodeIds: z.array(z.string().min(1)),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SceneTimeWindow = z.infer<typeof sceneTimeWindowSchema>;
export type PlaceFrame = z.infer<typeof placeFrameSchema>;
export type ScenePeopleRef = z.infer<typeof scenePeopleRefSchema>;
export type SceneAssembler = z.infer<typeof sceneAssemblerSchema>;
export type CurationEventType = z.infer<typeof curationEventTypeSchema>;
export type SceneCurationEvent = z.infer<typeof sceneCurationEventSchema>;
export type SceneLanguageVariant = z.infer<typeof sceneLanguageVariantSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type SceneSequence = z.infer<typeof sceneSequenceSchema>;
export type SubTimelineSpatialFrame = z.infer<
  typeof subTimelineSpatialFrameSchema
>;
export type SubTimeline = z.infer<typeof subTimelineSchema>;

import { z } from "zod";

/**
 * Passage-level provenance points at the native unit of a source artifact:
 * a text span, a media timestamp range, or an image region. The raw corpus is
 * canonical and agent-immutable; every derived graph object links back through
 * these refs instead of owning source content.
 */
export const PASSAGE_NATIVE_UNIT_KINDS = [
  "text_span",
  "timestamp_range",
  "image_region",
] as const;
export const passageNativeUnitKindSchema = z.enum(PASSAGE_NATIVE_UNIT_KINDS);

export const passageNativeUnitSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("text_span"),
      startOffset: z.number().int().nonnegative(),
      endOffset: z.number().int().nonnegative(),
    })
    .refine((unit) => unit.endOffset > unit.startOffset, {
      message: "text span must be non-empty",
      path: ["endOffset"],
    }),
  z
    .object({
      kind: z.literal("timestamp_range"),
      startMs: z.number().nonnegative(),
      endMs: z.number().nonnegative(),
    })
    .refine((unit) => unit.endMs >= unit.startMs, {
      message: "timestamp range end must not precede start",
      path: ["endMs"],
    }),
  z
    .object({
      kind: z.literal("image_region"),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().positive().max(1),
      height: z.number().positive().max(1),
    })
    .refine(
      (unit) => unit.x + unit.width <= 1 && unit.y + unit.height <= 1,
      {
        message: "region must lie within the image",
        path: ["width"],
      },
    ),
]);

export const passageRefSchema = z.object({
  artifactId: z.string().min(1),
  unit: passageNativeUnitSchema,
});

export type PassageNativeUnit = z.infer<typeof passageNativeUnitSchema>;
export type PassageRef = z.infer<typeof passageRefSchema>;

/** Stable identity for a passage ref, used for cross-referencing within a
 * scene (e.g. a language variant must anchor to a passage the scene holds). */
export function passageRefKey(ref: PassageRef): string {
  return `${ref.artifactId}#${passageUnitKey(ref.unit)}`;
}

/** Order-independent identity for a native passage unit. Key order must not
 * leak into identity: units arrive from Rust in serde field order and from
 * zod-parsed scenes in schema order, and JSON.stringify would treat those as
 * different passages. */
export function passageUnitKey(unit: PassageRef["unit"]): string {
  switch (unit.kind) {
    case "text_span":
      return `text_span:${unit.startOffset}:${unit.endOffset}`;
    case "timestamp_range":
      return `timestamp_range:${unit.startMs}:${unit.endMs}`;
    case "image_region":
      return `image_region:${unit.x}:${unit.y}:${unit.width}:${unit.height}`;
  }
}

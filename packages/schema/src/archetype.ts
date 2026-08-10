import { z } from "zod";

import { checkBoundOrder, isoTemporalBoundSchema } from "./time";
import { temporalPrecisionSchema } from "./node";

/**
 * Kinds of archetypal expression tracked as a spectral background layer.
 * Each expression is a claim that an archetype shows up in a particular
 * time/place/cultural surface.
 */
export const ARCHETYPE_EXPRESSION_KINDS = [
  "mythic",
  "ritual",
  "literary",
  "visual",
  "theoretical",
] as const;
export const archetypeExpressionKindSchema = z.enum(ARCHETYPE_EXPRESSION_KINDS);

export type ArchetypeExpressionKind = z.infer<typeof archetypeExpressionKindSchema>;

/**
 * A closed or half-open temporal window in which the archetype is expressed.
 * `precision` records the coarsest unit used by the source (year, century, etc.).
 */
export const archetypeTimeWindowSchema = z
  .object({
    start: isoTemporalBoundSchema,
    end: isoTemporalBoundSchema.nullable(),
    precision: temporalPrecisionSchema,
  })
  .superRefine((window, ctx) => {
    checkBoundOrder(window.start, window.end ?? null, ctx, ["start", "end"]);
  });

export type ArchetypeTimeWindow = z.infer<typeof archetypeTimeWindowSchema>;

/**
 * Single expression of an archetype at a particular place and time.
 *
 * An expression links an Archetype graph node to a Place graph node and carries
 * the time window, expression kind, and source coordinates that justify the
 * link. This is the TypeScript contract that backs the `ARCHETYPE_EXPRESSES_AT`
 * Neo4j relation.
 */
export const archetypalExpressionSchema = z.object({
  id: z.string().min(1),
  archetypeGraphNodeId: z.string().min(1),
  /** The Place graph node where the expression is located. */
  placeGraphNodeId: z.string().min(1),
  timeWindow: archetypeTimeWindowSchema,
  expressionKind: archetypeExpressionKindSchema,
  /** Source coordinates (e.g. passage IDs) that support this expression. */
  sourceCoordinates: z.array(z.string()),
});

export type ArchetypalExpression = z.infer<typeof archetypalExpressionSchema>;

/**
 * Bounding box that covers all place coordinates in an archetype's expression
 * footprint. Values are WGS84 decimal degrees.
 */
export const geographicBoundsSchema = z.object({
  north: z.number(),
  south: z.number(),
  east: z.number(),
  west: z.number(),
});

export type GeographicBounds = z.infer<typeof geographicBoundsSchema>;

/**
 * Heatmap row: one archetype with its full expression footprint.
 *
 * Surfaces render this as a background track layered underneath the
 * earthbound timeline. `temporalSpan` and `geographicBounds` are derived from
 * the expression set.
 */
export const archetypeHeatmapEntrySchema = z.object({
  archetypeId: z.string().min(1),
  title: z.string(),
  expressions: z.array(archetypalExpressionSchema),
  temporalSpan: z.object({
    start: isoTemporalBoundSchema,
    end: isoTemporalBoundSchema.nullable(),
  }),
  geographicBounds: geographicBoundsSchema,
});

export type ArchetypeHeatmapEntry = z.infer<typeof archetypeHeatmapEntrySchema>;

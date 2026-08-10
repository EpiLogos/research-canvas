import { z } from "zod";

import { passageRefSchema } from "./passage";
import { compareTemporalBounds, isoTemporalBoundSchema } from "./time";

/**
 * Movement-stream contract (refinement-2 D2, ticket #19): a surface-layer
 * `geography_edge` — a derived route between two Temporal Place graph nodes
 * (VOC shipping Amsterdam→Banda, Rhodes's Oxford↔Kimberley journeys, Rudolf
 * II's Vienna→Prague court move, the Cult of Reason's intra-Paris events),
 * seeded from the corpus with passage-level provenance. Geography edges are
 * NOT new substrate relationship types and NOT new node categories: the locked
 * relationship vocabulary is unchanged, and the edge lives at the surface
 * layer next to scenes and street-view imagery.
 */

/** Route modes for movement streams. Flight/shipping are air/sea; overland and
 * inland_water are land/river routes. */
export const GEOGRAPHY_EDGE_MODES = [
  "flight",
  "shipping",
  "overland",
  "inland_water",
] as const;
export const geographyEdgeModeSchema = z.enum(GEOGRAPHY_EDGE_MODES);

/** A route's time window; instants are allowed (start === end). */
export const geographyEdgeTimeWindowSchema = z
  .object({
    start: isoTemporalBoundSchema,
    end: isoTemporalBoundSchema,
  })
  .superRefine((window, ctx) => {
    const cmp = compareTemporalBounds(window.start, window.end);
    if (cmp !== null && cmp > 0) {
      ctx.addIssue({
        code: "custom",
        message: "geography edge time window end must not precede start",
        path: ["end"],
      });
    }
  });

/** GeoJSON position is [longitude, latitude] — WGS84 decimal degrees. */
export const geojsonPosition = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);

/** A GeoJSON `LineString` (the edge's computed great-circle arc, with explicit
 * control points allowed for non-great-circle routes). */
export const geojsonLineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(geojsonPosition).min(2),
});

/** Passage-level provenance, matching every substrate object: the lane is a
 * derived artifact and must always point back at the raw corpus passages that
 * document the movement. */
export const geographyEdgeProvenanceSchema = z.object({
  sourceRefs: z.array(passageRefSchema).min(1),
});

/**
 * The `geography_edge` contract (locked by ticket #19): a profile-scoped,
 * derived route between two Temporal Place graph nodes with a stable seedKey
 * for idempotent corpus seeding.
 */
export const geographyEdgeSchema = z
  .object({
    id: z.string().trim().min(1),
    profileScope: z.string().trim().min(1),
    mode: geographyEdgeModeSchema,
    /** Graph node ids of the source/target Temporal Places. */
    sourcePlaceId: z.string().trim().min(1),
    targetPlaceId: z.string().trim().min(1),
    /** Human title, e.g. "VOC shipping lane Amsterdam → Banda". */
    label: z.string().trim().min(1),
    timeWindow: geographyEdgeTimeWindowSchema,
    geometry: geojsonLineStringSchema,
    provenance: geographyEdgeProvenanceSchema,
    /** Stable id for idempotent corpus seeding. */
    seedKey: z.string().trim().min(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .superRefine((edge, ctx) => {
    const cmp = compareTemporalBounds(edge.timeWindow.start, edge.timeWindow.end);
    if (cmp !== null && cmp > 0) {
      ctx.addIssue({
        code: "custom",
        message: "geography edge time window end must not precede start",
        path: ["timeWindow", "end"],
      });
    }
  });

export type GeographyEdgeMode = z.infer<typeof geographyEdgeModeSchema>;
export type GeographyEdgeTimeWindow = z.infer<
  typeof geographyEdgeTimeWindowSchema
>;
export type GeoJsonPosition = z.infer<typeof geojsonPosition>;
export type GeoJsonLineString = z.infer<typeof geojsonLineStringSchema>;
export type GeographyEdgeProvenance = z.infer<
  typeof geographyEdgeProvenanceSchema
>;
export type GeographyEdge = z.infer<typeof geographyEdgeSchema>;

import { z } from "zod";

import { passageRefSchema } from "./passage";
import { checkBoundOrder, isoTemporalBoundSchema } from "./time";

export const PLACE_COORDINATE_PRECISIONS = [
  "exact",
  "approximate",
  "region",
  "unlocated",
] as const;
export const placeCoordinatePrecisionSchema = z.enum(PLACE_COORDINATE_PRECISIONS);

const wgs84Point = z.object({
  /** WGS84 latitude, decimal degrees, [-90, 90]. */
  latitude: z.number().min(-90).max(90),
  /** WGS84 longitude, decimal degrees, [-180, 180]. */
  longitude: z.number().min(-180).max(180),
});

/** GeoJSON position is [longitude, latitude] — explicitly not the named
 * latitude/longitude order used by the point form above. */
const geojsonPosition = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);

const geojsonLinearRing = z
  .array(geojsonPosition)
  .min(4)
  .refine(
    (ring) => {
      const first = ring[0];
      const last = ring[ring.length - 1];
      return first[0] === last[0] && first[1] === last[1];
    },
    { message: "GeoJSON linear ring must be closed" },
  );

const geojsonPolygon = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(geojsonLinearRing),
});

const geojsonMultiPolygon = z.object({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(geojsonLinearRing)),
});

/**
 * A Temporal Place's coordinate with an explicit precision level. Precision
 * never exceeds the source's precision: `region` carries geometry and no
 * point; `unlocated` carries no coordinate at all; `exact`/`approximate`
 * carry a point.
 */
export const placeCoordinateSchema = z.discriminatedUnion("precision", [
  wgs84Point.extend({ precision: z.literal("exact") }),
  wgs84Point.extend({ precision: z.literal("approximate") }),
  z
    .object({
      precision: z.literal("region"),
      geometry: z.discriminatedUnion("type", [geojsonPolygon, geojsonMultiPolygon]),
    })
    .strict(),
  z.object({ precision: z.literal("unlocated") }).strict(),
]);

/**
 * A name of a place, valid only during its own interval. The same ground can
 * carry several names across time (1453 Constantinople, 2026 İstanbul).
 */
export const placeNameSchema = z
  .object({
    language: z.string().min(2).max(16),
    name: z.string().min(1),
    validFrom: isoTemporalBoundSchema.nullable().optional(),
    validTo: isoTemporalBoundSchema.nullable().optional(),
  })
  .superRefine((name, ctx) => {
    checkBoundOrder(name.validFrom ?? null, name.validTo ?? null, ctx, [
      "validFrom",
      "validTo",
    ]);
  });

/** Time-bounded membership in a parent place (site → city → region → country).
 * v1 stores direct parents; the ancestor chain is derived by traversal. */
export const placeHierarchyEntrySchema = z
  .object({
    parentPlaceId: z.string().min(1),
    relationValidFrom: isoTemporalBoundSchema.nullable().optional(),
    relationValidTo: isoTemporalBoundSchema.nullable().optional(),
  })
  .superRefine((entry, ctx) => {
    checkBoundOrder(
      entry.relationValidFrom ?? null,
      entry.relationValidTo ?? null,
      ctx,
      ["relationValidFrom", "relationValidTo"],
    );
  });

export const placeHierarchySchema = z.array(placeHierarchyEntrySchema);

export const GAZETTEER_KINDS = [
  "pleiades",
  "wikidata",
  "geonames",
  "whg",
  "openhistoricalmap",
] as const;
export const gazetteerKindSchema = z.enum(GAZETTEER_KINDS);

export const placeExternalRefSchema = z.object({
  gazetteer: gazetteerKindSchema,
  id: z.string().min(1),
  url: z.string().url().optional(),
});

/**
 * The Temporal Place contract (locked by ticket #9): one ground, many
 * time-bounded identities. `identityValidFrom`/`identityValidTo` bound the
 * identity itself; names and hierarchy memberships carry their own bounds.
 */
export const temporalPlaceSchema = z
  .object({
    graphNodeId: z.string().min(1),
    names: z.array(placeNameSchema).min(1),
    coordinate: placeCoordinateSchema,
    hierarchy: placeHierarchySchema,
    identityValidFrom: isoTemporalBoundSchema.nullable().optional(),
    identityValidTo: isoTemporalBoundSchema.nullable().optional(),
    externalRefs: z.array(placeExternalRefSchema),
    provenance: z.object({
      sourceRefs: z.array(passageRefSchema),
    }),
  })
  .superRefine((place, ctx) => {
    checkBoundOrder(
      place.identityValidFrom ?? null,
      place.identityValidTo ?? null,
      ctx,
      ["identityValidFrom", "identityValidTo"],
    );
    const seen = new Set<string>();
    place.names.forEach((name, index) => {
      const key = `${name.language}:${name.name}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate place name ${key}`,
          path: ["names", index],
        });
      }
      seen.add(key);
    });
  });

export type PlaceCoordinatePrecision = z.infer<
  typeof placeCoordinatePrecisionSchema
>;
export type PlaceCoordinate = z.infer<typeof placeCoordinateSchema>;
export type PlaceName = z.infer<typeof placeNameSchema>;
export type PlaceHierarchyEntry = z.infer<typeof placeHierarchyEntrySchema>;
export type GazetteerKind = z.infer<typeof gazetteerKindSchema>;
export type PlaceExternalRef = z.infer<typeof placeExternalRefSchema>;
export type TemporalPlace = z.infer<typeof temporalPlaceSchema>;

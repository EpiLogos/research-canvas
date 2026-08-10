import { describe, expect, it } from "vitest";

import {
  geographyEdgeSchema,
  geographyEdgeTimeWindowSchema,
  type GeographyEdge,
} from "./index";

const now = "2026-08-10T10:00:00.000Z";

/** Real corpus anchors (Report3.md / Report8.md) with real heading slugs. */
const VOC_LANE_PASSAGE = {
  artifactId:
    "antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/Research/Report8.md",
  unit: {
    kind: "text_span",
    startOffset: 2098,
    endOffset: 2450,
  },
} as const;

const REAL_LANES: GeographyEdge[] = [
  {
    id: "geo:voc-amsterdam-banda",
    profileScope: "bootstrapping",
    mode: "shipping",
    sourcePlaceId: "place-amsterdam",
    targetPlaceId: "place-banda-islands",
    label: "VOC shipping lane Amsterdam → Banda",
    timeWindow: { start: "1602-03-20", end: "1621-05-08" },
    geometry: {
      type: "LineString",
      coordinates: [
        [4.8936, 52.3728],
        [129.9, -4.55],
      ],
    },
    provenance: { sourceRefs: [VOC_LANE_PASSAGE] },
    seedKey: "voc:amsterdam-to-banda",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "geo:rhodes-oxford-kimberley",
    profileScope: "bootstrapping",
    mode: "overland",
    sourcePlaceId: "place-oxford",
    targetPlaceId: "place-kimberley",
    label: "Rhodes's Oxford ↔ Kimberley journeys",
    timeWindow: { start: "1873-10-13", end: "1881" },
    geometry: {
      type: "LineString",
      coordinates: [
        [-1.2577, 51.752],
        [24.7719, -28.7419],
      ],
    },
    provenance: {
      sourceRefs: [
        {
          artifactId:
            "antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/Research/Report3.md",
          unit: { kind: "text_span", startOffset: 0, endOffset: 400 },
        },
      ],
    },
    seedKey: "rhodes:oxford-kimberley",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "geo:rudolf-vienna-prague",
    profileScope: "bootstrapping",
    mode: "overland",
    sourcePlaceId: "place-vienna",
    targetPlaceId: "place-prague",
    label: "Rudolf II's court move Vienna → Prague (1583)",
    timeWindow: { start: "1583", end: "1612-01-20" },
    geometry: {
      type: "LineString",
      coordinates: [
        [16.3738, 48.2082],
        [14.4214, 50.0875],
      ],
    },
    provenance: { sourceRefs: [VOC_LANE_PASSAGE] },
    seedKey: "rudolf:vienna-to-prague",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "geo:cult-of-reason-paris",
    profileScope: "bootstrapping",
    mode: "overland",
    sourcePlaceId: "place-paris",
    targetPlaceId: "place-paris",
    label: "Cult of Reason at Notre-Dame, Paris (1793–94)",
    timeWindow: { start: "1793-11-10", end: "1794-06-08" },
    geometry: {
      type: "LineString",
      coordinates: [
        [2.3514, 48.8569],
        [2.1514, 48.8569],
        [2.3514, 48.6569],
        [2.5514, 48.8569],
        [2.3514, 49.0569],
        [2.3514, 48.8569],
      ],
    },
    provenance: { sourceRefs: [VOC_LANE_PASSAGE] },
    seedKey: "cult-of-reason:paris-events",
    createdAt: now,
    updatedAt: now,
  },
];

describe("geographyEdgeSchema", () => {
  it("accepts every real seeded lane (VOC, Rhodes, Rudolf II, Cult of Reason)", () => {
    for (const lane of REAL_LANES) {
      expect(
        geographyEdgeSchema.safeParse(lane).success,
        `lane ${lane.seedKey} must validate`,
      ).toBe(true);
    }
  });

  it("rejects unknown modes", () => {
    const result = geographyEdgeSchema.safeParse({
      ...REAL_LANES[0],
      mode: "balloon",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a time window whose end precedes its start", () => {
    expect(
      geographyEdgeTimeWindowSchema.safeParse({
        start: "1621-05-08",
        end: "1602-03-20",
      }).success,
    ).toBe(false);
    expect(
      geographyEdgeSchema.safeParse({
        ...REAL_LANES[0],
        timeWindow: { start: "1621-05-08", end: "1602-03-20" },
      }).success,
    ).toBe(false);
  });

  it("allows instants (start === end)", () => {
    expect(
      geographyEdgeTimeWindowSchema.safeParse({
        start: "1621-05-08",
        end: "1621-05-08",
      }).success,
    ).toBe(true);
  });

  it("rejects empty provenance (derived edges must point at corpus passages)", () => {
    expect(
      geographyEdgeSchema.safeParse({
        ...REAL_LANES[0],
        provenance: { sourceRefs: [] },
      }).success,
    ).toBe(false);
  });

  it("rejects a geometry with fewer than two positions", () => {
    expect(
      geographyEdgeSchema.safeParse({
        ...REAL_LANES[0],
        geometry: { type: "LineString", coordinates: [[4.8936, 52.3728]] },
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range GeoJSON positions", () => {
    expect(
      geographyEdgeSchema.safeParse({
        ...REAL_LANES[0],
        geometry: {
          type: "LineString",
          coordinates: [
            [4.8936, 52.3728],
            [190, 0],
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects a non-LineString geometry type", () => {
    expect(
      geographyEdgeSchema.safeParse({
        ...REAL_LANES[0],
        geometry: { type: "Point", coordinates: [4.8936, 52.3728] },
      }).success,
    ).toBe(false);
  });

  it("rejects blank place ids and blank seed keys", () => {
    expect(
      geographyEdgeSchema.safeParse({
        ...REAL_LANES[0],
        sourcePlaceId: "   ",
      }).success,
    ).toBe(false);
    expect(
      geographyEdgeSchema.safeParse({ ...REAL_LANES[0], seedKey: "" }).success,
    ).toBe(false);
  });
});

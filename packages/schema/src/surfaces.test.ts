import { describe, expect, it } from "vitest";

import {
  isoTemporalBoundSchema,
  passageNativeUnitSchema,
  passageRefSchema,
  placeCoordinateSchema,
  placeHierarchyEntrySchema,
  placeNameSchema,
  sceneLanguageVariantSchema,
  sceneSchema,
  sceneSequenceSchema,
  sceneTimeWindowSchema,
  subTimelineSchema,
  temporalPlaceSchema,
} from "./index";

const now = "2026-08-08T10:00:00.000Z";

const passage = {
  artifactId: "recording-001",
  unit: { kind: "timestamp_range", startMs: 12_000, endMs: 45_000 },
} as const;

const validPlace = {
  graphNodeId: "place-constantinople",
  names: [
    {
      language: "el",
      name: "Κωνσταντινούπολις",
      validFrom: "0330-05-11",
      validTo: "1453-05-29",
    },
    { language: "tr", name: "İstanbul", validFrom: "1453", validTo: null },
  ],
  coordinate: { precision: "exact", latitude: 41.0082, longitude: 28.9784 },
  hierarchy: [
    {
      parentPlaceId: "place-marmara-region",
      relationValidFrom: "0330",
      relationValidTo: null,
    },
  ],
  identityValidFrom: "0330",
  identityValidTo: null,
  externalRefs: [
    {
      gazetteer: "pleiades",
      id: "520998",
      url: "https://pleiades.stoa.org/places/520998",
    },
  ],
  provenance: {
    sourceRefs: [
      {
        artifactId: "transcript-001",
        unit: { kind: "text_span", startOffset: 12, endOffset: 34 },
      },
    ],
  },
};

const validScene = {
  id: "scene-arrival",
  profileScope: "migration",
  placeFrame: {
    placeId: "place-istanbul",
    validAt: { instant: "2021-07-14" },
  },
  timeWindow: { start: "2021-07-01", end: "2021-08-01" },
  people: [{ graphNodeId: "figure-aya", role: "storyteller" }],
  passages: [passage],
  languageVariants: [
    {
      id: "variant-ar-1",
      language: "ar",
      kind: "voice_passage_translation",
      sourcePassageRef: passage,
      derivedArtifactId: "transcript-ar-1",
      provenance: { sourceRefs: [passage] },
    },
  ],
  title: "Arrival",
  narration: "Derived narration.",
  assembledBy: "agent",
  curationEvents: [{ type: "pin", at: now, detail: "anchored chamber" }],
  nestedSequenceIds: [],
  createdAt: now,
  updatedAt: now,
};

describe("isoTemporalBoundSchema", () => {
  it("accepts year, year-month, year-month-day, and full datetimes", () => {
    for (const value of [
      "1453",
      "1453-05",
      "1453-05-29",
      "1453-05-29T12:00:00Z",
      "1453-05-29 12:00:00.000+02:00",
    ]) {
      expect(isoTemporalBoundSchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects malformed and impossible calendar values", () => {
    for (const value of ["not-a-date", "2026-13-01", "2026-02-30", "1453-05-29T25:00:00Z"]) {
      expect(isoTemporalBoundSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("placeCoordinateSchema", () => {
  it("accepts exact and approximate points within WGS84 bounds", () => {
    for (const coordinate of [
      { precision: "exact", latitude: 41.0082, longitude: 28.9784 },
      { precision: "approximate", latitude: -33.86, longitude: 151.2 },
    ]) {
      expect(placeCoordinateSchema.safeParse(coordinate).success).toBe(true);
    }
  });

  it("rejects out-of-range coordinates", () => {
    expect(
      placeCoordinateSchema.safeParse({
        precision: "exact",
        latitude: 91,
        longitude: 28.9784,
      }).success,
    ).toBe(false);
    expect(
      placeCoordinateSchema.safeParse({
        precision: "approximate",
        latitude: 0,
        longitude: 181,
      }).success,
    ).toBe(false);
  });

  it("requires region precision to carry polygon geometry, not a point", () => {
    expect(
      placeCoordinateSchema.safeParse({
        precision: "region",
        latitude: 41.0082,
        longitude: 28.9784,
      }).success,
    ).toBe(false);
    expect(
      placeCoordinateSchema.safeParse({
        precision: "region",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [28.9, 41.0],
              [29.0, 41.0],
              [29.0, 41.1],
              [28.9, 41.1],
              [28.9, 41.0],
            ],
          ],
        },
      }).success,
    ).toBe(true);
  });

  it("rejects unclosed rings and point-in-region precision drift", () => {
    expect(
      placeCoordinateSchema.safeParse({
        precision: "region",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [28.9, 41.0],
              [29.0, 41.0],
              [29.0, 41.1],
              [28.9, 41.1],
            ],
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      placeCoordinateSchema.safeParse({
        precision: "unlocated",
        latitude: 41.0082,
        longitude: 28.9784,
      }).success,
    ).toBe(false);
  });
});

describe("placeNameSchema", () => {
  it("enforces name-level time-bounded ordering", () => {
    expect(
      placeNameSchema.safeParse({
        language: "el",
        name: "Κωνσταντινούπολις",
        validFrom: "1453-05-29",
        validTo: "330-05-11",
      }).success,
    ).toBe(false);
  });

  it("allows coarse year-only bounds where precision is deliberately low", () => {
    expect(
      placeNameSchema.safeParse({
        language: "tr",
        name: "İstanbul",
        validFrom: "1453",
        validTo: "2026-01-01",
      }).success,
    ).toBe(true);
  });
});

describe("temporalPlaceSchema", () => {
  it("accepts a fully specified Temporal Place", () => {
    const result = temporalPlaceSchema.safeParse(validPlace);
    expect(result.success).toBe(true);
  });

  it("requires at least one name", () => {
    expect(
      temporalPlaceSchema.safeParse({ ...validPlace, names: [] }).success,
    ).toBe(false);
  });

  it("rejects duplicate names", () => {
    expect(
      temporalPlaceSchema.safeParse({
        ...validPlace,
        names: [
          { language: "en", name: "Istanbul" },
          { language: "en", name: "Istanbul" },
        ],
      }).success,
    ).toBe(false);
  });

  it("enforces identity-level bound ordering", () => {
    expect(
      temporalPlaceSchema.safeParse({
        ...validPlace,
        identityValidFrom: "2026-01-01",
        identityValidTo: "2026-01-01T00:00:00Z",
      }).success,
    ).toBe(true);
    expect(
      temporalPlaceSchema.safeParse({
        ...validPlace,
        identityValidFrom: "2026-02-01",
        identityValidTo: "2026-01-01",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown gazetteer kinds", () => {
    expect(
      temporalPlaceSchema.safeParse({
        ...validPlace,
        externalRefs: [{ gazetteer: "google-maps", id: "x" }],
      }).success,
    ).toBe(false);
  });
});

describe("passageNativeUnitSchema", () => {
  it("requires non-empty text spans", () => {
    expect(
      passageNativeUnitSchema.safeParse({
        kind: "text_span",
        startOffset: 10,
        endOffset: 10,
      }).success,
    ).toBe(false);
  });

  it("requires timestamp ranges to run forward", () => {
    expect(
      passageNativeUnitSchema.safeParse({
        kind: "timestamp_range",
        startMs: 5000,
        endMs: 1000,
      }).success,
    ).toBe(false);
  });

  it("keeps image regions inside the unit square", () => {
    expect(
      passageNativeUnitSchema.safeParse({
        kind: "image_region",
        x: 0.8,
        y: 0.8,
        width: 0.3,
        height: 0.3,
      }).success,
    ).toBe(false);
  });
});

describe("sceneSchema", () => {
  it("accepts a valid scene with derived language variants", () => {
    expect(sceneSchema.safeParse(validScene).success).toBe(true);
  });

  it("rejects a place frame outside the scene time window", () => {
    expect(
      sceneSchema.safeParse({
        ...validScene,
        placeFrame: {
          placeId: "place-istanbul",
          validAt: { instant: "2021-09-14" },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects a time window whose end precedes its start", () => {
    expect(
      sceneTimeWindowSchema.safeParse({
        start: "2021-08-01",
        end: "2021-07-01",
      }).success,
    ).toBe(false);
  });

  it("rejects language variants not anchored to a scene passage", () => {
    expect(
      sceneSchema.safeParse({
        ...validScene,
        languageVariants: [
          {
            ...validScene.languageVariants[0],
            sourcePassageRef: {
              artifactId: "other-recording",
              unit: { kind: "text_span", startOffset: 0, endOffset: 3 },
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate people refs", () => {
    expect(
      sceneSchema.safeParse({
        ...validScene,
        people: [
          { graphNodeId: "figure-aya", role: "storyteller" },
          { graphNodeId: "figure-aya", role: "storyteller" },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects uncontrolled assembler and curation values", () => {
    expect(
      sceneSchema.safeParse({
        ...validScene,
        assembledBy: "system",
      }).success,
    ).toBe(false);
    expect(
      sceneSchema.safeParse({
        ...validScene,
        curationEvents: [{ type: "delete", at: now }],
      }).success,
    ).toBe(false);
  });
});

describe("sceneSequenceSchema", () => {
  it("accepts an ordered sequence and rejects duplicate scenes", () => {
    const sequence = {
      id: "sequence-journey",
      profileScope: "migration",
      name: "The journey",
      sceneIds: ["scene-origin", "scene-transit", "scene-destination"],
      subTimelineId: "timeline-route",
      createdAt: now,
      updatedAt: now,
    };
    expect(sceneSequenceSchema.safeParse(sequence).success).toBe(true);
    expect(
      sceneSequenceSchema.safeParse({
        ...sequence,
        sceneIds: ["scene-origin", "scene-origin"],
      }).success,
    ).toBe(false);
  });
});

describe("subTimelineSchema", () => {
  it("accepts an Earth zero-case frame and rejects unknown spatial frames", () => {
    const timeline = {
      id: "timeline-earth",
      frameNodeId: "workspace-root",
      spatialFrame: "earth",
      nestedTimelineIds: ["timeline-istanbul"],
      transTemporalNodeIds: ["archetype-dragon", "dynamic-power"],
      createdAt: now,
      updatedAt: now,
    };
    expect(subTimelineSchema.safeParse(timeline).success).toBe(true);
    expect(
      subTimelineSchema.safeParse({ ...timeline, spatialFrame: "universe" })
        .success,
    ).toBe(false);
  });
});

describe("passageRefSchema cross-check", () => {
  it("round-trips stable keys used to anchor language variants", () => {
    expect(passageRefSchema.safeParse(passage).success).toBe(true);
    expect(sceneLanguageVariantSchema.safeParse({
      id: "v",
      language: "ar",
      kind: "voice_passage_translation",
      sourcePassageRef: passage,
      derivedArtifactId: "d",
      provenance: { sourceRefs: [passage] },
    }).success).toBe(true);
  });

  it("rejects hierarchy entries whose membership interval is inverted", () => {
    expect(
      placeHierarchyEntrySchema.safeParse({
        parentPlaceId: "place-region",
        relationValidFrom: "2026-02-01",
        relationValidTo: "2026-01-01",
      }).success,
    ).toBe(false);
  });
});

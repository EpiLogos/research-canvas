import { describe, expect, test } from "vitest";

import type { Scene } from "@research-canvas/schema";

import { presentStoryScene } from "./storyPresentation";

function scene(over: Partial<Scene> = {}): Scene {
  return {
    id: "scene-arrival",
    profileScope: "migration",
    placeFrame: {
      placeId: "pleiades:520998",
      validAt: { instant: "2021-07-14" },
    },
    timeWindow: { start: "2021-07-01", end: "2021-08-01" },
    people: [],
    passages: [
      {
        artifactId: "recording-001",
        unit: { kind: "timestamp_range", startMs: 12000, endMs: 45000 },
      },
      {
        artifactId: "recording-001",
        unit: { kind: "timestamp_range", startMs: 60000, endMs: 90000 },
      },
    ],
    consents: [],
    redactions: [],
    languageVariants: [
      {
        id: "variant-ar-1",
        language: "ar",
        kind: "voice_passage_translation",
        sourcePassageRef: {
          artifactId: "recording-001",
          unit: { kind: "timestamp_range", startMs: 12000, endMs: 45000 },
        },
        derivedArtifactId: "translations/ar/arrival.vtt",
        provenance: {
          sourceRefs: [
            {
              artifactId: "recording-001",
              unit: { kind: "timestamp_range", startMs: 12000, endMs: 45000 },
            },
          ],
        },
      },
    ],
    title: "Arrival",
    assembledBy: "agent",
    curationEvents: [],
    nestedSequenceIds: [],
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
    ...over,
  };
}

describe("presentStoryScene", () => {
  test("publishes only captured-consent passages and reports redactions", () => {
    const view = presentStoryScene({
      scene: scene(),
      consents: [
        {
          passageRef: {
            artifactId: "recording-001",
            unit: { kind: "timestamp_range", startMs: 12000, endMs: 45000 },
          },
          state: "captured",
          scope: "publication",
          capturedAt: "2026-08-08T10:00:00.000Z",
        },
      ],
      redactions: [
        {
          passageRef: {
            artifactId: "recording-001",
            unit: { kind: "timestamp_range", startMs: 12000, endMs: 45000 },
          },
          startOffset: 2,
          endOffset: 5,
        },
      ],
    });

    expect(view.passages).toHaveLength(1);
    expect(view.passages[0].redacted).toBe(true);
    expect(view.passages[0].gaps).toEqual([{ startOffset: 2, endOffset: 5 }]);
  });

  test("withdrawn consent and missing consent never publish", () => {
    const withdrawn = presentStoryScene({
      scene: scene(),
      consents: [
        {
          passageRef: {
            artifactId: "recording-001",
            unit: { kind: "timestamp_range", startMs: 12000, endMs: 45000 },
          },
          state: "withdrawn",
          scope: "publication",
          capturedAt: "2026-08-01T10:00:00.000Z",
          withdrawnAt: "2026-08-02T10:00:00.000Z",
        },
      ],
      redactions: [],
    });
    expect(withdrawn.passages).toHaveLength(0);

    const none = presentStoryScene({
      scene: scene(),
      consents: [],
      redactions: [],
    });
    expect(none.passages).toHaveLength(0);
  });

  test("language switching exposes derived variants without touching the canonical original", () => {
    const view = presentStoryScene({
      scene: scene(),
      consents: [
        {
          passageRef: {
            artifactId: "recording-001",
            unit: { kind: "timestamp_range", startMs: 12000, endMs: 45000 },
          },
          state: "captured",
          scope: "publication",
          capturedAt: "2026-08-08T10:00:00.000Z",
        },
      ],
      redactions: [],
      language: "ar",
      transcriptPath: "transcripts/arrival.vtt",
    });

    expect(view.language).toBe("ar");
    expect(view.availableLanguages).toEqual(["original", "ar"]);
    expect(view.transcriptPath).toBe("transcripts/arrival.vtt");
    // The underlying scene keeps its canonical original untouched.
    expect(view.title).toBe("Arrival");
  });

  test("passes through the place's redacted street-view imagery and walk context", () => {
    const streetViewImages = [
      {
        id: "sv-arrival-1",
        artifactPath: "street-view/imported/arrival.png",
        redactionStatus: "redacted",
        redactedArtifactPath: "redacted/sv-arrival-1.png",
        capturedAt: "2026-08-01T10:00:00.000Z",
        latitude: 41.0082,
        longitude: 28.9784,
        headingDegrees: 90,
      },
    ];
    const walkContext = {
      coordinate: { latitude: 41.0082, longitude: 28.9784 },
      route: [
        { latitude: 40.0, longitude: 28.0 },
        { latitude: 41.0082, longitude: 28.9784 },
      ],
    };
    const view = presentStoryScene({
      scene: scene(),
      consents: [],
      redactions: [],
      streetViewImages,
      walkContext,
    });

    expect(view.streetViewImages).toEqual(streetViewImages);
    expect(view.walkContext).toEqual(walkContext);
  });

  test("defaults street-view imagery to empty and walk context to null", () => {
    const view = presentStoryScene({
      scene: scene(),
      consents: [],
      redactions: [],
    });

    expect(view.streetViewImages).toEqual([]);
    expect(view.walkContext).toBeNull();
  });
});

import { describe, expect, test } from "vitest";
import {
  sceneSchema,
  sceneSequenceSchema,
  type Scene,
  type SceneSequence,
} from "@research-canvas/schema";

import { buildKeepsakeManifest, type KeepsakeInput } from "./keepsake";

const passage = {
  artifactId: "recording-001",
  unit: { kind: "timestamp_range", startMs: 12_000, endMs: 45_000 } as const,
};

function scene(over: Partial<Scene> = {}): Scene {
  return sceneSchema.parse({
    id: "scene-arrival",
    profileScope: "migration",
    placeFrame: { placeId: "wikidata:Q913", validAt: { instant: "2021-07-14" } },
    timeWindow: { start: "2021-07-01", end: "2021-08-01" },
    people: [],
    passages: [passage],
    consents: [],
    redactions: [],
    languageVariants: [],
    assembledBy: "agent",
    curationEvents: [],
    nestedSequenceIds: [],
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
    ...over,
  });
}

function sequence(sceneIds: string[]): SceneSequence {
  return sceneSequenceSchema.parse({
    id: "sequence-journey",
    profileScope: "migration",
    name: "The journey",
    sceneIds,
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
  });
}

function input(over: Partial<KeepsakeInput> = {}): KeepsakeInput {
  return {
    sequence: sequence(["scene-arrival"]),
    scenes: [scene()],
    consents: [
      {
        passageRef: passage,
        state: "captured",
        scope: "publication",
        capturedAt: "2026-08-08T10:00:00.000Z",
      },
    ],
    redactions: [],
    mediaForScene: () => ["media/arrival.mp3", "transcripts/arrival.ar.vtt"],
    walk: [
      {
        sceneId: "scene-arrival",
        placeId: "wikidata:Q913",
        title: "Arrival",
        coordinate: { latitude: 41.0082, longitude: 28.9784 },
      },
    ],
    ...over,
  };
}

describe("buildKeepsakeManifest", () => {
  test("builds a self-contained consent-filtered bundle in sequence order", () => {
    const manifest = buildKeepsakeManifest(input());
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.profileScope).toBe("migration");
    expect(manifest.scenes.map((entry) => entry.sceneId)).toEqual([
      "scene-arrival",
    ]);
    expect(manifest.scenes[0].passages).toHaveLength(1);
    expect(manifest.media).toEqual([
      "media/arrival.mp3",
      "transcripts/arrival.ar.vtt",
    ]);
    expect(manifest.walk).toEqual([
      { latitude: 41.0082, longitude: 28.9784 },
    ]);
  });

  test("consent filtering excludes passages without captured publication consent", () => {
    const manifest = buildKeepsakeManifest(
      input({ consents: [], redactions: [] }),
    );
    expect(manifest.scenes[0].passages).toEqual([]);
  });

  test("redacted spans export as gaps on consented passages", () => {
    const manifest = buildKeepsakeManifest(
      input({
        redactions: [
          {
            passageRef: passage,
            startOffset: 1,
            endOffset: 3,
          },
        ],
      }),
    );
    expect(manifest.scenes[0].passages[0].gaps).toEqual([
      { startOffset: 1, endOffset: 3 },
    ]);
  });

  test("refuses absolute or traversal paths so the bundle stays portable", () => {
    expect(() =>
      buildKeepsakeManifest(
        input({ mediaForScene: () => ["/Users/admin/media/arrival.mp3"] }),
      ),
    ).toThrow(/non-portable/);
    expect(() =>
      buildKeepsakeManifest(
        input({ mediaForScene: () => ["file:///etc/passwd"] }),
      ),
    ).toThrow(/non-portable/);
  });

  test("carries the place's redacted street-view imagery and walk context, copying image paths into media", () => {
    const manifest = buildKeepsakeManifest(
      input({
        streetViewImagesForScene: () => [
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
        ],
      }),
    );
    const scene = manifest.scenes[0];
    expect(scene.streetViewImages).toHaveLength(1);
    // The redacted derived copy is the portable asset a scene ships.
    expect(scene.streetViewImages[0].redactedArtifactPath).toBe(
      "redacted/sv-arrival-1.png",
    );
    expect(scene.walkContext).toEqual({
      coordinate: { latitude: 41.0082, longitude: 28.9784 },
      route: [{ latitude: 41.0082, longitude: 28.9784 }],
    });
    // The street-view image lands in top-level media so the bundle writer
    // copies it alongside the audio and transcripts.
    expect(manifest.media).toContain("redacted/sv-arrival-1.png");
  });

  test("uses the original capture path when a capture needed no redaction", () => {
    const manifest = buildKeepsakeManifest(
      input({
        streetViewImagesForScene: () => [
          {
            id: "sv-arrival-1",
            artifactPath: "street-view/imported/arrival.png",
            redactionStatus: "none_needed",
            redactedArtifactPath: null,
            capturedAt: null,
            latitude: null,
            longitude: null,
            headingDegrees: null,
          },
        ],
      }),
    );
    expect(manifest.media).toContain("street-view/imported/arrival.png");
    expect(manifest.scenes[0].streetViewImages[0].redactionStatus).toBe(
      "none_needed",
    );
  });

  test("never ships pending street-view imagery, even when a caller supplies it", () => {
    const manifest = buildKeepsakeManifest(
      input({
        streetViewImagesForScene: () => [
          {
            id: "sv-arrival-pending",
            artifactPath: "street-view/imported/pending.png",
            redactionStatus: "pending",
            redactedArtifactPath: null,
            capturedAt: null,
            latitude: null,
            longitude: null,
            headingDegrees: null,
          },
          {
            id: "sv-arrival-1",
            artifactPath: "street-view/imported/arrival.png",
            redactionStatus: "redacted",
            redactedArtifactPath: "redacted/sv-arrival-1.png",
            capturedAt: null,
            latitude: null,
            longitude: null,
            headingDegrees: null,
          },
        ],
      }),
    );
    expect(manifest.scenes[0].streetViewImages).toHaveLength(1);
    expect(manifest.scenes[0].streetViewImages[0].id).toBe("sv-arrival-1");
    // The pending original is not copied into the bundle.
    expect(manifest.media).not.toContain("street-view/imported/pending.png");
    expect(manifest.media).toContain("redacted/sv-arrival-1.png");
  });

  test("refuses non-portable street-view image paths", () => {
    expect(() =>
      buildKeepsakeManifest(
        input({
          streetViewImagesForScene: () => [
            {
              id: "sv-arrival-1",
              artifactPath: "/Users/admin/street-view/imported/arrival.png",
              redactionStatus: "none_needed",
              redactedArtifactPath: null,
              capturedAt: null,
              latitude: null,
              longitude: null,
              headingDegrees: null,
            },
          ],
        }),
      ),
    ).toThrow(/non-portable/);
  });
});

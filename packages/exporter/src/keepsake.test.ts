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
});

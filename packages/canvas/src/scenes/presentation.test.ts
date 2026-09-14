import { describe, expect, test } from "vitest";
import { sceneSchema, type Scene } from "@research-canvas/schema";

import { CANONICAL_LANGUAGE, presentScene } from "./presentation";

const passage = {
  artifactId: "recording-001",
  unit: { kind: "timestamp_range", startMs: 12_000, endMs: 45_000 },
};

function scene(over: Partial<Scene> = {}): Scene {
  return sceneSchema.parse({
    id: "scene-arrival",
    profileScope: "migration",
    placeFrame: { placeId: "wikidata:Q913", validAt: { instant: "2021-07-14" } },
    timeWindow: { start: "2021-07-01", end: "2021-08-01" },
    people: [],
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
    assembledBy: "agent",
    curationEvents: [],
    nestedSequenceIds: [],
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
    ...over,
  });
}

describe("presentScene", () => {
  test("the canonical original is the default and never disappears from the picker", () => {
    const presentation = presentScene(scene());
    expect(presentation.language).toBe(CANONICAL_LANGUAGE);
    expect(presentation.availableLanguages).toEqual(["original", "ar"]);
    expect(presentation.passageLanguageRefs[0].variantId).toBeNull();
  });

  test("switching language activates derived variants without touching the original", () => {
    const presentation = presentScene(scene(), "ar");
    expect(presentation.passageLanguageRefs[0].variantId).toBe("variant-ar-1");
    expect(presentation.scene.languageVariants[0].derivedArtifactId).toBe(
      "transcript-ar-1",
    );
  });

  test("an unknown language falls back to canonical passages", () => {
    const presentation = presentScene(scene(), "de");
    expect(presentation.passageLanguageRefs[0].variantId).toBeNull();
  });
});

import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";

import type { Scene, SceneSequence } from "@research-canvas/schema";
import { buildKeepsakeManifest } from "@research-canvas/exporter";

import { PipelineRail } from "../../layout/PipelineRail";
import type { PipelineStageId } from "../pipeline/pipelineStages";

const NOW = "2026-01-01T00:00:00.000Z";

/**
 * Test-local compatibility fixture. T15 deliberately removed the former
 * production migration-story seeder; the historical internal ids still matter
 * for wording compatibility, so the test owns the minimum legacy record shape
 * instead of reintroducing a feature-level seed path.
 */
function legacyJourneyFixture(): { sequence: SceneSequence; scenes: Scene[] } {
  const scenes: Scene[] = [
    legacyScene(
      "migration:journey:prague",
      "place:prague",
      "Rudolf II's Prague",
      "1576-01-01",
      "1612-12-31",
    ),
    legacyScene(
      "migration:journey:amsterdam",
      "place:amsterdam",
      "The VOC in Amsterdam",
      "1602-01-01",
      "1602-12-31",
    ),
  ];
  return {
    sequence: {
      id: "migration:journey:prague-amsterdam",
      profileScope: "migration",
      name: "A journey over located events",
      sceneIds: scenes.map((scene) => scene.id),
      createdAt: NOW,
      updatedAt: NOW,
    },
    scenes,
  };
}

function legacyScene(
  id: string,
  placeId: string,
  title: string,
  start: string,
  end: string,
): Scene {
  return {
    id,
    profileScope: "migration",
    placeFrame: { placeId, validAt: { instant: start } },
    timeWindow: { start, end },
    people: [],
    passages: [],
    consents: [],
    redactions: [],
    languageVariants: [],
    title,
    narration: title,
    assembledBy: "agent",
    curationEvents: [],
    nestedSequenceIds: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

/**
 * Wording sweep: historical internal `migration` keys may survive in stored
 * records, while visible journey and export language remains domain-neutral.
 */
describe("story wording sweep", () => {
  test("legacy internal migration keys do not leak into journey or keepsake wording", () => {
    const { sequence, scenes } = legacyJourneyFixture();

    const visibleJourneyStrings = [
      sequence.name ?? "",
      ...scenes.flatMap((scene) => [scene.title ?? "", scene.narration ?? ""]),
    ];
    for (const value of visibleJourneyStrings) {
      expect(value).not.toMatch(/migration/i);
    }

    const manifest = buildKeepsakeManifest({
      sequence,
      scenes,
      consents: [],
      redactions: [],
      mediaForScene: () => [],
      walk: scenes.map((scene) => ({
        sceneId: scene.id,
        placeId: scene.placeFrame.placeId,
        title: scene.title ?? scene.placeFrame.placeId,
        coordinate: null,
      })),
      streetViewImagesForScene: () => [],
    });
    const visibleExportStrings = [
      manifest.title,
      ...manifest.scenes.map((entry) => entry.title),
    ];
    for (const value of visibleExportStrings) {
      expect(value).not.toMatch(/migration/i);
    }

    expect(sequence.id.startsWith("migration:journey:")).toBe(true);
    expect(sequence.profileScope).toBe("migration");
    for (const scene of scenes) {
      expect(scene.id.startsWith("migration:journey:")).toBe(true);
      expect(scene.profileScope).toBe("migration");
    }
  });

  test("the shell's story lens is labelled Journeys, not a migration story", () => {
    render(
      <PipelineRail
        lens="story"
        onSetLens={() => {}}
        onOpenPalette={() => {}}
        stageCounts={
          {
            constellations: 0,
            timeline: 0,
            places: 0,
            stories: 0,
            palace: 0,
          } satisfies Record<PipelineStageId, number>
        }
      />,
    );
    expect(screen.getByTestId("lens-story")).toHaveTextContent("Journeys");
    expect(screen.getByRole("tab", { name: "Journeys" })).toBeInTheDocument();
    expect(screen.queryByText(/migration/i)).toBeNull();
  });
});

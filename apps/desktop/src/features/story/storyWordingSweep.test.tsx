import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type {
  WorkspaceTransport,
} from "@research-canvas/desktop-api";
import type { Scene, SceneSequence } from "@research-canvas/schema";
import { assembleWalk, loadBundledGeographyPack } from "@research-canvas/canvas";
import { buildKeepsakeManifest } from "@research-canvas/exporter";

import { PipelineRail } from "../../layout/PipelineRail";
import type { PipelineStageId } from "../pipeline/pipelineStages";
import { timelineView } from "../psychogeographic/walkFixture";
import { ensureMigrationStorySeed } from "./seedMigrationStory";

const REPORT_8 = `# Report 8

## Rudolf II's Prague: where alchemy met astronomy

Before the catastrophe, one Habsburg court assembled the
whole apparatus of the hidden-hand imaginary in a single room: alchemists,
astronomers, and the Kunstkammer's collection of wonders.

## The VOC: first corporate sovereign

On 20 March 1602, the States General of the Dutch Republic chartered a
corporation with the right to wage war, coin money, and conclude treaties.

## The Banda genocide

The company's first consolidated colonial enterprise was the violent
enclosure of the Banda Islands' nutmeg production.

## The Revolution's failed experiments with manufactured religion

The French Revolution's Festival of Reason attempted to manufacture a
replacement for the religious authority it had destroyed.
`;

vi.mock("@research-canvas/desktop-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@research-canvas/desktop-api")>();
  return {
    ...actual,
    readWorkspaceTextFile: vi.fn(async (path: string) => {
      if (!path.endsWith("Report8.md")) {
        throw new Error(`unexpected corpus read: ${path}`);
      }
      return REPORT_8;
    }),
  };
});

function transportFixture(): {
  transport: WorkspaceTransport;
  savedScenes: Scene[];
  savedSequences: SceneSequence[];
} {
  const savedScenes: Scene[] = [];
  const savedSequences: SceneSequence[] = [];
  const transport = {
    async loadTimelineView() {
      return timelineView();
    },
    async listScenes() {
      return savedScenes;
    },
    async listSceneSequences() {
      return savedSequences;
    },
    async upsertScene({ scene }: { scene: Scene }) {
      const existing = savedScenes.findIndex((candidate) => candidate.id === scene.id);
      if (existing >= 0) savedScenes[existing] = scene;
      else savedScenes.push(scene);
      return scene;
    },
    async upsertSceneSequence({ sequence }: { sequence: SceneSequence }) {
      const existing = savedSequences.findIndex(
        (candidate) => candidate.id === sequence.id,
      );
      if (existing >= 0) savedSequences[existing] = sequence;
      else savedSequences.push(sequence);
      return sequence;
    },
  } as unknown as WorkspaceTransport;
  return { transport, savedScenes, savedSequences };
}

/**
 * Wording sweep (refinement-2 D4, ticket #21): no migration-only claims may
 * reach the user — the visible label is a journey over located events. The
 * internal `migration` profile-scope key, `migration:journey:` seed ids, and
 * `seed:migration-journey` passage prefix stay untouched for data
 * compatibility; this sweep proves the two never mix.
 */
describe("story wording sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("the seeded journey, its scenes, and its keepsake carry no migration-only claims", async () => {
    const { transport, savedScenes, savedSequences } = transportFixture();
    const pack = loadBundledGeographyPack();

    const result = await ensureMigrationStorySeed({
      transport,
      databasePath: "/tmp/ws.sqlite",
      workspaceId: "sqlite:/tmp/ws",
      corpusRoot: "/tmp/ws",
      gazetteer: pack.gazetteer,
      profileScope: "migration",
    });

    expect(result.seeded).toBe(true);

    // Visible seed narrative: sequence name, scene titles, narrations.
    const visibleSeedStrings = [
      result.sequence?.name ?? "",
      ...savedScenes.flatMap((scene) => [
        scene.title ?? "",
        scene.narration ?? "",
      ]),
    ];
    for (const value of visibleSeedStrings) {
      expect(value).not.toMatch(/migration/i);
    }

    // Keepsake export visible strings: manifest title and scene titles.
    const stops = assembleWalk(
      savedSequences[0] as SceneSequence,
      savedScenes,
      pack.gazetteer,
    );
    const manifest = buildKeepsakeManifest({
      sequence: savedSequences[0] as SceneSequence,
      scenes: savedScenes,
      consents: savedScenes.flatMap((scene) => scene.consents),
      redactions: savedScenes.flatMap((scene) => scene.redactions),
      mediaForScene: () => [],
      walk: stops,
      streetViewImagesForScene: () => [],
    });
    const visibleExportStrings = [
      manifest.title,
      ...manifest.scenes.map((entry) => entry.title),
    ];
    for (const value of visibleExportStrings) {
      expect(value).not.toMatch(/migration/i);
    }

    // Internal keys survive intact — the sweep must not break data compat.
    expect(result.sequence?.id.startsWith("migration:journey:")).toBe(true);
    expect(result.sequence?.profileScope).toBe("migration");
    for (const scene of savedScenes) {
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

import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  WorkspaceTransport,
} from "@research-canvas/desktop-api";
import type { Scene, SceneSequence } from "@research-canvas/schema";
import { loadBundledGeographyPack } from "@research-canvas/canvas";

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

describe("ensureMigrationStorySeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("assembles a located journey over real corpus places", async () => {
    const { transport, savedScenes, savedSequences } = transportFixture();
    const pack = loadBundledGeographyPack();

    const result = await ensureMigrationStorySeed({
      transport,
      databasePath: "/tmp/ws.sqlite",
      workspaceId: "sqlite:/tmp/ws",
      corpusRoot: "/tmp/ws",
      gazetteer: pack.gazetteer,
    });

    expect(result.seeded).toBe(true);
    // The visible narrative is a neutral journey over located events — the
    // internal `migration:journey:` ids and storage keys stay untouched.
    expect(result.sequence?.name).toBe("A journey over located events");
    expect(result.sequence?.id.startsWith("migration:journey:")).toBe(true);
    // Intended consequence of the Task-3 gazetteer enrichment: the Banda
    // Islands now resolve in the bundled offline pack, so the journey grew
    // from 3 to 4 gazetteer-resolved scenes (Banda Islands sits between
    // Amsterdam and Paris, matching the VOC's historical route).
    expect(result.sequence?.sceneIds).toHaveLength(4);
    // Chronological distinct gazetteer-resolved places: Prague, Amsterdam,
    // Banda Islands, Paris.
    expect(result.sequence?.sceneIds).toEqual([
      "migration:journey:prague",
      "migration:journey:amsterdam",
      "migration:journey:banda-islands",
      "migration:journey:paris",
    ]);
    expect(savedSequences).toHaveLength(1);
    expect(savedScenes).toHaveLength(4);

    const prague = savedScenes.find((scene) => scene.id === "migration:journey:prague");
    expect(prague?.placeFrame.placeId).toBe("wikidata:Q1085");
    expect(prague?.timeWindow).toEqual({ start: "1576-01-01", end: "1612-12-31" });
    expect(prague?.title).toBe("Rudolf II's Prague");
    expect(prague?.narration).toContain("alchemy");
    expect(prague?.narration).toContain("astronomy");

    // Passages anchor at real corpus files with real measured offsets.
    expect(prague?.passages).toHaveLength(1);
    const passage = prague?.passages[0];
    expect(passage?.artifactId).toContain("Report8.md");
    expect(passage?.unit.kind).toBe("text_span");
    if (passage?.unit.kind === "text_span") {
      expect(passage.unit.endOffset).toBeGreaterThan(passage.unit.startOffset);
    }

    // Every scene carries captured publication consent for its passage.
    for (const scene of savedScenes) {
      expect(scene.consents).toHaveLength(scene.passages.length);
      for (const consent of scene.consents) {
        expect(consent.state).toBe("captured");
        expect(consent.scope).toBe("publication");
      }
    }

    // One scene has a real redacted sub-span inside its corpus section.
    const redactedScene = savedScenes.find(
      (scene) => scene.redactions.length > 0,
    );
    expect(redactedScene).toBeDefined();
    const redaction = redactedScene?.redactions[0];
    const anchoredPassage = redactedScene?.passages[0];
    expect(redaction?.passageRef).toEqual(anchoredPassage);
    if (anchoredPassage?.unit.kind === "text_span" && redaction) {
      expect(redaction.endOffset).toBeGreaterThan(redaction.startOffset);
      expect(redaction.startOffset).toBeGreaterThanOrEqual(anchoredPassage.unit.startOffset);
      expect(redaction.endOffset).toBeLessThanOrEqual(anchoredPassage.unit.endOffset);
    }

    // One scene carries one derived French language variant anchored to a
    // passage that actually exists in the scene.
    const variantScene = savedScenes.find(
      (scene) => scene.languageVariants.length === 1,
    );
    expect(variantScene).toBeDefined();
    expect(variantScene?.languageVariants[0]?.language).toBe("fr");
    expect(
      variantScene?.passages.some(
        (passage) =>
          JSON.stringify(passage) ===
          JSON.stringify(variantScene?.languageVariants[0]?.sourcePassageRef),
      ),
    ).toBe(true);
  });

  test("keeps the visible narrative agnostic while preserving internal seed keys", async () => {
    const { transport, savedScenes, savedSequences } = transportFixture();
    const pack = loadBundledGeographyPack();

    const result = await ensureMigrationStorySeed({
      transport,
      databasePath: "/tmp/ws.sqlite",
      workspaceId: "sqlite:/tmp/ws",
      corpusRoot: "/tmp/ws",
      gazetteer: pack.gazetteer,
    });

    expect(result.seeded).toBe(true);
    // Visible strings never carry migration-only framing: the journey name,
    // every scene title, and every scene narration are agnostic.
    expect(result.sequence?.name).toMatch(/journey/i);
    expect(result.sequence?.name).not.toMatch(/migration/i);
    for (const scene of savedScenes) {
      expect(scene.title).not.toMatch(/migration/i);
      expect(scene.narration ?? "").not.toMatch(/migration/i);
    }
    // Internal storage keys stay untouched for data compatibility: the
    // profile-scope key, scene ids, sequence id, and passage source prefix.
    for (const scene of savedScenes) {
      expect(scene.id.startsWith("migration:journey:")).toBe(true);
      expect(scene.profileScope).toBe("migration");
    }
    expect(savedSequences[0]?.id.startsWith("migration:journey:")).toBe(true);
    expect(savedSequences[0]?.profileScope).toBe("migration");
  });

  test("is idempotent and never rewrites an existing journey", async () => {
    const { transport, savedScenes, savedSequences } = transportFixture();
    const pack = loadBundledGeographyPack();
    const input = {
      transport,
      databasePath: "/tmp/ws.sqlite",
      workspaceId: "sqlite:/tmp/ws",
      corpusRoot: "/tmp/ws",
      gazetteer: pack.gazetteer,
    };

    const first = await ensureMigrationStorySeed(input);
    expect(first.seeded).toBe(true);
    const scenesAfterFirst = savedScenes.map((scene) => ({ ...scene }));
    const sequencesAfterFirst = savedSequences.map((sequence) => ({ ...sequence }));

    const second = await ensureMigrationStorySeed(input);
    expect(second.seeded).toBe(false);
    expect(second.sequence?.id).toBe(first.sequence?.id);
    expect(savedScenes).toEqual(scenesAfterFirst);
    expect(savedSequences).toEqual(sequencesAfterFirst);
  });

  test("leaves a workspace untouched when no located events exist", async () => {
    const { transport, savedScenes, savedSequences } = transportFixture();
    const pack = loadBundledGeographyPack();
    const emptyTransport = {
      ...transport,
      async loadTimelineView() {
        return {
          workspaceId: "sqlite:/tmp/ws",
          nodes: [],
          relationships: [],
          lanes: [],
          diagnostics: [],
        };
      },
    } as unknown as WorkspaceTransport;

    const result = await ensureMigrationStorySeed({
      transport: emptyTransport,
      databasePath: "/tmp/ws.sqlite",
      workspaceId: "sqlite:/tmp/ws",
      corpusRoot: "/tmp/ws",
      gazetteer: pack.gazetteer,
    });

    expect(result.seeded).toBe(false);
    expect(savedScenes).toHaveLength(0);
    expect(savedSequences).toHaveLength(0);
  });

  test("writes scenes and the sequence into the active project's profile scope", async () => {
    const { transport, savedScenes, savedSequences } = transportFixture();
    const pack = loadBundledGeographyPack();

    const result = await ensureMigrationStorySeed({
      transport,
      databasePath: "/tmp/ws.sqlite",
      workspaceId: "sqlite:/tmp/ws",
      corpusRoot: "/tmp/ws",
      gazetteer: pack.gazetteer,
      profileScope: "project:alpha-field",
    });

    expect(result.seeded).toBe(true);
    expect(savedScenes).toHaveLength(4);
    for (const scene of savedScenes) {
      expect(scene.profileScope).toBe("project:alpha-field");
    }
    expect(savedSequences[0]?.profileScope).toBe("project:alpha-field");
  });

  test("falls back to the internal migration scope when no profile scope is provided", async () => {
    const { transport, savedScenes, savedSequences } = transportFixture();
    const pack = loadBundledGeographyPack();

    const result = await ensureMigrationStorySeed({
      transport,
      databasePath: "/tmp/ws.sqlite",
      workspaceId: "sqlite:/tmp/ws",
      corpusRoot: "/tmp/ws",
      gazetteer: pack.gazetteer,
      profileScope: "   ",
    });

    expect(result.seeded).toBe(true);
    for (const scene of savedScenes) {
      expect(scene.profileScope).toBe("migration");
    }
    expect(savedSequences[0]?.profileScope).toBe("migration");
  });
});

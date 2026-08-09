import { describe, expect, test } from "vitest";

import type {
  WorkspaceTransport,
} from "@research-canvas/desktop-api";
import type { Scene, SceneSequence } from "@research-canvas/schema";
import { loadBundledGeographyPack } from "@research-canvas/canvas";

import {
  assembleProfileWalk,
  gazetteerEntryForPlace,
  loadProfileWalks,
} from "./assembleWalk";
import { timelineView } from "./walkFixture";

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

describe("assembleProfileWalk", () => {
  test("assembles real located events into an ordered walk against the offline gazetteer", async () => {
    const { transport, savedScenes, savedSequences } = transportFixture();
    const pack = loadBundledGeographyPack();

    const result = await assembleProfileWalk({
      transport,
      databasePath: "/tmp/ws.sqlite",
      workspaceId: "sqlite:/tmp/ws",
      profileScope: "bootstrapping",
      gazetteer: pack.gazetteer,
    });

    expect(result.assembledSceneCount).toBe(4);
    // Ordered by event start: Prague (1576), VOC (1602), Banda (1621), Paris (1793).
    expect(savedSequences[0].sceneIds).toEqual([
      "walk:event-rudolf-prague",
      "walk:institution-voc",
      "walk:event-banda-genocide",
      "walk:event-cult-of-reason",
    ]);
    expect(result.stops).toHaveLength(4);
    // Gazetted places resolve to real coordinates.
    const prague = result.stops.find((stop) => stop.placeId === "wikidata:Q1085");
    expect(prague?.coordinate).toEqual({ latitude: 50.0875, longitude: 14.4214 });
    expect(prague?.located).toBe(true);
    const amsterdam = result.stops.find((stop) => stop.placeId === "wikidata:Q727");
    expect(amsterdam?.located).toBe(true);
    // Banda Islands is not in the bundled subset: it stays an unlocated stop
    // and is reported as unmatched — never silently dropped.
    const banda = result.stops.find((stop) => stop.sceneId === "walk:event-banda-genocide");
    expect(banda?.located).toBe(false);
    expect(result.unmatchedPlaces).toContain("Banda Islands");

    // Scenes carry real temporal windows from the graph events.
    const paris = savedScenes.find((scene) => scene.id === "walk:event-cult-of-reason");
    expect(paris?.timeWindow).toEqual({ start: "1793-01-01", end: "1793-12-31" });
    expect(paris?.assembledBy).toBe("agent");
  });

  test("loadProfileWalks reads persisted walks back through the transport", async () => {
    const { transport, savedScenes } = transportFixture();
    const pack = loadBundledGeographyPack();
    await assembleProfileWalk({
      transport,
      databasePath: "/tmp/ws.sqlite",
      workspaceId: "sqlite:/tmp/ws",
      profileScope: "bootstrapping",
      gazetteer: pack.gazetteer,
    });
    expect(savedScenes).toHaveLength(4);

    const walks = await loadProfileWalks({
      transport,
      databasePath: "/tmp/ws.sqlite",
      workspaceId: "sqlite:/tmp/ws",
      profileScope: "bootstrapping",
      gazetteer: pack.gazetteer,
    });
    expect(walks).toHaveLength(1);
    expect(walks[0].stops).toHaveLength(4);
    expect(walks[0].stops[0].placeId).toBe("wikidata:Q1085");
  });
});

describe("gazetteerEntryForPlace", () => {
  test("matches the corpus place title against the shipped subset", () => {
    const pack = loadBundledGeographyPack();
    expect(gazetteerEntryForPlace(pack.gazetteer, "Paris")?.id).toBe("wikidata:Q90");
    expect(gazetteerEntryForPlace(pack.gazetteer, "Prague")?.id).toBe("wikidata:Q1085");
    expect(gazetteerEntryForPlace(pack.gazetteer, "Amsterdam")?.id).toBe("wikidata:Q727");
    expect(gazetteerEntryForPlace(pack.gazetteer, "Banda Islands")).toBeNull();
  });
});

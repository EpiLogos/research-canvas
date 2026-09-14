import { describe, expect, test, vi } from "vitest";
import type { WorkspaceServices } from "@research-canvas/desktop-api";

import { DesktopStoryRepository } from "./DesktopStoryRepository";

describe("DesktopStoryRepository", () => {
  test("persists journeys and ordered authored scenes in the canonical scene store", async () => {
    const sequences: any[] = [];
    const scenes: any[] = [];
    const transport = {
      listSceneSequences: vi.fn(async () => [...sequences]),
      upsertSceneSequence: vi.fn(async ({ sequence }: any) => {
        const index = sequences.findIndex((candidate) => candidate.id === sequence.id);
        if (index >= 0) sequences[index] = sequence;
        else sequences.push(sequence);
        return sequence;
      }),
      listScenes: vi.fn(async () => [...scenes]),
      upsertScene: vi.fn(async ({ scene }: any) => {
        const index = scenes.findIndex((candidate) => candidate.id === scene.id);
        if (index >= 0) scenes[index] = scene;
        else scenes.push(scene);
        return scene;
      }),
      getScene: vi.fn(async ({ id }: any) => scenes.find((candidate) => candidate.id === id) ?? null),
      loadTimelineView: vi.fn(async () => ({
        nodes: [
          {
            node: {
              graphNodeId: "event:arrival",
              entityType: "Event",
              validFrom: "1600-01-01",
              validTo: "1601-01-01",
            },
          },
          {
            node: {
              graphNodeId: "place:banda",
              entityType: "Place",
              validFrom: null,
              validTo: null,
            },
          },
        ],
        relationships: [
          {
            relType: "LOCATED_AT",
            sourceGraphNodeId: "event:arrival",
            targetGraphNodeId: "place:banda",
          },
        ],
      })),
      loadConstellationDocument: vi.fn(async () => ({
        nodes: [
          {
            id: "event:arrival",
            graphNodeId: "event:arrival",
            graph: {
              graphNodeId: "event:arrival",
              title: "Arrival",
              entityType: "Event",
            },
          },
        ],
        edges: [],
      })),
    } as unknown as WorkspaceServices;

    const repository = new DesktopStoryRepository(
      transport,
      "/tmp/research-canvas.sqlite",
      "sqlite:/tmp/research-canvas.sqlite",
      "bootstrapping",
    );

    const journey = await repository.createJourney("constellation:one", "Banda journey");
    expect(journey.title).toBe("Banda journey");
    expect(journey.id).toMatch(/^story:constellation%3Aone:/);

    const first = await repository.addScene(journey.id, {
      title: "Arrival",
      nodeIds: ["event:arrival"],
      mediaAssetIds: ["assets/banda-arrival.jpg"],
      narrationText: "A first situated scene.",
      transition: "fade",
      durationMs: 1250,
    });
    const second = await repository.addScene(journey.id, {
      title: "Aftermath",
      nodeIds: ["event:arrival"],
      mediaAssetIds: [],
      narrationText: "A second scene.",
      transition: "dissolve",
      durationMs: 1750,
    });

    expect(scenes).toHaveLength(2);
    expect(scenes[0]).toMatchObject({
      title: "Arrival",
      narration: "A first situated scene.",
      placeFrame: {
        placeId: "place:banda",
        validAt: { instant: "1600-01-01" },
      },
      timeWindow: { start: "1600-01-01", end: "1601-01-01" },
      assembledBy: "human",
    });
    expect(scenes[0].curationEvents.at(-1)?.detail).toContain("story-authoring-v1:");
    expect(scenes[0].curationEvents.at(-1)?.detail).toContain("assets/banda-arrival.jpg");

    const authored = await repository.getJourneyScenes(journey.id);
    expect(authored.map((scene) => scene.title)).toEqual(["Arrival", "Aftermath"]);
    expect(authored[0]).toMatchObject({
      nodeIds: ["event:arrival"],
      mediaAssetIds: ["assets/banda-arrival.jpg"],
      transition: "fade",
      durationMs: 1250,
    });

    await repository.reorderScenes(journey.id, [second.id, first.id]);
    const reordered = await repository.getJourneyScenes(journey.id);
    expect(reordered.map((scene) => scene.title)).toEqual(["Aftermath", "Arrival"]);

    const reloadedJourneys = await repository.listJourneys("constellation:one");
    expect(reloadedJourneys).toHaveLength(1);
    expect(reloadedJourneys[0]?.sceneIds).toEqual([second.id, first.id]);
  });

  test("refuses to invent a place/time frame when the local graph has none", async () => {
    const sequence = {
      id: "story:constellation%3Aone:journey",
      profileScope: "bootstrapping",
      name: "Unlocated",
      sceneIds: [],
      createdAt: "2026-08-21T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
    };
    const transport = {
      listSceneSequences: vi.fn(async () => [sequence]),
      listScenes: vi.fn(async () => []),
      loadTimelineView: vi.fn(async () => ({ nodes: [], relationships: [] })),
    } as unknown as WorkspaceServices;
    const repository = new DesktopStoryRepository(
      transport,
      "/tmp/research-canvas.sqlite",
      "sqlite:/tmp/research-canvas.sqlite",
      "bootstrapping",
    );

    await expect(repository.addScene(sequence.id, {
      title: "Impossible",
      nodeIds: [],
      mediaAssetIds: [],
      narrationText: "",
      transition: "cut",
      durationMs: 500,
    })).rejects.toThrow("canonically located temporal node");
  });
});

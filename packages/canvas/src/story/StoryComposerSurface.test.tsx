import { describe, expect, test } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { StoryAuthoringScene, StoryJourney, StoryRepository, StorySceneInput } from "@research-canvas/domain";

import { StoryComposerSurface } from "./StoryComposerSurface";

function inMemoryRepository(): StoryRepository {
  const journeys: StoryJourney[] = [];
  const scenes = new Map<string, StoryAuthoringScene[]>();
  let journeyCounter = 0;
  let sceneCounter = 0;

  return {
    async listJourneys(constellationId) {
      return journeys.filter((journey) => journey.constellationId === constellationId);
    },
    async createJourney(constellationId, title) {
      const now = new Date().toISOString();
      const journey: StoryJourney = {
        id: `journey-${++journeyCounter}`,
        constellationId,
        title,
        sceneIds: [],
        createdAt: now,
        updatedAt: now,
      };
      journeys.push(journey);
      scenes.set(journey.id, []);
      return journey;
    },
    async getJourneyScenes(journeyId) {
      return [...(scenes.get(journeyId) ?? [])];
    },
    async addScene(journeyId, input) {
      const now = new Date().toISOString();
      const scene: StoryAuthoringScene = {
        id: `scene-${++sceneCounter}`,
        journeyId,
        ...input,
        createdAt: now,
        updatedAt: now,
      };
      const current = scenes.get(journeyId) ?? [];
      current.push(scene);
      scenes.set(journeyId, current);
      const journey = journeys.find((candidate) => candidate.id === journeyId);
      if (journey) journey.sceneIds = current.map((candidate) => candidate.id);
      return scene;
    },
    async updateScene(sceneId, input) {
      for (const current of scenes.values()) {
        const index = current.findIndex((scene) => scene.id === sceneId);
        if (index < 0) continue;
        const previous = current[index];
        if (!previous) continue;
        const next = { ...previous, ...input, updatedAt: new Date().toISOString() };
        current[index] = next;
        return next;
      }
      throw new Error(`Missing scene ${sceneId}`);
    },
    async reorderScenes(journeyId, sceneIds) {
      const current = scenes.get(journeyId) ?? [];
      const byId = new Map(current.map((scene) => [scene.id, scene] as const));
      const reordered: StoryAuthoringScene[] = [];
      for (const id of sceneIds) {
        const scene = byId.get(id);
        if (scene) reordered.push(scene);
      }
      scenes.set(journeyId, reordered);
      const journey = journeys.find((candidate) => candidate.id === journeyId);
      if (journey) journey.sceneIds = [...sceneIds];
    },
    async listNodeOptions() {
      return [{ graphNodeId: "event:arrival", title: "Arrival", entityType: "Event" }];
    },
  };
}

async function addScene(title: string, narration: string, transition: StorySceneInput["transition"]) {
  fireEvent.click(screen.getByTestId("story-add-scene"));
  const titleInput = await screen.findByTestId("story-scene-title");
  fireEvent.change(titleInput, { target: { value: title } });
  fireEvent.change(screen.getByTestId("story-scene-narration"), { target: { value: narration } });
  fireEvent.change(screen.getByTestId("story-scene-transition"), { target: { value: transition } });
  fireEvent.change(screen.getByTestId("story-scene-duration"), { target: { value: "10000" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Arrival/ }));
  fireEvent.click(screen.getByTestId("story-scene-save"));
  await waitFor(() => expect(screen.queryByTestId("story-scene-editor")).not.toBeInTheDocument());
}

describe("StoryComposerSurface", () => {
  test("creates a journey, adds and reorders scenes, edits one, and previews sequentially", async () => {
    render(
      <StoryComposerSurface
        repository={inMemoryRepository()}
        constellationId="constellation:one"
        resolveAsset={(assetId) => `/project/${assetId}`}
      />,
    );

    expect(await screen.findByTestId("story-journey-empty")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("story-new-journey-title"), { target: { value: "Banda journey" } });
    fireEvent.click(screen.getByTestId("story-create-journey"));
    await waitFor(() => expect(screen.getByTestId("story-journey-journey-1")).toHaveTextContent("Banda journey"));

    await addScene("Arrival", "First narration", "fade");
    await addScene("Aftermath", "Second narration", "dissolve");

    const strip = screen.getByTestId("story-scene-strip");
    await waitFor(() => expect(strip).toHaveTextContent("Arrival"));
    expect(strip).toHaveTextContent("Aftermath");

    fireEvent.click(screen.getByRole("button", { name: "Move Aftermath earlier" }));
    await waitFor(() => {
      const items = screen.getAllByTestId((id) => id.startsWith("story-scene-scene-"));
      expect(items[0]).toHaveTextContent("Aftermath");
      expect(items[1]).toHaveTextContent("Arrival");
    });

    fireEvent.click(screen.getByTestId("story-scene-scene-2"));
    fireEvent.change(screen.getByTestId("story-scene-title"), { target: { value: "Aftermath revised" } });
    fireEvent.click(screen.getByTestId("story-scene-save"));
    await waitFor(() => expect(strip).toHaveTextContent("Aftermath revised"));

    fireEvent.click(screen.getByTestId("story-preview"));
    expect(screen.getByTestId("story-preview-scene")).toHaveTextContent("Aftermath revised");
    fireEvent.click(screen.getByTestId("story-preview-next"));
    expect(screen.getByTestId("story-preview-scene")).toHaveTextContent("Arrival");
  });
});

import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { WorkspaceServices } from "@research-canvas/desktop-api";
import type { Scene, SceneSequence } from "@research-canvas/schema";

import { StoryLens } from "./StoryLens";

const CONSTELLATION_ID = "root-archetypal-field";
const PROFILE_SCOPE = "bootstrapping";
const JOURNEY_ID = `story:${CONSTELLATION_ID}:fixture`;

const passage = {
  artifactId: "recording-001",
  unit: { kind: "timestamp_range" as const, startMs: 0, endMs: 1000 },
};

function publishedScene(over: Partial<Scene> = {}): Scene {
  return {
    id: `${JOURNEY_ID}:scene:arrival`,
    profileScope: PROFILE_SCOPE,
    placeFrame: {
      placeId: "wikidata:Q727",
      validAt: { instant: "2021-07-14" },
    },
    timeWindow: { start: "2021-07-14", end: "2021-07-14" },
    people: [],
    passages: [passage],
    consents: [{
      passageRef: passage,
      state: "captured",
      scope: "publication",
      capturedAt: "2026-08-08T10:00:00.000Z",
      recordedBy: "story-host-test",
    }],
    redactions: [],
    languageVariants: [],
    title: "Arrival",
    narration: "A published scene backed by the canonical Scene store.",
    assembledBy: "human",
    curationEvents: [],
    nestedSequenceIds: [],
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
    ...over,
  };
}

function journeySequence(sceneIds: string[]): SceneSequence {
  return {
    id: JOURNEY_ID,
    profileScope: PROFILE_SCOPE,
    name: "Published fixture",
    sceneIds,
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
  };
}

function makeTransport(options: { empty?: boolean } = {}) {
  const scene = publishedScene();
  const sequences = options.empty ? [] : [journeySequence([scene.id])];
  const scenes = options.empty ? [] : [scene];
  const upsertScene = vi.fn();
  const upsertSceneSequence = vi.fn();
  const writeKeepsakeBundle = vi.fn(async () => ({
    mediaCopied: 0,
    manifestPath: "/tmp/ws/keepsake/keepsake.json",
  }));

  const transport = {
    listSceneSequences: vi.fn(async () => sequences),
    listScenes: vi.fn(async () => scenes),
    loadConstellationDocument: vi.fn(async () => ({ nodes: [] })),
    listStreetViewImages: vi.fn(async () => []),
    listFetchRecords: vi.fn(async () => []),
    upsertScene,
    upsertSceneSequence,
    writeKeepsakeBundle,
  } as unknown as WorkspaceServices;

  return { transport, upsertScene, upsertSceneSequence, writeKeepsakeBundle };
}

function renderLens(transport: WorkspaceServices) {
  return render(
    <StoryLens
      transport={transport}
      constellationId={CONSTELLATION_ID}
      databasePath="/tmp/ws.sqlite"
      workspaceId="sqlite:/tmp/ws"
      profileScope={PROFILE_SCOPE}
      workingRoot="/tmp/ws"
    />,
  );
}

describe("StoryLens", () => {
  test("opens in repository-backed compose mode without auto-seeding a story", async () => {
    const { transport, upsertScene, upsertSceneSequence } = makeTransport();
    renderLens(transport);

    expect(screen.getByTestId("story-compose-mode")).toHaveAttribute("data-active", "true");
    expect(await screen.findByText("Published fixture")).toBeInTheDocument();
    expect(screen.getByTestId("story-surface")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("story-add-scene")).toBeEnabled());
    expect(upsertScene).not.toHaveBeenCalled();
    expect(upsertSceneSequence).not.toHaveBeenCalled();
  });

  test("keeps the mature consent-aware published reader behind the selected journey", async () => {
    const { transport } = makeTransport();
    renderLens(transport);

    await screen.findByText("Published fixture");
    const publishedMode = screen.getByTestId("story-published-mode");
    await waitFor(() => expect(publishedMode).toBeEnabled());
    fireEvent.click(publishedMode);

    expect(await screen.findByTestId("story-passages")).toBeInTheDocument();
    expect(screen.getByText(/1 published passage/)).toBeInTheDocument();
    expect(screen.getByText("A published scene backed by the canonical Scene store.")).toBeInTheDocument();
    expect(screen.getByTestId("story-street-view-fallback")).toBeInTheDocument();
  });

  test("exports the selected published journey through the existing keepsake path", async () => {
    const { transport, writeKeepsakeBundle } = makeTransport();
    renderLens(transport);

    await screen.findByText("Published fixture");
    const publishedMode = screen.getByTestId("story-published-mode");
    await waitFor(() => expect(publishedMode).toBeEnabled());
    fireEvent.click(publishedMode);
    await screen.findByTestId("story-passages");
    fireEvent.click(screen.getByTestId("story-export-keepsake"));

    await waitFor(() => expect(writeKeepsakeBundle).toHaveBeenCalledTimes(1));
    const input = writeKeepsakeBundle.mock.calls[0]?.[0] as {
      outputDir: string;
      manifestJson: string;
    };
    expect(input.outputDir).toBe(`/tmp/ws/keepsake/${JOURNEY_ID}`);
    const manifest = JSON.parse(input.manifestJson) as {
      title: string;
      scenes: Array<{ passages: unknown[] }>;
    };
    expect(manifest.title).toBe("Published fixture");
    expect(manifest.scenes).toHaveLength(1);
    expect(manifest.scenes[0]?.passages).toHaveLength(1);
    expect(await screen.findByTestId("story-export-message")).toHaveTextContent("Keepsake written");
  });

  test("shows a clean composer empty state and never creates a migration seed", async () => {
    const { transport, upsertScene, upsertSceneSequence } = makeTransport({ empty: true });
    renderLens(transport);

    expect(await screen.findByTestId("story-empty")).toHaveTextContent(
      "Create a journey to begin composing scenes.",
    );
    expect(screen.getByTestId("story-published-mode")).toBeDisabled();
    expect(upsertScene).not.toHaveBeenCalled();
    expect(upsertSceneSequence).not.toHaveBeenCalled();
  });
});

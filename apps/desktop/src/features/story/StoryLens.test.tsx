import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type {
  FetchRecord,
  StreetViewImageRecord,
  WorkspaceTransport,
} from "@research-canvas/desktop-api";
import type { Scene, SceneSequence } from "@research-canvas/schema";

import { StoryLens } from "./StoryLens";

function scene(over: Partial<Scene> = {}): Scene {
  return {
    id: "scene-arrival",
    profileScope: "migration",
    placeFrame: {
      placeId: "wikidata:Q727",
      validAt: { instant: "2021-07-14" },
    },
    timeWindow: { start: "2021-07-01", end: "2021-08-01" },
    people: [],
    passages: [
      {
        artifactId: "recording-001",
        unit: { kind: "timestamp_range", startMs: 12000, endMs: 45000 },
      },
      {
        artifactId: "recording-001",
        unit: { kind: "timestamp_range", startMs: 60000, endMs: 90000 },
      },
    ],
    consents: [
      {
        passageRef: {
          artifactId: "recording-001",
          unit: { kind: "timestamp_range", startMs: 12000, endMs: 45000 },
        },
        state: "captured",
        scope: "publication",
        capturedAt: "2026-08-08T10:00:00.000Z",
      },
    ],
    redactions: [
      {
        passageRef: {
          artifactId: "recording-001",
          unit: { kind: "timestamp_range", startMs: 12000, endMs: 45000 },
        },
        startOffset: 2,
        endOffset: 5,
      },
    ],
    languageVariants: [
      {
        id: "variant-ar-1",
        language: "ar",
        kind: "voice_passage_translation",
        sourcePassageRef: {
          artifactId: "recording-001",
          unit: { kind: "timestamp_range", startMs: 12000, endMs: 45000 },
        },
        derivedArtifactId: "translations/ar/arrival.vtt",
        provenance: {
          sourceRefs: [
            {
              artifactId: "recording-001",
              unit: { kind: "timestamp_range", startMs: 12000, endMs: 45000 },
            },
          ],
        },
      },
    ],
    title: "Arrival",
    assembledBy: "agent",
    curationEvents: [],
    nestedSequenceIds: [],
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
    ...over,
  };
}

function sequence(scenes: Scene[]): SceneSequence {
  return {
    id: "journey-1",
    profileScope: "migration",
    name: "The Crossing",
    sceneIds: scenes.map((item) => item.id),
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
  };
}

function makeTransport(
  scenes: Scene[],
  writeKeepsake: ReturnType<typeof vi.fn>,
  street: {
    images?: StreetViewImageRecord[];
    fetchRecords?: FetchRecord[];
  } = {},
): WorkspaceTransport {
  return {
    async listSceneSequences() {
      return scenes.length > 0 ? [sequence(scenes)] : [];
    },
    async listScenes() {
      return scenes;
    },
    async listStreetViewImages() {
      return street.images ?? [];
    },
    async listFetchRecords() {
      return street.fetchRecords ?? [];
    },
    async loadTimelineView() {
      return {
        workspaceId: "sqlite:/tmp/ws",
        nodes: [],
        relationships: [],
        lanes: [],
        diagnostics: [],
      };
    },
    async upsertScene() {
      throw new Error("unexpected seed write");
    },
    async upsertSceneSequence() {
      throw new Error("unexpected seed write");
    },
    writeKeepsakeBundle: writeKeepsake,
  } as unknown as WorkspaceTransport;
}

function redactedStreetImage(
  over: Partial<StreetViewImageRecord> = {},
): StreetViewImageRecord {
  return {
    id: "sv-prague-1",
    profileScope: "migration",
    artifactPath: "street-view/imported/prague.png",
    capturedAt: "2026-08-01T10:00:00.000Z",
    latitude: 50.0875,
    longitude: 14.4213,
    headingDegrees: 90,
    redactionStatus: "redacted",
    redactionRegions: [],
    redactedArtifactPath: "redacted/sv-prague-1.png",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...over,
  };
}

function fetchRecordFor(
  streetViewImageId: string,
  placeId: string,
  over: Partial<FetchRecord> = {},
): FetchRecord {
  return {
    id: `fetch-${streetViewImageId}`,
    profileScope: "migration",
    agentSessionId: "tmux-agent-1",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:placeholder",
    license: "CC0",
    fetchedAt: "2026-08-01T10:00:00.000Z",
    mimeType: "image/png",
    byteSize: 4096,
    validation: { mimeOk: true, sizeOk: true, licenseOk: true, sourceOk: true },
    contentHash: "abc123",
    artifactPath: "street-view/imported/prague.png",
    redactionStatus: "redacted",
    streetViewImageId,
    placeId,
    walkId: null,
    sceneId: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...over,
  };
}

describe("StoryLens", () => {
  test("renders the journey with consent filtering and language variants", async () => {
    render(
      <StoryLens
        transport={makeTransport([scene()], vi.fn())}
        databasePath="/tmp/ws.sqlite"
        workspaceId="sqlite:/tmp/ws"
        repoRoot="/tmp/repo"
        profileScope="migration"
        workingRoot="/tmp/ws"
      />,
    );

    expect(await screen.findByText("The Crossing")).toBeInTheDocument();
    expect(screen.getByText(/1 published passage · 1 redacted gap/)).toBeInTheDocument();
    expect(screen.getByTestId("story-language")).toHaveValue("original");
    fireEvent.change(screen.getByTestId("story-language"), {
      target: { value: "ar" },
    });
    expect(screen.getByTestId("story-language")).toHaveValue("ar");
    // The scene falls back to a neutral street-view note when no imagery is
    // associated with the place (never an empty/error state on real data).
    expect(screen.getByTestId("story-street-view-fallback")).toBeInTheDocument();
    // The story title is the seeded journey name — never "Migration story".
    expect(screen.queryByText(/Migration story/i)).toBeNull();
  });

  test("renders the place's redacted street-view imagery and walk context inside the scene", async () => {
    const image = redactedStreetImage();
    const fetchRecord = fetchRecordFor(image.id, "wikidata:Q727");
    render(
      <StoryLens
        transport={makeTransport(
          [scene()],
          vi.fn(),
          { images: [image], fetchRecords: [fetchRecord] },
        )}
        databasePath="/tmp/ws.sqlite"
        workspaceId="sqlite:/tmp/ws"
        repoRoot="/tmp/repo"
        profileScope="migration"
        workingRoot="/tmp/ws"
      />,
    );

    await screen.findByText("The Crossing");
    // The redacted derived copy is what the scene renders.
    await waitFor(() => {
      expect(screen.getByTestId("story-street-view-image")).toHaveAttribute(
        "src",
        "redacted/sv-prague-1.png",
      );
    });
    // The walk's map/globe context renders as the route diagram.
    expect(screen.getByTestId("story-walk-context")).toBeInTheDocument();
    expect(screen.getByTestId("story-walk-svg")).toBeInTheDocument();
    expect(screen.queryByTestId("story-street-view-fallback")).toBeNull();
  });

  test("normalizes a fetch-record raw graph node id to the scene's gazetteer place", async () => {
    // Task-4 fetch records may store the raw graph node id
    // (`root-archetypal-field:place-amsterdam`) while the scene's
    // placeFrame.placeId is the gazetteer id (`wikidata:Q727`). The direct
    // id match would miss; the gazetteer normalization must still associate.
    const image = redactedStreetImage();
    const fetchRecord = fetchRecordFor(image.id, "root-archetypal-field:place-amsterdam");
    render(
      <StoryLens
        transport={makeTransport(
          [scene()],
          vi.fn(),
          { images: [image], fetchRecords: [fetchRecord] },
        )}
        databasePath="/tmp/ws.sqlite"
        workspaceId="sqlite:/tmp/ws"
        repoRoot="/tmp/repo"
        profileScope="migration"
        workingRoot="/tmp/ws"
      />,
    );

    await screen.findByText("The Crossing");
    await waitFor(() => {
      expect(screen.getByTestId("story-street-view-image")).toHaveAttribute(
        "src",
        "redacted/sv-prague-1.png",
      );
    });
    expect(screen.queryByTestId("story-street-view-fallback")).toBeNull();
  });

  test("keeps pending (unredacted) imagery out of published scenes", async () => {
    const image = redactedStreetImage({
      redactionStatus: "pending",
      redactedArtifactPath: null,
    });
    const fetchRecord = fetchRecordFor(image.id, "wikidata:Q727", {
      redactionStatus: "pending",
    });
    render(
      <StoryLens
        transport={makeTransport(
          [scene()],
          vi.fn(),
          { images: [image], fetchRecords: [fetchRecord] },
        )}
        databasePath="/tmp/ws.sqlite"
        workspaceId="sqlite:/tmp/ws"
        repoRoot="/tmp/repo"
        profileScope="migration"
        workingRoot="/tmp/ws"
      />,
    );

    await screen.findByText("The Crossing");
    expect(screen.queryByTestId("story-street-view-image")).toBeNull();
    expect(screen.getByTestId("story-street-view-fallback")).toBeInTheDocument();
  });

  test("exports a consent-filtered keepsake through the transport", async () => {
    const writeKeepsake = vi.fn<
      (input: { outputDir: string; mediaRoot: string; manifestJson: string }) => Promise<{
        mediaCopied: number;
        manifestPath: string;
      }>
    >(async () => ({ mediaCopied: 0, manifestPath: "keepsake.json" }));
    render(
      <StoryLens
        transport={makeTransport([scene()], writeKeepsake)}
        databasePath="/tmp/ws.sqlite"
        workspaceId="sqlite:/tmp/ws"
        repoRoot="/tmp/repo"
        profileScope="migration"
        workingRoot="/tmp/ws"
      />,
    );

    await screen.findByText("The Crossing");
    fireEvent.click(screen.getByTestId("story-export-keepsake"));

    await waitFor(() => {
      expect(writeKeepsake).toHaveBeenCalled();
    });
    const input = writeKeepsake.mock.calls[0]?.[0];
    expect(input).toBeTruthy();
    if (!input) return;
    expect(input.outputDir).toBe("/tmp/ws/keepsake/journey-1");
    const manifest = JSON.parse(input.manifestJson);
    expect(manifest.title).toBe("The Crossing");
    expect(manifest.scenes).toHaveLength(1);
    // Consent-filtered: only the captured passage ships.
    expect(manifest.scenes[0].passages).toHaveLength(1);
    expect(await screen.findByTestId("story-export-message")).toHaveAttribute(
      "data-state",
      "done",
    );
  });

  test("shows the empty state when the journey profile has no scenes yet", async () => {
    render(
      <StoryLens
        transport={makeTransport([], vi.fn())}
        databasePath="/tmp/ws.sqlite"
        workspaceId="sqlite:/tmp/ws"
        repoRoot="/tmp/repo"
        profileScope="migration"
        workingRoot="/tmp/ws"
      />,
    );
    expect(await screen.findByTestId("story-surface-empty")).toBeInTheDocument();
  });
});

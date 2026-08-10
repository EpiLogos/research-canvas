import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import {
  StorySurface,
  type StorySurfaceSceneData,
} from "./StorySurface";

function sceneData(over: Partial<StorySurfaceSceneData> = {}): StorySurfaceSceneData {
  return {
    sceneId: "scene-arrival",
    title: "Arrival",
    placeId: "pleiades:520998",
    language: "original",
    availableLanguages: ["original", "ar"],
    passages: [
      {
        key: "recording-001#{\"kind\":\"timestamp_range\",\"startMs\":1000,\"endMs\":4000}",
        artifactId: "recording-001",
        unit: { kind: "timestamp_range", startMs: 1000, endMs: 4000 },
        redacted: false,
        gaps: [],
      },
      {
        key: "recording-001#{\"kind\":\"timestamp_range\",\"startMs\":5000,\"endMs\":8000}",
        artifactId: "recording-001",
        unit: { kind: "timestamp_range", startMs: 5000, endMs: 8000 },
        redacted: true,
        gaps: [{ startOffset: 1, endOffset: 3 }],
      },
    ],
    media: ["media/arrival.mp3"],
    // Default to no transcript so tests that don't exercise transcript sync
    // never trigger the async transcript fetch (avoids React act warnings).
    transcriptPath: null,
    ...over,
  };
}

const VTT = `WEBVTT

00:00:01.000 --> 00:00:04.000
We crossed at dawn.

00:00:05.000 --> 00:00:08.000
The border was quiet.
`;

describe("StorySurface", () => {
  test("renders navigation, consent-filtered passages, and redaction gaps", () => {
    render(
      <StorySurface
        title="The Crossing"
        profileScope="migration"
        scenes={[sceneData()]}
        defaultLanguage="original"
        resolveAsset={(path) => `/assets/${path}`}
      />,
    );

    expect(screen.getByTestId("story-surface")).toBeInTheDocument();
    expect(screen.getByText("The Crossing")).toBeInTheDocument();
    expect(screen.getByText(/2 published passages · 1 redacted gap/)).toBeInTheDocument();
    expect(screen.getByTestId("story-passage-0")).toHaveAttribute(
      "data-redacted",
      "false",
    );
    expect(screen.getByTestId("story-passage-1")).toHaveAttribute(
      "data-redacted",
      "true",
    );
    expect(screen.getByText(/Redacted · 1 gap/)).toBeInTheDocument();
    expect(screen.getByTestId("story-audio")).toHaveAttribute(
      "src",
      "/assets/media/arrival.mp3",
    );
  });

  test("loads the transcript and highlights the active cue during playback", async () => {
    render(
      <StorySurface
        title="The Crossing"
        profileScope="migration"
        scenes={[sceneData({ transcriptPath: "transcripts/arrival.vtt" })]}
        defaultLanguage="original"
        resolveAsset={(path) => `/assets/${path}`}
        loadTranscript={async () => VTT}
      />,
    );

    await screen.findByTestId("story-transcript");
    const cues = screen.getAllByTestId(/story-cue-/);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toHaveAttribute("data-active", "false");

    const audio = screen.getByTestId("story-audio") as HTMLAudioElement;
    audio.currentTime = 2;
    fireEvent.timeUpdate(audio);

    expect(screen.getByTestId("story-cue-cue-0")).toHaveAttribute(
      "data-active",
      "true",
    );
    // Passage text is resolved from overlapping cues.
    expect(screen.getAllByText("We crossed at dawn.").length).toBeGreaterThan(0);
  });

  test("switches scene language through the picker", async () => {
    const onLanguageChange = vi.fn();
    render(
      <StorySurface
        title="The Crossing"
        profileScope="migration"
        scenes={[sceneData()]}
        defaultLanguage="original"
        resolveAsset={(path) => `/assets/${path}`}
        loadTranscript={async () => VTT}
        onLanguageChange={onLanguageChange}
      />,
    );

    fireEvent.change(screen.getByTestId("story-language"), {
      target: { value: "ar" },
    });
    expect(onLanguageChange).toHaveBeenCalledWith("scene-arrival", "ar");
  });

  test("navigates between scenes with prev/next and the scene list", () => {
    render(
      <StorySurface
        title="The Crossing"
        profileScope="migration"
        scenes={[
          sceneData({ sceneId: "scene-origin", title: "Origin" }),
          sceneData({
            sceneId: "scene-destination",
            title: "Destination",
            media: [],
            transcriptPath: null,
          }),
        ]}
        defaultLanguage="original"
        resolveAsset={(path) => `/assets/${path}`}
        loadTranscript={async () => VTT}
      />,
    );

    expect(screen.getByText("Origin")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("story-next"));
    expect(screen.getByText("Destination")).toBeInTheDocument();
    expect(screen.getByTestId("story-prev")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("story-scene-scene-origin"));
    expect(screen.getByText("Origin")).toBeInTheDocument();
  });

  test("empty stories explain that nothing is published yet", () => {
    render(
      <StorySurface
        title="The Crossing"
        profileScope="migration"
        scenes={[]}
        defaultLanguage="original"
        resolveAsset={(path) => `/assets/${path}`}
      />,
    );
    expect(screen.getByTestId("story-surface-empty")).toBeInTheDocument();
  });

  test("labels the surface as a published journey, never a migration story", () => {
    render(
      <StorySurface
        title="The Crossing"
        profileScope="migration"
        scenes={[sceneData()]}
        defaultLanguage="original"
        resolveAsset={(path) => path}
      />,
    );
    expect(screen.getByText("Published journey")).toBeInTheDocument();
    expect(screen.queryByText(/migration story/i)).toBeNull();
  });

  test("renders the place's redacted street-view imagery inside the scene", () => {
    render(
      <StorySurface
        title="The Crossing"
        profileScope="migration"
        scenes={[
          sceneData({
            streetViewImages: [
              {
                id: "sv-arrival-1",
                artifactPath: "street-view/imported/arrival.png",
                redactionStatus: "redacted",
                redactedArtifactPath: "redacted/sv-arrival-1.png",
                capturedAt: "2026-08-01T10:00:00.000Z",
                latitude: 41.0082,
                longitude: 28.9784,
                headingDegrees: 90,
              },
            ],
          }),
        ]}
        defaultLanguage="original"
        resolveAsset={(path) => `/assets/${path}`}
      />,
    );

    expect(screen.getByTestId("story-street-view")).toBeInTheDocument();
    // The redacted derived copy is what the scene renders.
    expect(screen.getByTestId("story-street-view-image")).toHaveAttribute(
      "src",
      "/assets/redacted/sv-arrival-1.png",
    );
    expect(screen.queryByTestId("story-street-view-fallback")).toBeNull();
  });

  test("renders a neutral fallback when the place has no street-view imagery", () => {
    render(
      <StorySurface
        title="The Crossing"
        profileScope="migration"
        scenes={[sceneData()]}
        defaultLanguage="original"
        resolveAsset={(path) => path}
      />,
    );

    expect(screen.getByTestId("story-street-view-fallback")).toBeInTheDocument();
    expect(screen.getByText(/No captured street-view imagery for this place yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId("story-street-view-image")).toBeNull();
  });

  test("renders the walk's route diagram with the current stop marked", () => {
    render(
      <StorySurface
        title="The Crossing"
        profileScope="migration"
        scenes={[
          sceneData({
            walkContext: {
              coordinate: { latitude: 41.0082, longitude: 28.9784 },
              route: [
                { latitude: 40.0, longitude: 28.0 },
                { latitude: 41.0082, longitude: 28.9784 },
              ],
            },
          }),
        ]}
        defaultLanguage="original"
        resolveAsset={(path) => path}
      />,
    );

    expect(screen.getByTestId("story-walk-context")).toBeInTheDocument();
    expect(screen.getByTestId("story-walk-svg")).toBeInTheDocument();
    expect(screen.queryByTestId("story-walk-context-fallback")).toBeNull();
  });

  test("renders a neutral fallback when the walk has no map context", () => {
    render(
      <StorySurface
        title="The Crossing"
        profileScope="migration"
        scenes={[sceneData()]}
        defaultLanguage="original"
        resolveAsset={(path) => path}
      />,
    );

    expect(screen.getByTestId("story-walk-context-fallback")).toBeInTheDocument();
    expect(screen.getByText(/No map context for this stop yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId("story-walk-svg")).toBeNull();
  });
});

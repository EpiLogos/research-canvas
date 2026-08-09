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
    transcriptPath: "transcripts/arrival.vtt",
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
        scenes={[sceneData()]}
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
});

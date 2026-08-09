import { afterEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { KeepsakeManifest, KeepsakeScene } from "@research-canvas/exporter";

import { keepsakeSceneToStory, transcriptFor } from "./StoryView";
import { StoryView } from "./StoryView";

const VTT = `WEBVTT

00:00:01.000 --> 00:00:04.000
We crossed at dawn.
`;

function keepsakeScene(over: Partial<KeepsakeScene> = {}): KeepsakeScene {
  return {
    sceneId: "scene-arrival",
    placeId: "pleiades:520998",
    title: "Arrival",
    languageVariants: [
      { language: "ar", derivedArtifactId: "translations/ar/arrival.vtt" },
    ],
    passages: [
      {
        artifactId: "recording-001",
        unit: { kind: "timestamp_range", startMs: 1000, endMs: 4000 },
        gaps: [{ startOffset: 2, endOffset: 5 }],
      },
    ],
    media: ["media/arrival.mp3", "transcripts/arrival.vtt"],
    ...over,
  };
}

function keepsakeManifest(over: Partial<KeepsakeManifest> = {}): KeepsakeManifest {
  return {
    formatVersion: 1,
    title: "The Crossing",
    profileScope: "migration",
    defaultLanguage: "original",
    scenes: [keepsakeScene()],
    media: ["media/arrival.mp3", "transcripts/arrival.vtt"],
    walk: [{ latitude: 41.0082, longitude: 28.9784 }],
    ...over,
  };
}

function stubKeepsakeFetch(manifest: KeepsakeManifest | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "keepsake.json") {
        return new Response(JSON.stringify(manifest), {
          status: manifest ? 200 : 404,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(VTT, { status: 200 });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("keepsakeSceneToStory", () => {
  test("maps consent-filtered passages with gaps as redactions", () => {
    const view = keepsakeSceneToStory(keepsakeScene(), {});
    expect(view.language).toBe("original");
    expect(view.availableLanguages).toEqual(["original", "ar"]);
    expect(view.passages).toHaveLength(1);
    expect(view.passages[0].redacted).toBe(true);
    expect(view.passages[0].gaps).toEqual([{ startOffset: 2, endOffset: 5 }]);
    expect(view.transcriptPath).toBe("transcripts/arrival.vtt");
  });

  test("switching language selects the derived translation transcript", () => {
    const view = keepsakeSceneToStory(keepsakeScene(), {
      "scene-arrival": "ar",
    });
    expect(view.language).toBe("ar");
    expect(view.transcriptPath).toBe("translations/ar/arrival.vtt");
  });

  test("transcriptFor falls back to the original when no variant exists", () => {
    expect(transcriptFor(keepsakeScene(), "de")).toBe("transcripts/arrival.vtt");
  });
});

describe("StoryView", () => {
  test("loads the keepsake and renders the published story", async () => {
    stubKeepsakeFetch(keepsakeManifest());
    render(<StoryView />);

    await screen.findByText("The Crossing");
    expect(screen.getByTestId("story-surface")).toBeInTheDocument();
    expect(screen.getByText(/1 published passage · 1 redacted gap/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("story-audio")).toHaveAttribute(
        "src",
        "media/arrival.mp3",
      );
    });
    await screen.findByTestId("story-transcript");
    expect(screen.getByText("We crossed at dawn.")).toBeInTheDocument();
  });

  test("shows a clear state when no keepsake is bundled", async () => {
    stubKeepsakeFetch(null);
    render(<StoryView />);
    expect(await screen.findByTestId("story-unavailable")).toBeInTheDocument();
  });

  test("language picker switches the active transcript", async () => {
    stubKeepsakeFetch(keepsakeManifest());
    render(<StoryView />);
    await screen.findByText("The Crossing");

    fireEvent.change(screen.getByTestId("story-language"), {
      target: { value: "ar" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("story-language")).toHaveValue("ar");
    });
  });
});

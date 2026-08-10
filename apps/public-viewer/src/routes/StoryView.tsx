import { useEffect, useMemo, useState, type JSX } from "react";

import {
  StorySurface,
  type StorySurfaceSceneData,
} from "@research-canvas/canvas";
import type { KeepsakeManifest, KeepsakeScene } from "@research-canvas/exporter";

import { loadKeepsake } from "../keepsake";

/**
 * Published story UI (vision §3.16, ticket #11): the keepsake bundle opens
 * offline in the public viewer with language switching, media playback with
 * transcript sync, and consent-filtered content — the manifest was filtered
 * at export time, so nothing withheld ever ships.
 */

export function StoryView(): JSX.Element {
  const [manifest, setManifest] = useState<KeepsakeManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [languages, setLanguages] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void loadKeepsake().then((loaded) => {
      if (!cancelled) {
        setManifest(loaded);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const scenes: StorySurfaceSceneData[] = useMemo(
    () =>
      manifest
        ? manifest.scenes.map((scene) => keepsakeSceneToStory(scene, languages))
        : [],
    [manifest, languages],
  );

  if (loading) {
    return (
      <main className="viewer viewer--story">
        <p data-testid="story-loading">Loading published journey…</p>
      </main>
    );
  }

  if (!manifest) {
    return (
      <main className="viewer viewer--story">
        <p data-testid="story-unavailable">
          No published journey bundle was found in this export.
        </p>
      </main>
    );
  }

  return (
    <main className="viewer viewer--story">
      <StorySurface
        title={manifest.title}
        profileScope={manifest.profileScope}
        scenes={scenes}
        defaultLanguage={manifest.defaultLanguage}
        resolveAsset={(path) => path}
        onLanguageChange={(sceneId, language) =>
          setLanguages((current) => ({ ...current, [sceneId]: language }))
        }
      />
    </main>
  );
}

export function keepsakeSceneToStory(
  scene: KeepsakeScene,
  languages: Record<string, string>,
): StorySurfaceSceneData {
  const language = languages[scene.sceneId] ?? "original";
  return {
    sceneId: scene.sceneId,
    title: scene.title,
    placeId: scene.placeId,
    language,
    availableLanguages: availableLanguagesFor(scene),
    passages: scene.passages.map((passage) => ({
      key: `${passage.artifactId}#${JSON.stringify(passage.unit)}`,
      artifactId: passage.artifactId,
      unit: passage.unit,
      redacted: passage.gaps.length > 0,
      gaps: passage.gaps,
    })),
    media: scene.media,
    transcriptPath: transcriptFor(scene, language),
    streetViewImages: scene.streetViewImages ?? [],
    walkContext: scene.walkContext ?? null,
  };
}

function availableLanguagesFor(scene: KeepsakeScene): string[] {
  const variants = [
    ...new Set(scene.languageVariants.map((variant) => variant.language)),
  ];
  return ["original", ...variants];
}

export function transcriptFor(
  scene: KeepsakeScene,
  language: string,
): string | null {
  if (language !== "original") {
    const variant = scene.languageVariants.find(
      (candidate) => candidate.language === language,
    );
    if (variant) return variant.derivedArtifactId;
  }
  return scene.media.find((path) => path.toLowerCase().endsWith(".vtt")) ?? null;
}

import { useEffect, useMemo, useState, type JSX } from "react";

import {
  assembleWalk,
  loadBundledGeographyPack,
  presentStoryScene,
  StoryComposerSurface,
  StorySurface,
  walkPathGeometry,
  type StorySceneStreetView,
  type StorySurfaceSceneData,
} from "@research-canvas/canvas";
import type {
  FetchRecord,
  StreetViewImageRecord,
  WorkspaceServices,
} from "@research-canvas/desktop-api";
import { buildKeepsakeManifest } from "@research-canvas/exporter";
import type { GazetteerIndex } from "@research-canvas/geography";

import { DesktopStoryRepository } from "./DesktopStoryRepository";

export interface StoryLensProps {
  transport: WorkspaceServices;
  constellationId: string;
  databasePath: string;
  workspaceId: string;
  profileScope: string;
  workingRoot: string;
}

/**
 * Surface #4 host: authoring is the default, while the mature publication
 * reader remains available as a first-class view of the selected journey.
 * Both read/write through DesktopStoryRepository; no migration story is
 * auto-seeded and no `sequences[0]` assumption owns the surface anymore.
 */
export function StoryLens({
  transport,
  constellationId,
  databasePath,
  workspaceId,
  profileScope,
  workingRoot,
}: StoryLensProps): JSX.Element {
  const repository = useMemo(
    () => new DesktopStoryRepository(
      transport,
      databasePath,
      workspaceId,
      profileScope,
    ),
    [databasePath, profileScope, transport, workspaceId],
  );
  const pack = useMemo(() => loadBundledGeographyPack(), []);
  const [mode, setMode] = useState<"compose" | "published">("compose");
  const [activeJourneyId, setActiveJourneyId] = useState<string | null>(null);
  const [published, setPublished] = useState<{
    title: string;
    scenes: StorySurfaceSceneData[];
  } | null>(null);
  const [languages, setLanguages] = useState<Record<string, string>>({});
  const [publishedError, setPublishedError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "published" || !activeJourneyId) {
      setPublished(null);
      setPublishedError(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [{ sequence, scenes }, authoringScenes, support] = await Promise.all([
          repository.getCanonicalJourney(activeJourneyId),
          repository.getJourneyScenes(activeJourneyId),
          repository.getPresentationSupport(),
        ]);
        const authoringById = new Map(authoringScenes.map((scene) => [scene.id, scene] as const));
        const stops = assembleWalk(sequence, scenes, pack.gazetteer);
        const route = walkPathGeometry(stops);
        const presentationScenes = sequence.sceneIds.flatMap((sceneId) => {
          const scene = scenes.find((candidate) => candidate.id === sceneId);
          if (!scene) return [];
          const authored = authoringById.get(scene.id);
          const mediaIds = authored?.mediaAssetIds ?? [];
          const transcriptPath = mediaIds.find((path) => path.toLowerCase().endsWith(".vtt")) ?? null;
          const media = mediaIds.filter((path) => path !== transcriptPath);
          const stop = stops.find((candidate) => candidate.sceneId === scene.id) ?? null;
          return [presentStoryScene({
            scene,
            consents: scene.consents,
            redactions: scene.redactions,
            language: languages[scene.id] ?? "original",
            media,
            transcriptPath,
            streetViewImages: streetViewImagesForPlace(
              scene.placeFrame.placeId,
              pack.gazetteer,
              support.streetImages,
              support.fetchRecords,
            ),
            walkContext: stop ? { coordinate: stop.coordinate, route } : null,
          })];
        });
        if (!cancelled) {
          setPublished({
            title: sequence.name?.trim() || "Untitled journey",
            scenes: presentationScenes,
          });
          setPublishedError(null);
        }
      } catch (cause) {
        if (!cancelled) {
          setPublished(null);
          setPublishedError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeJourneyId, languages, mode, pack.gazetteer, repository]);

  const exportKeepsake = async () => {
    if (!activeJourneyId) return;
    setExportMessage("Exporting…");
    try {
      const [{ sequence, scenes }, authoringScenes, support] = await Promise.all([
        repository.getCanonicalJourney(activeJourneyId),
        repository.getJourneyScenes(activeJourneyId),
        repository.getPresentationSupport(),
      ]);
      const authoringById = new Map(authoringScenes.map((scene) => [scene.id, scene] as const));
      const stops = assembleWalk(sequence, scenes, pack.gazetteer);
      const manifest = buildKeepsakeManifest({
        sequence,
        scenes,
        consents: scenes.flatMap((scene) => scene.consents),
        redactions: scenes.flatMap((scene) => scene.redactions),
        mediaForScene: (sceneId) => authoringById.get(sceneId)?.mediaAssetIds ?? [],
        walk: stops,
        streetViewImagesForScene: (sceneId) => {
          const scene = scenes.find((candidate) => candidate.id === sceneId);
          return scene
            ? streetViewImagesForPlace(
                scene.placeFrame.placeId,
                pack.gazetteer,
                support.streetImages,
                support.fetchRecords,
              )
            : [];
        },
      });
      const outputDir = `${workingRoot.replace(/\/+$/, "")}/keepsake/${sequence.id}`;
      const result = await repository.writeKeepsakeBundle({
        outputDir,
        mediaRoot: workingRoot,
        manifestJson: JSON.stringify(manifest),
      });
      setExportMessage(`Keepsake written (${result.mediaCopied} media files)`);
    } catch (cause) {
      setExportMessage(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <section className="story-lens" data-testid="story-lens">
      <div className="story-lens__mode" data-testid="story-mode-toggle">
        <button
          type="button"
          data-testid="story-compose-mode"
          data-active={mode === "compose" ? "true" : undefined}
          onClick={() => setMode("compose")}
        >Compose</button>
        <button
          type="button"
          data-testid="story-published-mode"
          data-active={mode === "published" ? "true" : undefined}
          disabled={!activeJourneyId}
          onClick={() => setMode("published")}
        >Published view</button>
      </div>

      {mode === "compose" ? (
        <StoryComposerSurface
          repository={repository}
          constellationId={constellationId}
          resolveAsset={(assetId) => assetId}
          onActiveJourneyChange={setActiveJourneyId}
        />
      ) : published ? (
        <>
          <StorySurface
            title={published.title}
            profileScope={profileScope}
            scenes={published.scenes}
            defaultLanguage="original"
            resolveAsset={(path) => path}
            onLanguageChange={(sceneId, language) =>
              setLanguages((current) => ({ ...current, [sceneId]: language }))
            }
          />
          <div className="story-lens__export">
            <button type="button" data-testid="story-export-keepsake" onClick={() => void exportKeepsake()}>
              Export keepsake
            </button>
            {exportMessage && <p data-testid="story-export-message">{exportMessage}</p>}
          </div>
        </>
      ) : publishedError ? (
        <p data-testid="story-published-error">{publishedError}</p>
      ) : (
        <p data-testid="story-published-loading">Loading published journey…</p>
      )}
    </section>
  );
}

/** Publishable street-view imagery associated with a scene's canonical place. */
export function streetViewImagesForPlace(
  placeId: string,
  gazetteer: GazetteerIndex,
  streetImages: StreetViewImageRecord[],
  fetchRecords: FetchRecord[],
): StorySceneStreetView[] {
  const entry = gazetteer.resolveById(placeId);
  const canonicalPlaceId = canonicalGazetteerPlaceId(placeId, gazetteer);
  const matched = new Map<string, StreetViewImageRecord>();

  for (const record of fetchRecords) {
    if (!record.streetViewImageId || !record.placeId) continue;
    if (canonicalGazetteerPlaceId(record.placeId, gazetteer) !== canonicalPlaceId) continue;
    const image = streetImages.find((candidate) => candidate.id === record.streetViewImageId);
    if (image) matched.set(image.id, image);
  }

  if (entry?.latitude !== undefined && entry.longitude !== undefined) {
    for (const image of streetImages) {
      if (image.latitude === null || image.longitude === null) continue;
      if (
        Math.abs(image.latitude - entry.latitude) < 1
        && Math.abs(image.longitude - entry.longitude) < 1
      ) {
        matched.set(image.id, image);
      }
    }
  }

  return [...matched.values()]
    .filter((image) => image.redactionStatus === "redacted" || image.redactionStatus === "none_needed")
    .map((image) => ({
      id: image.id,
      artifactPath: image.artifactPath,
      redactionStatus: image.redactionStatus,
      redactedArtifactPath: image.redactedArtifactPath,
      capturedAt: image.capturedAt,
      latitude: image.latitude,
      longitude: image.longitude,
      headingDegrees: image.headingDegrees,
    }));
}

function canonicalGazetteerPlaceId(placeId: string, gazetteer: GazetteerIndex): string {
  const byId = gazetteer.resolveById(placeId);
  if (byId) return byId.id;
  const slug = placeId.split(":place-").pop();
  if (slug) {
    const matches = gazetteer.searchByName(slug.replace(/-/g, " "), { limit: 1 });
    if (matches.length > 0) return matches[0].id;
  }
  return placeId;
}

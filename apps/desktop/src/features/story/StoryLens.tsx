import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import {
  assembleWalk,
  loadBundledGeographyPack,
  presentStoryScene,
  StorySurface,
  walkPathGeometry,
  type StorySceneStreetView,
  type StorySurfaceSceneData,
} from "@research-canvas/canvas";
import type {
  FetchRecord,
  StreetViewImageRecord,
  WorkspaceTransport,
} from "@research-canvas/desktop-api";
import { buildKeepsakeManifest } from "@research-canvas/exporter";
import type { GazetteerIndex } from "@research-canvas/geography";
import type { Scene, SceneSequence } from "@research-canvas/schema";

import { ensureMigrationStorySeed } from "./seedMigrationStory";

/**
 * The story lens (slice 3): a journey over located events as a scene
 * sequence — multilingual presentation over derived variants, passage-level
 * consent filtering, the place's redacted street-view imagery and the walk's
 * map/globe context inside each scene, and one-click keepsake export through
 * the validated bundle writer. The raw graph and scene store are never
 * modified.
 */

export interface StoryLensProps {
  transport: WorkspaceTransport;
  databasePath: string;
  workspaceId: string;
  repoRoot: string;
  profileScope: string;
  workingRoot: string;
}

export function StoryLens({
  transport,
  databasePath,
  workspaceId,
  repoRoot,
  profileScope,
  workingRoot,
}: StoryLensProps): JSX.Element {
  const [sequences, setSequences] = useState<SceneSequence[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [languages, setLanguages] = useState<Record<string, string>>({});
  const [streetImages, setStreetImages] = useState<StreetViewImageRecord[]>([]);
  const [fetchRecords, setFetchRecords] = useState<FetchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportState, setExportState] = useState<
    "idle" | "exporting" | "done" | "failed"
  >("idle");
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);

  const pack = useMemo(() => loadBundledGeographyPack(), []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSequences, nextScenes, nextStreetImages, nextFetchRecords] =
        await Promise.all([
          transport.listSceneSequences({ databasePath, profileScope }),
          transport.listScenes({ databasePath, profileScope }),
          transport.listStreetViewImages({ databasePath, profileScope }),
          transport.listFetchRecords({ databasePath, profileScope }),
        ]);
      setSequences(nextSequences);
      setScenes(nextScenes);
      setStreetImages(nextStreetImages);
      setFetchRecords(nextFetchRecords);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [databasePath, profileScope, transport]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // On a fresh workspace the profile has no scenes yet; seed the journey from
  // the corpus so the lens and the keepsake export have real content. Seeding
  // is idempotent and never touches the raw graph.
  const [seeding, setSeeding] = useState(false);
  useEffect(() => {
    if (!loading || sequences.length > 0 || scenes.length > 0 || seeding) return;
    setSeeding(true);
    setSeedError(null);
    void (async () => {
      try {
        await ensureMigrationStorySeed({
          transport,
          databasePath,
          workspaceId,
          corpusRoot: repoRoot,
          gazetteer: pack.gazetteer,
          profileScope,
        });
        await reload();
      } catch (cause) {
        // The lens stays usable without a seeded journey; the empty state
        // explains why assembly did not run.
        setSeedError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setSeeding(false);
      }
    })();
  }, [
    databasePath,
    loading,
    reload,
    scenes.length,
    seeding,
    sequences.length,
    transport,
    repoRoot,
    workingRoot,
    workspaceId,
    profileScope,
  ]);

  const storyScenes: StorySurfaceSceneData[] = useMemo(() => {
    const stops = sequences[0]
      ? assembleWalk(sequences[0], scenes, pack.gazetteer)
      : [];
    const route = walkPathGeometry(stops);
    return scenes.map((scene) => {
      const stop =
        stops.find((candidate) => candidate.sceneId === scene.id) ?? null;
      return presentStoryScene({
        scene,
        consents: scene.consents,
        redactions: scene.redactions,
        language: languages[scene.id] ?? "original",
        media: [],
        transcriptPath: null,
        streetViewImages: streetViewImagesForPlace(
          scene.placeFrame.placeId,
          pack.gazetteer,
          streetImages,
          fetchRecords,
        ),
        walkContext: stop
          ? { coordinate: stop.coordinate, route }
          : null,
      });
    });
  }, [fetchRecords, languages, pack.gazetteer, scenes, sequences, streetImages]);

  const exportKeepsake = async () => {
    const sequence = sequences[0];
    if (!sequence) return;
    setExportState("exporting");
    setExportMessage(null);
    try {
      const stops = assembleWalk(sequence, scenes, pack.gazetteer);
      const manifest = buildKeepsakeManifest({
        sequence,
        scenes,
        consents: scenes.flatMap((scene) => scene.consents),
        redactions: scenes.flatMap((scene) => scene.redactions),
        mediaForScene: () => [],
        walk: stops,
        streetViewImagesForScene: (sceneId) => {
          const scene = scenes.find((candidate) => candidate.id === sceneId);
          if (!scene) return [];
          return streetViewImagesForPlace(
            scene.placeFrame.placeId,
            pack.gazetteer,
            streetImages,
            fetchRecords,
          );
        },
      });
      const outputDir = `${workingRoot.replace(/\/+$/, "")}/keepsake/${sequence.id}`;
      const result = await transport.writeKeepsakeBundle({
        outputDir,
        mediaRoot: workingRoot,
        manifestJson: JSON.stringify(manifest),
      });
      setExportState("done");
      setExportMessage(
        `Keepsake written to keepsake/${sequence.id} (${result.mediaCopied} media files)`,
      );
    } catch (cause) {
      setExportState("failed");
      setExportMessage(cause instanceof Error ? cause.message : String(cause));
    }
  };

  if (loading) {
    return (
      <section className="story-lens" data-testid="story-lens">
        <p data-testid="story-loading">Loading the journey…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="story-lens" data-testid="story-lens">
        <p className="story-lens__error" data-testid="story-lens-error">
          {error}
        </p>
      </section>
    );
  }

  return (
    <section className="story-lens" data-testid="story-lens">
      <StorySurface
        title={sequences[0]?.name ?? "Journey"}
        profileScope={profileScope}
        scenes={storyScenes}
        defaultLanguage="original"
        resolveAsset={(path) => path}
        onLanguageChange={(sceneId, language) =>
          setLanguages((current) => ({ ...current, [sceneId]: language }))
        }
      />
      {sequences.length === 0 && seedError && (
        <p className="story-lens__seed-error" data-testid="story-seed-error">
          Journey assembly unavailable: {seedError}
        </p>
      )}
      {sequences[0] && (
        <div className="story-lens__export">
          <button
            type="button"
            data-testid="story-export-keepsake"
            disabled={exportState === "exporting"}
            onClick={() => void exportKeepsake()}
          >
            Export keepsake
          </button>
          {exportMessage && (
            <p
              data-testid="story-export-message"
              data-state={exportState}
            >
              {exportMessage}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The publishable street-view imagery for a scene's place (refinement-2 D4):
 * fetch records associate a place with the street-view image the agentic gate
 * registered (`placeId` → `streetViewImageId`); a coordinate-proximity fallback
 * catches manually imported captures whose lat/lng match the gazetteer place.
 * Only `redacted` or `none_needed` imagery is publishable — a pending capture
 * is never shown in a scene.
 */
export function streetViewImagesForPlace(
  placeId: string,
  gazetteer: GazetteerIndex,
  streetImages: StreetViewImageRecord[],
  fetchRecords: FetchRecord[],
): StorySceneStreetView[] {
  const entry = gazetteer.resolveById(placeId);
  // Normalize both sides to the gazetteer id: the scene's `placeFrame.placeId`
  // is the gazetteer id (e.g. `wikidata:Q727`), while a Task-4 fetch record may
  // store the raw graph node id (`root-archetypal-field:place-amsterdam`) or
  // the gazetteer id itself. Unmatched ids still degrade to the neutral
  // fallback — never an error.
  const canonicalPlaceId = canonicalGazetteerPlaceId(placeId, gazetteer);
  const matched = new Map<string, StreetViewImageRecord>();

  for (const record of fetchRecords) {
    if (!record.streetViewImageId || !record.placeId) continue;
    if (canonicalGazetteerPlaceId(record.placeId, gazetteer) !== canonicalPlaceId) {
      continue;
    }
    const image = streetImages.find(
      (candidate) => candidate.id === record.streetViewImageId,
    );
    if (image) matched.set(image.id, image);
  }

  // Coordinate-proximity fallback for manually imported captures whose
  // lat/lng match the gazetteer place. The 1° threshold is deliberately
  // coarse (it rescues captures registered without a fetch-record place
  // match) and can over-associate imagery of a nearby city; it is a
  // best-effort convenience, never a correctness guarantee — unknown places
  // simply keep the neutral fallback.
  if (entry?.latitude !== undefined && entry.longitude !== undefined) {
    for (const image of streetImages) {
      if (image.latitude === null || image.longitude === null) continue;
      if (
        Math.abs(image.latitude - entry.latitude) < 1 &&
        Math.abs(image.longitude - entry.longitude) < 1
      ) {
        matched.set(image.id, image);
      }
    }
  }

  return [...matched.values()]
    .filter(
      (image) =>
        image.redactionStatus === "redacted" ||
        image.redactionStatus === "none_needed",
    )
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

/**
 * Normalizes a place id to the gazetteer's canonical id. A gazetteer id
 * (`wikidata:Q727`) resolves directly; a raw graph node id
 * (`root-archetypal-field:place-amsterdam`) is resolved through the gazetteer
 * by name (the trailing slug is the place name). Anything unresolvable passes
 * through unchanged so matching degrades to the coordinate-proximity fallback
 * and ultimately the neutral scene fallback — never an error.
 */
function canonicalGazetteerPlaceId(
  placeId: string,
  gazetteer: GazetteerIndex,
): string {
  const byId = gazetteer.resolveById(placeId);
  if (byId) return byId.id;
  const slug = placeId.split(":place-").pop();
  if (slug) {
    const name = slug.replace(/-/g, " ");
    const matches = gazetteer.searchByName(name, { limit: 1 });
    if (matches.length > 0) return matches[0].id;
  }
  return placeId;
}

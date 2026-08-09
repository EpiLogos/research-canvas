import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import {
  assembleWalk,
  presentStoryScene,
  StorySurface,
  type StorySurfaceSceneData,
} from "@research-canvas/canvas";
import type { WorkspaceTransport } from "@research-canvas/desktop-api";
import { buildKeepsakeManifest } from "@research-canvas/exporter";
import { loadBundledGeographyPack } from "@research-canvas/canvas";
import type { Scene, SceneSequence } from "@research-canvas/schema";

import { ensureMigrationStorySeed } from "./seedMigrationStory";

/**
 * The story lens (slice 3): the migration profile's journey as a scene
 * sequence — multilingual presentation over derived variants, passage-level
 * consent filtering, and one-click keepsake export through the validated
 * bundle writer. The raw graph and scene store are never modified.
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportState, setExportState] = useState<
    "idle" | "exporting" | "done" | "failed"
  >("idle");
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSequences, nextScenes] = await Promise.all([
        transport.listSceneSequences({ databasePath, profileScope }),
        transport.listScenes({ databasePath, profileScope }),
      ]);
      setSequences(nextSequences);
      setScenes(nextScenes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [databasePath, profileScope, transport]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // On a fresh workspace the migration profile has no scenes yet; seed the
  // journey from the corpus so the lens and the keepsake export have real
  // content. Seeding is idempotent and never touches the raw graph.
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
          gazetteer: loadBundledGeographyPack().gazetteer,
        });
        await reload();
      } catch (cause) {
        // The lens stays usable without a seeded story; the empty state
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
  ]);

  const storyScenes: StorySurfaceSceneData[] = useMemo(
    () =>
      scenes.map((scene) =>
        presentStoryScene({
          scene,
          consents: scene.consents,
          redactions: scene.redactions,
          language: languages[scene.id] ?? "original",
          media: [],
          transcriptPath: null,
        }),
      ),
    [languages, scenes],
  );

  const exportKeepsake = async () => {
    const sequence = sequences[0];
    if (!sequence) return;
    setExportState("exporting");
    setExportMessage(null);
    try {
      const pack = loadBundledGeographyPack();
      const stops = assembleWalk(sequence, scenes, pack.gazetteer);
      const manifest = buildKeepsakeManifest({
        sequence,
        scenes,
        consents: scenes.flatMap((scene) => scene.consents),
        redactions: scenes.flatMap((scene) => scene.redactions),
        mediaForScene: () => [],
        walk: stops,
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
        <p data-testid="story-loading">Loading the migration story…</p>
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
        title={sequences[0]?.name ?? "Migration story"}
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
          Story assembly unavailable: {seedError}
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

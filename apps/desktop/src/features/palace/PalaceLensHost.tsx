import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import {
  applyPalaceLayoutToScene,
  buildPalaceBundle,
  buildPalaceScene,
  encapsulationEdgesFromRelationships,
  palaceLayoutFromScene,
  PalaceEditor,
  PalaceSurface,
  type PalaceCuration,
} from "@research-canvas/canvas";
import type { PalaceLayout } from "@research-canvas/domain";
import type { WorkspaceServices } from "@research-canvas/desktop-api";
import type { Scene, SceneSequence } from "@research-canvas/schema";

import {
  DesktopPalaceRepository,
  type PalaceProjection,
} from "./DesktopPalaceRepository";

/**
 * Surface #5 host. The mature generated/WebGL palace remains the renderer;
 * T14 adds a constellation-scoped local layout layer over it so manual rooms,
 * corridors and wall objects persist without becoming graph mutations.
 */
export interface PalaceLensHostProps {
  transport: WorkspaceServices;
  constellationId: string;
  databasePath: string;
  workspaceId: string;
  profileScope: string;
  workingRoot: string;
}

export function PalaceLensHost({
  transport,
  constellationId,
  databasePath,
  workspaceId,
  profileScope,
  workingRoot,
}: PalaceLensHostProps): JSX.Element {
  const repository = useMemo(
    () => new DesktopPalaceRepository(
      transport,
      databasePath,
      workspaceId,
      profileScope,
    ),
    [databasePath, profileScope, transport, workspaceId],
  );
  const [projection, setProjection] = useState<PalaceProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportState, setExportState] = useState<"idle" | "exporting" | "done" | "failed">(
    "idle",
  );
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        // Materialise the scoped layout first, then read the projection so a
        // fresh constellation immediately has durable local presentation state.
        await repository.getOrCreatePalace(constellationId);
        const next = await repository.getProjection(constellationId);
        if (!cancelled) setProjection(next);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [constellationId, repository]);

  const saveCuration = useCallback(
    async (nextCuration: PalaceCuration) => {
      if (!projection) return;
      const generatedScene = buildPalaceScene({
        nodes: projection.nodes,
        relationships: projection.relationships,
        profileScope,
        curation: nextCuration,
        encapsulationEdges: encapsulationEdgesFromRelationships(projection.encapsulationEdges),
      });
      const nextProjection = {
        ...projection,
        curation: nextCuration,
        generatedScene,
      };
      setProjection(nextProjection);
      await repository.saveCuration(constellationId, nextCuration, projection.layout);
    },
    [constellationId, profileScope, projection, repository],
  );

  const saveLayout = useCallback(
    async (layout: PalaceLayout) => {
      if (!projection) return;
      setProjection({ ...projection, layout });
      await repository.updatePalace(constellationId, layout);
    },
    [constellationId, projection, repository],
  );

  const regenerateLayout = useCallback(async () => {
    if (!projection) return;
    const layout = palaceLayoutFromScene(constellationId, projection.generatedScene);
    setProjection({ ...projection, layout });
    await repository.updatePalace(constellationId, layout);
  }, [constellationId, projection, repository]);

  const persistWalk = useCallback(
    ({ sequence, scenes }: { sequence: SceneSequence; scenes: Scene[] }) => {
      void (async () => {
        for (const scene of scenes) {
          await transport.upsertScene({ databasePath, scene });
        }
        await transport.upsertSceneSequence({ databasePath, sequence });
      })();
    },
    [databasePath, transport],
  );

  const scene = useMemo(
    () => projection
      ? applyPalaceLayoutToScene(projection.generatedScene, projection.layout)
      : null,
    [projection],
  );

  const exportPalaceBundle = useCallback(() => {
    if (!projection || !scene) return;
    const bundle = buildPalaceBundle({
      scene,
      nodes: projection.nodes,
      relationships: projection.relationships,
      encapsulationEdges: encapsulationEdgesFromRelationships(projection.encapsulationEdges),
      curation: projection.curation,
    });
    setExportState("exporting");
    setExportMessage(null);
    const outputDir = workingRoot
      ? `${workingRoot.replace(/\/+$/, "")}/palace`
      : "palace";
    void (async () => {
      try {
        const result = await transport.writePalaceBundle({
          outputDir,
          bundleJson: JSON.stringify(bundle),
        });
        setExportState("done");
        setExportMessage(`Palace bundle written to palace/${result.bundlePath}`);
      } catch (cause) {
        setExportState("failed");
        setExportMessage(cause instanceof Error ? cause.message : String(cause));
      }
    })();
  }, [projection, scene, transport, workingRoot]);

  if (loading) {
    return (
      <section className="palace-host" data-testid="palace-host">
        <p data-testid="palace-loading">Generating the mind palace…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="palace-host" data-testid="palace-host">
        <p className="palace-host__error" data-testid="palace-host-error">{error}</p>
      </section>
    );
  }

  if (!projection || !scene || (projection.nodes.length === 0 && projection.relationships.length === 0)) {
    return (
      <section className="palace-host" data-testid="palace-host">
        <p data-testid="palace-host-empty">
          No graph structure is available to generate a palace for this constellation.
        </p>
      </section>
    );
  }

  return (
    <section
      className="palace-host"
      data-testid="palace-host"
      data-constellation-id={constellationId}
      data-encapsulation-edges={projection.encapsulationEdges.length}
    >
      <PalaceEditor
        layout={projection.layout}
        nodes={projection.nodes}
        onChange={saveLayout}
        onGenerate={regenerateLayout}
      >
        <PalaceSurface
          scene={scene}
          nodes={projection.nodes}
          relationships={projection.relationships}
          encapsulationEdges={encapsulationEdgesFromRelationships(projection.encapsulationEdges)}
          curation={projection.curation}
          onSaveCuration={saveCuration}
          onPersistWalk={persistWalk}
          onExportBundle={exportPalaceBundle}
        />
      </PalaceEditor>
      {exportMessage && (
        <p
          className="palace-lens__export-state"
          data-state={exportState}
          data-testid="palace-export-state"
        >
          {exportMessage}
        </p>
      )}
    </section>
  );
}

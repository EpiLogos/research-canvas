import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import {
  buildPalaceBundle,
  buildPalaceScene,
  clusterChambers,
  curateChambers,
  encapsulationEdgesFromRelationships,
  PalaceSurface,
  type PalaceCuration,
} from "@research-canvas/canvas";
import type {
  GraphNode,
  GraphRelationship,
  WorkspaceTransport,
} from "@research-canvas/desktop-api";
import type { Scene, SceneSequence } from "@research-canvas/schema";

/**
 * Mind-palace host (slice 4 → refinement-2 D5): feeds the 3D palace surface
 * with the real graph, loads the persisted curation from the profile store,
 * saves curation changes, and persists palace walks as scene sequences so they
 * surface in the story and psychogeographic lenses too. All palace layout is
 * curation in the SQLite presentation store — never a graph write.
 */

export interface PalaceLensHostProps {
  transport: WorkspaceTransport;
  databasePath: string;
  workspaceId: string;
  profileScope: string;
  /** The workspace content root; the palace bundle is exported under it. */
  workingRoot: string;
}

export function PalaceLensHost({
  transport,
  databasePath,
  workspaceId,
  profileScope,
  workingRoot,
}: PalaceLensHostProps): JSX.Element {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [relationships, setRelationships] = useState<GraphRelationship[]>([]);
  const [encapsulationEdges, setEncapsulationEdges] = useState<
    GraphRelationship[]
  >([]);
  const [storedCuration, setStoredCuration] = useState<PalaceCuration | null>(null);
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
        // The palace subgraph surface returns the real ENCAPSULATES edges
        // through the graph repository layer (`list_encapsulation_edges`),
        // not a filter over the timeline view's bounded relationship
        // neighbourhood. The palace shapes full/partial/compressed
        // constellations from this repository surface.
        const [view, stored] = await Promise.all([
          transport.loadPalaceGraph({ workspaceId }),
          transport.loadPalaceCuration({ databasePath, profileScope }),
        ]);
        if (cancelled) return;
        setNodes(view.nodes.map((record) => record.node));
        setRelationships(view.relationships);
        setEncapsulationEdges(view.encapsulationEdges);
        setStoredCuration((stored.curation as PalaceCuration | null) ?? null);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [databasePath, profileScope, transport, workspaceId]);

  const saveCuration = useCallback(
    async (next: PalaceCuration) => {
      await transport.savePalaceCuration({
        databasePath,
        profileScope,
        curation: next,
      });
    },
    [databasePath, profileScope, transport],
  );

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

  const curation = useMemo<PalaceCuration>(() => {
    if (storedCuration) return storedCuration;
    const candidates = clusterChambers(nodes, relationships);
    const nodesById = new Map(nodes.map((node) => [node.graphNodeId, node]));
    return curateChambers(candidates, nodesById, profileScope);
  }, [storedCuration, nodes, relationships, profileScope]);

  // The transport returns raw ENCAPSULATES GraphRelationships; the palace
  // scene builder consumes the edge view. The adapter is a pure shape
  // conversion — the edges themselves come from the graph repository surface
  // (`loadPalaceGraph`), not a filter over the timeline view.
  const encapsulationEdgesInput = useMemo(
    () => encapsulationEdgesFromRelationships(encapsulationEdges),
    [encapsulationEdges],
  );

  const scene = useMemo(
    () =>
      buildPalaceScene({
        nodes,
        relationships,
        profileScope,
        curation,
        encapsulationEdges: encapsulationEdgesInput,
      }),
    [nodes, relationships, profileScope, curation, encapsulationEdgesInput],
  );

  const exportPalaceBundle = useCallback(() => {
    const bundle = buildPalaceBundle({
      scene,
      nodes,
      relationships,
      encapsulationEdges: encapsulationEdgesInput,
      curation,
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
        setExportMessage(
          `Palace bundle written to palace/${result.bundlePath}`,
        );
      } catch (cause) {
        setExportState("failed");
        setExportMessage(cause instanceof Error ? cause.message : String(cause));
      }
    })();
  }, [scene, nodes, relationships, encapsulationEdgesInput, curation, workingRoot, transport]);

  const isEmpty = useMemo(
    () => nodes.length === 0 && relationships.length === 0,
    [nodes.length, relationships.length],
  );

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
        <p className="palace-host__error" data-testid="palace-host-error">
          {error}
        </p>
      </section>
    );
  }

  if (isEmpty) {
    return (
      <section className="palace-host" data-testid="palace-host">
        <p data-testid="palace-host-empty">
          No graph structure is available to generate a palace for this profile.
        </p>
      </section>
    );
  }

  return (
    <section
      className="palace-host"
      data-testid="palace-host"
      data-encapsulation-edges={encapsulationEdges.length}
    >
      <PalaceSurface
        scene={scene}
        nodes={nodes}
        relationships={relationships}
        encapsulationEdges={encapsulationEdgesInput}
        curation={curation}
        onSaveCuration={saveCuration}
        onPersistWalk={persistWalk}
        onExportBundle={exportPalaceBundle}
      />
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

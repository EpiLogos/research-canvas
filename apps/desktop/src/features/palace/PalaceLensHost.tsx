import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import {
  PalaceLens,
  type PalaceCuration,
} from "@research-canvas/canvas";
import type {
  GraphNode,
  GraphRelationship,
  WorkspaceTransport,
} from "@research-canvas/desktop-api";
import type { Scene, SceneSequence } from "@research-canvas/schema";

/**
 * Mind-palace host (slice 4): feeds the palace lens with the real graph,
 * loads the persisted curation from the profile store, saves curation
 * changes, and persists palace walks as scene sequences so they surface in
 * the story and psychogeographic lenses too.
 */

export interface PalaceLensHostProps {
  transport: WorkspaceTransport;
  databasePath: string;
  workspaceId: string;
  profileScope: string;
}

export function PalaceLensHost({
  transport,
  databasePath,
  workspaceId,
  profileScope,
}: PalaceLensHostProps): JSX.Element {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [relationships, setRelationships] = useState<GraphRelationship[]>([]);
  const [curation, setCuration] = useState<PalaceCuration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [view, stored] = await Promise.all([
          transport.loadTimelineView({ workspaceId }),
          transport.loadPalaceCuration({ databasePath, profileScope }),
        ]);
        if (cancelled) return;
        setNodes(view.nodes.map((record) => record.node));
        setRelationships(view.relationships);
        setCuration((stored.curation as PalaceCuration | null) ?? null);
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
    <section className="palace-host" data-testid="palace-host">
      <PalaceLens
        nodes={nodes}
        relationships={relationships}
        profileScope={profileScope}
        curation={curation}
        onSaveCuration={saveCuration}
        onPersistWalk={persistWalk}
      />
    </section>
  );
}

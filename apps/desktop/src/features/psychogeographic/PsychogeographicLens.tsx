import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import {
  loadBundledGeographyPack,
  PsychogeographicMap,
  StreetViewSurface,
  type MapSurfaceRenderer,
  type WalkStop,
} from "@research-canvas/canvas";
import type {
  StreetViewImageRecord,
  WorkspaceTransport,
} from "@research-canvas/desktop-api";
import {
  createLiveServicePolicy,
  type LiveServicePolicy,
} from "@research-canvas/geography";

import {
  assembleProfileWalk,
  loadProfileWalks,
} from "./assembleWalk";
import { StreetViewImportDialog } from "./StreetViewImportDialog";

/**
 * The Places lens (slice 2, refinement-2 D1): a globe-first offline map over
 * the spine's Temporal Places plus the street-view imagery core, sharing one
 * live-service policy so opt-ins are explicit per action and every live call
 * is visible. Walks are agent-assembled from real graph events when none exist
 * yet.
 */

export interface PsychogeographicLensProps {
  transport: WorkspaceTransport;
  databasePath: string;
  workspaceId: string;
  profileScope: string;
  mediaRoot?: string;
  renderer?: MapSurfaceRenderer;
  resolveAsset?: (artifactPath: string) => string;
}

interface WalkView {
  sequenceId: string;
  stops: WalkStop[];
}

let sharedPolicy: LiveServicePolicy | null = null;

export function geographyPolicy(): LiveServicePolicy {
  if (!sharedPolicy) {
    sharedPolicy = createLiveServicePolicy();
  }
  return sharedPolicy;
}

export function PsychogeographicLens({
  transport,
  databasePath,
  workspaceId,
  profileScope,
  mediaRoot = "",
  renderer,
  resolveAsset,
}: PsychogeographicLensProps): JSX.Element {
  const pack = useMemo(() => loadBundledGeographyPack(), []);
  const policy = useMemo(() => geographyPolicy(), []);
  const [walks, setWalks] = useState<WalkView[]>([]);
  const [streetImages, setStreetImages] = useState<StreetViewImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [assembling, setAssembling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [importOpen, setImportOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const existing = await loadProfileWalks({
        transport,
        databasePath,
        workspaceId,
        profileScope,
        gazetteer: pack.gazetteer,
      });
      if (existing.length === 0) {
        setAssembling(true);
        try {
          const assembled = await assembleProfileWalk({
            transport,
            databasePath,
            workspaceId,
            profileScope,
            gazetteer: pack.gazetteer,
          });
          setWalks(
            assembled.sequence
              ? [{ sequenceId: assembled.sequence.id, stops: assembled.stops }]
              : [],
          );
        } finally {
          setAssembling(false);
        }
      } else {
        setWalks(
          existing.map(({ sequence, stops }) => ({
            sequenceId: sequence.id,
            stops,
          })),
        );
      }
      setStreetImages(
        await transport.listStreetViewImages({
          databasePath,
          profileScope,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [databasePath, pack.gazetteer, profileScope, transport, workspaceId]);

  useEffect(() => {
    void reload();
  }, [reload, refreshVersion]);

  const activeWalk = walks[0] ?? null;
  const tileSource = useMemo(
    () => ({
      kind: "geojson" as const,
      url: `data:application/geo+json,${encodeURIComponent(JSON.stringify(pack.basemap))}`,
      attribution: pack.manifest.tileSource.attribution,
    }),
    [pack],
  );
  const assetResolver =
    resolveAsset ?? ((artifactPath: string) => artifactPath);

  if (loading && walks.length === 0 && !error) {
    return (
      <section className="psychogeographic-lens" data-testid="psychogeographic-lens">
        <p data-testid="psychogeographic-loading">
          {assembling ? "Assembling the walk from the graph…" : "Loading the Places surface…"}
        </p>
      </section>
    );
  }

  if (error && walks.length === 0) {
    return (
      <section className="psychogeographic-lens" data-testid="psychogeographic-lens">
        <p className="psychogeographic-error" data-testid="psychogeographic-error">
          {error}
        </p>
        <button type="button" onClick={() => setRefreshVersion((version) => version + 1)}>
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="psychogeographic-lens" data-testid="psychogeographic-lens">
      <div className="psychogeographic-toolbar">
        <h2>Places surface · {profileScope}</h2>
        <button
          type="button"
          data-testid="psychogeographic-refresh"
          onClick={() => setRefreshVersion((version) => version + 1)}
        >
          Refresh
        </button>
      </div>
      {activeWalk ? (
        <PsychogeographicMap
          walkId={activeWalk.sequenceId}
          stops={activeWalk.stops}
          tileSource={tileSource}
          policy={policy}
          renderer={renderer}
        />
      ) : (
        <div className="psychogeographic-empty" data-testid="psychogeographic-empty">
          <p>
            No temporal events located at gazetted places were found to assemble a
            walk for this profile.
          </p>
          <p className="psychogeographic-empty__hint">
            Add LOCATED_AT links from dated events to gazetted places, then
            refresh this surface.
          </p>
        </div>
      )}
      <StreetViewSurface
        images={streetImages}
        policy={policy}
        resolveAsset={assetResolver}
        onImport={mediaRoot ? () => setImportOpen(true) : undefined}
      />
      {importOpen && mediaRoot && (
        <StreetViewImportDialog
          transport={transport}
          databasePath={databasePath}
          mediaRoot={mediaRoot}
          profileScope={profileScope}
          onClose={() => setImportOpen(false)}
          onImported={() => void reload()}
        />
      )}
    </section>
  );
}

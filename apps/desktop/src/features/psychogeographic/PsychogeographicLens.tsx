import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import {
  loadBundledGeographyPack,
  PsychogeographicMap,
  StreetViewSurface,
  type MapSurfaceRenderer,
} from "@research-canvas/canvas";
import type {
  StreetViewImageRecord,
  WorkspaceServices,
} from "@research-canvas/desktop-api";
import {
  createLiveServicePolicy,
  type LiveServicePolicy,
} from "@research-canvas/geography";

import { DesktopPlacesRepository } from "./DesktopPlacesRepository";
import { StreetViewImportDialog } from "./StreetViewImportDialog";

export interface PsychogeographicLensProps {
  transport: WorkspaceServices;
  projectId: string;
  databasePath: string;
  workspaceId: string;
  profileScope: string;
  mediaRoot?: string;
  /** Retained for call-site compatibility; Places no longer seeds a corpus
   * walk or movement lane merely because the surface was opened. */
  repoRoot?: string;
  renderer?: MapSurfaceRenderer;
  resolveAsset?: (artifactPath: string) => string;
  onOpenCanvasNode?: (graphNodeId: string) => void | Promise<void>;
}

let sharedPolicy: LiveServicePolicy | null = null;

export function geographyPolicy(): LiveServicePolicy {
  if (!sharedPolicy) sharedPolicy = createLiveServicePolicy();
  return sharedPolicy;
}

/** Desktop composition for Surface #3. The globe owns its project-wide
 * repository reads; this host only supplies the desktop adapter, bundled
 * offline basemap, shared live-service policy, and Street View companion. */
export function PsychogeographicLens({
  transport,
  projectId,
  databasePath,
  workspaceId,
  profileScope,
  mediaRoot = "",
  renderer,
  resolveAsset,
  onOpenCanvasNode,
}: PsychogeographicLensProps): JSX.Element {
  const pack = useMemo(() => loadBundledGeographyPack(), []);
  const policy = useMemo(() => geographyPolicy(), []);
  const [streetImages, setStreetImages] = useState<StreetViewImageRecord[]>([]);
  const [streetError, setStreetError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [importOpen, setImportOpen] = useState(false);

  const repository = useMemo(
    () => new DesktopPlacesRepository(
      transport,
      projectId,
      workspaceId,
      databasePath,
      profileScope,
    ),
    [databasePath, profileScope, projectId, refreshVersion, transport, workspaceId],
  );

  const reloadStreetView = useCallback(async () => {
    setStreetError(null);
    try {
      setStreetImages(await transport.listStreetViewImages({ databasePath, profileScope }));
    } catch (cause) {
      setStreetError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [databasePath, profileScope, transport]);

  useEffect(() => {
    void reloadStreetView();
  }, [reloadStreetView, refreshVersion]);

  const tileSource = useMemo(
    () => ({
      kind: "geojson" as const,
      url: `data:application/geo+json,${encodeURIComponent(JSON.stringify(pack.basemap))}`,
      attribution: pack.manifest.tileSource.attribution,
    }),
    [pack],
  );
  const assetResolver = resolveAsset ?? ((artifactPath: string) => artifactPath);

  return (
    <section
      className="psychogeographic-lens"
      data-testid="psychogeographic-lens"
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      <PsychogeographicMap
        repository={repository}
        projectId={projectId}
        tileSource={tileSource}
        policy={policy}
        renderer={renderer}
        onOpenCanvasNode={onOpenCanvasNode}
      />

      <button
        type="button"
        data-testid="psychogeographic-refresh"
        onClick={() => setRefreshVersion((version) => version + 1)}
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          zIndex: 12,
        }}
      >
        Refresh project geography
      </button>

      {streetError && (
        <div
          role="status"
          data-testid="street-view-load-error"
          style={{ position: "absolute", right: 14, bottom: 14, zIndex: 12 }}
        >
          Street View unavailable: {streetError}
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
          onImported={() => {
            setImportOpen(false);
            void reloadStreetView();
          }}
        />
      )}
    </section>
  );
}

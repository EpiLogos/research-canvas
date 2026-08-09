import { useEffect, useMemo, useRef, useState, type JSX } from "react";

import type { LiveServicePolicy } from "@research-canvas/geography";

import type { WalkStop } from "../scenes/walkAssembly";
import type { MapTileSource } from "./mapStyle";
import {
  createMaplibreRenderer,
  type MapSurfaceRenderer,
} from "./renderer";

export interface PsychogeographicMapProps {
  walkId: string;
  stops: WalkStop[];
  tileSource: MapTileSource;
  policy: LiveServicePolicy;
  /** Renderer port; defaults to the MapLibre GL adapter. Tests inject a
   * recording adapter. */
  renderer?: MapSurfaceRenderer;
  onOpenStop?: (stop: WalkStop) => void;
}

/**
 * The psychogeographic surface (slice 2): an offline-first map over the
 * spine's Temporal Places, drawing a walk from a scene sequence. Live
 * services never fire unless the policy grants them, and the connection
 * indicator is always visible while a live call is active.
 */
export function PsychogeographicMap({
  walkId,
  stops,
  tileSource,
  policy,
  renderer: rendererProp,
  onOpenStop,
}: PsychogeographicMapProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [renderer, setRenderer] = useState<MapSurfaceRenderer | null>(
    rendererProp ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const policyState = policy.state();
  const activeReason = policy.activeReason();
  const tileRefreshOptedIn = policy.isOptedIn("tile_refresh");
  const mountedRenderer = useRef<MapSurfaceRenderer | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    if (rendererProp) {
      setRenderer(rendererProp);
      return;
    }
    void createMaplibreRenderer().then((adapter) => {
      if (!cancelled) setRenderer(adapter);
    });
    return () => {
      cancelled = true;
    };
  }, [rendererProp]);

  useEffect(() => {
    if (!renderer || !containerRef.current) return;
    mountedRenderer.current = renderer;
    renderer
      .create(containerRef.current, tileSource)
      .then(() => renderer.drawWalk(walkId, stops))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      );
    return () => {
      mountedRenderer.current = null;
      renderer.destroy();
    };
    // The surface mounts once per renderer/tile source; stops are drawn via
    // the dedicated effect below so walk updates never recreate the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer, tileSource]);

  useEffect(() => {
    if (!mountedRenderer.current) return;
    void mountedRenderer.current.drawWalk(walkId, stops);
  }, [walkId, stops]);

  const liveTileRequested = useMemo(
    () => () => {
      if (policy.requestLiveAction("tile_refresh", "refresh live basemap tiles") !== "granted") {
        return;
      }
      const liveSource: MapTileSource = {
        kind: "raster",
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: "© OpenStreetMap contributors",
      };
      void mountedRenderer.current?.setLiveTileSource(liveSource);
    },
    [policy],
  );

  return (
    <div className="psychogeographic-surface" data-testid="psychogeographic-surface">
      <div
        ref={containerRef}
        className="psychogeographic-map"
        data-testid="psychogeographic-map"
      />
      <div
        className="psychogeographic-connection"
        data-testid="psychogeographic-connection"
        data-state={policyState}
        aria-live="polite"
      >
        {policyState === "offline" && "Offline — no data leaves this machine"}
        {policyState === "opted_in" && "Live services opted in — currently offline"}
        {policyState === "active" && `Live: ${activeReason}`}
      </div>
      {!tileRefreshOptedIn ? (
        <button
          type="button"
          data-testid="psychogeographic-opt-in-live"
          onClick={() => {
            policy.optIn("tile_refresh", "refresh live basemap tiles");
            setTick((tick) => tick + 1);
          }}
        >
          Enable live tile refresh
        </button>
      ) : (
        <button
          type="button"
          data-testid="psychogeographic-refresh-tiles"
          onClick={() => {
            liveTileRequested();
            setTick((tick) => tick + 1);
          }}
        >
          Refresh tiles
        </button>
      )}
      {stops.length > 0 && (
        <ol className="psychogeographic-stops" data-testid="psychogeographic-stops">
          {stops.map((stop) => (
            <li key={stop.sceneId}>
              <button
                type="button"
                data-testid={`psychogeographic-stop-${stop.sceneId}`}
                onClick={() => onOpenStop?.(stop)}
              >
                {stop.title} · {stop.validAt}
                {!stop.located && " · unlocated"}
              </button>
            </li>
          ))}
        </ol>
      )}
      {error && (
        <div role="alert" data-testid="psychogeographic-error">
          Map unavailable: {error}
        </div>
      )}
    </div>
  );
}

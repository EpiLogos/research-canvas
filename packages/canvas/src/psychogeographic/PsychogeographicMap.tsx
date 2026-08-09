import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";

import type { LiveServicePolicy } from "@research-canvas/geography";

import type { WalkStop } from "../scenes/walkAssembly";
import type { MapTileSource } from "./mapStyle";
import {
  createMaplibreRenderer,
  type MapSurfaceRenderer,
  type MapViewState,
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
 * The Places surface (refinement-2 D1): a globe-first map over the spine's
 * Temporal Places, drawing a walk from a scene sequence as great-circle arcs.
 * The globe is the default surface; clicking a place or walk stop descends
 * into the flat map (the detail view), and one action returns to the globe.
 * Live services never fire unless the policy grants them, and the connection
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
  const [view, setView] = useState<"globe" | "flat">("globe");
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [travelIndex, setTravelIndex] = useState(0);
  const [viewState, setViewState] = useState<MapViewState>({
    latitude: 20,
    longitude: 0,
    zoom: 1,
  });
  const stopClickRef = useRef<(sceneId: string) => void>(() => {});

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

  const selectStop = useCallback(
    (sceneId: string) => {
      const stop = stops.find((candidate) => candidate.sceneId === sceneId);
      if (!stop) return;
      setSelectedStopId(sceneId);
      // The open-stop contract fires for every stop, located or not — an
      // unlocated stop's detail must remain reachable.
      onOpenStop?.(stop);
      if (!stop.coordinate) return;
      setView("flat");
      void mountedRenderer.current?.setProjection?.("flat");
      void mountedRenderer.current?.flyTo?.(
        stop.coordinate.latitude,
        stop.coordinate.longitude,
        4,
      );
    },
    [onOpenStop, stops],
  );
  stopClickRef.current = selectStop;

  const backToGlobe = useCallback(() => {
    setSelectedStopId(null);
    setView("globe");
    void mountedRenderer.current?.setProjection?.("globe");
    void mountedRenderer.current?.flyTo?.(20, 0, 1);
  }, []);

  const flyToNextPlace = useCallback(() => {
    const located = stops.filter(
      (stop): stop is WalkStop & { coordinate: { latitude: number; longitude: number } } =>
        stop.coordinate !== null,
    );
    if (located.length === 0) return;
    const index = travelIndex % located.length;
    const stop = located[index];
    setTravelIndex((current) => current + 1);
    setSelectedStopId(stop.sceneId);
    void mountedRenderer.current?.flyTo?.(
      stop.coordinate.latitude,
      stop.coordinate.longitude,
      3,
    );
  }, [stops, travelIndex]);

  useEffect(() => {
    if (!renderer || !containerRef.current) return;
    mountedRenderer.current = renderer;
    renderer
      .create(containerRef.current, tileSource, { projection: "globe" })
      .then(() => {
        renderer.setStopClickHandler?.((sceneId) => stopClickRef.current(sceneId));
        renderer.onViewChange?.((next) => setViewState(next));
        return renderer.drawWalk(walkId, stops);
      })
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
    <div
      className="psychogeographic-surface"
      data-testid="psychogeographic-surface"
      data-view={view}
    >
      <div className="psychogeographic-toolbar">
        {view === "flat" ? (
          <button
            type="button"
            data-testid="places-back-to-globe"
            onClick={backToGlobe}
          >
            ← Back to globe
          </button>
        ) : (
          <button
            type="button"
            data-testid="places-fly-next"
            onClick={flyToNextPlace}
          >
            Fly to next place
          </button>
        )}
        <span className="psychogeographic-view-label" data-testid="places-view-label">
          {view === "globe" ? "Globe" : "Flat detail"}
        </span>
      </div>
      <div
        ref={containerRef}
        className="psychogeographic-map"
        data-testid="psychogeographic-map"
        data-center={`${viewState.longitude.toFixed(4)},${viewState.latitude.toFixed(4)}`}
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
                data-selected={selectedStopId === stop.sceneId ? "true" : "false"}
                data-located={stop.located ? "true" : "false"}
                onClick={() => selectStop(stop.sceneId)}
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

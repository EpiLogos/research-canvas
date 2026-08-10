import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";

import type { GeographyEdge } from "@research-canvas/schema";
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
  /** Movement-stream lanes (ticket #19) drawn as mode-styled arcs. */
  lanes?: GeographyEdge[];
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
  lanes = [],
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
  const laneClickRef = useRef<(laneId: string) => void>(() => {});
  const [activeLaneYear, setActiveLaneYear] = useState<number | null>(null);
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null);

  const laneYearRange = useMemo(() => {
    if (lanes.length === 0) return null;
    const years = lanes.flatMap((lane) => [
      temporalBoundYear(lane.timeWindow.start),
      temporalBoundYear(lane.timeWindow.end),
    ]);
    return [Math.min(...years), Math.max(...years)] as [number, number];
  }, [lanes]);

  const filteredLanes = useMemo(() => {
    if (activeLaneYear === null) return lanes;
    return lanes.filter((lane) => {
      const start = temporalBoundYear(lane.timeWindow.start);
      const end = temporalBoundYear(lane.timeWindow.end);
      return start <= activeLaneYear && activeLaneYear <= end;
    });
  }, [lanes, activeLaneYear]);

  const selectedLane = useMemo(
    () => lanes.find((lane) => lane.id === selectedLaneId) ?? null,
    [lanes, selectedLaneId],
  );

  const selectLane = useCallback(
    (laneId: string) => {
      const lane = lanes.find((candidate) => candidate.id === laneId);
      if (!lane) return;
      setSelectedLaneId(laneId);
      const coordinates = lane.geometry.coordinates;
      if (coordinates.length >= 2) {
        const mid = coordinates[Math.floor(coordinates.length / 2)];
        void mountedRenderer.current?.flyTo?.(mid[1], mid[0], 3);
      }
    },
    [lanes],
  );
  laneClickRef.current = selectLane;

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
        renderer.setLaneClickHandler?.((laneId) => laneClickRef.current(laneId));
        renderer.onViewChange?.((next) => setViewState(next));
        // Draw lanes before the walk so place markers sit above the arcs.
        return renderer
          .drawLanes?.(filteredLanes)
          .then(() => renderer.drawWalk(walkId, stops));
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

  useEffect(() => {
    if (!mountedRenderer.current) return;
    void mountedRenderer.current.drawLanes?.(filteredLanes);
  }, [filteredLanes]);

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
      {lanes.length > 0 && (
        <div className="psychogeographic-lanes-panel" data-testid="psychogeographic-lanes-panel">
          {laneYearRange && (
            <label className="psychogeographic-lane-filter">
              <span>Lanes active in year</span>
              <input
                type="range"
                data-testid="lane-year-filter"
                min={laneYearRange[0]}
                max={laneYearRange[1]}
                value={activeLaneYear ?? laneYearRange[1]}
                onChange={(event) => setActiveLaneYear(Number(event.target.value))}
              />
              <span data-testid="lane-year-value">
                {activeLaneYear === null ? "all" : activeLaneYear}
              </span>
              {activeLaneYear !== null && (
                <button
                  type="button"
                  data-testid="lane-year-clear"
                  onClick={() => setActiveLaneYear(null)}
                >
                  Show all
                </button>
              )}
            </label>
          )}
          <ol className="psychogeographic-lanes" data-testid="psychogeographic-lanes">
            {filteredLanes.map((lane) => (
              <li key={lane.id}>
                <button
                  type="button"
                  data-testid={`geography-lane-${lane.seedKey}`}
                  data-selected={selectedLaneId === lane.id ? "true" : "false"}
                  data-mode={lane.mode}
                  onClick={() => selectLane(lane.id)}
                >
                  {lane.label} · {lane.mode} · {lane.timeWindow.start}–{lane.timeWindow.end}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      {selectedLane && (
        <aside className="psychogeographic-lane-provenance" data-testid="lane-provenance">
          <h3>{selectedLane.label}</h3>
          <dl>
            <dt>Mode</dt>
            <dd>{selectedLane.mode}</dd>
            <dt>Time window</dt>
            <dd>
              {selectedLane.timeWindow.start} – {selectedLane.timeWindow.end}
            </dd>
            <dt>Route</dt>
            <dd>
              {selectedLane.sourcePlaceId} → {selectedLane.targetPlaceId}
            </dd>
          </dl>
          <h4>Source passages</h4>
          <ul>
            {selectedLane.provenance.sourceRefs.map((ref, index) => (
              <li key={index}>
                {ref.artifactId}
                {ref.unit.kind === "text_span" && (
                  <span>
                    {" "}
                    · chars {ref.unit.startOffset}–{ref.unit.endOffset}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </aside>
      )}
      {error && (
        <div role="alert" data-testid="psychogeographic-error">
          Map unavailable: {error}
        </div>
      )}
    </div>
  );
}

/** Extracts the calendar year from an ISO-8601 temporal bound (`YYYY` or a
 * fuller date/datetime). Used for the lane temporal filter. */
function temporalBoundYear(value: string): number {
  const match = /^(\d{4})/.exec(value);
  return match ? Number(match[1]) : 0;
}

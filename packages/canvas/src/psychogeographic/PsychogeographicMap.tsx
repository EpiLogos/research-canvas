import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";

import type { ArchetypalExpression, GeographyEdge, GraphNodeContract } from "@research-canvas/schema";
import type { LocatedGraphNode, PlacesRepository } from "@research-canvas/domain";
import type { LiveServicePolicy } from "@research-canvas/geography";

import { LocationPanel, pointForPlace } from "./LocationPanel";
import type { MapTileSource } from "./mapStyle";
import {
  createMaplibreRenderer,
  type ArchetypeExpressionRenderMarker,
  type MapSurfaceRenderer,
  type MapViewState,
  type PlaceRenderMarker,
} from "./renderer";

export interface PsychogeographicMapProps {
  repository: PlacesRepository;
  projectId: string;
  tileSource: MapTileSource;
  policy: LiveServicePolicy;
  renderer?: MapSurfaceRenderer;
  initialViewState?: MapViewState;
  initialSelectedGraphNodeId?: string | null;
  onViewStateChange?: (viewState: MapViewState) => void;
  onSelectedGraphNodeIdChange?: (graphNodeId: string | null) => void;
  onOpenCanvasNode?: (graphNodeId: string) => void | Promise<void>;
}

/**
 * Surface #3 Places: a globe-first, project-wide projection of canonical
 * Temporal Places. It is deliberately not a Story walk. The surface queries
 * its PlacesRepository for every located project node, durable movement lanes,
 * and archetypal expressions; live tiles remain an explicit opt-in enhancement
 * over the bundled/offline base.
 */
export function PsychogeographicMap({
  repository,
  projectId,
  tileSource,
  policy,
  renderer: rendererProp,
  initialViewState,
  initialSelectedGraphNodeId = null,
  onViewStateChange,
  onSelectedGraphNodeIdChange,
  onOpenCanvasNode,
}: PsychogeographicMapProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mountedRenderer = useRef<MapSurfaceRenderer | null>(null);
  const placeClickRef = useRef<(graphNodeId: string) => void>(() => {});
  const placeDoubleClickRef = useRef<(graphNodeId: string) => void>(() => {});
  const laneClickRef = useRef<(laneId: string) => void>(() => {});
  const initialViewStateRef = useRef<MapViewState | undefined>(initialViewState);
  const onViewStateChangeRef = useRef(onViewStateChange);
  const onSelectedGraphNodeIdChangeRef = useRef(onSelectedGraphNodeIdChange);
  onViewStateChangeRef.current = onViewStateChange;
  onSelectedGraphNodeIdChangeRef.current = onSelectedGraphNodeIdChange;

  const [renderer, setRenderer] = useState<MapSurfaceRenderer | null>(rendererProp ?? null);
  const [view, setView] = useState<"globe" | "flat">("globe");
  const [viewState, setViewState] = useState<MapViewState>(() =>
    initialViewState ?? { latitude: 20, longitude: 0, zoom: 1 },
  );
  const [nodes, setNodes] = useState<LocatedGraphNode[]>([]);
  const [lanes, setLanes] = useState<GeographyEdge[]>([]);
  const [expressionsByPlace, setExpressionsByPlace] = useState<Map<string, ArchetypalExpression[]>>(new Map());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialSelectedGraphNodeId);
  const [relatedNodes, setRelatedNodes] = useState<GraphNodeContract[]>([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [policyRevision, setPolicyRevision] = useState(0);
  const [liveTilesActive, setLiveTilesActive] = useState(false);
  const [liveFallback, setLiveFallback] = useState(false);
  const [activeLaneYear, setActiveLaneYear] = useState<number | null>(null);
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null);

  const tileRefreshOptedIn = policy.isOptedIn("tile_refresh");
  void policyRevision;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([
      repository.getLocatedNodes(projectId),
      repository.getGeographyEdges(projectId),
    ])
      .then(async ([locatedNodes, geographyEdges]) => {
        const expressionRows = await Promise.all(
          locatedNodes.map(async (node) => {
            try {
              const expressions = await repository.getArchetypeExpressionsForPlace(projectId, node.graphNodeId);
              return [node.graphNodeId, expressions] as const;
            } catch {
              return [node.graphNodeId, [] as ArchetypalExpression[]] as const;
            }
          }),
        );
        if (cancelled) return;
        setNodes(locatedNodes);
        setLanes(geographyEdges);
        setExpressionsByPlace(new Map(expressionRows));
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, repository]);

  const placeMarkers = useMemo<PlaceRenderMarker[]>(() => nodes.flatMap((node) => {
    const point = pointForPlace(node);
    if (!point) return [];
    return [{
      graphNodeId: node.graphNodeId,
      title: node.title,
      latitude: point.latitude,
      longitude: point.longitude,
      precision: node.place.coordinate.precision,
      entityType: node.entityType,
    }];
  }), [nodes]);

  const expressionMarkers = useMemo<ArchetypeExpressionRenderMarker[]>(() => {
    const pointsByPlace = new Map(
      nodes.flatMap((node) => {
        const point = pointForPlace(node);
        return point ? [[node.graphNodeId, point] as const] : [];
      }),
    );
    return [...expressionsByPlace.entries()].flatMap(([placeGraphNodeId, expressions]) => {
      const point = pointsByPlace.get(placeGraphNodeId);
      if (!point) return [];
      return expressions.map((expression) => ({
        expressionId: expression.id,
        placeGraphNodeId,
        latitude: point.latitude,
        longitude: point.longitude,
        title: `${expression.expressionKind} · ${expression.timeWindow.start}`,
      }));
    });
  }, [expressionsByPlace, nodes]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.graphNodeId === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedExpressions = selectedNode
    ? expressionsByPlace.get(selectedNode.graphNodeId) ?? []
    : [];

  useEffect(() => {
    if (!selectedNodeId || !nodes.some((node) => node.graphNodeId === selectedNodeId)) {
      setRelatedNodes([]);
      setContextLoading(false);
      return;
    }
    let cancelled = false;
    setRelatedNodes([]);
    setContextLoading(true);
    void repository.getRelatedNodesForPlace(projectId, selectedNodeId)
      .then((related) => {
        if (!cancelled) setRelatedNodes(related);
      })
      .catch(() => {
        if (!cancelled) setRelatedNodes([]);
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nodes, projectId, repository, selectedNodeId]);

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
  }, [activeLaneYear, lanes]);

  const selectedLane = useMemo(
    () => lanes.find((lane) => lane.id === selectedLaneId) ?? null,
    [lanes, selectedLaneId],
  );

  const selectPlace = useCallback((graphNodeId: string) => {
    const node = nodes.find((candidate) => candidate.graphNodeId === graphNodeId);
    if (!node) return;
    setSelectedNodeId(graphNodeId);
    onSelectedGraphNodeIdChangeRef.current?.(graphNodeId);
    const point = pointForPlace(node);
    if (point) void mountedRenderer.current?.flyTo?.(point.latitude, point.longitude, Math.max(3, viewState.zoom));
  }, [nodes, viewState.zoom]);
  placeClickRef.current = selectPlace;

  const openPlaceOnCanvas = useCallback((graphNodeId: string) => {
    selectPlace(graphNodeId);
    void onOpenCanvasNode?.(graphNodeId);
  }, [onOpenCanvasNode, selectPlace]);
  placeDoubleClickRef.current = openPlaceOnCanvas;

  const selectLane = useCallback((laneId: string) => {
    const lane = lanes.find((candidate) => candidate.id === laneId);
    if (!lane) return;
    setSelectedLaneId(laneId);
    const coordinates = lane.geometry.coordinates;
    if (coordinates.length >= 2) {
      const mid = coordinates[Math.floor(coordinates.length / 2)];
      void mountedRenderer.current?.flyTo?.(mid[1], mid[0], 3);
    }
  }, [lanes]);
  laneClickRef.current = selectLane;

  useEffect(() => {
    let cancelled = false;
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
    renderer.create(containerRef.current, tileSource, { projection: "globe" })
      .then(() => {
        renderer.setPlaceClickHandler?.((graphNodeId) => placeClickRef.current(graphNodeId));
        renderer.setPlaceDoubleClickHandler?.((graphNodeId) => placeDoubleClickRef.current(graphNodeId));
        renderer.setLaneClickHandler?.((laneId) => laneClickRef.current(laneId));
        renderer.onViewChange?.((nextViewState) => {
          setViewState(nextViewState);
          onViewStateChangeRef.current?.(nextViewState);
        });
        const restoredViewState = initialViewStateRef.current;
        if (restoredViewState) {
          void renderer.flyTo?.(
            restoredViewState.latitude,
            restoredViewState.longitude,
            restoredViewState.zoom,
          );
        }
        return Promise.all([
          renderer.drawPlaces?.(placeMarkers, expressionMarkers),
          renderer.drawLanes?.(filteredLanes),
        ]);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
    return () => {
      mountedRenderer.current = null;
      renderer.destroy();
    };
    // Data redraws are handled by dedicated effects below; recreating the map
    // would reset the user's camera on every repository result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer, tileSource]);

  useEffect(() => {
    if (!mountedRenderer.current) return;
    void mountedRenderer.current.drawPlaces?.(placeMarkers, expressionMarkers);
  }, [expressionMarkers, placeMarkers]);

  useEffect(() => {
    if (!mountedRenderer.current) return;
    void mountedRenderer.current.drawLanes?.(filteredLanes);
  }, [filteredLanes]);

  const setProjection = useCallback((next: "globe" | "flat") => {
    setView(next);
    void mountedRenderer.current?.setProjection?.(next);
  }, []);

  const refreshLiveTiles = useCallback(async () => {
    if (policy.requestLiveAction("tile_refresh", "refresh live basemap tiles") !== "granted") return;
    const liveSource: MapTileSource = {
      kind: "raster",
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "© OpenStreetMap contributors",
    };
    try {
      await mountedRenderer.current?.setLiveTileSource(liveSource);
      setLiveTilesActive(true);
      setLiveFallback(false);
    } catch {
      setLiveTilesActive(false);
      setLiveFallback(true);
      try {
        await mountedRenderer.current?.setLiveTileSource(tileSource);
      } catch {
        // The original offline surface stays mounted even if a source swap is
        // unsupported by a test/static renderer.
      }
    }
  }, [policy, tileSource]);

  const connectionLabel = liveFallback
    ? "Live tiles (offline fallback)"
    : liveTilesActive
      ? "Live tiles"
      : "Offline";

  return (
    <div
      className="psychogeographic-surface"
      data-testid="psychogeographic-surface"
      data-view={view}
      style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#05070f" }}
    >
      <div
        className="psychogeographic-toolbar"
        data-testid="places-toolbar"
        style={{
          position: "absolute",
          zIndex: 10,
          top: 10,
          left: 10,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: 5,
          border: "1px solid var(--ob-line-3, #3a4e64)",
          borderRadius: 9,
          background: "rgba(17,24,37,.9)",
          backdropFilter: "blur(12px)",
        }}
      >
        <button type="button" data-testid="places-globe-toggle" data-active={view === "globe"} onClick={() => setProjection("globe")}>Globe</button>
        <button type="button" data-testid="places-flat-toggle" data-active={view === "flat"} onClick={() => setProjection("flat")}>Flat</button>
        <button type="button" data-testid="places-zoom-fit" disabled={placeMarkers.length === 0} onClick={() => void mountedRenderer.current?.fitToPlaces?.(placeMarkers)}>Zoom to fit</button>
        {!tileRefreshOptedIn ? (
          <button
            type="button"
            data-testid="psychogeographic-opt-in-live"
            onClick={() => {
              policy.optIn("tile_refresh", "refresh live basemap tiles");
              setPolicyRevision((revision) => revision + 1);
            }}
          >
            Enable live tiles
          </button>
        ) : (
          <button
            type="button"
            data-testid="psychogeographic-refresh-tiles"
            onClick={() => void refreshLiveTiles()}
          >
            Refresh tiles
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        className="psychogeographic-map"
        data-testid={view === "globe" ? "places-globe" : "places-flat-map"}
        data-center={`${viewState.longitude.toFixed(4)},${viewState.latitude.toFixed(4)}`}
        style={{ position: "absolute", inset: 0 }}
      />

      <div
        className="psychogeographic-connection"
        data-testid="places-connection-status"
        data-state={liveFallback ? "fallback" : liveTilesActive ? "live" : "offline"}
        aria-live="polite"
        style={{
          position: "absolute",
          left: 12,
          bottom: 12,
          zIndex: 9,
          padding: "5px 9px",
          borderRadius: 999,
          background: "rgba(9,13,19,.82)",
          color: "var(--ob-dim, #8797ab)",
          fontSize: 11,
        }}
      >
        {connectionLabel}
      </div>

      {loading && (
        <div data-testid="places-loading" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", color: "#8797ab" }}>
          Reading project geography…
        </div>
      )}

      {!loading && nodes.length === 0 && !error && (
        <div data-testid="psychogeographic-empty" style={{ position: "absolute", left: 18, bottom: 48, zIndex: 7, color: "#8797ab", fontSize: 12 }}>
          No canonical Place projections are recorded in this project yet.
        </div>
      )}

      {selectedNode && (
        <LocationPanel
          node={selectedNode}
          relatedNodes={relatedNodes}
          expressions={selectedExpressions}
          loadingContext={contextLoading}
        />
      )}

      {lanes.length > 0 && (
        <div
          className="psychogeographic-lanes-panel"
          data-testid="psychogeographic-lanes-panel"
          style={{ position: "absolute", left: 12, top: 58, zIndex: 8, width: 290, maxHeight: "42%", overflow: "auto", padding: 10, borderRadius: 10, background: "rgba(17,24,37,.88)", border: "1px solid var(--ob-line, #1b2634)" }}
        >
          {laneYearRange && (
            <label className="psychogeographic-lane-filter" style={{ display: "grid", gap: 5, fontSize: 11 }}>
              <span>Lanes active in year · {activeLaneYear === null ? "all" : activeLaneYear}</span>
              <input
                type="range"
                data-testid="lane-year-filter"
                min={laneYearRange[0]}
                max={laneYearRange[1]}
                value={activeLaneYear ?? laneYearRange[1]}
                onChange={(event) => setActiveLaneYear(Number(event.target.value))}
              />
              <span data-testid="lane-year-value" hidden>{activeLaneYear === null ? "all" : activeLaneYear}</span>
              {activeLaneYear !== null && (
                <button type="button" data-testid="lane-year-clear" onClick={() => setActiveLaneYear(null)}>Show all</button>
              )}
            </label>
          )}
          <ol className="psychogeographic-lanes" data-testid="psychogeographic-lanes" style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
            {filteredLanes.map((lane) => (
              <li key={lane.id}>
                <button
                  type="button"
                  data-testid={`geography-lane-${lane.seedKey}`}
                  data-selected={selectedLaneId === lane.id ? "true" : "false"}
                  data-mode={lane.mode}
                  onClick={() => selectLane(lane.id)}
                  style={{ width: "100%", textAlign: "left" }}
                >
                  {lane.label} · {lane.mode}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {selectedLane && (
        <aside className="psychogeographic-lane-provenance" data-testid="lane-provenance" style={{ position: "absolute", left: 12, bottom: 46, zIndex: 9, width: 320, maxHeight: "38%", overflow: "auto", padding: 12, borderRadius: 10, background: "rgba(17,24,37,.94)", border: "1px solid var(--ob-line-3, #3a4e64)" }}>
          <h3 style={{ marginTop: 0 }}>{selectedLane.label}</h3>
          <dl>
            <dt>Mode</dt><dd>{selectedLane.mode}</dd>
            <dt>Time window</dt><dd>{selectedLane.timeWindow.start} – {selectedLane.timeWindow.end}</dd>
            <dt>Route</dt><dd>{selectedLane.sourcePlaceId} → {selectedLane.targetPlaceId}</dd>
          </dl>
          <h4>Source passages</h4>
          <ul>
            {selectedLane.provenance.sourceRefs.map((ref, index) => (
              <li key={index}>
                {ref.artifactId}
                {ref.unit.kind === "text_span" && <span> · chars {ref.unit.startOffset}–{ref.unit.endOffset}</span>}
              </li>
            ))}
          </ul>
        </aside>
      )}

      {error && (
        <div role="alert" data-testid="psychogeographic-error" style={{ position: "absolute", right: 12, bottom: 12, zIndex: 11 }}>
          Map unavailable: {error}
        </div>
      )}
    </div>
  );
}

function temporalBoundYear(value: string): number {
  const match = /^(\d{4})/.exec(value);
  return match ? Number(match[1]) : 0;
}

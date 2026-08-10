import "maplibre-gl/dist/maplibre-gl.css";

import type { GeographyEdge } from "@research-canvas/schema";
import type {
  GeoJSONSource,
  SourceSpecification,
  StyleSpecification,
} from "maplibre-gl";

import type { WalkStop } from "../scenes/walkAssembly";
import {
  buildGeographyEdgeSource,
  buildPlaceMarkers,
  buildWalkPathSource,
  createOfflineMapStyle,
  GEOGRAPHY_EDGE_COLORS,
  GLOBE,
  type MapSurfaceOptions,
  type MapSurfaceProjection,
  type MapTileSource,
} from "./mapStyle";

/**
 * The rendering port of the Places surface. The desktop app binds the
 * MapLibre GL implementation (below); tests and the static web viewer can
 * bind their own adapter. All geography logic (styles, markers, walk
 * geometry, policy gating) lives outside this port.
 */
export interface MapViewState {
  latitude: number;
  longitude: number;
  zoom: number;
}

export interface MapSurfaceRenderer {
  create(
    container: HTMLElement,
    tileSource: MapTileSource,
    options?: MapSurfaceOptions,
  ): Promise<void>;
  drawWalk(walkId: string, stops: WalkStop[]): Promise<void>;
  /** Draw movement-stream lanes (ticket #19) as mode-styled arcs. */
  drawLanes?(edges: GeographyEdge[]): Promise<void>;
  setLiveTileSource(tileSource: MapTileSource): Promise<void>;
  centerOn(latitude: number, longitude: number, zoom?: number): Promise<void>;
  /** Animated camera flight to a place over the globe surface (task-2 step 4). */
  flyTo?(latitude: number, longitude: number, zoom?: number): Promise<void>;
  /** Switch between the globe surface and the flat detail map (task-2 step 6). */
  setProjection?(projection: MapSurfaceProjection): Promise<void>;
  /** Register a handler for stop-marker clicks on the map surface. */
  setStopClickHandler?(handler: (sceneId: string) => void): void;
  /** Register a handler for lane-arc clicks on the map surface (ticket #19). */
  setLaneClickHandler?(handler: (laneId: string) => void): void;
  /** Register a handler for camera moves (used to surface the current center). */
  onViewChange?(handler: (view: MapViewState) => void): void;
  destroy(): void;
}

/** MapLibre GL implementation of the renderer port. The map stays fully
 * offline by default: the style references only local sources, so the globe
 * and the walk arcs draw with zero external network requests. */
export async function createMaplibreRenderer(): Promise<MapSurfaceRenderer> {
  const maplibre = await import("maplibre-gl");
  let map: InstanceType<typeof maplibre.Map> | null = null;
  let stopClickHandler: ((sceneId: string) => void) | null = null;
  let laneClickHandler: ((laneId: string) => void) | null = null;
  let viewChangeHandler: ((view: MapViewState) => void) | null = null;

  function emitViewChange(): void {
    if (!map || !viewChangeHandler) return;
    const center = map.getCenter();
    viewChangeHandler({
      latitude: center.lat,
      longitude: center.lng,
      zoom: map.getZoom(),
    });
  }

  return {
    async create(el, tileSource, options) {
      const projection: MapSurfaceProjection =
        options?.projection ?? "globe";
      map = new maplibre.Map({
        container: el,
        style: createOfflineMapStyle(tileSource, {
          projection,
        }) as StyleSpecification,
        attributionControl: { compact: false },
      });
      map.on("moveend", emitViewChange);
      map.on("click", "psychogeographic-marker-layer", (event) => {
        const feature = event.features?.[0];
        const sceneId = feature?.properties?.id as string | undefined;
        if (sceneId && stopClickHandler) stopClickHandler(sceneId);
      });
      map.on("click", "geography-edges-layer", (event) => {
        const feature = event.features?.[0];
        const laneId = feature?.properties?.id as string | undefined;
        if (laneId && laneClickHandler) laneClickHandler(laneId);
      });
      await waitForStyleLoad(map);
      // setSky throws "Style is not done loading" if called before the style
      // reaches load, so it must happen after waitForStyleLoad.
      if (projection === "globe") {
        map.setSky({ "sky-color": GLOBE.space, "sky-horizon-blend": 0.4 });
      }
      emitViewChange();
    },
    async drawWalk(walkId, stops) {
      if (!map) throw new Error("map renderer is not initialized");
      const markers = buildPlaceMarkers(stops);
      const path = buildWalkPathSource(walkId, stops);
      addGeoJsonSource(map, "psychogeographic-markers", {
        type: "FeatureCollection",
        features: markers,
      });
      addGeoJsonSource(map, "psychogeographic-walk", path);
      ensureLayer(map, {
        id: "psychogeographic-walk-layer",
        type: "line",
        source: "psychogeographic-walk",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": GLOBE.arc, "line-width": 3 },
      });
      ensureLayer(map, {
        id: "psychogeographic-marker-layer",
        type: "circle",
        source: "psychogeographic-markers",
        paint: {
          "circle-radius": 7,
          "circle-color": GLOBE.marker,
          "circle-stroke-color": "#17171d",
          "circle-stroke-width": 2,
        },
      });
    },
    async drawLanes(edges) {
      if (!map) throw new Error("map renderer is not initialized");
      addGeoJsonSource(map, "geography-edges", buildGeographyEdgeSource(edges));
      ensureLayer(map, {
        id: "geography-edges-layer",
        type: "line",
        source: "geography-edges",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": [
            "match",
            ["get", "mode"],
            "flight",
            GEOGRAPHY_EDGE_COLORS.flight,
            "shipping",
            GEOGRAPHY_EDGE_COLORS.shipping,
            "overland",
            GEOGRAPHY_EDGE_COLORS.overland,
            "inland_water",
            GEOGRAPHY_EDGE_COLORS.inland_water,
            GLOBE.arc,
          ],
          "line-width": 2,
          "line-opacity": 0.85,
        },
      });
    },
    async setLiveTileSource(tileSource) {
      if (!map) throw new Error("map renderer is not initialized");
      map.removeSource("offline");
      map.addSource(
        "offline",
        sourceDefinition(tileSource) as SourceSpecification,
      );
    },
    async centerOn(latitude, longitude, zoom) {
      if (!map) return;
      map.jumpTo({ center: [longitude, latitude], zoom: zoom ?? 5 });
    },
    async flyTo(latitude, longitude, zoom) {
      if (!map) return;
      map.flyTo({
        center: [longitude, latitude],
        zoom: zoom ?? 4,
        duration: 1800,
      });
    },
    async setProjection(projection) {
      if (!map) return;
      map.setProjection({
        type: projection === "globe" ? "globe" : "mercator",
      });
      if (projection === "globe") {
        map.setSky({ "sky-color": GLOBE.space, "sky-horizon-blend": 0.4 });
      }
      // MapLibre ignores the sky in mercator, so leaving it set is harmless in
      // the flat detail view.
      // The flat detail view is clean: graticule + dark ocean are globe-only.
      // This keeps the runtime flat path consistent with a flat-created style
      // (which omits both layers).
      const globeOnly = projection === "globe";
      if (map.getLayer("graticule-lines")) {
        map.setLayoutProperty(
          "graticule-lines",
          "visibility",
          globeOnly ? "visible" : "none",
        );
      }
      if (map.getLayer("ocean-background")) {
        map.setLayoutProperty(
          "ocean-background",
          "visibility",
          globeOnly ? "visible" : "none",
        );
      }
    },
    setStopClickHandler(handler) {
      stopClickHandler = handler;
    },
    setLaneClickHandler(handler) {
      laneClickHandler = handler;
    },
    onViewChange(handler) {
      viewChangeHandler = handler;
    },
    destroy() {
      map?.remove();
      map = null;
      stopClickHandler = null;
      laneClickHandler = null;
      viewChangeHandler = null;
    },
  };
}

function sourceDefinition(tileSource: MapTileSource): Record<string, unknown> {
  if (tileSource.kind === "geojson") {
    return { type: "geojson", data: tileSource.url };
  }
  if (tileSource.kind === "raster") {
    return {
      type: "raster",
      tiles: [tileSource.url],
      tileSize: tileSource.tileSize ?? 256,
      attribution: tileSource.attribution,
    };
  }
  return { type: "vector", url: tileSource.url, attribution: tileSource.attribution };
}

function addGeoJsonSource(
  map: InstanceType<typeof import("maplibre-gl").Map>,
  id: string,
  data: unknown,
): void {
  if (map.getSource(id)) {
    (map.getSource(id) as unknown as GeoJSONSource).setData(data as never);
  } else {
    map.addSource(id, {
      type: "geojson",
      data: data as never,
    } as SourceSpecification);
  }
}

function ensureLayer(
  map: InstanceType<typeof import("maplibre-gl").Map>,
  layer: Record<string, unknown>,
): void {
  const id = layer.id as string;
  if (map.getLayer(id)) return;
  map.addLayer(layer as never);
}

function waitForStyleLoad(
  map: InstanceType<typeof import("maplibre-gl").Map>,
): Promise<void> {
  if (map.isStyleLoaded()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "map style load timed out (is the maplibre-gl worker being served?)",
          ),
        ),
      15_000,
    );
    map.once("load", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

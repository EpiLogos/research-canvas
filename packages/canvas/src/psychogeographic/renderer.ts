import "maplibre-gl/dist/maplibre-gl.css";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

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

export interface MapViewState {
  latitude: number;
  longitude: number;
  zoom: number;
}

export interface PlaceRenderMarker {
  graphNodeId: string;
  title: string;
  latitude: number;
  longitude: number;
  precision: string;
  entityType: string;
}

export interface ArchetypeExpressionRenderMarker {
  expressionId: string;
  placeGraphNodeId: string;
  latitude: number;
  longitude: number;
  title: string;
}

/**
 * Rendering port for Surface #3. The legacy walk methods remain available to
 * old sequence/story consumers, while Places itself uses `drawPlaces` and is
 * therefore no longer shaped around a single walk.
 */
export interface MapSurfaceRenderer {
  create(
    container: HTMLElement,
    tileSource: MapTileSource,
    options?: MapSurfaceOptions,
  ): Promise<void>;
  drawWalk(walkId: string, stops: WalkStop[]): Promise<void>;
  drawPlaces?(
    places: PlaceRenderMarker[],
    expressions: ArchetypeExpressionRenderMarker[],
  ): Promise<void>;
  drawLanes?(edges: GeographyEdge[]): Promise<void>;
  setLiveTileSource(tileSource: MapTileSource): Promise<void>;
  centerOn(latitude: number, longitude: number, zoom?: number): Promise<void>;
  flyTo?(latitude: number, longitude: number, zoom?: number): Promise<void>;
  fitToPlaces?(places: PlaceRenderMarker[]): Promise<void>;
  setProjection?(projection: MapSurfaceProjection): Promise<void>;
  setStopClickHandler?(handler: (sceneId: string) => void): void;
  setPlaceClickHandler?(handler: (graphNodeId: string) => void): void;
  setPlaceDoubleClickHandler?(handler: (graphNodeId: string) => void): void;
  setLaneClickHandler?(handler: (laneId: string) => void): void;
  onViewChange?(handler: (view: MapViewState) => void): void;
  destroy(): void;
}

/** MapLibre GL implementation. The initial style stays fully offline; a live
 * raster source is installed only after the surface's LiveServicePolicy grants
 * the explicit action. */
export async function createMaplibreRenderer(): Promise<MapSurfaceRenderer> {
  const maplibre = await import("maplibre-gl");
  maplibre.setWorkerUrl(maplibreWorkerUrl);
  let map: InstanceType<typeof maplibre.Map> | null = null;
  let stopClickHandler: ((sceneId: string) => void) | null = null;
  let placeClickHandler: ((graphNodeId: string) => void) | null = null;
  let placeDoubleClickHandler: ((graphNodeId: string) => void) | null = null;
  let laneClickHandler: ((laneId: string) => void) | null = null;
  let viewChangeHandler: ((view: MapViewState) => void) | null = null;
  let htmlMarkers: Array<{ remove(): void }> = [];

  function emitViewChange(): void {
    if (!map || !viewChangeHandler) return;
    const center = map.getCenter();
    viewChangeHandler({
      latitude: center.lat,
      longitude: center.lng,
      zoom: map.getZoom(),
    });
  }

  function clearHtmlMarkers(): void {
    for (const marker of htmlMarkers) marker.remove();
    htmlMarkers = [];
  }

  return {
    async create(el, tileSource, options) {
      const projection: MapSurfaceProjection = options?.projection ?? "globe";
      map = new maplibre.Map({
        container: el,
        style: createOfflineMapStyle(tileSource, { projection }) as StyleSpecification,
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
    async drawPlaces(places, expressions) {
      if (!map) throw new Error("map renderer is not initialized");
      clearHtmlMarkers();

      for (const place of places) {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "places-globe-marker";
        element.dataset.testid = `globe-marker-${place.graphNodeId}`;
        element.dataset.precision = place.precision;
        element.dataset.entityType = place.entityType;
        element.title = place.title;
        element.setAttribute("aria-label", `Open ${place.title}`);
        Object.assign(element.style, {
          width: "16px",
          height: "16px",
          borderRadius: "50%",
          border: "2px solid #17171d",
          background: GLOBE.marker,
          boxShadow: "0 0 0 3px rgba(208,162,74,.18), 0 2px 10px rgba(0,0,0,.6)",
          cursor: "pointer",
          padding: "0",
        });
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          placeClickHandler?.(place.graphNodeId);
        });
        element.addEventListener("dblclick", (event) => {
          event.preventDefault();
          event.stopPropagation();
          placeDoubleClickHandler?.(place.graphNodeId);
        });
        htmlMarkers.push(
          new maplibre.Marker({ element, anchor: "center" })
            .setLngLat([place.longitude, place.latitude])
            .addTo(map),
        );
      }

      for (const expression of expressions) {
        const element = document.createElement("span");
        element.className = "places-archetype-marker";
        element.dataset.testid = `globe-archetype-marker-${expression.expressionId}`;
        element.title = expression.title;
        Object.assign(element.style, {
          display: "block",
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: "#b892d8",
          boxShadow: "0 0 0 4px rgba(184,146,216,.15), 0 0 12px rgba(184,146,216,.65)",
          pointerEvents: "none",
          transform: "translate(10px, -10px)",
        });
        htmlMarkers.push(
          new maplibre.Marker({ element, anchor: "center" })
            .setLngLat([expression.longitude, expression.latitude])
            .addTo(map),
        );
      }
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
      if (map.getLayer("offline-base")) map.removeLayer("offline-base");
      if (map.getSource("offline")) map.removeSource("offline");
      map.addSource("offline", sourceDefinition(tileSource) as SourceSpecification);
      map.addLayer({
        id: "offline-base",
        type: tileSource.kind === "raster" ? "raster" : tileSource.kind === "geojson" ? "circle" : "background",
        source: "offline",
        paint: tileSource.kind === "geojson"
          ? { "circle-radius": 4, "circle-color": GLOBE.basePoint, "circle-opacity": 0.9 }
          : {},
      } as never, "geography-edges-layer");
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
        duration: 900,
      });
    },
    async fitToPlaces(places) {
      if (!map || places.length === 0) return;
      if (places.length === 1) {
        map.flyTo({
          center: [places[0].longitude, places[0].latitude],
          zoom: 5,
          duration: 700,
        });
        return;
      }
      const bounds = new maplibre.LngLatBounds();
      for (const place of places) bounds.extend([place.longitude, place.latitude]);
      map.fitBounds(bounds, { padding: 72, maxZoom: 6, duration: 700 });
    },
    async setProjection(projection) {
      if (!map) return;
      map.setProjection({ type: projection === "globe" ? "globe" : "mercator" });
      if (projection === "globe") {
        map.setSky({ "sky-color": GLOBE.space, "sky-horizon-blend": 0.4 });
      }
      const globeOnly = projection === "globe";
      if (map.getLayer("graticule-lines")) {
        map.setLayoutProperty("graticule-lines", "visibility", globeOnly ? "visible" : "none");
      }
      if (map.getLayer("ocean-background")) {
        map.setLayoutProperty("ocean-background", "visibility", globeOnly ? "visible" : "none");
      }
    },
    setStopClickHandler(handler) {
      stopClickHandler = handler;
    },
    setPlaceClickHandler(handler) {
      placeClickHandler = handler;
    },
    setPlaceDoubleClickHandler(handler) {
      placeDoubleClickHandler = handler;
    },
    setLaneClickHandler(handler) {
      laneClickHandler = handler;
    },
    onViewChange(handler) {
      viewChangeHandler = handler;
    },
    destroy() {
      clearHtmlMarkers();
      map?.remove();
      map = null;
      stopClickHandler = null;
      placeClickHandler = null;
      placeDoubleClickHandler = null;
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
      () => reject(new Error("map style load timed out (is the maplibre-gl worker being served?)")),
      15_000,
    );
    map.once("load", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

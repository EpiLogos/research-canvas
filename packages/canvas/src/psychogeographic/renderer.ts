import type {
  GeoJSONSource,
  SourceSpecification,
  StyleSpecification,
} from "maplibre-gl";

import type { WalkStop } from "../scenes/walkAssembly";
import {
  buildPlaceMarkers,
  buildWalkPathSource,
  createOfflineMapStyle,
  type MapTileSource,
} from "./mapStyle";

/**
 * The rendering port of the psychogeographic surface. The desktop app binds
 * the MapLibre GL implementation (below); tests and the static web viewer
 * can bind their own adapter. All geography logic (styles, markers, walk
 * geometry, policy gating) lives outside this port.
 */
export interface MapSurfaceRenderer {
  create(container: HTMLElement, tileSource: MapTileSource): Promise<void>;
  drawWalk(walkId: string, stops: WalkStop[]): Promise<void>;
  setLiveTileSource(tileSource: MapTileSource): Promise<void>;
  centerOn(latitude: number, longitude: number, zoom?: number): Promise<void>;
  destroy(): void;
}

/** MapLibre GL implementation of the renderer port. The map stays fully
 * offline by default: the style references only local sources. */
export async function createMaplibreRenderer(): Promise<MapSurfaceRenderer> {
  const maplibre = await import("maplibre-gl");
  let map: InstanceType<typeof maplibre.Map> | null = null;

  return {
    async create(el, tileSource) {
      map = new maplibre.Map({
        container: el,
        style: createOfflineMapStyle(tileSource) as StyleSpecification,
        attributionControl: { compact: false },
      });
      await waitForStyleLoad(map);
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
        paint: { "line-color": "#8a6bbf", "line-width": 3 },
      });
      ensureLayer(map, {
        id: "psychogeographic-marker-layer",
        type: "circle",
        source: "psychogeographic-markers",
        paint: {
          "circle-radius": 7,
          "circle-color": "#d0a24a",
          "circle-stroke-color": "#17171d",
          "circle-stroke-width": 2,
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
    destroy() {
      map?.remove();
      map = null;
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
  return new Promise((resolve) => {
    map.once("load", () => resolve());
  });
}

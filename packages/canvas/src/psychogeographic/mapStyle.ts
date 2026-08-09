import type { WalkStop } from "../scenes/walkAssembly";

/**
 * Offline-first map style construction (vision §3.10, research findings §2):
 * the surface renders from a local source by default — a bundled GeoJSON
 * dataset for v1, or a local raster/PMTiles archive when a tile pack is
 * bundled. Live tile refresh only ever swaps the source URL, and only after
 * the policy gates it.
 */
export type MapTileSource =
  | { kind: "geojson"; url: string; attribution: string }
  | { kind: "raster"; url: string; attribution: string; tileSize?: number }
  | { kind: "pmtiles"; url: string; attribution: string };

export interface MapMarkerFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    id: string;
    title: string;
    validAt: string;
    located: boolean;
  };
}

export interface WalkPathFeature {
  type: "Feature";
  geometry:
    | { type: "LineString"; coordinates: Array<[number, number]> }
    | { type: "LineString"; coordinates: [] };
  properties: { walkId: string };
}

export function createOfflineMapStyle(tileSource: MapTileSource): object {
  const sources: Record<string, unknown> =
    tileSource.kind === "geojson"
      ? {
          offline: {
            type: "geojson",
            data: tileSource.url,
          },
        }
      : tileSource.kind === "raster"
        ? {
            offline: {
              type: "raster",
              tiles: [tileSource.url],
              tileSize: tileSource.tileSize ?? 256,
              attribution: tileSource.attribution,
            },
          }
        : {
            offline: {
              type: "vector",
              url: tileSource.url,
              attribution: tileSource.attribution,
            },
          };

  return {
    version: 8,
    name: "psychogeographic-offline",
    sources,
    layers: [
      tileSource.kind === "geojson"
        ? {
            id: "offline-base",
            type: "circle",
            source: "offline",
            paint: { "circle-radius": 4, "circle-color": "#8a6bbf" },
          }
        : {
            id: "offline-base",
            type: tileSource.kind === "raster" ? "raster" : "background",
            source: "offline",
            paint: {},
          },
    ],
  };
}

/** Converts walk stops into GeoJSON point markers. Unlocated stops carry a
 * feature with `located: false` and no coordinate — the marker layer renders
 * them as unlocated pins instead of inventing a point. */
export function buildPlaceMarkers(stops: WalkStop[]): MapMarkerFeature[] {
  const features: MapMarkerFeature[] = [];
  for (const stop of stops) {
    if (!stop.coordinate) continue;
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [stop.coordinate.longitude, stop.coordinate.latitude],
      },
      properties: {
        id: stop.sceneId,
        title: stop.title,
        validAt: stop.validAt,
        located: true,
      },
    });
  }
  return features;
}

export function buildWalkPathSource(
  walkId: string,
  stops: WalkStop[],
): WalkPathFeature {
  const coordinates: Array<[number, number]> = [];
  for (const stop of stops) {
    if (stop.coordinate) {
      coordinates.push([stop.coordinate.longitude, stop.coordinate.latitude]);
    }
  }
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates },
    properties: { walkId },
  };
}

import type { WalkStop } from "../scenes/walkAssembly";
import {
  buildGraticule,
  greatCircleArc,
  type LonLat,
} from "./geometry";

/**
 * Offline-first map style construction (vision §3.10, refinement-2 D1): the
 * Places surface renders from local sources by default — the bundled GeoJSON
 * basemap (place points), a locally computed graticule, and great-circle walk
 * arcs. Live tile refresh only ever swaps the source URL, and only after the
 * policy gates it. The globe is the default surface; the flat map is the
 * detail view (one action returns to the globe).
 */
export type MapTileSource =
  | { kind: "geojson"; url: string; attribution: string }
  | { kind: "raster"; url: string; attribution: string; tileSize?: number }
  | { kind: "pmtiles"; url: string; attribution: string };

export type MapSurfaceProjection = "globe" | "flat";

export interface MapSurfaceOptions {
  projection?: MapSurfaceProjection;
}

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
    | { type: "LineString"; coordinates: LonLat[] }
    | { type: "LineString"; coordinates: [] };
  properties: { walkId: string };
}

/** Single source of truth for the Places palette. Consumed by both the style
 * builder and the MapLibre renderer so the two never drift. */
export const GLOBE = {
  /** Dark ocean — the background layer colours the sphere surface. */
  ocean: "#0a1322",
  /** Space around the globe. */
  space: "#05070f",
  /** Graticule line colour. */
  graticule: "#182440",
  /** Basemap place points. */
  basePoint: "#2f6f8f",
  /** Walk arc. */
  arc: "#8a6bbf",
  /** Walk stop marker. */
  marker: "#d0a24a",
} as const;

export function createOfflineMapStyle(
  tileSource: MapTileSource,
  options: MapSurfaceOptions = {},
): object {
  const projection = options.projection ?? "globe";
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

  const baseLayer =
    tileSource.kind === "geojson"
      ? {
          id: "offline-base",
          type: "circle",
          source: "offline",
          paint: {
            "circle-radius": 4,
            "circle-color": GLOBE.basePoint,
            "circle-opacity": 0.9,
          },
        }
      : {
          id: "offline-base",
          type: tileSource.kind === "raster" ? "raster" : "background",
          source: "offline",
          paint: {},
        };

  const globeLayers: object[] =
    projection === "globe"
      ? [
          {
            id: "ocean-background",
            type: "background",
            paint: { "background-color": GLOBE.ocean },
          },
          {
            id: "graticule-lines",
            type: "line",
            source: "graticule",
            layout: {
              "line-cap": "round",
            },
            paint: {
              "line-color": GLOBE.graticule,
              "line-width": 0.5,
              "line-opacity": 0.6,
            },
          },
        ]
      : [];

  const style: Record<string, unknown> = {
    version: 8,
    name: "psychogeographic-offline",
    sources,
    layers: [...globeLayers, baseLayer],
  };

  if (projection === "globe") {
    style.projection = { type: "globe" };
  }

  if (projection === "globe") {
    sources.graticule = {
      type: "geojson",
      data: buildGraticule(),
    };
  }

  return style;
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

/**
 * Builds the walk's GeoJSON LineString. Consecutive located stops are joined
 * by great-circle arcs (task-2 step 5), so the route follows the globe's
 * surface; a stop's `controlPoints` subdivide the arc leaving that stop.
 * Unlocated stops are dropped rather than guessed.
 */
export function buildWalkPathSource(
  walkId: string,
  stops: WalkStop[],
): WalkPathFeature {
  const located = stops.filter(
    (stop): stop is WalkStop & { coordinate: { latitude: number; longitude: number } } =>
      stop.coordinate !== null,
  );
  const coordinates: LonLat[] = [];
  if (located.length === 1) {
    // A single located stop is a degenerate LineString — keep the stable
    // pre-globe data shape rather than emitting an empty coordinates array.
    coordinates.push([
      located[0].coordinate.longitude,
      located[0].coordinate.latitude,
    ]);
  }
  for (let i = 0; i < located.length - 1; i += 1) {
    const from = located[i];
    const to = located[i + 1];
    const arc = greatCircleArc(
      from.coordinate,
      to.coordinate,
      64,
      from.controlPoints ?? [],
    );
    if (coordinates.length === 0) {
      coordinates.push(...arc);
    } else {
      // Skip the arc's start point — it was the previous arc's endpoint.
      coordinates.push(...arc.slice(1));
    }
  }
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates },
    properties: { walkId },
  };
}

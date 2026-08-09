import { describe, expect, test } from "vitest";

import type { WalkStop } from "../scenes/walkAssembly";
import {
  buildPlaceMarkers,
  buildWalkPathSource,
  createOfflineMapStyle,
} from "./mapStyle";

type RenderedStyle = {
  sources: Record<string, { type: string; data?: unknown; attribution?: string; url?: string }>;
  layers: Array<Record<string, unknown>>;
  projection?: { type: string };
};

function stop(id: string, coordinate: WalkStop["coordinate"]): WalkStop {
  return {
    sceneId: id,
    placeId: `place:${id}`,
    validAt: "1452-05-29",
    title: id,
    coordinate,
    gazetteerEntry: null,
    located: coordinate !== null,
  };
}

describe("createOfflineMapStyle", () => {
  test("renders a local GeoJSON source with no live hosts by default", () => {
    const style = createOfflineMapStyle({
      kind: "geojson",
      url: "assets/map/places.geojson",
      attribution: "Pleiades CC BY",
    }) as { sources: Record<string, { type: string; data: string }> };
    expect(style.sources.offline).toEqual({
      type: "geojson",
      data: "assets/map/places.geojson",
    });
  });

  test("a local raster tile pack keeps attribution in the source", () => {
    const style = createOfflineMapStyle({
      kind: "raster",
      url: "file:///data/tiles/{z}/{x}/{y}.png",
      attribution: "OpenHistoricalMap ODbL",
    }) as { sources: Record<string, { type: string; attribution: string }> };
    expect(style.sources.offline.attribution).toBe("OpenHistoricalMap ODbL");
  });

  test("a PMTiles vector archive is configured as a local vector source", () => {
    const style = createOfflineMapStyle({
      kind: "pmtiles",
      url: "pmtiles://assets/map/historical.pmtiles",
      attribution: "OSM ODbL",
    }) as { sources: Record<string, { type: string; url: string }> };
    expect(style.sources.offline.type).toBe("vector");
    expect(style.sources.offline.url).toContain("pmtiles://");
  });

  test("the globe is the default projection with a graticule and dark ocean", () => {
    const style = createOfflineMapStyle({
      kind: "geojson",
      url: "assets/map/places.geojson",
      attribution: "Pleiades CC BY",
    }) as RenderedStyle;
    expect(style.projection).toEqual({ type: "globe" });
    // The ocean background layer colours the sphere surface.
    expect(style.layers[0]).toMatchObject({
      id: "ocean-background",
      type: "background",
      paint: { "background-color": "#0a1322" },
    });
    // Graticule is a locally computed GeoJSON source, never fetched.
    expect(style.sources.graticule.type).toBe("geojson");
    expect(style.layers.some((layer) => layer.id === "graticule-lines")).toBe(true);
  });

  test("the flat projection omits the graticule and globe projection key", () => {
    const style = createOfflineMapStyle(
      {
        kind: "geojson",
        url: "assets/map/places.geojson",
        attribution: "Pleiades CC BY",
      },
      { projection: "flat" },
    ) as RenderedStyle;
    expect(style.projection).toBeUndefined();
    expect(style.sources.graticule).toBeUndefined();
    expect(style.layers.some((layer) => layer.id === "graticule-lines")).toBe(false);
  });
});

describe("marker and walk geometry", () => {
  test("markers keep GeoJSON coordinate order and skip unlocated stops", () => {
    const markers = buildPlaceMarkers([
      stop("a", { latitude: 41.0082, longitude: 28.9784 }),
      stop("b", null),
    ]);
    expect(markers).toHaveLength(1);
    expect(markers[0].geometry.coordinates).toEqual([28.9784, 41.0082]);
    expect(markers[0].properties).toMatchObject({ id: "a", located: true });
  });

  test("the walk path follows sequence order through located stops", () => {
    const path = buildWalkPathSource("walk-1", [
      stop("first", { latitude: 41.0, longitude: 28.9 }),
      stop("unlocated", null),
      stop("last", { latitude: 43.77, longitude: 11.25 }),
    ]);
    const coordinates = path.geometry.coordinates as [number, number][];
    // Great-circle arc: starts and ends exactly at the located stops, with
    // interpolated points between (not a two-point straight line).
    expect(coordinates[0]).toEqual([28.9, 41.0]);
    expect(coordinates[coordinates.length - 1]).toEqual([11.25, 43.77]);
    expect(coordinates.length).toBeGreaterThan(2);
    expect(path.properties).toEqual({ walkId: "walk-1" });
  });

  test("explicit control points bend the arc off the great circle", () => {
    // Control points on a stop apply to the segment from that stop to the
    // next located stop.
    const path = buildWalkPathSource("walk-1", [
      {
        ...stop("a", { latitude: 41.0, longitude: 28.9 }),
        controlPoints: [{ latitude: 45.0, longitude: 20.0 }],
      },
      stop("b", { latitude: 43.77, longitude: 11.25 }),
    ]);
    const coordinates = path.geometry.coordinates as [number, number][];
    // The arc passes exactly through the control point.
    expect(coordinates.some(([lng, lat]) => Math.abs(lng - 20.0) < 1e-6 && Math.abs(lat - 45.0) < 1e-6)).toBe(
      true,
    );
  });
});

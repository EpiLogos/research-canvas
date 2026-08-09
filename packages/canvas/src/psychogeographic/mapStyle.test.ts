import { describe, expect, test } from "vitest";

import type { WalkStop } from "../scenes/walkAssembly";
import {
  buildPlaceMarkers,
  buildWalkPathSource,
  createOfflineMapStyle,
} from "./mapStyle";

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
    expect(path.geometry.coordinates).toEqual([
      [28.9, 41.0],
      [11.25, 43.77],
    ]);
  });
});

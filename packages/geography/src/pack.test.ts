import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import type { GazetteerEntry } from "./gazetteer";
import {
  assertOfflineTileSource,
  buildGeographyPack,
  buildPackBasemap,
  parseGeographyPack,
} from "./pack";

const SAMPLE_PATH = join(process.cwd(), "packages/geography/data/gazetteer.sample.ndjson");

function sampleEntries(): GazetteerEntry[] {
  return GazetteerIndexLoad(sampleText());
}

function sampleText(): string {
  return readFileSync(SAMPLE_PATH, "utf8");
}

function GazetteerIndexLoad(text: string): GazetteerEntry[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => JSON.parse(line) as GazetteerEntry);
}

function buildSamplePack() {
  return buildGeographyPack(sampleEntries(), {
    name: "research-canvas-offline",
    generatedAt: "2026-08-09T00:00:00.000Z",
    tileSource: {
      kind: "geojson",
      url: "basemap.geojson",
      attribution: "Pleiades CC BY 4.0 · Wikidata CC0 · GeoNames CC BY 4.0",
    },
  });
}

describe("geography pack", () => {
  test("builds a pack with per-source attribution and record counts", () => {
    const pack = buildSamplePack();
    expect(pack.manifest.offline).toBe(true);
    expect(pack.manifest.formatVersion).toBe(1);
    expect(pack.manifest.recordCount).toBe(12);
    expect(pack.manifest.sources.map((source) => source.id)).toEqual([
      "pleiades",
      "wikidata",
      "geonames",
    ]);
    expect(pack.manifest.sources[0].recordCount).toBe(6);
    expect(pack.manifest.sources[1].recordCount).toBe(5);
    expect(pack.manifest.sources[2].recordCount).toBe(1);
    expect(pack.gazetteer.resolveById("pleiades:520998")?.precision).toBe("exact");
  });

  test("basemap carries only located entries with WGS84 ordering", () => {
    const basemap = buildPackBasemap(sampleEntries());
    expect(basemap.type).toBe("FeatureCollection");
    expect(basemap.features).toHaveLength(11);
    const constantinople = basemap.features.find(
      (feature) => feature.properties.id === "pleiades:520998",
    );
    expect(constantinople?.geometry.coordinates).toEqual([28.9784, 41.0082]);
    expect(basemap.features.some((feature) => feature.properties.precision === "unlocated"))
      .toBe(false);
  });

  test("parseGeographyPack round-trips the built pack with integrity checks", () => {
    const pack = buildSamplePack();
    const parsed = parseGeographyPack(
      sampleText(),
      JSON.stringify(pack.manifest),
      JSON.stringify(pack.basemap),
    );
    expect(parsed.gazetteer.size).toBe(12);
    expect(parsed.manifest.entryIds).toEqual(pack.manifest.entryIds);
    expect(parsed.basemap.features).toHaveLength(11);
  });

  test("parseGeographyPack rejects a live tile host", () => {
    const pack = buildSamplePack();
    const manifest = {
      ...pack.manifest,
      tileSource: {
        kind: "raster",
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: "OSM",
      },
    };
    expect(() =>
      parseGeographyPack(sampleText(), JSON.stringify(manifest)),
    ).toThrow(/never absolute or live/);
  });

  test("parseGeographyPack rejects an absolute tile path", () => {
    const pack = buildSamplePack();
    const manifest = {
      ...pack.manifest,
      tileSource: {
        kind: "raster",
        url: "/Users/admin/tiles/{z}/{x}/{y}.png",
        attribution: "test",
      },
    };
    expect(() =>
      parseGeographyPack(sampleText(), JSON.stringify(manifest)),
    ).toThrow(/bundle-relative/);
  });

  test("parseGeographyPack rejects entryIds drift", () => {
    const pack = buildSamplePack();
    const manifest = {
      ...pack.manifest,
      entryIds: [...pack.manifest.entryIds.slice(0, 5)],
    };
    expect(() =>
      parseGeographyPack(sampleText(), JSON.stringify(manifest)),
    ).toThrow(/entry ids do not match/);
  });

  test("parseGeographyPack rejects a missing source attribution", () => {
    const pack = buildSamplePack();
    const manifest = {
      ...pack.manifest,
      sources: pack.manifest.sources.filter((source) => source.id !== "geonames"),
    };
    expect(() =>
      parseGeographyPack(sampleText(), JSON.stringify(manifest)),
    ).toThrow(/no source attribution/);
  });

  test("assertOfflineTileSource rejects absolute local paths that escape the bundle", () => {
    expect(() =>
      assertOfflineTileSource({
        kind: "raster",
        url: "/etc/tiles/{z}/{x}/{y}.png",
        attribution: "test",
      }),
    ).toThrow(/bundle-relative/);
  });
});

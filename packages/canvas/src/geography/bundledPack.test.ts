import { describe, expect, test } from "vitest";

import { loadBundledGeographyPack } from "./bundledPack";

describe("bundled geography pack", () => {
  test("loads the shipped offline pack with real records and local tiles", () => {
    const pack = loadBundledGeographyPack();

    expect(pack.manifest.offline).toBe(true);
    // The pack carries the movement-stream lane places (Banda, Kimberley,
    // Vienna, …), so the record count is larger than the original subset.
    expect(pack.manifest.recordCount).toBe(16);
    expect(pack.manifest.entryIds).toEqual([...pack.gazetteer.entryIds()].sort());
    expect(pack.manifest.tileSource.kind).toBe("geojson");
    expect(pack.manifest.tileSource.url).toBe("basemap.geojson");
    expect(pack.manifest.tileSource.url.startsWith("http")).toBe(false);
    expect(pack.gazetteer.resolveById("pleiades:520998")?.precision).toBe("exact");
    expect(pack.gazetteer.resolveById("pleiades:520998")?.names.map((n) => n.name)).toContain(
      "Constantinople",
    );
    expect(pack.basemap.features).toHaveLength(15);
    expect(pack.gazetteer.resolveById("wikidata:Q727")?.latitude).toBe(52.3728);
  });
});

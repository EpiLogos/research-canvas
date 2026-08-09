import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { GazetteerIndex, validateEntry } from "./gazetteer";

const index = GazetteerIndex.loadNdjson(
  readFileSync(
    join(process.cwd(), "packages/geography/data/gazetteer.sample.ndjson"),
    "utf8",
  ),
);

describe("GazetteerIndex", () => {
  test("loads the bundled offline subset and resolves by id", () => {
    expect(index.size).toBe(12);
    const constantinople = index.resolveById("pleiades:520998");
    expect(constantinople?.names.map((name) => name.name)).toContain(
      "Constantinople",
    );
    expect(index.resolveById("missing")).toBeUndefined();
  });

  test("resolves the corpus journey cities added to the subset", () => {
    expect(index.resolveById("wikidata:Q727")?.names[0].name).toBe("Amsterdam");
    expect(index.resolveById("wikidata:Q90")?.names[0].name).toBe("Paris");
    expect(index.resolveById("wikidata:Q1085")?.names[0].name).toBe("Praha");
  });

  test("searches by name with language preference", () => {
    const english = index.searchByName("Constantinople", {
      language: "en",
      limit: 1,
    });
    expect(english[0].id).toBe("pleiades:520998");

    const turkish = index.searchByName("İstanbul", { language: "tr", limit: 1 });
    expect(turkish[0].id).toBe("wikidata:Q913");
  });

  test("normalizes diacritics so İstanbul matches Istanbul", () => {
    const hits = index.searchByName("istanbul", { limit: 5 });
    expect(hits.map((entry) => entry.id)).toContain("wikidata:Q913");
  });

  test("never fabricates a point for region or unlocated entries", () => {
    const unlocated = index.resolveById("pleiades:540705");
    expect(unlocated?.precision).toBe("unlocated");
    expect(unlocated?.latitude).toBeUndefined();
    expect(unlocated?.longitude).toBeUndefined();
  });

  test("rejects entries whose point contradicts their precision", () => {
    expect(() =>
      validateEntry({
        id: "test:bad",
        source: "wikidata",
        names: [{ language: "en", name: "Bad" }],
        precision: "exact",
      }),
    ).toThrow();
    expect(() =>
      validateEntry({
        id: "test:bad2",
        source: "wikidata",
        names: [{ language: "en", name: "Bad" }],
        precision: "unlocated",
        latitude: 1,
        longitude: 2,
      }),
    ).toThrow();
  });
});

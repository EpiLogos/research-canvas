#!/usr/bin/env node
/**
 * Production geography pack builder (vision §3.10, research findings §1/§2).
 *
 * Ingests the bundled raw gazetteer subset (Pleiades/Wikidata/GeoNames
 * records as NDJSON), validates every record against the same invariants the
 * runtime index enforces, and emits the offline pack the psychogeographic
 * surface ships with:
 *
 *   packages/geography/data/pack/gazetteer.ndjson — validated index records
 *   packages/geography/data/pack/pack.json        — attribution + tile manifest
 *   packages/geography/data/pack/basemap.geojson  — local-only basemap
 *
 * To scale the pack, drop full dumps into packages/geography/data/sources/
 * (Pleiades places JSON, Wikidata QID dumps, GeoNames allCountries.txt) as
 * NDJSON records with the GazetteerEntry shape and re-run this script; the
 * manifest regenerates attribution and record counts from what is actually
 * bundled. The pipeline is offline by construction: it never fetches data,
 * and it refuses live tile hosts.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_PATH = join(ROOT, "data", "gazetteer.sample.ndjson");
const PACK_DIR = join(ROOT, "data", "pack");

const TILE_SOURCE = {
  kind: "geojson",
  url: "basemap.geojson",
  attribution: "Pleiades CC BY 4.0 · Wikidata CC0 · GeoNames CC BY 4.0",
};

const SOURCES = ["pleiades", "wikidata", "geonames"];
const ATTRIBUTIONS = {
  pleiades: { name: "Pleiades", license: "CC BY 4.0", url: "https://pleiades.stoa.org/" },
  wikidata: { name: "Wikidata", license: "CC0", url: "https://www.wikidata.org/" },
  geonames: { name: "GeoNames", license: "CC BY 4.0", url: "https://www.geonames.org/" },
};

function loadEntries() {
  const lines = readFileSync(SOURCE_PATH, "utf8").split("\n");
  const entries = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const entry = JSON.parse(trimmed);
    validateEntry(entry);
    entries.push(entry);
  }
  return entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function validateEntry(entry) {
  if (!entry.id || !Array.isArray(entry.names) || entry.names.length === 0) {
    throw new Error(`entry requires id and at least one name: ${entry.id}`);
  }
  if (!SOURCES.includes(entry.source)) {
    throw new Error(`entry ${entry.id} has unknown source ${entry.source}`);
  }
  const hasPoint = entry.latitude !== undefined || entry.longitude !== undefined;
  if (entry.precision === "exact" || entry.precision === "approximate") {
    if (
      typeof entry.latitude !== "number" ||
      typeof entry.longitude !== "number" ||
      entry.latitude < -90 ||
      entry.latitude > 90 ||
      entry.longitude < -180 ||
      entry.longitude > 180
    ) {
      throw new Error(`entry ${entry.id} requires a valid WGS84 point`);
    }
  } else if (hasPoint) {
    throw new Error(`entry ${entry.id} must not carry a point at precision ${entry.precision}`);
  }
}

function buildBasemap(entries) {
  const features = [];
  for (const entry of entries) {
    if (entry.latitude === undefined || entry.longitude === undefined) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [entry.longitude, entry.latitude] },
      properties: {
        id: entry.id,
        title: entry.names[0].name,
        source: entry.source,
        precision: entry.precision,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

function buildManifest(entries, generatedAt) {
  const counts = new Map();
  for (const entry of entries) {
    counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1);
  }
  return {
    formatVersion: 1,
    generatedAt,
    name: "research-canvas-offline",
    offline: true,
    tileSource: TILE_SOURCE,
    sources: SOURCES.filter((source) => counts.has(source)).map((source) => ({
      id: source,
      name: ATTRIBUTIONS[source].name,
      license: ATTRIBUTIONS[source].license,
      url: ATTRIBUTIONS[source].url,
      recordCount: counts.get(source),
    })),
    recordCount: entries.length,
    entryIds: entries.map((entry) => entry.id),
  };
}

const entries = loadEntries();
const manifest = buildManifest(entries, new Date().toISOString());
const basemap = buildBasemap(entries);

mkdirSync(PACK_DIR, { recursive: true });
writeFileSync(
  join(PACK_DIR, "gazetteer.ndjson"),
  entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
  "utf8",
);
writeFileSync(join(PACK_DIR, "pack.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
writeFileSync(join(PACK_DIR, "basemap.geojson"), JSON.stringify(basemap, null, 2) + "\n", "utf8");

console.log(
  `geography pack written: ${manifest.recordCount} records, ${manifest.sources.length} sources, ${basemap.features.length} basemap features`,
);

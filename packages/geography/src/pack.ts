import {
  GAZETTEER_SOURCES,
  GazetteerIndex,
  validateEntry,
  type GazetteerEntry,
} from "./gazetteer";

/**
 * Production geography pack (vision §3.10, research findings §1/§2): the
 * offline bundle the psychogeographic surface ships with — a validated
 * gazetteer index, a local-only tile source, and the attribution manifest.
 * The pack builder is a build-time pipeline (scripts/build-pack.mjs); the
 * parser here enforces the same invariants at load time so a stale or
 * hand-edited pack can never silently violate the data posture.
 */

export const PACK_FORMAT_VERSION = 1 as const;

export type PackTileSource =
  | { kind: "geojson"; url: string; attribution: string }
  | { kind: "raster"; url: string; attribution: string; tileSize?: number }
  | { kind: "pmtiles"; url: string; attribution: string };

export interface PackSourceAttribution {
  id: GazetteerEntry["source"];
  name: string;
  license: string;
  url: string;
  recordCount: number;
}

export interface GeographyPackManifest {
  formatVersion: typeof PACK_FORMAT_VERSION;
  generatedAt: string;
  name: string;
  /** The data posture is structural: the pack is offline or it is invalid. */
  offline: true;
  tileSource: PackTileSource;
  sources: PackSourceAttribution[];
  recordCount: number;
  /** Sorted entry ids — an integrity snapshot for detecting drift. */
  entryIds: string[];
}

export interface PackBasemapFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    id: string;
    title: string;
    source: GazetteerEntry["source"];
    precision: GazetteerEntry["precision"];
  };
}

export interface PackBasemap {
  type: "FeatureCollection";
  features: PackBasemapFeature[];
}

export interface GeographyPack {
  gazetteer: GazetteerIndex;
  manifest: GeographyPackManifest;
  basemap: PackBasemap;
}

export interface BuildGeographyPackOptions {
  name: string;
  generatedAt: string;
  tileSource: PackTileSource;
}

const ATTRIBUTIONS: Record<GazetteerEntry["source"], PackSourceAttribution["name"]> = {
  pleiades: "Pleiades",
  wikidata: "Wikidata",
  geonames: "GeoNames",
};

const ATTRIBUTION_URLS: Record<GazetteerEntry["source"], string> = {
  pleiades: "https://pleiades.stoa.org/",
  wikidata: "https://www.wikidata.org/",
  geonames: "https://www.geonames.org/",
};

const ATTRIBUTION_LICENSES: Record<GazetteerEntry["source"], string> = {
  pleiades: "CC BY 4.0",
  wikidata: "CC0",
  geonames: "CC BY 4.0",
};

export function buildGeographyPack(
  entries: GazetteerEntry[],
  options: BuildGeographyPackOptions,
): GeographyPack {
  const gazetteer = GazetteerIndex.fromEntries(entries);
  const bySource = new Map<GazetteerEntry["source"], GazetteerEntry[]>();
  for (const entry of entries) {
    const bucket = bySource.get(entry.source) ?? [];
    bucket.push(entry);
    bySource.set(entry.source, bucket);
  }
  const sources: PackSourceAttribution[] = GAZETTEER_SOURCES.filter((source) =>
    bySource.has(source),
  ).map((source) => ({
    id: source,
    name: ATTRIBUTIONS[source],
    license: ATTRIBUTION_LICENSES[source],
    url: ATTRIBUTION_URLS[source],
    recordCount: bySource.get(source)?.length ?? 0,
  }));
  const manifest: GeographyPackManifest = {
    formatVersion: PACK_FORMAT_VERSION,
    generatedAt: options.generatedAt,
    name: options.name,
    offline: true,
    tileSource: options.tileSource,
    sources,
    recordCount: gazetteer.size,
    entryIds: [...gazetteer.entryIds()].sort(),
  };
  return {
    gazetteer,
    manifest,
    basemap: buildPackBasemap(entries),
  };
}

export function buildPackBasemap(entries: GazetteerEntry[]): PackBasemap {
  const features: PackBasemapFeature[] = [];
  for (const entry of entries) {
    if (entry.latitude === undefined || entry.longitude === undefined) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [entry.longitude, entry.latitude] },
      properties: {
        id: entry.id,
        title: entry.names[0]?.name ?? entry.id,
        source: entry.source,
        precision: entry.precision,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

/**
 * Parses a shipped pack and re-validates every invariant: well-formed JSON,
 * version, offline-only posture (no live tile hosts), per-source attribution,
 * and record-count/integrity agreement with the manifest.
 */
export function parseGeographyPack(
  gazetteerNdjson: string,
  manifestJson: string,
  basemapJson?: string,
): GeographyPack {
  const gazetteer = GazetteerIndex.loadNdjson(gazetteerNdjson);
  const manifest = parseManifest(manifestJson);

  if (manifest.offline !== true) {
    throw new Error("geography pack manifest must declare offline: true");
  }
  assertOfflineTileSource(manifest.tileSource);
  if (manifest.recordCount !== gazetteer.size) {
    throw new Error(
      `geography pack recordCount mismatch: manifest ${manifest.recordCount}, index ${gazetteer.size}`,
    );
  }
  const entryIds = [...gazetteer.entryIds()].sort();
  if (JSON.stringify(entryIds) !== JSON.stringify(manifest.entryIds)) {
    throw new Error("geography pack entry ids do not match the manifest snapshot");
  }
  const sourceIds = new Set(manifest.sources.map((source) => source.id));
  for (const entryId of entryIds) {
    const entry = gazetteer.resolveById(entryId);
    if (entry && !sourceIds.has(entry.source)) {
      throw new Error(
        `geography pack entry ${entryId} has no source attribution in the manifest`,
      );
    }
  }
  for (const source of manifest.sources) {
    if (!source.name || !source.license || !source.url) {
      throw new Error(`geography pack source attribution is incomplete: ${source.id}`);
    }
  }

  const basemap = basemapJson
    ? parseBasemap(basemapJson)
    : buildPackBasemap(entriesOf(gazetteer, manifest));

  return { gazetteer, manifest, basemap };
}

function entriesOf(
  gazetteer: GazetteerIndex,
  manifest: GeographyPackManifest,
): GazetteerEntry[] {
  return manifest.entryIds.flatMap((id) => {
    const entry = gazetteer.resolveById(id);
    return entry ? [entry] : [];
  });
}

export function parseManifest(manifestJson: string): GeographyPackManifest {
  const parsed: unknown = JSON.parse(manifestJson);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error("geography pack manifest must be a JSON object");
  }
  const manifest = parsed as GeographyPackManifest;
  if (manifest.formatVersion !== PACK_FORMAT_VERSION) {
    throw new Error(
      `unsupported geography pack format version ${String(manifest.formatVersion)}`,
    );
  }
  if (!Array.isArray(manifest.entryIds)) {
    throw new Error("geography pack manifest entryIds must be an array");
  }
  if (!Array.isArray(manifest.sources)) {
    throw new Error("geography pack manifest sources must be an array");
  }
  if (typeof manifest.tileSource !== "object" || manifest.tileSource === null) {
    throw new Error("geography pack manifest tileSource is required");
  }
  return manifest;
}

export function assertOfflineTileSource(tileSource: PackTileSource): void {
  if (
    typeof tileSource.url !== "string" ||
    tileSource.url.trim() === "" ||
    tileSource.url.startsWith("/") ||
    tileSource.url.includes("..") ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(tileSource.url)
  ) {
    throw new Error(
      "geography pack tile source must be a bundle-relative path, never absolute or live",
    );
  }
  if (typeof tileSource.attribution !== "string" || tileSource.attribution.trim() === "") {
    throw new Error("geography pack tile source attribution is required");
  }
}

export function parseBasemap(basemapJson: string): PackBasemap {
  const parsed: unknown = JSON.parse(basemapJson);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as PackBasemap).type !== "FeatureCollection" ||
    !Array.isArray((parsed as PackBasemap).features)
  ) {
    throw new Error("geography pack basemap must be a GeoJSON FeatureCollection");
  }
  const basemap = parsed as PackBasemap;
  for (const feature of basemap.features) {
    if (feature.geometry.type !== "Point") {
      throw new Error("geography pack basemap only supports Point features");
    }
    const [longitude, latitude] = feature.geometry.coordinates;
    if (
      typeof longitude !== "number" ||
      typeof latitude !== "number" ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error("geography pack basemap feature has an invalid WGS84 point");
    }
  }
  return basemap;
}

/** Keeps the entry validator reachable from the pack pipeline. */
export function validatePackEntry(entry: GazetteerEntry): void {
  validateEntry(entry);
}

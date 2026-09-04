/**
 * Offline-first gazetteer tier (vision §3.10, research findings §1, ticket #5).
 * The bundled index is a set of GazetteerEntry records; lookups never exceed
 * the precision the source provides — a `region` or `unlocated` entry has no
 * point, and the resolver never fabricates one.
 */
export const GAZETTEER_SOURCES = ["pleiades", "wikidata", "geonames"] as const;
export type GazetteerSource = (typeof GAZETTEER_SOURCES)[number];

export const COORDINATE_PRECISIONS = [
  "exact",
  "approximate",
  "region",
  "unlocated",
] as const;
export type CoordinatePrecision = (typeof COORDINATE_PRECISIONS)[number];

export interface GazetteerName {
  language: string;
  name: string;
  validFrom?: string;
  validTo?: string;
}

export interface GazetteerEntry {
  /** Stable id: `<source>:<externalId>` (e.g. `pleiades:520998`). */
  id: string;
  source: GazetteerSource;
  names: GazetteerName[];
  /** WGS84 point; present only when precision is exact or approximate. */
  latitude?: number;
  longitude?: number;
  precision: CoordinatePrecision;
  validFrom?: string;
  validTo?: string;
  /** Direct parent place ids for the hierarchy chain. */
  parentIds?: string[];
}

export interface GazetteerSearchOptions {
  language?: string;
  limit?: number;
}

export class GazetteerIndex {
  private readonly byId = new Map<string, GazetteerEntry>();
  private readonly byName = new Map<string, GazetteerEntry[]>();

  private constructor(entries: GazetteerEntry[]) {
    for (const entry of entries) {
      validateEntry(entry);
      this.byId.set(entry.id, entry);
      for (const name of entry.names) {
        const key = nameKey(name.language, name.name);
        const bucket = this.byName.get(key) ?? [];
        bucket.push(entry);
        this.byName.set(key, bucket);
      }
    }
  }

  static fromEntries(entries: GazetteerEntry[]): GazetteerIndex {
    return new GazetteerIndex(entries);
  }

  /** Parses a newline-delimited JSON index (blank lines and `#` comments
   * allowed), so a bundled subset can ship as a plain text asset. */
  static loadNdjson(text: string): GazetteerIndex {
    const entries: GazetteerEntry[] = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;
      entries.push(JSON.parse(trimmed) as GazetteerEntry);
    }
    return GazetteerIndex.fromEntries(entries);
  }

  get size(): number {
    return this.byId.size;
  }

  /** Stable iteration over every entry id in the index. */
  entryIds(): IterableIterator<string> {
    return this.byId.keys();
  }

  resolveById(id: string): GazetteerEntry | undefined {
    return this.byId.get(id);
  }

  /** Case-insensitive lookup, preferring an exact name match for the given
   * language, then any language, then normalized substring matches. */
  searchByName(
    name: string,
    options: GazetteerSearchOptions = {},
  ): GazetteerEntry[] {
    const needle = normalizeName(name);
    const limit = options.limit ?? 10;
    if (needle === "") return [];

    const exact: GazetteerEntry[] = [];
    const substring: GazetteerEntry[] = [];
    const seen = new Set<string>();
    for (const entry of this.byId.values()) {
      for (const entryName of entry.names) {
        if (options.language && entryName.language !== options.language) {
          continue;
        }
        const candidate = normalizeName(entryName.name);
        if (candidate === needle) {
          if (!seen.has(entry.id)) {
            exact.push(entry);
            seen.add(entry.id);
          }
          break;
        }
        if (candidate.includes(needle)) {
          if (!seen.has(entry.id)) {
            substring.push(entry);
            seen.add(entry.id);
          }
          break;
        }
      }
      if (exact.length >= limit) break;
    }
    return [...exact, ...substring].slice(0, limit);
  }
}

function nameKey(language: string, name: string): string {
  return `${language.toLowerCase()}:${normalizeName(name)}`;
}

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function validateEntry(entry: GazetteerEntry): void {
  if (!entry.id || !entry.names.length) {
    throw new Error(`gazetteer entry requires an id and at least one name: ${entry.id}`);
  }
  const hasPoint = entry.latitude !== undefined || entry.longitude !== undefined;
  if (entry.precision === "exact" || entry.precision === "approximate") {
    if (
      entry.latitude === undefined ||
      entry.longitude === undefined ||
      entry.latitude < -90 ||
      entry.latitude > 90 ||
      entry.longitude < -180 ||
      entry.longitude > 180
    ) {
      throw new Error(
        `gazetteer entry ${entry.id} with precision ${entry.precision} requires a valid WGS84 point`,
      );
    }
  } else if (hasPoint) {
    throw new Error(
      `gazetteer entry ${entry.id} with precision ${entry.precision} must not carry a point`,
    );
  }
}

import { parseGeographyPack, type GeographyPack } from "@research-canvas/geography";

import gazetteerRaw from "../../../geography/data/pack/gazetteer.ndjson?raw";
import packJsonRaw from "../../../geography/data/pack/pack.json?raw";
import basemapRaw from "../../../geography/data/pack/basemap.geojson?raw";

/**
 * The shipped offline geography pack (vision §3.10): validated at load time
 * by the same parser the pack builder uses, so a stale or hand-edited pack
 * can never silently violate the offline-first data posture.
 */
let cached: GeographyPack | null = null;

export function loadBundledGeographyPack(): GeographyPack {
  if (!cached) {
    cached = parseGeographyPack(gazetteerRaw, packJsonRaw, basemapRaw);
  }
  return cached;
}

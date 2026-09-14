import type { KeepsakeManifest } from "@research-canvas/exporter";

/**
 * Loads the keepsake bundle for the published story surface (vision §3.16):
 * a self-contained offline static bundle — navigable journey, own-language,
 * media playback, consent-filtered at export time.
 */

export async function loadKeepsake(): Promise<KeepsakeManifest | null> {
  let response: Response;
  try {
    response = await fetch("keepsake.json");
  } catch {
    return null;
  }
  if (!response.ok) {
    return null;
  }
  const parsed: unknown = await response.json();
  return validateKeepsake(parsed);
}

export function validateKeepsake(value: unknown): KeepsakeManifest | null {
  if (typeof value !== "object" || value === null) return null;
  const manifest = value as KeepsakeManifest;
  if (
    manifest.formatVersion !== 1 ||
    typeof manifest.title !== "string" ||
    typeof manifest.profileScope !== "string" ||
    manifest.defaultLanguage !== "original" ||
    !Array.isArray(manifest.scenes) ||
    !Array.isArray(manifest.media) ||
    !Array.isArray(manifest.walk)
  ) {
    return null;
  }
  return manifest;
}

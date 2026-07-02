export type ScaleTier = "millennium" | "century" | "era" | "event" | "moment";

export interface ScaleTierSpec {
  tier: ScaleTier;
  /** Minimum pixels-per-year at which this tier becomes the active tier. */
  minPixelsPerYear: number;
  /** Spacing (in years) between major axis ticks at this tier. */
  tickYears: number;
}

export const MIN_PIXELS_PER_YEAR = 0.02;
export const MAX_PIXELS_PER_YEAR = 4000;

export const SCALE_TIERS: readonly ScaleTierSpec[] = [
  { tier: "millennium", minPixelsPerYear: 0.02, tickYears: 1000 },
  { tier: "century", minPixelsPerYear: 0.4, tickYears: 100 },
  { tier: "era", minPixelsPerYear: 8, tickYears: 10 },
  { tier: "event", minPixelsPerYear: 120, tickYears: 1 },
  { tier: "moment", minPixelsPerYear: 1500, tickYears: 1 },
] as const;

/** Pick the finest tier whose minPixelsPerYear threshold is met. */
export function tierForPixelsPerYear(pixelsPerYear: number): ScaleTier {
  let chosen: ScaleTier = SCALE_TIERS[0].tier;
  for (const spec of SCALE_TIERS) {
    if (pixelsPerYear >= spec.minPixelsPerYear) {
      chosen = spec.tier;
    }
  }
  return chosen;
}

export function tickIntervalYears(tier: ScaleTier): number {
  const spec = SCALE_TIERS.find((s) => s.tier === tier);
  return spec ? spec.tickYears : 1;
}

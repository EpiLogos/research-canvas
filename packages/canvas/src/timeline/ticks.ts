import { tickIntervalYears, type ScaleTier } from "./scale";
import { pixelToYear, yearToPixel, type TimelineViewport } from "./viewport";

export interface AxisTick {
  year: number;
  px: number;
  label: string;
}

export function formatYearLabel(year: number, _tier: ScaleTier): string {
  const rounded = Math.round(year);
  if (rounded < 0) return `${Math.abs(rounded)} BCE`;
  return `${rounded} CE`;
}

/**
 * Emit one tick per `tickIntervalYears(tier)` boundary across the visible
 * range, padded by one interval on each side so partial ticks render at the
 * edges. Ascending by year/px.
 */
export function generateTicks(
  viewport: TimelineViewport,
  tier: ScaleTier,
): AxisTick[] {
  const interval = tickIntervalYears(tier);
  const leftYear = pixelToYear(viewport, 0);
  const rightYear = pixelToYear(viewport, viewport.widthPx);

  const firstTick = Math.floor(leftYear / interval) * interval - interval;
  const lastTick = Math.ceil(rightYear / interval) * interval + interval;

  const ticks: AxisTick[] = [];
  for (let year = firstTick; year <= lastTick; year += interval) {
    ticks.push({
      year,
      px: yearToPixel(viewport, year),
      label: formatYearLabel(year, tier),
    });
  }
  return ticks;
}

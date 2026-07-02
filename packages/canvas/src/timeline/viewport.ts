import { MAX_PIXELS_PER_YEAR, MIN_PIXELS_PER_YEAR } from "./scale";

export interface TimelineViewport {
  /** Fractional year shown at the horizontal centre of the track. */
  centerYear: number;
  /** Horizontal scale. Larger = zoomed in. */
  pixelsPerYear: number;
  /** Pixel width of the track viewport. */
  widthPx: number;
}

export function clampPixelsPerYear(value: number): number {
  if (value < MIN_PIXELS_PER_YEAR) return MIN_PIXELS_PER_YEAR;
  if (value > MAX_PIXELS_PER_YEAR) return MAX_PIXELS_PER_YEAR;
  return value;
}

export function yearToPixel(viewport: TimelineViewport, year: number): number {
  return viewport.widthPx / 2 + (year - viewport.centerYear) * viewport.pixelsPerYear;
}

export function pixelToYear(viewport: TimelineViewport, px: number): number {
  return viewport.centerYear + (px - viewport.widthPx / 2) / viewport.pixelsPerYear;
}

/**
 * Drag the content by deltaPx. Positive delta = content moves right under the
 * cursor (the classic grab-and-drag), so the visible centre shifts to an
 * EARLIER year.
 */
export function panByPixels(
  viewport: TimelineViewport,
  deltaPx: number,
): TimelineViewport {
  return {
    ...viewport,
    centerYear: viewport.centerYear - deltaPx / viewport.pixelsPerYear,
  };
}

/**
 * Multiply zoom by `factor` while keeping the year currently under `anchorPx`
 * pinned to that same pixel.
 */
export function zoomAt(
  viewport: TimelineViewport,
  factor: number,
  anchorPx: number,
): TimelineViewport {
  const anchorYear = pixelToYear(viewport, anchorPx);
  const nextPixelsPerYear = clampPixelsPerYear(viewport.pixelsPerYear * factor);
  // Solve centerYear so yearToPixel(next, anchorYear) === anchorPx.
  const nextCenterYear =
    anchorYear - (anchorPx - viewport.widthPx / 2) / nextPixelsPerYear;
  return {
    ...viewport,
    pixelsPerYear: nextPixelsPerYear,
    centerYear: nextCenterYear,
  };
}

import { describe, expect, test } from "vitest";
import {
  clampPixelsPerYear,
  panByPixels,
  pixelToYear,
  yearToPixel,
  zoomAt,
  type TimelineViewport,
} from "./viewport";
import { MAX_PIXELS_PER_YEAR, MIN_PIXELS_PER_YEAR } from "./scale";

const base: TimelineViewport = {
  centerYear: 1600,
  pixelsPerYear: 2,
  widthPx: 1000,
};

describe("timeline viewport math", () => {
  test("centerYear maps to the horizontal centre", () => {
    expect(yearToPixel(base, 1600)).toBeCloseTo(500, 5);
  });

  test("a year one unit later sits pixelsPerYear to the right of centre", () => {
    expect(yearToPixel(base, 1601)).toBeCloseTo(502, 5);
  });

  test("yearToPixel and pixelToYear are inverses", () => {
    const px = yearToPixel(base, 1583.25);
    expect(pixelToYear(base, px)).toBeCloseTo(1583.25, 5);
  });

  test("pan right by N pixels moves the centre earlier in time", () => {
    const panned = panByPixels(base, 200); // drag content right => see earlier
    expect(panned.centerYear).toBeCloseTo(1600 - 200 / 2, 5);
    expect(panned.pixelsPerYear).toBe(2);
    expect(panned.widthPx).toBe(1000);
  });

  test("clamp keeps pixelsPerYear inside the allowed band", () => {
    expect(clampPixelsPerYear(MIN_PIXELS_PER_YEAR / 10)).toBe(MIN_PIXELS_PER_YEAR);
    expect(clampPixelsPerYear(MAX_PIXELS_PER_YEAR * 10)).toBe(MAX_PIXELS_PER_YEAR);
    expect(clampPixelsPerYear(2)).toBe(2);
  });

  test("zoomAt keeps the year under the anchor pixel fixed", () => {
    const anchorPx = 750;
    const yearUnderAnchorBefore = pixelToYear(base, anchorPx);
    const zoomed = zoomAt(base, 2, anchorPx); // zoom in 2x
    expect(zoomed.pixelsPerYear).toBeCloseTo(4, 5);
    expect(yearToPixel(zoomed, yearUnderAnchorBefore)).toBeCloseTo(anchorPx, 4);
  });

  test("zoomAt respects clamp at the ceiling", () => {
    const zoomed = zoomAt(
      { ...base, pixelsPerYear: MAX_PIXELS_PER_YEAR },
      4,
      500,
    );
    expect(zoomed.pixelsPerYear).toBe(MAX_PIXELS_PER_YEAR);
  });
});

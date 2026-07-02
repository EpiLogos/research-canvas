import { describe, expect, test } from "vitest";
import { formatYearLabel, generateTicks } from "./ticks";
import type { TimelineViewport } from "./viewport";

describe("formatYearLabel", () => {
  test("CE years carry a CE suffix", () => {
    expect(formatYearLabel(1000, "millennium")).toBe("1000 CE");
  });
  test("negative years are BCE with positive magnitude", () => {
    expect(formatYearLabel(-43, "century")).toBe("43 BCE");
  });
  test("event tier labels the integer year", () => {
    expect(formatYearLabel(1621, "event")).toBe("1621 CE");
  });
});

describe("generateTicks", () => {
  test("century tier emits ticks at 100-year boundaries across the view", () => {
    const viewport: TimelineViewport = {
      centerYear: 1650,
      pixelsPerYear: 1,
      widthPx: 600, // visible ~1350..1950
    };
    const ticks = generateTicks(viewport, "century");
    const years = ticks.map((t) => t.year);
    expect(years).toContain(1400);
    expect(years).toContain(1700);
    expect(years).toContain(1900);
    // all multiples of 100
    expect(years.every((y) => y % 100 === 0)).toBe(true);
  });

  test("tick px positions are monotonically increasing with year", () => {
    const viewport: TimelineViewport = {
      centerYear: 1650,
      pixelsPerYear: 1,
      widthPx: 600,
    };
    const ticks = generateTicks(viewport, "century");
    for (let i = 1; i < ticks.length; i += 1) {
      expect(ticks[i].px).toBeGreaterThan(ticks[i - 1].px);
      expect(ticks[i].year).toBeGreaterThan(ticks[i - 1].year);
    }
  });

  test("the first visible tick is at or before the left edge year", () => {
    const viewport: TimelineViewport = {
      centerYear: 1650,
      pixelsPerYear: 1,
      widthPx: 600,
    };
    const ticks = generateTicks(viewport, "century");
    expect(ticks[0].year).toBeLessThanOrEqual(1350);
  });
});

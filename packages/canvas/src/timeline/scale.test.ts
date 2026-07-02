import { describe, expect, test } from "vitest";
import {
  MAX_PIXELS_PER_YEAR,
  MIN_PIXELS_PER_YEAR,
  SCALE_TIERS,
  tickIntervalYears,
  tierForPixelsPerYear,
} from "./scale";

describe("scale tiers", () => {
  test("five tiers, coarse to fine", () => {
    expect(SCALE_TIERS.map((t) => t.tier)).toEqual([
      "millennium",
      "century",
      "era",
      "event",
      "moment",
    ]);
  });

  test("tiers are sorted by ascending minPixelsPerYear", () => {
    for (let i = 1; i < SCALE_TIERS.length; i += 1) {
      expect(SCALE_TIERS[i].minPixelsPerYear).toBeGreaterThan(
        SCALE_TIERS[i - 1].minPixelsPerYear,
      );
    }
  });

  test("extreme zoom-out is the millennium tier", () => {
    expect(tierForPixelsPerYear(MIN_PIXELS_PER_YEAR)).toBe("millennium");
    expect(tierForPixelsPerYear(0.05)).toBe("millennium");
  });

  test("extreme zoom-in is the moment tier", () => {
    expect(tierForPixelsPerYear(MAX_PIXELS_PER_YEAR)).toBe("moment");
    expect(tierForPixelsPerYear(3000)).toBe("moment");
  });

  test("mid zoom lands on a middle tier", () => {
    expect(tierForPixelsPerYear(2)).toBe("century");
    expect(tierForPixelsPerYear(40)).toBe("era");
  });

  test("tick interval shrinks as the tier sharpens", () => {
    expect(tickIntervalYears("millennium")).toBe(1000);
    expect(tickIntervalYears("century")).toBe(100);
    expect(tickIntervalYears("era")).toBe(10);
    expect(tickIntervalYears("event")).toBe(1);
    expect(tickIntervalYears("moment")).toBe(1);
  });
});

import { describe, expect, test } from "vitest";
import { parseTemporalInstant } from "./instant";

describe("parseTemporalInstant", () => {
  test("returns null for null, empty, and garbage", () => {
    expect(parseTemporalInstant(null)).toBeNull();
    expect(parseTemporalInstant("")).toBeNull();
    expect(parseTemporalInstant("not-a-date")).toBeNull();
  });

  test("parses a plain year start to the integer year", () => {
    expect(parseTemporalInstant("1621-01-01")).toBeCloseTo(1621, 5);
  });

  test("mid-year date is a fractional year above the integer", () => {
    const y = parseTemporalInstant("1621-07-02")!;
    expect(y).toBeGreaterThan(1621.49);
    expect(y).toBeLessThan(1621.51);
  });

  test("parses a bare year string", () => {
    expect(parseTemporalInstant("1917")).toBeCloseTo(1917, 5);
  });

  test("parses an ISO datetime", () => {
    expect(parseTemporalInstant("1953-01-01T00:00:00Z")).toBeCloseTo(1953, 3);
  });

  test("parses BCE astronomical years as negative", () => {
    expect(parseTemporalInstant("-0043-01-01")).toBeCloseTo(-43, 3);
  });
});

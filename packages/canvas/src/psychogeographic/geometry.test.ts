import { describe, expect, test } from "vitest";

import {
  buildGraticule,
  greatCircleArc,
  slerp,
  toLatLng,
  toVector,
} from "./geometry";

describe("vector conversion", () => {
  test("toVector/toLatLng round-trips a known coordinate", () => {
    const point = { latitude: 41.0082, longitude: 28.9784 };
    const roundTrip = toLatLng(toVector(point));
    expect(roundTrip.latitude).toBeCloseTo(point.latitude, 8);
    expect(roundTrip.longitude).toBeCloseTo(point.longitude, 8);
  });

  test("north pole maps to the unit z axis", () => {
    const [x, y, z] = toVector({ latitude: 90, longitude: 0 });
    expect(x).toBeCloseTo(0, 8);
    expect(y).toBeCloseTo(0, 8);
    expect(z).toBeCloseTo(1, 8);
  });

  test("slerp at t=0 and t=1 returns the endpoints", () => {
    const a = toVector({ latitude: 0, longitude: 0 });
    const b = toVector({ latitude: 0, longitude: 90 });
    expect(slerp(a, b, 0)).toEqual(a);
    expect(slerp(a, b, 1)).toEqual(b);
  });

  test("antipodal slerp falls back to a finite arc instead of collapsing to the origin", () => {
    // North and south poles are exactly antipodal.
    const north = toVector({ latitude: 90, longitude: 0 });
    const south = toVector({ latitude: -90, longitude: 0 });
    for (const t of [0.25, 0.5, 0.75]) {
      const mid = slerp(north, south, t);
      const length = Math.hypot(mid[0], mid[1], mid[2]);
      // Every interpolated point stays on the unit sphere (finite, non-zero).
      expect(length).toBeCloseTo(1, 6);
      const { latitude } = toLatLng(mid);
      expect(latitude).toBeGreaterThan(-90);
      expect(latitude).toBeLessThan(90);
    }
    expect(slerp(north, south, 0)).toEqual(north);
    expect(slerp(north, south, 1)).toEqual(south);
  });
});

describe("greatCircleArc", () => {
  const prague = { latitude: 50.08, longitude: 14.44 };
  const banda = { latitude: -4.53, longitude: 129.9 };

  test("starts and ends exactly at the two places", () => {
    const arc = greatCircleArc(prague, banda, 64);
    expect(arc[0]).toEqual([14.44, 50.08]);
    expect(arc[arc.length - 1]).toEqual([129.9, -4.53]);
  });

  test("produces segments + 1 points", () => {
    const arc = greatCircleArc(prague, banda, 32);
    expect(arc).toHaveLength(33);
  });

  test("midpoint of an east-west arc stays on the same latitude", () => {
    // Points on the equator: the great circle is the equator itself.
    const a = { latitude: 0, longitude: 0 };
    const b = { latitude: 0, longitude: 90 };
    const arc = greatCircleArc(a, b, 8);
    for (const [, latitude] of arc) {
      expect(latitude).toBeCloseTo(0, 6);
    }
  });

  test("passes exactly through explicit control points", () => {
    const arc = greatCircleArc(prague, banda, 16, [
      { latitude: 30, longitude: 60 },
    ]);
    expect(
      arc.some(
        ([lng, lat]) =>
          Math.abs(lng - 60) < 1e-6 && Math.abs(lat - 30) < 1e-6,
      ),
    ).toBe(true);
  });
});

describe("buildGraticule", () => {
  test("includes both parallels and meridians with GeoJSON line coordinates", () => {
    const graticule = buildGraticule(30, 10);
    expect(graticule.type).toBe("FeatureCollection");
    const parallels = graticule.features.filter(
      (feature) => feature.properties.kind === "parallel",
    );
    const meridians = graticule.features.filter(
      (feature) => feature.properties.kind === "meridian",
    );
    // -60..60 in 30° steps -> 5 parallels.
    expect(parallels).toHaveLength(5);
    // -180..180 in 30° steps -> 13 meridians.
    expect(meridians).toHaveLength(13);
    for (const feature of [...parallels, ...meridians]) {
      expect(feature.geometry.type).toBe("LineString");
      expect(feature.geometry.coordinates.length).toBeGreaterThan(2);
    }
  });

  test("each feature terminates exactly once at its bound (no duplicate consecutive point)", () => {
    const graticule = buildGraticule(30, 10);
    for (const feature of graticule.features) {
      const coordinates = feature.geometry.coordinates;
      for (let i = 1; i < coordinates.length; i += 1) {
        expect(coordinates[i]).not.toEqual(coordinates[i - 1]);
      }
      const last = coordinates[coordinates.length - 1];
      if (feature.properties.kind === "parallel") {
        expect(last[0]).toBe(180);
      } else {
        expect(last[1]).toBe(90);
      }
    }
  });
});

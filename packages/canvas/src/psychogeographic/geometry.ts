/**
 * Spherical geometry for the Places globe surface (refinement-2 D1, task-2
 * steps 4–5): great-circle arcs between Temporal Places and a graticule for
 * the globe. Everything here is pure, deterministic, and offline — the walk
 * arcs are computed as interpolated GeoJSON LineStrings, never fetched.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

export type LonLat = [number, number];

/** A point on the unit sphere, as a 3D vector. */
type Vec3 = [number, number, number];

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/** Converts a WGS84 latitude/longitude pair to a unit 3D vector. */
export function toVector({ latitude, longitude }: LatLng): Vec3 {
  const phi = toRadians(latitude);
  const lambda = toRadians(longitude);
  const cosPhi = Math.cos(phi);
  return [
    cosPhi * Math.cos(lambda),
    cosPhi * Math.sin(lambda),
    Math.sin(phi),
  ];
}

/** Converts a unit 3D vector back to WGS84 latitude/longitude. */
export function toLatLng([x, y, z]: Vec3): LatLng {
  const latitude = toDegrees(Math.asin(clamp(z, -1, 1)));
  const longitude = toDegrees(Math.atan2(y, x));
  return { latitude, longitude };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Spherical linear interpolation between two unit vectors at fraction t. */
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const dot = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
  const omega = Math.acos(dot);
  // Nearly identical vectors (or zero-length): no arc to interpolate.
  if (Math.abs(omega) < 1e-9) {
    return a;
  }
  const sinOmega = Math.sin(omega);
  const aScale = Math.sin((1 - t) * omega) / sinOmega;
  const bScale = Math.sin(t * omega) / sinOmega;
  return [
    a[0] * aScale + b[0] * bScale,
    a[1] * aScale + b[1] * bScale,
    a[2] * aScale + b[2] * bScale,
  ];
}

/**
 * Computes a great-circle arc between two WGS84 points as an array of
 * `[longitude, latitude]` coordinates (GeoJSON order). `controlPoints`
 * subdivide the route so non-great-circle routes can be expressed — the arc
 * passes exactly through each control point. Returns `segments + 1` points
 * for a control-point-free arc.
 */
export function greatCircleArc(
  from: LatLng,
  to: LatLng,
  segments = 64,
  controlPoints: LatLng[] = [],
): LonLat[] {
  const waypoints = [from, ...controlPoints, to];
  const coordinates: LonLat[] = [[from.longitude, from.latitude]];
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const a = toVector(waypoints[i]);
    const b = toVector(waypoints[i + 1]);
    for (let step = 1; step < segments; step += 1) {
      const point = toLatLng(slerp(a, b, step / segments));
      coordinates.push([point.longitude, point.latitude]);
    }
    // End this sub-arc exactly at the segment endpoint, which is either a
    // control point (passed through exactly) or the final `to` place.
    const end = waypoints[i + 1];
    coordinates.push([end.longitude, end.latitude]);
  }
  return coordinates;
}

export interface GraticuleFeature {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: LonLat[] };
  properties: { kind: "parallel" | "meridian" };
}

export interface GraticuleGeometry {
  type: "FeatureCollection";
  features: GraticuleFeature[];
}

/**
 * Builds a graticule (parallels + meridians) for the globe surface. Meridians
 * are exact (great circles through the poles); parallels are sampled densely
 * so MapLibre's globe subdivision renders them as small-circle lines rather
 * than great-circle bulges. Purely local GeoJSON — no external glyphs/tiles.
 */
export function buildGraticule(
  stepDegrees = 30,
  sampleDegrees = 10,
): GraticuleGeometry {
  const features: GraticuleFeature[] = [];
  for (let latitude = -60; latitude <= 60; latitude += stepDegrees) {
    const coordinates: LonLat[] = [];
    for (let longitude = -180; longitude <= 180; longitude += sampleDegrees) {
      coordinates.push([longitude, latitude]);
    }
    coordinates.push([180, latitude]);
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates },
      properties: { kind: "parallel" },
    });
  }
  for (let longitude = -180; longitude <= 180; longitude += stepDegrees) {
    const coordinates: LonLat[] = [];
    for (let latitude = -90; latitude <= 90; latitude += sampleDegrees) {
      coordinates.push([longitude, latitude]);
    }
    coordinates.push([longitude, 90]);
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates },
      properties: { kind: "meridian" },
    });
  }
  return { type: "FeatureCollection", features };
}

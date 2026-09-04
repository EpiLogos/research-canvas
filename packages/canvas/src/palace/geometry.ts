/**
 * Palace geometry (vision §3.12, refinement-2 D5): pure, deterministic
 * geometry helpers for the 3D palace — seeded randomness (so regeneration is
 * stable), the six named room faces, and a seeded force/spring layout for
 * constellation objects. This module is deliberately free of React/three.js
 * so the geometry is unit-testable in isolation.
 */

/** A point on the palace floor plane (three.js x/z, y up). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** The six faces of a cube room, named for the six-face memory-palace
 * pattern (the Obsidian-plugin precedent, re-derived as the QL 6+6' layer). */
export type FaceId = "north" | "south" | "east" | "west" | "floor" | "ceiling";

export const FACE_IDS: readonly FaceId[] = [
  "north",
  "south",
  "east",
  "west",
  "floor",
  "ceiling",
];

export interface BoxSize {
  width: number;
  depth: number;
  height: number;
}

export interface FaceAnchor {
  face: FaceId;
  /** A stable rank used to spread multiple placements across a face. */
  slot: number;
  slotCount: number;
}

/** A deterministic PRNG (mulberry32) so room/object generation is stable
 * across regenerations given the same seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → unsigned 32-bit seed. */
export function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic room size for a chamber id, inside a small seeded range. */
export function roomSizeFor(
  chamberId: string,
  base: BoxSize = { width: 6, depth: 6, height: 3.2 },
  jitter = 1.2,
): BoxSize {
  const random = seededRandom(hashString(`room-size:${chamberId}`));
  const spread = (value: number) => value * (1 - jitter / 4 + random() * (jitter / 2));
  return {
    width: spread(base.width),
    depth: spread(base.depth),
    height: spread(base.height),
  };
}

/** Layout rooms in a deterministic snake grid by walk order. Rooms face the
 * corridor; spacing leaves room for corridors between them. */
export function layoutRoomGrid(
  count: number,
  seed: number,
  spacing: { gap: number; columns: number } = { gap: 3, columns: 3 },
): Vec3[] {
  const centers: Vec3[] = [];
  const random = seededRandom(seed);
  for (let index = 0; index < count; index += 1) {
    const column = index % spacing.columns;
    const row = Math.floor(index / spacing.columns);
    const jitterX = (random() - 0.5) * spacing.gap * 0.4;
    const jitterZ = (random() - 0.5) * spacing.gap * 0.4;
    centers.push({
      x: column * (6 + spacing.gap) + jitterX,
      y: 0,
      z: row * (6 + spacing.gap) + jitterZ,
    });
  }
  return centers;
}

/** Resolve a (face, slot) anchor to an actual point on a room's interior
 * surface, given the room center and size. Slots spread placements along the
 * face so multiple objects on the same face never overlap. */
export function faceAnchorPoint(
  face: FaceId,
  slot: number,
  slotCount: number,
  center: Vec3,
  size: BoxSize,
  inset = 0.15,
): Vec3 {
  const halfWidth = size.width / 2;
  const halfDepth = size.depth / 2;
  const halfHeight = size.height / 2;
  const fraction = slotCount <= 1 ? 0.5 : slot / (slotCount - 1);
  const spreadX = -0.5 + fraction;
  const spreadZ = -0.5 + fraction;
  const wallInset = (() => {
    const margin = Math.min(inset, Math.min(size.width, size.depth) / 6);
    return margin;
  })();
  switch (face) {
    case "north":
      return { x: center.x + spreadX * (size.width - wallInset * 2), y: center.y + halfHeight * 0.7, z: center.z - halfDepth };
    case "south":
      return { x: center.x + spreadX * (size.width - wallInset * 2), y: center.y + halfHeight * 0.7, z: center.z + halfDepth };
    case "east":
      return { x: center.x + halfWidth, y: center.y + halfHeight * 0.7, z: center.z + spreadZ * (size.depth - wallInset * 2) };
    case "west":
      return { x: center.x - halfWidth, y: center.y + halfHeight * 0.7, z: center.z + spreadZ * (size.depth - wallInset * 2) };
    case "floor":
      return { x: center.x + spreadX * (size.width - wallInset * 2), y: center.y + inset, z: center.z + spreadZ * (size.depth - wallInset * 2) };
    case "ceiling":
      return { x: center.x + spreadX * (size.width - wallInset * 2), y: center.y + size.height - inset, z: center.z + spreadZ * (size.depth - wallInset * 2) };
  }
}

/** The face opposite a given face (the portal's conjugate face). */
export function oppositeFace(face: FaceId): FaceId {
  switch (face) {
    case "north":
      return "south";
    case "south":
      return "north";
    case "east":
      return "west";
    case "west":
      return "east";
    case "floor":
      return "ceiling";
    case "ceiling":
      return "floor";
  }
}

/** A point just inside the portal (entrance) of a room, used as the camera
 * spawn/enter position. The portal is on the given face, inset from the wall. */
export function portalEntryPoint(
  face: FaceId,
  center: Vec3,
  size: BoxSize,
): Vec3 {
  const halfWidth = size.width / 2;
  const halfDepth = size.depth / 2;
  switch (face) {
    case "north":
      return { x: center.x, y: 1.6, z: center.z - halfDepth + 0.6 };
    case "south":
      return { x: center.x, y: 1.6, z: center.z + halfDepth - 0.6 };
    case "east":
      return { x: center.x + halfWidth - 0.6, y: 1.6, z: center.z };
    case "west":
      return { x: center.x - halfWidth + 0.6, y: 1.6, z: center.z };
    case "floor":
      return { x: center.x, y: 0.6, z: center.z };
    case "ceiling":
      return { x: center.x, y: size.height - 0.6, z: center.z };
  }
}

/** A straight corridor from room A to room B (a single segment for the
 * snap-grid; the renderer draws it as a floor strip). */
export function corridorPath(
  from: Vec3,
  to: Vec3,
): Array<{ x: number; z: number }> {
  return [
    { x: from.x, z: from.z },
    { x: to.x, z: to.z },
  ];
}

/** Euclidean distance in the floor plane. */
export function planarDistance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

/** A deterministic camera yaw (radians) for a room, so entering a room always
 * faces the same direction. */
export function entryYawFor(chamberId: string): number {
  const random = seededRandom(hashString(`entry-yaw:${chamberId}`));
  return random() * Math.PI * 2;
}

// ---- Seeded force/spring layout for constellation objects ----

export interface ForceNode {
  id: string;
}

export interface ForceEdge {
  source: string;
  target: string;
}

export interface ForceLayoutResult {
  id: string;
  position: Vec3;
}

const FORCE_GRAVITY = 0.04;
const FORCE_REPULSION = 1.6;
const FORCE_SPRING = 0.12;
const FORCE_BOUNDS = 2.2;

/**
 * Deterministic seeded force-directed layout of a graph into a bounded 3D
 * cloud. Positions are initialised on a seeded sphere (stable across calls),
 * then relaxed with classic repulsion + spring attraction along real edges.
 * The constellation object is "the graph, embodied" — this is the real edge
 * set laid out in space, not a picture of it.
 */
export function layoutForceGraph(
  nodes: ForceNode[],
  edges: ForceEdge[],
  seed: number,
  iterations = 70,
): ForceLayoutResult[] {
  if (nodes.length === 0) return [];
  const random = seededRandom(seed);
  const positions = new Map<string, Vec3>();
  const indexById = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();
  nodes.forEach((node, index) => {
    indexById.set(node.id, index);
    adjacency.set(node.id, new Set());
    // Seeded spherical initialisation keeps regeneration identical.
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    const radius = 0.6 + random() * 1.4;
    positions.set(node.id, {
      x: radius * Math.sin(phi) * Math.cos(theta),
      y: radius * Math.sin(phi) * Math.sin(theta),
      z: radius * Math.cos(phi),
    });
  });
  for (const edge of edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    // Repulsion between every pair.
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = positions.get(nodes[i].id)!;
        const b = positions.get(nodes[j].id)!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        const distanceSq = Math.max(dx * dx + dy * dy + dz * dz, 0.01);
        const force = FORCE_REPULSION / distanceSq;
        const scale = force / Math.sqrt(distanceSq);
        a.x += dx * scale;
        a.y += dy * scale;
        a.z += dz * scale;
        b.x -= dx * scale;
        b.y -= dy * scale;
        b.z -= dz * scale;
      }
    }
    // Spring attraction along real edges.
    for (const edge of edges) {
      const a = positions.get(edge.source);
      const b = positions.get(edge.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      a.x += dx * FORCE_SPRING;
      a.y += dy * FORCE_SPRING;
      a.z += dz * FORCE_SPRING;
      b.x -= dx * FORCE_SPRING;
      b.y -= dy * FORCE_SPRING;
      b.z -= dz * FORCE_SPRING;
    }
    // Gravity pulls the whole graph toward the center so it stays bounded.
    for (const node of nodes) {
      const position = positions.get(node.id)!;
      position.x -= position.x * FORCE_GRAVITY;
      position.y -= position.y * FORCE_GRAVITY;
      position.z -= position.z * FORCE_GRAVITY;
    }
  }

  // Final clamp keeps the constellation walkable and inspectable.
  const results: ForceLayoutResult[] = [];
  for (const node of nodes) {
    const position = positions.get(node.id)!;
    const clamp = (value: number) =>
      Math.max(-FORCE_BOUNDS, Math.min(FORCE_BOUNDS, value));
    results.push({
      id: node.id,
      position: {
        x: clamp(position.x),
        y: Math.max(-0.4, Math.min(1.6, clamp(position.y))),
        z: clamp(position.z),
      },
    });
  }
  return results;
}

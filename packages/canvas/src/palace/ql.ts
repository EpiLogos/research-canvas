import type { GraphNode } from "@research-canvas/desktop-api";

import type { FaceId } from "./geometry";

/**
 * QL 6+6' tacit structural layer (refinement-2 D5.7, bootstrapping profile
 * only): rooms are cubes whose six interior faces map to the six QL Day
 * positions (P0–P5; canonical position–lens coordinates). The conjugate 6'
 * (Night positions P0'–P5') maps to the room-as-object. QL is generation
 * geometry and placement rules only — tacit, never forced into visible
 * vocabulary; curated titles stay. Other profiles get neutral cube rooms.
 */

export const QL_POSITIONS = [
  { index: 0, key: "P0", day: "ground/source", night: "P0'" },
  { index: 1, key: "P1", day: "material", night: "P1'" },
  { index: 2, key: "P2", day: "dynamis", night: "P2'" },
  { index: 3, key: "P3", day: "pattern", night: "P3'" },
  { index: 4, key: "P4", day: "context", night: "P4'" },
  { index: 5, key: "P5", day: "synthesis", night: "P5'" },
] as const;

export type QlPosition = 0 | 1 | 2 | 3 | 4 | 5;

export function isQlPosition(value: number): value is QlPosition {
  return Number.isInteger(value) && value >= 0 && value <= 5;
}

export const QL_FACE_ORDER: readonly FaceId[] = [
  "floor",
  "south",
  "east",
  "north",
  "west",
  "ceiling",
];

/**
 * The six interior faces map to P0–P5. P0 ground/source is the floor and
 * P5 synthesis is the ceiling; the four walls carry P1–P4 (material, dynamis,
 * pattern, context) so the room reads as the QL Day frame from inside.
 */
export const QL_FACE_MAP: Readonly<Record<FaceId, QlPosition>> = {
  floor: 0,
  south: 1,
  east: 2,
  north: 3,
  west: 4,
  ceiling: 5,
};

export function qlPositionForFace(face: FaceId): QlPosition {
  return QL_FACE_MAP[face];
}

export function faceForQlPosition(position: QlPosition): FaceId {
  const index = QL_FACE_ORDER.indexOf(QL_FACE_ORDER[position]);
  return QL_FACE_ORDER[index];
}

/** The conjugate Night position label for a Day position (P0 → P0'). */
export function conjugatePosition(position: QlPosition): string {
  return QL_POSITIONS[position].night;
}

export interface QlResonanceInput {
  node: GraphNode;
  /** The chamber's members — used to stabilise the sixfold ordering. */
  members: GraphNode[];
}

/**
 * Deterministic QL resonance for a chamber member. A node "resonates" when it
 * carries QL metadata (`qlUnitId` and/or `qlForm`). Members sharing a QL unit
 * form the sixfold: their positions are assigned in stable id order so
 * regeneration is identical. Nodes without QL metadata have no resonance
 * (`null`) and place on the floor/center or a neutral face. This is placement
 * geometry only — the position is never surfaced as a visible label.
 */
export function qlPositionForNode(input: QlResonanceInput): QlPosition | null {
  const { node, members } = input;
  if (!node.qlUnitId && !node.qlForm) return null;
  const unitId = node.qlUnitId ?? node.qlForm ?? "ql";
  const unitMembers = members.filter(
    (member) => (member.qlUnitId ?? member.qlForm ?? "ql") === unitId,
  );
  const sorted = [...unitMembers].sort((a, b) =>
    a.graphNodeId.localeCompare(b.graphNodeId),
  );
  const index = sorted.findIndex((member) => member.graphNodeId === node.graphNodeId);
  if (index === -1) return null;
  return (index % 6) as QlPosition;
}

/** Whether a chamber carries QL structure at all (has at least one resonant
 * member) — gates QL shaping for the bootstrapping profile. */
export function chamberHasQlResonance(members: GraphNode[]): boolean {
  return members.some((member) => member.qlUnitId || member.qlForm);
}

/** Deterministic conjugate (Night) position for a room-as-object, derived from
 * the chamber id so the exterior face is stable across regenerations. */
export function conjugatePositionForChamber(chamberId: string): QlPosition {
  let hash = 2166136261;
  for (let i = 0; i < chamberId.length; i += 1) {
    hash ^= chamberId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // `Math.imul` yields a signed 32-bit int, so `% 6` can be negative without
  // re-normalisation — the conjugate must always land in 0..5.
  return (((hash >>> 0) % 6) as QlPosition);
}

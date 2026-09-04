import { describe, expect, test } from "vitest";

import {
  advancePose,
  easePoseToward,
  forwardVector,
  lookByDeltas,
  planarDistanceSquared,
  rightVector,
  roomEntryPose,
} from "./camera";
import type { PalaceRoomScene } from "./renderer";

function room(over: Partial<PalaceRoomScene> = {}): PalaceRoomScene {
  return {
    id: "chamber:x",
    title: "X",
    anchorGraphNodeId: "x",
    center: { x: 0, y: 0, z: 0 },
    size: { width: 6, depth: 6, height: 3.2 },
    rotationY: 0,
    form: "room",
    interiorFaces: [],
    exteriorFace: "north",
    exteriorConjugate: null,
    members: [],
    doorways: ["north"],
    ...over,
  };
}

describe("roomEntryPose", () => {
  test("north doorway enters just inside the north wall, facing the center", () => {
    const pose = roomEntryPose(room());
    // North wall at z = -3; entry inset 0.8 → z ≈ -2.2.
    expect(pose.z).toBeCloseTo(-2.2, 5);
    expect(pose.y).toBe(1.6);
    // Facing +Z (the center): yaw = π.
    expect(pose.yaw).toBeCloseTo(Math.PI, 5);
  });

  test("south doorway enters facing -Z", () => {
    const pose = roomEntryPose(room({ doorways: ["south"] }));
    expect(pose.z).toBeCloseTo(2.2, 5);
    expect(pose.yaw).toBeCloseTo(0, 5);
  });

  test("east doorway enters at +X facing -X", () => {
    const pose = roomEntryPose(room({ doorways: ["east"] }));
    expect(pose.x).toBeCloseTo(2.2, 5);
    expect(pose.yaw).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe("forwardVector / rightVector", () => {
  test("yaw 0 faces -Z, right is +X", () => {
    const forward = forwardVector(0);
    const right = rightVector(0);
    expect(forward.x).toBeCloseTo(0, 5);
    expect(forward.z).toBeCloseTo(-1, 5);
    expect(right.x).toBeCloseTo(1, 5);
    expect(right.z).toBeCloseTo(0, 5);
  });

  test("yaw π faces +Z", () => {
    const forward = forwardVector(Math.PI);
    expect(forward.x).toBeCloseTo(0, 5);
    expect(forward.z).toBeCloseTo(1, 5);
  });
});

describe("advancePose", () => {
  test("W moves along the forward vector", () => {
    const pose = { x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0 };
    const next = advancePose(
      pose,
      { forward: true, back: false, strafeLeft: false, strafeRight: false },
      2,
      0.5,
    );
    expect(next.z).toBeCloseTo(-1, 5);
    expect(next.x).toBeCloseTo(0, 5);
    expect(next.y).toBe(1.6);
  });

  test("D strafes right", () => {
    const pose = { x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0 };
    const next = advancePose(
      pose,
      { forward: false, back: false, strafeLeft: false, strafeRight: true },
      2,
      0.5,
    );
    expect(next.x).toBeCloseTo(1, 5);
    expect(next.z).toBeCloseTo(0, 5);
  });
});

describe("lookByDeltas", () => {
  test("yaw turns and pitch clamps at the horizon", () => {
    const pose = { x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0 };
    const next = lookByDeltas(pose, 0.5, 3);
    expect(next.yaw).toBeCloseTo(0.5, 5);
    expect(next.pitch).toBeCloseTo(Math.PI / 2 - 0.01, 5);
  });
});

describe("easePoseToward", () => {
  test("eases toward the target and wraps yaw the short way", () => {
    const start = { x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0 };
    const target = { x: 5, y: 1.6, z: 5, yaw: Math.PI - 0.1, pitch: 0 };
    const next = easePoseToward(start, target, 0.5, 2);
    expect(next.x).toBeGreaterThan(0);
    expect(next.z).toBeGreaterThan(0);
    // Shortest yaw arc from 0 to ~π is forward, not wrapping the long way.
    expect(next.yaw).toBeGreaterThan(0);
    expect(planarDistanceSquared(next, target)).toBeLessThan(
      planarDistanceSquared(start, target),
    );
  });
});

import type { PalaceRoomScene } from "./renderer";

/**
 * First-person camera math for the 3D palace (refinement-2 D5.8): a pure,
 * unit-testable model of the player pose (position + yaw/pitch). The
 * renderer's `CameraRig` consumes these helpers each frame; geometry is
 * separated so navigation is testable without a WebGL context.
 *
 * Conventions (three.js): the camera looks down its local −Z axis. With
 * `rotation.set(pitch, yaw, 0, "YXZ")` the world forward vector at pitch 0 is
 * (−sin(yaw), 0, −cos(yaw)) and the right vector is (cos(yaw), 0, −sin(yaw)).
 */

export interface CameraPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface InputState {
  forward: boolean;
  back: boolean;
  strafeLeft: boolean;
  strafeRight: boolean;
}

/** The forward world vector for a yaw (pitch ignored). */
export function forwardVector(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** The right world vector for a yaw. */
export function rightVector(yaw: number): { x: number; z: number } {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

/**
 * Entry pose for a room: just inside its portal face, at eye height, facing the
 * room center. Used as the camera spawn and fly-to target.
 */
export function roomEntryPose(room: PalaceRoomScene): CameraPose {
  const face = room.doorways[0] ?? "north";
  const halfWidth = room.size.width / 2;
  const halfDepth = room.size.depth / 2;
  const inset = 0.8;
  let x = room.center.x;
  let z = room.center.z;
  let yaw = 0;
  switch (face) {
    case "north":
      // Entry on the north wall; look toward +Z (the room center).
      z = room.center.z - halfDepth + inset;
      yaw = Math.PI;
      break;
    case "south":
      z = room.center.z + halfDepth - inset;
      yaw = 0;
      break;
    case "east":
      x = room.center.x + halfWidth - inset;
      yaw = Math.PI / 2;
      break;
    case "west":
      x = room.center.x - halfWidth + inset;
      yaw = -Math.PI / 2;
      break;
    case "floor":
      yaw = 0;
      break;
    case "ceiling":
      yaw = 0;
      break;
  }
  return { x, y: 1.6, z, yaw, pitch: 0 };
}

/**
 * Advance a pose by a frame of first-person movement (WASD). `speed` is in
 * world units per second; `delta` is the frame time. The player stays on the
 * palace floor (y is untouched by translation).
 */
export function advancePose(
  pose: CameraPose,
  input: InputState,
  speed: number,
  delta: number,
): CameraPose {
  const forward = forwardVector(pose.yaw);
  const right = rightVector(pose.yaw);
  let dx = 0;
  let dz = 0;
  if (input.forward) {
    dx += forward.x * speed * delta;
    dz += forward.z * speed * delta;
  }
  if (input.back) {
    dx -= forward.x * speed * delta;
    dz -= forward.z * speed * delta;
  }
  if (input.strafeRight) {
    dx += right.x * speed * delta;
    dz += right.z * speed * delta;
  }
  if (input.strafeLeft) {
    dx -= right.x * speed * delta;
    dz -= right.z * speed * delta;
  }
  return { ...pose, x: pose.x + dx, z: pose.z + dz };
}

/** Rotate yaw/pitch by pointer deltas (radians), clamping pitch to the horizon
 * so the player never flips over the ceiling. */
export function lookByDeltas(
  pose: CameraPose,
  yawDelta: number,
  pitchDelta: number,
  clamp = Math.PI / 2 - 0.01,
): CameraPose {
  return {
    ...pose,
    yaw: pose.yaw + yawDelta,
    pitch: Math.max(-clamp, Math.min(clamp, pose.pitch + pitchDelta)),
  };
}

/**
 * Ease a pose toward a target by a frame (exponential smoothing). Yaw wraps so
 * the shortest arc is always taken. Returns the eased pose.
 */
export function easePoseToward(
  pose: CameraPose,
  target: CameraPose,
  delta: number,
  rate = 3,
): CameraPose {
  const t = 1 - Math.exp(-rate * delta);
  let yawDelta = target.yaw - pose.yaw;
  while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
  while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
  return {
    x: pose.x + (target.x - pose.x) * t,
    y: pose.y + (target.y - pose.y) * t,
    z: pose.z + (target.z - pose.z) * t,
    yaw: pose.yaw + yawDelta * t,
    pitch: pose.pitch + (target.pitch - pose.pitch) * t,
  };
}

/** Squared planar distance between two poses (used to decide arrival). */
export function planarDistanceSquared(a: CameraPose, b: CameraPose): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

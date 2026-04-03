import { Position } from "@xyflow/react";

export const HANDLE_SIDES = ["top", "right", "bottom", "left"] as const;

export type HandleSide = (typeof HANDLE_SIDES)[number];

export const HANDLE_POSITIONS: Record<HandleSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

export function defaultSourceHandleId() {
  return "source-bottom";
}

export function defaultTargetHandleId() {
  return "target-top";
}

export function sourceHandleId(side: HandleSide) {
  return `source-${side}` as const;
}

export function targetHandleId(side: HandleSide) {
  return `target-${side}` as const;
}

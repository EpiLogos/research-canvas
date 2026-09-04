import type { Scene, SceneSequence } from "@research-canvas/schema";

export interface PalaceVector3 {
  x: number;
  y: number;
  z: number;
}

export interface PalaceRoom {
  id: string;
  graphNodeId: string | null;
  title: string;
  position: PalaceVector3;
  size: { width: number; height: number; depth: number };
  form: string;
}

export interface PalaceCorridor {
  id: string;
  sourceRoomId: string;
  targetRoomId: string;
  waypoints: PalaceVector3[];
}

export type PalaceWallFace = "north" | "south" | "east" | "west" | "floor" | "ceiling";
export type PalaceWallObjectKind = "node" | "scene" | "image" | "video";

export interface PalaceWallObject {
  id: string;
  graphNodeId: string | null;
  sceneId: string | null;
  assetId: string | null;
  roomId: string;
  face: PalaceWallFace;
  offset: { x: number; y: number };
  kind: PalaceWallObjectKind;
}

export interface PalaceLayout {
  constellationId: string;
  rooms: PalaceRoom[];
  corridors: PalaceCorridor[];
  objects: PalaceWallObject[];
}

export interface PalaceBundleWriteResult {
  bundlePath: string;
}

/**
 * Canonical Surface #5 presentation/persistence port. The semantic graph stays
 * authoritative; this boundary owns only local spatial layout, generated walk
 * persistence and explicit bundle export.
 */
export interface PalaceRepository {
  getOrCreatePalace(constellationId: string): Promise<PalaceLayout>;
  updatePalace(constellationId: string, layout: PalaceLayout): Promise<void>;
  persistWalk(input: { sequence: SceneSequence; scenes: Scene[] }): Promise<void>;
  writeBundle(input: { outputDir: string; bundleJson: string }): Promise<PalaceBundleWriteResult>;
}

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

/**
 * Canonical Surface #5 layout port.
 *
 * The graph remains semantic authority for generated structure. This port owns
 * only the constellation-scoped spatial presentation/curation projected over
 * that graph; implementations persist it locally and never write palace
 * geometry back into graph relationships.
 */
export interface PalaceRepository {
  getOrCreatePalace(constellationId: string): Promise<PalaceLayout>;
  updatePalace(constellationId: string, layout: PalaceLayout): Promise<void>;
}

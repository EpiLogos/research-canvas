import type {
  PalaceLayout,
  PalaceRoom,
  PalaceWallObject,
  PalaceWallObjectKind,
} from "@research-canvas/domain";

import type {
  PalaceObjectScene,
  PalaceRoomScene,
  PalaceScene,
} from "./renderer";

const FACES = ["north", "south", "east", "west", "floor", "ceiling"] as const;

/** Convert the mature generated scene into the canonical editable T14 layout. */
export function palaceLayoutFromScene(
  constellationId: string,
  scene: PalaceScene,
): PalaceLayout {
  return {
    constellationId,
    rooms: scene.rooms.map((room) => ({
      id: room.id,
      graphNodeId: room.anchorGraphNodeId || null,
      title: room.title,
      position: { ...room.center },
      size: { ...room.size },
      form: room.form,
    })),
    corridors: scene.connections.map((connection) => ({
      id: connection.id,
      sourceRoomId: connection.fromRoomId,
      targetRoomId: connection.toRoomId,
      waypoints: connection.path.map((point) => ({ x: point.x, y: 0, z: point.z })),
    })),
    objects: scene.objects.flatMap((object) => {
      const face = object.placement.face;
      if (!face) return [];
      return [{
        id: object.id,
        graphNodeId: object.graphNodeId,
        sceneId: object.kind === "storyScene" ? object.contentRef : null,
        assetId: object.kind === "image" ? object.contentRef : null,
        roomId: object.roomId,
        face,
        offset: { x: object.placement.position.x, y: object.placement.position.y },
        kind: wallObjectKind(object),
      } satisfies PalaceWallObject];
    }),
  };
}

/**
 * Overlay editable layout state without discarding the rich generated room
 * model. Existing generated room ids retain members, QL faces, encapsulation
 * form and constellation objects; only spatial/title fields are curated.
 */
export function applyPalaceLayoutToScene(
  scene: PalaceScene,
  layout: PalaceLayout,
): PalaceScene {
  const generatedRooms = new Map(scene.rooms.map((room) => [room.id, room] as const));
  const rooms = layout.rooms.map((room, index) =>
    generatedRooms.has(room.id)
      ? mergeGeneratedRoom(generatedRooms.get(room.id)!, room)
      : manualRoomScene(room, index),
  );
  const roomIds = new Set(rooms.map((room) => room.id));

  const connections = layout.corridors
    .filter((corridor) => roomIds.has(corridor.sourceRoomId) && roomIds.has(corridor.targetRoomId))
    .map((corridor) => ({
      id: corridor.id,
      fromRoomId: corridor.sourceRoomId,
      toRoomId: corridor.targetRoomId,
      path: corridor.waypoints.map((point) => ({ x: point.x, z: point.z })),
    }));

  const layoutObjectIds = new Set(layout.objects.map((object) => object.id));
  const generatedObjects = scene.objects.filter(
    (object) => roomIds.has(object.roomId) && !layoutObjectIds.has(object.id),
  );
  const objects = [
    ...generatedObjects,
    ...layout.objects
      .filter((object) => roomIds.has(object.roomId))
      .map((object) => wallObjectScene(object, rooms)),
  ];

  return {
    ...scene,
    rooms,
    connections,
    objects,
    collections: scene.collections.filter((collection) => roomIds.has(collection.roomId)),
    fixtures: scene.fixtures.filter((fixture) => roomIds.has(fixture.roomId)),
    constellationObjects: scene.constellationObjects.filter((object) => roomIds.has(object.roomId)),
    entryRoomId: rooms[0]?.id ?? "",
    walkOrder: rooms.map((room) => room.id),
    encapsulationObjects: scene.encapsulationObjects.filter((object) => roomIds.has(object.roomId)),
  };
}

function mergeGeneratedRoom(generated: PalaceRoomScene, layout: PalaceRoom): PalaceRoomScene {
  return {
    ...generated,
    title: layout.title,
    center: { ...layout.position },
    size: { ...layout.size },
    form: palaceForm(layout.form, generated.form),
  };
}

function manualRoomScene(room: PalaceRoom, index: number): PalaceRoomScene {
  const exteriorFace = FACES[index % 4] ?? "north";
  return {
    id: room.id,
    title: room.title,
    anchorGraphNodeId: room.graphNodeId ?? room.id,
    center: { ...room.position },
    size: { ...room.size },
    rotationY: 0,
    form: palaceForm(room.form, "cube"),
    interiorFaces: FACES.map((face) => ({ face, qlPosition: null })),
    exteriorFace,
    exteriorConjugate: null,
    members: [],
    doorways: [exteriorFace],
  };
}

function palaceForm(
  form: string,
  fallback: PalaceRoomScene["form"],
): PalaceRoomScene["form"] {
  return form === "cube" || form === "alcove" || form === "corridor" || form === "wallSection"
    ? form
    : fallback;
}

function wallObjectKind(object: PalaceObjectScene): PalaceWallObjectKind {
  if (object.kind === "image") return "image";
  if (object.kind === "storyScene") return "scene";
  return "node";
}

function wallObjectScene(
  object: PalaceWallObject,
  rooms: PalaceRoomScene[],
): PalaceObjectScene {
  const room = rooms.find((candidate) => candidate.id === object.roomId);
  const center = room?.center ?? { x: 0, y: 0, z: 0 };
  return {
    id: object.id,
    roomId: object.roomId,
    kind: object.kind === "image"
      ? "image"
      : object.kind === "scene"
        ? "storyScene"
        : "event",
    title: object.graphNodeId ?? object.sceneId ?? object.assetId ?? "Placed object",
    graphNodeId: object.graphNodeId,
    contentRef: object.sceneId ?? object.assetId,
    placement: {
      surface: "fixture",
      position: {
        x: center.x + object.offset.x,
        y: center.y + object.offset.y,
        z: center.z,
      },
      rotationY: 0,
      scale: 1,
      face: object.face,
    },
    isCurated: true,
  };
}

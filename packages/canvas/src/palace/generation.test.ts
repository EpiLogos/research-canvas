import { describe, expect, test } from "vitest";

import type { PalaceLayout, PalaceRoom } from "@research-canvas/domain";

import { applyPalaceLayoutToScene } from "./generation";
import type { PalaceRoomScene, PalaceScene } from "./renderer";

function generatedRoom(id: string, title: string): PalaceRoomScene {
  return {
    id,
    title,
    anchorGraphNodeId: `node:${id}`,
    center: { x: 0, y: 0, z: 0 },
    size: { width: 6, height: 4, depth: 6 },
    rotationY: 0,
    form: "cube",
    interiorFaces: [],
    exteriorFace: "north",
    exteriorConjugate: null,
    members: [],
    doorways: ["north"],
  };
}

function layoutRoom(id: string, title: string, graphNodeId: string | null): PalaceRoom {
  return {
    id,
    graphNodeId,
    title,
    position: { x: 0, y: 0, z: 0 },
    size: { width: 6, height: 4, depth: 6 },
    form: "cube",
  };
}

function scene(): PalaceScene {
  return {
    profileScope: "bootstrapping",
    rooms: [generatedRoom("room:b", "B curated first"), generatedRoom("room:a", "A curated second")],
    connections: [],
    objects: [],
    collections: [],
    fixtures: [],
    constellationObjects: [],
    entryRoomId: "room:b",
    walkOrder: ["room:b", "room:a"],
    nodeTitles: {},
    encapsulationObjects: [],
  };
}

describe("applyPalaceLayoutToScene", () => {
  test("preserves generated curated recall order while applying persisted layout and manual rooms", () => {
    const layout: PalaceLayout = {
      constellationId: "constellation:one",
      // Persistence may still carry the older generated-room order. It must not
      // undo the current mature Palace curation produced by buildPalaceScene.
      rooms: [
        layoutRoom("room:a", "A moved", "node:room:a"),
        layoutRoom("room:b", "B moved", "node:room:b"),
        layoutRoom("manual:room:one", "Manual room", null),
      ],
      corridors: [],
      objects: [],
    };

    const projected = applyPalaceLayoutToScene(scene(), layout);

    expect(projected.rooms.map((room) => room.id)).toEqual([
      "room:b",
      "room:a",
      "manual:room:one",
    ]);
    expect(projected.walkOrder).toEqual(["room:b", "room:a", "manual:room:one"]);
    expect(projected.entryRoomId).toBe("room:b");
    expect(projected.rooms[1]?.title).toBe("A moved");
  });

  test("keeps deleting a generated room an explicit persisted overlay operation", () => {
    const layout: PalaceLayout = {
      constellationId: "constellation:one",
      rooms: [layoutRoom("room:a", "A only", "node:room:a")],
      corridors: [],
      objects: [],
    };

    const projected = applyPalaceLayoutToScene(scene(), layout);

    expect(projected.rooms.map((room) => room.id)).toEqual(["room:a"]);
    expect(projected.walkOrder).toEqual(["room:a"]);
    expect(projected.entryRoomId).toBe("room:a");
  });
});
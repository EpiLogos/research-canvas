import { describe, expect, test } from "vitest";

import {
  corridorPath,
  faceAnchorPoint,
  hashString,
  layoutForceGraph,
  layoutRoomGrid,
  planarDistance,
  portalEntryPoint,
  roomSizeFor,
  seededRandom,
} from "./geometry";

describe("seededRandom + hashString", () => {
  test("is deterministic for the same seed", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const firstA = a();
    const firstB = b();
    expect(firstA).toBe(firstB);
    expect(a()).toBe(b());
  });

  test("different seeds diverge", () => {
    const a = seededRandom(1)();
    const b = seededRandom(2)();
    expect(a).not.toBe(b);
  });

  test("hashString produces a stable non-negative integer", () => {
    const h = hashString("chamber:x");
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(hashString("chamber:x")).toBe(h);
  });
});

describe("roomSizeFor", () => {
  test("is deterministic and stays within a bounded range", () => {
    const size = roomSizeFor("chamber:test");
    expect(roomSizeFor("chamber:test")).toEqual(size);
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
    expect(size.depth).toBeGreaterThan(0);
  });

  test("different chambers produce different sizes", () => {
    const a = roomSizeFor("chamber:a");
    const b = roomSizeFor("chamber:b");
    expect(a).not.toEqual(b);
  });
});

describe("layoutRoomGrid", () => {
  test("produces deterministic non-overlapping centers", () => {
    const centers = layoutRoomGrid(6, hashString("grid"));
    const again = layoutRoomGrid(6, hashString("grid"));
    expect(centers).toEqual(again);
    expect(centers).toHaveLength(6);
    // All on the floor plane.
    for (const center of centers) {
      expect(center.y).toBe(0);
    }
    // Distinct x/z so rooms never overlap.
    const keys = new Set(centers.map((c) => `${c.x.toFixed(3)},${c.z.toFixed(3)}`));
    expect(keys.size).toBe(6);
  });
});

describe("faceAnchorPoint", () => {
  const center = { x: 0, y: 0, z: 0 };
  const size = { width: 6, depth: 6, height: 3 };

  test("north anchor sits on the north wall at eye height", () => {
    const point = faceAnchorPoint("north", 0, 2, center, size);
    expect(point.z).toBeCloseTo(-3, 5);
    expect(point.y).toBeCloseTo(1.05, 5);
  });

  test("floor anchor sits on the floor plane", () => {
    const point = faceAnchorPoint("floor", 0, 1, center, size);
    expect(point.y).toBeCloseTo(0.15, 5);
  });

  test("slots spread across a face", () => {
    const first = faceAnchorPoint("south", 0, 2, center, size);
    const second = faceAnchorPoint("south", 1, 2, center, size);
    expect(second.x).toBeGreaterThan(first.x);
  });
});

describe("portalEntryPoint", () => {
  test("sits just inside the portal face", () => {
    const point = portalEntryPoint("north", { x: 0, y: 0, z: 0 }, { width: 6, depth: 6, height: 3 });
    expect(point.z).toBeCloseTo(-2.4, 5);
    expect(point.y).toBe(1.6);
  });
});

describe("corridorPath + planarDistance", () => {
  test("path connects the two room centers", () => {
    const path = corridorPath({ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 6 });
    expect(path[0]).toEqual({ x: 0, z: 0 });
    expect(path[1]).toEqual({ x: 6, z: 6 });
  });

  test("planarDistance ignores height", () => {
    expect(planarDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 99, z: 4 })).toBeCloseTo(5, 5);
  });
});

describe("layoutForceGraph", () => {
  test("is deterministic for the same seed", () => {
    const nodes = [
      { id: "a" },
      { id: "b" },
      { id: "c" },
      { id: "d" },
    ];
    const edges = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "c", target: "d" },
    ];
    const first = layoutForceGraph(nodes, edges, 7);
    const second = layoutForceGraph(nodes, edges, 7);
    expect(first).toEqual(second);
  });

  test("connected nodes end up closer than disconnected ones", () => {
    const nodes = [
      { id: "a" },
      { id: "b" },
      { id: "c" },
      { id: "d" },
      { id: "e" },
      // Isolated nodes: never connected to the chain.
      { id: "x" },
      { id: "y" },
    ];
    // a-b-c-d-e chain; x and y isolated.
    const edges = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "c", target: "d" },
      { source: "d", target: "e" },
    ];
    const layout = layoutForceGraph(nodes, edges, 11);
    const position = new Map(layout.map((entry) => [entry.id, entry.position]));
    const dist = (x: string, y: string) =>
      Math.hypot(
        position.get(x)!.x - position.get(y)!.x,
        position.get(y)!.y - position.get(x)!.y,
        position.get(x)!.z - position.get(y)!.z,
      );
    const mean = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    // Directly connected pairs (springs pull them together) are on average
    // closer than disconnected pairs (which only repel).
    const connectedDistances = [
      ["a", "b"],
      ["b", "c"],
      ["c", "d"],
      ["d", "e"],
    ].map(([p, q]) => dist(p, q));
    const disconnectedDistances = [
      ["a", "c"],
      ["a", "d"],
      ["a", "x"],
      ["a", "y"],
      ["e", "x"],
      ["e", "y"],
    ].map(([p, q]) => dist(p, q));
    expect(mean(connectedDistances)).toBeLessThan(mean(disconnectedDistances));
  });

  test("empty graph produces an empty layout", () => {
    expect(layoutForceGraph([], [], 1)).toEqual([]);
  });
});

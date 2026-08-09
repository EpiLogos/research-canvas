import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";
import {
  sceneSchema,
  sceneSequenceSchema,
  type Scene,
  type SceneSequence,
} from "@research-canvas/schema";
import { GazetteerIndex } from "@research-canvas/geography";

import { assembleWalk, walkPathGeometry } from "./walkAssembly";

const gazetteer = GazetteerIndex.loadNdjson(
  readFileSync(
    join(
      process.cwd(),
      "packages/geography/data/gazetteer.sample.ndjson",
    ),
    "utf8",
  ),
);

function scene(over: Partial<Scene>): Scene {
  const { placeFrame: overrideFrame, timeWindow: overrideWindow, ...rest } = over;
  const placeFrame = overrideFrame ?? {
    placeId: "pleiades:520998",
    validAt: { instant: "1452-05-29" },
  };
  const timeWindow = overrideWindow ?? (
    "instant" in placeFrame.validAt
      ? { start: placeFrame.validAt.instant, end: placeFrame.validAt.instant }
      : { start: placeFrame.validAt.start, end: placeFrame.validAt.end }
  );
  return sceneSchema.parse({
    id: rest.id ?? "scene-1",
    profileScope: "migration",
    placeFrame,
    timeWindow,
    people: [],
    passages: [],
    languageVariants: [],
    assembledBy: "agent",
    curationEvents: [],
    nestedSequenceIds: [],
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
    ...rest,
  });
}

function sequence(sceneIds: string[]): SceneSequence {
  return sceneSequenceSchema.parse({
    id: "sequence-journey",
    profileScope: "migration",
    name: "The journey",
    sceneIds,
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
  });
}

describe("assembleWalk", () => {
  test("resolves each scene's place frame through the offline gazetteer", () => {
    const scenes = [
      scene({
        id: "origin",
        placeFrame: { placeId: "wikidata:Q913", validAt: { instant: "1922-09-13" } },
        title: "Leaving Istanbul",
      }),
      scene({
        id: "transit",
        placeFrame: { placeId: "pleiades:893951", validAt: { instant: "1922-09-20" } },
        title: "Passing Babylon",
      }),
    ];

    const stops = assembleWalk(sequence(["origin", "transit"]), scenes, gazetteer);
    expect(stops).toHaveLength(2);
    expect(stops[0]).toMatchObject({
      sceneId: "origin",
      placeId: "wikidata:Q913",
      title: "Leaving Istanbul",
      located: true,
    });
    expect(stops[0].coordinate?.latitude).toBeCloseTo(41.0082, 4);
    expect(stops[1].located).toBe(true);
  });

  test("keeps unlocated stops and never fabricates a point for them", () => {
    const scenes = [
      scene({
        id: "unlocated",
        placeFrame: {
          placeId: "pleiades:540705",
          validAt: { instant: "1000-01-01" },
        },
        title: "Somewhere unlocated",
      }),
    ];
    const stops = assembleWalk(sequence(["unlocated"]), scenes, gazetteer);
    expect(stops[0].located).toBe(false);
    expect(stops[0].coordinate).toBeNull();
    expect(walkPathGeometry(stops)).toEqual([]);
  });

  test("follows the sequence order and skips scenes not yet assembled", () => {
    const scenes = [scene({ id: "b", title: "Second" })];
    const stops = assembleWalk(sequence(["a", "b", "c"]), scenes, gazetteer);
    expect(stops.map((stop) => stop.sceneId)).toEqual(["b"]);
  });
});

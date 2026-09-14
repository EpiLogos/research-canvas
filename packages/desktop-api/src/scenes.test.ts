import { afterEach, describe, expect, it, vi } from "vitest";

import type { Scene, SceneSequence } from "@research-canvas/schema";

import { createBrowserBridgeTransport } from "./index";

function sceneFixture(over: Partial<Scene> = {}): Scene {
  return {
    id: "scene-arrival",
    profileScope: "migration",
    placeFrame: {
      placeId: "pleiades:520998",
      validAt: { instant: "2021-07-14" },
    },
    timeWindow: { start: "2021-07-01", end: "2021-08-01" },
    people: [],
    passages: [
      {
        artifactId: "recording-001",
        unit: { kind: "timestamp_range", startMs: 12000, endMs: 45000 },
      },
    ],
    consents: [],
    redactions: [],
    languageVariants: [],
    title: "Arrival",
    assembledBy: "agent",
    curationEvents: [],
    nestedSequenceIds: [],
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
    ...over,
  };
}

function sequenceFixture(over: Partial<SceneSequence> = {}): SceneSequence {
  return {
    id: "journey-1",
    profileScope: "migration",
    name: "Journey",
    sceneIds: ["scene-arrival"],
    subTimelineId: undefined,
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
    ...over,
  };
}

function stubFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): Array<{ url: string; init?: RequestInit }> {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return handler(input, init);
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scene transport over the browser bridge", () => {
  it("lists scenes with the profile scope query parameter", async () => {
    const calls = stubFetch(async () =>
      new Response(JSON.stringify([sceneFixture()]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const transport = createBrowserBridgeTransport();

    const scenes = await transport.listScenes({
      databasePath: "/tmp/ws.sqlite",
      profileScope: "migration",
    });

    expect(scenes).toHaveLength(1);
    expect(scenes[0].title).toBe("Arrival");
    expect(calls[0].url).toContain("/workspace/scenes?profileScope=migration");
    expect(calls[0].init?.method ?? "GET").toBe("GET");
  });

  it("lists scene sequences with the profile scope query parameter", async () => {
    const calls = stubFetch(async () =>
      new Response(JSON.stringify([sequenceFixture()]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const transport = createBrowserBridgeTransport();

    const sequences = await transport.listSceneSequences({
      databasePath: "/tmp/ws.sqlite",
      profileScope: "migration",
    });

    expect(sequences[0].sceneIds).toEqual(["scene-arrival"]);
    expect(calls[0].url).toContain("/workspace/scene-sequences?profileScope=migration");
  });

  it("upserts a scene with the record in the POST body", async () => {
    const calls = stubFetch(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.id).toBe("scene-arrival");
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const transport = createBrowserBridgeTransport();
    const scene = sceneFixture();

    const saved = await transport.upsertScene({
      databasePath: "/tmp/ws.sqlite",
      scene,
    });

    expect(saved.id).toBe("scene-arrival");
    expect(calls[0].url).toBe("http://127.0.0.1:4789/workspace/scenes");
    expect(calls[0].init?.method).toBe("POST");
  });

  it("upserts a scene sequence with the record in the POST body", async () => {
    const calls = stubFetch(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.sceneIds).toEqual(["scene-arrival"]);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const transport = createBrowserBridgeTransport();

    const saved = await transport.upsertSceneSequence({
      databasePath: "/tmp/ws.sqlite",
      sequence: sequenceFixture(),
    });

    expect(saved.name).toBe("Journey");
    expect(calls[0].url).toBe("http://127.0.0.1:4789/workspace/scene-sequences");
    expect(calls[0].init?.method).toBe("POST");
  });

  it("deletes a scene and a sequence through their collection routes", async () => {
    const calls = stubFetch(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const transport = createBrowserBridgeTransport();

    await transport.deleteScene({ databasePath: "/tmp/ws.sqlite", id: "scene-arrival" });
    await transport.deleteSceneSequence({
      databasePath: "/tmp/ws.sqlite",
      id: "journey-1",
    });

    expect(calls[0].url).toBe("http://127.0.0.1:4789/workspace/scenes/scene-arrival");
    expect(calls[0].init?.method).toBe("DELETE");
    expect(calls[1].url).toBe(
      "http://127.0.0.1:4789/workspace/scene-sequences/journey-1",
    );
    expect(calls[1].init?.method).toBe("DELETE");
  });
});

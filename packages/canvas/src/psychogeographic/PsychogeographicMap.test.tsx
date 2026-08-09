import { describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createLiveServicePolicy } from "@research-canvas/geography";

import type { WalkStop } from "../scenes/walkAssembly";
import { PsychogeographicMap } from "./PsychogeographicMap";
import type { MapSurfaceRenderer } from "./renderer";

const stops: WalkStop[] = [
  {
    sceneId: "origin",
    placeId: "wikidata:Q913",
    validAt: "1922-09-13",
    title: "Leaving Istanbul",
    coordinate: { latitude: 41.0082, longitude: 28.9784 },
    gazetteerEntry: null,
    located: true,
  },
  {
    sceneId: "destination",
    placeId: "pleiades:422665",
    validAt: "1922-10-01",
    title: "Florence",
    coordinate: { latitude: 43.7714, longitude: 11.254 },
    gazetteerEntry: null,
    located: true,
  },
];

function recordingRenderer(): MapSurfaceRenderer & {
  calls: { create: number; drawWalk: number; setLiveTileSource: number };
} {
  const calls = { create: 0, drawWalk: 0, setLiveTileSource: 0 };
  return {
    calls,
    async create() {
      calls.create += 1;
    },
    async drawWalk() {
      calls.drawWalk += 1;
    },
    async setLiveTileSource() {
      calls.setLiveTileSource += 1;
    },
    async centerOn() {},
    destroy() {},
  };
}

describe("PsychogeographicMap", () => {
  test("mounts an offline map and draws the walk through the renderer port", async () => {
    const renderer = recordingRenderer();
    render(
      <PsychogeographicMap
        walkId="walk-1"
        stops={stops}
        tileSource={{ kind: "geojson", url: "assets/map/places.geojson", attribution: "Pleiades CC BY" }}
        policy={createLiveServicePolicy()}
        renderer={renderer}
      />,
    );

    expect(screen.getByTestId("psychogeographic-map")).toBeInTheDocument();
    expect(screen.getByTestId("psychogeographic-connection")).toHaveTextContent(
      "Offline",
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(renderer.calls.create).toBe(1);
    expect(renderer.calls.drawWalk).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("psychogeographic-stop-origin")).toHaveTextContent(
      "Leaving Istanbul",
    );
  });

  test("live tile refresh stays gated until the user opts in, then shows the active indicator", async () => {
    const renderer = recordingRenderer();
    const policy = createLiveServicePolicy();
    render(
      <PsychogeographicMap
        walkId="walk-1"
        stops={stops}
        tileSource={{ kind: "geojson", url: "assets/map/places.geojson", attribution: "Pleiades CC BY" }}
        policy={policy}
        renderer={renderer}
      />,
    );

    fireEvent.click(screen.getByTestId("psychogeographic-opt-in-live"));
    expect(policy.isOptedIn("tile_refresh")).toBe(true);
    expect(screen.getByTestId("psychogeographic-connection")).toHaveTextContent(
      "Live services opted in",
    );

    fireEvent.click(screen.getByTestId("psychogeographic-refresh-tiles"));
    expect(policy.state()).toBe("active");
    expect(policy.activeReason()).toContain("basemap tiles");
    expect(screen.getByTestId("psychogeographic-connection")).toHaveTextContent(
      "Live:",
    );
    expect(renderer.calls.setLiveTileSource).toBe(1);
  });

  test("opt-in survives without mutating the offline default when denied", () => {
    const policy = createLiveServicePolicy();
    expect(
      policy.requestLiveAction("tile_refresh", "refresh live basemap tiles"),
    ).toBe("denied");
    expect(policy.state()).toBe("offline");
  });
});

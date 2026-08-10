import { describe, expect, test } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createLiveServicePolicy } from "@research-canvas/geography";
import type { GeographyEdge } from "@research-canvas/schema";

import type { WalkStop } from "../scenes/walkAssembly";
import { PsychogeographicMap } from "./PsychogeographicMap";
import type { MapSurfaceRenderer } from "./renderer";

const vocLane: GeographyEdge = {
  id: "geo:voc",
  profileScope: "bootstrapping",
  mode: "shipping",
  sourcePlaceId: "root-archetypal-field:place-amsterdam",
  targetPlaceId: "root-archetypal-field:place-banda-islands",
  label: "VOC shipping lane Amsterdam → Banda",
  timeWindow: { start: "1602-03-20", end: "1621-05-08" },
  geometry: {
    type: "LineString",
    coordinates: [
      [4.8936, 52.3728],
      [129.9, -4.55],
    ],
  },
  provenance: {
    sourceRefs: [
      {
        artifactId: "antichrist-vault/episodes/2/Research/Report8.md",
        unit: { kind: "text_span", startOffset: 100, endOffset: 200 },
      },
    ],
  },
  seedKey: "voc:amsterdam-to-banda",
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
};

const rhodesLane: GeographyEdge = {
  ...vocLane,
  id: "geo:rhodes",
  mode: "overland",
  sourcePlaceId: "root-archetypal-field:place-oxford",
  targetPlaceId: "root-archetypal-field:place-kimberley",
  label: "Rhodes's Oxford ↔ Kimberley shuttle",
  timeWindow: { start: "1873-10-13", end: "1881-01-01" },
  seedKey: "rhodes:oxford-to-kimberley",
};

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
  calls: {
    create: number;
    drawWalk: number;
    drawLanes: number;
    setLiveTileSource: number;
  };
  drawLanesArgs: GeographyEdge[][];
} {
  const calls = { create: 0, drawWalk: 0, drawLanes: 0, setLiveTileSource: 0 };
  const drawLanesArgs: GeographyEdge[][] = [];
  return {
    calls,
    drawLanesArgs,
    async create() {
      calls.create += 1;
    },
    async drawWalk() {
      calls.drawWalk += 1;
    },
    async drawLanes(edges: GeographyEdge[]) {
      calls.drawLanes += 1;
      drawLanesArgs.push(edges);
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

  test("draws movement lanes through the renderer port and shows the lane list", async () => {
    const renderer = recordingRenderer();
    render(
      <PsychogeographicMap
        walkId="walk-1"
        stops={stops}
        lanes={[vocLane, rhodesLane]}
        tileSource={{ kind: "geojson", url: "assets/map/places.geojson", attribution: "Pleiades CC BY" }}
        policy={createLiveServicePolicy()}
        renderer={renderer}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(renderer.calls.drawLanes).toBeGreaterThanOrEqual(1);
    const lastDraw = renderer.drawLanesArgs.at(-1) ?? [];
    expect(lastDraw.map((edge) => edge.seedKey)).toEqual([
      "voc:amsterdam-to-banda",
      "rhodes:oxford-to-kimberley",
    ]);
    expect(
      screen.getByTestId("geography-lane-voc:amsterdam-to-banda"),
    ).toHaveTextContent("VOC shipping lane Amsterdam → Banda");
  });

  test("temporal lane filter hides lanes inactive in the selected year", async () => {
    const renderer = recordingRenderer();
    render(
      <PsychogeographicMap
        walkId="walk-1"
        stops={stops}
        lanes={[vocLane, rhodesLane]}
        tileSource={{ kind: "geojson", url: "assets/map/places.geojson", attribution: "Pleiades CC BY" }}
        policy={createLiveServicePolicy()}
        renderer={renderer}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    const filter = screen.getByTestId("lane-year-filter") as HTMLInputElement;
    expect(filter.min).toBe("1602");
    expect(filter.max).toBe("1881");

    // Move to 1620: the VOC lane is active, Rhodes (1873) is not.
    fireEvent.change(filter, { target: { value: "1620" } });
    expect(
      screen.getByTestId("geography-lane-voc:amsterdam-to-banda"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("geography-lane-rhodes:oxford-to-kimberley"),
    ).not.toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    const lastDraw = renderer.drawLanesArgs.at(-1) ?? [];
    expect(lastDraw.map((edge) => edge.seedKey)).toEqual(["voc:amsterdam-to-banda"]);

    // Clearing the filter restores every lane.
    fireEvent.click(screen.getByTestId("lane-year-clear"));
    expect(
      screen.getByTestId("geography-lane-rhodes:oxford-to-kimberley"),
    ).toBeInTheDocument();
  });

  test("clicking a lane opens its provenance panel with real passage refs", async () => {
    const renderer = recordingRenderer();
    render(
      <PsychogeographicMap
        walkId="walk-1"
        stops={stops}
        lanes={[vocLane]}
        tileSource={{ kind: "geojson", url: "assets/map/places.geojson", attribution: "Pleiades CC BY" }}
        policy={createLiveServicePolicy()}
        renderer={renderer}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByTestId("geography-lane-voc:amsterdam-to-banda"));
    const provenance = screen.getByTestId("lane-provenance");
    expect(provenance).toHaveTextContent("VOC shipping lane Amsterdam → Banda");
    expect(provenance).toHaveTextContent("shipping");
    expect(provenance).toHaveTextContent("Report8.md");
    expect(provenance).toHaveTextContent("chars 100–200");
  });
});

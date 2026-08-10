import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import type {
  MapSurfaceRenderer,
} from "@research-canvas/canvas";
import type { GeographyEdge, TimelineView, WorkspaceTransport } from "@research-canvas/desktop-api";
import type { Scene, SceneSequence } from "@research-canvas/schema";

import { PsychogeographicLens } from "./PsychogeographicLens";
import { timelineView } from "./walkFixture";

function emptyTimelineView(): TimelineView {
  return { workspaceId: "sqlite:/tmp/ws", lanes: [], diagnostics: [], relationships: [], nodes: [] };
}

function makeRenderer(): {
  renderer: MapSurfaceRenderer;
  drawWalk: ReturnType<typeof vi.fn>;
  drawLanes: ReturnType<typeof vi.fn>;
} {
  const drawWalk = vi.fn(async () => {});
  const drawLanes = vi.fn(async () => {});
  return {
    renderer: {
    create: vi.fn(async () => {}),
    drawWalk,
    drawLanes,
    setLiveTileSource: vi.fn(async () => {}),
    centerOn: vi.fn(async () => {}),
    destroy: vi.fn(),
    } as unknown as MapSurfaceRenderer,
    drawWalk,
    drawLanes,
  };
}

function makeTransport(
  view: TimelineView,
  lanes: GeographyEdge[] = [],
): WorkspaceTransport {
  const savedScenes: Scene[] = [];
  const savedSequences: SceneSequence[] = [];
  return {
    async loadTimelineView() {
      return view;
    },
    async listScenes() {
      return savedScenes;
    },
    async listSceneSequences() {
      return savedSequences;
    },
    async upsertScene({ scene }: { scene: Scene }) {
      savedScenes.push(scene);
      return scene;
    },
    async upsertSceneSequence({ sequence }: { sequence: SceneSequence }) {
      savedSequences.push(sequence);
      return sequence;
    },
    async listGeographyEdges() {
      return lanes;
    },
    async listStreetViewImages() {
      return [
        {
          id: "img-1",
          profileScope: "bootstrapping",
          artifactPath: "media/crossing.png",
          capturedAt: "2021-07-14T10:00:00Z",
          latitude: 50.0875,
          longitude: 14.4214,
          headingDegrees: 120,
          redactionStatus: "pending",
          redactionRegions: [],
          redactedArtifactPath: null,
          createdAt: "2026-08-08T10:00:00.000Z",
          updatedAt: "2026-08-08T10:00:00.000Z",
        },
      ];
    },
  } as unknown as WorkspaceTransport;
}

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

describe("PsychogeographicLens", () => {
  test("assembles the walk from the graph and renders the map with located stops", async () => {
    const { renderer, drawWalk } = makeRenderer();
    render(
      <PsychogeographicLens
        transport={makeTransport(timelineView())}
        databasePath="/tmp/ws.sqlite"
        workspaceId="sqlite:/tmp/ws"
        profileScope="bootstrapping"
        renderer={renderer}
      />,
    );

    await waitFor(() => {
      expect(drawWalk).toHaveBeenCalled();
    });
    const walkCall = drawWalk.mock.calls.at(-1) as [string, unknown];
    const stops = walkCall[1] as Array<{ located: boolean; placeId: string }>;
    expect(stops).toHaveLength(4);
    expect(stops.some((stop) => stop.placeId === "wikidata:Q1085" && stop.located)).toBe(true);
    expect(screen.getByTestId("psychogeographic-map")).toBeInTheDocument();
    expect(await screen.findByTestId("street-view-surface")).toBeInTheDocument();
  });

  test("passes persisted movement lanes to the map surface", async () => {
    const { renderer, drawLanes } = makeRenderer();
    render(
      <PsychogeographicLens
        transport={makeTransport(timelineView(), [vocLane])}
        databasePath="/tmp/ws.sqlite"
        workspaceId="sqlite:/tmp/ws"
        profileScope="bootstrapping"
        renderer={renderer}
      />,
    );

    await waitFor(() => {
      expect(drawLanes).toHaveBeenCalled();
    });
    const laneCall = drawLanes.mock.calls.at(-1) as [unknown];
    const drawn = laneCall[0] as GeographyEdge[];
    expect(drawn.map((edge) => edge.seedKey)).toEqual(["voc:amsterdam-to-banda"]);
    expect(
      await screen.findByTestId("geography-lane-voc:amsterdam-to-banda"),
    ).toBeInTheDocument();
  });

  test("empty graphs show the walk-empty state instead of failing", async () => {
    const { renderer, drawWalk } = makeRenderer();
    render(
      <PsychogeographicLens
        transport={makeTransport(emptyTimelineView())}
        databasePath="/tmp/ws.sqlite"
        workspaceId="sqlite:/tmp/ws"
        profileScope="bootstrapping"
        renderer={renderer}
      />,
    );

    expect(await screen.findByTestId("psychogeographic-empty")).toBeInTheDocument();
    expect(drawWalk).not.toHaveBeenCalled();
  });
});

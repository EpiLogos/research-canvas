import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import type {
  MapSurfaceRenderer,
  PlaceRenderMarker,
} from "@research-canvas/canvas";
import type { PlacesRepository, LocatedGraphNode } from "@research-canvas/domain";
import type { GeographyEdge, WorkspaceServices } from "@research-canvas/desktop-api";

import { PsychogeographicLens } from "./PsychogeographicLens";

const florence = locatedNode("place:florence", "Florence", 43.7714, 11.254);
const istanbul = locatedNode("place:istanbul", "İstanbul", 41.0082, 28.9784);

const vocLane: GeographyEdge = {
  id: "geo:voc",
  profileScope: "bootstrapping",
  mode: "shipping",
  sourcePlaceId: istanbul.graphNodeId,
  targetPlaceId: florence.graphNodeId,
  label: "Mediterranean shipping lane",
  timeWindow: { start: "1602-03-20", end: "1621-05-08" },
  geometry: { type: "LineString", coordinates: [[28.9784, 41.0082], [11.254, 43.7714]] },
  provenance: { sourceRefs: [] },
  seedKey: "voc:mediterranean",
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
};

function makeTransport(): WorkspaceServices {
  return {
    async listStreetViewImages() {
      return [{
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
      }];
    },
  } as unknown as WorkspaceServices;
}

function makeRepository(nodes: LocatedGraphNode[] = [florence, istanbul], lanes: GeographyEdge[] = [vocLane]): PlacesRepository {
  return {
    getLocatedNodes: vi.fn(async () => nodes),
    getGeographyEdges: vi.fn(async () => lanes),
    getArchetypeExpressionsForPlace: vi.fn(async () => []),
    getRelatedNodesForPlace: vi.fn(async () => []),
  };
}

function makeRenderer(): {
  renderer: MapSurfaceRenderer;
  drawPlaces: ReturnType<typeof vi.fn>;
  drawLanes: ReturnType<typeof vi.fn>;
} {
  const drawPlaces = vi.fn(async (_places: PlaceRenderMarker[]) => {});
  const drawLanes = vi.fn(async (_lanes: GeographyEdge[]) => {});
  return {
    renderer: {
      create: vi.fn(async () => {}),
      drawWalk: vi.fn(async () => {}),
      drawPlaces,
      drawLanes,
      setLiveTileSource: vi.fn(async () => {}),
      centerOn: vi.fn(async () => {}),
      flyTo: vi.fn(async () => {}),
      fitToPlaces: vi.fn(async () => {}),
      setProjection: vi.fn(async () => {}),
      setPlaceClickHandler: vi.fn(),
      setPlaceDoubleClickHandler: vi.fn(),
      setLaneClickHandler: vi.fn(),
      onViewChange: vi.fn(),
      destroy: vi.fn(),
    },
    drawPlaces,
    drawLanes,
  };
}

describe("PsychogeographicLens", () => {
  test("renders project-wide located nodes without assembling a walk", async () => {
    const repository = makeRepository();
    const { renderer, drawPlaces } = makeRenderer();
    render(
      <PsychogeographicLens
        transport={makeTransport()}
        projectId="project:one"
        databasePath="/tmp/ws.sqlite"
        workspaceId="sqlite:/tmp/ws"
        profileScope="bootstrapping"
        renderer={renderer}
        placesRepository={repository}
      />,
    );

    await waitFor(() => {
      const places = drawPlaces.mock.calls.at(-1)?.[0] as PlaceRenderMarker[] | undefined;
      expect(places?.map((place) => place.graphNodeId)).toEqual([
        florence.graphNodeId,
        istanbul.graphNodeId,
      ]);
    });
    expect(repository.getLocatedNodes).toHaveBeenCalledWith("project:one");
    expect(screen.getByTestId("places-globe")).toBeInTheDocument();
    expect(await screen.findByTestId("street-view-surface")).toBeInTheDocument();
  });

  test("passes durable project movement lanes to the globe renderer", async () => {
    const { renderer, drawLanes } = makeRenderer();
    render(
      <PsychogeographicLens
        transport={makeTransport()}
        projectId="project:one"
        databasePath="/tmp/ws.sqlite"
        workspaceId="sqlite:/tmp/ws"
        profileScope="bootstrapping"
        renderer={renderer}
        placesRepository={makeRepository()}
      />,
    );

    await waitFor(() => {
      const lanes = drawLanes.mock.calls.at(-1)?.[0] as GeographyEdge[] | undefined;
      expect(lanes?.map((edge) => edge.seedKey)).toEqual(["voc:mediterranean"]);
    });
    expect(await screen.findByTestId("geography-lane-voc:mediterranean")).toBeInTheDocument();
  });

  test("an empty project shows the canonical Places empty state, not a walk error", async () => {
    const { renderer, drawPlaces } = makeRenderer();
    render(
      <PsychogeographicLens
        transport={makeTransport()}
        projectId="project:empty"
        databasePath="/tmp/ws.sqlite"
        workspaceId="sqlite:/tmp/ws"
        profileScope="bootstrapping"
        renderer={renderer}
        placesRepository={makeRepository([], [])}
      />,
    );

    expect(await screen.findByTestId("psychogeographic-empty")).toHaveTextContent(
      "No canonical Place projections",
    );
    await waitFor(() => expect(drawPlaces).toHaveBeenCalled());
    expect(drawPlaces.mock.calls.at(-1)?.[0]).toEqual([]);
  });
});

function locatedNode(
  graphNodeId: string,
  title: string,
  latitude: number,
  longitude: number,
): LocatedGraphNode {
  return {
    graphNodeId,
    entityType: "Place",
    isArchetype: false,
    title,
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    evidenceTags: [],
    sourceKind: null,
    contentOrigin: "seed",
    contentRevision: 1,
    seedSchemaVersion: 1,
    bodySourceCoordinates: [],
    historicity: null,
    claimKind: null,
    evidenceStatus: null,
    temporalRole: null,
    placeCoverage: "resolved",
    place: {
      graphNodeId,
      names: [{ language: "en", name: title }],
      coordinate: { precision: "exact", latitude, longitude },
      hierarchy: [],
      externalRefs: [],
      provenance: { sourceRefs: [] },
    },
    qlForm: null,
    qlUnitId: null,
    qlArc: null,
    qlTopology: null,
    qlSchemaVersion: null,
    qlSourceCoordinates: [],
    qlCompletenessStatus: null,
    isTemporal: false,
    validFrom: null,
    validTo: null,
    temporalPrecision: null,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
  };
}

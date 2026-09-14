import { describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createLiveServicePolicy } from "@research-canvas/geography";
import type { LocatedGraphNode, PlacesRepository } from "@research-canvas/domain";
import type { ArchetypalExpression, GeographyEdge, GraphNodeContract } from "@research-canvas/schema";

import { PsychogeographicMap } from "./PsychogeographicMap";
import type {
  ArchetypeExpressionRenderMarker,
  MapSurfaceRenderer,
  PlaceRenderMarker,
} from "./renderer";

const florence = locatedNode("place:florence", "Florence", 43.7714, 11.254);
const istanbul = locatedNode("place:istanbul", "İstanbul", 41.0082, 28.9784);
const relatedArchetype = graphNode("archetype:threshold", "Threshold", "Archetype");
const expression: ArchetypalExpression = {
  id: "expression:threshold-florence",
  archetypeGraphNodeId: relatedArchetype.graphNodeId,
  placeGraphNodeId: florence.graphNodeId,
  timeWindow: { start: "1500", end: "1700", precision: "century" },
  expressionKind: "visual",
  sourceCoordinates: ["source:threshold"],
};

const vocLane: GeographyEdge = {
  id: "geo:voc",
  profileScope: "bootstrapping",
  mode: "shipping",
  sourcePlaceId: "place:istanbul",
  targetPlaceId: "place:florence",
  label: "Mediterranean shipping lane",
  timeWindow: { start: "1602-03-20", end: "1621-05-08" },
  geometry: {
    type: "LineString",
    coordinates: [[28.9784, 41.0082], [11.254, 43.7714]],
  },
  provenance: {
    sourceRefs: [{ artifactId: "Research/Report8.md", unit: { kind: "text_span", startOffset: 100, endOffset: 200 } }],
  },
  seedKey: "voc:mediterranean",
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
};

const laterLane: GeographyEdge = {
  ...vocLane,
  id: "geo:later",
  label: "Later test lane",
  timeWindow: { start: "1800-01-01", end: "1801-12-31" },
  seedKey: "later:test",
};

function repository(geographyEdges: GeographyEdge[] = [vocLane]): PlacesRepository {
  return {
    async getLocatedNodes() { return [florence, istanbul]; },
    async getGeographyEdges() { return geographyEdges; },
    async getArchetypeExpressionsForPlace(_projectId, placeGraphNodeId) {
      return placeGraphNodeId === florence.graphNodeId ? [expression] : [];
    },
    async getRelatedNodesForPlace(_projectId, placeGraphNodeId) {
      return placeGraphNodeId === florence.graphNodeId ? [relatedArchetype] : [];
    },
  };
}

type RecordingRenderer = MapSurfaceRenderer & {
  placeCalls: Array<{ places: PlaceRenderMarker[]; expressions: ArchetypeExpressionRenderMarker[] }>;
  laneCalls: GeographyEdge[][];
  tileSources: unknown[];
  placeClick: ((id: string) => void) | null;
  placeDoubleClick: ((id: string) => void) | null;
  projections: string[];
};

function recordingRenderer(options: { failLive?: boolean } = {}): RecordingRenderer {
  const renderer: RecordingRenderer = {
    placeCalls: [],
    laneCalls: [],
    tileSources: [],
    placeClick: null,
    placeDoubleClick: null,
    projections: [],
    async create() {},
    async drawWalk() {},
    async drawPlaces(places, expressions) { renderer.placeCalls.push({ places, expressions }); },
    async drawLanes(edges) { renderer.laneCalls.push(edges); },
    async setLiveTileSource(source) {
      renderer.tileSources.push(source);
      if (options.failLive && (source as { kind?: string }).kind === "raster") throw new Error("offline");
    },
    async centerOn() {},
    async flyTo() {},
    async fitToPlaces() {},
    async setProjection(projection) { renderer.projections.push(projection); },
    setPlaceClickHandler(handler) { renderer.placeClick = handler; },
    setPlaceDoubleClickHandler(handler) { renderer.placeDoubleClick = handler; },
    setLaneClickHandler() {},
    onViewChange() {},
    destroy() {},
  };
  return renderer;
}

const offlineTileSource = {
  kind: "geojson" as const,
  url: "assets/map/places.geojson",
  attribution: "Natural Earth",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function expectPlaces(renderer: RecordingRenderer, ids: string[]) {
  await waitFor(() => expect(renderer.placeCalls.at(-1)?.places.map((place) => place.graphNodeId)).toEqual(ids));
}

describe("PsychogeographicMap", () => {
  test("queries the project repository and draws all located + archetypal markers", async () => {
    const renderer = recordingRenderer();
    render(
      <PsychogeographicMap
        repository={repository()}
        projectId="project:one"
        tileSource={offlineTileSource}
        policy={createLiveServicePolicy()}
        renderer={renderer}
      />,
    );

    await waitFor(() => {
      const last = renderer.placeCalls.at(-1);
      expect(last?.places.map((marker) => marker.graphNodeId)).toEqual([
        florence.graphNodeId,
        istanbul.graphNodeId,
      ]);
      expect(last?.expressions.map((marker) => marker.expressionId)).toEqual([expression.id]);
    });
    expect(screen.getByTestId("places-globe")).toBeInTheDocument();
    expect(screen.getByTestId("places-connection-status")).toHaveTextContent("Offline");
  });

  test("geography arriving before style readiness is drawn once ready, never erased by the startup snapshot", async () => {
    const startup = deferred<void>();
    const renderer = recordingRenderer();
    renderer.create = vi.fn(() => startup.promise);
    render(
      <PsychogeographicMap repository={repository()} projectId="project:one"
        tileSource={offlineTileSource} policy={createLiveServicePolicy()} renderer={renderer} />,
    );
    await screen.findByTestId("geography-lane-voc:mediterranean");
    expect(screen.getByTestId("places-globe")).toHaveAttribute("data-ready", "false");
    expect(renderer.placeCalls).toEqual([]);
    expect(renderer.laneCalls).toEqual([]);

    await act(async () => startup.resolve(undefined));
    await expectPlaces(renderer, [florence.graphNodeId, istanbul.graphNodeId]);
    expect(renderer.placeCalls.at(-1)?.expressions).toHaveLength(1);
    expect(renderer.laneCalls.at(-1)).toEqual([vocLane]);
    expect(renderer.create).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("psychogeographic-error")).not.toBeInTheDocument();
  });

  test("geography arriving after style readiness updates the same renderer", async () => {
    const data = deferred<LocatedGraphNode[]>();
    const repo = repository();
    repo.getLocatedNodes = () => data.promise;
    const renderer = recordingRenderer();
    renderer.create = vi.fn(async () => {});
    render(
      <PsychogeographicMap repository={repo} projectId="project:one"
        tileSource={offlineTileSource} policy={createLiveServicePolicy()} renderer={renderer} />,
    );
    await waitFor(() => expect(screen.getByTestId("places-globe")).toHaveAttribute("data-ready", "true"));
    await expectPlaces(renderer, []);
    await act(async () => data.resolve([florence, istanbul]));
    await expectPlaces(renderer, [florence.graphNodeId, istanbul.graphNodeId]);
    expect(renderer.create).toHaveBeenCalledTimes(1);
  });

  test("refresh re-queries geography and rejects an older in-flight response without resetting the camera", async () => {
    const oldData = deferred<LocatedGraphNode[]>();
    const repo = repository();
    repo.getLocatedNodes = vi.fn()
      .mockImplementationOnce(() => oldData.promise)
      .mockResolvedValueOnce([florence]);
    const renderer = recordingRenderer();
    renderer.create = vi.fn(async () => {});
    renderer.flyTo = vi.fn(async () => {});
    const props = {
      repository: repo, projectId: "project:one", tileSource: offlineTileSource,
      policy: createLiveServicePolicy(), renderer,
      initialViewState: { latitude: 43, longitude: 11, zoom: 3 },
    };
    const { rerender } = render(<PsychogeographicMap {...props} refreshVersion={0} />);
    await waitFor(() => expect(screen.getByTestId("places-globe")).toHaveAttribute("data-ready", "true"));
    rerender(<PsychogeographicMap {...props} refreshVersion={1} />);
    await expectPlaces(renderer, [florence.graphNodeId]);
    await act(async () => oldData.resolve([istanbul]));
    await expectPlaces(renderer, [florence.graphNodeId]);
    expect(repo.getLocatedNodes).toHaveBeenCalledTimes(2);
    expect(renderer.create).toHaveBeenCalledTimes(1);
    expect(renderer.flyTo).toHaveBeenCalledExactlyOnceWith(43, 11, 3);
  });

  test("a renderer finishing after unmount cannot publish handlers or redraw", async () => {
    const startup = deferred<void>();
    const renderer = recordingRenderer();
    renderer.create = () => startup.promise;
    renderer.destroy = vi.fn();
    const { unmount } = render(
      <PsychogeographicMap repository={repository()} projectId="project:one"
        tileSource={offlineTileSource} policy={createLiveServicePolicy()} renderer={renderer} />,
    );
    await screen.findByTestId("geography-lane-voc:mediterranean");
    unmount();
    await act(async () => startup.resolve(undefined));
    expect(renderer.destroy).toHaveBeenCalledTimes(1);
    expect(renderer.placeClick).toBeNull();
    expect(renderer.placeCalls).toEqual([]);
    expect(renderer.laneCalls).toEqual([]);
  });

  test("renderer initialization failure is visible rather than an unhandled rejection", async () => {
    const renderer = recordingRenderer();
    renderer.create = async () => { throw new Error("style unavailable"); };
    render(
      <PsychogeographicMap repository={repository()} projectId="project:one"
        tileSource={offlineTileSource} policy={createLiveServicePolicy()} renderer={renderer} />,
    );
    expect(await screen.findByTestId("psychogeographic-error")).toHaveTextContent("style unavailable");
    expect(renderer.placeCalls).toEqual([]);
    expect(screen.getByTestId("places-flat-toggle")).toBeDisabled();
  });

  test("marker click opens a location panel with relation and archetype context", async () => {
    const renderer = recordingRenderer();
    render(
      <PsychogeographicMap
        repository={repository()}
        projectId="project:one"
        tileSource={offlineTileSource}
        policy={createLiveServicePolicy()}
        renderer={renderer}
      />,
    );
    await expectPlaces(renderer, [florence.graphNodeId, istanbul.graphNodeId]);

    act(() => renderer.placeClick?.(florence.graphNodeId));
    const panel = await screen.findByTestId("places-location-panel");
    expect(panel).toHaveTextContent("Florence");
    expect(panel).toHaveTextContent("43.77140, 11.25400");
    expect(screen.getByTestId("place-precision")).toHaveTextContent("exact");
    expect(screen.queryByTestId("place-height")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("place-related-nodes")).toHaveTextContent("Threshold"));
    expect(screen.getByTestId("place-archetype-expressions")).toHaveTextContent("visual");
  });

  test("double-click delegates opening the selected graph node in Canvas", async () => {
    const renderer = recordingRenderer();
    const openCanvasNode = vi.fn();
    render(
      <PsychogeographicMap
        repository={repository()}
        projectId="project:one"
        tileSource={offlineTileSource}
        policy={createLiveServicePolicy()}
        renderer={renderer}
        onOpenCanvasNode={openCanvasNode}
      />,
    );
    await expectPlaces(renderer, [florence.graphNodeId, istanbul.graphNodeId]);
    await act(async () => renderer.placeDoubleClick?.(istanbul.graphNodeId));
    expect(openCanvasNode).toHaveBeenCalledWith(istanbul.graphNodeId);
  });

  test("toolbar switches globe/flat projection and redraws durable overlays", async () => {
    const renderer = recordingRenderer();
    render(
      <PsychogeographicMap
        repository={repository()}
        projectId="project:one"
        tileSource={offlineTileSource}
        policy={createLiveServicePolicy()}
        renderer={renderer}
      />,
    );
    await expectPlaces(renderer, [florence.graphNodeId, istanbul.graphNodeId]);
    const beforeFlatPlaces = renderer.placeCalls.length;
    const beforeFlatLanes = renderer.laneCalls.length;
    fireEvent.click(screen.getByTestId("places-flat-toggle"));
    expect(screen.getByTestId("places-flat-map")).toBeInTheDocument();
    expect(renderer.projections.at(-1)).toBe("flat");
    await waitFor(() => expect(renderer.placeCalls.length).toBeGreaterThan(beforeFlatPlaces));
    await waitFor(() => expect(renderer.laneCalls.length).toBeGreaterThan(beforeFlatLanes));

    const beforeGlobePlaces = renderer.placeCalls.length;
    const beforeGlobeLanes = renderer.laneCalls.length;
    fireEvent.click(screen.getByTestId("places-globe-toggle"));
    expect(screen.getByTestId("places-globe")).toBeInTheDocument();
    expect(renderer.projections.at(-1)).toBe("globe");
    await waitFor(() => expect(renderer.placeCalls.length).toBeGreaterThan(beforeGlobePlaces));
    await waitFor(() => expect(renderer.laneCalls.length).toBeGreaterThan(beforeGlobeLanes));
    expect(screen.getByTestId("places-zoom-fit")).toBeEnabled();
  });

  test("live tile opt-in reports live success and explicit offline fallback", async () => {
    const liveRenderer = recordingRenderer();
    const livePolicy = createLiveServicePolicy();
    const { unmount } = render(
      <PsychogeographicMap
        repository={repository()}
        projectId="project:one"
        tileSource={offlineTileSource}
        policy={livePolicy}
        renderer={liveRenderer}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("places-globe")).toHaveAttribute("data-ready", "true"));
    fireEvent.click(screen.getByTestId("psychogeographic-opt-in-live"));
    fireEvent.click(screen.getByTestId("psychogeographic-refresh-tiles"));
    await waitFor(() => expect(screen.getByTestId("places-connection-status")).toHaveTextContent("Live tiles"));
    expect(liveRenderer.tileSources.at(-1)).toMatchObject({ kind: "raster" });
    unmount();

    const fallbackRenderer = recordingRenderer({ failLive: true });
    const fallbackPolicy = createLiveServicePolicy();
    render(
      <PsychogeographicMap
        repository={repository()}
        projectId="project:one"
        tileSource={offlineTileSource}
        policy={fallbackPolicy}
        renderer={fallbackRenderer}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("places-globe")).toHaveAttribute("data-ready", "true"));
    fireEvent.click(screen.getByTestId("psychogeographic-opt-in-live"));
    fireEvent.click(screen.getByTestId("psychogeographic-refresh-tiles"));
    await waitFor(() => expect(screen.getByTestId("places-connection-status")).toHaveTextContent("offline fallback"));
    expect(fallbackRenderer.tileSources.at(-1)).toMatchObject({ kind: "geojson" });
  });

  test("movement lane year filtering still drives the renderer and provenance panel", async () => {
    const renderer = recordingRenderer();
    render(
      <PsychogeographicMap
        repository={repository([vocLane, laterLane])}
        projectId="project:one"
        tileSource={offlineTileSource}
        policy={createLiveServicePolicy()}
        renderer={renderer}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("geography-lane-voc:mediterranean")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("geography-lane-voc:mediterranean"));
    expect(screen.getByTestId("lane-provenance")).toHaveTextContent("Report8.md");
    fireEvent.change(screen.getByTestId("lane-year-filter"), { target: { value: "1700" } });
    await waitFor(() => expect(screen.queryByTestId("geography-lane-voc:mediterranean")).not.toBeInTheDocument());
    await waitFor(() => expect(renderer.laneCalls.at(-1)).toEqual([]));
  });
});

function locatedNode(
  graphNodeId: string,
  title: string,
  latitude: number,
  longitude: number,
): LocatedGraphNode {
  return {
    ...graphNode(graphNodeId, title, "Place"),
    placeCoverage: "resolved",
    place: {
      graphNodeId,
      names: [{ language: "en", name: title }],
      coordinate: { precision: "exact", latitude, longitude },
      hierarchy: [],
      externalRefs: [],
      provenance: { sourceRefs: [] },
    },
  };
}

function graphNode(
  graphNodeId: string,
  title: string,
  entityType: GraphNodeContract["entityType"],
): GraphNodeContract {
  return {
    graphNodeId,
    entityType,
    isArchetype: entityType === "Archetype",
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
    placeCoverage: null,
    place: null,
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

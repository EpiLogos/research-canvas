import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PalaceCuration } from "@research-canvas/canvas";
import type {
  GraphNode,
  GraphRelationship,
  TimelineView,
  WorkspaceServices,
} from "@research-canvas/desktop-api";
import type { Scene } from "@research-canvas/schema";

import { usePipelineStages } from "./usePipelineStages";

const NS = "root-archetypal-field";
const bandGenocide = `${NS}:banda-genocide`;
const placeBanda = `${NS}:place-banda-islands`;
const bullOx = `${NS}:bull-ox`;

function makeGraphNode(
  id: string,
  title: string,
  entityType: string,
  opts: Partial<GraphNode> = {},
): GraphNode {
  return {
    graphNodeId: id,
    entityType: entityType as GraphNode["entityType"],
    title,
    body: "",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    evidenceTags: [],
    sourceKind: null,
    contentOrigin: null,
    contentRevision: null,
    seedSchemaVersion: null,
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...opts,
  };
}

const bandaEvent = makeGraphNode(bandGenocide, "Banda genocide", "Event", {
  isTemporal: true,
  validFrom: "1621-01-01",
  temporalPrecision: "year",
});
const bandaPlace = makeGraphNode(placeBanda, "Banda Islands", "Place");

const locatedRelationship: GraphRelationship = {
  id: "rel-1",
  relType: "LOCATED_AT",
  sourceGraphNodeId: bandGenocide,
  targetGraphNodeId: placeBanda,
  properties: {},
};

const bandaScene: Scene = {
  id: "walk:banda-genocide",
  profileScope: "bootstrapping",
  placeFrame: {
    placeId: placeBanda,
    validAt: { instant: "1621-01-01" },
  },
  timeWindow: { start: "1621-01-01", end: "1621-01-01" },
  people: [{ graphNodeId: bandGenocide, role: "subject" }],
  passages: [],
  consents: [],
  redactions: [],
  languageVariants: [],
  title: "Banda genocide",
  assembledBy: "agent",
  curationEvents: [],
  nestedSequenceIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const palaceCuration: PalaceCuration = {
  chambers: [
    {
      candidateId: "chamber-1",
      anchorGraphNodeId: bandGenocide,
      title: "Colonial violence",
      pinned: false,
      excluded: false,
      position: 0,
    },
  ],
  objects: [
    {
      objectId: "pipeline:banda-genocide",
      roomId: "chamber-1",
      kind: "event",
      title: "Banda genocide",
      graphNodeId: bandGenocide,
      contentRef: null,
      placement: {
        surface: "floor",
        position: { x: 0, y: 0, z: 0 },
        rotationY: 0,
        scale: 0.6,
      },
    },
  ],
  fixtures: [],
  collections: [],
};

function makeTransport(overrides: {
  relationships?: GraphRelationship[];
  scenes?: Scene[];
  curation?: unknown;
}) {
  const transport = {
    async loadTimelineView(): Promise<TimelineView> {
      return {
        workspaceId: "sqlite:/canonical/workspace.sqlite",
        nodes: [
          {
            node: bandaEvent,
            anchor: { validFrom: "1621-01-01", validTo: null, precision: "year" },
            layoutOverride: null,
          },
          {
            node: bandaPlace,
            anchor: { validFrom: "1621-01-01", validTo: null, precision: "year" },
            layoutOverride: null,
            relationCompanion: true,
          },
        ],
        relationships: overrides.relationships ?? [locatedRelationship],
        lanes: [],
        diagnostics: [],
      };
    },
    async listScenes(): Promise<Scene[]> {
      return overrides.scenes ?? [bandaScene];
    },
    async loadPalaceCuration(): Promise<{ profileScope: string; curation: unknown }> {
      return {
        profileScope: "bootstrapping",
        curation: overrides.curation ?? palaceCuration,
      };
    },
  } as unknown as WorkspaceServices;
  return transport;
}

describe("usePipelineStages", () => {
  it("derives each object's furthest stage from the real stores", async () => {
    const transport = makeTransport({});
    const { result } = renderHook(() =>
      usePipelineStages({
        transport,
        workspaceId: "sqlite:/canonical/workspace.sqlite",
        databasePath: "/canonical/workspace.sqlite",
        profileScope: "bootstrapping",
        objects: [
          { graphNodeId: bandGenocide, title: "Banda genocide" },
          { graphNodeId: bullOx, title: "Bull-ox" },
        ],
      }),
    );

    await waitFor(() => {
      expect(result.current.reachedStageFor(bandGenocide)).toBe("palace");
    });

    const bandState = result.current.byGraphNodeId.get(bandGenocide);
    expect(bandState).toMatchObject({
      timeline: true,
      places: true,
      stories: true,
      palace: true,
    });
    expect(result.current.reachedStageFor(bullOx)).toBe("constellations");

    // Cumulative counts: both objects at constellations, one at timeline and beyond.
    expect(result.current.countAt("constellations")).toBe(2);
    expect(result.current.countAt("timeline")).toBe(1);
    expect(result.current.countAt("places")).toBe(1);
    expect(result.current.countAt("palace")).toBe(1);
  });

  it("exposes candidate Temporal Places from the timeline view", async () => {
    const transport = makeTransport({});
    const { result } = renderHook(() =>
      usePipelineStages({
        transport,
        workspaceId: "sqlite:/canonical/workspace.sqlite",
        databasePath: "/canonical/workspace.sqlite",
        profileScope: "bootstrapping",
        // Store reads are deferred until there is a canvas object to track.
        objects: [{ graphNodeId: bullOx, title: "Bull-ox" }],
      }),
    );
    await waitFor(() => {
      expect(result.current.candidatePlaces.length).toBeGreaterThan(0);
    });
    expect(result.current.candidatePlaces).toEqual([
      { graphNodeId: placeBanda, title: "Banda Islands" },
    ]);
  });

  it("keeps stages quiet when the transport has no pipeline seams", async () => {
    const transport = {} as unknown as WorkspaceServices;
    const { result } = renderHook(() =>
      usePipelineStages({
        transport,
        workspaceId: "sqlite:/canonical/workspace.sqlite",
        databasePath: "/canonical/workspace.sqlite",
        profileScope: "bootstrapping",
        objects: [{ graphNodeId: bandGenocide, title: "Banda genocide" }],
      }),
    );
    await waitFor(() => {
      expect(result.current.reachedStageFor(bandGenocide)).toBe("constellations");
    });
    expect(result.current.countAt("timeline")).toBe(0);
    expect(result.current.candidatePlaces).toEqual([]);
  });
});

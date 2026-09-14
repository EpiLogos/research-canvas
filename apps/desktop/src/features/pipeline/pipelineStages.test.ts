import { describe, expect, it } from "vitest";

import type { PalaceCuration } from "@research-canvas/canvas";
import type {
  GraphNode,
  GraphRelationship,
  TimelineView,
} from "@research-canvas/desktop-api";
import type { Scene } from "@research-canvas/schema";

import {
  candidatePlacesFromTimeline,
  deriveStageState,
  hasReached,
  reachedStage,
  stageIndex,
} from "./pipelineStages";

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

function makeTimelineView(
  records: TimelineView["nodes"],
  relationships: GraphRelationship[] = [],
): TimelineView {
  return {
    workspaceId: "sqlite:/canonical/workspace.sqlite",
    nodes: records,
    relationships,
    lanes: [],
    diagnostics: [],
  };
}

const bandaEvent = makeGraphNode(bandGenocide, "Banda genocide", "Event", {
  isTemporal: true,
  validFrom: "1621-01-01",
  temporalPrecision: "year",
});
const bandaPlace = makeGraphNode(placeBanda, "Banda Islands", "Place");
const bullOxNode = makeGraphNode(bullOx, "Bull-ox", "Archetype");

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

describe("pipeline stage derivation", () => {
  it("places a fully pushed object at every stage", () => {
    const timeline = makeTimelineView(
      [
        { node: bandaEvent, anchor: { validFrom: "1621-01-01", validTo: null, precision: "year" }, layoutOverride: null },
        { node: bandaPlace, anchor: { validFrom: "1621-01-01", validTo: null, precision: "year" }, layoutOverride: null, relationCompanion: true },
      ],
      [locatedRelationship],
    );
    const states = deriveStageState(
      [{ graphNodeId: bandGenocide, title: "Banda genocide" }],
      timeline,
      [bandaScene],
      palaceCuration,
    );
    const state = states.get(bandGenocide);
    expect(state).toBeDefined();
    expect(state?.timeline).toBe(true);
    expect(state?.places).toBe(true);
    expect(state?.stories).toBe(true);
    expect(state?.palace).toBe(true);
    expect(reachedStage(state!)).toBe("palace");
  });

  it("leaves an untouched object at constellations", () => {
    const states = deriveStageState(
      [{ graphNodeId: bullOx, title: "Bull-ox" }],
      makeTimelineView([]),
      [],
      null,
    );
    const state = states.get(bullOx);
    expect(state).toEqual({
      graphNodeId: bullOx,
      title: "Bull-ox",
      timeline: false,
      places: false,
      stories: false,
      palace: false,
    });
    expect(reachedStage(state!)).toBe("constellations");
  });

  it("treats a dated object as timeline-reached even when unlocated", () => {
    const datedEvent = makeGraphNode(bandGenocide, "Banda genocide", "Event", {
      isTemporal: true,
      validFrom: "1621-01-01",
      temporalPrecision: "year",
    });
    const timeline = makeTimelineView([
      { node: datedEvent, anchor: { validFrom: "1621-01-01", validTo: null, precision: "year" }, layoutOverride: null },
    ]);
    const states = deriveStageState(
      [{ graphNodeId: bandGenocide, title: "Banda genocide" }],
      timeline,
      [],
      null,
    );
    const state = states.get(bandGenocide);
    expect(state?.timeline).toBe(true);
    expect(state?.places).toBe(false);
    expect(reachedStage(state!)).toBe("timeline");
    expect(hasReached(state!, "timeline")).toBe(true);
    expect(hasReached(state!, "places")).toBe(false);
  });

  it("does not count a gazetted Place companion as a passed-through object", () => {
    const timeline = makeTimelineView(
      [
        { node: bandaEvent, anchor: { validFrom: "1621-01-01", validTo: null, precision: "year" }, layoutOverride: null },
        { node: bandaPlace, anchor: { validFrom: "1621-01-01", validTo: null, precision: "year" }, layoutOverride: null, relationCompanion: true },
      ],
      [locatedRelationship],
    );
    const states = deriveStageState(
      [
        { graphNodeId: bandGenocide, title: "Banda genocide" },
        { graphNodeId: placeBanda, title: "Banda Islands" },
      ],
      timeline,
      [],
      null,
    );
    const eventState = states.get(bandGenocide);
    const placeState = states.get(placeBanda);
    // The event is located; the place companion itself is not "placed" just
    // by being referenced.
    expect(eventState?.places).toBe(true);
    expect(placeState?.timeline).toBe(false);
    expect(placeState?.places).toBe(false);
  });

  it("derives the furthest stage from the highest reached flag", () => {
    expect(stageIndex("constellations")).toBe(0);
    expect(stageIndex("timeline")).toBe(1);
    expect(stageIndex("places")).toBe(2);
    expect(stageIndex("stories")).toBe(3);
    expect(stageIndex("palace")).toBe(4);
    expect(reachedStage({ graphNodeId: bandGenocide, title: "", timeline: true, places: false, stories: false, palace: false })).toBe("timeline");
    expect(reachedStage({ graphNodeId: bandGenocide, title: "", timeline: true, places: true, stories: false, palace: false })).toBe("places");
    expect(reachedStage({ graphNodeId: bandGenocide, title: "", timeline: true, places: true, stories: true, palace: false })).toBe("stories");
  });

  it("lists only Place nodes as locate candidates", () => {
    const timeline = makeTimelineView([
      { node: bandaEvent, anchor: { validFrom: "1621-01-01", validTo: null, precision: "year" }, layoutOverride: null },
      { node: bandaPlace, anchor: { validFrom: "1621-01-01", validTo: null, precision: "year" }, layoutOverride: null, relationCompanion: true },
      { node: bullOxNode, anchor: { validFrom: "1621-01-01", validTo: null, precision: "year" }, layoutOverride: null },
    ]);
    const places = candidatePlacesFromTimeline(timeline);
    expect(places).toEqual([{ graphNodeId: placeBanda, title: "Banda Islands" }]);
  });
});

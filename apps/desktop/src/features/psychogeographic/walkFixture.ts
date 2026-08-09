import type { GraphNode, TimelineView } from "@research-canvas/desktop-api";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";

export function graphNode(
  id: string,
  title: string,
  entityType: string,
  over: Partial<GraphNode> = {},
): GraphNode {
  return {
    graphNodeId: id,
    entityType: entityType as GraphNode["entityType"],
    title,
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    ...EMPTY_GRAPH_NODE_METADATA,
    isTemporal: over.isTemporal ?? true,
    validFrom: over.validFrom ?? "1600-01-01",
    validTo: over.validTo ?? null,
    temporalPrecision: over.temporalPrecision ?? "year",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

export function timelineView(): TimelineView {
  return {
    workspaceId: "sqlite:/tmp/ws",
    lanes: [{ id: "events" }],
    diagnostics: [],
    relationships: [
      {
        id: "r-prague",
        relType: "LOCATED_AT",
        sourceGraphNodeId: "event-rudolf-prague",
        targetGraphNodeId: "place-prague",
        properties: {},
      },
      {
        id: "r-amsterdam",
        relType: "LOCATED_AT",
        sourceGraphNodeId: "institution-voc",
        targetGraphNodeId: "place-amsterdam",
        properties: {},
      },
      {
        id: "r-paris",
        relType: "LOCATED_AT",
        sourceGraphNodeId: "event-cult-of-reason",
        targetGraphNodeId: "place-paris",
        properties: {},
      },
      {
        id: "r-banda",
        relType: "LOCATED_AT",
        sourceGraphNodeId: "event-banda-genocide",
        targetGraphNodeId: "place-banda-islands",
        properties: {},
      },
    ],
    nodes: [
      {
        node: graphNode("place-prague", "Prague", "Place", {
          isTemporal: false,
          validFrom: null,
          validTo: null,
          temporalPrecision: null,
        }),
        anchor: { validFrom: "invalid", validTo: null, precision: "year" },
        layoutOverride: {
          lane: "events",
          offsetY: 0,
          width: 240,
          height: 72,
          style: {},
          layoutRevision: 1,
        },
      },
      {
        node: graphNode("event-rudolf-prague", "Rudolf II's Prague", "Event", {
          validFrom: "1576-01-01",
          validTo: "1612-12-31",
        }),
        anchor: { validFrom: "1576-01-01", validTo: "1612-12-31", precision: "year" },
        layoutOverride: {
          lane: "events",
          offsetY: 0,
          width: 240,
          height: 72,
          style: {},
          layoutRevision: 1,
        },
      },
      {
        node: graphNode("place-amsterdam", "Amsterdam", "Place", {
          isTemporal: false,
          validFrom: null,
          validTo: null,
          temporalPrecision: null,
        }),
        anchor: { validFrom: "invalid", validTo: null, precision: "year" },
        layoutOverride: {
          lane: "events",
          offsetY: 0,
          width: 240,
          height: 72,
          style: {},
          layoutRevision: 1,
        },
      },
      {
        node: graphNode("institution-voc", "VOC", "Institution", {
          validFrom: "1602-01-01",
          validTo: null,
        }),
        anchor: { validFrom: "1602-01-01", validTo: null, precision: "year" },
        layoutOverride: {
          lane: "events",
          offsetY: 0,
          width: 240,
          height: 72,
          style: {},
          layoutRevision: 1,
        },
      },
      {
        node: graphNode("place-paris", "Paris", "Place", {
          isTemporal: false,
          validFrom: null,
          validTo: null,
          temporalPrecision: null,
        }),
        anchor: { validFrom: "invalid", validTo: null, precision: "year" },
        layoutOverride: {
          lane: "events",
          offsetY: 0,
          width: 240,
          height: 72,
          style: {},
          layoutRevision: 1,
        },
      },
      {
        node: graphNode("event-cult-of-reason", "Cult of Reason", "Event", {
          validFrom: "1793-01-01",
          validTo: "1793-12-31",
        }),
        anchor: { validFrom: "1793-01-01", validTo: "1793-12-31", precision: "year" },
        layoutOverride: {
          lane: "events",
          offsetY: 0,
          width: 240,
          height: 72,
          style: {},
          layoutRevision: 1,
        },
      },
      {
        node: graphNode("place-banda-islands", "Banda Islands", "Place", {
          isTemporal: false,
          validFrom: null,
          validTo: null,
          temporalPrecision: null,
        }),
        anchor: { validFrom: "invalid", validTo: null, precision: "year" },
        layoutOverride: {
          lane: "events",
          offsetY: 0,
          width: 240,
          height: 72,
          style: {},
          layoutRevision: 1,
        },
      },
      {
        node: graphNode("event-banda-genocide", "Banda genocide", "Event", {
          validFrom: "1621-01-01",
          validTo: "1621-12-31",
        }),
        anchor: { validFrom: "1621-01-01", validTo: "1621-12-31", precision: "year" },
        layoutOverride: {
          lane: "events",
          offsetY: 0,
          width: 240,
          height: 72,
          style: {},
          layoutRevision: 1,
        },
      },
    ],
  };
}

import { describe, it, expect } from "vitest";
import type { CanvasView } from "@research-canvas/desktop-api";
import { nodeLayoutFromCanvasNode } from "@research-canvas/desktop-api";
import type { CanvasNode } from "@research-canvas/schema";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";
import { canvasViewToCanvasNodes } from "./canvasViewToNodes";

const GRAPH_NODE_ID = "33333333-3333-4333-8333-333333333333";
const CANVAS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EDGE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SOURCE_NODE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TARGET_NODE_ID = GRAPH_NODE_ID;

const NOW = "2026-07-01T00:00:00.000Z";

function buildFixtureView(): CanvasView {
  return {
    canvasId: CANVAS_ID,
    nodes: [
      {
        node: {
          graphNodeId: GRAPH_NODE_ID,
          entityType: "Figure",
          title: "N",
          body: "[]",
          summary: "a summary",
          archetypalResonance: null,
          coordinate: null,
          sourceCoordinates: [],
          ...EMPTY_GRAPH_NODE_METADATA,
          isTemporal: true,
          validFrom: null,
          validTo: null,
          temporalPrecision: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
        layout: {
          graphNodeId: GRAPH_NODE_ID,
          canvasId: CANVAS_ID,
          positionX: 12,
          positionY: 34,
          width: 240,
          height: 160,
          style: {},
        },
      },
    ],
    edges: [
      {
        id: EDGE_ID,
        canvasId: CANVAS_ID,
        sourceGraphNodeId: SOURCE_NODE_ID,
        targetGraphNodeId: TARGET_NODE_ID,
        relationKind: "CAUSES",
        style: { stroke: "#aabbcc", width: 1, dashed: false },
      },
    ],
    relationships: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    appState: {},
  };
}

describe("canvasViewToCanvasNodes", () => {
  it("maps the first JoinedCanvasNode to a note-typed CanvasNode with graphNodeId as id", () => {
    const view = buildFixtureView();
    const { nodes } = canvasViewToCanvasNodes(view);

    expect(nodes).toHaveLength(1);
    const node = nodes[0]!;
    expect(node.id).toBe(GRAPH_NODE_ID);
    expect(node.graphNodeId).toBe(GRAPH_NODE_ID);
    expect(node.type).toBe("note");
    expect(node.canvasId).toBe(CANVAS_ID);
    expect(node.title).toBe("N");
    expect(node.graph?.entityType).toBe("Figure");
    expect(node.graph?.evidenceTags).toEqual([]);
    expect(node.position.x).toBe(12);
    expect(node.position.y).toBe(34);
    expect(node.size.width).toBe(240);
    expect(node.size.height).toBe(160);
  });

  it("carries summary from the graph node", () => {
    const view = buildFixtureView();
    const { nodes } = canvasViewToCanvasNodes(view);
    expect(nodes[0]!.summary).toBe("a summary");
  });

  it("maps edges so that sourceNodeId === view.edges[0].sourceGraphNodeId", () => {
    const view = buildFixtureView();
    const { edges } = canvasViewToCanvasNodes(view);

    expect(edges).toHaveLength(1);
    const edge = edges[0]!;
    expect(edge.sourceNodeId).toBe(SOURCE_NODE_ID);
    expect(edge.targetNodeId).toBe(TARGET_NODE_ID);
    expect(edge.relationKind).toBe("CAUSES");
    expect(edge.id).toBe(EDGE_ID);
    expect(edge.canvasId).toBe(CANVAS_ID);
  });

  it("projects canonical graph relationships when both endpoints belong to this constellation", () => {
    const view = buildFixtureView();
    const secondId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    view.nodes.push({
      node: { ...buildGraphNode(secondId, "Target") },
      layout: {
        graphNodeId: secondId,
        canvasId: CANVAS_ID,
        positionX: 340,
        positionY: 34,
        width: 240,
        height: 160,
        style: {},
      },
    });
    view.edges = [];
    view.relationships = [{
      id: "relationship-1",
      relType: "SUPPORTS",
      sourceGraphNodeId: GRAPH_NODE_ID,
      targetGraphNodeId: secondId,
      properties: {},
    }];

    const { edges } = canvasViewToCanvasNodes(view);

    expect(edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "graph:relationship-1",
        sourceNodeId: GRAPH_NODE_ID,
        targetNodeId: secondId,
        relationKind: "SUPPORTS",
      }),
    ]));
  });

  it("does not draw a duplicate for a matching persisted layout edge", () => {
    const view = buildFixtureView();
    const sourceId = GRAPH_NODE_ID;
    view.nodes.push({
      node: { ...buildGraphNode(SOURCE_NODE_ID, "Source") },
      layout: {
        graphNodeId: SOURCE_NODE_ID,
        canvasId: CANVAS_ID,
        positionX: 340,
        positionY: 34,
        width: 240,
        height: 160,
        style: {},
      },
    });
    view.relationships = [{
      id: "relationship-layout-match",
      relType: "CAUSES",
      sourceGraphNodeId: SOURCE_NODE_ID,
      targetGraphNodeId: sourceId,
      properties: {},
    }];

    const { edges } = canvasViewToCanvasNodes(view);

    expect(edges).toHaveLength(1);
    expect(edges[0]!.id).toBe(EDGE_ID);
  });

  it("applies style fields from layout", () => {
    const view = buildFixtureView();
    view.nodes[0]!.layout.style = {
      dotColour: "#ff0000",
      bgColour: "#ffffff",
    };
    const { nodes } = canvasViewToCanvasNodes(view);
    expect(nodes[0]!.dotColour).toBe("#ff0000");
    expect(nodes[0]!.bgColour).toBe("#ffffff");
  });
});

// ---- Fix 1: round-trip type preservation via style.__canvasNode sidecar ----

function buildGraphNode(graphNodeId: string, title: string) {
  return {
    graphNodeId,
    entityType: "Work" as const,
    title,
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    ...EMPTY_GRAPH_NODE_METADATA,
    isTemporal: false,
    validFrom: null,
    validTo: null,
    temporalPrecision: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("canvasViewToCanvasNodes — Fix 1: node type round-trip via __canvasNode sidecar", () => {
  it("resource node round-trips: nodeLayoutFromCanvasNode → layout → canvasViewToCanvasNodes preserves type and paths", () => {
    const resourceNode: CanvasNode = {
      id: GRAPH_NODE_ID,
      graphNodeId: GRAPH_NODE_ID,
      canvasId: CANVAS_ID,
      type: "resource",
      title: "My Report",
      summary: "",
      position: { x: 10, y: 20 },
      size: { width: 260, height: 180 },
      resourceKind: "markdown",
      absolutePath: "/workspace/report.md",
      relativePath: "report.md",
      mimeType: "text/markdown",
      fileFingerprint: "markdown:report.md",
      sequenceCaption: null,
      sequenceViewport: null,
      createdAt: NOW,
      updatedAt: NOW,
    };

    const layout = nodeLayoutFromCanvasNode(resourceNode);

    const view: CanvasView = {
      canvasId: CANVAS_ID,
      nodes: [{ node: buildGraphNode(GRAPH_NODE_ID, "My Report"), layout }],
      edges: [],
      relationships: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      appState: {},
    };

    const { nodes } = canvasViewToCanvasNodes(view);
    expect(nodes).toHaveLength(1);
    const out = nodes[0]!;
    expect(out.type).toBe("resource");
    if (out.type !== "resource") throw new Error("not resource");
    expect(out.resourceKind).toBe("markdown");
    expect(out.absolutePath).toBe("/workspace/report.md");
    expect(out.relativePath).toBe("report.md");
    expect(out.mimeType).toBe("text/markdown");
  });

  it("group node round-trips: type:'group' and color/childNodeIds are preserved", () => {
    const groupNode: CanvasNode = {
      id: GRAPH_NODE_ID,
      graphNodeId: GRAPH_NODE_ID,
      canvasId: CANVAS_ID,
      type: "group",
      title: "Chapter 1",
      summary: "",
      position: { x: 0, y: 0 },
      size: { width: 320, height: 240 },
      color: "#334155",
      childNodeIds: [],
      sequenceCaption: null,
      sequenceViewport: null,
      createdAt: NOW,
      updatedAt: NOW,
    };

    const layout = nodeLayoutFromCanvasNode(groupNode);

    const view: CanvasView = {
      canvasId: CANVAS_ID,
      nodes: [{ node: buildGraphNode(GRAPH_NODE_ID, "Chapter 1"), layout }],
      edges: [],
      relationships: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      appState: {},
    };

    const { nodes } = canvasViewToCanvasNodes(view);
    const out = nodes[0]!;
    expect(out.type).toBe("group");
    if (out.type !== "group") throw new Error("not group");
    expect(out.color).toBe("#334155");
    expect(out.childNodeIds).toEqual([]);
  });

  it("note node round-trips: type:'note' with content and tags preserved", () => {
    const noteNode: CanvasNode = {
      id: GRAPH_NODE_ID,
      graphNodeId: GRAPH_NODE_ID,
      canvasId: CANVAS_ID,
      type: "note",
      title: "Thesis",
      summary: "",
      position: { x: 0, y: 0 },
      size: { width: 240, height: 160 },
      content: "The central claim.",
      tags: ["thesis"],
      sequenceCaption: null,
      sequenceViewport: null,
      createdAt: NOW,
      updatedAt: NOW,
    };

    const layout = nodeLayoutFromCanvasNode(noteNode);

    const view: CanvasView = {
      canvasId: CANVAS_ID,
      nodes: [{ node: buildGraphNode(GRAPH_NODE_ID, "Thesis"), layout }],
      edges: [],
      relationships: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      appState: {},
    };

    const { nodes } = canvasViewToCanvasNodes(view);
    const out = nodes[0]!;
    expect(out.type).toBe("note");
    if (out.type !== "note") throw new Error("not note");
    expect(out.content).toBe("The central claim.");
    expect(out.tags).toEqual(["thesis"]);
  });

  it("node with no __canvasNode sidecar falls back to type:'note' (agent-authored / graph-only node)", () => {
    const view = buildFixtureView();
    // fixture view has no __canvasNode in style (style: {})
    const { nodes } = canvasViewToCanvasNodes(view);
    expect(nodes[0]!.type).toBe("note");
  });

  it("constellation graph nodes hydrate as nested portal nodes when a portal sidecar points to another canvas", () => {
    const targetCanvasId = "22222222-2222-4222-8222-222222222222";
    const view: CanvasView = {
      canvasId: CANVAS_ID,
      nodes: [
        {
          node: {
            graphNodeId: GRAPH_NODE_ID,
            entityType: "Constellation",
            title: "QL Reading Unit",
            body: "A nested interpretive surface.",
            summary: "Nested QL constellation",
            archetypalResonance: null,
            coordinate: "#2:L3/P4",
            sourceCoordinates: ["#2", "L3", "P4"],
            ...EMPTY_GRAPH_NODE_METADATA,
            evidenceTags: ["ql-unit"],
            sourceKind: "constellation",
            isTemporal: true,
            validFrom: "1621-01-01",
            validTo: null,
            temporalPrecision: "year",
            createdAt: NOW,
            updatedAt: NOW,
          },
          layout: {
            graphNodeId: GRAPH_NODE_ID,
            canvasId: CANVAS_ID,
            positionX: 96,
            positionY: 112,
            width: 300,
            height: 180,
            style: {
              dotColour: "#8fd3ff",
              bgColour: "#102436",
              textColour: "#f5fbff",
              thumbnail: "asset://localhost/ql-unit.png",
              __timelineCard: { offsetY: 42, width: 310, height: 118 },
              __canvasNode: {
                type: "portal",
                title: "QL Reading Unit",
                targetCanvasId,
                constellationKind: "ql-unit",
              },
            },
          },
        },
      ],
      edges: [],
      relationships: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      appState: {},
    };

    const { nodes } = canvasViewToCanvasNodes(view);
    expect(nodes).toHaveLength(1);
    const out = nodes[0]!;
    expect(out.type).toBe("portal");
    if (out.type !== "portal") throw new Error("not portal");
    expect(out.targetCanvasId).toBe(targetCanvasId);
    expect(out.constellationKind).toBe("ql-unit");
    expect(out.title).toBe("QL Reading Unit");
    expect(out.summary).toBe("Nested QL constellation");
    expect(out.dotColour).toBe("#8fd3ff");
    expect(out.bgColour).toBe("#102436");
    expect(out.textColour).toBe("#f5fbff");
    expect(out.thumbnail).toBe("asset://localhost/ql-unit.png");
    expect(out.timelineCard).toEqual({ offsetY: 42, width: 310, height: 118 });
  });
});

// ---- Fix 2: non-UUID graph ids are accepted without throwing ----

describe("canvasViewToCanvasNodes — Fix 2: non-UUID graphNodeId accepted", () => {
  it("parses a node with a non-UUID id (e.g. operator id 'op-anuttara-0') without throwing", () => {
    const nonUuidId = "op-anuttara-0";
    const view: CanvasView = {
      canvasId: CANVAS_ID,
      nodes: [
        {
          node: {
            graphNodeId: nonUuidId,
            entityType: "PsychoidOperator",
            title: "Anuttara",
            body: "[]",
            summary: "",
            archetypalResonance: null,
            coordinate: null,
            sourceCoordinates: [],
            ...EMPTY_GRAPH_NODE_METADATA,
            isTemporal: false,
            validFrom: null,
            validTo: null,
            temporalPrecision: null,
            createdAt: NOW,
            updatedAt: NOW,
          },
          layout: {
            graphNodeId: nonUuidId,
            canvasId: CANVAS_ID,
            positionX: 0,
            positionY: 0,
            width: 240,
            height: 160,
            style: {},
          },
        },
      ],
      edges: [],
      relationships: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      appState: {},
    };

    // Must not throw — the whole canvas would blank out if it did
    const { nodes } = canvasViewToCanvasNodes(view);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.id).toBe(nonUuidId);
    expect(nodes[0]!.graphNodeId).toBe(nonUuidId);
  });
});

// ---- lf-task-3: title from node OR sidecar (drop the frontend union hack) ----

describe("canvasViewToCanvasNodes — lf-task-3: title falls back to sidecar when node.title is empty/synthesized", () => {
  it("uses the sidecar title when the joined GraphNode's title is empty (synthesized substance)", () => {
    const view: CanvasView = {
      canvasId: CANVAS_ID,
      nodes: [
        {
          // Simulates a layout row whose Neo4j sync hasn't landed: Rust
          // synthesizes a GraphNode, but here we pin the frontend contract
          // by giving it an empty title directly.
          node: {
            graphNodeId: GRAPH_NODE_ID,
            entityType: "Work",
            title: "",
            body: "[]",
            summary: "",
            archetypalResonance: null,
            coordinate: null,
            sourceCoordinates: [],
            ...EMPTY_GRAPH_NODE_METADATA,
            isTemporal: false,
            validFrom: null,
            validTo: null,
            temporalPrecision: null,
            createdAt: NOW,
            updatedAt: NOW,
          },
          layout: {
            graphNodeId: GRAPH_NODE_ID,
            canvasId: CANVAS_ID,
            positionX: 5,
            positionY: 6,
            width: 240,
            height: 160,
            style: {
              __canvasNode: {
                type: "note",
                title: "Local Draft Title",
                content: "written offline",
                tags: [],
              },
            },
          },
        },
      ],
      edges: [],
      relationships: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      appState: {},
    };

    const { nodes } = canvasViewToCanvasNodes(view);
    expect(nodes).toHaveLength(1);
    const node = nodes[0]!;
    expect(node.title).toBe("Local Draft Title");
    if (node.type !== "note") throw new Error("expected note");
    expect(node.content).toBe("written offline");
  });

  it("prefers node.title over the sidecar title when the joined GraphNode has a real (non-empty) title", () => {
    const view = buildFixtureView();
    view.nodes[0]!.node.title = "Neo4j Title";
    view.nodes[0]!.layout.style = {
      __canvasNode: {
        type: "note",
        title: "Sidecar Title",
        content: "",
        tags: [],
      },
    };

    const { nodes } = canvasViewToCanvasNodes(view);
    expect(nodes[0]!.title).toBe("Neo4j Title");
  });

  it("resource node with empty node.title reconstructs using the sidecar title and resource fields", () => {
    const resourceNode: CanvasNode = {
      id: GRAPH_NODE_ID,
      graphNodeId: GRAPH_NODE_ID,
      canvasId: CANVAS_ID,
      type: "resource",
      title: "My Report",
      summary: "",
      position: { x: 10, y: 20 },
      size: { width: 260, height: 180 },
      resourceKind: "markdown",
      absolutePath: "/workspace/report.md",
      relativePath: "report.md",
      mimeType: "text/markdown",
      fileFingerprint: "markdown:report.md",
      sequenceCaption: null,
      sequenceViewport: null,
      createdAt: NOW,
      updatedAt: NOW,
    };

    const layout = nodeLayoutFromCanvasNode(resourceNode);
    const graphNode = buildGraphNode(GRAPH_NODE_ID, "");

    const view: CanvasView = {
      canvasId: CANVAS_ID,
      nodes: [{ node: graphNode, layout }],
      edges: [],
      relationships: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      appState: {},
    };

    const { nodes } = canvasViewToCanvasNodes(view);
    const out = nodes[0]!;
    expect(out.title).toBe("My Report");
    if (out.type !== "resource") throw new Error("not resource");
    expect(out.resourceKind).toBe("markdown");
  });

  it("never throws when both node.title and sidecar title are absent (falls back to a non-empty placeholder)", () => {
    const view = buildFixtureView();
    view.nodes[0]!.node.title = "";
    view.nodes[0]!.layout.style = {};

    const { nodes } = canvasViewToCanvasNodes(view);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.title.length).toBeGreaterThan(0);
  });
});

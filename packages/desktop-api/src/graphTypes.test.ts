import { describe, expect, it } from "vitest";

import graphNodeFixture from "../../../tests/fixtures/contracts/graph-node.json";
import { graphNodeSchema } from "@research-canvas/schema";

import type {
  ArchetypalLighting,
  CanvasView,
  EdgeLayout,
  EntityType,
  GraphNode,
  GraphNodePatch,
  GraphRelationship,
  JoinedCanvasNode,
  LitInstance,
  NewGraphNodeInput,
  NodeLayout
} from "./index";

describe("graph shared types", () => {
  it("matches the canonical graph-node contract fixture", () => {
    const node: GraphNode = graphNodeSchema.parse(graphNodeFixture);

    expect(graphNodeSchema.parse(node)).toEqual(graphNodeFixture);
    expect(Object.keys(node)).toEqual(Object.keys(graphNodeFixture));
  });
  it("constructs a GraphNode and a JoinedCanvasNode matching contracts section 5.1", () => {
    const entityType: EntityType = "Event";
    const node: GraphNode = {
      graphNodeId: "n1",
      entityType,
      title: "Banda genocide",
      body: "[]",
      summary: "1621",
      archetypalResonance: null,
      coordinate: null,
      sourceCoordinates: [],
      isTemporal: true,
      validFrom: "1621-01-01",
      validTo: "1621-12-31",
      temporalPrecision: "year",
      createdAt: "2026-06-28T12:00:00Z",
      updatedAt: "2026-06-28T12:00:00Z"
    };
    const layout: NodeLayout = {
      graphNodeId: "n1",
      canvasId: "c1",
      positionX: 0,
      positionY: 0,
      width: 200,
      height: 120,
      style: {}
    };
    const joined: JoinedCanvasNode = { node, layout };
    expect(joined.node.graphNodeId).toBe("n1");
    expect(joined.layout.canvasId).toBe("c1");
  });

  it("constructs relationship, edge layout, lighting, patch, and input shapes", () => {
    const rel: GraphRelationship = {
      id: "r1",
      relType: "INSTANTIATES",
      sourceGraphNodeId: "n1",
      targetGraphNodeId: "n2",
      properties: { dominance: "dominant" }
    };
    const edge: EdgeLayout = {
      id: "e1",
      canvasId: "c1",
      sourceGraphNodeId: "n1",
      targetGraphNodeId: "n2",
      relationKind: "INSTANTIATES",
      style: {}
    };
    const lit: LitInstance = {
      node: {
        graphNodeId: "n1",
        entityType: "Event",
        title: "x",
        body: "[]",
        summary: "",
        archetypalResonance: null,
        coordinate: null,
        sourceCoordinates: [],
        isTemporal: true,
        validFrom: null,
        validTo: null,
        temporalPrecision: null,
        createdAt: "t",
        updatedAt: "t"
      },
      relType: "INSTANTIATES",
      dominance: "dominant"
    };
    const lighting: ArchetypalLighting = { operator: lit.node, instances: [lit] };
    const view: CanvasView = {
      canvasId: "c1",
      nodes: [],
      edges: [edge],
      relationships: [rel],
      viewport: { x: 0, y: 0, zoom: 1 },
      appState: {}
    };
    const input: NewGraphNodeInput = {
      entityType: "Dynamic",
      title: "Monopoly",
      body: "[]",
      isTemporal: false
    };
    const patch: GraphNodePatch = { title: "renamed" };
    expect(rel.relType).toBe("INSTANTIATES");
    expect(lighting.instances).toHaveLength(1);
    expect(view.relationships[0].id).toBe("r1");
    expect(input.entityType).toBe("Dynamic");
    expect(patch.title).toBe("renamed");
  });
});

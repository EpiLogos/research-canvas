import { describe, expect, it } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";

import type { CanvasView } from "@research-canvas/desktop-api";

import { canvasViewToCanvasNodes } from "./canvasViewToNodes";

describe("public viewer canvasViewToCanvasNodes", () => {
  it("preserves QL-unit constellation kind on portal sidecars", () => {
    const targetCanvasId = "22222222-2222-4222-8222-222222222222";
    const view: CanvasView = {
      canvasId: "11111111-1111-4111-8111-111111111111",
      nodes: [
        {
          node: {
            graphNodeId: "constellation-devil",
            entityType: "Constellation",
            title: "Devil Sixfold Spectral Lineage",
            body: "[]",
            summary: "Nested QL unit",
            archetypalResonance: null,
            coordinate: null,
            sourceCoordinates: [
              "#0",
              "antichrist-vault/episodes/1/ql-units/unit-spectral-devils-chain.md",
            ],
            ...EMPTY_GRAPH_NODE_METADATA,
            evidenceTags: ["ql_unit", "ql_positioned"],
            sourceKind: "ql-unit",
            isTemporal: false,
            validFrom: null,
            validTo: null,
            temporalPrecision: null,
            createdAt: "2026-06-28T12:00:00Z",
            updatedAt: "2026-06-28T12:00:00Z",
          },
          layout: {
            graphNodeId: "constellation-devil",
            canvasId: "11111111-1111-4111-8111-111111111111",
            positionX: 10,
            positionY: 20,
            width: 300,
            height: 180,
            style: {
              __canvasNode: {
                type: "portal",
                title: "Devil Sixfold Spectral Lineage",
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
    expect(nodes[0].type).toBe("portal");
    if (nodes[0].type !== "portal") throw new Error("not portal");
    expect(nodes[0].targetCanvasId).toBe(targetCanvasId);
    expect(nodes[0].constellationKind).toBe("ql-unit");
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { GraphExportBundle } from "@research-canvas/exporter";

import { CanvasLensView } from "./CanvasLensView";

function bundle(): GraphExportBundle {
  return {
    generatedAt: "2026-06-28T12:00:00Z",
    project: {
      coverAssetPath: null,
      createdAt: "2026-06-28T12:00:00Z",
      displayName: "Antichrist",
      id: "11111111-1111-4111-8111-111111111111",
      parentProjectId: null,
      primaryCanvasId: "c1",
      publishSettings: { includeResources: true, mobileSequenceFirst: true, theme: "paper" },
      rootPath: "/tmp/antichrist",
      slug: "antichrist",
      summary: "Theory graph",
      updatedAt: "2026-06-28T12:00:00Z"
    },
    canvasId: "c1",
    nodes: [
      {
        graphNodeId: "node-monopoly",
        entityType: "Dynamic",
        title: "Monopoly mechanism",
        body: "[]",
        summary: "pattern",
        archetypalResonance: null,
        coordinate: null,
        sourceCoordinates: [],
        isTemporal: false,
        validFrom: null,
        validTo: null,
        temporalPrecision: null,
        createdAt: "t",
        updatedAt: "t"
      }
    ],
    relationships: [],
    nodeLayout: [
      {
        graphNodeId: "node-monopoly",
        canvasId: "c1",
        positionX: 40,
        positionY: 60,
        width: 240,
        height: 160,
        style: {}
      }
    ],
    edgeLayout: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    appState: {},
    lightingIndex: {},
    assets: []
  };
}

describe("CanvasLensView", () => {
  it("renders positioned read-only node cards from the bundle", async () => {
    render(<CanvasLensView bundle={bundle()} />);
    await waitFor(() => {
      expect(screen.getByText("Monopoly mechanism")).toBeInTheDocument();
    });
    const card = screen.getByTestId("canvas-node-node-monopoly");
    expect(card).toHaveStyle({ left: "40px", top: "60px" });
    expect(card.getAttribute("data-entity-type")).toBe("Dynamic");
  });
});

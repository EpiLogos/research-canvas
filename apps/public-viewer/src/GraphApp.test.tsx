import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { GraphExportBundle } from "@research-canvas/exporter";

import { GraphApp } from "./GraphApp";

function bundle(): GraphExportBundle {
  const banda: GraphExportBundle["nodes"][number] = {
    graphNodeId: "node-banda",
    entityType: "Event",
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
    createdAt: "t",
    updatedAt: "t"
  };
  return {
    generatedAt: "2026-06-28T12:00:00Z",
    project: {
      coverAssetPath: null,
      createdAt: "t",
      displayName: "Antichrist",
      id: "11111111-1111-4111-8111-111111111111",
      parentProjectId: null,
      primaryCanvasId: "c1",
      publishSettings: { includeResources: true, mobileSequenceFirst: true, theme: "paper" },
      rootPath: "/tmp/antichrist",
      slug: "antichrist",
      summary: "Theory graph",
      updatedAt: "t"
    },
    canvasId: "c1",
    nodes: [banda],
    relationships: [],
    nodeLayout: [],
    edgeLayout: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    appState: {},
    lightingIndex: {},
    assets: []
  };
}

describe("GraphApp", () => {
  it("defaults to the canvas lens and switches to the timeline lens", async () => {
    render(<GraphApp bundle={bundle()} />);

    await waitFor(() => {
      expect(screen.getByText("Canvas lens (read-only)")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /timeline/i }));

    await waitFor(() => {
      expect(screen.getByText("Timeline lens (read-only)")).toBeInTheDocument();
    });
  });

  it("shows a loading state when no bundle is available", () => {
    render(<GraphApp bundle={null} />);
    expect(screen.getByText(/loading export/i)).toBeInTheDocument();
  });
});

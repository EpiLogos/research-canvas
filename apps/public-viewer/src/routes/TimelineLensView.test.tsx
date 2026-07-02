import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { GraphExportBundle } from "@research-canvas/exporter";

import { TimelineLensView } from "./TimelineLensView";

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
  const monopoly: GraphExportBundle["nodes"][number] = {
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
    nodes: [monopoly, banda],
    relationships: [],
    nodeLayout: [],
    edgeLayout: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    appState: {},
    lightingIndex: {
      "node-monopoly": [{ node: banda, relType: "INSTANTIATES", dominance: "dominant" }]
    },
    assets: []
  };
}

describe("TimelineLensView", () => {
  it("projects only temporal nodes, ordered, and shows their date", async () => {
    render(<TimelineLensView bundle={bundle()} />);
    await waitFor(() => {
      expect(screen.getByText("Banda genocide")).toBeInTheDocument();
    });
    // trans-temporal node is NOT projected onto the axis
    expect(screen.queryByTestId("timeline-event-node-monopoly")).toBeNull();
    expect(screen.getByTestId("timeline-event-node-banda")).toHaveTextContent("1621");
  });

  it("lighting an operator marks its instances as lit", async () => {
    render(<TimelineLensView bundle={bundle()} />);
    await waitFor(() => screen.getByText("Banda genocide"));

    const event = screen.getByTestId("timeline-event-node-banda");
    expect(event.getAttribute("data-lit")).toBe("false");

    fireEvent.click(screen.getByTestId("operator-node-monopoly"));

    await waitFor(() => {
      expect(
        screen.getByTestId("timeline-event-node-banda").getAttribute("data-lit")
      ).toBe("true");
    });
  });

  it("lights exactly the instances the bundle's lightingIndex names, with no backend", async () => {
    // The web read-layer must light from the precomputed bundle.lightingIndex
    // (populated by build_graph_bundle, WS7 Task 8) — not from any live query.
    // This proves the in-memory bundle fixture drives the lighting end-to-end.
    const fixture = bundle();
    const expectedLit = fixture.lightingIndex["node-monopoly"].map(
      (instance) => instance.node.graphNodeId
    );
    expect(expectedLit).toEqual(["node-banda"]);

    render(<TimelineLensView bundle={fixture} />);
    await waitFor(() => screen.getByText("Banda genocide"));

    fireEvent.click(screen.getByTestId("operator-node-monopoly"));
    await waitFor(() => {
      for (const id of expectedLit) {
        expect(
          screen.getByTestId(`timeline-event-${id}`).getAttribute("data-lit")
        ).toBe("true");
      }
    });

    // An operator absent from lightingIndex lights nothing (empty-index branch).
    const empty: GraphExportBundle = {
      ...fixture,
      lightingIndex: {}
    };
    render(<TimelineLensView bundle={empty} />);
    const allEvents = await screen.findAllByTestId("timeline-event-node-banda");
    // the freshly-rendered (empty-index) instance starts unlit and stays unlit
    expect(allEvents[allEvents.length - 1].getAttribute("data-lit")).toBe("false");
  });
});

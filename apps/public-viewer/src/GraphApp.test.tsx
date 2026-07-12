import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EMPTY_GRAPH_NODE_METADATA } from "@research-canvas/schema";

import type { GraphExportBundle } from "@research-canvas/exporter";

import { GraphApp } from "./GraphApp";
import { readBootstrappedGraphBundle } from "./OfflineBootstrap";

// A REAL in-memory GraphExportBundle. Only the *data* is a fixture — every
// component (GraphApp, the shared <TimelineLens>/<CanvasView>) and the
// WorkspaceTransport (createStaticBundleTransport, constructed inside GraphApp)
// are the real units under test. Nothing is vi.mock'd.
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
    ...EMPTY_GRAPH_NODE_METADATA,
    isTemporal: true,
    validFrom: "1621-01-01",
    validTo: "1621-12-31",
    temporalPrecision: "year",
    createdAt: "2026-06-28T12:00:00Z",
    updatedAt: "2026-06-28T12:00:00Z",
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
    ...EMPTY_GRAPH_NODE_METADATA,
    isTemporal: false,
    validFrom: null,
    validTo: null,
    temporalPrecision: null,
    createdAt: "2026-06-28T12:00:00Z",
    updatedAt: "2026-06-28T12:00:00Z",
  };
  return {
    generatedAt: "2026-06-28T12:00:00Z",
    project: {
      coverAssetPath: null,
      createdAt: "2026-06-28T12:00:00Z",
      displayName: "Antichrist",
      id: "11111111-1111-4111-8111-111111111111",
      parentConstellationId: null,
      primaryCanvasId: "22222222-2222-4222-8222-222222222222",
      publishSettings: { includeResources: true, mobileSequenceFirst: true, theme: "paper" },
      rootPath: "/tmp/antichrist",
      slug: "antichrist",
      summary: "Theory graph",
      updatedAt: "2026-06-28T12:00:00Z"
    },
    canvasId: "22222222-2222-4222-8222-222222222222",
    // node-monopoly has NO layout row: it must still surface via defaultLayoutFor
    // auto-placement (design §5.6) in the canvas lens.
    nodes: [monopoly, banda],
    relationships: [],
    nodeLayout: [],
    timelineLayout: [{ graphNodeId: "node-banda", layout: { lane: "events", offsetY: 22, width: 310, height: 96, style: { dotColour: "#123456" }, layoutRevision: 3 } }],
    edgeLayout: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    appState: {},
    // Precomputed lighting: the trans-temporal operator lights the dated event.
    // The web must light from THIS index — no backend query.
    lightingIndex: {
      "node-monopoly": [{ node: banda, relType: "INSTANTIATES", dominance: "dominant" }]
    },
    assets: []
  };
}

describe("GraphApp (mounted web entry, real static-bundle transport)", () => {
  it("normalizes a pre-metadata bootstrapped graph bundle at the external boundary", () => {
    const legacy = bundle();
    delete (legacy.nodes[0] as Partial<(typeof legacy.nodes)[number]>).contentOrigin;
    window.__RESEARCH_CANVAS_GRAPH_BUNDLE__ = legacy;
    expect(readBootstrappedGraphBundle()?.nodes[0].contentOrigin).toBeNull();
    delete window.__RESEARCH_CANVAS_GRAPH_BUNDLE__;
  });
  it("shows the lens switch and defaults to the canvas lens", async () => {
    render(<GraphApp bundle={bundle()} />);

    // (a) lens switch appears
    expect(screen.getByTestId("lens-switch")).toBeInTheDocument();

    // (d) the canvas lens renders the SHARED <CanvasView> (React Flow), not the
    // old flat <article> cards.
    const surface = await screen.findByTestId("canvas-surface");
    await waitFor(() => {
      expect(surface.querySelector(".react-flow")).not.toBeNull();
    });
    // The layout-less node (node-monopoly had no nodeLayout row) still surfaces
    // via defaultLayoutFor auto-placement (design §5.6) — React Flow renders a
    // node keyed by its graphNodeId.
    await waitFor(() => {
      expect(surface.querySelector('.react-flow__node[data-id="node-monopoly"]')).not.toBeNull();
    });
    // The dated event node is present too.
    expect(surface.querySelector('.react-flow__node[data-id="node-banda"]')).not.toBeNull();
  });

  it("renders the bundle's temporal nodes in the shared TimelineLens and lights instances from lightingIndex with no backend", async () => {
    render(<GraphApp bundle={bundle()} />);

    fireEvent.click(screen.getByTestId("lens-switch-timeline"));

    // (b) the SHARED TimelineLens renders the bundle's temporal node; the
    // trans-temporal operator is NOT projected onto the axis.
    await waitFor(() => {
      expect(screen.getByTestId("timeline-lens")).toBeInTheDocument();
    });
    const event = await screen.findByTestId("timeline-node-node-banda");
    expect(event).toHaveTextContent("Banda genocide");
    expect(screen.getByTestId("timeline-node-card-node-banda")).toHaveStyle({ width: "310px", height: "96px" });
    expect(screen.queryByTestId("timeline-node-node-monopoly")).toBeNull();
    expect(event.getAttribute("data-lit")).toBeNull();

    // (c) Selecting the instance surfaces its resonant operator (from the
    // bundle's resonance graph), and lighting that operator marks the instance
    // as lit — driven entirely by bundle.lightingIndex, no backend.
    fireEvent.click(event);
    const row = await screen.findByTestId("resonance-row-node-monopoly");
    fireEvent.click(row);

    await waitFor(() => {
      expect(
        screen.getByTestId("timeline-node-node-banda").getAttribute("data-lit")
      ).toBe("dominant");
    });
  });

  it("shows a loading state when no bundle is available", () => {
    render(<GraphApp bundle={null} />);
    expect(screen.getByText(/loading export/i)).toBeInTheDocument();
  });
});

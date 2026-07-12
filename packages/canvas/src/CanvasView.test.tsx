import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CanvasNode } from "@research-canvas/schema";

import { CanvasView } from "./CanvasView";

vi.mock("./annotations/AnnotationLayer", () => ({
  AnnotationLayer: () => null,
}));

const CANVAS_ID = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-07-07T00:00:00.000Z";

describe("CanvasView card rendering", () => {
  it("renders a graph-backed note as a named card rather than its raw editor body", async () => {
    const node: CanvasNode = {
      id: "event-banda",
      graphNodeId: "event-banda",
      canvasId: CANVAS_ID,
      type: "note",
      title: "Legacy layout title",
      content: "Internal body that must remain in the reader.",
      summary: "Legacy summary",
      tags: ["legacy"],
      graph: {
        graphNodeId: "event-banda",
        entityType: "Event",
        title: "Banda Genocide",
        body: "[]",
        summary: "A documented 1621 massacre through which the VOC imposed monopoly power.",
        archetypalResonance: null,
        coordinate: null,
        sourceCoordinates: [],
        evidenceTags: ["documented"],
        sourceKind: null,
        contentOrigin: "seed",
        contentRevision: 1,
        seedSchemaVersion: 1,
        bodySourceCoordinates: [],
        historicity: "historical",
        claimKind: "fact",
        evidenceStatus: "documented",
        temporalRole: "occurred_at",
        placeCoverage: "resolved",
        qlForm: null,
        qlUnitId: null,
        qlArc: null,
        qlTopology: null,
        qlSchemaVersion: null,
        qlSourceCoordinates: [],
        qlCompletenessStatus: null,
        isTemporal: true,
        validFrom: "1621-01-01",
        validTo: null,
        temporalPrecision: "year",
        createdAt: NOW,
        updatedAt: NOW,
      },
      position: { x: 0, y: 0 },
      size: { width: 260, height: 180 },
      sequenceCaption: null,
      sequenceViewport: null,
      createdAt: NOW,
      updatedAt: NOW,
    };

    render(<CanvasView nodes={[node]} edges={[]} />);

    expect(await screen.findByRole("heading", { name: "Banda Genocide" })).toBeInTheDocument();
    expect(screen.getByText(/VOC imposed monopoly power/)).toBeInTheDocument();
    expect(screen.queryByText("Internal body that must remain in the reader.")).not.toBeInTheDocument();
  });

  it("renders a persisted thumbnail on a non-image resource card", async () => {
    const node: CanvasNode = {
      id: "resource-a",
      graphNodeId: "resource-a",
      canvasId: CANVAS_ID,
      type: "resource",
      title: "Archive note",
      position: { x: 0, y: 0 },
      size: { width: 260, height: 180 },
      summary: "archive.md",
      resourceKind: "markdown",
      absolutePath: "/workspace/archive.md",
      relativePath: "archive.md",
      mimeType: "text/markdown",
      fileFingerprint: "markdown:archive.md",
      dotColour: "#8fd3ff",
      bgColour: "#102436",
      textColour: "#f5fbff",
      thumbnail: "asset://localhost/workspace/thumb.png",
      sequenceCaption: null,
      sequenceViewport: null,
      createdAt: NOW,
      updatedAt: NOW,
    };

    render(<CanvasView nodes={[node]} edges={[]} />);

    const card = await screen.findByTestId("knowledge-card");
    const thumbnail = card.querySelector("img");
    expect(thumbnail).toHaveAttribute("src", "asset://localhost/workspace/thumb.png");
    expect(screen.getByRole("heading", { name: "Archive note" })).toBeInTheDocument();
  });

  it("uses the host asset resolver for an image resource without a manually chosen thumbnail", async () => {
    const node: CanvasNode = {
      id: "resource-image",
      graphNodeId: "resource-image",
      canvasId: CANVAS_ID,
      type: "resource",
      title: "Archive photograph",
      position: { x: 0, y: 0 },
      size: { width: 260, height: 180 },
      summary: "photograph.jpg",
      resourceKind: "image",
      absolutePath: "/workspace/archive photograph.jpg",
      relativePath: "archive photograph.jpg",
      mimeType: "image/jpeg",
      fileFingerprint: "image:archive photograph.jpg",
      sequenceCaption: null,
      sequenceViewport: null,
      createdAt: NOW,
      updatedAt: NOW,
    };

    render(
      <CanvasView
        nodes={[node]}
        edges={[]}
        assetUrlForPath={(path) => `asset://localhost${path.replace(" ", "%20")}`}
      />,
    );

    expect((await screen.findByTestId("knowledge-card")).querySelector("img")).toHaveAttribute(
      "src",
      "asset://localhost/workspace/archive%20photograph.jpg",
    );
  });

  it("renders a nested constellation portal with the same canonical card surface", async () => {
    const node: CanvasNode = {
      id: "ql-unit",
      graphNodeId: "ql-unit",
      canvasId: CANVAS_ID,
      type: "portal",
      title: "QL Reading Unit",
      summary: "A complete sixfold reading surface.",
      targetCanvasId: "33333333-3333-4333-8333-333333333333",
      constellationKind: "ql-unit",
      position: { x: 0, y: 0 },
      size: { width: 300, height: 180 },
      sequenceCaption: null,
      sequenceViewport: null,
      createdAt: NOW,
      updatedAt: NOW,
    };

    render(<CanvasView nodes={[node]} edges={[]} />);

    expect(await screen.findByTestId("knowledge-card")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "QL Reading Unit" })).toBeInTheDocument();
    expect(screen.getByText("A complete sixfold reading surface.")).toBeInTheDocument();
    expect(document.querySelector(".adaptive-node")).toBeNull();
  });
});

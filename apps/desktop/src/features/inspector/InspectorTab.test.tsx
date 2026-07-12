import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createAnnotationStore, createCanvasStore } from "@research-canvas/canvas";
import { CanvasWorkspaceContext } from "../canvas/CanvasWorkspaceContext";
import { InspectorTab } from "./InspectorTab";

function renderInspector() {
  const store = createCanvasStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" });
  const node = store.getState().createNoteNode({ title: "Local heading", content: "draft" });
  store.getState().updateNodeGraph(node.id, {
    graphNodeId: "graph-node-1",
    entityType: "Event",
    title: "Banda genocide",
    body: "[]",
    summary: "A documented episode requiring careful historical reading.",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    evidenceTags: ["archive", "colonial-record"],
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
    qlForm: "quaternity",
    qlUnitId: "unit-a",
    qlArc: "day",
    qlTopology: "torus",
    qlSchemaVersion: 1,
    qlSourceCoordinates: [],
    qlCompletenessStatus: "partial",
    isTemporal: true,
    validFrom: "1816-01-01",
    validTo: null,
    temporalPrecision: "year",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const updateNodeMetadata = vi.fn().mockResolvedValue(undefined);
  const value = {
    store,
    annotationStore: createAnnotationStore({ canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f" }),
    selectedNodeId: node.id,
    entries: [],
    updateNodeMetadata,
    updateNodeStyle: vi.fn(),
    setNodeThumbnailFromAbsolutePath: vi.fn(),
    captureViewport: vi.fn(),
  } as unknown as ComponentProps<typeof CanvasWorkspaceContext.Provider>["value"];

  render(
    <CanvasWorkspaceContext.Provider value={value}>
      <InspectorTab />
    </CanvasWorkspaceContext.Provider>,
  );
  return { updateNodeMetadata, nodeId: node.id };
}

describe("InspectorTab", () => {
  it("edits canonical titles and evidence tags rather than the legacy local note tags", async () => {
    const { updateNodeMetadata, nodeId } = renderInspector();

    expect(screen.getByDisplayValue("Banda genocide")).toBeInTheDocument();
    expect(screen.getByDisplayValue("archive, colonial-record")).toBeInTheDocument();
    expect(screen.getByText("A documented episode requiring careful historical reading.")).toBeInTheDocument();
    expect(screen.getByText("historical")).toBeInTheDocument();
    expect(screen.getByText("quaternity")).toBeInTheDocument();

    const title = screen.getByRole("textbox", { name: "Canonical title" });
    fireEvent.change(title, { target: { value: "Banda campaign" } });
    fireEvent.blur(title);

    const tags = screen.getByLabelText("Knowledge tags");
    fireEvent.change(tags, { target: { value: "archive, documented" } });
    fireEvent.blur(tags);

    await waitFor(() => {
      expect(updateNodeMetadata).toHaveBeenCalledWith(nodeId, { title: "Banda campaign" });
      expect(updateNodeMetadata).toHaveBeenCalledWith(nodeId, { evidenceTags: ["archive", "documented"] });
    });
  });
});

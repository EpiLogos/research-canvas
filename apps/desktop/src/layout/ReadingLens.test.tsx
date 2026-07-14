import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CanvasNode } from "@research-canvas/schema";

import { ReadingLens } from "./ReadingLens";

const state = {
  nodes: [] as Array<{ id: string; title: string; type: string }>,
  selectedNodeId: null as string | null,
  workingRoot: "/workspace/project",
};

vi.mock("../features/canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => state,
}));

vi.mock("../features/viewer/NodeReaderBody", () => ({
  NodeReaderBody: ({ node, record }: { node: { id: string } | null; record?: { graphNode?: { body?: string } | null } | null }) => (
    <div data-testid="reader-body">{record?.graphNode?.body ?? `reading:${node?.id ?? "none"}`}</div>
  ),
}));

vi.mock("../features/viewer/GraphDocumentContent", () => ({
  GraphDocumentAuthoringActions: ({ onGraphNodeUpdated }: { onGraphNodeUpdated?: (node: unknown) => void }) => (
    <button
      type="button"
      onClick={() => onGraphNodeUpdated?.({
        graphNodeId: "timeline-1",
        title: "Timeline record",
        body: '[{"type":"image","props":{"url":"assets/timeline-1/new-image.png"}}]',
        summary: "Updated pith",
        contentOrigin: "user_authored",
        contentRevision: 2,
      })}
    >
      Insert image
    </button>
  ),
}));

describe("ReadingLens", () => {
  it("shows an empty state when nothing is selected", () => {
    state.nodes = [];
    state.selectedNodeId = null;
    render(<ReadingLens onFullScreen={() => {}} onExitToCanvas={() => {}} />);
    expect(screen.getByTestId("reading-pane")).toBeVisible();
    expect(screen.getByText(/select a node to read/i)).toBeInTheDocument();
    expect(screen.queryByTestId("reader-body")).not.toBeInTheDocument();
  });

  it("renders the reader body for the selected node", () => {
    state.nodes = [{ id: "n1", title: "The Naked Face", type: "note" }];
    state.selectedNodeId = "n1";
    render(<ReadingLens onFullScreen={() => {}} onExitToCanvas={() => {}} />);
    expect(screen.getByTestId("reader-body")).toHaveTextContent("reading:n1");
  });

  it("calls onFullScreen from the fullscreen button", () => {
    state.nodes = [{ id: "n1", title: "T", type: "note" }];
    state.selectedNodeId = "n1";
    const onFullScreen = vi.fn();
    render(<ReadingLens onFullScreen={onFullScreen} onExitToCanvas={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Read full screen" }));
    expect(onFullScreen).toHaveBeenCalledTimes(1);
  });

  it("calls onExitToCanvas from the Back to canvas button", () => {
    state.nodes = [{ id: "n1", title: "T", type: "note" }];
    state.selectedNodeId = "n1";
    const onExitToCanvas = vi.fn();
    render(<ReadingLens onFullScreen={() => {}} onExitToCanvas={onExitToCanvas} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to canvas" }));
    expect(onExitToCanvas).toHaveBeenCalledTimes(1);
  });

  it("repairs a persisted legacy thumbnail URL before rendering the reader cover", () => {
    state.nodes = [];
    state.selectedNodeId = null;
    const imageNode = {
      id: "n1",
      graphNodeId: "n1",
      canvasId: "canvas-1",
      type: "resource",
      title: "Archive photograph",
      summary: "A historical image.",
      position: { x: 0, y: 0 },
      size: { width: 260, height: 180 },
      resourceKind: "image",
      absolutePath: "/workspace/project/assets/n1/cover.png",
      relativePath: "assets/n1/cover.png",
      mimeType: "image/png",
      fileFingerprint: "image:cover.png",
      thumbnail: "asset://localhost/workspace/project/assets/n1/cover.png",
      sequenceCaption: null,
      sequenceViewport: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    } as CanvasNode;

    render(
      <ReadingLens
        nodeOverride={imageNode}
        onFullScreen={() => {}}
        onExitToCanvas={() => {}}
      />,
    );

    expect(screen.getByRole("presentation")).toHaveAttribute(
      "src",
      "asset://localhost/%2Fworkspace%2Fproject%2Fassets%2Fn1%2Fcover.png",
    );
  });

  it("closes the overlay variant with Escape", () => {
    state.nodes = [{ id: "n1", title: "T", type: "note" }];
    state.selectedNodeId = "n1";
    const onExitToCanvas = vi.fn();
    render(
      <ReadingLens
        variant="overlay"
        onFullScreen={() => {}}
        onExitToCanvas={onExitToCanvas}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onExitToCanvas).toHaveBeenCalledTimes(1);
  });

  it("renders a clear unresolved-media notice instead of a broken image for a blob thumbnail", () => {
    state.nodes = [];
    state.selectedNodeId = null;
    const node = {
      id: "n1",
      graphNodeId: null,
      canvasId: "canvas-1",
      type: "note",
      title: "Lost image reference",
      content: "[]",
      tags: [],
      summary: "The original image needs re-attaching.",
      thumbnail: "blob:https://chatgpt.com/lost-image",
      position: { x: 0, y: 0 },
      size: { width: 260, height: 180 },
      sequenceCaption: null,
      sequenceViewport: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    } as CanvasNode;

    render(<ReadingLens nodeOverride={node} onFullScreen={() => {}} onExitToCanvas={() => {}} />);

    expect(screen.getByTestId("reader-media-unresolved")).toHaveTextContent("Image source needs re-attaching");
    expect(screen.queryByTestId("reader-cover")).not.toBeInTheDocument();
  });

  it("replaces the open timeline reader record immediately after media insertion", () => {
    const record = {
      kind: "graph",
      graphNodeId: "timeline-1",
      canvasNode: null,
      graphNode: {
        graphNodeId: "timeline-1",
        title: "Timeline record",
        body: '[{"type":"paragraph","content":[{"type":"text","text":"Before"}]}]',
        summary: "Original pith",
        evidenceTags: [],
        sourceCoordinates: [],
        bodySourceCoordinates: [],
        isTemporal: true,
        validFrom: "1700-01-01",
        validTo: null,
        temporalPrecision: "year",
      },
      title: "Timeline record",
      pith: "Original pith",
      coverReference: null,
      evidenceTags: [],
      sourceCoordinates: [],
      bodySourceCoordinates: [],
      narrative: { historicity: null, claimKind: null, evidenceStatus: null, temporalRole: null, sourceKind: null },
      ql: null,
      placeTags: [],
      temporal: { validFrom: "1700-01-01", validTo: null, precision: "year" },
      placeCoverage: null,
    } as never;

    render(<ReadingLens recordOverride={record} onFullScreen={() => {}} onExitToCanvas={() => {}} />);
    expect(screen.getByTestId("reader-body")).toHaveTextContent("Before");

    fireEvent.click(screen.getByRole("button", { name: "Show reader details" }));
    fireEvent.click(screen.getByRole("button", { name: "Insert image" }));

    expect(screen.getByTestId("reader-body")).toHaveTextContent("new-image.png");
    expect(screen.getByText("Updated pith")).toBeInTheDocument();
  });
});

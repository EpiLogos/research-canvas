import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CanvasEdge, CanvasNode } from "@research-canvas/schema";

import { DetailsPanel } from "./DetailsPanel";

describe("DetailsPanel", () => {
  it("renders note content, related nodes, and the focused view action", () => {
    const noteNode: CanvasNode = {
      id: "11111111-1111-4111-8111-111111111111",
      canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
      type: "note",
      title: "Opening note",
      position: { x: 80, y: 80 },
      size: { width: 240, height: 160 },
      summary: "The thesis starts here.",
      content: "# Opening note\n\nThe thesis starts here.",
      tags: ["note"],
      createdAt: "2026-03-30T00:00:00Z",
      updatedAt: "2026-03-30T00:00:00Z"
    };
    const resourceNode: CanvasNode = {
      id: "22222222-2222-4222-8222-222222222222",
      canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
      type: "resource",
      title: "Source report",
      position: { x: 320, y: 80 },
      size: { width: 260, height: 180 },
      summary: "report.md",
      resourceKind: "markdown",
      absolutePath: "/tmp/report.md",
      relativePath: "report.md",
      mimeType: "text/markdown",
      fileFingerprint: "markdown:report.md",
      createdAt: "2026-03-30T00:00:00Z",
      updatedAt: "2026-03-30T00:00:00Z"
    };
    const edge: CanvasEdge = {
      id: "33333333-3333-4333-8333-333333333333",
      canvasId: noteNode.canvasId,
      sourceNodeId: noteNode.id,
      targetNodeId: resourceNode.id,
      relationKind: "supports",
      directionality: "forward",
      label: "supports",
      note: "Primary supporting source",
      style: {
        dashed: false,
        stroke: "#f0b45a",
        width: 2
      },
      createdAt: "2026-03-30T00:00:00Z",
      updatedAt: "2026-03-30T00:00:00Z"
    };

    const onSelectNode = vi.fn();
    const onOpenFocusedView = vi.fn();

    render(
      <DetailsPanel
        edges={[edge]}
        nodes={[noteNode, resourceNode]}
        onOpenFocusedView={onOpenFocusedView}
        onSelectNode={onSelectNode}
        selectedNodeId={noteNode.id}
      />
    );

    expect(screen.getByText("The thesis starts here.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Source report" })[0]).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Open focused view" }),
    ).toBeVisible();
  });

  it("renders file metadata for a resource node", () => {
    const resourceNode: CanvasNode = {
      id: "22222222-2222-4222-8222-222222222222",
      canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
      type: "resource",
      title: "Source report",
      position: { x: 320, y: 80 },
      size: { width: 260, height: 180 },
      summary: "report.md",
      resourceKind: "markdown",
      absolutePath: "/tmp/report.md",
      relativePath: "report.md",
      mimeType: "text/markdown",
      fileFingerprint: "markdown:report.md",
      createdAt: "2026-03-30T00:00:00Z",
      updatedAt: "2026-03-30T00:00:00Z"
    };

    render(
      <DetailsPanel
        edges={[]}
        nodes={[resourceNode]}
        onOpenFocusedView={vi.fn()}
        onSelectNode={vi.fn()}
        selectedNodeId={resourceNode.id}
      />
    );

    expect(screen.getByText("/tmp/report.md")).toBeInTheDocument();
    expect(screen.getByText("text/markdown")).toBeInTheDocument();
    expect(screen.getByText("markdown")).toBeInTheDocument();
  });
});

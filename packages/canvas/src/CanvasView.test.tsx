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

    const thumbnail = await screen.findByRole("img", { name: "Archive note" });
    expect(thumbnail).toHaveAttribute("src", "asset://localhost/workspace/thumb.png");
    expect(screen.getByText("Archive note")).toHaveStyle({ color: "#f5fbff" });
  });
});

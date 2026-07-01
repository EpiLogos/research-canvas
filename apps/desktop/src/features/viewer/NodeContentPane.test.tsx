import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CanvasNode } from "@research-canvas/schema";

import { NodeContentPane } from "./NodeContentPane";

type NoteCanvasNode = Extract<CanvasNode, { type: "note" }>;

function noteNode(overrides: Partial<NoteCanvasNode> = {}): NoteCanvasNode {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    graphNodeId: null,
    canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
    type: "note",
    title: "Opening note",
    position: { x: 10, y: 20 },
    size: { width: 240, height: 160 },
    summary: "The thesis starts here.",
    content: "The thesis starts here.",
    tags: ["note"],
    sequenceCaption: null,
    sequenceViewport: null,
    createdAt: "2026-04-01T12:00:00.000Z",
    updatedAt: "2026-04-01T12:00:00.000Z",
    ...overrides,
  };
}

function markdownNode(): CanvasNode {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    graphNodeId: null,
    canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
    type: "resource",
    title: "Research note",
    position: { x: 20, y: 30 },
    size: { width: 260, height: 180 },
    summary: "notes/research.md",
    resourceKind: "markdown",
    absolutePath: "/tmp/research.md",
    relativePath: "notes/research.md",
    mimeType: "text/markdown",
    fileFingerprint: "fp-1",
    sequenceCaption: null,
    sequenceViewport: null,
    createdAt: "2026-04-01T12:00:00.000Z",
    updatedAt: "2026-04-01T12:00:00.000Z",
  };
}

describe("NodeContentPane", () => {
  it("lets note content be edited live", () => {
    const onNoteContentChange = vi.fn();

    render(
      <NodeContentPane
        node={noteNode()}
        textContent={null}
        onFullScreen={() => {}}
        onNoteContentChange={onNoteContentChange}
      />
    );

    const textarea = screen.getByLabelText("Note content");
    fireEvent.change(textarea, { target: { value: "Updated thesis body" } });

    expect(onNoteContentChange).toHaveBeenLastCalledWith("Updated thesis body");
  });

  it("renders markdown resource content when text has been loaded", () => {
    render(
      <NodeContentPane
        node={markdownNode()}
        textContent={"# Findings\n\nSupport the core claim."}
        onFullScreen={() => {}}
      />
    );

    expect(screen.getByRole("heading", { name: "Findings" })).toBeVisible();
    expect(screen.getByText("Support the core claim.")).toBeVisible();
  });
});

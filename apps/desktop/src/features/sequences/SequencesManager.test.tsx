import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SequencesManager } from "./SequencesManager";

vi.mock("../canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => ({
    databasePath: null,
    canvasId: "canvas-1",
    activeProject: null,
    nodes: [],
    edges: [],
    listSavedSequences: vi.fn().mockResolvedValue([]),
    createSavedSequence: vi.fn(),
    updateSavedSequence: vi.fn(),
    deleteSavedSequence: vi.fn(),
    store: { getState: () => ({ edges: [], toggleEdgeSequencing: vi.fn() }) },
  }),
}));

function renderManager(onClose = vi.fn()) {
  render(<SequencesManager onClose={onClose} onPlaySequence={vi.fn()} />);
  return onClose;
}

describe("SequencesManager overlay", () => {
  it("calls onClose when the backdrop is clicked", () => {
    const onClose = renderManager();
    fireEvent.click(screen.getByTestId("sequences-overlay-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when the card is clicked", () => {
    const onClose = renderManager();
    fireEvent.click(screen.getByTestId("sequences-overlay-card"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when the close (x) button is clicked", () => {
    const onClose = renderManager();
    fireEvent.click(screen.getByTitle("Close (Esc)"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = renderManager();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

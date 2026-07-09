import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CommandPalette } from "./CommandPalette";

vi.mock("../canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => ({
    entries: [],
    nodes: [],
    createNoteNode: vi.fn(),
    selectEntry: vi.fn(),
    selectNode: vi.fn(),
    selectConstellation: vi.fn(),
    searchConstellation: vi.fn().mockResolvedValue([]),
    constellationId: "p1",
  }),
}));

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    render(<CommandPalette isOpen={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
  });

  it("runs a lens command and closes", () => {
    const onSetLens = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette isOpen onClose={onClose} onSetLens={onSetLens} onToggleTerminal={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search workspace"), { target: { value: "timeline" } });
    fireEvent.click(screen.getByRole("button", { name: /Go to Timeline command/ }));
    expect(onSetLens).toHaveBeenCalledWith("timeline");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

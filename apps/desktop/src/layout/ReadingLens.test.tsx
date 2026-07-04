import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReadingLens } from "./ReadingLens";

const state = { nodes: [] as Array<{ id: string; title: string; type: string }>, selectedNodeId: null as string | null };

vi.mock("../features/canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => state,
}));

vi.mock("../features/viewer/NodeReaderBody", () => ({
  NodeReaderBody: ({ node }: { node: { id: string } }) => <div data-testid="reader-body">reading:{node.id}</div>,
}));

describe("ReadingLens", () => {
  it("shows an empty state when nothing is selected", () => {
    state.nodes = [];
    state.selectedNodeId = null;
    render(<ReadingLens onFullScreen={() => {}} />);
    expect(screen.getByTestId("reading-pane")).toBeVisible();
    expect(screen.getByText(/select a node to read/i)).toBeInTheDocument();
    expect(screen.queryByTestId("reader-body")).not.toBeInTheDocument();
  });

  it("renders the reader body for the selected node", () => {
    state.nodes = [{ id: "n1", title: "The Naked Face", type: "note" }];
    state.selectedNodeId = "n1";
    render(<ReadingLens onFullScreen={() => {}} />);
    expect(screen.getByTestId("reader-body")).toHaveTextContent("reading:n1");
  });

  it("calls onFullScreen from the fullscreen button", () => {
    state.nodes = [{ id: "n1", title: "T", type: "note" }];
    state.selectedNodeId = "n1";
    const onFullScreen = vi.fn();
    render(<ReadingLens onFullScreen={onFullScreen} />);
    fireEvent.click(screen.getByRole("button", { name: "Read full screen" }));
    expect(onFullScreen).toHaveBeenCalledTimes(1);
  });
});

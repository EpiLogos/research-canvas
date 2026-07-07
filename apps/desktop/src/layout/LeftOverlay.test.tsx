import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LeftOverlay } from "./LeftOverlay";

const selectNode = vi.fn();

vi.mock("../features/canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => ({
    projects: [],
    activeProjectId: null,
    selectProject: vi.fn(),
    resourceRoots: [],
    listDirectories: vi.fn().mockResolvedValue([]),
    attachResourceRoot: vi.fn(),
    detachResourceRoot: vi.fn(),
    entries: [],
    selectedEntryId: null,
    selectEntry: vi.fn(),
    selectNode,
    nodes: [
      { id: "n1", title: "The Accuser", type: "operator" },
      { id: "n2", title: "The Naked Face", type: "note" },
      { id: "n3", title: "Satan Exulting", type: "resource" },
    ],
  }),
}));

function renderFiles(onClose = vi.fn()) {
  return render(
    <LeftOverlay open mode="files" onResizeStart={() => {}} onClose={onClose} />,
  );
}

describe("LeftOverlay browser", () => {
  it("defaults to the Graph view and groups nodes by type", () => {
    renderFiles();
    expect(screen.getByTestId("browser-graph")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("graph-node-n1")).toHaveTextContent("The Accuser");
    expect(screen.getByTestId("graph-node-n2")).toHaveTextContent("The Naked Face");
  });

  it("filters graph rows by the query", () => {
    renderFiles();
    fireEvent.change(screen.getByTestId("browser-filter"), { target: { value: "accus" } });
    expect(screen.getByTestId("graph-node-n1")).toBeInTheDocument();
    expect(screen.queryByTestId("graph-node-n2")).not.toBeInTheDocument();
  });

  it("selects a node from a graph row", () => {
    renderFiles();
    fireEvent.click(screen.getByTestId("graph-node-n1"));
    expect(selectNode).toHaveBeenCalledWith("n1");
  });

  it("switches to the Files view", () => {
    renderFiles();
    fireEvent.click(screen.getByTestId("browser-files"));
    expect(screen.getByTestId("browser-files")).toHaveAttribute("data-active", "true");
    // Files view shows the Files section label from the existing tree UI.
    // (Two "Files" texts now exist — the toggle button and the section header —
    // so scope the assertion to the section header label.)
    expect(screen.getByText("Files", { selector: ".lo-label" })).toBeInTheDocument();
  });

  it("renders a Close panel button that calls onClose", () => {
    const onClose = vi.fn();
    renderFiles(onClose);
    const closeBtn = screen.getByRole("button", { name: "Close panel" });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the Projects section in files mode even when browserView is the default Graph view", () => {
    renderFiles();
    // Default browserView is "graph" — no click on the Files sub-tab.
    expect(screen.getByTestId("browser-graph")).toHaveAttribute("data-active", "true");
    // Projects must be visible regardless — assert via the projects marker.
    expect(screen.getByTestId("lo-projects")).toBeInTheDocument();
  });
});

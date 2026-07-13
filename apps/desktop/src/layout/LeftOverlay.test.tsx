import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LeftOverlay } from "./LeftOverlay";

const selectNode = vi.fn();
const selectConstellation = vi.fn();

vi.mock("../features/canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => ({
    constellations: [
      {
        id: "main",
        name: "Root Ecology",
        slug: "root-ecology",
        rootPath: "/workspace",
        summary: "Completed constellations nested as portal cards.",
        parentId: null,
        children: [],
      },
      {
        id: "constellation-a",
        name: "Prometheus fire",
        slug: "prometheus-fire",
        rootPath: "/workspace/constellations/prometheus-fire",
        summary: "Nodes gathered around theft of fire.",
        parentId: "main",
        children: [],
      },
      {
        id: "constellation-b",
        name: "Banda archipelago",
        slug: "banda-archipelago",
        rootPath: "/workspace/constellations/prometheus-fire/banda-archipelago",
        summary: "A nested historical field.",
        parentId: "constellation-a",
        children: [],
      },
    ],
    activeConstellationId: "main",
    selectConstellation,
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

function renderFiles() {
  return render(
    <LeftOverlay open mode="files" onResizeStart={() => {}} />,
  );
}

describe("LeftOverlay browser", () => {
  beforeEach(() => {
    selectNode.mockClear();
    selectConstellation.mockClear();
  });

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

  it("presents constellations as a hierarchy, not a flat project list", () => {
    renderFiles();
    expect(screen.getByRole("button", { name: /Root Ecology/ })).toHaveAttribute("data-depth", "0");
    expect(screen.getByRole("button", { name: /Prometheus fire/ })).toHaveAttribute("data-depth", "1");
    expect(screen.getByRole("button", { name: /Banda archipelago/ })).toHaveAttribute("data-depth", "2");
    expect(screen.queryByRole("button", { name: "Close panel" })).not.toBeInTheDocument();
  });

  it("shows the Constellations section in files mode even when browserView is the default Graph view", () => {
    renderFiles();
    // Default browserView is "graph" — no click on the Files sub-tab.
    expect(screen.getByTestId("browser-graph")).toHaveAttribute("data-active", "true");
    // Constellations must be visible regardless — assert via the real selector marker.
    expect(screen.getByTestId("lo-constellations")).toBeInTheDocument();
    expect(screen.getByText("Root Ecology")).toBeInTheDocument();
    expect(screen.queryByText("Single historical timeline")).not.toBeInTheDocument();
    expect(screen.getByText("Prometheus fire")).toBeInTheDocument();
  });

  it("selects a constellation through the constellation selection path", () => {
    renderFiles();
    fireEvent.click(screen.getByRole("button", { name: /Prometheus fire/ }));
    expect(selectConstellation).toHaveBeenCalledWith("constellation-a");
  });
});

import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createAnnotationStore, createCanvasStore } from "@research-canvas/canvas";

import { GraphDocumentContent } from "./ContentTab";
import { CanvasWorkspaceContext } from "../canvas/CanvasWorkspaceContext";

// jsdom is missing a couple of browser APIs the real BlockNote editor touches
// on mount. These are environment shims (not stubs of anything under test);
// the editor, the drop surface, and both link pickers all render for real.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const body = JSON.stringify([
  {
    id: "b1",
    type: "paragraph",
    props: {},
    content: [{ type: "text", text: "Graph body", styles: {} }],
    children: [],
  },
]);

// The transport is the backend boundary — the only legitimate data double in a
// jsdom test (real Neo4j round-trips are covered by the Rust integration
// suite). Built ONCE so its reference is stable across React's internal
// re-renders: an unstable transport would make LinkNodePicker's search effect
// (which setResults([]) on an empty query) re-fire every render and, with the
// real editor remounting each time, exhaust the heap.
const transport = {
  readGraphNode: vi.fn().mockResolvedValue({
    graphNodeId: "g1",
    entityType: "Figure",
    title: "T",
    body,
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    isTemporal: true,
    validFrom: null,
    validTo: null,
    temporalPrecision: null,
    createdAt: "2026-06-28T00:00:00Z",
    updatedAt: "2026-06-28T00:00:00Z",
  }),
  updateGraphNode: vi.fn().mockResolvedValue({ graphNodeId: "g1", body }),
  searchGraph: vi.fn().mockResolvedValue([]),
};

// The action surface the three WS4 affordances call on interaction — also
// built once for a stable reference. The components themselves are the real
// ones under test.
const contentLinkingActions = {
  addTextToNode: vi.fn().mockResolvedValue(undefined),
  addImageToNode: vi.fn().mockResolvedValue(undefined),
  linkMarkdownFileToNode: vi.fn().mockResolvedValue(undefined),
  linkNodes: vi.fn().mockResolvedValue(undefined),
};

// Real Zustand stores (not stubs) — useCanvasWorkspace subscribes to
// workspace.store / workspace.annotationStore for nodes/edges/annotations.
// Created once so their references are stable across renders.
const store = createCanvasStore({ canvasId: "c1" });
const annotationStore = createAnnotationStore({ canvasId: "c1" });

const workspaceValue = {
  store,
  annotationStore,
  transport,
  contentLinkingActions,
  entries: [],
  selectedEntryId: null,
} as unknown as ComponentProps<
  typeof CanvasWorkspaceContext.Provider
>["value"];

function renderDocument() {
  return render(
    <CanvasWorkspaceContext.Provider value={workspaceValue}>
      <GraphDocumentContent
        graphNodeId="g1"
        transport={transport as never}
        editable
      />
    </CanvasWorkspaceContext.Provider>,
  );
}

describe("GraphDocumentContent — cutover + mounted content/linking affordances", () => {
  it("renders the real node document (Neo4j-backed body) for a graph node id", async () => {
    renderDocument();
    // The real BlockNote editor renders the body loaded via readGraphNode.
    expect(await screen.findByText("Graph body")).toBeInTheDocument();
    expect(transport.readGraphNode).toHaveBeenCalledWith({ graphNodeId: "g1" });
  });

  it("mounts the WS4 content + linking affordances around the document", async () => {
    const { container } = renderDocument();
    await screen.findByText("Graph body");

    // NodeContentDropSurface wraps the document (paste/drop content target).
    expect(
      container.querySelector(".node-content-drop-surface"),
    ).not.toBeNull();

    // LinkFilePicker — the inline "Link a file…" affordance.
    expect(
      screen.getByRole("button", { name: /link a file/i }),
    ).toBeInTheDocument();

    // LinkNodePicker — the inline node→node "Link to…" relationship affordance,
    // including its typed relationship-kind selector.
    expect(screen.getByPlaceholderText(/link to/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("does not loop into an editor remount storm (stable context)", async () => {
    renderDocument();
    await screen.findByText("Graph body");
    // With a stable transport the empty-query search effect runs once, not per
    // render; searchGraph is only called for a non-empty query. A render loop
    // would have exhausted the heap before reaching this assertion.
    expect(transport.searchGraph).not.toHaveBeenCalled();
  });
});

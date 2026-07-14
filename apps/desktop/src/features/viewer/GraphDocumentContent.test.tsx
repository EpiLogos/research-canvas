import type { ComponentProps } from "react";
import { act, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createAnnotationStore, createCanvasStore } from "@research-canvas/canvas";

import { GraphDocumentAuthoringActions, GraphDocumentContent } from "./GraphDocumentContent";
import { CanvasWorkspaceContext } from "../canvas/CanvasWorkspaceContext";

let nativeDropHandler: ((event: { payload: { type: string; paths?: string[] } }) => void) | null = null;

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onDragDropEvent: vi.fn(async (handler) => {
      nativeDropHandler = handler;
      return vi.fn();
    }),
  }),
}));

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
  {
    id: "image-1",
    type: "image",
    props: { url: "assets/g1/ship.png", caption: "Company fleet" },
    content: [],
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
  // Local store is empty here, so the pane reconciles from Neo4j (readGraphNode)
  // and seeds the editor with "Graph body" — exercising the local-first mount +
  // best-effort reconcile path.
  readLocalNodeDocument: vi.fn().mockResolvedValue(null),
  upsertLocalNodeDocument: vi.fn().mockResolvedValue({
    mutation: { kind: "created" },
    document: {
      graphNodeId: "g1",
      body,
      summary: "",
      neo4jSynced: true,
      contentOrigin: "imported",
      contentRevision: 0,
      bodySourceCoordinates: [],
    },
  }),
  searchGraph: vi.fn().mockResolvedValue([]),
};

// The action surface the three WS4 affordances call on interaction — also
// built once for a stable reference. The components themselves are the real
// ones under test.
const contentLinkingActions = {
  addTextToNode: vi.fn().mockResolvedValue(undefined),
  addImageToNode: vi.fn().mockResolvedValue(undefined),
  attachFileToNode: vi.fn().mockResolvedValue(undefined),
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
  workingRoot: "/workspace/project",
} as unknown as ComponentProps<
  typeof CanvasWorkspaceContext.Provider
>["value"];

function renderDocument() {
  return render(
    <CanvasWorkspaceContext.Provider value={workspaceValue}>
      <GraphDocumentContent
        graphNodeId="g1"
        transport={transport as never}
        databasePath="/tmp/db.sqlite"
        editable
      />
    </CanvasWorkspaceContext.Provider>,
  );
}

describe("GraphDocumentContent — cutover + mounted content/linking affordances", () => {
  it("renders the real node document (Neo4j-backed body) for a graph node id", async () => {
    const { container } = renderDocument();
    // The real BlockNote editor renders the body loaded via readGraphNode.
    expect(await screen.findByText("Graph body")).toBeInTheDocument();
    expect(transport.readGraphNode).toHaveBeenCalledWith({ graphNodeId: "g1" });
    expect(container.querySelector('img[src="asset://localhost/%2Fworkspace%2Fproject%2Fassets%2Fg1%2Fship.png"]')).not.toBeNull();
  });

  it("mounts the WS4 content + linking affordances around the document", async () => {
    const { container } = renderDocument();
    await screen.findByText("Graph body");

    // NodeContentDropSurface wraps the document (paste/drop content target).
    expect(
      container.querySelector(".node-content-drop-surface"),
    ).not.toBeNull();

    // The native picker affordances (Task 2.2): "Insert image" / "Attach file".
    expect(
      screen.getByRole("button", { name: "Insert image" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Attach file" }),
    ).toBeInTheDocument();

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

  it("mounts a reader authoring drop target that sends native paths through durable attachment transport", async () => {
    const remote = {
      graphNodeId: "g1",
      entityType: "Figure",
      title: "T",
      body: "[]",
      summary: "",
      contentOrigin: "seed",
      contentRevision: 3,
      bodySourceCoordinates: [],
      seedSchemaVersion: 1,
    };
    const attachedBody = '[{"type":"image","props":{"url":"assets/attachments/hash/native.png"}}]';
    const durableTransport = {
      ...transport,
      attachNodeAttachment: vi.fn().mockResolvedValue({
        attachment: {
          id: "native-drop", graphNodeId: "g1", managedPath: "assets/attachments/hash/native.png",
          originalFilename: "native.png", mimeType: "image/png", kind: "image", contentHash: "hash",
          caption: "", role: "inline", provenanceSourcePath: "/vault/native.png", createdAt: "", updatedAt: "",
        },
        document: {
          graphNodeId: "g1", body: attachedBody, summary: "", neo4jSynced: false,
          contentOrigin: "user_authored", contentRevision: 4, bodySourceCoordinates: [],
        },
        expectedRemoteOrigin: "seed", expectedRemoteRevision: 3,
        remoteSyncEligible: true,
        graphNode: {
          ...remote,
          body: attachedBody,
          contentOrigin: "user_authored",
          contentRevision: 4,
        },
      }),
      compareAndSwapGraphNodeContent: vi.fn().mockResolvedValue({ kind: "updated" }),
      acknowledgeLocalNodeDocumentSync: vi.fn().mockResolvedValue({ kind: "updated" }),
    };
    const onGraphNodeUpdated = vi.fn();
    const readerWorkspace = {
      ...workspaceValue,
      transport: durableTransport,
      databasePath: "/workspace/research-canvas.sqlite",
    };
    Object.assign(window, { __TAURI_INTERNALS__: {} });

    render(
      <CanvasWorkspaceContext.Provider value={readerWorkspace as never}>
        <GraphDocumentAuthoringActions graphNodeId="g1" onGraphNodeUpdated={onGraphNodeUpdated} />
      </CanvasWorkspaceContext.Provider>,
    );

    await vi.waitFor(() => expect(nativeDropHandler).not.toBeNull());
    await act(async () => {
      nativeDropHandler?.({ payload: { type: "drop", paths: ["/vault/native.png"] } });
    });

    await vi.waitFor(() => {
      expect(durableTransport.attachNodeAttachment).toHaveBeenCalledWith(expect.objectContaining({
        graphNodeId: "g1",
        sourceAbsolutePath: "/vault/native.png",
        kind: "image",
        role: "inline",
      }));
      expect(onGraphNodeUpdated).toHaveBeenCalledWith(expect.objectContaining({ body: attachedBody }));
    });
    expect(contentLinkingActions.addImageToNode).not.toHaveBeenCalledWith("g1", "/vault/native.png");
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });
});

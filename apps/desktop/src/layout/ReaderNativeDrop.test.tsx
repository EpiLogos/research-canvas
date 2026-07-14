import type { ComponentProps } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAnnotationStore, createCanvasStore } from "@research-canvas/canvas";
import { createWorkspaceTransport, type GraphNode } from "@research-canvas/desktop-api";

import { CanvasWorkspaceContext } from "../features/canvas/CanvasWorkspaceContext";
import { readerRecordFromGraphNode } from "../features/viewer/readerRecord";
import { FullScreenReader } from "./FullScreenReader";
import { ReadingLens } from "./ReadingLens";

type NativeDropHandler = (event: { payload: { type: string; paths?: string[] } }) => void;

let nativeDropHandlers: NativeDropHandler[] = [];
let nativeUnlistenCalls = 0;

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onDragDropEvent: async (handler: NativeDropHandler) => {
      nativeDropHandlers.push(handler);
      return () => {
        nativeUnlistenCalls += 1;
        nativeDropHandlers = nativeDropHandlers.filter((candidate) => candidate !== handler);
      };
    },
  }),
}));

// The reader body is deliberately reduced to the rendered record body. The
// root reader, native listener, real desktop transport and local-record
// replacement all remain live; BlockNote is not relevant to this native-drop
// boundary and would obscure the state transition under test.
vi.mock("../features/viewer/NodeReaderBody", () => ({
  NodeReaderBody: ({ record }: { record?: { graphNode?: { body?: string } | null } | null }) => (
    <div data-testid="reader-root-body">{record?.graphNode?.body ?? "no graph body"}</div>
  ),
}));

interface NativeCall {
  command: string;
  args?: Record<string, unknown>;
}

const remoteGraph: GraphNode = {
  graphNodeId: "reader-native-drop",
  entityType: "Event",
  title: "Reader-native drop",
  body: '[{"type":"paragraph","content":[{"type":"text","text":"Before native drop"}]}]',
  summary: "Original reader pith",
  archetypalResonance: null,
  coordinate: null,
  sourceCoordinates: [],
  bodySourceCoordinates: [],
  evidenceTags: [],
  historicity: null,
  claimKind: null,
  evidenceStatus: null,
  temporalRole: null,
  sourceKind: null,
  placeCoverage: null,
  qlForm: null,
  qlUnitId: null,
  qlArc: null,
  qlTopology: null,
  qlSchemaVersion: null,
  qlSourceCoordinates: [],
  qlCompletenessStatus: null,
  contentOrigin: "seed",
  contentRevision: 3,
  seedSchemaVersion: 1,
  isTemporal: true,
  validFrom: "1700-01-01",
  validTo: null,
  temporalPrecision: "year",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const attachedBody = '[{"type":"image","props":{"url":"assets/attachments/native/reader-drop.png"}}]';

function graphAfterLocalAttachment(): GraphNode {
  return {
    ...remoteGraph,
    body: attachedBody,
    summary: "Attachment added",
    contentOrigin: "user_authored",
    contentRevision: 4,
    bodySourceCoordinates: [],
  };
}

function nativeCommandHarness({
  sharedGraphUnavailable = false,
  remoteCasUnavailable = false,
  localDocument = null,
}: {
  sharedGraphUnavailable?: boolean;
  remoteCasUnavailable?: boolean;
  localDocument?: {
    graphNodeId: string;
    body: string;
    summary: string;
    neo4jSynced: boolean;
    contentOrigin: "seed" | "corpus_compiled" | "user_authored" | "imported";
    contentRevision: number;
    bodySourceCoordinates: string[];
  } | null;
} = {}) {
  const calls: NativeCall[] = [];
  const invoke = async (command: string, args?: Record<string, unknown>): Promise<unknown> => {
    calls.push({ command, args });
    if (command === "read_graph_node_command") {
      if (sharedGraphUnavailable) throw new Error("SharedGraphState is unavailable");
      return remoteGraph;
    }
    if (command === "read_local_node_document_command") return localDocument;
    if (command === "attach_node_attachment_command") {
      return {
        attachment: {
          id: "reader-native-drop-attachment",
          graphNodeId: remoteGraph.graphNodeId,
          managedPath: "assets/attachments/native/reader-drop.png",
          originalFilename: "reader-drop.png",
          mimeType: "image/png",
          kind: "image",
          contentHash: "reader-native-drop-hash",
          caption: "",
          role: "image",
          provenanceSourcePath: "/vault/reader-drop.png",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
        document: {
          graphNodeId: remoteGraph.graphNodeId,
          body: attachedBody,
          summary: "Attachment added",
          neo4jSynced: false,
          contentOrigin: "user_authored",
          contentRevision: 4,
          bodySourceCoordinates: [],
        },
        expectedRemoteOrigin: "seed",
        expectedRemoteRevision: 3,
        remoteSyncEligible: true,
        graphNode: graphAfterLocalAttachment(),
      };
    }
    if (command === "compare_and_swap_graph_node_content_command") {
      if (remoteCasUnavailable) throw new Error("SharedGraphState is unavailable");
      return { kind: "updated" };
    }
    if (command === "acknowledge_local_node_document_sync_command") return { kind: "updated" };
    if (command === "read_node_attachment_presentation_command") return { cover: null };
    throw new Error(`unexpected native command: ${command}`);
  };
  return { calls, invoke };
}

function readerWorkspace() {
  const transport = createWorkspaceTransport();
  return {
    store: createCanvasStore({ canvasId: "reader-native-drop-canvas" }),
    annotationStore: createAnnotationStore({ canvasId: "reader-native-drop-canvas" }),
    entries: [],
    selectedEntryId: null,
    selectedNodeId: null,
    workingRoot: "/workspace/project",
    databasePath: "/workspace/project/research-canvas.sqlite",
    transport,
    contentLinkingActions: {
      addTextToNode: async () => { throw new Error("native reader drop must not use the fallback action"); },
      addImageToNode: async () => { throw new Error("native reader drop must not use the fallback action"); },
      attachFileToNode: async () => { throw new Error("native reader drop must not use the fallback action"); },
      linkMarkdownFileToNode: async () => { throw new Error("not used by the closed reader"); },
      linkNodes: async () => { throw new Error("not used by the closed reader"); },
    },
  } as unknown as ComponentProps<typeof CanvasWorkspaceContext.Provider>["value"];
}

async function assertClosedReaderDrop() {
  await waitFor(() => expect(nativeDropHandlers).toHaveLength(1));
  expect(screen.queryByLabelText("Reader details")).not.toBeInTheDocument();

  await act(async () => {
    nativeDropHandlers[0]?.({
      payload: { type: "drop", paths: ["/vault/reader-drop.png"] },
    });
  });

  await waitFor(() => {
    expect(screen.getByTestId("reader-root-body")).toHaveTextContent("reader-drop.png");
  });
}

describe("native drops at live reader roots", () => {
  beforeEach(() => {
    nativeDropHandlers = [];
    nativeUnlistenCalls = 0;
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("attaches through the real desktop transport and updates a closed ReadingLens", async () => {
    const native = nativeCommandHarness();
    window.__TAURI_INTERNALS__ = { invoke: native.invoke as never };
    const workspace = readerWorkspace();

    const rendered = render(
      <CanvasWorkspaceContext.Provider value={workspace}>
        <ReadingLens
          recordOverride={readerRecordFromGraphNode(remoteGraph)}
          onFullScreen={() => {}}
          onExitToCanvas={() => {}}
        />
      </CanvasWorkspaceContext.Provider>,
    );

    await assertClosedReaderDrop();
    expect(native.calls).toContainEqual({
      command: "attach_node_attachment_command",
      args: {
        request: expect.objectContaining({
          graphNodeId: remoteGraph.graphNodeId,
          sourceAbsolutePath: "/vault/reader-drop.png",
          kind: "image",
          role: "inline",
        }),
      },
    });
    expect(native.calls.some((call) => call.command === "compare_and_swap_graph_node_content_command")).toBe(true);
    rendered.unmount();
    expect(nativeDropHandlers).toHaveLength(0);
    expect(nativeUnlistenCalls).toBe(1);
  });

  it("attaches through the real desktop transport and updates a closed FullScreenReader", async () => {
    const native = nativeCommandHarness();
    window.__TAURI_INTERNALS__ = { invoke: native.invoke as never };
    const workspace = readerWorkspace();

    const rendered = render(
      <CanvasWorkspaceContext.Provider value={workspace}>
        <FullScreenReader mode="node" record={readerRecordFromGraphNode(remoteGraph)} onClose={() => {}} />
      </CanvasWorkspaceContext.Provider>,
    );

    await assertClosedReaderDrop();
    expect(native.calls).toContainEqual({
      command: "attach_node_attachment_command",
      args: {
        request: expect.objectContaining({
          graphNodeId: remoteGraph.graphNodeId,
          sourceAbsolutePath: "/vault/reader-drop.png",
          kind: "image",
          role: "inline",
        }),
      },
    });
    expect(native.calls.some((call) => call.command === "acknowledge_local_node_document_sync_command")).toBe(true);
    rendered.unmount();
    expect(nativeDropHandlers).toHaveLength(0);
    expect(nativeUnlistenCalls).toBe(1);
  });

  it("keeps attachment, local document and reader visible when SharedGraphState is unavailable", async () => {
    // This is intentionally not a mocked successful graph read. The desktop
    // command bridge has no remote graph service, yet the native attachment
    // response still carries its SQLite-durable reader projection.
    const native = nativeCommandHarness({
      sharedGraphUnavailable: true,
      remoteCasUnavailable: true,
    });
    window.__TAURI_INTERNALS__ = { invoke: native.invoke as never };
    const workspace = readerWorkspace();

    render(
      <CanvasWorkspaceContext.Provider value={workspace}>
        <ReadingLens
          recordOverride={readerRecordFromGraphNode(remoteGraph)}
          onFullScreen={() => {}}
          onExitToCanvas={() => {}}
        />
      </CanvasWorkspaceContext.Provider>,
    );

    await assertClosedReaderDrop();
    expect(native.calls.some((call) => call.command === "attach_node_attachment_command")).toBe(true);
    expect(native.calls.some((call) => call.command === "read_graph_node_command")).toBe(false);
    expect(native.calls.some((call) => call.command === "compare_and_swap_graph_node_content_command")).toBe(true);
    expect(screen.getByTestId("reader-root-body")).toHaveTextContent("reader-drop.png");
  });

  it("rehydrates a pending SQLite document when the ReadingLens is reopened", async () => {
    const localDocument = {
      graphNodeId: remoteGraph.graphNodeId,
      body: attachedBody,
      summary: "Attachment added offline",
      neo4jSynced: false,
      contentOrigin: "user_authored" as const,
      contentRevision: 4,
      bodySourceCoordinates: [],
    };
    const native = nativeCommandHarness({
      sharedGraphUnavailable: true,
      localDocument,
    });
    window.__TAURI_INTERNALS__ = { invoke: native.invoke as never };
    const workspace = readerWorkspace();

    const first = render(
      <CanvasWorkspaceContext.Provider value={workspace}>
        <ReadingLens
          recordOverride={readerRecordFromGraphNode(remoteGraph)}
          onFullScreen={() => {}}
          onExitToCanvas={() => {}}
        />
      </CanvasWorkspaceContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId("reader-root-body")).toHaveTextContent("reader-drop.png"));
    first.unmount();

    render(
      <CanvasWorkspaceContext.Provider value={workspace}>
        <ReadingLens
          recordOverride={readerRecordFromGraphNode(remoteGraph)}
          onFullScreen={() => {}}
          onExitToCanvas={() => {}}
        />
      </CanvasWorkspaceContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId("reader-root-body")).toHaveTextContent("reader-drop.png"));
    expect(native.calls.filter((call) => call.command === "read_local_node_document_command")).toHaveLength(2);
    expect(native.calls.some((call) => call.command === "read_graph_node_command")).toBe(false);
  });

  it("rehydrates a pending SQLite document when the FullScreenReader is reopened", async () => {
    const localDocument = {
      graphNodeId: remoteGraph.graphNodeId,
      body: attachedBody,
      summary: "Attachment added offline",
      neo4jSynced: false,
      contentOrigin: "user_authored" as const,
      contentRevision: 4,
      bodySourceCoordinates: [],
    };
    const native = nativeCommandHarness({
      sharedGraphUnavailable: true,
      localDocument,
    });
    window.__TAURI_INTERNALS__ = { invoke: native.invoke as never };
    const workspace = readerWorkspace();

    const first = render(
      <CanvasWorkspaceContext.Provider value={workspace}>
        <FullScreenReader mode="node" record={readerRecordFromGraphNode(remoteGraph)} onClose={() => {}} />
      </CanvasWorkspaceContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId("reader-root-body")).toHaveTextContent("reader-drop.png"));
    first.unmount();

    render(
      <CanvasWorkspaceContext.Provider value={workspace}>
        <FullScreenReader mode="node" record={readerRecordFromGraphNode(remoteGraph)} onClose={() => {}} />
      </CanvasWorkspaceContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId("reader-root-body")).toHaveTextContent("reader-drop.png"));
    expect(native.calls.filter((call) => call.command === "read_local_node_document_command")).toHaveLength(2);
    expect(native.calls.some((call) => call.command === "read_graph_node_command")).toBe(false);
  });
});

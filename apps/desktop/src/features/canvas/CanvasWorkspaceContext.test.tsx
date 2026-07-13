import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CanvasNode } from "@research-canvas/schema";

const transport = vi.hoisted(() => ({
  bootstrapWorkspace: vi.fn(),
  loadConstellationDocument: vi.fn(),
  // This integration test deliberately exercises the resilient document
  // fallback; joined-view mapping itself has dedicated real mapper tests.
  loadCanvasView: vi.fn().mockRejectedValue(new Error("joined view unavailable")),
  flushCanvasLayout: vi.fn().mockResolvedValue(true),
  persistConstellationDocument: vi.fn().mockResolvedValue(undefined),
  listPendingNodeDocumentSyncs: vi.fn().mockResolvedValue([]),
}));

vi.mock("@research-canvas/desktop-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@research-canvas/desktop-api")>();
  return { ...actual, createWorkspaceTransport: () => transport };
});

import {
  CanvasWorkspaceProvider,
  useCanvasWorkspace,
} from "./CanvasWorkspaceContext";

const ROOT_CANVAS_ID = "11111111-1111-4111-8111-111111111111";
const EPISODE_CANVAS_ID = "22222222-2222-4222-8222-222222222222";

function canvasNode(id: string, title: string, canvasId: string): CanvasNode {
  return {
    id,
    graphNodeId: id,
    canvasId,
    type: "note",
    title,
    summary: "",
    content: "[]",
    tags: [],
    position: { x: 0, y: 0 },
    size: { width: 240, height: 140 },
    sequenceCaption: null,
    sequenceViewport: null,
    createdAt: "2026-07-13T00:00:00Z",
    updatedAt: "2026-07-13T00:00:00Z",
  } as CanvasNode;
}

let latest: ReturnType<typeof useCanvasWorkspace> | null = null;

function Probe() {
  const workspace = useCanvasWorkspace();
  useEffect(() => { latest = workspace; }, [workspace]);
  return (
    <output data-testid="tab-probe">
      {`${workspace.activeCanvasTabId}|${workspace.canvasId}|${workspace.selectedNodeId ?? "none"}|${workspace.errorMessage ?? "ok"}`}
    </output>
  );
}

describe("CanvasWorkspaceProvider canvas tabs", () => {
  it("retains per-constellation selection and viewport when a tab is reactivated", async () => {
    transport.bootstrapWorkspace.mockResolvedValue({
      activeConstellationId: "root",
      databasePath: "/tmp/workspace.sqlite",
      workspaceId: "sqlite:/tmp/workspace.sqlite",
      workspaceRoot: "/workspace",
      constellations: [
        { id: "root", name: "Archetypal field", slug: "root", rootPath: "/workspace", summary: "", parentId: null, children: [] },
        { id: "episode-2", name: "Episode 2", slug: "episode-2", rootPath: "/workspace/episode-2", summary: "", parentId: "root", children: [] },
      ],
    });
    transport.loadConstellationDocument.mockImplementation(async ({ constellationId }: { constellationId: string }) => {
      const isRoot = constellationId === "root";
      const canvasId = isRoot ? ROOT_CANVAS_ID : EPISODE_CANVAS_ID;
      return {
        canvasId,
        databasePath: "/tmp/workspace.sqlite",
        entries: [],
        resourceRoots: [],
        annotations: [],
        edges: [],
        nodes: [canvasNode(
          isRoot ? "33333333-3333-4333-8333-333333333333" : "44444444-4444-4444-8444-444444444444",
          isRoot ? "Root" : "Banda",
          canvasId,
        )],
        workingRoot: isRoot ? "/workspace" : "/workspace/episode-2",
        constellation: {
          id: constellationId,
          displayName: isRoot ? "Archetypal field" : "Episode 2",
          slug: constellationId,
          parentConstellationId: isRoot ? null : "root",
          rootPath: isRoot ? "/workspace" : "/workspace/episode-2",
          primaryCanvasId: canvasId,
          summary: "",
          coverAssetPath: null,
          publishSettings: {},
          createdAt: "2026-07-13T00:00:00Z",
          updatedAt: "2026-07-13T00:00:00Z",
        },
      };
    });
    latest = null;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rendered = render(<CanvasWorkspaceProvider><Probe /></CanvasWorkspaceProvider>);

    await waitFor(() => expect(screen.getByTestId("tab-probe")).toHaveTextContent(`root:${ROOT_CANVAS_ID}|${ROOT_CANVAS_ID}|33333333-3333-4333-8333-333333333333|ok`));
    const rootViewport = { x: 120, y: -40, zoom: 1.4 };
    act(() => {
      latest!.registerCaptureViewport(() => rootViewport);
      latest!.selectNode("33333333-3333-4333-8333-333333333333");
    });

    await act(async () => { await latest!.openConstellationTab("episode-2"); });
    await waitFor(() => expect(screen.getByTestId("tab-probe")).toHaveTextContent(`episode-2:${EPISODE_CANVAS_ID}|${EPISODE_CANVAS_ID}|44444444-4444-4444-8444-444444444444|ok`));
    const episodeViewport = { x: -80, y: 24, zoom: 0.82 };
    act(() => {
      latest!.registerCaptureViewport(() => episodeViewport);
      latest!.selectNode("44444444-4444-4444-8444-444444444444");
    });

    await act(async () => { await latest!.activateCanvasTab(`root:${ROOT_CANVAS_ID}`); });
    await waitFor(() => expect(screen.getByTestId("tab-probe")).toHaveTextContent(`root:${ROOT_CANVAS_ID}|${ROOT_CANVAS_ID}|33333333-3333-4333-8333-333333333333|ok`));
    expect(latest!.activeCanvasViewport).toEqual(rootViewport);
    expect(latest!.canvasTabs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `root:${ROOT_CANVAS_ID}`, pinned: true, selectedNodeId: "33333333-3333-4333-8333-333333333333", viewport: rootViewport }),
      expect.objectContaining({ id: `episode-2:${EPISODE_CANVAS_ID}`, pinned: false, selectedNodeId: "44444444-4444-4444-8444-444444444444", viewport: episodeViewport }),
    ]));

    warning.mockRestore();
    rendered.unmount();
  });
});

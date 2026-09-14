import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppTab, CanvasNode } from "@research-canvas/schema";

const transport = vi.hoisted(() => ({
  bootstrapWorkspace: vi.fn(),
  selectProject: vi.fn(),
  resolveOrCreateHome: vi.fn(),
  createProject: vi.fn(),
  loadConstellationDocument: vi.fn(),
  loadCanvasView: vi.fn(),
  flushCanvasLayout: vi.fn(),
  persistConstellationDocument: vi.fn(),
  listPendingNodeDocumentSyncs: vi.fn(),
  loadAppTabs: vi.fn(),
  saveAppTabs: vi.fn(),
}));

vi.mock("@research-canvas/desktop-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@research-canvas/desktop-api")>();
  return { ...actual, createWorkspaceServices: () => transport };
});

import { CanvasWorkspaceProvider, useCanvasWorkspace } from "./CanvasWorkspaceContext";

const ROOT_CANVAS_ID = "11111111-1111-4111-8111-111111111111";
const EPISODE_CANVAS_ID = "22222222-2222-4222-8222-222222222222";
const ROOT_NODE_ID = "33333333-3333-4333-8333-333333333333";
const EPISODE_NODE_ID = "44444444-4444-4444-8444-444444444444";
const DATABASE = "/tmp/workspace.sqlite";

function canvasNode(id: string, title: string, canvasId: string): CanvasNode {
  return {
    id, graphNodeId: id, canvasId, type: "note", title, summary: "", content: "[]", tags: [],
    position: { x: 0, y: 0 }, size: { width: 240, height: 140 },
    sequenceCaption: null, sequenceViewport: null,
    createdAt: "2026-07-13T00:00:00Z", updatedAt: "2026-07-13T00:00:00Z",
  } as CanvasNode;
}

function projectFields(id: string) {
  const root = id === "root";
  return {
    canvasId: root ? ROOT_CANVAS_ID : EPISODE_CANVAS_ID,
    nodeId: root ? ROOT_NODE_ID : EPISODE_NODE_ID,
    title: root ? "Archetypal field" : "Historical Forms",
    path: root ? "/workspace" : "/workspace/history",
    // Deliberately a stored scope, not a frontend interpolation of the id.
    profileScope: root ? "bootstrapping" : "scope:historical-forms",
  };
}

function bootstrap(projectId = "root") {
  return {
    activeConstellationId: projectId, activeProjectId: projectId,
    activeProfileScope: projectFields(projectId).profileScope,
    databasePath: DATABASE, workspaceId: `sqlite:${DATABASE}`, workspaceRoot: "/workspace",
    constellations: ["root", "episode-2"].map((id) => ({
      id, name: projectFields(id).title, slug: id, rootPath: projectFields(id).path,
      rootType: "directory", profileScope: projectFields(id).profileScope,
      summary: "", parentId: id === "root" ? null : "root", children: [],
    })),
  };
}

function documentFor(constellationId: string) {
  const fields = projectFields(constellationId);
  return {
    canvasId: fields.canvasId, databasePath: DATABASE, entries: [], resourceRoots: [],
    annotations: [], edges: [], nodes: [canvasNode(fields.nodeId, fields.title, fields.canvasId)],
    workingRoot: fields.path,
    constellation: {
      id: constellationId, displayName: fields.title, slug: constellationId,
      parentConstellationId: constellationId === "root" ? null : "root",
      rootPath: fields.path, rootType: "directory", profileScope: fields.profileScope,
      primaryCanvasId: fields.canvasId, summary: "", coverAssetPath: null, publishSettings: {},
      createdAt: "2026-07-13T00:00:00Z", updatedAt: "2026-07-13T00:00:00Z",
    },
  };
}

function canvasTab(owner: string): AppTab {
  const fields = projectFields(owner);
  return {
    id: `${owner}:${fields.canvasId}`, surfaceId: "canvas", title: fields.title, pinned: owner === "root",
    state: {
      surfaceId: "canvas", constellationId: owner, canvasId: fields.canvasId,
      viewport: { x: 15, y: 25, zoom: 1.2 }, selectedGraphNodeId: fields.nodeId, selectedEdgeId: null,
    },
  };
}

function palaceTab(owner = "episode-2"): AppTab {
  return { id: "palace-authored", surfaceId: "palace", title: "Renamed Palace", pinned: false,
    state: { surfaceId: "palace", constellationId: owner } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

let latest: ReturnType<typeof useCanvasWorkspace> | null = null;
const getLatest = () => latest;

function Probe() {
  const workspace = useCanvasWorkspace();
  useEffect(() => { latest = workspace; }, [workspace]);
  return <output data-testid="tab-probe">
    {`${workspace.activeProfileScope ?? "none"}|${workspace.activeCanvasTabId}|${workspace.canvasId}|${workspace.selectedNodeId ?? "none"}|${workspace.errorMessage ?? "ok"}`}
  </output>;
}

async function hydrated(owner = "root") {
  await waitFor(() => {
    expect(getLatest()?.isHydrated).toBe(true);
    expect(getLatest()?.activeConstellationId).toBe(owner);
    expect(getLatest()?.activeConstellation?.id).toBe(owner);
    expect(getLatest()?.activeProjectId).toBe(owner);
    expect(getLatest()?.activeProfileScope).toBe(projectFields(owner).profileScope);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  latest = null;
  transport.bootstrapWorkspace.mockResolvedValue(bootstrap());
  transport.loadAppTabs.mockResolvedValue({ tabs: [], activeTabId: null });
  transport.saveAppTabs.mockResolvedValue(undefined);
  transport.flushCanvasLayout.mockResolvedValue(true);
  transport.persistConstellationDocument.mockResolvedValue(undefined);
  transport.listPendingNodeDocumentSyncs.mockResolvedValue([]);
  transport.selectProject.mockImplementation(async ({ projectId }: { projectId: string }) => ({
    projectId, profileScope: projectFields(projectId).profileScope, rootType: "directory",
  }));
  transport.loadConstellationDocument.mockImplementation(async ({ constellationId }: { constellationId: string }) => documentFor(constellationId));
  // Retain the original fallback coverage. The joined-view mapper and the
  // canonical local CanvasView have independent real tests; this provider must
  // preserve tab/session identity even when that read genuinely fails.
  transport.loadCanvasView.mockRejectedValue(new Error("joined view unavailable"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => { vi.restoreAllMocks(); });

describe("CanvasWorkspaceProvider canvas tabs", () => {
  it("retains per-constellation selection and viewport when a tab is reactivated", async () => {
    const rendered = render(<CanvasWorkspaceProvider><Probe /></CanvasWorkspaceProvider>);
    await hydrated();
    const rootViewport = { x: 120, y: -40, zoom: 1.4 };
    act(() => {
      latest!.registerCaptureViewport(() => rootViewport);
      latest!.selectNode(ROOT_NODE_ID);
    });
    await act(async () => { await latest!.openConstellationTab("episode-2"); });
    await hydrated("episode-2");
    expect(screen.getByTestId("tab-probe")).toHaveTextContent(`scope:historical-forms|episode-2:${EPISODE_CANVAS_ID}|${EPISODE_CANVAS_ID}|${EPISODE_NODE_ID}|ok`);
    expect(transport.selectProject).toHaveBeenLastCalledWith({ databasePath: DATABASE, projectId: "episode-2" });
    const episodeViewport = { x: -80, y: 24, zoom: 0.82 };
    act(() => {
      latest!.registerCaptureViewport(() => episodeViewport);
      latest!.selectNode(EPISODE_NODE_ID);
    });
    await act(async () => { await latest!.activateCanvasTab(`root:${ROOT_CANVAS_ID}`); });
    await hydrated();
    expect(latest!.activeCanvasViewport).toEqual(rootViewport);
    expect(latest!.canvasTabs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `root:${ROOT_CANVAS_ID}`, pinned: true, selectedNodeId: ROOT_NODE_ID, viewport: rootViewport }),
      expect.objectContaining({ id: `episode-2:${EPISODE_CANVAS_ID}`, pinned: false, selectedNodeId: EPISODE_NODE_ID, viewport: episodeViewport }),
    ]));
    expect(transport.selectProject).toHaveBeenLastCalledWith({ databasePath: DATABASE, projectId: "root" });
    rendered.unmount();
  });

  it("switches the active project and profile scope when selectProject is called", async () => {
    const rendered = render(<CanvasWorkspaceProvider><Probe /></CanvasWorkspaceProvider>);
    await hydrated();
    await act(async () => { await latest!.selectProject("episode-2"); });
    await hydrated("episode-2");
    expect(transport.selectProject).toHaveBeenCalledWith({ databasePath: DATABASE, projectId: "episode-2" });
    rendered.unmount();
  });

  it("restores persisted tabs without allowing Canvas hydration to steal a non-Canvas active surface", async () => {
    const root = canvasTab("root");
    transport.loadAppTabs.mockResolvedValue({
      tabs: [root, { id: "story-restored", surfaceId: "story", title: "Story", pinned: false, state: { surfaceId: "story" } }],
      activeTabId: "story-restored",
    });
    const rendered = render(<CanvasWorkspaceProvider><Probe /></CanvasWorkspaceProvider>);
    await hydrated();
    expect(latest!.activeSurfaceId).toBe("story");
    expect(latest!.activeTabId).toBe("story-restored");
    expect(latest!.activeTab?.state).toEqual({ surfaceId: "story", constellationId: "root" });
    expect(latest!.canvasTabs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: root.id, selectedNodeId: ROOT_NODE_ID, viewport: { x: 15, y: 25, zoom: 1.2 } }),
    ]));
    expect(transport.loadAppTabs).toHaveBeenCalledWith({ databasePath: DATABASE });
    rendered.unmount();
  });

  it("restores a Palace owner before loading any document, even when bootstrap still names Root", async () => {
    const palace = palaceTab();
    const selection = deferred<{ projectId: string; profileScope: string; rootType: string }>();
    transport.selectProject.mockReturnValue(selection.promise);
    transport.loadAppTabs.mockResolvedValue({ tabs: [canvasTab("root"), canvasTab("episode-2"), palace], activeTabId: palace.id });
    const rendered = render(<CanvasWorkspaceProvider><Probe /></CanvasWorkspaceProvider>);
    await waitFor(() => expect(transport.selectProject).toHaveBeenCalledWith({ databasePath: DATABASE, projectId: "episode-2" }));
    expect(getLatest()?.isHydrated).toBe(false);
    expect(transport.loadConstellationDocument).not.toHaveBeenCalled();
    await act(async () => selection.resolve({ projectId: "episode-2", profileScope: "scope:historical-forms", rootType: "directory" }));
    await hydrated("episode-2");
    expect(latest!.activeTab).toEqual(palace);
    expect(latest!.activeSurfaceId).toBe("palace");
    expect(latest!.workingRoot).toBe("/workspace/history");
    expect(transport.loadConstellationDocument.mock.calls.every(([input]) => input.constellationId === "episode-2")).toBe(true);
    rendered.unmount();
  });

  it("opens the requested constellation's Canvas when navigation starts from another project's Story", async () => {
    const rendered = render(<CanvasWorkspaceProvider><Probe /></CanvasWorkspaceProvider>);
    await hydrated();
    act(() => latest!.openTab({ id: "root-story", surfaceId: "story", title: "Root Story", pinned: false, state: { surfaceId: "story" } }));
    await waitFor(() => expect(latest!.activeSurfaceId).toBe("story"));
    await act(async () => { await latest!.openConstellationTab("episode-2"); });
    await hydrated("episode-2");
    expect(latest!.activeCanvasTabId).toBe(`episode-2:${EPISODE_CANVAS_ID}`);
    expect(latest!.activeSurfaceId).toBe("canvas");
    expect(latest!.tabs.find((tab) => tab.id === "root-story")?.state).toEqual({ surfaceId: "story", constellationId: "root" });
    rendered.unmount();
  });

  it("activates a scoped Palace and restores the successor project's identity when that tab is closed", async () => {
    const rendered = render(<CanvasWorkspaceProvider><Probe /></CanvasWorkspaceProvider>);
    await hydrated();
    act(() => latest!.openTab(palaceTab()));
    await hydrated("episode-2");
    await waitFor(() => expect(latest!.activeSurfaceId).toBe("palace"));
    // Keep Root adjacent to the Palace so closing it exercises a cross-project
    // successor rather than relying on the implementation's insertion order.
    const root = latest!.tabs.find((tab) => tab.id === `root:${ROOT_CANVAS_ID}`)!;
    act(() => latest!.tabManager.getState().hydrate({ tabs: [root, palaceTab()], activeTabId: "palace-authored" }));
    await act(async () => { await latest!.closeCanvasTab("palace-authored"); });
    await hydrated();
    expect(latest!.activeCanvasTabId).toBe(root.id);
    expect(transport.selectProject).toHaveBeenLastCalledWith({ databasePath: DATABASE, projectId: "root" });
    rendered.unmount();
  });

  it("does not change durable identity when saving the current canvas fails", async () => {
    const rendered = render(<CanvasWorkspaceProvider><Probe /></CanvasWorkspaceProvider>);
    await hydrated();
    transport.flushCanvasLayout.mockResolvedValue(false);
    await act(async () => {
      await expect(latest!.selectProject("episode-2")).rejects.toThrow("failed to persist canvas layout");
    });
    expect(transport.selectProject).not.toHaveBeenCalled();
    expect(latest!.activeProjectId).toBe("root");
    expect(latest!.errorMessage).toContain("failed to persist canvas layout");
    expect(latest!.isHydrated).toBe(false);
    rendered.unmount();
  });

  it("persists the same scoped Palace tab through a fresh provider mount without browser storage", async () => {
    let durableOwner = "root";
    let durableTabs: { tabs: AppTab[]; activeTabId: string | null } = { tabs: [], activeTabId: null };
    transport.bootstrapWorkspace.mockImplementation(async () => bootstrap(durableOwner));
    transport.loadAppTabs.mockImplementation(async () => structuredClone(durableTabs));
    transport.saveAppTabs.mockImplementation(async ({ tabs, activeTabId }: typeof durableTabs) => {
      durableTabs = structuredClone({ tabs, activeTabId });
    });
    transport.selectProject.mockImplementation(async ({ projectId }: { projectId: string }) => {
      durableOwner = projectId;
      return { projectId, profileScope: projectFields(projectId).profileScope, rootType: "directory" };
    });
    const first = render(<CanvasWorkspaceProvider><Probe /></CanvasWorkspaceProvider>);
    await hydrated();
    await act(async () => { await latest!.openConstellationTab("episode-2"); });
    await hydrated("episode-2");
    act(() => latest!.openTab({ ...palaceTab(), state: { surfaceId: "palace" } }));
    await waitFor(() => {
      expect(durableTabs.activeTabId).toBe("palace-authored");
      expect(durableTabs.tabs.find((tab) => tab.id === "palace-authored")?.state).toEqual({ surfaceId: "palace", constellationId: "episode-2" });
    });
    first.unmount();
    latest = null;
    transport.loadConstellationDocument.mockClear();
    const second = render(<CanvasWorkspaceProvider><Probe /></CanvasWorkspaceProvider>);
    await hydrated("episode-2");
    expect(latest!.activeSurfaceId).toBe("palace");
    expect(latest!.activeTabId).toBe("palace-authored");
    expect(transport.loadConstellationDocument.mock.calls.every(([input]) => input.constellationId === "episode-2")).toBe(true);
    second.unmount();
  });
});

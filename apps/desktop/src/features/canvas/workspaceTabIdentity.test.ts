import { describe, expect, it, vi } from "vitest";
import { appTabSchema, type AppTab } from "@research-canvas/schema";
import type { WorkspaceBootstrap } from "@research-canvas/desktop-api";
import { bindSurfaceTab, createSerialWorkspaceQueue, restoreTabWorkspace, tabConstellationId } from "./workspaceTabIdentity";

const workspace: WorkspaceBootstrap = {
  databasePath: "/tmp/workspace.sqlite",
  workspaceId: "sqlite:/tmp/workspace.sqlite",
  workspaceRoot: "/workspace",
  activeConstellationId: "root",
  activeProjectId: "root",
  activeProfileScope: "bootstrapping",
  constellations: [{
    id: "root", name: "Root", slug: "root", rootPath: "/workspace", rootType: "directory",
    profileScope: "bootstrapping", summary: "", parentId: null,
    children: [{
      id: "historical", name: "Historical Forms", slug: "historical-forms", rootPath: "/workspace/history",
      rootType: "directory", profileScope: "scope:stored-by-backend", summary: "", parentId: "root", children: [],
    }],
  }],
};

function palace(owner?: string): AppTab {
  return {
    id: "palace-tab", surfaceId: "palace", title: "A renamed room collection", pinned: false,
    state: { surfaceId: "palace", ...(owner ? { constellationId: owner } : {}) },
  };
}

function selectionPort() {
  return { selectProject: vi.fn(async ({ projectId }: { databasePath: string; projectId: string }) => ({
    projectId, profileScope: "scope:stored-by-backend", rootType: "directory" as const,
  })) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("persistent surface ownership", () => {
  it.each<AppTab["state"]>([
    { surfaceId: "canvas", constellationId: "historical", canvasId: "canvas-historical", viewport: { x: 1, y: 2, zoom: 3 } },
    { surfaceId: "timeline", centerYear: 1600, pixelsPerYear: 4 },
    { surfaceId: "places", viewport: { x: 120, y: -5, zoom: 3 } },
    { surfaceId: "story" },
    { surfaceId: "palace" },
  ])("retains identity through schema and JSON for $surfaceId", (state) => {
    const tab: AppTab = { id: state.surfaceId, surfaceId: state.surfaceId, state, title: "Renamed", pinned: false };
    const bound = bindSurfaceTab(tab, "historical");
    const restored = appTabSchema.parse(JSON.parse(JSON.stringify(bound)));
    expect(tabConstellationId(restored)).toBe("historical");
    expect(restored.state).toEqual({ ...state, constellationId: "historical" });
  });

  it("does not transfer an owned tab when another project becomes current", () => {
    const original = palace("historical");
    expect(bindSurfaceTab(original, "root")).toBe(original);
    const projects: AppTab = { id: "projects", surfaceId: "projects", title: "Projects", pinned: false, state: { surfaceId: "projects" } };
    expect(bindSurfaceTab(projects, "historical")).toBe(projects);
  });

  it("resolves an active Palace owner before publishing any restored workspace state", async () => {
    const selected = deferred<{ projectId: string; profileScope: string; rootType: "directory" }>();
    const transport = { selectProject: vi.fn(() => selected.promise) };
    const original = palace("historical");
    const result = restoreTabWorkspace(transport, workspace, { tabs: [original], activeTabId: original.id });
    let published = false;
    void result.then(() => { published = true; });
    await Promise.resolve();
    expect(published).toBe(false);
    expect(transport.selectProject).toHaveBeenCalledWith({ databasePath: workspace.databasePath, projectId: "historical" });
    selected.resolve({ projectId: "historical", profileScope: "scope:stored-by-backend", rootType: "directory" });
    const restored = await result;
    expect(restored.workspace).toMatchObject({ activeConstellationId: "historical", activeProjectId: "historical", activeProfileScope: "scope:stored-by-backend" });
    expect(restored.snapshot).toEqual({ tabs: [original], activeTabId: original.id });
    expect(workspace.activeProjectId).toBe("root");
  });

  it("binds only the active legacy tab to the durable current workspace, never guesses from titles", async () => {
    const transport = selectionPort();
    const active = { ...palace(), title: "Historical Forms · Palace" };
    const inactive = { ...palace(), id: "inactive" };
    const restored = await restoreTabWorkspace(transport, workspace, { tabs: [active, inactive], activeTabId: active.id });
    expect(transport.selectProject).not.toHaveBeenCalled();
    expect(tabConstellationId(restored.snapshot.tabs[0])).toBe("root");
    expect(tabConstellationId(restored.snapshot.tabs[1])).toBeNull();
  });

  it("refuses to mount a missing persisted owner as Root", async () => {
    const transport = selectionPort();
    const active = palace("removed");
    await expect(restoreTabWorkspace(transport, workspace, { tabs: [active], activeTabId: active.id })).rejects.toThrow("constellation removed is not in this workspace");
    expect(transport.selectProject).not.toHaveBeenCalled();
  });

  it("does not publish an identity that the selection port substituted", async () => {
    const transport = { selectProject: vi.fn(async () => ({ projectId: "root", profileScope: "bootstrapping", rootType: "directory" as const })) };
    const active = palace("historical");
    await expect(restoreTabWorkspace(transport, workspace, { tabs: [active], activeTabId: active.id })).rejects.toThrow("instead of tab owner historical");
  });
});

describe("workspace write ordering", () => {
  it("cannot persist an older snapshot after a newer one", async () => {
    const enqueue = createSerialWorkspaceQueue();
    const first = deferred<void>();
    const writes: string[] = [];
    const older = enqueue(async () => { writes.push("old:start"); await first.promise; writes.push("old:finish"); });
    const newer = enqueue(async () => { writes.push("new:start"); writes.push("new:finish"); return "new"; });
    await Promise.resolve();
    expect(writes).toEqual(["old:start"]);
    first.resolve(undefined);
    await older;
    expect(await newer).toBe("new");
    expect(writes).toEqual(["old:start", "old:finish", "new:start", "new:finish"]);
  });

  it("reports a failed write without stranding later writes", async () => {
    const enqueue = createSerialWorkspaceQueue();
    const failure = enqueue(async () => { throw new Error("disk unavailable"); });
    const next = enqueue(async () => "saved");
    await expect(failure).rejects.toThrow("disk unavailable");
    await expect(next).resolves.toBe("saved");
  });
});

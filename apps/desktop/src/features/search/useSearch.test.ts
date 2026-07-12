import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSearch } from "./useSearch";

type SearchHit = {
  entityId: string;
  entityType: string;
  projectId: string;
  snippet: string;
  title: string;
  relativePath?: string;
  summary?: string;
};

const workspaceMock = vi.hoisted(() => {
  const pendingSearchResolvers: Array<(hits: SearchHit[]) => void> = [];

  return {
    createNoteNode: vi.fn(),
    pendingSearchResolvers,
    searchProject: vi.fn(
      () =>
        new Promise<SearchHit[]>((resolve) => {
          pendingSearchResolvers.push(resolve);
        })
    )
  };
});

vi.mock("../canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => ({
    entries: [],
    nodes: [],
    createNoteNode: workspaceMock.createNoteNode,
    selectEntry: vi.fn(),
    selectNode: vi.fn(),
    selectConstellation: vi.fn(),
    searchConstellation: vi.fn().mockResolvedValue([]),
    constellationId: "p1",
  }),
}));

async function settleSearchEffects() {
  await act(async () => {
    while (workspaceMock.pendingSearchResolvers.length > 0) {
      const resolveSearch = workspaceMock.pendingSearchResolvers.shift();
      resolveSearch?.([]);
      await Promise.resolve();
    }
  });
}

beforeEach(() => {
  workspaceMock.createNoteNode.mockClear();
  workspaceMock.searchProject.mockClear();
  workspaceMock.pendingSearchResolvers.splice(0);
});

async function titles(query: string, options?: Parameters<typeof useSearch>[1]) {
  const { result } = renderHook(() => useSearch(query, options));
  await settleSearchEffects();
  return result.current.map((i) => i.title);
}

describe("useSearch command items", () => {
  it("always offers Create note", async () => {
    expect(await titles("create")).toContain("Create note");
  });

  it("offers lens commands only when onSetLens is provided", async () => {
    expect(await titles("go", {})).not.toContain("Go to Timeline");
    expect(await titles("go", { onSetLens: vi.fn() })).toContain("Go to Timeline");
  });

  it("Toggle terminal command fires the injected action", async () => {
    const onToggleTerminal = vi.fn();
    const { result } = renderHook(() => useSearch("terminal", { onToggleTerminal }));
    await settleSearchEffects();
    const cmd = result.current.find((i) => i.title === "Toggle terminal");
    expect(cmd).toBeDefined();
    cmd!.onSelect();
    expect(onToggleTerminal).toHaveBeenCalledTimes(1);
  });

  it("no longer offers the removed Export project command", async () => {
    expect(await titles("export", { onSetLens: vi.fn(), onToggleTerminal: vi.fn() })).not.toContain("Export project");
  });
});

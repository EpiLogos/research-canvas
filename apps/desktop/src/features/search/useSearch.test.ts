import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSearch } from "./useSearch";

const createNoteNode = vi.fn();
vi.mock("../canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => ({
    entries: [],
    nodes: [],
    createNoteNode,
    selectEntry: vi.fn(),
    selectNode: vi.fn(),
    selectProject: vi.fn(),
    searchProject: vi.fn().mockResolvedValue([]),
    projectId: "p1",
  }),
}));

function titles(query: string, options?: Parameters<typeof useSearch>[1]) {
  const { result } = renderHook(() => useSearch(query, options));
  return result.current.map((i) => i.title);
}

describe("useSearch command items", () => {
  it("always offers Create note", () => {
    expect(titles("create")).toContain("Create note");
  });

  it("offers lens commands only when onSetLens is provided", () => {
    expect(titles("go", {})).not.toContain("Go to Timeline");
    expect(titles("go", { onSetLens: vi.fn() })).toContain("Go to Timeline");
  });

  it("Toggle terminal command fires the injected action", () => {
    const onToggleTerminal = vi.fn();
    const { result } = renderHook(() => useSearch("terminal", { onToggleTerminal }));
    const cmd = result.current.find((i) => i.title === "Toggle terminal");
    expect(cmd).toBeDefined();
    cmd!.onSelect();
    expect(onToggleTerminal).toHaveBeenCalledTimes(1);
  });

  it("no longer offers the removed Export project command", () => {
    expect(titles("export", { onSetLens: vi.fn(), onToggleTerminal: vi.fn() })).not.toContain("Export project");
  });
});

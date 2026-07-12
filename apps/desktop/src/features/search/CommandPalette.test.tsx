import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommandPalette } from "./CommandPalette";

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
    createNoteNode: vi.fn(),
    selectEntry: vi.fn(),
    selectNode: vi.fn(),
    selectProject: vi.fn(),
    searchProject: workspaceMock.searchProject,
    projectId: "p1",
  }),
}));

describe("CommandPalette", () => {
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
    workspaceMock.searchProject.mockClear();
    workspaceMock.pendingSearchResolvers.splice(0);
  });

  it("renders nothing when closed", () => {
    render(<CommandPalette isOpen={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
  });

  it("runs a lens command and closes", async () => {
    const onSetLens = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette isOpen onClose={onClose} onSetLens={onSetLens} onToggleTerminal={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search workspace"), { target: { value: "timeline" } });
    await settleSearchEffects();
    fireEvent.click(screen.getByRole("button", { name: /Go to Timeline command/ }));
    expect(onSetLens).toHaveBeenCalledWith("timeline");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

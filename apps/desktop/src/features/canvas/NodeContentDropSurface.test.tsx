import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createAnnotationStore, createCanvasStore } from "@research-canvas/canvas";

import { NodeContentDropSurface } from "./NodeContentDropSurface";
import { CanvasWorkspaceContext } from "./CanvasWorkspaceContext";

let nativeDropHandler: ((event: { payload: { type: string; paths?: string[] } }) => void) | null = null;

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onDragDropEvent: vi.fn(async (handler) => {
      nativeDropHandler = handler;
      return vi.fn();
    }),
  }),
}));

function makeFileList(files: File[]): FileList {
  const list = {
    ...files,
    length: files.length,
    item: (index: number) => files[index] ?? null,
  };
  return list as unknown as FileList;
}

function renderSurface(contentLinkingActions: Record<string, ReturnType<typeof vi.fn>>) {
  const workspaceValue = {
    store: createCanvasStore({ canvasId: "c1" }),
    annotationStore: createAnnotationStore({ canvasId: "c1" }),
    contentLinkingActions,
    entries: [],
    selectedEntryId: null,
  } as unknown as React.ComponentProps<typeof CanvasWorkspaceContext.Provider>["value"];

  return render(
    <CanvasWorkspaceContext.Provider value={workspaceValue}>
      <NodeContentDropSurface graphNodeId="n1">
        <p>document body</p>
      </NodeContentDropSurface>
    </CanvasWorkspaceContext.Provider>,
  );
}

describe("NodeContentDropSurface — drop/paste error surfacing", () => {
  it("uses the native Tauri drop payload paths rather than a non-existent File.path", async () => {
    const contentLinkingActions = {
      addTextToNode: vi.fn(),
      addImageToNode: vi.fn().mockResolvedValue(undefined),
      attachFileToNode: vi.fn().mockResolvedValue(undefined),
      linkMarkdownFileToNode: vi.fn(),
      linkNodes: vi.fn(),
    };
    Object.assign(window, { __TAURI_INTERNALS__: {} });
    renderSurface(contentLinkingActions);

    await vi.waitFor(() => expect(nativeDropHandler).not.toBeNull());
    nativeDropHandler?.({
      payload: { type: "drop", paths: ["/vault/images/real-origin.png", "/vault/notes/evidence.pdf"] },
    });

    await vi.waitFor(() => {
      expect(contentLinkingActions.addImageToNode).toHaveBeenCalledWith("n1", "/vault/images/real-origin.png");
      expect(contentLinkingActions.attachFileToNode).toHaveBeenCalledWith("n1", "/vault/notes/evidence.pdf", "evidence.pdf");
    });
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("surfaces a visible error instead of silently dropping when a dropped File has no .path (Tauri v2)", async () => {
    const contentLinkingActions = {
      addTextToNode: vi.fn(),
      addImageToNode: vi.fn(),
      attachFileToNode: vi.fn(),
      linkMarkdownFileToNode: vi.fn(),
      linkNodes: vi.fn(),
    };
    renderSurface(contentLinkingActions);

    // A dropped image File in Tauri v2 has no `.path` property.
    const file = new File(["binarydata"], "cat.png", { type: "image/png" });
    const dataTransfer = {
      files: makeFileList([file]),
      getData: () => "",
    };

    fireEvent.drop(screen.getByText("document body").parentElement!, { dataTransfer });

    expect(await screen.findByRole("alert")).toHaveTextContent(/insert image|attach file/i);
    // Silently dropping means addImageToNode is never called — the fix must
    // route to a visible error, not a call with an undefined path.
    expect(contentLinkingActions.addImageToNode).not.toHaveBeenCalled();
  });

  it("still ingests a dropped file that DOES carry a .path (non-Tauri or shimmed environments)", async () => {
    const contentLinkingActions = {
      addTextToNode: vi.fn(),
      addImageToNode: vi.fn().mockResolvedValue(undefined),
      attachFileToNode: vi.fn(),
      linkMarkdownFileToNode: vi.fn(),
      linkNodes: vi.fn(),
    };
    renderSurface(contentLinkingActions);

    const file = new File(["binarydata"], "cat.png", { type: "image/png" });
    Object.defineProperty(file, "path", { value: "/abs/path/cat.png" });
    const dataTransfer = {
      files: makeFileList([file]),
      getData: () => "",
    };

    fireEvent.drop(screen.getByText("document body").parentElement!, { dataTransfer });

    await vi.waitFor(() => {
      expect(contentLinkingActions.addImageToNode).toHaveBeenCalledWith("n1", "/abs/path/cat.png");
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces an error if a linking action throws instead of swallowing it", async () => {
    const contentLinkingActions = {
      addTextToNode: vi.fn().mockRejectedValue(new Error("neo4j unreachable")),
      addImageToNode: vi.fn(),
      attachFileToNode: vi.fn(),
      linkMarkdownFileToNode: vi.fn(),
      linkNodes: vi.fn(),
    };
    renderSurface(contentLinkingActions);

    const dataTransfer = {
      files: makeFileList([]),
      getData: () => "hello world",
    };

    fireEvent.drop(screen.getByText("document body").parentElement!, { dataTransfer });

    expect(await screen.findByRole("alert")).toHaveTextContent(/neo4j unreachable/i);
  });
});

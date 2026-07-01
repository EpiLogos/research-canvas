import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { GraphNode } from "@research-canvas/desktop-api";

import { NodeDocumentPane } from "./NodeDocumentPane";

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

function makeNode(body: string): GraphNode {
  return {
    graphNodeId: "n1",
    entityType: "Figure",
    title: "Test node",
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
  };
}

describe("NodeDocumentPane", () => {
  it("reads the node body and renders it in the editor", async () => {
    const body = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Loaded body", styles: {} }],
        children: [],
      },
    ]);
    const transport = {
      readGraphNode: vi.fn().mockResolvedValue(makeNode(body)),
      updateGraphNode: vi.fn().mockResolvedValue(makeNode(body)),
    };

    render(<NodeDocumentPane graphNodeId="n1" transport={transport} editable={false} />);

    expect(transport.readGraphNode).toHaveBeenCalledWith({ graphNodeId: "n1" });
    expect(await screen.findByText("Loaded body")).toBeInTheDocument();
  });

  it("shows an error status when the initial read fails", async () => {
    const transport = {
      readGraphNode: vi.fn().mockRejectedValue(new Error("read failed")),
      updateGraphNode: vi.fn(),
    };

    render(<NodeDocumentPane graphNodeId="n1" transport={transport} />);

    await waitFor(() =>
      expect(screen.getByText(/read failed/i)).toBeInTheDocument()
    );
  });

  it("flushes the dirty body on unmount (crash-safe close flush)", async () => {
    const body = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Loaded body", styles: {} }],
        children: [],
      },
    ]);
    const edited = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Edited body", styles: {} }],
        children: [],
      },
    ]);
    const transport = {
      readGraphNode: vi.fn().mockResolvedValue(makeNode(body)),
      updateGraphNode: vi.fn().mockResolvedValue(makeNode(edited)),
    };

    const { unmount } = render(
      <NodeDocumentPane graphNodeId="n1" transport={transport} __testSetBody={edited} />
    );

    // Wait for the editor to mount, then make a dirty edit that has NOT yet
    // been flushed by the debounce.
    await screen.findByText("Loaded body");
    fireEvent.click(screen.getByTestId("set-body"));

    // Closing the view must force a final write of the dirty body.
    unmount();

    await waitFor(() => expect(transport.updateGraphNode).toHaveBeenCalled());
    expect(transport.updateGraphNode).toHaveBeenLastCalledWith({
      graphNodeId: "n1",
      patch: expect.objectContaining({ body: edited }),
    });
  });

  it("surfaces a failed close flush instead of swallowing it", async () => {
    const body = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Loaded body", styles: {} }],
        children: [],
      },
    ]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const transport = {
      readGraphNode: vi.fn().mockResolvedValue(makeNode(body)),
      updateGraphNode: vi.fn().mockRejectedValue(new Error("close write failed")),
    };

    const edited = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Edited body", styles: {} }],
        children: [],
      },
    ]);
    const { unmount } = render(
      <NodeDocumentPane graphNodeId="n1" transport={transport} __testSetBody={edited} />
    );
    await screen.findByText("Loaded body");
    fireEvent.click(screen.getByTestId("set-body"));

    unmount();

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(errorSpy.mock.calls.flat().join(" ")).toMatch(/close write failed/i);
    errorSpy.mockRestore();
  });
});

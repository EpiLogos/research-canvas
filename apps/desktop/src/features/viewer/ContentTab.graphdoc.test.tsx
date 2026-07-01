import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { GraphDocumentContent } from "./ContentTab";

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

describe("GraphDocumentContent", () => {
  it("renders the node document for a graph node id", async () => {
    const body = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Graph body", styles: {} }],
        children: [],
      },
    ]);
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
      updateGraphNode: vi.fn(),
    };

    render(<GraphDocumentContent graphNodeId="g1" transport={transport} />);

    expect(await screen.findByText("Graph body")).toBeInTheDocument();
  });
});

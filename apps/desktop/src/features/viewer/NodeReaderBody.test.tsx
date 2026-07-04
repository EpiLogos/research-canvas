import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NodeReaderBody } from "./NodeReaderBody";

vi.mock("../canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => ({ updateNodeContent: vi.fn() }),
}));

vi.mock("./NodeDocumentPane", () => ({
  NodeDocumentPane: ({ graphNodeId }: { graphNodeId: string }) => (
    <div data-testid="doc-pane">doc:{graphNodeId}</div>
  ),
}));

vi.mock("./NodeContentPane", () => ({
  NodeContentPane: ({ node }: { node: { id: string } }) => (
    <div data-testid="content-pane">content:{node.id}</div>
  ),
}));

describe("NodeReaderBody", () => {
  it("renders the document pane for a graph-backed node", () => {
    const node = { id: "n1", title: "T", type: "note", graphNodeId: "g-1" } as never;
    render(<NodeReaderBody node={node} />);
    expect(screen.getByTestId("doc-pane")).toHaveTextContent("doc:g-1");
  });

  it("renders the content pane for a node without a graphNodeId", () => {
    const node = { id: "n2", title: "T", type: "note" } as never;
    render(<NodeReaderBody node={node} />);
    expect(screen.getByTestId("content-pane")).toHaveTextContent("content:n2");
  });
});

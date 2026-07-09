import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NodeReaderBody } from "./NodeReaderBody";

vi.mock("../canvas/CanvasWorkspaceContext", () => ({
  useCanvasWorkspace: () => ({ updateNodeContent: vi.fn() }),
}));

vi.mock("@research-canvas/desktop-api", () => ({
  createWorkspaceTransport: () => ({}),
  readWorkspaceTextFile: vi.fn().mockResolvedValue("# Resource body"),
}));

vi.mock("./GraphDocumentContent", () => ({
  GraphDocumentContent: ({ graphNodeId }: { graphNodeId: string }) => (
    <div data-testid="doc-pane">doc:{graphNodeId}</div>
  ),
}));

vi.mock("./NodeContentPane", () => ({
  NodeContentPane: ({ node }: { node: { id: string } }) => (
    <div data-testid="content-pane">content:{node.id}</div>
  ),
}));

vi.mock("./NodeDocumentPane", () => ({
  NodeDocumentPane: ({ graphNodeId }: { graphNodeId: string }) => (
    <div data-testid="bare-doc-pane">bare:{graphNodeId}</div>
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

  it("renders GraphDocumentContent (affordances) for a graph node by default", () => {
    const node = { id: "n1", title: "T", type: "note", graphNodeId: "g-1" } as never;
    render(<NodeReaderBody node={node} />);
    expect(screen.getByTestId("doc-pane")).toHaveTextContent("doc:g-1");
    expect(screen.queryByTestId("bare-doc-pane")).not.toBeInTheDocument();
  });

  it("renders a resource node as file content even when it has a graphNodeId", () => {
    const node = {
      id: "resource-1",
      title: "Primary source",
      type: "resource",
      graphNodeId: "g-resource-1",
      resourceKind: "pdf",
      absolutePath: "/workspace/source.pdf",
      relativePath: "source.pdf",
    } as never;

    render(<NodeReaderBody node={node} />);

    expect(screen.getByTestId("content-pane")).toHaveTextContent("content:resource-1");
    expect(screen.queryByTestId("doc-pane")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bare-doc-pane")).not.toBeInTheDocument();
  });

  it("renders a bare document pane when affordances is false", () => {
    const node = { id: "n1", title: "T", type: "note", graphNodeId: "g-1" } as never;
    render(<NodeReaderBody node={node} affordances={false} />);
    expect(screen.getByTestId("bare-doc-pane")).toHaveTextContent("bare:g-1");
    expect(screen.queryByTestId("doc-pane")).not.toBeInTheDocument();
  });
});

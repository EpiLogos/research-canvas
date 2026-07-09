import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { NoteNode } from "./NoteNode";

vi.mock("@xyflow/react", () => ({
  Handle: ({ id }: { id: string }) => <span data-testid={`handle-${id}`} />,
  NodeResizeControl: ({ children, position }: { children: ReactNode; position: string }) => (
    <span data-testid={`resize-control-${position}`}>{children}</span>
  ),
  Position: {
    Top: "top",
    Right: "right",
    Bottom: "bottom",
    Left: "left",
  },
}));

describe("NoteNode", () => {
  it("applies persisted canvas appearance style to the rendered note", () => {
    const props = {
      id: "note-1",
      type: "note",
      selected: false,
      selectable: true,
      deletable: true,
      draggable: true,
      isConnectable: true,
      zIndex: 0,
      xPos: 0,
      yPos: 0,
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
      dragging: false,
      data: {
        title: "Styled note",
        content: "Visible content",
        tags: ["ql", "shadow"],
        style: {
          dotColour: "#8fd3ff",
          bgColour: "#102436",
          textColour: "#f5fbff",
          thumbnail: "asset://localhost/thumb.png",
        },
      },
    } as Parameters<typeof NoteNode>[0];

    render(
      <NoteNode {...props} />
    );

    const note = screen.getByTestId("note-node-surface");
    expect(note).toHaveStyle({
      backgroundColor: "#102436",
      color: "#f5fbff",
    });
    expect(note).toHaveStyle("--node-accent: #8fd3ff");
    expect(screen.getByText("Visible content")).toHaveStyle({ color: "#f5fbff" });
    expect(screen.getByText("ql")).toBeInTheDocument();
    expect(screen.getByText("shadow")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Styled note" })).toHaveAttribute(
      "src",
      "asset://localhost/thumb.png",
    );
  });

  it("offers resize controls on all four corners", () => {
    const props = {
      id: "note-1",
      type: "note",
      selected: true,
      selectable: true,
      deletable: true,
      draggable: true,
      isConnectable: true,
      zIndex: 0,
      xPos: 0,
      yPos: 0,
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
      dragging: false,
      data: {
        title: "Resizable note",
        content: "Visible content",
      },
    } as Parameters<typeof NoteNode>[0];

    render(<NoteNode {...props} />);

    expect(screen.getByTestId("resize-control-top-left")).toBeInTheDocument();
    expect(screen.getByTestId("resize-control-top-right")).toBeInTheDocument();
    expect(screen.getByTestId("resize-control-bottom-left")).toBeInTheDocument();
    expect(screen.getByTestId("resize-control-bottom-right")).toBeInTheDocument();
  });
});

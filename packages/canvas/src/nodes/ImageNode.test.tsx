import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ImageNode } from "./ImageNode";

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

describe("ImageNode", () => {
  it("renders an image and caption", () => {
    const props = {
      id: "image-1",
      type: "image",
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
        title: "Sunset",
        src: "/tmp/sunset.png",
        caption: "over the marsh",
      },
    } as Parameters<typeof ImageNode>[0];

    render(<ImageNode {...props} />);

    const node = screen.getByTestId("image-node-image-1");
    expect(node).toBeInTheDocument();
    const img = screen.getByAltText("over the marsh");
    expect(img).toHaveAttribute("src", "/tmp/sunset.png");
    expect(screen.getByText("over the marsh")).toBeInTheDocument();
  });

  it("shows a caption input when selected and calls back on change", () => {
    const onCaptionChange = vi.fn();
    const props = {
      id: "image-2",
      type: "image",
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
        title: "Portrait",
        src: "/tmp/portrait.png",
        caption: "",
        onCaptionChange,
      },
    } as Parameters<typeof ImageNode>[0];

    render(<ImageNode {...props} />);

    const input = screen.getByPlaceholderText("Caption");
    expect(input).toBeInTheDocument();
    input.focus();
    expect(onCaptionChange).not.toHaveBeenCalled();
  });
});

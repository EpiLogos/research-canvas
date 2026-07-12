import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BottomDock } from "./BottomDock";

describe("BottomDock", () => {
  it("renders nothing when closed", () => {
    render(
      <BottomDock open={false} height={200} width={640} label="Terminal" onClose={() => {}} onResizeStart={() => {}} onWidthResizeStart={() => {}}>
        <div>session</div>
      </BottomDock>,
    );
    expect(screen.queryByTestId("bottom-dock")).not.toBeInTheDocument();
  });

  it("renders children and title when open", () => {
    render(
      <BottomDock open height={200} width={640} label="Terminal · antichrist" onClose={() => {}} onResizeStart={() => {}} onWidthResizeStart={() => {}}>
        <div>session-body</div>
      </BottomDock>,
    );
    expect(screen.getByTestId("bottom-dock")).toBeVisible();
    expect(screen.getByText("Terminal · antichrist")).toBeInTheDocument();
    expect(screen.getByText("session-body")).toBeInTheDocument();
  });

  it("calls onClose from the close button", () => {
    const onClose = vi.fn();
    render(
      <BottomDock open height={200} width={640} label="Terminal" onClose={onClose} onResizeStart={() => {}} onWidthResizeStart={() => {}}>
        <div>x</div>
      </BottomDock>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close terminal" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("applies the height to the dock element", () => {
    render(
      <BottomDock open height={321} width={777} label="Terminal" onClose={() => {}} onResizeStart={() => {}} onWidthResizeStart={() => {}}>
        <div>x</div>
      </BottomDock>,
    );
    expect(screen.getByTestId("bottom-dock")).toHaveStyle({ height: "321px" });
    expect(screen.getByTestId("bottom-dock")).toHaveStyle({ width: "777px" });
  });

  it("exposes separate height and width resize handles", () => {
    const onResizeStart = vi.fn();
    const onWidthResizeStart = vi.fn();
    render(
      <BottomDock open height={240} width={640} label="Terminal" onClose={() => {}} onResizeStart={onResizeStart} onWidthResizeStart={onWidthResizeStart}>
        <div>x</div>
      </BottomDock>,
    );

    fireEvent.pointerDown(screen.getByTitle("Drag to resize height"));
    fireEvent.pointerDown(screen.getByTitle("Drag to resize width"));

    expect(onResizeStart).toHaveBeenCalledTimes(1);
    expect(onWidthResizeStart).toHaveBeenCalledTimes(1);
  });
});

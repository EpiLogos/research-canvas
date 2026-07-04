import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BottomDock } from "./BottomDock";

describe("BottomDock", () => {
  it("renders nothing when closed", () => {
    render(
      <BottomDock open={false} height={200} title="Terminal" onClose={() => {}} onResizeStart={() => {}}>
        <div>session</div>
      </BottomDock>,
    );
    expect(screen.queryByTestId("bottom-dock")).not.toBeInTheDocument();
  });

  it("renders children and title when open", () => {
    render(
      <BottomDock open height={200} title="Terminal · antichrist" onClose={() => {}} onResizeStart={() => {}}>
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
      <BottomDock open height={200} title="Terminal" onClose={onClose} onResizeStart={() => {}}>
        <div>x</div>
      </BottomDock>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close terminal" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("applies the height to the dock element", () => {
    render(
      <BottomDock open height={321} title="Terminal" onClose={() => {}} onResizeStart={() => {}}>
        <div>x</div>
      </BottomDock>,
    );
    expect(screen.getByTestId("bottom-dock")).toHaveStyle({ height: "321px" });
  });
});

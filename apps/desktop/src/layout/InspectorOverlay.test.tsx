import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InspectorOverlay } from "./InspectorOverlay";

function props(overrides = {}) {
  return {
    open: true,
    pinned: false,
    width: 260,
    onTogglePin: vi.fn(),
    onClose: vi.fn(),
    onResizeStart: vi.fn(),
    ...overrides,
  };
}

describe("InspectorOverlay", () => {
  it("renders nothing when closed", () => {
    render(<InspectorOverlay {...props({ open: false })}><div>body</div></InspectorOverlay>);
    expect(screen.queryByTestId("inspector-overlay")).not.toBeInTheDocument();
  });

  it("renders children and applies width when open", () => {
    render(<InspectorOverlay {...props({ width: 300 })}><div>ins-body</div></InspectorOverlay>);
    expect(screen.getByTestId("inspector-overlay")).toBeVisible();
    expect(screen.getByText("ins-body")).toBeInTheDocument();
    expect(screen.getByTestId("inspector-overlay")).toHaveStyle({ width: "300px" });
  });

  it("reflects pinned state and toggles it", () => {
    const p = props({ pinned: true });
    render(<InspectorOverlay {...p}><div>x</div></InspectorOverlay>);
    const pin = screen.getByRole("button", { name: "Pin inspector" });
    expect(pin).toHaveAttribute("data-pinned", "true");
    fireEvent.click(pin);
    expect(p.onTogglePin).toHaveBeenCalledTimes(1);
  });

  it("calls onClose", () => {
    const p = props();
    render(<InspectorOverlay {...p}><div>x</div></InspectorOverlay>);
    fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TransportBar } from "./TransportBar";

describe("TransportBar", () => {
  it("renders the canvas and timeline lens options with the active one marked", () => {
    render(
      <TransportBar lens="timeline" onSetLens={() => {}} onOpenPalette={() => {}} />,
    );
    expect(screen.getByTestId("lens-canvas")).toHaveAttribute("data-active", "false");
    expect(screen.getByTestId("lens-timeline")).toHaveAttribute("data-active", "true");
    expect(screen.queryByTestId("lens-reading")).not.toBeInTheDocument();
  });

  it("calls onSetLens when a lens is clicked", () => {
    const onSetLens = vi.fn();
    render(<TransportBar lens="canvas" onSetLens={onSetLens} onOpenPalette={() => {}} />);
    fireEvent.click(screen.getByTestId("lens-timeline"));
    expect(onSetLens).toHaveBeenCalledWith("timeline");
  });

  it("calls onOpenPalette from the palette affordance", () => {
    const onOpenPalette = vi.fn();
    render(<TransportBar lens="canvas" onSetLens={() => {}} onOpenPalette={onOpenPalette} />);
    fireEvent.click(screen.getByRole("button", { name: "Do anything" }));
    expect(onOpenPalette).toHaveBeenCalledTimes(1);
  });

  it("shows the breadcrumb text when provided", () => {
    render(
      <TransportBar
        lens="canvas"
        onSetLens={() => {}}
        onOpenPalette={() => {}}
        breadcrumb="The Naked Face"
      />,
    );
    expect(screen.getByText("The Naked Face")).toBeInTheDocument();
  });
});

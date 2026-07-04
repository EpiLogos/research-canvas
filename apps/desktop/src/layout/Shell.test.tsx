import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { CanvasWorkspaceProvider } from "../features/canvas/CanvasWorkspaceContext";
import { Shell } from "./Shell";

function renderShell() {
  return render(
    <MemoryRouter>
      <CanvasWorkspaceProvider>
        <Shell />
      </CanvasWorkspaceProvider>
    </MemoryRouter>,
  );
}

describe("Shell frame", () => {
  it("renders the persistent chrome and the canvas stage by default", () => {
    renderShell();
    expect(screen.getByTestId("transport-bar")).toBeVisible();
    expect(screen.getByTestId("left-rail")).toBeVisible();
    expect(screen.getByTestId("status-strip")).toBeVisible();
    expect(screen.getByTestId("canvas-pane")).toBeVisible();
  });

  it("summoned panels are closed by default", () => {
    renderShell();
    expect(screen.queryByTestId("bottom-dock")).not.toBeInTheDocument();
    expect(screen.queryByTestId("inspector-overlay")).not.toBeInTheDocument();
    expect(screen.queryByTestId("left-overlay")).not.toBeInTheDocument();
  });

  it("summons the terminal dock via the rail Terminal verb", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));
    expect(screen.getByTestId("bottom-dock")).toBeVisible();
  });

  it("switches the stage surface when a lens is chosen", () => {
    renderShell();
    fireEvent.click(screen.getByTestId("lens-timeline"));
    expect(screen.getByTestId("timeline-pane")).toBeVisible();
    fireEvent.click(screen.getByTestId("lens-reading"));
    expect(screen.getByTestId("reading-pane")).toBeVisible();
  });
});

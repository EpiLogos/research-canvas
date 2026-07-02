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
    </MemoryRouter>
  );
}

// Reused by any test that needs to inspect the right panel's tab bar/panes —
// the panel is closed by default, so open it via the same Cmd+T shortcut
// Shell wires up for the Terminal tab (see Shell.tsx's global keydown handler).
function renderShellWithRightPanelOpen() {
  const result = renderShell();
  fireEvent.keyDown(window, { key: "t", metaKey: true });
  return result;
}

describe("Shell", () => {
  it("renders all four primary regions", () => {
    renderShell();

    expect(screen.getByTestId("left-rail")).toBeVisible();
    expect(screen.getByTestId("canvas-pane")).toBeVisible();
    expect(screen.getByTestId("right-panel")).toBeVisible();
    expect(screen.getByTestId("bottom-dock")).toBeVisible();
  });

  it("shows an Agent tab in the right panel", async () => {
    renderShellWithRightPanelOpen();
    expect(
      await screen.findByRole("button", { name: "Agent" }),
    ).toBeInTheDocument();
  });
});

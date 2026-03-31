import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { CanvasWorkspaceProvider } from "../features/canvas/CanvasWorkspaceContext";
import { Shell } from "./Shell";

describe("Shell", () => {
  it("renders all four primary regions", () => {
    render(
      <MemoryRouter>
        <CanvasWorkspaceProvider>
          <Shell />
        </CanvasWorkspaceProvider>
      </MemoryRouter>
    );

    expect(screen.getByTestId("left-rail")).toBeVisible();
    expect(screen.getByTestId("canvas-pane")).toBeVisible();
    expect(screen.getByTestId("right-panel")).toBeVisible();
    expect(screen.getByTestId("bottom-dock")).toBeVisible();
  });
});

import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import * as CanvasWorkspaceContext from "../canvas/CanvasWorkspaceContext";
import { SettingsOverlay } from "./SettingsOverlay";

function makeWorkspace() {
  return {
    activeConstellation: {
      displayName: "Antichrist Vault",
      slug: "antichrist-vault",
      summary: "Research canvas for the Image of the Antichrist series.",
      rootPath: "/Users/admin/Documents/Antichrist Project/antichrist-vault",
      publishSettings: {
        includeResources: true,
        mobileSequenceFirst: false,
        theme: "paper",
      },
    },
  };
}

describe("SettingsOverlay", () => {
  test("renders the ColourLegend for the constellation theme", () => {
    vi.spyOn(CanvasWorkspaceContext, "useCanvasWorkspace").mockReturnValue(
      makeWorkspace() as unknown as ReturnType<
        typeof CanvasWorkspaceContext.useCanvasWorkspace
      >,
    );

    render(<SettingsOverlay onClose={vi.fn()} />);

    expect(screen.getByTestId("colour-legend")).toBeInTheDocument();
    expect(
      screen.getByTestId("colour-legend-evidence-documented"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("colour-legend-archetype-expression"),
    ).toBeInTheDocument();
  });

  test("shows a fallback when no constellation is active", () => {
    vi.spyOn(CanvasWorkspaceContext, "useCanvasWorkspace").mockReturnValue({
      activeConstellation: null,
    } as unknown as ReturnType<typeof CanvasWorkspaceContext.useCanvasWorkspace>);

    render(<SettingsOverlay onClose={vi.fn()} />);

    expect(screen.getByText("No constellation selected")).toBeInTheDocument();
  });
});

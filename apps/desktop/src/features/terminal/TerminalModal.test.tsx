import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as CanvasWorkspaceContext from "../canvas/CanvasWorkspaceContext";
import { StatusStrip } from "../../layout/StatusStrip";
import { TerminalModal } from "./TerminalModal";
import { useTerminalManager } from "./useTerminalManager";

const useTerminalMock = vi.fn().mockReturnValue({
  terminalContainerRef: { current: null },
  status: "connected",
  session: { id: "session-1", workdir: "/home/project-a" },
});

vi.mock("./useTerminal", () => ({
  useTerminal: (...args: unknown[]) => useTerminalMock(...args),
}));

function TestHarness({ initialOpen = false }: { initialOpen?: boolean }) {
  const manager = useTerminalManager(initialOpen);
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <button
        data-testid="open-btn"
        onClick={() => {
          if (open) manager.close();
          else manager.open();
          setOpen((v) => !v);
        }}
      >
        Toggle
      </button>
      <TerminalModal manager={manager} />
      <StatusStrip
        synced
        nodeCount={0}
        relationCount={0}
        lens="canvas"
        terminalActive={manager.isOpen}
      />
    </>
  );
}

describe("TerminalModal", () => {
  let workspaceRoot = "/home/project-a";

  beforeEach(() => {
    window.localStorage.clear();
    workspaceRoot = "/home/project-a";
    vi.spyOn(CanvasWorkspaceContext, "useCanvasWorkspace").mockImplementation(
      () =>
        ({
          repoRoot: workspaceRoot,
        } as unknown as ReturnType<typeof CanvasWorkspaceContext.useCanvasWorkspace>),
    );
  });

  it("shows the project root as cwd when open", () => {
    render(<TestHarness initialOpen />);
    expect(screen.getByTestId("terminal-modal")).toBeVisible();
    expect(screen.getByTestId("terminal-header")).toHaveTextContent("/home/project-a");
  });

  it("updates cwd when the active project root changes", () => {
    const { rerender } = render(<TestHarness initialOpen />);
    expect(screen.getByTestId("terminal-header")).toHaveTextContent("/home/project-a");

    workspaceRoot = "/home/project-b";
    useTerminalMock.mockReturnValue({
      terminalContainerRef: { current: null },
      status: "connected",
      session: { id: "session-2", workdir: "/home/project-b" },
    });
    rerender(<TestHarness initialOpen />);
    expect(screen.getByTestId("terminal-header")).toHaveTextContent("/home/project-b");
  });

  it("adjusts the opacity slider and updates the CSS variable", () => {
    render(<TestHarness initialOpen />);
    const modal = screen.getByTestId("terminal-modal");
    const slider = screen.getByTestId("terminal-opacity-slider") as HTMLInputElement;

    expect(slider.value).toBe("0.85");
    expect(modal.style.getPropertyValue("--terminal-modal-opacity")).toBe("0.85");

    fireEvent.change(slider, { target: { value: "0.55" } });
    expect(modal.style.getPropertyValue("--terminal-modal-opacity")).toBe("0.55");

    fireEvent.change(slider, { target: { value: "1" } });
    expect(modal.style.getPropertyValue("--terminal-modal-opacity")).toBe("1");
  });

  it("closes via the header close button and leaves the status indicator visible", () => {
    render(<TestHarness initialOpen />);
    expect(screen.getByTestId("terminal-modal")).toBeVisible();
    expect(screen.getByTestId("terminal-status-indicator")).toHaveAttribute("data-active", "true");

    fireEvent.click(screen.getByRole("button", { name: "Close terminal" }));

    expect(screen.queryByTestId("terminal-modal")).not.toBeInTheDocument();
    expect(screen.getByTestId("terminal-status-indicator")).toHaveAttribute("data-active", "false");
  });
});

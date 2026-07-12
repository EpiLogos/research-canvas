import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class FakeTerminal {
    static instances: FakeTerminal[] = [];
    cols = 80;
    rows = 24;
    element: HTMLElement | null = null;
    onDataHandler: ((data: string) => void) | null = null;
    dispose = vi.fn();
    loadAddon = vi.fn();
    open = vi.fn((container: HTMLElement) => {
      this.element = document.createElement("div");
      container.appendChild(this.element);
    });
    onData = vi.fn((handler: (data: string) => void) => {
      this.onDataHandler = handler;
      return { dispose: vi.fn() };
    });
    scrollToBottom = vi.fn();
    write = vi.fn();
    writeln = vi.fn();

    constructor() {
      FakeTerminal.instances.push(this);
    }
  }

  return {
    createTerminalTransport: vi.fn(),
    FakeTerminal,
    fit: vi.fn(),
    listenOutput: vi.fn(),
    resizeSession: vi.fn(),
    sendInput: vi.fn(),
  };
});

vi.mock("@xterm/xterm", () => ({
  Terminal: mocks.FakeTerminal,
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit = mocks.fit;
  },
}));

vi.mock("./terminalTransport", () => ({
  createTerminalTransport: mocks.createTerminalTransport,
}));

import { useTerminal } from "./useTerminal";

function TerminalHost() {
  const { terminalContainerRef, transcript } = useTerminal("/tmp/project");
  return (
    <section>
      <div data-testid="terminal-target" ref={terminalContainerRef} />
      <output>{transcript}</output>
    </section>
  );
}

describe("useTerminal passthrough", () => {
  let outputHandler: ((event: { sessionId: string; data: string }) => void) | null = null;

  beforeEach(() => {
    mocks.FakeTerminal.instances.splice(0);
    mocks.fit.mockReset();
    mocks.listenOutput.mockReset();
    mocks.resizeSession.mockReset();
    mocks.sendInput.mockReset();
    outputHandler = null;
    mocks.createTerminalTransport.mockReturnValue({
      closeSession: vi.fn(),
      createSession: vi.fn().mockResolvedValue({
        id: "session-1",
        shell: "/bin/zsh",
        workdir: "/tmp/project",
        columns: 120,
        rows: 32,
      }),
      listenOutput: mocks.listenOutput.mockImplementation(async (_sessionId, handler) => {
        outputHandler = handler;
        return vi.fn();
      }),
      resizeSession: mocks.resizeSession.mockResolvedValue(undefined),
      sendInput: mocks.sendInput.mockResolvedValue(undefined),
    });
    vi.stubGlobal("ResizeObserver", class {
      observe = vi.fn();
      disconnect = vi.fn();
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 640,
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => 240,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("passes xterm input to the terminal transport and writes transport output back to xterm", async () => {
    render(<TerminalHost />);

    await waitFor(() => expect(mocks.listenOutput).toHaveBeenCalledWith("session-1", expect.any(Function)));
    const terminal = mocks.FakeTerminal.instances[0]!;
    terminal.onDataHandler?.("echo passthrough\n");
    expect(mocks.sendInput).toHaveBeenCalledWith("session-1", "echo passthrough\n");

    act(() => {
      outputHandler?.({ sessionId: "session-1", data: "passthrough\n" });
    });

    expect(terminal.write).toHaveBeenCalledWith("passthrough\n");
    expect(screen.getByText(/Connected to \/tmp\/project using \/bin\/zsh/)).toBeInTheDocument();
  });
});

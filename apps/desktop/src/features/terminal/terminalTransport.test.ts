import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  invoke: vi.fn(),
  isTauri: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mocks.listen,
}));

vi.mock("@research-canvas/desktop-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@research-canvas/desktop-api")>();
  return {
    ...actual,
    resolveBrowserBridgeBaseUrl: () => "http://127.0.0.1:4789",
  };
});

describe("terminal transport", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.invoke.mockReset();
    mocks.isTauri.mockReset();
    mocks.listen.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("uses Tauri invoke/listen passthrough when the Tauri runtime is present", async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockResolvedValue({ id: "s1", shell: "/bin/zsh", workdir: "/tmp", columns: 120, rows: 32 });
    mocks.listen.mockResolvedValue(vi.fn());
    const { createTerminalTransport } = await import("./terminalTransport");
    const transport = createTerminalTransport();

    await transport.createSession({ workdir: "/tmp/project" });
    await transport.sendInput("s1", "echo pass\n");
    await transport.resizeSession("s1", 100, 30);
    await transport.listenOutput("s1", vi.fn());

    expect(mocks.invoke).toHaveBeenCalledWith("create_terminal_session", {
      request: { workdir: "/tmp/project" },
    });
    expect(mocks.invoke).toHaveBeenCalledWith("send_terminal_input", {
      input: "echo pass\n",
      sessionId: "s1",
    });
    expect(mocks.invoke).toHaveBeenCalledWith("resize_terminal_session", {
      columns: 100,
      rows: 30,
      sessionId: "s1",
    });
    expect(mocks.listen).toHaveBeenCalledWith("terminal-output", expect.any(Function));
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("uses the browser terminal bridge only outside Tauri", async () => {
    mocks.isTauri.mockReturnValue(false);
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "s2", shell: "/bin/zsh", workdir: "/tmp", columns: 120, rows: 32 }),
    });
    const { createTerminalTransport } = await import("./terminalTransport");
    const transport = createTerminalTransport();

    await transport.createSession({ workdir: "/tmp/project" });

    expect(mocks.fetch).toHaveBeenCalledWith("http://127.0.0.1:4789/terminal/session", {
      body: JSON.stringify({ workdir: "/tmp/project" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});

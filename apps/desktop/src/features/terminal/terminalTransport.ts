import { listen } from "@tauri-apps/api/event";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { resolveBrowserBridgeBaseUrl } from "@research-canvas/desktop-api";

const TERMINAL_BRIDGE_BASE_URL = resolveBrowserBridgeBaseUrl();

export interface TerminalSessionSnapshot {
  id: string;
  shell: string;
  workdir: string;
  columns: number;
  rows: number;
}

export interface TerminalOutputEvent {
  sessionId: string;
  data: string;
}

export interface TerminalSessionRequest {
  workdir?: string | null;
}

interface TerminalTransport {
  closeSession(sessionId: string): Promise<void>;
  createSession(request?: TerminalSessionRequest): Promise<TerminalSessionSnapshot>;
  listenOutput(
    sessionId: string,
    onOutput: (event: TerminalOutputEvent) => void,
  ): Promise<() => void>;
  resizeSession(
    sessionId: string,
    columns: number,
    rows: number,
  ): Promise<void>;
  sendInput(sessionId: string, input: string): Promise<void>;
}

export function createTerminalTransport(): TerminalTransport {
  return isTauri()
    ? createTauriTerminalTransport()
    : createBrowserBridgeTransport();
}

function createTauriTerminalTransport(): TerminalTransport {
  return {
    async closeSession(sessionId: string) {
      await invoke("close_terminal_session", { sessionId });
    },
    async createSession(request?: TerminalSessionRequest) {
      return invoke<TerminalSessionSnapshot>("create_terminal_session", {
        request: request ?? null
      });
    },
    async listenOutput(sessionId: string, onOutput: (event: TerminalOutputEvent) => void) {
      return listen<TerminalOutputEvent>("terminal-output", (event) => {
        if (event.payload.sessionId === sessionId) {
          onOutput(event.payload);
        }
      });
    },
    async resizeSession(sessionId: string, columns: number, rows: number) {
      await invoke("resize_terminal_session", { columns, rows, sessionId });
    },
    async sendInput(sessionId: string, input: string) {
      await invoke("send_terminal_input", { input, sessionId });
    }
  };
}

function createBrowserBridgeTransport(): TerminalTransport {
  return {
    async closeSession(sessionId: string) {
      await requestJson(`/terminal/session/${sessionId}/close`, "DELETE", {});
    },
    async createSession(request?: TerminalSessionRequest) {
      return requestJsonWithRetry<TerminalSessionSnapshot>(
        "/terminal/session",
        "POST",
        {
          workdir: request?.workdir ?? null
        }
      );
    },
    async listenOutput(sessionId: string, onOutput: (event: TerminalOutputEvent) => void) {
      let cursor = 0;
      const interval = window.setInterval(async () => {
        try {
          const payload = await requestJson<{
            chunks: Array<{ cursor: number; data: string }>;
            nextCursor: number;
          }>(`/terminal/session/${sessionId}/output?cursor=${cursor}`, "GET");

          for (const chunk of payload.chunks) {
            if (!chunk.data) {
              continue;
            }

            onOutput({
              data: chunk.data,
              sessionId
            });
          }

          cursor = payload.nextCursor;
        } catch {
          // The bridge starts with the dev server, but we keep polling until it is ready.
        }
      }, 100);

      return () => {
        window.clearInterval(interval);
      };
    },
    async resizeSession(sessionId: string, columns: number, rows: number) {
      await requestJsonWithRetry(`/terminal/session/${sessionId}/resize`, "POST", {
        columns,
        rows
      });
    },
    async sendInput(sessionId: string, input: string) {
      await requestJsonWithRetry(`/terminal/session/${sessionId}/input`, "POST", {
        input
      });
    }
  };
}

async function requestJson<T>(
  path: string,
  method: "GET" | "POST" | "DELETE",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${TERMINAL_BRIDGE_BASE_URL}${path}`, {
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
    method
  });

  if (!response.ok) {
    throw new Error(`Bridge request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

async function requestJsonWithRetry<T>(
  path: string,
  method: "POST" | "DELETE",
  body?: unknown,
): Promise<T> {
  const attempts = 120;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestJson<T>(path, method, body);
    } catch (cause) {
      if (!isRetryableNetworkError(cause) || attempt === attempts - 1) {
        throw cause;
      }

      await delay(150);
    }
  }

  throw new Error("Bridge request failed");
}

function isRetryableNetworkError(cause: unknown) {
  return cause instanceof TypeError && cause.message.includes("fetch");
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

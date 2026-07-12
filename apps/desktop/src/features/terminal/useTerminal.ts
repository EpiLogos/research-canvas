import { useEffect, useRef, useState } from "react";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import {
  createTerminalTransport,
  type TerminalOutputEvent,
  type TerminalSessionSnapshot
} from "./terminalTransport";

type TerminalStatus = "connecting" | "connected" | "error";

// Module-level: survives component unmount/remount
const _sessionCache = new Map<string, { sessionId: string; transcript: string }>();
const DEFAULT_CACHE_KEY = "default";

export function useTerminal(workdir?: string) {
  const cacheKey = workdir ?? DEFAULT_CACHE_KEY;
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const sessionIdRef = useRef<string>("");
  const [session, setSession] = useState<TerminalSessionSnapshot | null>(null);
  const [status, setStatus] = useState<TerminalStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    const terminalContainer = terminalContainerRef.current;
    if (!terminalContainer) {
      return undefined;
    }

    const transport = createTerminalTransport();
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily:
        '"Iosevka Term", "SFMono-Regular", "Menlo", "Monaco", monospace',
      fontSize: 14,
      scrollback: 5000,
      theme: {
        background: "#0f0c0a",
        cursor: "#f0b45a",
        foreground: "#f5f1e8",
        selectionBackground: "rgba(240, 180, 90, 0.25)"
      }
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    let disposeData = () => {};
    let disposeOutput = () => {};
    let resizeObserver: ResizeObserver | null = null;
    let mountFrame = 0;
    let cancelled = false;
    let isMounted = false;

    const fitAndResize = () => {
      if (
        !isMounted ||
        !terminal.element ||
        !terminalContainer.isConnected ||
        terminalContainer.clientWidth === 0 ||
        terminalContainer.clientHeight === 0
      ) {
        return;
      }

      window.requestAnimationFrame(() => {
        if (
          !isMounted ||
          !terminal.element ||
          !terminalContainer.isConnected ||
          terminalContainer.clientWidth === 0 ||
          terminalContainer.clientHeight === 0
        ) {
          return;
        }

        try {
          fitAddon.fit();
        } catch {
          return;
        }

        if (!sessionIdRef.current) {
          return;
        }

        void transport.resizeSession(
          sessionIdRef.current,
          terminal.cols,
          terminal.rows
        );
      });
    };

    const mountTerminal = () => {
      if (cancelled || isMounted) {
        return;
      }

      if (
        !terminalContainer.isConnected ||
        terminalContainer.clientWidth === 0 ||
        terminalContainer.clientHeight === 0
      ) {
        mountFrame = window.requestAnimationFrame(mountTerminal);
        return;
      }

      terminal.open(terminalContainer);
      isMounted = true;
      fitAndResize();

      resizeObserver = new ResizeObserver(() => {
        fitAndResize();
      });
      resizeObserver.observe(terminalContainer);
    };

    const startSession = async () => {
      const deadline = Date.now() + 10_000;
      let lastError: unknown = null;

      // Check cache before creating a new session
      const cached = _sessionCache.get(cacheKey);

      if (cached) {
        sessionIdRef.current = cached.sessionId;
        setStatus("connected");
        setError(null);
        setTranscript(cached.transcript);

        if (isMounted) {
          terminal.write(cached.transcript);
          fitAndResize();
        }

        disposeOutput = await transport.listenOutput(
          cached.sessionId,
          (event: TerminalOutputEvent) => {
            if (isMounted) {
              terminal.write(event.data);
              terminal.scrollToBottom();
            }
            setTranscript((current) => {
              const newTranscript = appendTranscript(current, stripAnsi(event.data));
              _sessionCache.set(cacheKey, {
                sessionId: cached.sessionId,
                transcript: newTranscript
              });
              return newTranscript;
            });
          }
        );

        const inputDisposable = terminal.onData((data) => {
          void transport.sendInput(cached.sessionId, data);
        });
        disposeData = () => inputDisposable.dispose();

        return;
      }

      while (!cancelled) {
        try {
          const created = await transport.createSession({ workdir: workdir ?? null });

          if (cancelled) {
            return;
          }

          sessionIdRef.current = created.id;
          setSession(created);
          setStatus("connected");
          setError(null);

          const connectedMessage = `Connected to ${created.workdir} using ${created.shell}`;
          setTranscript((current) =>
            appendTranscript(current, `${connectedMessage}\n`)
          );
          _sessionCache.set(cacheKey, {
            sessionId: created.id,
            transcript: appendTranscript("", `${connectedMessage}\n`)
          });

          if (isMounted) {
            terminal.writeln(connectedMessage);
            fitAndResize();
          }

          disposeOutput = await transport.listenOutput(
            created.id,
            (event: TerminalOutputEvent) => {
              if (isMounted) {
                terminal.write(event.data);
                terminal.scrollToBottom();
              }
              setTranscript((current) => {
                const newTranscript = appendTranscript(current, stripAnsi(event.data));
                _sessionCache.set(cacheKey, {
                  sessionId: created.id,
                  transcript: newTranscript
                });
                return newTranscript;
              });
            }
          );

          const inputDisposable = terminal.onData((data) => {
            void transport.sendInput(created.id, data);
          });
          disposeData = () => inputDisposable.dispose();

          return;
        } catch (cause) {
          lastError = cause;
          if (Date.now() >= deadline) {
            break;
          }

          await wait(250);
        }
      }

      if (cancelled) {
        return;
      }

      const message =
        lastError instanceof Error ? lastError.message : "Failed to open terminal";
      setStatus("error");
      setError(message);
      if (isMounted) {
        terminal.writeln(`Terminal unavailable: ${message}`);
      }
      setTranscript((current) =>
        appendTranscript(current, `Terminal unavailable: ${message}\n`)
      );
    };

    mountFrame = window.requestAnimationFrame(mountTerminal);
    void startSession();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(mountFrame);
      resizeObserver?.disconnect();
      disposeData();
      disposeOutput();

      // Do NOT close the session — the cache keeps it alive for reconnect.
      // transport.closeSession is intentionally omitted here.

      isMounted = false;
      terminal.dispose();
    };
  }, [cacheKey, workdir]);

  return {
    error,
    session,
    status,
    terminalContainerRef,
    transcript
  };
}

function appendTranscript(current: string, next: string) {
  const value = `${current}${next}`.replace(/\n{3,}/g, "\n\n");
  return value.slice(-4000);
}

function stripAnsi(value: string) {
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\r/g, "");
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, milliseconds);
  });
}

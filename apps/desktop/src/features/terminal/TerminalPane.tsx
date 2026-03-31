import { useTerminal } from "./useTerminal";

export function TerminalPane() {
  const { error, terminalContainerRef } = useTerminal();

  return (
    <section className="terminal-pane">
      {error && <p className="terminal-pane__error">{error}</p>}
      <div className="terminal-pane__viewport" ref={terminalContainerRef} />
    </section>
  );
}

import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import { useTerminal } from "./useTerminal";

export function TerminalPane() {
  const workspace = useCanvasWorkspace();
  const { error, terminalContainerRef } = useTerminal(workspace.repoRoot ?? undefined);

  return (
    <section className="terminal-pane">
      {error && <p className="terminal-pane__error">{error}</p>}
      <div className="terminal-pane__viewport" ref={terminalContainerRef} />
    </section>
  );
}

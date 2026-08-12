import type { LensMode } from "./useLensMode";

interface StatusStripProps {
  synced: boolean;
  nodeCount: number;
  relationCount: number;
  lens: LensMode | "reading";
}

export function StatusStrip({ synced, nodeCount, relationCount, lens }: StatusStripProps) {
  const register = lens === "timeline" ? "datable projection" : "trans-temporal";
  return (
    <footer className="ishell-status" data-testid="status-strip">
      <span className="ishell-status__sync" data-synced={synced ? "true" : "false"}>
        <i className="ishell-status__dot" />
        {synced ? "synced" : "offline"}
      </span>
      <span>{nodeCount} nodes · {relationCount} relations</span>
      <span className="ishell-status__register">{lens} · {register}</span>
    </footer>
  );
}

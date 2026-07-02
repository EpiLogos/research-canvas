import type { JSX } from "react";
import type { LitInstance } from "./contracts";
import { dominantResonance } from "./lighting";

export interface ResonancePopoverProps {
  resonances: LitInstance[];
  onLightOperator: (operatorGraphNodeId: string) => void;
}

export function ResonancePopover({
  resonances,
  onLightOperator,
}: ResonancePopoverProps): JSX.Element {
  if (resonances.length === 0) {
    return (
      <div className="resonance-popover" data-testid="resonance-empty">
        No resonant archetypes recorded for this event.
      </div>
    );
  }
  const strongest = dominantResonance(resonances);
  return (
    <div className="resonance-popover" data-testid="resonance-popover">
      <div className="resonance-popover-title">Resonant archetypes</div>
      <ul className="resonance-list">
        {resonances.map((r) => {
          const isDominant =
            strongest !== null &&
            strongest.node.graphNodeId === r.node.graphNodeId;
          return (
            <li
              key={r.node.graphNodeId}
              data-testid={`resonance-row-${r.node.graphNodeId}`}
              data-dominant={isDominant ? "true" : undefined}
              data-rel-type={r.relType}
              className="resonance-row"
              onClick={() => onLightOperator(r.node.graphNodeId)}
            >
              <span className="resonance-row-title">{r.node.title}</span>
              <span className="resonance-row-badge">
                {r.dominance ?? "secondary"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

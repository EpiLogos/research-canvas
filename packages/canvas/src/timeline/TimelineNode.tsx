import type { JSX } from "react";
import type { PlacedItem } from "./projection";
import type { LitNodeState } from "./lighting";

export interface TimelineNodeProps {
  placed: PlacedItem;
  lit: LitNodeState | null;
  selected: boolean;
  dimmed: boolean;
  onSelect: (nodeId: string) => void;
  onOpen: (nodeId: string) => void;
}

export function TimelineNode({
  placed,
  lit,
  selected,
  dimmed,
  onSelect,
  onOpen,
}: TimelineNodeProps): JSX.Element {
  const { item, startPx, endPx } = placed;
  const spanWidth = Math.max(endPx - startPx, 0);
  return (
    <div
      data-testid={`timeline-node-${item.graphNodeId}`}
      data-entity-type={item.node.entityType}
      data-lit={lit ? lit.dominance : undefined}
      data-rel-type={lit ? lit.relType : undefined}
      data-selected={selected ? "true" : undefined}
      data-dimmed={dimmed ? "true" : undefined}
      className="timeline-node"
      style={{
        position: "absolute",
        left: `${startPx}px`,
        top: "0px",
        opacity: dimmed ? 0.25 : 1,
      }}
      onClick={() => onSelect(item.graphNodeId)}
      onDoubleClick={() => onOpen(item.graphNodeId)}
    >
      {spanWidth > 1 && (
        <div
          className="timeline-node-span"
          data-testid={`timeline-node-span-${item.graphNodeId}`}
          style={{ width: `${spanWidth}px` }}
        />
      )}
      <span className="timeline-node-dot" />
      <span className="timeline-node-title">{item.node.title}</span>
    </div>
  );
}

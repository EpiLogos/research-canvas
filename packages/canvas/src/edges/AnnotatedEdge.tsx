import { useEffect, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Position
} from "@xyflow/react";

import { RELATIONSHIP_KINDS } from "../content/relationshipKinds";

type AnnotatedEdgeData = Record<string, unknown> & {
  directionality?: "none" | "forward" | "backward" | "bidirectional";
  note?: string;
  onSelect?: () => void;
  onCycleDirectionality?: () => void;
  onDelete?: () => void;
  onUpdateRelationKind?: (relationKind: string) => void;
  relationKind: string;
  selected?: boolean;
  sequencing?: boolean;
};

export function AnnotatedEdge({
  id,
  data,
  markerEnd,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition
}: EdgeProps<Edge<AnnotatedEdgeData, "annotated">>) {
  const [draftRelationKind, setDraftRelationKind] = useState(data?.relationKind ?? "");
  const cancelEditRef = useRef(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    setDraftRelationKind(data?.relationKind ?? "");
  }, [data?.relationKind]);

  useEffect(() => {
    if (data?.selected) {
      selectRef.current?.focus();
    }
  }, [data?.selected]);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition: sourcePosition as Position,
    targetX,
    targetY,
    targetPosition: targetPosition as Position
  });

  return (
    <>
      <g data-sequencing={data?.sequencing ? "true" : "false"} data-testid={`edge-${id}`}>
        <BaseEdge markerEnd={markerEnd} path={edgePath} />
      </g>
      <EdgeLabelRenderer>
        <div
          className="flow-edge-label"
          data-selected={data?.selected ? "true" : "false"}
          data-sequencing={data?.sequencing ? "true" : "false"}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            data?.onSelect?.();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`
          }}
        >
          <div className="flow-edge-label__text">
            {data?.selected ? (
              <select
                aria-label="Relation kind"
                className="flow-edge-label__select"
                onBlur={() => {
                  if (cancelEditRef.current) {
                    cancelEditRef.current = false;
                    setDraftRelationKind(data?.relationKind ?? "");
                    return;
                  }
                  if (draftRelationKind && draftRelationKind !== data?.relationKind) {
                    data?.onUpdateRelationKind?.(draftRelationKind);
                  }
                }}
                onChange={(event) => {
                  const nextRelationKind = event.currentTarget.value;
                  setDraftRelationKind(nextRelationKind);
                  if (nextRelationKind) {
                    data?.onUpdateRelationKind?.(nextRelationKind);
                  }
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelEditRef.current = true;
                    setDraftRelationKind(data?.relationKind ?? "");
                    selectRef.current?.blur();
                  }
                }}
                ref={selectRef}
                value={draftRelationKind}
              >
                {RELATIONSHIP_KINDS.map((option) => (
                  <option key={option.kind} value={option.kind}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <strong>{data?.relationKind}</strong>
            )}
            {data?.note ? <span>{data.note}</span> : null}
          </div>
          {data?.selected ? (
            <div className="flow-edge-actions">
              <button
                className="flow-edge-action"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  data.onCycleDirectionality?.();
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                title={`Cycle arrow direction (${data.directionality ?? "forward"})`}
                type="button"
              >
                ⇄
              </button>
              <button
                className="flow-edge-action"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  data.onDelete?.();
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                title="Delete edge"
                type="button"
              >
                ×
              </button>
            </div>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

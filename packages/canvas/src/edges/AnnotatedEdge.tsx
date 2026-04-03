import { useEffect, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Position
} from "@xyflow/react";

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftRelationKind(data?.relationKind ?? "");
  }, [data?.relationKind]);

  useEffect(() => {
    if (data?.selected) {
      inputRef.current?.focus();
      inputRef.current?.select();
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
      <g data-sequencing={data?.sequencing ? "true" : "false"}>
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
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`
          }}
        >
          <div className="flow-edge-label__text">
            {data?.selected ? (
              <input
                aria-label="Relation label"
                className="flow-edge-label__input"
                onBlur={(event) => {
                  if (cancelEditRef.current) {
                    cancelEditRef.current = false;
                    setDraftRelationKind(data?.relationKind ?? "");
                    return;
                  }

                  const nextRelationKind = event.currentTarget.value.trim();
                  setDraftRelationKind(nextRelationKind || (data?.relationKind ?? ""));
                  if (nextRelationKind) {
                    data?.onUpdateRelationKind?.(nextRelationKind);
                  }
                }}
                onChange={(event) => setDraftRelationKind(event.target.value)}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    inputRef.current?.blur();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelEditRef.current = true;
                    setDraftRelationKind(data?.relationKind ?? "");
                    inputRef.current?.blur();
                  }
                }}
                ref={inputRef}
                value={draftRelationKind}
              />
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

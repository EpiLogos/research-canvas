import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Position
} from "@xyflow/react";

type AnnotatedEdgeData = Record<string, unknown> & {
  note?: string;
  relationKind: string;
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
      <BaseEdge markerEnd={markerEnd} path={edgePath} />
      <EdgeLabelRenderer>
        <div
          className="flow-edge-label"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`
          }}
        >
          <strong>{data?.relationKind}</strong>
          {data?.note ? <span>{data.note}</span> : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

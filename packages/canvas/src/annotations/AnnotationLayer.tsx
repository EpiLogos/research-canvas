import { useRef, useState, type PointerEvent } from "react";

import type { Annotation, AnnotationPoint } from "@research-canvas/schema";

import { strokePathFromPoints } from "./annotationTools";

interface AnnotationLayerProps {
  annotations: Annotation[];
  drawingEnabled: boolean;
  onCreateStroke: (points: AnnotationPoint[]) => void;
}

export function AnnotationLayer({
  annotations,
  drawingEnabled,
  onCreateStroke
}: AnnotationLayerProps) {
  const [draftPoints, setDraftPoints] = useState<AnnotationPoint[]>([]);
  const draftPointsRef = useRef<AnnotationPoint[]>([]);
  const drawingRef = useRef(false);

  const beginStroke = (event: PointerEvent<SVGSVGElement>) => {
    if (!drawingEnabled) {
      return;
    }

    const point = pointFromEvent(event);
    drawingRef.current = true;
    draftPointsRef.current = [point];
    setDraftPoints([point]);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const extendStroke = (event: PointerEvent<SVGSVGElement>) => {
    if (!drawingRef.current) {
      return;
    }

    const nextPoints = [...draftPointsRef.current, pointFromEvent(event)];
    draftPointsRef.current = nextPoints;
    setDraftPoints(nextPoints);
  };

  const endStroke = () => {
    if (!drawingRef.current) {
      return;
    }

    drawingRef.current = false;

    if (draftPointsRef.current.length > 1) {
      onCreateStroke(draftPointsRef.current);
    }

    draftPointsRef.current = [];
    setDraftPoints([]);
  };

  return (
    <svg
      className="annotation-layer"
      data-drawing={drawingEnabled}
      data-testid="annotation-surface"
      onPointerDown={beginStroke}
      onPointerLeave={endStroke}
      onPointerMove={extendStroke}
      onPointerUp={endStroke}
      preserveAspectRatio="none"
      viewBox="0 0 960 640"
    >
      {annotations.map((annotation) => (
        <path
          d={strokePathFromPoints(annotation.points, annotation.style.width)}
          fill={annotation.style.color}
          fillOpacity={annotation.style.opacity}
          key={annotation.id}
        />
      ))}

      {draftPoints.length > 1 ? (
        <path
          d={strokePathFromPoints(draftPoints, 4)}
          fill="#f0b45a"
          fillOpacity={0.9}
        />
      ) : null}
    </svg>
  );
}

function pointFromEvent(event: PointerEvent<SVGSVGElement>): AnnotationPoint {
  const bounds = event.currentTarget.getBoundingClientRect();

  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
    pressure: event.pressure > 0 ? event.pressure : 0.5
  };
}

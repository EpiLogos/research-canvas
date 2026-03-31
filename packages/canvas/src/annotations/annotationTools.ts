import { getStroke } from "perfect-freehand";

import type { AnnotationPoint, AnnotationStyle } from "@research-canvas/schema";

export function boundsFromPoints(points: AnnotationPoint[]) {
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);

  return {
    position: {
      x: minX,
      y: minY
    },
    size: {
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY)
    }
  };
}

export function styleForAnnotation(
  annotationType: "stroke" | "highlight",
): AnnotationStyle {
  if (annotationType === "highlight") {
    return {
      color: "#f4d35e88",
      opacity: 0.45,
      width: 18
    };
  }

  return {
    color: "#f0b45a",
    opacity: 0.9,
    width: 4
  };
}

export function strokePathFromPoints(
  points: AnnotationPoint[],
  width: number,
) {
  const stroke = getStroke(
    points.map((point) => [point.x, point.y, point.pressure ?? 0.5] as const),
    {
      size: width,
      thinning: 0.7,
      smoothing: 0.6,
      streamline: 0.5
    }
  );

  return getSvgPathFromStroke(stroke);
}

function getSvgPathFromStroke(stroke: number[][]) {
  if (stroke.length === 0) {
    return "";
  }

  const [firstPoint, ...rest] = stroke;
  let path = `M ${firstPoint[0]} ${firstPoint[1]} Q`;

  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    const next = rest[(index + 1) % rest.length];
    path += ` ${current[0]} ${current[1]} ${midpoint(current[0], next[0])} ${midpoint(
      current[1],
      next[1]
    )}`;
  }

  return `${path} Z`;
}

function midpoint(first: number, second: number) {
  return (first + second) / 2;
}

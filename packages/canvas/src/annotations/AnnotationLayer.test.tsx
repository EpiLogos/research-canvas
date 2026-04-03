import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeAll } from "vitest";

import { AnnotationLayer } from "./AnnotationLayer";

const screenToFlowPosition = vi.fn(({ x, y }: { x: number; y: number }) => ({
  x: (x - 40) / 2,
  y: (y - 20) / 2,
}));

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    screenToFlowPosition,
  }),
  useViewport: () => ({
    x: 40,
    y: 20,
    zoom: 2,
  }),
}));

describe("AnnotationLayer", () => {
  beforeAll(() => {
    SVGElement.prototype.setPointerCapture = vi.fn();
  });

  it("stores strokes in flow coordinates so they stay pinned to the canvas", () => {
    const onCreateStroke = vi.fn();

    render(
      <AnnotationLayer
        annotations={[]}
        drawingEnabled
        onCreateStroke={onCreateStroke}
      />,
    );

    const surface = screen.getByTestId("annotation-surface");

    fireEvent.pointerDown(surface, {
      clientX: 140,
      clientY: 100,
      pointerId: 1,
      pressure: 0.4,
    });
    fireEvent.pointerMove(surface, {
      clientX: 180,
      clientY: 140,
      pointerId: 1,
      pressure: 0.6,
    });
    fireEvent.pointerUp(surface, {
      clientX: 180,
      clientY: 140,
      pointerId: 1,
      pressure: 0.6,
    });

    expect(onCreateStroke).toHaveBeenCalledTimes(1);
    expect(onCreateStroke.mock.calls[0]?.[0]).toEqual([
      { x: 50, y: 40, pressure: expect.closeTo(0.4, 5) },
      { x: 70, y: 60, pressure: expect.closeTo(0.6, 5) },
    ]);
  });
});

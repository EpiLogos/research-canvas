import { describe, expect, it } from "vitest";

import { createAnnotationStore } from "./annotationStore";

describe("annotationStore", () => {
  it("creates stroke annotations and reloads them from a serialized snapshot", () => {
    const store = createAnnotationStore({
      canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f"
    });

    store.getState().createStrokeAnnotation({
      points: [
        { x: 120, y: 140, pressure: 0.4 },
        { x: 180, y: 190, pressure: 0.6 },
        { x: 240, y: 220, pressure: 0.5 }
      ],
      strokeKind: "stroke"
    });

    const snapshot = store.getState().serialize();

    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].annotationType).toBe("stroke");
    expect(snapshot[0].points).toHaveLength(3);

    const reloaded = createAnnotationStore({
      canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f"
    });
    reloaded.getState().hydrate(snapshot);

    expect(reloaded.getState().annotations).toHaveLength(1);
    expect(reloaded.getState().annotations[0].bounds.position.x).toBe(120);
    expect(reloaded.getState().annotations[0].bounds.size.width).toBe(120);
  });
});

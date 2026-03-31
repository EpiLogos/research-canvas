import { CanvasScreen } from "../features/canvas/CanvasScreen";

export function CanvasPane() {
  return (
    <section className="canvas-pane" data-testid="canvas-pane">
      <CanvasScreen />
    </section>
  );
}

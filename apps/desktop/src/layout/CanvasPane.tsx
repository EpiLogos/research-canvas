import { CanvasScreen } from "../features/canvas/CanvasScreen";

interface CanvasPaneProps {
  onNodeSelect?: (nodeId: string) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
}

export function CanvasPane({ onNodeSelect, onNodeDoubleClick }: CanvasPaneProps) {
  return (
    <section
      className="canvas-pane"
      data-testid="canvas-pane"
      style={{ position: "absolute", inset: 0, left: 26 }}
    >
      <CanvasScreen
        onNodeSelect={onNodeSelect}
        onNodeDoubleClick={onNodeDoubleClick}
      />
    </section>
  );
}

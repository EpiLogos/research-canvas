import { CanvasScreen } from "../features/canvas/CanvasScreen";

interface CanvasPaneProps {
  onNodeSelect?: (nodeId: string) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  leftPanelOpen?: boolean;
  rightPanelOpen?: boolean;
}

export function CanvasPane({ onNodeSelect, onNodeDoubleClick, leftPanelOpen, rightPanelOpen }: CanvasPaneProps) {
  return (
    <section
      className="canvas-pane"
      data-testid="canvas-pane"
      style={{ position: "absolute", inset: 0, left: 26 }}
    >
      <CanvasScreen
        onNodeSelect={onNodeSelect}
        onNodeDoubleClick={onNodeDoubleClick}
        leftPanelOpen={leftPanelOpen}
        rightPanelOpen={rightPanelOpen}
      />
    </section>
  );
}

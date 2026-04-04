import { CanvasScreen } from "../features/canvas/CanvasScreen";

interface CanvasPaneProps {
  onNodeSelect?: (nodeId: string) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  onPlaySequence?: () => void;
  leftPanelOpen?: boolean;
  rightPanelOpen?: boolean;
  drawingMode?: boolean;
  strokeColour?: string;
}

export function CanvasPane({ onNodeSelect, onNodeDoubleClick, onPlaySequence, leftPanelOpen, rightPanelOpen, drawingMode, strokeColour }: CanvasPaneProps) {
  return (
    <section
      className="canvas-pane"
      data-testid="canvas-pane"
      style={{ position: "absolute", inset: 0, left: 26 }}
    >
      <CanvasScreen
        onNodeSelect={onNodeSelect}
        onNodeDoubleClick={onNodeDoubleClick}
        onPlaySequence={onPlaySequence}
        leftPanelOpen={leftPanelOpen}
        rightPanelOpen={rightPanelOpen}
        drawingMode={drawingMode}
        strokeColour={strokeColour}
      />
    </section>
  );
}

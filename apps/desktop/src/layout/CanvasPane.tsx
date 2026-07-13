import { CanvasScreen } from "../features/canvas/CanvasScreen";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { CanvasTabs } from "./CanvasTabs";

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
  const workspace = useCanvasWorkspace();
  return (
    <section
      className="canvas-pane"
      data-testid="canvas-pane"
      style={{ position: "absolute", inset: 0 }}
    >
      <CanvasTabs
        tabs={workspace.canvasTabs ?? []}
        activeTabId={workspace.activeCanvasTabId ?? null}
        onActivate={(tabId) => { void workspace.activateCanvasTab?.(tabId); }}
        onClose={(tabId) => { void workspace.closeCanvasTab?.(tabId); }}
      />
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

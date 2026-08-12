import { IconStrip } from "./IconStrip";
import { LeftOverlay } from "./LeftOverlay";

interface LeftSidebarProps {
  open: boolean;
  leftMode: "projects" | "files" | "search" | "annotations";
  browserActive: boolean;
  onToggleBrowser: () => void;
  onSetBrowserMode: (mode: "projects" | "files" | "search" | "annotations") => void;
  onPreviewBrowserMode?: (mode: "projects" | "files" | "search" | "annotations") => void;
  onBrowserInteractionStart?: () => void;
  onBrowserInteractionEnd?: () => void;
  onOpenSequences: () => void;
  onOpenSettings: () => void;
  inspectorActive: boolean;
  onToggleInspector: () => void;
  terminalActive: boolean;
  onToggleTerminal: () => void;
  onResizeStart: (e: React.PointerEvent) => void;
  drawingMode?: boolean;
  onToggleDrawing?: () => void;
  strokeColour?: string;
  onSetStrokeColour?: (colour: string) => void;
}

export function LeftSidebar({
  open,
  leftMode,
  browserActive,
  onToggleBrowser,
  onSetBrowserMode,
  onPreviewBrowserMode,
  onBrowserInteractionStart,
  onBrowserInteractionEnd,
  onOpenSequences,
  onOpenSettings,
  inspectorActive,
  onToggleInspector,
  terminalActive,
  onToggleTerminal,
  onResizeStart,
  drawingMode,
  onToggleDrawing,
  strokeColour,
  onSetStrokeColour,
}: LeftSidebarProps) {
  return (
    <aside
      className="shell-left-sidebar"
      data-testid="shell-left-sidebar"
      data-open={open ? "true" : "false"}
    >
      <div className="shell-left-sidebar__rail">
        <IconStrip
          browserActive={browserActive}
          activeLeftMode={leftMode}
          onToggleBrowser={onToggleBrowser}
          onSetBrowserMode={onSetBrowserMode}
          onPreviewBrowserMode={onPreviewBrowserMode}
          onBrowserInteractionStart={onBrowserInteractionStart}
          onBrowserInteractionEnd={onBrowserInteractionEnd}
          onOpenSequences={onOpenSequences}
          onOpenSettings={onOpenSettings}
          inspectorActive={inspectorActive}
          onToggleInspector={onToggleInspector}
          terminalActive={terminalActive}
          onToggleTerminal={onToggleTerminal}
        />
      </div>

      <div className="shell-left-sidebar__panel">
        <LeftOverlay
          open={open}
          mode={leftMode}
          onResizeStart={onResizeStart}
          onInteractionStart={onBrowserInteractionStart}
          onInteractionEnd={onBrowserInteractionEnd}
          drawingMode={drawingMode}
          onToggleDrawing={onToggleDrawing}
          strokeColour={strokeColour}
          onSetStrokeColour={onSetStrokeColour}
        />
      </div>
    </aside>
  );
}

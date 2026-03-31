import { useCallback, useEffect, useState } from "react";
import { CanvasPane } from "./CanvasPane";
import { IconStrip } from "./IconStrip";
import { LeftOverlay } from "./LeftOverlay";
import { RightPanelSlot } from "./RightPanelSlot";
import { StatusBar } from "./StatusBar";
import { useShellLayout } from "./useShellLayout";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";

export function Shell() {
  const layout = useShellLayout();
  const workspace = useCanvasWorkspace();
  const [fullScreenOpen, setFullScreenOpen] = useState(false);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // TODO: wire to CommandPalette in Task 10
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "t") {
        e.preventDefault();
        layout.openRightTab("terminal");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        layout.toggleLeft();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [layout]);

  const handleNodeSelect = useCallback(
    (nodeId: string) => {
      workspace.setSelectedNode?.(nodeId);
      layout.openRightTab("inspector");
    },
    [workspace, layout],
  );

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      workspace.setSelectedNode?.(nodeId);
      if (layout.rightOpen && layout.rightTab === "content") {
        setFullScreenOpen(true);
      } else {
        layout.openRightTab("content");
      }
    },
    [layout, workspace],
  );

  return (
    <div
      className="app-shell"
      ref={layout.shellRef}
      style={
        {
          "--left-width": `${layout.leftWidth}px`,
          "--right-width": `${layout.rightWidth}px`,
        } as React.CSSProperties
      }
    >
      <IconStrip
        leftOpen={layout.leftOpen}
        onToggleLeft={layout.toggleLeft}
        onOpenRightTab={layout.openRightTab}
      />

      <div className="shell-canvas-area">
        <LeftOverlay
          open={layout.leftOpen}
          onClose={() => layout.setLeftOpen(false)}
          onResizeStart={layout.beginLeftResize}
        />

        <CanvasPane
          onNodeSelect={handleNodeSelect}
          onNodeDoubleClick={handleNodeDoubleClick}
        />

        <RightPanelSlot
          open={layout.rightOpen}
          activeTab={layout.rightTab}
          onTabChange={layout.openRightTab}
          onClose={() => layout.setRightOpen(false)}
          onResizeStart={layout.beginRightResize}
          onFullScreen={() => setFullScreenOpen(true)}
        />

        {fullScreenOpen && (
          <div className="fullscreen-placeholder" onClick={() => setFullScreenOpen(false)}>
            {/* FullScreenReader will be wired in Task 12 */}
            <span>Full screen reader — Esc to close</span>
          </div>
        )}
      </div>

      <StatusBar workspace={workspace} />
    </div>
  );
}

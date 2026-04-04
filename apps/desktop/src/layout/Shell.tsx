import { useCallback, useEffect, useState } from "react";
import { CanvasPane } from "./CanvasPane";
import { FullScreenReader } from "./FullScreenReader";
import { IconStrip } from "./IconStrip";
import { LeftOverlay } from "./LeftOverlay";
import { RightPanelSlot } from "./RightPanelSlot";
import { StatusBar } from "./StatusBar";
import { useShellLayout } from "./useShellLayout";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { SequencesManager } from "../features/sequences/SequencesManager";

export function Shell() {
  const layout = useShellLayout();
  const workspace = useCanvasWorkspace();
  const [fullScreenMode, setFullScreenMode] = useState<"closed" | "node" | "sequence">("closed");
  const closeFullScreen = useCallback(() => setFullScreenMode("closed"), []);
  const [leftMode, setLeftMode] = useState<"files" | "search" | "annotations">("files");
  const [sequencesOpen, setSequencesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  void settingsOpen;  // TODO: wire to SettingsOverlay in Task 10

  const handleSetLeftMode = useCallback((mode: "files" | "search" | "annotations") => {
    setLeftMode(mode);
    layout.setLeftOpen(true);
  }, [layout]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setLeftMode("search");
        layout.setLeftOpen(true);
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
      workspace.selectNode(nodeId);
      if (!layout.rightOpen) {
        layout.openRightTab("inspector");
      }
    },
    [workspace, layout],
  );

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      workspace.selectNode(nodeId);
      if (layout.rightOpen && layout.rightTab === "content") {
        setFullScreenMode("node");
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
        activeLeftMode={leftMode}
        onToggleLeft={layout.toggleLeft}
        onSetLeftMode={handleSetLeftMode}
        onOpenSequences={() => setSequencesOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="shell-canvas-area">
        <LeftOverlay
          open={layout.leftOpen}
          mode={leftMode}
          onResizeStart={layout.beginLeftResize}
        />

        <CanvasPane
          onNodeSelect={handleNodeSelect}
          onNodeDoubleClick={handleNodeDoubleClick}
          onPlaySequence={useCallback(() => setFullScreenMode("sequence"), [])}
          leftPanelOpen={layout.leftOpen}
          rightPanelOpen={layout.rightOpen}
        />

        <RightPanelSlot
          open={layout.rightOpen}
          activeTab={layout.rightTab}
          onTabChange={layout.openRightTab}
          onClose={() => layout.setRightOpen(false)}
          onResizeStart={layout.beginRightResize}
          onFullScreen={() => setFullScreenMode("node")}
        />

        {fullScreenMode !== "closed" && (
          <FullScreenReader mode={fullScreenMode} onClose={closeFullScreen} />
        )}
      </div>

      {sequencesOpen && (
        <SequencesManager
          onClose={() => setSequencesOpen(false)}
          onPlaySequence={() => {
            setSequencesOpen(false);
            setFullScreenMode("sequence");
          }}
        />
      )}

      <StatusBar workspace={workspace} />
    </div>
  );
}

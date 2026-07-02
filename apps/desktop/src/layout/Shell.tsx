import { useCallback, useEffect, useMemo, useState } from "react";
import { CanvasPane } from "./CanvasPane";
import { FullScreenReader } from "./FullScreenReader";
import { IconStrip } from "./IconStrip";
import { LeftOverlay } from "./LeftOverlay";
import { RightPanelSlot } from "./RightPanelSlot";
import { StatusBar } from "./StatusBar";
import { useShellLayout } from "./useShellLayout";
import { useLensMode } from "./useLensMode";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { SequencesManager } from "../features/sequences/SequencesManager";
import { SettingsOverlay } from "../features/settings/SettingsOverlay";
import { TimelineLens } from "@research-canvas/canvas";
import { createWorkspaceTransport } from "@research-canvas/desktop-api";
import { createTimelineDataSource } from "../features/timeline/createTimelineDataSource";

export function Shell() {
  const layout = useShellLayout();
  const workspace = useCanvasWorkspace();
  const [fullScreenMode, setFullScreenMode] = useState<"closed" | "node" | "sequence">("closed");
  const closeFullScreen = useCallback(() => setFullScreenMode("closed"), []);
  const [leftMode, setLeftMode] = useState<"files" | "search" | "annotations">("files");
  const [sequencesOpen, setSequencesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drawingMode, setDrawingMode] = useState(false);
  const [strokeColour, setStrokeColour] = useState("#f97316");

  const { lens, setLens } = useLensMode();
  const timelineDataSource = useMemo(
    () =>
      createTimelineDataSource({
        transport: createWorkspaceTransport(),
        canvasId: workspace.canvasId,
      }),
    [workspace.canvasId],
  );
  // Open a timeline node through the SAME path the canvas uses: select the node
  // on the workspace, then flip the Shell's local full-screen reader to "node".
  // setFullScreenMode is Shell-local state (not on the workspace context), so
  // this callback lives in the Shell body where setFullScreenMode is in scope.
  const openNodeDocument = useCallback(
    (graphNodeId: string) => {
      workspace.selectNode(graphNodeId);
      setFullScreenMode("node");
    },
    [workspace, setFullScreenMode],
  );

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

  const handlePlaySequence = useCallback(() => setFullScreenMode("sequence"), []);

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
          drawingMode={drawingMode}
          onToggleDrawing={() => setDrawingMode((v) => !v)}
          strokeColour={strokeColour}
          onSetStrokeColour={setStrokeColour}
        />

        <div className="lens-switch" data-testid="lens-switch">
          <button
            type="button"
            data-testid="lens-switch-canvas"
            data-active={lens === "canvas" ? "true" : undefined}
            onClick={() => setLens("canvas")}
          >
            Canvas
          </button>
          <button
            type="button"
            data-testid="lens-switch-timeline"
            data-active={lens === "timeline" ? "true" : undefined}
            onClick={() => setLens("timeline")}
          >
            Timeline
          </button>
        </div>

        {lens === "canvas" ? (
          <CanvasPane
            onNodeSelect={handleNodeSelect}
            onNodeDoubleClick={handleNodeDoubleClick}
            onPlaySequence={handlePlaySequence}
            leftPanelOpen={layout.leftOpen}
            rightPanelOpen={layout.rightOpen}
            drawingMode={drawingMode}
            strokeColour={strokeColour}
          />
        ) : (
          <section
            className="canvas-pane"
            data-testid="timeline-pane"
            style={{ position: "absolute", inset: 0, left: 26 }}
          >
            <TimelineLens
              dataSource={timelineDataSource}
              onOpenNode={openNodeDocument}
            />
          </section>
        )}

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

      {settingsOpen && (
        <SettingsOverlay onClose={() => setSettingsOpen(false)} />
      )}

      <StatusBar workspace={workspace} />
    </div>
  );
}

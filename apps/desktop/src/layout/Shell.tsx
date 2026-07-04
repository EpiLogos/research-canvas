import { useCallback, useEffect, useMemo, useState } from "react";
import { CanvasPane } from "./CanvasPane";
import { FullScreenReader } from "./FullScreenReader";
import { IconStrip } from "./IconStrip";
import { LeftOverlay } from "./LeftOverlay";
import { RightPanelSlot } from "./RightPanelSlot";
import { StatusStrip } from "./StatusStrip";
import { TransportBar } from "./TransportBar";
import { ReadingStub } from "./ReadingStub";
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

  const openNodeDocument = useCallback(
    (graphNodeId: string) => {
      workspace.selectNode(graphNodeId);
      setLens("reading");
    },
    [workspace, setLens],
  );

  const handleSetLeftMode = useCallback((mode: "files" | "search" | "annotations") => {
    setLeftMode(mode);
    layout.setLeftOpen(true);
  }, [layout]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setLeftMode("search");
        layout.setLeftOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        layout.openRightTab("terminal");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        layout.openRightTab("inspector");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        layout.toggleLeft();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "1") { e.preventDefault(); setLens("canvas"); }
      if ((e.metaKey || e.ctrlKey) && e.key === "2") { e.preventDefault(); setLens("timeline"); }
      if ((e.metaKey || e.ctrlKey) && e.key === "3") { e.preventDefault(); setLens("reading"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [layout, setLens]);

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
      setLens("reading");
    },
    [workspace, setLens],
  );

  const handlePlaySequence = useCallback(() => setFullScreenMode("sequence"), []);

  const selectedTitle = workspace.nodes.find((n) => n.id === workspace.selectedNodeId)?.title;

  return (
    <div
      className="ishell"
      ref={layout.shellRef}
      style={{ "--left-width": `${layout.leftWidth}px`, "--right-width": `${layout.rightWidth}px` } as React.CSSProperties}
    >
      <TransportBar
        lens={lens}
        onSetLens={setLens}
        breadcrumb={selectedTitle}
        onOpenPalette={() => {
          setLeftMode("search");
          layout.setLeftOpen(true);
        }}
      />

      <div className="ishell-body">
        <IconStrip
          leftOpen={layout.leftOpen}
          activeLeftMode={leftMode}
          onToggleLeft={layout.toggleLeft}
          onSetLeftMode={handleSetLeftMode}
          onOpenSequences={() => setSequencesOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenInspector={() => layout.openRightTab("inspector")}
          onOpenTerminal={() => layout.openRightTab("terminal")}
        />

        <div className="ishell-stage">
          <LeftOverlay
            open={layout.leftOpen}
            mode={leftMode}
            onResizeStart={layout.beginLeftResize}
            drawingMode={drawingMode}
            onToggleDrawing={() => setDrawingMode((v) => !v)}
            strokeColour={strokeColour}
            onSetStrokeColour={setStrokeColour}
          />

          {lens === "canvas" && (
            <CanvasPane
              onNodeSelect={handleNodeSelect}
              onNodeDoubleClick={handleNodeDoubleClick}
              onPlaySequence={handlePlaySequence}
              leftPanelOpen={layout.leftOpen}
              rightPanelOpen={layout.rightOpen}
              drawingMode={drawingMode}
              strokeColour={strokeColour}
            />
          )}

          {lens === "timeline" && (
            <section
              className="canvas-pane"
              data-testid="timeline-pane"
              style={{ position: "absolute", inset: 0 }}
            >
              <TimelineLens dataSource={timelineDataSource} onOpenNode={openNodeDocument} />
            </section>
          )}

          {lens === "reading" && <ReadingStub title={selectedTitle} />}

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
      </div>

      <StatusStrip
        synced
        nodeCount={workspace.nodes.length}
        relationCount={workspace.edges.length}
        lens={lens}
      />

      {sequencesOpen && (
        <SequencesManager
          onClose={() => setSequencesOpen(false)}
          onPlaySequence={() => {
            setSequencesOpen(false);
            setFullScreenMode("sequence");
          }}
        />
      )}

      {settingsOpen && <SettingsOverlay onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

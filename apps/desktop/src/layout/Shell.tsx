import { useCallback, useEffect, useMemo, useState } from "react";
import { CanvasPane } from "./CanvasPane";
import { FullScreenReader } from "./FullScreenReader";
import { IconStrip } from "./IconStrip";
import { LeftOverlay } from "./LeftOverlay";
import { BottomDock } from "./BottomDock";
import { InspectorOverlay } from "./InspectorOverlay";
import { StatusStrip } from "./StatusStrip";
import { TransportBar } from "./TransportBar";
import { ReadingLens } from "./ReadingLens";
import { InspectorTab } from "../features/inspector/InspectorTab";
import { TerminalPane } from "../features/terminal/TerminalPane";
import { useShellLayout } from "./useShellLayout";
import { useLensMode } from "./useLensMode";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { SequencesManager } from "../features/sequences/SequencesManager";
import { SettingsOverlay } from "../features/settings/SettingsOverlay";
import { CommandPalette } from "../features/search/CommandPalette";
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
  const [paletteOpen, setPaletteOpen] = useState(false);
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

  const setBrowserMode = useCallback(
    (mode: "files" | "search" | "annotations") => {
      setLeftMode(mode);
      layout.setBrowserOpen(true);
    },
    [layout],
  );

  // The full-screen/modal layers (palette, sequences manager, settings,
  // fullscreen reader) are mutually exclusive top layers — only one may be
  // open at a time. closeOverlays() clears all of them; each open handler
  // calls it first, then opens just its own layer.
  const closeOverlays = useCallback(() => {
    setPaletteOpen(false);
    setSequencesOpen(false);
    setSettingsOpen(false);
    setFullScreenMode("closed");
  }, []);

  const openPalette = useCallback(() => {
    closeOverlays();
    setPaletteOpen(true);
  }, [closeOverlays]);

  const openSequences = useCallback(() => {
    closeOverlays();
    setSequencesOpen(true);
  }, [closeOverlays]);

  const openSettings = useCallback(() => {
    closeOverlays();
    setSettingsOpen(true);
  }, [closeOverlays]);

  const enterFullScreen = useCallback(
    (mode: "node" | "sequence") => {
      closeOverlays();
      setFullScreenMode(mode);
    },
    [closeOverlays],
  );

  // Global keyboard shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openPalette();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "j") { e.preventDefault(); layout.toggleDock(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "i") { e.preventDefault(); layout.toggleInspector(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") { e.preventDefault(); layout.toggleBrowser(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "1") { e.preventDefault(); setLens("canvas"); }
      if ((e.metaKey || e.ctrlKey) && e.key === "2") { e.preventDefault(); setLens("timeline"); }
      if ((e.metaKey || e.ctrlKey) && e.key === "3") { e.preventDefault(); setLens("reading"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [layout, setLens, openPalette]);

  const handleNodeSelect = useCallback(
    (nodeId: string) => {
      workspace.selectNode(nodeId);
      // Once the user has explicitly closed the inspector, selecting nodes
      // must not reopen it — closing it needs to stick until the user
      // reopens it (via the rail, pin, or Cmd+I) themselves.
      if (!layout.inspectorPinned && !layout.inspectorUserClosed) {
        layout.setInspectorOpen(true);
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

  const handlePlaySequence = useCallback(() => enterFullScreen("sequence"), [enterFullScreen]);

  const selectedTitle = workspace.nodes.find((n) => n.id === workspace.selectedNodeId)?.title;
  const inspectorVisible = layout.inspectorOpen && (Boolean(workspace.selectedNodeId) || layout.inspectorPinned);

  return (
    <div className="ishell" data-lens={lens} ref={layout.shellRef} style={{ "--browser-width": `${layout.browserWidth}px` } as React.CSSProperties}>
      <TransportBar
        lens={lens}
        onSetLens={setLens}
        breadcrumb={selectedTitle}
        onOpenPalette={openPalette}
      />

      <div className="ishell-body">
        {/* The rail stays reachable in every lens (including reading) —
            panels must never become unreachable just because the reading
            lens is active. Reading can still recede other chrome via CSS. */}
        <IconStrip
          browserActive={layout.browserOpen}
          activeLeftMode={leftMode}
          onToggleBrowser={layout.toggleBrowser}
          onSetBrowserMode={setBrowserMode}
          onOpenSequences={openSequences}
          onOpenSettings={openSettings}
          inspectorActive={inspectorVisible}
          onToggleInspector={layout.toggleInspector}
          terminalActive={layout.dockOpen}
          onToggleTerminal={layout.toggleDock}
        />

        <div className="ishell-stage">
          {layout.browserOpen && (
            <LeftOverlay
              open
              mode={leftMode}
              onResizeStart={layout.beginBrowserResize}
              drawingMode={drawingMode}
              onToggleDrawing={() => setDrawingMode((v) => !v)}
              strokeColour={strokeColour}
              onSetStrokeColour={setStrokeColour}
            />
          )}

          {lens === "canvas" && (
            <CanvasPane
              onNodeSelect={handleNodeSelect}
              onNodeDoubleClick={handleNodeDoubleClick}
              onPlaySequence={handlePlaySequence}
              leftPanelOpen={layout.browserOpen}
              rightPanelOpen={inspectorVisible}
              drawingMode={drawingMode}
              strokeColour={strokeColour}
            />
          )}

          {lens === "timeline" && (
            <section className="canvas-pane" data-testid="timeline-pane" style={{ position: "absolute", inset: 0 }}>
              <TimelineLens dataSource={timelineDataSource} onOpenNode={openNodeDocument} onPlaySequence={handlePlaySequence} />
            </section>
          )}

          {lens === "reading" && <ReadingLens onFullScreen={() => enterFullScreen("node")} />}

          <InspectorOverlay
            open={inspectorVisible}
            pinned={layout.inspectorPinned}
            width={layout.inspectorWidth}
            onTogglePin={layout.toggleInspectorPin}
            onClose={layout.closeInspector}
            onResizeStart={layout.beginInspectorResize}
          >
            <InspectorTab />
          </InspectorOverlay>

          <BottomDock
            open={layout.dockOpen}
            height={layout.dockHeight}
            label="Terminal · antichrist"
            onClose={() => layout.setDockOpen(false)}
            onResizeStart={layout.beginDockResize}
          >
            <TerminalPane />
          </BottomDock>

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
          onPlaySequence={() => enterFullScreen("sequence")}
        />
      )}

      {settingsOpen && <SettingsOverlay onClose={() => setSettingsOpen(false)} />}

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSetLens={setLens}
        onToggleTerminal={layout.toggleDock}
      />
    </div>
  );
}

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
  const [leftMode, setLeftMode] = useState<"files" | "search" | "annotations">("files");
  const [sequencesOpen, setSequencesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawingMode, setDrawingMode] = useState(false);
  const [strokeColour, setStrokeColour] = useState("#f97316");

  const { lens, setLens } = useLensMode();
  // Closing the full-screen NODE reader must land back on the canvas, not
  // back in the in-stage reading lens — otherwise "Back" from a double-click
  // -> reading lens -> fullscreen round trip never actually reaches the
  // canvas. Sequence full-screen close must NOT force the lens (a sequence
  // may have been played from the timeline, and should return there).
  const closeFullScreen = useCallback(() => {
    setFullScreenMode((mode) => {
      if (mode === "node") setLens("canvas");
      return "closed";
    });
  }, [setLens]);
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

  // Leaving the annotations mode, or closing the browser panel entirely,
  // must turn drawing mode off — otherwise the canvas can be left stuck in
  // a draw cursor with no visible way to exit it. This only ever turns
  // drawingMode OFF: the annotations toggle (onToggleDrawing) is what turns
  // it on while leftMode === "annotations" && browserOpen, and this effect's
  // condition is false in exactly that state, so it never fights the toggle.
  useEffect(() => {
    if (leftMode !== "annotations" || !layout.browserOpen) {
      setDrawingMode(false);
    }
  }, [leftMode, layout.browserOpen]);

  const closeBrowser = useCallback(() => {
    layout.setBrowserOpen(false);
    setDrawingMode(false);
  }, [layout]);

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
  // The inspector is a canvas/graph affordance — it must never float over
  // the immersive reading lens's stage content (its ⤢ fullscreen / "Back to
  // canvas" controls have no z-index of their own to defend against it), so
  // it is gated out entirely while lens === "reading". Selection and
  // inspectorOpen/pinned state are left untouched, so switching back to
  // canvas/timeline restores it exactly as it was.
  const inspectorVisible =
    layout.inspectorOpen && (Boolean(workspace.selectedNodeId) || layout.inspectorPinned) && lens !== "reading";

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
              onClose={closeBrowser}
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

          {lens === "reading" && (
            <ReadingLens
              onFullScreen={() => enterFullScreen("node")}
              onExitToCanvas={() => setLens("canvas")}
            />
          )}

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
            width={layout.dockWidth}
            label="Terminal · antichrist"
            onClose={() => layout.setDockOpen(false)}
            onResizeStart={layout.beginDockResize}
            onWidthResizeStart={layout.beginDockWidthResize}
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

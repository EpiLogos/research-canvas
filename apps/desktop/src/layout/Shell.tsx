import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { createWorkspaceTransport, type GraphNode, type TimelineRelationField } from "@research-canvas/desktop-api";
import { createTimelineDataSource } from "../features/timeline/createTimelineDataSource";
import { PsychogeographicLens } from "../features/psychogeographic/PsychogeographicLens";
import { StoryLens } from "../features/story/StoryLens";
import { PalaceLensHost } from "../features/palace/PalaceLensHost";
import {
  readerRecordFromCanvasNode,
  readerRecordFromGraphNode,
  type ReaderRecord,
} from "../features/viewer/readerRecord";

export function Shell() {
  const layout = useShellLayout();
  const workspace = useCanvasWorkspace();
  const [fullScreenMode, setFullScreenMode] = useState<"closed" | "node" | "sequence">("closed");
  const [fullScreenRecord, setFullScreenRecord] = useState<ReaderRecord | null>(null);
  const [leftMode, setLeftMode] = useState<"files" | "search" | "annotations">("files");
  const [sequencesOpen, setSequencesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [readingOverlayOpen, setReadingOverlayOpen] = useState(false);
  const [readingRecord, setReadingRecord] = useState<ReaderRecord | null>(null);
  const [readingRelationField, setReadingRelationField] = useState<TimelineRelationField | null>(null);
  const readingRelationRequestVersion = useRef(0);
  const [drawingMode, setDrawingMode] = useState(false);
  const [strokeColour, setStrokeColour] = useState("#f97316");
  const timelineViewports = useRef(new Map<string, { centerYear: number; pixelsPerYear: number }>());
  const browserCloseTimer = useRef<number | null>(null);

  const { lens, setLens } = useLensMode();
  const closeFullScreen = useCallback(() => {
    setFullScreenMode("closed");
    setFullScreenRecord(null);
    setReadingRelationField(null);
  }, []);
  const timelineDataSource = useMemo(
    () => workspace.workspaceId ?
      createTimelineDataSource({
        transport: createWorkspaceTransport(),
        workspaceId: workspace.workspaceId,
      }) : null,
    [workspace.workspaceId],
  );
  const rememberedTimelineViewport = workspace.workspaceId
    ? timelineViewports.current.get(workspace.workspaceId)
    : undefined;
  const rememberTimelineViewport = useCallback(
    (viewport: { centerYear: number; pixelsPerYear: number }) => {
      if (workspace.workspaceId) {
        timelineViewports.current.set(workspace.workspaceId, viewport);
      }
    },
    [workspace.workspaceId],
  );

  const openNodeDocument = useCallback(
    (graphNodeId: string, timelineNode?: GraphNode, relationField?: TimelineRelationField) => {
      workspace.selectNode(graphNodeId);
      const requestVersion = readingRelationRequestVersion.current + 1;
      readingRelationRequestVersion.current = requestVersion;
      setReadingRelationField(relationField ?? null);
      const loadRelationField = workspace.transport?.loadTimelineRelationField;
      const shouldLoadRelationField = timelineNode !== undefined
        || readingOverlayOpen
        || readingRelationField !== null;
      if (!relationField && shouldLoadRelationField && workspace.workspaceId && loadRelationField) {
        void loadRelationField({
          workspaceId: workspace.workspaceId,
          graphNodeId,
        }).then((field) => {
          if (readingRelationRequestVersion.current === requestVersion) setReadingRelationField(field);
        }).catch(() => {
          // Relation context is supplementary; the reader remains usable.
        });
      }
      const canvasNode = workspace.nodes.find((node) => node.id === graphNodeId) ?? null;
      setReadingRecord(
        timelineNode
          ? readerRecordFromGraphNode(timelineNode)
          : canvasNode
            ? readerRecordFromCanvasNode(canvasNode)
            : null,
      );
      setReadingOverlayOpen(true);
    },
    [readingOverlayOpen, readingRelationField, workspace],
  );

  const setShellLens = useCallback(
    (mode: "canvas" | "timeline" | "psychogeographic" | "story" | "palace" | "reading") => {
      if (mode === "reading") {
        setReadingOverlayOpen(true);
        return;
      }
      setReadingOverlayOpen(false);
      setReadingRecord(null);
      setLens(mode);
    },
    [setLens],
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
    setFullScreenRecord(null);
    setReadingOverlayOpen(false);
    setReadingRecord(null);
    setReadingRelationField(null);
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
    (
      mode: "node" | "sequence",
      record: ReaderRecord | null = null,
      relationField: TimelineRelationField | null = readingRelationField,
    ) => {
      closeOverlays();
      setFullScreenRecord(record);
      setReadingRelationField(relationField);
      setFullScreenMode(mode);
    },
    [closeOverlays, readingRelationField],
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

  const cancelBrowserClose = useCallback(() => {
    if (browserCloseTimer.current !== null) {
      window.clearTimeout(browserCloseTimer.current);
      browserCloseTimer.current = null;
    }
  }, []);

  const scheduleBrowserClose = useCallback(() => {
    cancelBrowserClose();
    browserCloseTimer.current = window.setTimeout(() => {
      const focusedElement = document.activeElement;
      if (focusedElement instanceof HTMLElement && focusedElement.closest("[data-browser-surface='true']")) {
        return;
      }
      closeBrowser();
    }, 260);
  }, [cancelBrowserClose, closeBrowser]);

  const previewBrowserMode = useCallback((mode: "files" | "search" | "annotations") => {
    cancelBrowserClose();
    setLeftMode(mode);
    layout.setBrowserOpen(true);
  }, [cancelBrowserClose, layout]);

  useEffect(() => () => cancelBrowserClose(), [cancelBrowserClose]);

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
      if ((e.metaKey || e.ctrlKey) && e.key === "1") { e.preventDefault(); setShellLens("canvas"); }
      if ((e.metaKey || e.ctrlKey) && e.key === "2") { e.preventDefault(); setShellLens("timeline"); }
      if ((e.metaKey || e.ctrlKey) && e.key === "3") { e.preventDefault(); setShellLens("reading"); }
      if (e.key === "Escape" && layout.browserOpen) {
        closeBrowser();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [layout, setShellLens, openPalette]);

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
      const node = workspace.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) return;
      if (node?.type === "portal") {
        setReadingOverlayOpen(false);
        setReadingRecord(null);
        void workspace.openCanvas(node.targetCanvasId);
        return;
      }

      workspace.selectNode(nodeId);
      setReadingRecord(readerRecordFromCanvasNode(node));
      setReadingOverlayOpen(true);
    },
    [workspace],
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
    layout.inspectorOpen &&
    (Boolean(workspace.selectedNodeId) || layout.inspectorPinned) &&
    lens !== "reading" &&
    !readingOverlayOpen;

  return (
    <div className="ishell" data-lens={lens} ref={layout.shellRef} style={{ "--browser-width": `${layout.browserWidth}px` } as React.CSSProperties}>
      <TransportBar
        lens={readingOverlayOpen ? "reading" : lens}
        onSetLens={setShellLens}
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
          onPreviewBrowserMode={previewBrowserMode}
          onBrowserInteractionStart={cancelBrowserClose}
          onBrowserInteractionEnd={scheduleBrowserClose}
          onOpenSequences={openSequences}
          onOpenSettings={openSettings}
          inspectorActive={inspectorVisible}
          onToggleInspector={layout.toggleInspector}
          terminalActive={layout.dockOpen}
          onToggleTerminal={layout.toggleDock}
        />

        <div className="ishell-stage">
          <LeftOverlay
            open={layout.browserOpen}
            mode={leftMode}
            onResizeStart={layout.beginBrowserResize}
            onInteractionStart={cancelBrowserClose}
            onInteractionEnd={scheduleBrowserClose}
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
              leftPanelOpen={layout.browserOpen}
              rightPanelOpen={inspectorVisible}
              drawingMode={drawingMode}
              strokeColour={strokeColour}
            />
          )}

          {lens === "timeline" && timelineDataSource && (
            <section className="canvas-pane" data-testid="timeline-pane" style={{ position: "absolute", inset: 0 }}>
              <TimelineLens
                dataSource={timelineDataSource}
                onOpenNode={openNodeDocument}
                initialViewport={rememberedTimelineViewport}
                onViewportChange={rememberTimelineViewport}
              />
            </section>
          )}
          {lens === "timeline" && !timelineDataSource && (
            <section className="canvas-pane" data-testid="timeline-workspace-loading">Loading timeline workspace…</section>
          )}

          {lens === "psychogeographic" && workspace.transport && workspace.databasePath && workspace.workspaceId && (
            <section className="canvas-pane" data-testid="psychogeographic-pane" style={{ position: "absolute", inset: 0 }}>
              <PsychogeographicLens
                transport={workspace.transport}
                databasePath={workspace.databasePath}
                workspaceId={workspace.workspaceId}
                profileScope="bootstrapping"
                mediaRoot={workspace.workingRoot ?? ""}
              />
            </section>
          )}

          {lens === "story" && workspace.transport && workspace.databasePath && workspace.workspaceId && (
            <section className="canvas-pane" data-testid="story-pane" style={{ position: "absolute", inset: 0 }}>
              <StoryLens
                transport={workspace.transport}
                databasePath={workspace.databasePath}
                workspaceId={workspace.workspaceId}
                repoRoot={workspace.repoRoot ?? ""}
                profileScope="migration"
                workingRoot={workspace.workingRoot ?? ""}
              />
            </section>
          )}

          {lens === "palace" && workspace.transport && workspace.databasePath && workspace.workspaceId && (
            <section className="canvas-pane" data-testid="palace-pane" style={{ position: "absolute", inset: 0 }}>
              <PalaceLensHost
                transport={workspace.transport}
                databasePath={workspace.databasePath}
                workspaceId={workspace.workspaceId}
                profileScope="bootstrapping"
              />
            </section>
          )}

          {lens === "reading" && (
            <ReadingLens
              onFullScreen={(record, relationField) => enterFullScreen("node", record, relationField)}
              onExitToCanvas={() => setLens("canvas")}
              relationField={readingRelationField}
              onOpenRelatedNode={openNodeDocument}
            />
          )}

          {readingOverlayOpen && (
            <ReadingLens
              variant="overlay"
              onFullScreen={(record, relationField) => enterFullScreen("node", record, relationField)}
              onExitToCanvas={() => {
                setReadingOverlayOpen(false);
                setReadingRecord(null);
                setReadingRelationField(null);
              }}
              recordOverride={readingRecord}
              relationField={readingRelationField}
              onOpenRelatedNode={openNodeDocument}
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
            <FullScreenReader
              mode={fullScreenMode}
              record={fullScreenRecord}
              relationField={readingRelationField}
              onOpenRelatedNode={openNodeDocument}
              onClose={closeFullScreen}
            />
          )}
        </div>
      </div>

      <StatusStrip
        synced
        nodeCount={workspace.nodes.length}
        relationCount={workspace.edges.length}
        lens={readingOverlayOpen ? "reading" : lens}
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
        onSetLens={setShellLens}
        onToggleTerminal={layout.toggleDock}
      />
    </div>
  );
}

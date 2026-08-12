import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  createWorkspaceServices,
  type GraphNode,
  type TimelineRelationField,
} from "@research-canvas/desktop-api";
import type { SurfaceId, SurfaceTabState } from "@research-canvas/schema";

import { FullScreenReader } from "./FullScreenReader";
import { StatusStrip } from "./StatusStrip";
import { TopBar } from "./TopBar";
import { PipelineRail } from "./PipelineRail";
import { LeftSidebar } from "./LeftSidebar";
import { Stage } from "./Stage";
import { RightInspector } from "./RightInspector";
import { TerminalModal } from "../features/terminal/TerminalModal";
import { useTerminalManager } from "../features/terminal/useTerminalManager";
import { FlowView } from "../features/pipeline/FlowView";
import { usePipelineActions } from "../features/pipeline/usePipelineActions";
import { usePipelineStages } from "../features/pipeline/usePipelineStages";
import {
  PIPELINE_STAGES,
  type PipelineStageId,
} from "../features/pipeline/pipelineStages";
import { readerRecordFromGraphNode } from "../features/viewer/readerRecord";

import { useShellLayout } from "./useShellLayout";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { SequencesManager } from "../features/sequences/SequencesManager";
import { SettingsOverlay } from "../features/settings/SettingsOverlay";
import { CommandPalette } from "../features/search/CommandPalette";
import { createTimelineDataSource } from "../features/timeline/createTimelineDataSource";
import { useLensMode } from "./useLensMode";
import {
  readerRecordFromCanvasNode,
  type ReaderRecord,
} from "../features/viewer/readerRecord";

function surfaceToLens(surfaceId: SurfaceId): "canvas" | "timeline" | "psychogeographic" | "story" | "palace" {
  switch (surfaceId) {
    case "places":
      return "psychogeographic";
    case "timeline":
      return "timeline";
    case "story":
      return "story";
    case "palace":
      return "palace";
    default:
      return "canvas";
  }
}

function defaultTabState(surfaceId: SurfaceId): SurfaceTabState {
  switch (surfaceId) {
    case "projects":
      return { surfaceId: "projects" };
    case "canvas":
      return { surfaceId: "canvas", canvasId: "", constellationId: "", viewport: { x: 0, y: 0, zoom: 1 } };
    case "timeline":
      return { surfaceId: "timeline", centerYear: 0, pixelsPerYear: 20 };
    case "places":
      return { surfaceId: "places", viewport: { x: 0, y: 0, zoom: 1 } };
    case "story":
      return { surfaceId: "story" };
    case "palace":
      return { surfaceId: "palace" };
    default:
      return { surfaceId: "projects" };
  }
}

export function Shell() {
  const layout = useShellLayout();
  const terminalManager = useTerminalManager();
  const workspace = useCanvasWorkspace();
  const { projectId, surfaceId, constellationId, detailId } = useParams();
  const [fullScreenMode, setFullScreenMode] = useState<"closed" | "node" | "sequence">("closed");
  const [fullScreenRecord, setFullScreenRecord] = useState<ReaderRecord | null>(null);
  const [leftMode, setLeftMode] = useState<"projects" | "files" | "search" | "annotations">("projects");
  const [sequencesOpen, setSequencesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerRecord, setReaderRecord] = useState<ReaderRecord | null>(null);
  const [readerRelationField, setReaderRelationField] = useState<TimelineRelationField | null>(null);
  const readerRelationRequestVersion = useRef(0);
  const [drawingMode, setDrawingMode] = useState(false);
  const [strokeColour, setStrokeColour] = useState("#f97316");
  const timelineViewports = useRef(new Map<string, { centerYear: number; pixelsPerYear: number }>());
  const browserCloseTimer = useRef<number | null>(null);
  const appliedRouteRef = useRef<string | null>(null);

  const { lens, setLens } = useLensMode();
  useEffect(() => {
    const derived = surfaceToLens(workspace.activeSurfaceId);
    if (derived !== lens) {
      setLens(derived);
    }
  }, [workspace.activeSurfaceId, lens, setLens]);

  // Route-driven workspace activation: when the URL changes, select the
  // matching project and open/activate the requested surface/tab.
  const applyingRouteRef = useRef(false);
  useEffect(() => {
    const routeKey = `${projectId ?? ""}:${surfaceId ?? ""}:${constellationId ?? ""}:${detailId ?? ""}`;
    if (!workspace.isHydrated || applyingRouteRef.current || routeKey === appliedRouteRef.current) return;
    applyingRouteRef.current = true;

    const applyRoute = async () => {
      if (projectId && projectId !== workspace.activeProjectId) {
        await workspace.selectProject(projectId);
      }

      if (surfaceId) {
        if (surfaceId === "canvas" && constellationId) {
          await workspace.selectConstellation(constellationId);
        } else {
          const existing = workspace.tabs.find((tab) => tab.surfaceId === surfaceId);
          if (existing) {
            workspace.activateTab(existing.id);
          } else {
            const title = workspace.activeConstellation?.displayName ?? "Untitled";
            workspace.openTab({
              id: crypto.randomUUID(),
              surfaceId: surfaceId as SurfaceId,
              title,
              pinned: false,
              state: defaultTabState(surfaceId as SurfaceId),
            });
          }
        }
      }

      if (detailId) {
        workspace.selectNode(detailId);
      }
    };

    void applyRoute().finally(() => {
      applyingRouteRef.current = false;
      appliedRouteRef.current = routeKey;
    });
  }, [projectId, surfaceId, constellationId, detailId, workspace]);

  const closeFullScreen = useCallback(() => {
    setFullScreenMode("closed");
    setFullScreenRecord(null);
    setReaderRelationField(null);
  }, []);

  const timelineDataSource = useMemo(
    () =>
      workspace.workspaceId
        ? createTimelineDataSource({
            transport: createWorkspaceServices(),
            workspaceId: workspace.workspaceId,
          })
        : null,
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
      const requestVersion = readerRelationRequestVersion.current + 1;
      readerRelationRequestVersion.current = requestVersion;
      setReaderRelationField(relationField ?? null);
      const loadRelationField = workspace.transport?.loadTimelineRelationField;
      const shouldLoadRelationField = timelineNode !== undefined || readerOpen || readerRelationField !== null;
      if (!relationField && shouldLoadRelationField && workspace.workspaceId && loadRelationField) {
        void loadRelationField({
          workspaceId: workspace.workspaceId,
          graphNodeId,
        })
          .then((field) => {
            if (readerRelationRequestVersion.current === requestVersion) setReaderRelationField(field);
          })
          .catch(() => {
            // Relation context is supplementary; the reader remains usable.
          });
      }
      const canvasNode = workspace.nodes.find((node) => node.id === graphNodeId) ?? null;
      setReaderRecord(
        timelineNode
          ? readerRecordFromGraphNode(timelineNode as unknown as import("@research-canvas/schema").GraphNodeContract)
          : canvasNode
            ? readerRecordFromCanvasNode(canvasNode)
            : null,
      );
      setReaderOpen(true);
    },
    [readerOpen, readerRelationField, workspace],
  );

  const setShellLens = useCallback(
    (mode: "canvas" | "timeline" | "psychogeographic" | "story" | "palace") => {
      setReaderOpen(false);
      setReaderRecord(null);
      setReaderRelationField(null);
      setLens(mode);
      const surfaceId: SurfaceId = mode === "psychogeographic" ? "places" : mode;
      const existing = workspace.tabs.find((tab) => tab.surfaceId === surfaceId);
      if (existing) {
        workspace.activateTab(existing.id);
        return;
      }
      if (surfaceId !== "canvas") {
        workspace.openTab({
          id: crypto.randomUUID(),
          surfaceId,
          title: workspace.activeConstellation?.displayName ?? "Untitled",
          pinned: false,
          state: defaultTabState(surfaceId),
        });
      }
    },
    [setLens, workspace],
  );

  const setBrowserMode = useCallback(
    (mode: "projects" | "files" | "search" | "annotations") => {
      setLeftMode(mode);
      layout.setBrowserOpen(true);
    },
    [layout],
  );

  const closeReader = useCallback(() => {
    setReaderOpen(false);
    setReaderRecord(null);
    setReaderRelationField(null);
  }, []);

  const closeOverlays = useCallback(() => {
    setPaletteOpen(false);
    setSequencesOpen(false);
    setSettingsOpen(false);
    setFullScreenMode("closed");
    setFullScreenRecord(null);
    closeReader();
  }, [closeReader]);

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
      relationField: TimelineRelationField | null = readerRelationField,
    ) => {
      closeOverlays();
      setFullScreenRecord(record);
      setReaderRelationField(relationField);
      setFullScreenMode(mode);
    },
    [closeOverlays, readerRelationField],
  );

  const handleReaderFullScreen = useCallback(
    (record: ReaderRecord, relationField?: TimelineRelationField | null) => {
      enterFullScreen("node", record, relationField ?? null);
    },
    [enterFullScreen],
  );

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

  const previewBrowserMode = useCallback(
    (mode: "projects" | "files" | "search" | "annotations") => {
      cancelBrowserClose();
      setLeftMode(mode);
      layout.setBrowserOpen(true);
    },
    [cancelBrowserClose, layout],
  );

  useEffect(() => () => cancelBrowserClose(), [cancelBrowserClose]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openPalette();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        terminalManager.toggle();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        layout.toggleInspector();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        layout.toggleBrowser();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "1") {
        e.preventDefault();
        setShellLens("canvas");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "2") {
        e.preventDefault();
        setShellLens("timeline");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "3") {
        e.preventDefault();
        setShellLens("psychogeographic");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "4") {
        e.preventDefault();
        setShellLens("story");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "5") {
        e.preventDefault();
        setShellLens("palace");
      }
      if (e.key === "Escape" && layout.browserOpen) {
        closeBrowser();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [layout, terminalManager, setShellLens, openPalette, closeBrowser]);

  const handleNodeSelect = useCallback(
    (nodeId: string) => {
      workspace.selectNode(nodeId);
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
      if (node.type === "portal") {
        closeReader();
        void workspace.openCanvas(node.targetCanvasId);
        return;
      }

      workspace.selectNode(nodeId);
      setReaderRecord(readerRecordFromCanvasNode(node));
      setReaderOpen(true);
    },
    [workspace, closeReader],
  );

  const handlePlaySequence = useCallback(() => enterFullScreen("sequence"), [enterFullScreen]);

  const pipelineObjects = useMemo(
    () =>
      workspace.nodes.map((node) => ({
        graphNodeId: node.graphNodeId,
        title: node.title,
      })),
    [workspace.nodes],
  );
  const pipelineStages = usePipelineStages({
    transport: workspace.transport,
    workspaceId: workspace.workspaceId,
    databasePath: workspace.databasePath,
    profileScope: workspace.activeProfileScope,
    objects: pipelineObjects,
  });
  const pipelineActions = usePipelineActions({
    transport: workspace.transport,
    workspaceId: workspace.workspaceId,
    databasePath: workspace.databasePath,
    profileScope: workspace.activeProfileScope,
    onSettled: pipelineStages.refresh,
  });
  const stageCounts = useMemo(
    () =>
      Object.fromEntries(
        PIPELINE_STAGES.map((stage) => [stage.id, pipelineStages.countAt(stage.id)]),
      ) as Record<PipelineStageId, number>,
    [pipelineStages.countAt],
  );

  const inspectorVisible =
    layout.inspectorOpen &&
    (Boolean(workspace.selectedNodeId) || layout.inspectorPinned) &&
    !readerOpen;

  const flowNode = (() => {
    const selected = workspace.nodes.find((n) => n.id === workspace.selectedNodeId) ?? null;
    if (!selected?.graphNodeId) return null;
    return {
      graphNodeId: selected.graphNodeId,
      title: selected.title,
      canvasNodeType: selected.type,
      entityType: selected.graph?.entityType,
    };
  })();
  const flowStageState = flowNode ? pipelineStages.byGraphNodeId.get(flowNode.graphNodeId) ?? null : null;

  const projectName =
    workspace.activeProjectId && workspace.activeProjectId !== ""
      ? workspace.activeConstellation?.displayName ?? workspace.activeProjectId
      : null;

  const shellStyle = {
    "--shell-left-sidebar-width": `${layout.browserOpen ? layout.browserWidth : 44}px`,
    "--shell-right-inspector-width": `${inspectorVisible ? layout.inspectorWidth : 0}px`,
  } as React.CSSProperties;

  return (
    <div className="ishell" data-lens={lens} ref={layout.shellRef} style={shellStyle}>
      <TopBar
        projectName={projectName}
        tabs={workspace.tabs}
        activeTabId={workspace.activeTabId}
        onActivateTab={workspace.activateTab}
        onCloseTab={workspace.closeTab}
        onOpenPalette={openPalette}
        onOpenSettings={openSettings}
        onToggleTerminal={terminalManager.toggle}
        terminalActive={terminalManager.isOpen}
      />

      <PipelineRail
        lens={lens}
        onSetLens={setShellLens}
        breadcrumb={projectName ?? undefined}
        onOpenPalette={openPalette}
        stageCounts={stageCounts}
      />

      <div className="ishell-body">
        <LeftSidebar
          open={layout.browserOpen}
          leftMode={leftMode}
          browserActive={layout.browserOpen}
          onToggleBrowser={layout.toggleBrowser}
          onSetBrowserMode={setBrowserMode}
          onPreviewBrowserMode={previewBrowserMode}
          onBrowserInteractionStart={cancelBrowserClose}
          onBrowserInteractionEnd={scheduleBrowserClose}
          onOpenSequences={openSequences}
          onOpenSettings={openSettings}
          inspectorActive={inspectorVisible}
          onToggleInspector={layout.toggleInspector}
          terminalActive={terminalManager.isOpen}
          onToggleTerminal={terminalManager.toggle}
          onResizeStart={layout.beginBrowserResize}
          drawingMode={drawingMode}
          onToggleDrawing={() => setDrawingMode((v) => !v)}
          strokeColour={strokeColour}
          onSetStrokeColour={setStrokeColour}
        />

        <Stage
          lens={lens}
          workspaceTransport={workspace.transport}
          databasePath={workspace.databasePath}
          workspaceId={workspace.workspaceId}
          activeProfileScope={workspace.activeProfileScope}
          workingRoot={workspace.workingRoot}
          repoRoot={workspace.repoRoot}
          timelineDataSource={timelineDataSource}
          rememberedTimelineViewport={rememberedTimelineViewport}
          onTimelineViewportChange={rememberTimelineViewport}
          onOpenNodeDocument={openNodeDocument}
          onNodeSelect={handleNodeSelect}
          onNodeDoubleClick={handleNodeDoubleClick}
          onPlaySequence={handlePlaySequence}
          leftPanelOpen={layout.browserOpen}
          rightPanelOpen={inspectorVisible}
          drawingMode={drawingMode}
          strokeColour={strokeColour}
          readerOpen={readerOpen}
          readerRecord={readerRecord}
          readerRelationField={readerRelationField}
          onReaderFullScreen={handleReaderFullScreen}
          onReaderExit={closeReader}
        />

        <RightInspector
          open={inspectorVisible}
          pinned={layout.inspectorPinned}
          onTogglePin={layout.toggleInspectorPin}
          onClose={layout.closeInspector}
          onResizeStart={layout.beginInspectorResize}
          flowView={
            <FlowView
              node={flowNode}
              stageState={flowStageState}
              candidatePlaces={pipelineStages.candidatePlaces}
              actions={pipelineActions}
              onJump={(lens) => setShellLens(lens)}
            />
          }
        />
      </div>

      <StatusStrip
        synced
        nodeCount={workspace.nodes.length}
        relationCount={workspace.edges.length}
        lens={readerOpen ? "reading" : lens}
        terminalActive={terminalManager.isOpen}
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
        onToggleTerminal={terminalManager.toggle}
      />

      <TerminalModal manager={terminalManager} />

      {fullScreenMode !== "closed" && (
        <FullScreenReader
          mode={fullScreenMode}
          record={fullScreenRecord}
          relationField={readerRelationField}
          onOpenRelatedNode={openNodeDocument}
          onClose={closeFullScreen}
        />
      )}
    </div>
  );
}

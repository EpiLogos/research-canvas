import type { TimelineDataSource } from "@research-canvas/canvas";
import type { GraphNode, TimelineRelationField, WorkspaceServices } from "@research-canvas/desktop-api";
import { TimelineLens } from "@research-canvas/canvas";
import { CanvasPane } from "./CanvasPane";
import { BottomDock } from "./BottomDock";
import { ReaderPane } from "./ReaderPane";
import { PsychogeographicLens } from "../features/psychogeographic/PsychogeographicLens";
import { StoryLens } from "../features/story/StoryLens";
import { PalaceLensHost } from "../features/palace/PalaceLensHost";
import { TerminalPane } from "../features/terminal/TerminalPane";
import type { ReaderRecord } from "../features/viewer/readerRecord";
import type { LensMode } from "./useLensMode";

interface StageProps {
  lens: LensMode;
  workspaceTransport: WorkspaceServices;
  databasePath: string | null;
  workspaceId: string | null;
  activeProfileScope: string | null;
  workingRoot: string | null;
  repoRoot: string | null;
  timelineDataSource: TimelineDataSource | null;
  rememberedTimelineViewport: { centerYear: number; pixelsPerYear: number } | undefined;
  onTimelineViewportChange: (viewport: { centerYear: number; pixelsPerYear: number }) => void;
  onOpenNodeDocument: (graphNodeId: string, timelineNode?: GraphNode, relationField?: TimelineRelationField) => void;
  onNodeSelect: (nodeId: string) => void;
  onNodeDoubleClick: (nodeId: string) => void;
  onPlaySequence: () => void;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  drawingMode: boolean;
  strokeColour: string;
  readerOpen: boolean;
  readerRecord: ReaderRecord | null;
  readerRelationField: TimelineRelationField | null;
  onReaderFullScreen: (record: ReaderRecord, relationField?: TimelineRelationField | null) => void;
  onReaderExit: () => void;
  dockOpen: boolean;
  dockHeight: number;
  dockWidth: number;
  onDockClose: () => void;
  onDockResizeStart: (e: React.PointerEvent) => void;
  onDockWidthResizeStart: (e: React.PointerEvent) => void;
}

export function Stage({
  lens,
  workspaceTransport,
  databasePath,
  workspaceId,
  activeProfileScope,
  workingRoot,
  repoRoot,
  timelineDataSource,
  rememberedTimelineViewport,
  onTimelineViewportChange,
  onOpenNodeDocument,
  onNodeSelect,
  onNodeDoubleClick,
  onPlaySequence,
  leftPanelOpen,
  rightPanelOpen,
  drawingMode,
  strokeColour,
  readerOpen,
  readerRecord,
  readerRelationField,
  onReaderFullScreen,
  onReaderExit,
  dockOpen,
  dockHeight,
  dockWidth,
  onDockClose,
  onDockResizeStart,
  onDockWidthResizeStart,
}: StageProps) {
  const commonStageSurfaceStyle: React.CSSProperties = { position: "absolute", inset: 0 };

  return (
    <div className="shell-stage" data-testid="shell-stage">
      {lens === "canvas" && (
        <CanvasPane
          onNodeSelect={onNodeSelect}
          onNodeDoubleClick={onNodeDoubleClick}
          onPlaySequence={onPlaySequence}
          leftPanelOpen={leftPanelOpen}
          rightPanelOpen={rightPanelOpen}
          drawingMode={drawingMode}
          strokeColour={strokeColour}
        />
      )}

      {lens === "timeline" && timelineDataSource && (
        <section className="canvas-pane" data-testid="timeline-pane" style={commonStageSurfaceStyle}>
          <TimelineLens
            dataSource={timelineDataSource}
            onOpenNode={onOpenNodeDocument}
            initialViewport={rememberedTimelineViewport}
            onViewportChange={onTimelineViewportChange}
          />
        </section>
      )}
      {lens === "timeline" && !timelineDataSource && (
        <section className="canvas-pane" data-testid="timeline-workspace-loading">Loading timeline workspace…</section>
      )}

      {lens === "psychogeographic" && databasePath && workspaceId && activeProfileScope && (
        <section className="canvas-pane" data-testid="psychogeographic-pane" style={commonStageSurfaceStyle}>
          <PsychogeographicLens
            transport={workspaceTransport}
            databasePath={databasePath}
            workspaceId={workspaceId}
            profileScope={activeProfileScope}
            mediaRoot={workingRoot ?? ""}
            repoRoot={repoRoot ?? ""}
          />
        </section>
      )}

      {lens === "story" && databasePath && workspaceId && activeProfileScope && (
        <section className="canvas-pane" data-testid="story-pane" style={commonStageSurfaceStyle}>
          <StoryLens
            transport={workspaceTransport}
            databasePath={databasePath}
            workspaceId={workspaceId}
            repoRoot={repoRoot ?? ""}
            profileScope={activeProfileScope}
            workingRoot={workingRoot ?? ""}
          />
        </section>
      )}

      {lens === "palace" && databasePath && workspaceId && activeProfileScope && (
        <section className="canvas-pane" data-testid="palace-pane" style={commonStageSurfaceStyle}>
          <PalaceLensHost
            transport={workspaceTransport}
            databasePath={databasePath}
            workspaceId={workspaceId}
            profileScope={activeProfileScope}
            workingRoot={workingRoot ?? ""}
          />
        </section>
      )}

      {readerOpen && readerRecord && (
        <ReaderPane
          record={readerRecord}
          relationField={readerRelationField}
          onFullScreen={onReaderFullScreen}
          onExit={onReaderExit}
        />
      )}

      <BottomDock
        open={dockOpen}
        height={dockHeight}
        width={dockWidth}
        label="Terminal · antichrist"
        onClose={onDockClose}
        onResizeStart={onDockResizeStart}
        onWidthResizeStart={onDockWidthResizeStart}
      >
        <TerminalPane />
      </BottomDock>
    </div>
  );
}

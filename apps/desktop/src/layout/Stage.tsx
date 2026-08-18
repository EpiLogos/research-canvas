import type { TimelineDataSource } from "@research-canvas/canvas";
import type { GraphNode, TimelineRelationField, WorkspaceServices } from "@research-canvas/desktop-api";
import { CanvasPane } from "./CanvasPane";
import { ReaderPane } from "./ReaderPane";
import { PsychogeographicLens } from "../features/psychogeographic/PsychogeographicLens";
import { StoryLens } from "../features/story/StoryLens";
import { PalaceLensHost } from "../features/palace/PalaceLensHost";
import { TimelineLens } from "../features/timeline/TimelineLens";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
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
  /** Deprecated composition inputs retained until Shell is simplified; the
   * feature TimelineLens now owns its canonical repository composition. */
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
}

export function Stage({
  lens,
  workspaceTransport,
  databasePath,
  workspaceId,
  activeProfileScope,
  workingRoot,
  repoRoot,
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
}: StageProps) {
  const workspace = useCanvasWorkspace();
  const commonStageSurfaceStyle: React.CSSProperties = { position: "absolute", inset: 0 };

  const openPlaceOnCanvas = async (graphNodeId: string) => {
    const constellationId = workspace.activeConstellationId;
    if (!constellationId) return;
    await workspace.openConstellationTab(constellationId);
    workspace.selectNode(graphNodeId);
  };

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

      {lens === "timeline" && (
        <section className="canvas-pane" data-testid="timeline-pane" style={commonStageSurfaceStyle}>
          <TimelineLens onOpenNodeDocument={onOpenNodeDocument} />
        </section>
      )}

      {lens === "psychogeographic" && databasePath && workspaceId && activeProfileScope && workspace.activeProjectId && (
        <section className="canvas-pane" data-testid="psychogeographic-pane" style={commonStageSurfaceStyle}>
          <PsychogeographicLens
            transport={workspaceTransport}
            projectId={workspace.activeProjectId}
            databasePath={databasePath}
            workspaceId={workspaceId}
            profileScope={activeProfileScope}
            mediaRoot={workingRoot ?? ""}
            repoRoot={repoRoot ?? ""}
            onOpenCanvasNode={openPlaceOnCanvas}
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
    </div>
  );
}

import { useCallback, useMemo, type JSX } from "react";
import { TimelineSurface } from "@research-canvas/canvas";
import {
  DesktopTimelineRepository,
  type GraphNode,
  type TimelineRelationField,
  type TimelineView,
  type TimelineViewState,
} from "@research-canvas/desktop-api";
import type { SurfaceTabState } from "@research-canvas/schema";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import { createTimelineDataSource } from "./createTimelineDataSource";

interface TimelineLensProps {
  onOpenNodeDocument: (
    graphNodeId: string,
    timelineNode?: GraphNode,
    relationField?: TimelineRelationField,
  ) => void;
}

export function TimelineLens({ onOpenNodeDocument }: TimelineLensProps): JSX.Element {
  const workspace = useCanvasWorkspace();
  const constellationId = workspace.activeConstellationId;

  const repository = useMemo(() => {
    if (!workspace.workspaceId || !workspace.databasePath || !constellationId) return null;
    return new DesktopTimelineRepository(
      workspace.transport,
      workspace.workspaceId,
      workspace.databasePath,
    );
  }, [constellationId, workspace.databasePath, workspace.transport, workspace.workspaceId]);

  const scopedRuntimeRepository = useMemo(() => {
    if (!repository || !constellationId) return null;
    return createConstellationScopedRuntime(repository, constellationId);
  }, [constellationId, repository]);
  const dataSource = useMemo(
    () => scopedRuntimeRepository ? createTimelineDataSource({ repository: scopedRuntimeRepository }) : null,
    [scopedRuntimeRepository],
  );

  const initialState = timelineViewStateFromTab(workspace.activeTab?.state ?? null);

  const persistViewState = useCallback((state: TimelineViewState) => {
    const manager = workspace.tabManager.getState();
    const tabId = manager.activeTabId;
    const tab = tabId ? manager.tabs.find((candidate) => candidate.id === tabId) : null;
    if (!tabId || tab?.surfaceId !== "timeline") return;
    manager.updateState(tabId, {
      surfaceId: "timeline",
      centerYear: state.centerYear,
      pixelsPerYear: state.pixelsPerYear,
      selectedGraphNodeId: state.selectedNodeId,
    });
  }, [workspace.tabManager]);

  const openCanvasNode = useCallback(async (graphNodeId: string) => {
    if (!constellationId) return;
    await workspace.openConstellationTab(constellationId);
    workspace.selectNode(graphNodeId);
  }, [constellationId, workspace]);

  if (!repository || !dataSource || !constellationId) {
    return <div data-testid="timeline-workspace-loading">Loading timeline workspace…</div>;
  }

  return (
    <TimelineSurface
      repository={repository}
      constellationId={constellationId}
      dataSource={dataSource}
      initialState={initialState}
      onViewStateChange={persistViewState}
      onOpenCanvasNode={openCanvasNode}
      onOpenNode={onOpenNodeDocument}
    />
  );
}

export function timelineViewStateFromTab(state: SurfaceTabState | null): TimelineViewState {
  if (state?.surfaceId !== "timeline") {
    return { centerYear: 0, pixelsPerYear: 20, selectedNodeId: null };
  }
  return {
    centerYear: state.centerYear,
    pixelsPerYear: state.pixelsPerYear,
    selectedNodeId: state.selectedGraphNodeId ?? null,
  };
}

function createConstellationScopedRuntime(
  repository: DesktopTimelineRepository,
  constellationId: string,
): Pick<
  DesktopTimelineRepository,
  "loadTimelineView" | "loadNode" | "saveTimelineLayout" | "archetypalLighting" | "resonancesForInstance" | "relationFieldForEvent" | "expandNode"
> {
  return {
    async loadTimelineView(range, filters): Promise<TimelineView> {
      const effectiveRange = range ?? { startYear: -10000, endYear: 10000 };
      const [view, walk] = await Promise.all([
        repository.loadTimelineView(range, filters),
        repository.getTimelineWalk(constellationId, effectiveRange),
      ]);
      const earthboundIds = new Set(walk.earthboundNodes.map((node) => node.graphNodeId));
      const retainedRelationships = view.relationships.filter((relationship) =>
        earthboundIds.has(relationship.sourceGraphNodeId)
        || earthboundIds.has(relationship.targetGraphNodeId),
      );
      const companionIds = new Set(
        retainedRelationships.flatMap((relationship) => [
          relationship.sourceGraphNodeId,
          relationship.targetGraphNodeId,
        ]),
      );
      const retainedNodes = view.nodes.filter((record) =>
        earthboundIds.has(record.node.graphNodeId)
        || (record.relationCompanion === true && companionIds.has(record.node.graphNodeId)),
      );
      const retainedNodeIds = new Set(retainedNodes.map((record) => record.node.graphNodeId));
      return {
        ...view,
        nodes: retainedNodes,
        relationships: retainedRelationships.filter((relationship) =>
          retainedNodeIds.has(relationship.sourceGraphNodeId)
          && retainedNodeIds.has(relationship.targetGraphNodeId),
        ),
        diagnostics: view.diagnostics.filter((diagnostic) => earthboundIds.has(diagnostic.graphNodeId)),
      };
    },
    loadNode: (graphNodeId) => repository.loadNode(graphNodeId),
    saveTimelineLayout: (input) => repository.saveTimelineLayout(input),
    archetypalLighting: (operatorGraphNodeId) => repository.archetypalLighting(operatorGraphNodeId),
    resonancesForInstance: (graphNodeId) => repository.resonancesForInstance(graphNodeId),
    relationFieldForEvent: (graphNodeId) => repository.relationFieldForEvent(graphNodeId),
    expandNode: (graphNodeId) => repository.expandNode(graphNodeId),
  };
}
